"use client";
// MEMORE presence — 100% ephemeral, 100% Supabase Realtime.
//
// NO Postgres writes for online/typing/viewing state. Ever. The only
// persistent field is profiles.last_seen_at, written sparingly by
// /api/presence/heartbeat (server-clock, throttled to one write per 5 min
// unless the tab is actually leaving). If the websocket dies, presence
// evaporates on its own — nothing to clean up.
//
// One shared presence channel per tab (multiple tabs each track their own
// device, and a user is "online" if ANY of their devices is present). One
// extra broadcast channel per OPEN conversation for typing events. Channels
// are singletons — React re-renders never re-subscribe.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PresenceStatus = "online" | "away" | "viewing_meme" | "investing" | "browsing";

export interface PresenceEntry {
  user_id: string;
  device_id: string;
  status: PresenceStatus;
  last_activity: number;
}

export interface TypingEvent {
  user_id: string;
  typing: boolean;
  at: number;
}

type PresenceListener = (snapshot: Map<string, PresenceEntry[]>) => void;
type TypingListener = (event: TypingEvent) => void;
/** Realtime message delivery transports CIPHERTEXT ONLY — the payload is the
 * same opaque envelope the server stores, never plaintext. */
export interface ChatBroadcastMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: string;
  ciphertext: string;
  encryption_version: string;
  to_device: string | null;
  post_id: string | null;
  media_url: string | null;
  sticker_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  expires_at: string;
}
type ChatMessageListener = (message: ChatBroadcastMessage) => void;

const HEARTBEAT_MIN_GAP_MS = 5 * 60 * 1000;

class PresenceHub {
  private channel: RealtimeChannel | null = null;
  private chatChannels = new Map<string, RealtimeChannel>();
  private listeners = new Set<PresenceListener>();
  private typingListeners = new Map<string, Set<TypingListener>>();
  private messageListeners = new Map<string, Set<ChatMessageListener>>();
  private myUserId = "";
  private myStatus: PresenceStatus = "online";
  private deviceId = "";
  private lastHeartbeat = 0;
  private joined = false;

  private supabase() {
    return createClient();
  }

