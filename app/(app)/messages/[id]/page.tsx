"use client";
// CHAT — one 24-hour conversation. Clean, compact mobile messaging UI with a
// quiet MEMORE hand-drawn accent: wobbly ink lines, lime + purple, handwritten
// type. The server's clock decides when it all disappears.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, useApi, useSession, useToast } from "@/lib/client";
import { getCachedMessages, appendCachedMessages, purgeExpiredChatLocal, getCachedChats, removeCachedMessage, updateCachedMessageReactions } from "@/lib/client-cache";
import { playSfx } from "@/lib/sfx";

import type { ChatDetail, ChatMessageView, ChatReplyRef, MemeView } from "@/lib/types";
import { REACTION_IDS } from "@/lib/reactions";
import { Avatar, NeoButton, Sheet } from "@/components/ui";
import { InvestSheet } from "@/components/meme";
import { ReactionStamps, ReactionTray, armClickGuard } from "@/components/reactions";
import { StickerArt, StickerSheet, recordStickerRecent } from "@/components/stickers";
import { ShareSheet } from "@/components/share";
import { Icon, type IconName } from "@/components/icons";
import { Spark } from "@/components/brand";

const TRAY_KEY = "memore-chat-reactions";
const REPLY_THRESHOLD = 64; // px of pull before a swipe becomes a reply

/** Short quote line for a reply reference (message or post). */
function quoteText(q: { type: ChatMessageView["type"]; content: string; sticker_id?: string | null; post?: { caption: string } | null }): string {
  if (q.type === "sticker") return "sticker";
  if (q.type === "image") return "photo";
  if (q.type === "video") return "video";
  if (q.type === "post") return `MEMORE POST${q.post?.caption ? ` · ${q.post.caption}` : ""}`;
  return q.content || "…";
}

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Barely-there screen edge: one thin line that hugs the physical device corners.
 * Stays completely still at the outer corners and never shifts or shrinks with the keyboard. */
function ScreenFrame({ frameRef }: { frameRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={frameRef}
      className="chat-screen-frame pointer-events-none fixed z-[68]"
      aria-hidden
    />
  );
}