  /** Per-tab device id: two tabs of the same user are two devices, so the
   * presence snapshot handles multi-tab correctly. */
  private ensureDeviceId(): string {
    try {
      let id = sessionStorage.getItem("memore-device-id");
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem("memore-device-id", id);
      }
      return id;
    } catch {
      return this.deviceId || (this.deviceId = crypto.randomUUID());
    }
  }

  join(userId: string): void {
    if (this.channel && this.myUserId === userId) return;
    this.myUserId = userId;
    this.deviceId = this.ensureDeviceId();
    const supabase = this.supabase();
    if (!supabase) return;

    // clean up any previous channel (auth change / re-login)
    this.leave(true);
    const channel = supabase.channel("presence:memore", { config: { presence: { key: `${userId}:${this.deviceId}` } } });
    this.channel = channel;

    channel
      .on("presence", { event: "sync" }, () => this.emit())
      .on("presence", { event: "join" }, () => this.emit())
      .on("presence", { event: "leave" }, () => this.emit())
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !this.joined) {
          this.joined = true;
          void channel.track(this.trackPayload());
          void this.heartbeat(false);
        }
      });

    this.installLifecycle();
  }

  private trackPayload(): PresenceEntry {
    return {
      user_id: this.myUserId,
      device_id: this.deviceId,
      status: this.myStatus,
      last_activity: Date.now(),
    };
  }

  private emit(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState<PresenceEntry>();
    const snapshot = new Map<string, PresenceEntry[]>();
    for (const entries of Object.values(state)) {
      for (const e of entries) {
        if (!e || typeof e.user_id !== "string") continue;
        const list = snapshot.get(e.user_id) ?? [];
        list.push(e);
        snapshot.set(e.user_id, list);
      }
    }
    for (const l of this.listeners) l(snapshot);
  }

  onPresence(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    if (this.channel) this.emit();
    return () => this.listeners.delete(listener);
  }

  /** Update MY ephemeral status (online/away/viewing_meme/…). Realtime only. */
  setStatus(status: PresenceStatus): void {
    this.myStatus = status;
    if (this.channel && this.joined) void this.channel.track(this.trackPayload());
  }

  // ---------- per-conversation typing broadcast ----------

  private chatChannel(conversationId: string): RealtimeChannel | null {
    const supabase = this.supabase();
    if (!supabase) return null;
    let ch = this.chatChannels.get(conversationId);
    if (!ch) {
      ch = supabase.channel(`chat:${conversationId}`);
      ch.on("broadcast", { event: "typing" }, ({ payload }) => {
        const ev = payload as TypingEvent;
        if (!ev || ev.user_id === this.myUserId) return;
        for (const l of this.typingListeners.get(conversationId) ?? []) l(ev);
      });
      ch.on("broadcast", { event: "msg" }, ({ payload }) => {
        const msg = payload as ChatBroadcastMessage;
        if (!msg || !msg.id || msg.sender_id === this.myUserId) return; // idempotence by id; self-echo ignored
        for (const l of this.messageListeners.get(conversationId) ?? []) l(msg);
      });
      ch.subscribe();
      this.chatChannels.set(conversationId, ch);
    }
    return ch;
  }

  /** After the server accepted a message, push the ciphertext envelope to the
   * open conversation so the peer sees it instantly (the 5s poll stays as the
   * offline/reconnect fallback). */
  broadcastMessage(conversationId: string, message: ChatBroadcastMessage): void {
    const ch = this.chatChannel(conversationId);
    ch?.send({ type: "broadcast", event: "msg", payload: message });
  }

  onChatMessage(conversationId: string, listener: ChatMessageListener): () => void {
    this.chatChannel(conversationId);
    let set = this.messageListeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.messageListeners.set(conversationId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  /** Debounced by the caller's composer: send only on start/stop, max ~1/s. */
  broadcastTyping(conversationId: string, typing: boolean): void {
    const ch = this.chatChannel(conversationId);
    ch?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: this.myUserId, typing, at: Date.now() } satisfies TypingEvent,
    });
  }

  onTyping(conversationId: string, listener: TypingListener): () => void {
    this.chatChannel(conversationId);
    let set = this.typingListeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.typingListeners.set(conversationId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  /** Leave one conversation's broadcast channel (navigating away from it). */
  leaveChat(conversationId: string): void {
    const ch = this.chatChannels.get(conversationId);
    if (!ch) return;
    this.chatChannels.delete(conversationId);
    this.typingListeners.delete(conversationId);
    this.messageListeners.delete(conversationId);
    void this.supabase()?.removeChannel(ch);
  }

  // ---------- last seen (the ONLY persistent presence-ish data) ----------

  /** Server-throttled write of profiles.last_seen_at. Called on join,
   * on re-visibility and on real leave — never on a timer. */
  async heartbeat(leaving: boolean): Promise<void> {
    const now = Date.now();
    if (!leaving && now - this.lastHeartbeat < HEARTBEAT_MIN_GAP_MS) return;
    this.lastHeartbeat = now;
    try {
      await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaving }),
        keepalive: leaving,
      });
    } catch {
      /* offline — nothing to do */
    }
  }

  private lifecycleInstalled = false;
  private installLifecycle(): void {
    if (this.lifecycleInstalled || typeof document === "undefined") return;
    this.lifecycleInstalled = true;
    // Tab hidden → away; visible again → online + (throttled) heartbeat.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.setStatus("away");
      else {
        this.setStatus("online");
        void this.heartbeat(false);
      }
    });
    // Tab/device actually going away: best-effort beacon so last_seen moves.
    const bye = () => {
      try {
        navigator.sendBeacon("/api/presence/heartbeat", new Blob([JSON.stringify({ leaving: true })], { type: "application/json" }));
      } catch { /* best effort */ }
    };
    window.addEventListener("pagehide", bye);
    window.addEventListener("beforeunload", bye);
    // PWA resume: re-assert presence when the app comes back online.
    window.addEventListener("online", () => {
      if (this.channel && this.joined) void this.channel.track(this.trackPayload());
      void this.heartbeat(false);
    });
    window.addEventListener("offline", () => this.setStatus("away"));
  }

  /** Full teardown: auth change, logout, app teardown. */
  leave(skipHeartbeat = false): void {
    if (this.channel) {
      if (this.joined) void this.channel.untrack();
      void this.supabase()?.removeChannel(this.channel);
      this.channel = null;
    }
    this.joined = false;
    for (const [convId] of this.chatChannels) this.leaveChat(convId);
    if (!skipHeartbeat) void this.heartbeat(true);
  }
}

const hub = new PresenceHub();
export function presenceHub(): PresenceHub {
  return hub;
}

// ---------- React bindings (used by the app layout and the chat page) ----------

/** Join app-wide presence for the signed-in user. Mount once in the layout. */
export function usePresenceBinding(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    hub.join(userId);
    return () => hub.leave();
  }, [userId]);
}

export type PeerStatus = "online" | "away" | "viewing_meme" | "investing" | "browsing" | "offline";

/** Live status of a peer, from the shared presence channel. */
export function usePeerPresence(peerId: string | undefined): { status: PeerStatus } {
  const [status, setStatus] = useState<PeerStatus>("offline");
  const snapshotRef = useRef<Map<string, PresenceEntry[]> | null>(null);
  useEffect(() => {
    const derive = (snapshot: Map<string, PresenceEntry[]> | null) => {
      if (!peerId || !snapshot) return;
      const entries = snapshot.get(peerId);
      if (!entries || entries.length === 0) return setStatus("offline");
      // freshest device wins; stale devices (> 60s without activity) don't
      const fresh = entries.filter((e) => Date.now() - e.last_activity < 60_000);
      const list = fresh.length > 0 ? fresh : entries;
      const top = [...list].sort((a, b) => b.last_activity - a.last_activity)[0];
      setStatus(top.status === "away" ? "away" : top.status);
    };
    derive(snapshotRef.current);
    const off = hub.onPresence((snapshot) => {
      snapshotRef.current = snapshot;
      derive(snapshot);
    });
    return off;
  }, [peerId]);
  return { status };
}

/** Whether the OTHER participant of a conversation is currently typing.
 * Self-clears after 2.5s without a refresh (stale typing never sticks). */
export function usePeerTyping(conversationId: string, myUserId: string | undefined): boolean {
  const [typing, setTyping] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!myUserId || !conversationId) return;
    const off = hub.onTyping(conversationId, (ev) => {
      if (ev.user_id === myUserId) return;
      setTyping(ev.typing);
      if (timer.current) window.clearTimeout(timer.current);
      if (ev.typing) {
        timer.current = window.setTimeout(() => setTyping(false), 2500);
      }
    });
    return () => {
      off();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [conversationId, myUserId]);
  return typing;
}

const TYPING_BROADCAST_MIN_GAP_MS = 1200;

/** Composer hook: broadcast typing start/stop, debounced, auto-stop after
 * 1.8s of silence. One realtime broadcast per burst — never per keystroke. */
export function useTypingBroadcaster(conversationId: string): (isTyping: boolean) => void {
  const stopTimer = useRef<number | null>(null);
  const lastSent = useRef<{ typing: boolean; at: number }>({ typing: false, at: 0 });
  return (isTyping: boolean) => {
    const now = Date.now();
    const current = lastSent.current;
    if (isTyping) {
      const repeats = current.typing && now - current.at < TYPING_BROADCAST_MIN_GAP_MS;
      if (repeats) return;
      lastSent.current = { typing: true, at: now };
      hub.broadcastTyping(conversationId, true);
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      stopTimer.current = window.setTimeout(() => {
        lastSent.current = { typing: false, at: Date.now() };
        hub.broadcastTyping(conversationId, false);
      }, 1800);
    } else if (current.typing) {
      lastSent.current = { typing: false, at: now };
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      hub.broadcastTyping(conversationId, false);
    }
  };
}