/** One thin, slightly imperfect purple line under the header. */
function HeaderRule() {
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mx-4 h-[2.5px] w-auto shrink-0" style={{ width: "calc(100% - 32px)" }} aria-hidden>
      <path d="M0.5 2.2 C 18 1, 45 3.1, 70 1.7 C 82 1.1, 92 2.5, 99.5 1.9" fill="none" stroke="rgba(124,77,255,0.85)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Hand-drawn clock: one icon, live countdown from the server's expires_at. */
function HeaderClock({ expiresAt }: { expiresAt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const urgent = ms > 0 && ms < 10 * 60_000;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#C8FF3D] aura-num" style={urgent ? { textShadow: "0 0 8px rgba(200,255,61,0.55)" } : undefined}>
      <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden>
        <circle cx="12" cy="13" r="8.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M12 9.4v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {h}h {String(m).padStart(2, "0")}m <span className="font-display font-bold">left</span>
    </span>
  );
}

/** Wobbly ink bubble — one shared shape for the whole design system, only the
 * ink changes: lime for yours, purple-framed charcoal for theirs. The tail
 * (first message of a group) is a small flick, not a speech-bubble beak. */
function BubbleFrame({ mine, tail }: { mine: boolean; tail: boolean }) {
  const paths = {
    plain:
      "M9 3.4 C 28 1.8, 72 1.6, 91 3.4 C 96.6 4.8, 98.4 9.6, 98 17 C 98.5 24.5, 97 32.2, 90.5 34.9 C 72 37.6, 28 37.8, 9.5 35 C 3.6 33.4, 1.6 27.5, 2.1 19.5 C 1.7 11.5, 3.6 5, 9 3.4 Z",
    left:
      "M9.5 3.3 C 28 1.7, 72 1.6, 91 3.4 C 96.6 4.8, 98.4 9.6, 98 17 C 98.5 24.5, 97 32.2, 90.5 34.9 C 72 37.6, 30 37.8, 12 35.2 C 9.4 34.9, 6.6 36.6, 3.2 39.2 C 4.6 36.2, 4.8 34.6, 4.2 33 C 2.6 30.4, 1.7 25.5, 2.1 19.5 C 1.7 11.5, 4 4.8, 9.5 3.3 Z",
    right:
      "M90.5 3.3 C 72 1.7, 28 1.6, 9 3.4 C 3.4 4.8, 1.6 9.6, 2 17 C 1.5 24.5, 3 32.2, 9.5 34.9 C 28 37.6, 70 37.8, 88 35.2 C 90.6 34.9, 93.4 36.6, 96.8 39.2 C 95.4 36.2, 95.2 34.6, 95.8 33 C 97.4 30.4, 98.3 25.5, 97.9 19.5 C 98.3 11.5, 96 4.8, 90.5 3.3 Z",
  };
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path
        d={tail ? (mine ? paths.right : paths.left) : paths.plain}
        fill={mine ? "#C8FF3D" : "#161616"}
        stroke={mine ? "rgba(10,10,10,0.72)" : "#7C4DFF"}
        strokeWidth="1.7" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Small wobbly circle used by the composer buttons. */
function WobblyCircle({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path
        d="M20 2.8 C 29 2.4, 37.2 8.4, 37.4 19.4 C 37.8 30.4, 29.4 37.6, 19.6 37.2 C 9.8 37, 2.6 30, 2.9 19.8 C 3.2 9.6, 11 3.2, 20 2.8 Z"
        fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );
}

/** Tiny marker accents sitting JUST OUTSIDE a bubble — sparse, asymmetric,
 * never over the text. Variant is picked from the message id so the 3s poll
 * never makes a stroke jump. Incoming hugs the left ink (purple), outgoing
 * the right (lime). */
function BubbleAccents({ mine, seed, tail }: { mine: boolean; seed: number; tail: boolean }) {
  const ink = mine ? "rgba(200,255,61,0.8)" : "rgba(150,112,255,0.8)";
  const cross = mine ? "rgba(150,112,255,0.7)" : "rgba(200,255,61,0.6)";
  let v = seed % 4;
  // bottom-edge accents would collide with a bubble tail — swap for top ones
  if (tail && (v === 1 || v === 3)) v = seed % 2 === 0 ? 0 : 2;
  const side = mine ? { right: "-10px" } : { left: "-10px" };
  const sideFar = mine ? { right: "-12px" } : { left: "-12px" };
  return (
    <>
      {v === 0 && (
        // two short parallel slashes at an upper corner
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute -top-2 h-[18px] w-[18px] -rotate-3" style={sideFar} aria-hidden>
          <path d="M6 16 L13 5 M11 18 L18 8" stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 1 && (
        // small curved underline following part of the bottom edge
        <svg viewBox="0 0 32 10" className="pointer-events-none absolute h-2 w-[26px]" style={{ ...(mine ? { right: "4px" } : { left: "4px" }), bottom: "-5px" }} aria-hidden>
          <path d="M2 6.5 C 10 8.8, 21 8.2, 30 4.8" stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 2 && (
        // double sketch tick near the upper corner
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute -top-2 h-4 w-4 rotate-2" style={side} aria-hidden>
          <path d="M4 12 C 9 8.5, 14 7, 20 7.5 M7 16.5 C 11 13.5, 15 12.5, 19 13" stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {v === 3 && (
        <>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute -bottom-1 h-[13px] w-[13px] rotate-6" style={sideFar} aria-hidden>
            <path d="M6 16 L13 6 M11 18 L18 9" stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          {seed % 3 === 0 && (
            <svg viewBox="0 0 24 12" className="pointer-events-none absolute -top-1.5 h-2.5 w-5" style={mine ? { right: "22px" } : { left: "22px" }} aria-hidden>
              <path d="M3 9 C 8 5, 14 3.8, 21 5.5" stroke={cross} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          )}
        </>
      )}
    </>
  );
}

/** Reply quote for bubble-free messages (stickers, shared posts). Tap = jump
 * to the message it answers. */
function QuoteInline({ refr, mine, username, onJump }: { refr: ChatReplyRef; mine: boolean; username: string; onJump: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onJump(); }}
      aria-label="Jump to original message"
      className={`mb-1 flex w-full items-center gap-1.5 border-l-2 pl-1.5 text-left ${mine ? "border-[#0a0a0a]/50" : "border-[#7C4DFF]"}`}
    >
      {refr.post && (
        refr.post.media_type === "text"
          ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#141414] font-display text-[8px] font-extrabold text-[#C8FF3D]">Aa</span>
          : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={refr.post.thumbnail_url} alt="" className="h-4 w-4 rounded-[3px] object-cover" loading="lazy" />
          )
      )}
      <span className="truncate text-[10.5px] font-bold text-[#C8FF3D]">
        ↳ {mine ? "you" : `@${username}`} · {quoteText(refr)}
      </span>
    </button>
  );
}

/** Reply arrow revealed while swiping a message. */
function ReplyArrow({ mine }: { mine: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <path
        d="M9 5 L4 10 L9 15 M4 10 L13.5 10 C 17.8 10, 20 12.8, 20 17 L 20 19"
        fill="none" stroke={mine ? "#C8FF3D" : "#C084FC"} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sharePost, setSharePost] = useState(false);
  const [investMeme, setInvestMeme] = useState<MemeView | null>(null);
  const [attach, setAttach] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const initialScreenHeightRef = useRef<number>(0);
  const [animatingMsgIds, setAnimatingMsgIds] = useState<Record<string, "zuup" | "receive" | "unsend" | "sticker">>({});
  const [doubleTapBurst, setDoubleTapBurst] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDone = useRef(false);
  const [reactTo, setReactTo] = useState<{ msgId: string; rect: DOMRect } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(["aura", "w", "f", "cook", "dead"]);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [shareMeme, setShareMeme] = useState<MemeView | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [swipe, setSwipe] = useState<{ msgId: string; dx: number } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const gestRef = useRef<{ id: string; msg: ChatMessageView; x: number; y: number; dir: 1 | -1; mode: "idle" | "swipe" | "react"; dx: number } | null>(null);
  const reactElRef = useRef<HTMLElement | null>(null);
  const hoverRef = useRef(0);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const trayCentersRef = useRef<number[] | null>(null);
  const trayBandRef = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [clickShield, setClickShield] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileKind = useRef<"image" | "video">("image");
  const listRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const lastSyncCursorRef = useRef<string>("");

  // 1. Instant Cache-First Hydration on mount (Frame 0 rendering)
  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await getCachedMessages(id);
      if (!active) return;
      if (cached && cached.length > 0) {
        lastSyncCursorRef.current = cached[cached.length - 1].created_at;
        const allChats = await getCachedChats(user?.id);
        const chatMeta = allChats?.find((c) => c.id === id);
        setDetail((prev) => {
          if (prev) return prev;
          return {
            conversation: {
              id,
              created_at: chatMeta?.last_at || new Date().toISOString(),
              expires_at: chatMeta?.expires_at || new Date(Date.now() + 86400000).toISOString(),
              remaining_ms: chatMeta?.remaining_ms || 86400000,
            },
            other: chatMeta?.other || { id: "", username: "", display_name: "", avatar_bg: "#222" },
            messages: cached,
          };
        });
      }
    })();
    return () => { active = false; };
  }, [id, user?.id]);

  // 2. Cursor-based incremental synchronization
  const load = useCallback(async () => {
    try {
      const cursor = lastSyncCursorRef.current;
      const url = cursor ? `/api/chats/${id}?after=${encodeURIComponent(cursor)}` : `/api/chats/${id}`;
      const d = await api<ChatDetail>(url);
      if (!alive.current) return;
      setGone(null);

      if (d.is_delta) {
        if (d.messages && d.messages.length > 0) {
          const updated = await appendCachedMessages(id, d.messages, d.conversation.expires_at);
          lastSyncCursorRef.current = updated[updated.length - 1].created_at;
          setDetail((prev) => {
            if (!prev) return d;
            return {
              ...prev,
              conversation: { ...prev.conversation, ...d.conversation },
              other: d.other,
              messages: updated,
            };
          });
        } else if (d.conversation.other_read_at) {
          setDetail((prev) => {
            if (!prev) return prev;
            const otherRead = d.conversation.other_read_at!;
            return {
              ...prev,
              conversation: { ...prev.conversation, ...d.conversation },
              messages: prev.messages.map((m) =>
                m.sender_id === user?.id && otherRead >= m.created_at ? { ...m, seen: true } : m
              ),
            };
          });
        }
      } else {
        const updated = await appendCachedMessages(id, d.messages, d.conversation.expires_at);
        if (updated.length > 0) {
          lastSyncCursorRef.current = updated[updated.length - 1].created_at;
        }
        setDetail({ ...d, messages: updated });
      }
    } catch (e) {
      if (!alive.current) return;
      const msg = (e as Error).message || "";
      if (msg === "expired" || msg.includes("disappeared") || msg.includes("Too late")) {
        setGone("expired");
        void purgeExpiredChatLocal(id);
      }
    }
  }, [id, user?.id]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, 5000);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Listen for cross-tab expiration event
  useEffect(() => {
    const onExpired = (e: any) => {
      if (e?.detail?.id === id) {
        setGone("expired");
        void purgeExpiredChatLocal(id);
      }
    };
    window.addEventListener("memore:chat-expired", onExpired);
    return () => window.removeEventListener("memore:chat-expired", onExpired);
  }, [id]);

  const remaining = detail ? Math.max(0, new Date(detail.conversation.expires_at).getTime() - Date.now()) : 0;
  useEffect(() => {
    if (detail && remaining <= 0) {
      setGone("expired");
      const t = setTimeout(() => router.push("/messages"), 2600);
      return () => clearTimeout(t);
    }
  }, [detail, remaining, router]);

  // 1. Lock document body/html position and overflow so the window cannot scroll or rubber-band
  useEffect(() => {
    const origBodyPos = document.body.style.position;
    const origBodyWidth = document.body.style.width;
    const origBodyHeight = document.body.style.height;
    const origBodyTop = document.body.style.top;
    const origBodyOverflow = document.body.style.overflow;
    const origHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.top = "0px";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.position = origBodyPos;
      document.body.style.width = origBodyWidth;
      document.body.style.height = origBodyHeight;
      document.body.style.top = origBodyTop;
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origHtmlOverflow;
    };
  }, []);

  // 2. Synchronize chat viewport with Visual Viewport API (Direct DOM: 0 React setState)
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;

    if (typeof window !== "undefined") {
      initialScreenHeightRef.current = Math.max(
        window.innerHeight,
        window.screen?.height || 0
      );
    }

    const syncViewport = () => {
      const vv = window.visualViewport;
      const screenH = initialScreenHeightRef.current > 0
        ? initialScreenHeightRef.current
        : (typeof window !== "undefined" ? Math.max(window.innerHeight, window.screen?.height || 0) : 844);

      if (!vv) {
        el.style.setProperty("--chat-vh", "100dvh");
        el.style.setProperty("--chat-top", "0px");
        el.style.setProperty("--chat-bottom-padding", "env(safe-area-inset-bottom, 0px)");
        if (frameRef.current) {
          frameRef.current.style.top = "4px";
          frameRef.current.style.height = `${screenH - 8}px`;
        }
        return;
      }
      const h = vv.height;
      const top = vv.offsetTop;
      el.style.setProperty("--chat-vh", `${h}px`);
      el.style.setProperty("--chat-top", `${top}px`);

      // Keyboard is open if visual viewport height is significantly smaller than physical screen height
      const isKeyboardOpen = screenH - h > 100;
      el.style.setProperty(
        "--chat-bottom-padding",
        isKeyboardOpen ? "0px" : "env(safe-area-inset-bottom, 0px)"
      );

      // Only update physical screen height if user rotated/resized while keyboard is NOT open
      if (!isKeyboardOpen && window.innerHeight > 400) {
        initialScreenHeightRef.current = Math.max(window.innerHeight, window.screen?.height || 0);
      }

      // The purple screen frame is the physical device outline:
      // It remains fixed to the outer glass corners and NEVER shrinks with the keyboard!
      if (frameRef.current) {
        frameRef.current.style.top = `${top + 4}px`;
        frameRef.current.style.height = `${screenH - 8}px`;
      }

      // Keep newest messages visible only if user was already at the bottom
      if (isNearBottomRef.current && listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    };

    syncViewport();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncViewport);
      vv.addEventListener("scroll", syncViewport);
      return () => {
        vv.removeEventListener("resize", syncViewport);
        vv.removeEventListener("scroll", syncViewport);
      };
    }
  }, []);

  // 3. Track whether user is near bottom of conversation
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 140;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= threshold;
  }, []);

  // 4. Keep newest messages in view when message count increases (only if already near bottom)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [detail?.messages.length]);

  // 6. Initial scroll to bottom when messages first load
  useEffect(() => {
    if (detail?.messages && detail.messages.length > 0 && !initialScrollDone.current) {
      const el = listRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        initialScrollDone.current = true;
      }
    }
  }, [detail?.messages]);

  // ----- reactions: HOLD → tray (R1 armed) → glide over slots → release applies -----
  const clearPress = useCallback(() => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);
  useEffect(() => clearPress, [clearPress]);

  // slot order: account first (restores on any device), then this device's copy
  useEffect(() => {
    const fromAccount = (user?.active_reactions ?? []).filter((x) => REACTION_IDS.includes(x));
    if (fromAccount.length > 0) {
      setFavorites(fromAccount);
      return;
    }
    try {
      const raw = localStorage.getItem(TRAY_KEY);
      if (raw) {
        const list = JSON.parse(raw) as string[];
        if (Array.isArray(list) && list.length > 0) {
          setFavorites(list.filter((x) => REACTION_IDS.includes(x)).slice(0, 5));
          return;
        }
      }
    } catch { /* no saved slots */ }
  }, [user?.active_reactions]);

  const saveSlots = (next: string[]) => {
    setFavorites(next);
    try { localStorage.setItem(TRAY_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    api("/api/me/reactions", { method: "PATCH", json: { active_reactions: next } }).catch(() => { /* offline — local copy keeps it */ });
  };

  // measure the tray's slot centers so finger x maps onto a reaction
  useEffect(() => {
    if (!reactTo) {
      trayCentersRef.current = null;
      trayBandRef.current = null;
      return;
    }
    const t = window.setTimeout(() => {
      const tray = document.querySelector(".react-tray");
      if (!tray) return;
      const band = tray.getBoundingClientRect();
      trayBandRef.current = { top: band.top, bottom: band.bottom, left: band.left, right: band.right };
      const centers = [...tray.querySelectorAll("button[data-react]")].map((b) => {
        const r = b.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      trayCentersRef.current = centers.length === 5 ? centers : null;
    }, 60);
    return () => window.clearTimeout(t);
  }, [reactTo, pickerOpen]);

  const finishReact = (apply: boolean) => {
    const g = gestRef.current;
    if (reactElRef.current) reactElRef.current.style.touchAction = "";
    armClickGuard();
    setClickShield(true);
    window.setTimeout(() => setClickShield(false), 140);
    if (apply && g && hoverRef.current >= 0 && hoverRef.current < favorites.length) {
      const rid = favorites[hoverRef.current];
      if (rid) react(g.id, rid);
    }
    gestRef.current = null;
    hoverRef.current = -1;
    setHoverIdx(null);
    setReactTo(null);
    setPickerOpen(false);
  };

  /** One gesture handler per reactable message:
   * tap → nothing · double-tap → R1 · hold 420ms → tray + unsend (Case A: no move = open)
   * hold + glide → slot follows the finger · release → apply (Case B: slide to select)
   * vertical movement before hold → normal scroll (Case C) · horizontal → swipe-to-reply */
  const msgGestures = (m: ChatMessageView) => {
    const isMine = m.sender_id === user?.id;
    const dir: 1 | -1 = isMine ? -1 : 1; // incoming swipes right, outgoing left
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button, a, input, video")) return;
        clearPress();
        const el = e.currentTarget;
        gestRef.current = { id: m.id, msg: m, x: e.clientX, y: e.clientY, dir, mode: "idle", dx: 0 };
        reactElRef.current = el;
        hoverRef.current = -1;
        setHoverIdx(null);

        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = null;
          const g = gestRef.current;
          if (!g || g.mode !== "idle") return;
          g.mode = "react";
          // Case A & B: Open tray and UNSEND button. DO NOT auto-select reaction.
          hoverRef.current = -1;
          setHoverIdx(null);
          try { navigator.vibrate?.(15); } catch {}
          setReactTo({ msgId: m.id, rect: el.getBoundingClientRect() });
          setPickerOpen(false);
        }, 420);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const g = gestRef.current;
        if (!g || g.id !== m.id) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;

        if (g.mode === "idle") {
          // If vertical scroll displacement > 8px before timer: CANCEL long-press! (Allow normal scroll)
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
            gestRef.current = null;
            clearPress();
            return;
          }
          // Horizontal reply swipe
          if (Math.abs(dx) > 8 && Math.sign(dx) === g.dir) {
            g.mode = "swipe";
            g.dx = 0;
            clearPress();
          } else if (Math.abs(dx) > 12) {
            gestRef.current = null;
            clearPress();
            return;
          }
          return;
        }

        if (g.mode === "swipe") {
          g.dx = Math.min(Math.abs(dx), 96);
          if (g.dx >= REPLY_THRESHOLD) {
            try { navigator.vibrate?.(11); } catch {}
            setReplyTo(g.msg);
            gestRef.current = null;
            setSwipe(null);
            return;
          }
          setSwipe({ msgId: m.id, dx: g.dx });
          return;
        }

        if (g.mode === "react") {
          // Slide-to-select proximity hit-testing
          const x = e.clientX;
          const y = e.clientY;

          // Check if hovering over unsend button
          const unsendEl = document.querySelector(".react-tray [data-unsend='true']");
          if (unsendEl) {
            const uRect = unsendEl.getBoundingClientRect();
            if (x >= uRect.left && x <= uRect.right && y >= uRect.top && y <= uRect.bottom) {
              if (hoverRef.current !== 999) {
                hoverRef.current = 999;
                setHoverIdx(null);
                try { navigator.vibrate?.(6); } catch {}
              }
              return;
            }
          }

          const centers = trayCentersRef.current;
          const band = trayBandRef.current;
          if (centers && band) {
            if (y >= band.top - 40 && y <= band.bottom + 40 && x >= band.left - 30 && x <= band.right + 30) {
              let idx = 0;
              let best = Infinity;
              centers.forEach((cx, i) => {
                const d = Math.abs(x - cx);
                if (d < best) { best = d; idx = i; }
              });
              if (idx !== hoverRef.current) {
                hoverRef.current = idx;
                setHoverIdx(idx);
                try { navigator.vibrate?.(6); } catch {}
              }
              return;
            }
          }

          if (hoverRef.current !== -1) {
            hoverRef.current = -1;
            setHoverIdx(null);
          }
        }
      },
      onPointerUp: () => {
        const g = gestRef.current;
        clearPress();
        if (g?.mode === "react") {
          if (hoverRef.current === 999) {
            // Releasing over UNSEND button
            unsend(g.id);
            setReactTo(null);
            setHoverIdx(null);
          } else if (hoverRef.current >= 0 && hoverRef.current < favorites.length) {
            // Releasing after sliding over a reaction
            finishReact(true);
          } else {
            // CASE A: Held without moving!
            // Tray and UNSEND button remain open for direct tapping!
          }
          gestRef.current = null;
          return;
        }

        if (g && g.mode === "idle") {
          const now = Date.now();
          if (lastTapRef.current && lastTapRef.current.id === m.id && now - lastTapRef.current.t < 320) {
            lastTapRef.current = null;
            gestRef.current = null;
            try { navigator.vibrate?.(10); } catch {}
            const rid = favorites[0] ?? "aura";
            setDoubleTapBurst({ msgId: m.id, x: g.x, y: g.y });
            setTimeout(() => setDoubleTapBurst(null), 600);
            react(m.id, rid);
            return;
          }
          lastTapRef.current = { id: m.id, t: now };
        }

        if (g && g.mode === "swipe" && g.dx >= REPLY_THRESHOLD) {
          setReplyTo(g.msg);
        }
        gestRef.current = null;
        setSwipe(null);
      },
      onPointerCancel: () => {
        clearPress();
        gestRef.current = null;
        setSwipe(null);
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  };

  const react = async (msgId: string, reactionId: string) => {
    playSfx("reaction");
    setReactTo(null);
    setPickerOpen(false);
    // Optimistic local reaction update
    setDetail((prev) => {
      if (!prev) return prev;
      const targetMsg = prev.messages.find((m) => m.id === msgId);
      if (!targetMsg) return prev;
      const currentReactions = targetMsg.reactions || [];
      const existing = currentReactions.find((r) => r.reaction_id === reactionId);
      let nextReactions;
      if (existing?.mine) {
        // Toggle off
        nextReactions = currentReactions
          .map((r) => (r.reaction_id === reactionId ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
      } else {
        // Remove previous user reaction if any
        const cleaned = currentReactions
          .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
        const idx = cleaned.findIndex((r) => r.reaction_id === reactionId);
        if (idx >= 0) {
          cleaned[idx] = { ...cleaned[idx], count: cleaned[idx].count + 1, mine: true };
          nextReactions = cleaned;
        } else {
          nextReactions = [...cleaned, { reaction_id: reactionId, count: 1, mine: true }];
        }
      }
      return {
        ...prev,
        messages: prev.messages.map((m) => (m.id === msgId ? { ...m, reactions: nextReactions } : m)),
      };
    });

    try {
      const res = await api<{ reactions: any[] }>(`/api/chats/${id}/messages/${msgId}/react`, {
        json: { reaction_id: reactionId },
      });
      if (res?.reactions) {
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions } : m)),
          };
        });
        void updateCachedMessageReactions(id, msgId, res.reactions);
      }
    } catch (e) {
      toast((e as Error).message, "err");
      await load();
    }
  };

  const swipeStyle = (m: ChatMessageView): React.CSSProperties => {
    const dir = m.sender_id === user?.id ? -1 : 1;
    const swiping = swipe?.msgId === m.id;
    return {
      transform: `translateX(${swiping ? (swipe?.dx ?? 0) * dir : 0}px)`,
      transition: swiping ? "none" : "transform 0.18s ease-out",
    };
  };

  const send = async (payload: { type: "text" | "image" | "video" | "post" | "sticker"; content?: string; media_url?: string; post_id?: string; sticker_id?: string; reply_to_message_id?: string }) => {
    setBusy(true);
    const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currentReply = replyTo;
    const anim = payload.type === "sticker" ? "sticker" : "zuup";

    // Optimistic outgoing message
    const optimisticMsg: ChatMessageView = {
      id: optId,
      conversation_id: id,
      sender_id: user?.id || "me",
      type: payload.type,
      content: payload.content || "",
      post_id: payload.post_id ?? null,
      media_url: payload.media_url ?? null,
      post: null,
      sticker_id: payload.sticker_id ?? null,
      reply_to_message_id: payload.reply_to_message_id ?? currentReply?.id ?? null,
      created_at: new Date().toISOString(),
      seen: false,
      reactions: [],
      reply_to: currentReply ? { id: currentReply.id, sender_id: currentReply.sender_id, type: currentReply.type, content: currentReply.content, sticker_id: currentReply.sticker_id ?? null, post: currentReply.post ?? null } : null,
    };

    // 1. Mark animation for signature ZUUP
    setAnimatingMsgIds((prev) => ({ ...prev, [optId]: anim }));
    // 2. Play send SFX immediately (0ms non-blocking)
    playSfx("send");
    // 3. Clear reply state
    setReplyTo(null);
    // 4. Append optimistic message immediately
    setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev));
    // 5. Scroll to bottom
    isNearBottomRef.current = true;
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

    try {
      const res = await api<{ message: ChatMessageView }>(`/api/chats/${id}/messages`, {
        json: { ...payload, reply_to_message_id: payload.reply_to_message_id ?? currentReply?.id },
      });
      if (res?.message) {
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === optId ? res.message : m)),
          };
        });
        const updated = await appendCachedMessages(id, [res.message], detail?.conversation.expires_at);
        lastSyncCursorRef.current = res.message.created_at;
      }
      await load();
    } catch (e) {
      setDetail((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== optId) } : prev));
      toast((e as Error).message, "err");
      if ((e as Error).message.includes("disappeared")) {
        setGone("expired");
        void purgeExpiredChatLocal(id);
      }
    } finally {
      setBusy(false);
      setTimeout(() => {
        setAnimatingMsgIds((prev) => {
          const next = { ...prev };
          delete next[optId];
          return next;
        });
      }, 350);
    }
  };

  const sendSticker = async (stickerId: string) => {
    recordStickerRecent(stickerId);
    await send({ type: "sticker", sticker_id: stickerId });
  };

  const unsend = async (msgId: string) => {
    playSfx("unsend");
    setReactTo(null);
    setPickerOpen(false);

    // 1. Play unsend shrink-and-poof animation
    setAnimatingMsgIds((prev) => ({ ...prev, [msgId]: "unsend" }));

    // 2. Wait 180ms for CSS animation to finish
    await new Promise((r) => setTimeout(r, 180));

    // 3. Remove from local state and cache
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.filter((m) => m.id !== msgId),
      };
    });
    void removeCachedMessage(id, msgId);

    try {
      await api(`/api/chats/${id}/messages/${msgId}`, { method: "DELETE" });
      toast("Unsent. Gone for good.", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
      await load();
    } finally {
      setAnimatingMsgIds((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    }
  };


  // tap a reply quote → jump to the message it answers
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumpToMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    const list = listRef.current;
    if (!el || !list) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - listRect.top + list.scrollTop - (listRect.height / 2) + (elRect.height / 2);
    list.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    setFlashId(msgId);
    try { navigator.vibrate?.(8); } catch { /* no haptics */ }
    window.setTimeout(() => setFlashId((f) => (f === msgId ? null : f)), 1600);
  };

  const sendText = async () => {
    if (!text.trim() || busy) return;
    const t = text;
    setText("");
    await send({ type: "text", content: t });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await api<{ url: string; media_type: "image" | "video" }>("/api/upload", { body: form });
      await send({ type: up.media_type, media_url: up.url, content: text });
      setText("");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <div className="font-display fixed inset-0 z-[70] bg-[#0b0b0b] flex flex-col items-center justify-center gap-4 text-center px-8" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <svg viewBox="0 0 24 24" width={56} height={56} aria-hidden>
          <circle cx="12" cy="13" r="8.5" fill="none" stroke="#C8FF3D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 9v4.2l2.6 1.6M8 3.2 C10 2, 14 2, 16 3.2" fill="none" stroke="#C8FF3D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 4 L7 7 M20 4 L17 7" stroke="#7C4DFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div className="hd text-[24px] text-white">CHAT EXPIRED</div>
        <p className="text-[13px] text-[#C8FF3D]">24 hours. Then gone.</p>
        <NeoButton variant="primary" onClick={() => router.push("/messages")}>Back to Messages</NeoButton>
      </div>
    );
  }

  type Run = { mine: boolean; msgs: ChatMessageView[] };
  const blocks: Array<{ kind: "day"; label: string } | { kind: "run"; run: Run }> = [];
  {
    let cur: Run | null = null;
    let lastDay = "";
    for (const m of detail?.messages ?? []) {
      const day = new Date(m.created_at).toDateString();
      const mine = m.sender_id === user?.id;
      if (!cur || cur.mine !== mine || day !== lastDay) {
        if (cur) blocks.push({ kind: "run", run: cur });
        if (day !== lastDay) {
          blocks.push({ kind: "day", label: dayLabel(m.created_at) });
          lastDay = day;
        }
        cur = { mine, msgs: [] };
      }
      cur.msgs.push(m);
    }
    if (cur) blocks.push({ kind: "run", run: cur });
  }

  const reactMine = reactTo ? detail?.messages.find((x) => x.id === reactTo.msgId)?.sender_id === user?.id : false;

  return (
    <>
      <ScreenFrame frameRef={frameRef} />
      <div
        ref={screenRef}
        className="chat-screen font-display fixed inset-x-0 z-[65] bg-[#0b0b0b] text-white flex flex-col overflow-hidden"
        style={{
          top: "var(--chat-top, 0px)",
          height: "var(--chat-vh, 100dvh)",
          maxHeight: "var(--chat-vh, 100dvh)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          overscrollBehavior: "none",
        }}
      >
        {clickShield && <div className="absolute inset-0 z-[80]" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />}

      {/* header - stays fixed at top */}
      <header className="relative z-10 flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-2">
        <button onClick={() => router.push("/messages")} aria-label="Back to Messages" className="shrink-0 text-white transition-transform active:scale-90">
          <Icon name="arrow-left" size={21} strokeWidth={2.4} />
        </button>
        <Avatar name={detail?.other.display_name ?? "?"} bg={detail?.other.avatar_bg ?? "#7C4DFF"} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-[16.5px] leading-tight text-white">@{detail?.other.username ?? "…"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-none text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C8FF3D]" /> online
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <HeaderClock expiresAt={detail?.conversation.expires_at} />
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="mt-0.5 h-[4px] w-[104px]" aria-hidden>
            <path d="M2 4 C 22 1.5, 48 5.2, 68 2.8 C 80 1.6, 90 3.4, 98 2.4" fill="none" stroke="rgba(200,255,61,0.75)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="mt-0.5 whitespace-nowrap text-[9.5px] leading-none text-white/40">disappears in 24h</span>
        </div>
        <button onClick={() => setMenu(true)} aria-label="Chat menu" className="shrink-0 py-1 pl-1 text-white/85 transition-transform active:scale-90">
          <span className="mb-1 block h-1 w-1 rounded-full bg-current" />
          <span className="mb-1 block h-1 w-1 rounded-full bg-current" />
          <span className="block h-1 w-1 rounded-full bg-current" />
        </button>
      </header>

      <HeaderRule />

      {/* messages */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar px-4 pb-2 pt-1"
        style={{
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {/* mt-auto hugs the composer when the thread is short, scrolls normally when it grows */}
        <div className="mt-auto flex flex-col space-y-3">
          {blocks.map((b, bi) =>
            b.kind === "day" ? (
              <div key={`d${bi}`} className="flex items-center gap-3 py-1" aria-hidden>
                <span className="h-px flex-1 bg-white/15" />
                <span className="text-[13px] text-white/55">{b.label}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
            ) : (
              <div key={`r${b.run.msgs[0]?.id}`} className={`flex w-full ${b.run.mine ? "justify-end" : "justify-start gap-2"}`}>
                {!b.run.mine && (
                  <span className="mt-0.5 shrink-0 self-start">
                    <Avatar name={detail?.other.display_name ?? "?"} bg={detail?.other.avatar_bg ?? "#7C4DFF"} size={26} />
                  </span>
                )}
                <div className={`flex min-w-0 flex-col gap-[7px] ${b.run.mine ? "items-end max-w-[85%]" : "items-start flex-1"}`}>
                  {b.run.msgs.map((m, mi) => {
                    const tail = mi === 0;
                    const gestures = msgGestures(m);
                    const selected = reactTo?.msgId === m.id ? "msg-selected" : "";
                    const animKind = animatingMsgIds[m.id];
                    // shared posts live in their own card — never inside a bubble
                    if (m.type === "post" && m.post) {
                      const postAnim = animKind === "zuup" ? "msg-anim-zuup" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                      return (
                        <div key={m.id} id={`chat-msg-${m.id}`} className={`flex flex-col ${b.run.mine ? "items-end" : "items-start"} ${flashId === m.id ? "msg-flash" : ""} ${postAnim}`}>
                          <div
                            className={`msg-press relative ${selected}`}
                            {...gestures}
                            style={swipeStyle(m)}
                          >
                            {m.reply_to && <QuoteInline refr={m.reply_to} mine={b.run.mine} username={detail?.other.username ?? ""} onJump={() => jumpToMessage(m.reply_to!.id)} />}
                            <SharedBubble meme={m.post} onInvest={() => setInvestMeme(m.post!)} onShare={() => setShareMeme(m.post)} />
                            {animKind === "zuup" && b.run.mine && (
                              <span className="speed-stroke absolute -bottom-1 -right-3 text-[#C8FF3D] font-mono text-[11px] select-none pointer-events-none" aria-hidden>//</span>
                            )}
                            {doubleTapBurst?.msgId === m.id && (
                              <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                                <Spark size={28} color="#C8FF3D" />
                              </span>
                            )}
                            {swipe?.msgId === m.id && (
                              <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                                <ReplyArrow mine={b.run.mine} />
                              </span>
                            )}
                          </div>
                          <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} variant="card" onToggle={(rid) => react(m.id, rid)} />
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
                            {timeShort(m.created_at)}
                            {b.run.mine && <span title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                          </div>
                        </div>
                      );
                    }
                    // stickers are standalone visual messages — no bubble
                    if (m.type === "sticker" && m.sticker_id) {
                      const stickerAnim = animKind === "sticker" || animKind === "zuup" ? "sticker-anim-pop" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                      return (
                        <div key={m.id} id={`chat-msg-${m.id}`} className={`flex flex-col ${b.run.mine ? "items-end" : "items-start"} ${flashId === m.id ? "msg-flash" : ""} ${stickerAnim}`}>
                          <div
                            className={`msg-press relative ${selected}`}
                            {...gestures}
                            style={swipeStyle(m)}
                          >
                            {m.reply_to && <QuoteInline refr={m.reply_to} mine={b.run.mine} username={detail?.other.username ?? ""} onJump={() => jumpToMessage(m.reply_to!.id)} />}
                            <StickerArt id={m.sticker_id} size={136} />
                            {doubleTapBurst?.msgId === m.id && (
                              <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                                <Spark size={28} color="#C8FF3D" />
                              </span>
                            )}
                            {swipe?.msgId === m.id && (
                              <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                                <ReplyArrow mine={b.run.mine} />
                              </span>
                            )}
                          </div>
                          <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} onToggle={(rid) => react(m.id, rid)} />
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40">
                            {timeShort(m.created_at)}
                            {b.run.mine && <span title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                          </div>
                        </div>
                      );
                    }
                    const bubbleAnim = animKind === "zuup" ? "msg-anim-zuup" : animKind === "receive" ? "msg-anim-receive" : animKind === "unsend" ? "msg-anim-unsend" : "";
                    return (
                      <div key={m.id} id={`chat-msg-${m.id}`} className={`flex max-w-[92%] flex-col ${b.run.mine ? "self-end items-end" : "self-start items-start"} ${flashId === m.id ? "msg-flash" : ""} ${bubbleAnim}`}>
                        <div
                          className={`msg-press relative min-w-[92px] ${selected}`}
                          {...gestures}
                          style={swipeStyle(m)}
                        >
                          <BubbleFrame mine={b.run.mine} tail={tail} />
                          <BubbleAccents mine={b.run.mine} seed={hashId(m.id)} tail={tail} />
                          {animKind === "zuup" && b.run.mine && (
                            <span className="speed-stroke absolute -bottom-1 -right-3 text-[#C8FF3D] font-mono text-[11px] select-none pointer-events-none" aria-hidden>//</span>
                          )}
                          {doubleTapBurst?.msgId === m.id && (
                            <span className="aura-burst-mini absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                              <Spark size={28} color="#C8FF3D" />
                            </span>
                          )}
                          <div className="relative px-3.5 py-2">
                            {m.reply_to && (
                              <button
                                onClick={(e) => { e.stopPropagation(); jumpToMessage(m.reply_to!.id); }}
                                aria-label="Jump to original message"
                                className={`mb-1 block w-full border-l-2 pl-1.5 text-left ${b.run.mine ? "border-[#0a0a0a]/45" : "border-[#7C4DFF]"}`}
                              >
                                <div className="flex items-center gap-1">
                                  {m.reply_to.post && (
                                    m.reply_to.post.media_type === "text"
                                      ? <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-[#141414] font-display text-[7px] font-extrabold text-[#C8FF3D]">Aa</span>
                                      : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.reply_to.post.thumbnail_url} alt="" className="h-3.5 w-3.5 rounded-[3px] object-cover" loading="lazy" />
                                      )
                                  )}
                                  <span className={`truncate text-[10px] font-bold ${b.run.mine ? "text-[#0a0a0a]/60" : "text-[#C8FF3D]"}`}>
                                    ↳ {b.run.mine ? "you" : `@${detail?.other.username ?? ""}`} · {quoteText(m.reply_to)}
                                  </span>
                                </div>
                              </button>
                            )}
                            {m.type === "image" && m.media_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.media_url} alt="" className="mb-1 max-w-[190px] rounded-lg" loading="lazy" />
                            )}
                            {m.type === "video" && m.media_url && (
                              <video src={m.media_url} controls className="mb-1 max-w-[190px] rounded-lg" preload="metadata" />
                            )}
                            {m.content && (
                              <p className={`whitespace-pre-wrap break-words text-[16px] leading-snug ${b.run.mine ? "text-[#0a0a0a]" : "text-white/95"}`}>{m.content}</p>
                            )}
                            <div className={`mt-0.5 flex items-center justify-end gap-1 whitespace-nowrap text-[10px] leading-none ${b.run.mine ? "text-[#0a0a0a]/60" : "text-white/45"}`}>
                              {timeShort(m.created_at)}
                              {b.run.mine && <span className="font-bold" title={m.seen ? "Seen" : "Sent"}>{m.seen ? "✓✓" : "✓"}</span>}
                            </div>
                          </div>
                          {swipe?.msgId === m.id && (
                            <span className={`absolute top-1/2 -translate-y-1/2 ${m.sender_id === user?.id ? "-left-9" : "-right-9"}`} style={{ opacity: Math.min(1, swipe.dx / REPLY_THRESHOLD) }} aria-hidden>
                              <ReplyArrow mine={b.run.mine} />
                            </span>
                          )}
                        </div>
                        <ReactionStamps reactions={m.reactions ?? []} mine={b.run.mine} onToggle={(rid) => react(m.id, rid)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
          {detail && detail.messages.length === 0 && (
            <p className="py-5 text-center text-[13px] text-white/40">Say something. It&apos;ll be gone tomorrow.</p>
          )}
        </div>
      </div>

      {/* composer */}
      <div
        className="relative z-20 shrink-0 px-3.5 pt-2"
        style={{
          paddingBottom: "max(12px, calc(var(--chat-bottom-padding, env(safe-area-inset-bottom, 0px)) + 6px))",
        }}
      >
        {attach && (
          <div className="absolute bottom-[calc(100%+6px)] left-3 right-3 z-30 space-y-0.5 rounded-[16px] border border-[#2a2a2a] bg-[#131313] p-1.5">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { setSharePost(true); setAttach(false); }}>
              <Spark size={13} color="#C8FF3D" /> Share MEMORE post
            </button>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { fileKind.current = "image"; fileRef.current?.click(); setAttach(false); }}>
              <Icon name="camera" size={14} /> Photo
            </button>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-white/5" onClick={() => { fileKind.current = "video"; fileRef.current?.click(); setAttach(false); }}>
              <Icon name="video" size={14} /> Video
            </button>
          </div>
        )}
        {replyTo && (
          <div className="reply-bar-enter mb-1.5 flex items-center gap-2 rounded-[14px] border border-[#7C4DFF]/70 bg-[#141020] px-3 py-1.5">
            <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden className="shrink-0">
              <path d="M9 5 L4 10 L9 15 M4 10 L13.5 10 C 17.8 10, 20 12.8, 20 17 L 20 19" fill="none" stroke="#C8FF3D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold leading-tight text-[#C8FF3D]">
                replying to {replyTo.sender_id === user?.id ? "yourself" : `@${detail?.other.username ?? ""}`}
              </div>
              <div className="truncate text-[11.5px] leading-tight text-white/65">{quoteText(replyTo)}</div>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="shrink-0 text-white/60 transition-transform active:scale-90">
              <Icon name="x" size={14} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <button onClick={() => setAttach((a) => !a)} aria-label="Attach" className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center text-white/90 transition-transform active:scale-90">
            <WobblyCircle fill="#101010" stroke="#7C4DFF" />
            <span className="relative"><Icon name="plus" size={19} strokeWidth={2.6} /></span>
          </button>
          <div className="relative flex min-w-0 flex-1 items-center">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <path
                d="M8 4.5 C 30 2.5, 70 2.6, 92 4.5 C 96.8 6, 98.4 9.5, 98 15 C 98.4 20.5, 96.6 24, 92 25.5 C 70 27.4, 30 27.5, 8 25.5 C 3.4 24, 1.6 20.5, 2 15 C 1.6 9.5, 3.2 6, 8 4.5 Z"
                fill="#101010" stroke="rgba(124,77,255,0.9)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              />
            </svg>
            <input
              className="relative z-10 min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[17px] text-white outline-none placeholder:text-white/35"
              placeholder="say something..."
              value={text}
              maxLength={280}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}
              aria-label="Message"
            />
          </div>
          <button
            onClick={() => { (document.activeElement as HTMLElement | null)?.blur?.(); setStickersOpen(true); }}
            aria-label="Stickers"
            className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center text-white/90 transition-transform active:scale-90"
          >
            <WobblyCircle fill="#101010" stroke="#7C4DFF" />
            <span className="relative">
              <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden>
                <path d="M5.6 4.4 C 5.7 3.5, 6.4 3, 7.3 3 L 14.9 3.2 L 20.6 8.9 L 20.8 18 C 20.8 19.3, 19.9 20.3, 18.6 20.4 L 7.4 20.7 C 6.1 20.8, 5.4 19.9, 5.3 18.7 L 5.1 5.6 Z" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
                <path d="M14.7 3.4 L 14.9 6.7 C 15 7.9, 15.9 8.7, 17.1 8.7 L 20.3 8.7" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
              </svg>
              <span className="absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2"><Spark size={7} color="#C8FF3D" /></span>
            </span>
          </button>
          <button onClick={() => sendText()} aria-label="Send message" className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center text-[#0a0a0a] transition-transform active:scale-90">
            <WobblyCircle fill="#C8FF3D" stroke="rgba(10,10,10,0.7)" />
            <span className="relative"><Icon name="arrow-right" size={20} strokeWidth={2.6} /></span>
          </button>
        </div>
      </div>

      {reactTo && (
        <>
          <div
            className="fixed inset-0 z-[85] bg-black/30 backdrop-blur-[1px]"
            onPointerDown={() => { setReactTo(null); setPickerOpen(false); }}
          />
          <ReactionTray
            rect={reactTo.rect}
            favorites={favorites}
            pickerOpen={pickerOpen}
            hoverIdx={hoverIdx}
            isMine={reactMine}
            onUnsend={() => unsend(reactTo.msgId)}
            onPick={(rid) => react(reactTo.msgId, rid)}
            onMore={() => setPickerOpen(true)}
            onSlotsChange={saveSlots}
            onClose={() => { setReactTo(null); setPickerOpen(false); }}
          />
        </>
      )}

      <StickerSheet open={stickersOpen} onClose={() => setStickersOpen(false)} onPick={sendSticker} />

      {shareMeme && <ShareSheet meme={shareMeme} open onClose={() => setShareMeme(null)} onSent={() => { load(); toast("RECEIPT SENT ✦", "ok"); }} />}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />

      {sharePost && (
        <PostPickerSheet
          open
          onClose={() => setSharePost(false)}
          onPicked={async (postId) => {
            setSharePost(false);
            await send({ type: "post", post_id: postId, content: text });
            setText("");
          }}
        />
      )}
      {investMeme && <InvestSheet meme={investMeme} open onClose={() => setInvestMeme(null)} onDone={() => { load(); toast("Invested from the chat. Degenerate.", "ok"); }} />}

      <ChatMenuSheet id={id} open={menu} onClose={() => setMenu(false)} username={detail?.other.username ?? ""} />
      <style jsx global>{`
        .chat-screen ::selection { background: rgba(124, 77, 255, 0.45); color: #fff; }
        .chat-screen input { caret-color: #fff; -webkit-tap-highlight-color: transparent; }
        .chat-screen input:focus-visible { outline: none; box-shadow: none; }
        .chat-screen .msg-press { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: pan-y; }
        .chat-screen .msg-selected { filter: brightness(1.2) drop-shadow(0 0 9px rgba(200, 255, 61, 0.4)); outline: 2px solid rgba(200, 255, 61, 0.7); outline-offset: 2px; border-radius: 12px; }
        .chat-screen .msg-flash { animation: chatMsgFlash 1.5s ease; }
        @keyframes chatMsgFlash { 0%, 55% { filter: brightness(1.22) drop-shadow(0 0 10px rgba(200, 255, 61, 0.5)); } 100% { filter: none; } }
        /* the sticker sheet wears the chat's dark charcoal + purple sketch skin */
        .chat-screen .sheet:has(.sticker-sheet-body) { background: #141020; color: #fff; border-color: rgba(124, 77, 255, 0.9); }
        .chat-screen .sheet:has(.sticker-sheet-body) .sheet-grab { background: rgba(200, 255, 61, 0.5); }
      `}</style>
    </div>
    </>
  );
}

/** Pick one of your posts (or a trending one) to share into the chat. */
function PostPickerSheet({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked: (postId: string) => void }) {
  const { user } = useSession();
  const mine = useApi<{ posts: MemeView[] }>(open && user ? `/api/users/${user.username}` : null);
  const market = useApi<{ trending: MemeView[] }>(open ? "/api/market" : null);
  const own = (mine.data?.posts ?? []).slice(0, 8);
  const trending = (market.data?.trending ?? []).filter((t) => !own.some((p) => p.id === t.id)).slice(0, 6);

  const row = (m: MemeView) => (
    <button key={m.id} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 text-left" onClick={() => onPicked(m.id)}>
      {m.media_type === "text"
        ? <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141414] border border-[#2d2d2d] font-display text-[15px] font-extrabold text-[#C8FF3D]">Aa</span>
        : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.thumbnail_url} alt="" className="w-11 h-11 object-cover rounded-xl" loading="lazy" />
        )}
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[13px] truncate">{m.caption}</span>
        <span className="block text-[11px] muted aura-num">✦ {m.current_price}</span>
      </span>
      <Spark size={14} color="#C8FF3D" />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} label="Share a MEMORE post">
      <div className="hd text-[20px] mb-1">SEND THE RECEIPT</div>
      <p className="text-[11.5px] muted mb-3">The chat gets a reference. The meme stays on the market.</p>
      <div className="max-h-[46vh] overflow-y-auto no-scrollbar space-y-1">
        {own.length > 0 && <div className="text-[10px] font-bold uppercase tracking-widest muted px-1 pt-1">Your posts</div>}
        {own.map(row)}
        {trending.length > 0 && <div className="text-[10px] font-bold uppercase tracking-widest muted px-1 pt-2">Trending</div>}
        {trending.map(row)}
        {!mine.loading && own.length === 0 && trending.length === 0 && <p className="text-[12px] muted text-center py-4">Nothing worth sharing. Yet.</p>}
      </div>
    </Sheet>
  );
}

/** Shared MEMORE post card: compact, same border language as the feed card —
 * thin purple sketch outline, untouched meme image, and a few tiny marker
 * accents OUTSIDE the border (never over the image). */
function SharedBubble({ meme, onInvest, onShare }: { meme: MemeView; onInvest: () => void; onShare: () => void }) {
  return (
    <div className="relative w-[min(240px,100%)]">
      {/* sketch accents, kept outside the frame */}
      <svg viewBox="0 0 28 28" className="pointer-events-none absolute -left-3 -top-2.5 h-6 w-6 -rotate-6" aria-hidden>
        <path d="M5 19 C 8 13, 11 9, 16 4 M9 23 C 12 18, 15 14, 19 10" stroke="rgba(150,112,255,0.8)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 28 28" className="pointer-events-none absolute -bottom-2 -right-3 h-6 w-6 rotate-3" aria-hidden>
        <path d="M6 18 L13 8 M11 20 L18 11 M17 22 L23 14" stroke="rgba(200,255,61,0.75)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 64 10" className="pointer-events-none absolute -bottom-[5px] left-5 h-2 w-[54px]" aria-hidden>
        <path d="M2 6 C 18 8.6, 40 8, 62 4.5" stroke="rgba(150,112,255,0.7)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path
          d="M4.5 4 C 28 2.2, 72 2.4, 95.5 4.2 C 97.8 22, 98 72, 95.8 95.6 C 72 97.8, 28 97.6, 4.4 95.8 C 2.2 72, 2 24, 4.5 4 Z"
          fill="#101010" stroke="#7C4DFF" strokeWidth="1.7" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative px-3 pt-2 pb-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.16em] text-white/70">
            <Spark size={10} color="#C8FF3D" /> {meme.media_type === "text" ? "TEXT MEME" : "MEMORE POST"}
          </span>
          <Icon name="dots" size={12} strokeWidth={2.6} className="text-white/45" />
        </div>
        {meme.media_type === "text" ? (
          <Link href={`/meme/${meme.id}`} className="block select-text">
            <p className="font-display font-semibold text-[13.5px] leading-snug whitespace-pre-wrap text-white line-clamp-7">{meme.caption}</p>
          </Link>
        ) : (
          <>
            <Link href={`/meme/${meme.id}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meme.thumbnail_url} alt={meme.caption} className="h-[128px] w-full rounded-md object-cover" loading="lazy" />
            </Link>
            {meme.caption && <p className="mt-1.5 truncate text-[14px] text-white">&ldquo;{meme.caption}&rdquo;</p>}
          </>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-[#C8FF3D]">
            <Spark size={12} color="#C8FF3D" />
            <span className="aura-num text-[13px]">{meme.current_price}</span>
          </span>
          {meme.heat && (
            <span className="rounded-full border border-[#7C4DFF]/80 px-2 py-px text-[10px] font-bold text-[#C084FC]">{meme.heat.level}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onShare(); }}
            aria-label="Share this post"
            className="ml-auto flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#7C4DFF]/80 text-white/85 transition-transform active:scale-90"
          >
            <Icon name="share" size={12} strokeWidth={2.2} />
          </button>
          <button
            className="relative flex items-center gap-1 rounded-full bg-[#C8FF3D] px-3 py-[5px] text-[12px] font-bold text-[#0a0a0a] transition-transform active:scale-95"
            style={{ boxShadow: "1.5px 2px 0 rgba(10,10,10,0.85)" }}
            onClick={(e) => { e.stopPropagation(); onInvest(); }}
          >
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <path
                d="M10 4.2 C 32 2, 70 2.2, 90 4.4 C 96.4 6, 98.2 10, 97.7 15 C 98.2 20, 95.4 24.6, 88.8 26 C 66 27.8, 32 27.6, 11.2 25.8 C 4.4 24.2, 2 20, 2.5 15 C 2 10, 4.2 5.8, 10 4.2 Z"
                fill="none" stroke="rgba(10,10,10,0.78)" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="relative"><Spark size={13} color="#0a0a0a" /></span> INVEST
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMenuSheet({ id, open, onClose, username }: { id: string; open: boolean; onClose: () => void; username: string }) {
  const toast = useToast();
  const [muted, setMuted] = useState<boolean | null>(null);
  const act = async (kind: "mute" | "block" | "report") => {
    try {
      if (kind === "mute") {
        const r = await api<{ muted: boolean }>(`/api/chats/${id}/mute`, { method: "POST" });
        setMuted(r.muted);
        toast(r.muted ? "Muted. Peace." : "Unmuted.", "ok");
      } else if (kind === "block") {
        const r = await api<{ blocked: boolean }>(`/api/users/${username}/block`, { method: "POST" });
        toast(r.blocked ? "Blocked. They're gone." : "Unblocked.", "ok");
        onClose();
      } else {
        await api(`/api/chats/${id}/report`, { json: { note: "Reported from chat" } });
        toast("Reported. Our guys will look at it.", "ok");
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const rows: Array<{ icon: IconName; label: string; kind: "mute" | "block" | "report" }> = [
    { icon: "bell", label: muted ? "Unmute" : "Mute", kind: "mute" },
    { icon: "shield", label: "Block", kind: "block" },
    { icon: "flag", label: "Report", kind: "report" },
  ];
  return (
    <Sheet open={open} onClose={onClose} label="Chat options">
      <div className="hd text-[20px] mb-3">Chat options</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <button key={r.kind} className="neo-btn ghost w-full !justify-start" onClick={() => act(r.kind)}>
            <Icon name={r.icon} size={15} /> {r.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] muted mt-3">Blocking works even after the messages are gone.</p>
    </Sheet>
  );
}
