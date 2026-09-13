// Chat service — MEMORE's 24-hour disappearing conversations.
// The server is the only clock that matters: expires_at is set here at
// creation, every request re-checks it, and expired conversations are wiped
// (messages + reactions + media) by an idempotent cleanup pass that runs on
// every chat API call. Expired conversations can never be queried again.
import { db, save, uid, uploadsDir, normalizeDbUuids } from "./db";
import { userBySlug } from "./auth";
import { memeView } from "./views";
import { toCanonicalUuid } from "./sync";
import { REACTION_IDS } from "../reactions";
import { STICKER_IDS } from "../stickers";
import type {
  ChatConversation, ChatMessage, ChatListItem, ChatDetail, ChatMessageView,
  ChatOtherUser, ChatReplyRef, MemeView, MessageReaction, MessageReactionSummary, Profile,
} from "../types";
import fs from "fs";
import path from "path";

export const CHAT_TTL_MS = 24 * 60 * 60 * 1000;
const CHATS_FILE = "chats_v2.json";
let chatHydrationPromise: Promise<void> | null = null;
let lastChatHydrate = 0;
const CHAT_HYDRATE_TTL_MS = 3000;

export async function hydrateChats(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastChatHydrate < CHAT_HYDRATE_TTL_MS) {
    return;
  }
  if (chatHydrationPromise) return chatHydrationPromise;
  chatHydrationPromise = (async () => {
    try {
      let parsed: any = null;
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        if (admin) {
          const { data, error } = await admin.storage.from("system").download(CHATS_FILE);
          if (!error && data) {
            const text = await data.text();
            parsed = JSON.parse(text);
          }
        }
      } catch {}

      if (!parsed) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://mnfasawmfajfwquhymyl.supabase.co";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const url = `${supabaseUrl}/storage/v1/object/system/${CHATS_FILE}?t=${Date.now()}`;
        const res = await fetch(url, {
          headers: {
            ...(serviceKey ? { Authorization: `Bearer ${serviceKey}` } : {}),
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });
        if (res.ok) {
          parsed = await res.json();
        }
      }

      if (parsed) {
        const d = db();
        ensureChats(d);
        if (Array.isArray(parsed.chats)) {
          for (const c of parsed.chats) {
            const idx = d.chats.findIndex((x) => x.id === c.id);
            if (idx >= 0) d.chats[idx] = c;
            else d.chats.push(c);
          }
        }
        if (Array.isArray(parsed.chat_messages)) {
          for (const m of parsed.chat_messages) {
            const idx = d.chat_messages.findIndex((x) => x.id === m.id);
            if (idx >= 0) d.chat_messages[idx] = m;
            else d.chat_messages.push(m);
          }
        }
        if (Array.isArray(parsed.message_reactions)) {
          for (const r of parsed.message_reactions) {
            const idx = d.message_reactions.findIndex((x) => x.id === r.id);
            if (idx >= 0) d.message_reactions[idx] = r;
            else d.message_reactions.push(r);
          }
        }
        normalizeDbUuids(d);
      }
      lastChatHydrate = Date.now();
    } catch (err) {
      console.warn("hydrateChats warning:", err);
    } finally {
      chatHydrationPromise = null;
    }
  })();
  return chatHydrationPromise;
}

let persistChatTimer: ReturnType<typeof setTimeout> | null = null;
export async function persistChats(immediate = false): Promise<void> {
  lastChatHydrate = Date.now();
  const doUpload = async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      if (!admin) return;
      const d = db();
      ensureChats(d);
      normalizeDbUuids(d);
      const payload = Buffer.from(JSON.stringify({
        chats: d.chats,
        chat_messages: d.chat_messages,
        message_reactions: d.message_reactions,
        updated_at: Date.now(),
      }));
      await admin.storage.from("system").upload(CHATS_FILE, payload, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: true,
      });
    } catch (err) {
      console.warn("persistChats warning:", err);
    }
  };

  if (immediate) {
    if (persistChatTimer) {
      clearTimeout(persistChatTimer);
      persistChatTimer = null;
    }
    await doUpload();
  } else {
    if (persistChatTimer) clearTimeout(persistChatTimer);
    persistChatTimer = setTimeout(() => {
      persistChatTimer = null;
      void doUpload();
    }, 50);
  }
}

// Old db.json files predate the chat collections — backfill them lazily.
export function ensureChats(d: ReturnType<typeof db>): void {
  if (!d.chats) d.chats = [];
  if (!d.chat_messages) d.chat_messages = [];
  if (!d.message_reactions) d.message_reactions = [];
  // legacy messages predate sticker + reply fields
  for (const m of d.chat_messages) {
    if (m.sticker_id === undefined) (m as ChatMessage).sticker_id = null;
    if (m.reply_to_message_id === undefined) (m as ChatMessage).reply_to_message_id = null;
  }
}

/** Aggregated per-message reactions in catalog order (most-picked first). */
function summarizeReactions(all: MessageReaction[], messageId: string, viewerId: string): MessageReactionSummary[] {
  const byId = new Map<string, MessageReactionSummary>();
  for (const r of all) {
    if (r.message_id !== messageId) continue;
    const cur = byId.get(r.reaction_id);
    if (cur) {
      cur.count += 1;
      cur.mine = cur.mine || r.user_id === viewerId;
    } else {
      byId.set(r.reaction_id, { reaction_id: r.reaction_id, count: 1, mine: r.user_id === viewerId });
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}

/** Idempotent expiration pass: mark expired, delete messages + reactions + media files. */
export function expireChats(): void {
  const d = db();
  ensureChats(d);
  const now = Date.now();
  const dead = d.chats.filter((c) => c.status === "active" && new Date(c.expires_at).getTime() <= now);
  if (dead.length === 0) return;
  const deadIds = new Set(dead.map((c) => c.id));
  for (const c of dead) c.status = "expired";
  // delete message content + collect chat-owned media files
  const deadMedia: string[] = [];
  const deadMsgIds = new Set<string>();
  d.chat_messages = d.chat_messages.filter((m) => {
    if (!deadIds.has(m.conversation_id)) return true;
    deadMsgIds.add(m.id);
    if (m.media_url && m.media_url.startsWith("/api/media/")) deadMedia.push(m.media_url);
    return false;
  });
  if (deadMsgIds.size > 0) d.message_reactions = d.message_reactions.filter((r) => !deadMsgIds.has(r.message_id));
  // remove media files that belong exclusively to chat (local uploads only);
  // video messages may also have a "-poster.webp" sibling
  for (const url of deadMedia) {
    const name = url.replace("/api/media/", "");
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    for (const file of [name, `${base}-poster.webp`]) {
      try { fs.unlinkSync(path.join(uploadsDir, file)); } catch { /* already gone */ }
    }
  }
  save();
  persistChats();
}

function activeChats(d: ReturnType<typeof db>): ChatConversation[] {
  const now = Date.now();
  return d.chats.filter((c) => c.status === "active" && new Date(c.expires_at).getTime() > now);
}

function otherId(c: ChatConversation, userId: string): string {
  const canonUser = toCanonicalUuid(userId);
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  return p0 === canonUser ? p1 : p0;
}

function isBlocked(user: Profile, otherId: string): boolean {
  const blocked = (user.blocked ?? []).map((b) => toCanonicalUuid(b));
  return blocked.includes(toCanonicalUuid(otherId));
}

export function chatUnreadTotal(user: Profile): number {
  const d = db();
  ensureChats(d);
  let total = 0;
  const canonUserId = toCanonicalUuid(user.id);
  for (const c of activeChats(d)) {
    const p0 = toCanonicalUuid(c.participants[0]);
    const p1 = toCanonicalUuid(c.participants[1]);
    if (p0 !== canonUserId && p1 !== canonUserId) continue;
    if (c.muted?.[user.id] || c.muted?.[canonUserId]) continue;
    const last = d.chat_messages.filter((m) => m.conversation_id === c.id);
    const other = otherId(c, user.id);
    const lastRead = c.reads?.[user.id] ?? c.reads?.[canonUserId] ?? "";
    total += last.filter((m) => toCanonicalUuid(m.sender_id) === other && m.created_at > lastRead).length;
  }
  return total;
}

export function listChats(user: Profile): ChatListItem[] {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const blocked = new Set((user.blocked ?? []).map((b) => toCanonicalUuid(b)));
  const items: ChatListItem[] = [];
  for (const c of activeChats(d)) {
    const p0 = toCanonicalUuid(c.participants[0]);
    const p1 = toCanonicalUuid(c.participants[1]);
    if (p0 !== canonUserId && p1 !== canonUserId) continue;
    const oid = p0 === canonUserId ? p1 : p0;
    if (blocked.has(oid)) continue; // blocked conversations vanish from the list
    const otherProfile = d.users.find((u) => toCanonicalUuid(u.id) === oid);
    if (!otherProfile) continue;
    const msgs = d.chat_messages
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = msgs[msgs.length - 1];
    const lastRead = c.reads?.[user.id] ?? c.reads?.[canonUserId] ?? "";
    const unread = msgs.filter((m) => toCanonicalUuid(m.sender_id) === oid && m.created_at > lastRead).length;
    const previewUser = last ? d.users.find((u) => toCanonicalUuid(u.id) === toCanonicalUuid(last.sender_id)) : null;
    const previewText =
      last == null ? "Say something. It'll be gone tomorrow."
      : last.type === "post" ? (last.content || "Sent a MEMORE post") + (previewUser && toCanonicalUuid(previewUser.id) === canonUserId ? "" : "")
      : last.type === "image" ? "photo"
      : last.type === "video" ? "video"
      : last.content;
    items.push({
      id: c.id,
      other: { id: oid, username: otherProfile.username, display_name: otherProfile.display_name, avatar_bg: otherProfile.avatar_bg },
      preview: previewText,
      preview_type: last?.type ?? "text",
      last_at: last?.created_at ?? c.created_at,
      unread,
      remaining_ms: Math.max(0, new Date(c.expires_at).getTime() - Date.now()),
      expires_at: c.expires_at,
      muted: !!(c.muted?.[user.id] || c.muted?.[canonUserId]),
    });
  }
  return items.sort((a, b) => b.last_at.localeCompare(a.last_at));
}

export async function getOrCreateConversation(user: Profile, otherUsername: string): Promise<{ conversation: ChatConversation; other: Profile } | { error: string }> {
  const d = db();
  ensureChats(d);
  const other = userBySlug(otherUsername);
  if (!other) return { error: "That user doesn't exist." };
  const canonUser = toCanonicalUuid(user.id);
  const canonOther = toCanonicalUuid(other.id);
  if (canonOther === canonUser) return { error: "You can't chat with yourself. Try a diary." };
  if (isBlocked(user, canonOther)) return { error: "You blocked this user." };
  if (isBlocked(other, canonUser) || other.suspended) return { error: "Chat isn't available with this user." };

  const existing = activeChats(d).find((c) => {
    const p0 = toCanonicalUuid(c.participants[0]);
    const p1 = toCanonicalUuid(c.participants[1]);
    return (p0 === canonUser && p1 === canonOther) || (p0 === canonOther && p1 === canonUser);
  });
  if (existing) return { conversation: existing, other };

  const now = new Date();
  const conversation: ChatConversation = {
    id: `c_${uid()}`,
    participants: [canonUser, canonOther].sort() as [string, string],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CHAT_TTL_MS).toISOString(),
    status: "active",
    reads: { [canonUser]: now.toISOString() },
    muted: {},
  };
  d.chats.push(conversation);
  save();
  await persistChats(true);
  return { conversation, other };
}

export function getChatDetail(
  user: Profile,
  conversationId: string,
  options?: { after?: string; before?: string; limit?: number }
): ChatDetail | { error: string; status?: number } {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c) return { error: "Chat not found.", status: 404 };
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return { error: "Chat not found.", status: 404 };
  const remaining = new Date(c.expires_at).getTime() - Date.now();
  if (c.status !== "active" || remaining <= 0) return { error: "expired", status: 410 };

  const oid = p0 === canonUserId ? p1 : p0;
  const otherProfile = d.users.find((u) => toCanonicalUuid(u.id) === oid);
  if (!otherProfile) return { error: "Chat not found.", status: 404 };

  const otherRead = c.reads?.[oid] ?? "";
  let convMessages = d.chat_messages
    .filter((m) => m.conversation_id === c.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const isDelta = !!options?.after;
  if (options?.after) {
    convMessages = convMessages.filter((m) => m.created_at > options.after!);
  } else if (options?.before) {
    convMessages = convMessages.filter((m) => m.created_at < options.before!);
    const limit = options?.limit ?? 50;
    convMessages = convMessages.slice(-limit);
  } else {
    const limit = options?.limit ?? 50;
    convMessages = convMessages.slice(-limit);
  }

  const byId = new Map(convMessages.map((m) => [m.id, m]));
  const replyRef = (m: ChatMessage): ChatReplyRef | null => {
    if (!m.reply_to_message_id) return null;
    const t = byId.get(m.reply_to_message_id) || d.chat_messages.find((x) => x.id === m.reply_to_message_id);
    if (!t) return null;
    const post = t.type === "post" && t.post_id ? d.memes.find((x) => x.id === t.post_id) : null;
    return {
      id: t.id,
      sender_id: toCanonicalUuid(t.sender_id),
      type: t.type,
      content: t.content,
      sticker_id: t.sticker_id ?? null,
      post: post ? { id: post.id, caption: post.caption, thumbnail_url: post.thumbnail_url } : null,
    };
  };
  const messages: ChatMessageView[] = convMessages.map((m) => ({
    ...m,
    sender_id: toCanonicalUuid(m.sender_id),
    post: m.type === "post" && m.post_id ? postPreview(m.post_id, user.id) : null,
    seen: toCanonicalUuid(m.sender_id) === canonUserId && otherRead >= m.created_at,
    reactions: summarizeReactions(d.message_reactions, m.id, user.id),
    reply_to: replyRef(m),
  }));

  return {
    conversation: {
      id: c.id,
      created_at: c.created_at,
      expires_at: c.expires_at,
      remaining_ms: Math.max(0, remaining),
      other_read_at: otherRead,
    },
    other: { id: oid, username: otherProfile.username, display_name: otherProfile.display_name, avatar_bg: otherProfile.avatar_bg },
    messages,
    is_delta: isDelta,
  };
}

function postPreview(postId: string, viewerId: string): MemeView | null {
  const d = db();
  const m = d.memes.find((x) => x.id === postId);
  return m ? memeView(m, viewerId) : null;
}

export type SendInput = { type: ChatMessage["type"]; content?: string; post_id?: string; media_url?: string; sticker_id?: string; reply_to_message_id?: string };

export async function sendMessage(user: Profile, conversationId: string, input: SendInput): Promise<ChatMessageView | { error: string; status?: number }> {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c) return { error: "Chat not found.", status: 404 };
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return { error: "Chat not found.", status: 404 };
  // server-authoritative expiration — a tampered client clock changes nothing
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }

  // a reply references another message in this same conversation — never a copy
  let replyTo: string | null = null;
  if (input.reply_to_message_id) {
    const target = d.chat_messages.find((m) => m.id === input.reply_to_message_id && m.conversation_id === c.id);
    if (!target) return { error: "That message is gone." };
    replyTo = target.id;
  }

  let message: ChatMessage;
  if (input.type === "sticker") {
    const sticker = input.sticker_id && STICKER_IDS.includes(input.sticker_id) ? input.sticker_id : null;
    if (!sticker) return { error: "Unknown sticker." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: canonUserId, type: "sticker",
      content: "", post_id: null, media_url: null, sticker_id: sticker, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else if (input.type === "post") {
    const post = d.memes.find((m) => m.id === input.post_id && m.status === "live");
    if (!post) return { error: "That meme is gone." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: canonUserId, type: "post",
      content: (input.content ?? "").slice(0, 280), post_id: post.id, media_url: null,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else if (input.type === "image" || input.type === "video") {
    if (!input.media_url) return { error: "Missing media." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: canonUserId, type: input.type,
      content: (input.content ?? "").slice(0, 280), post_id: null, media_url: input.media_url,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else {
    const content = (input.content ?? "").trim().slice(0, 280);
    if (!content) return { error: "Say something (anything)." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: canonUserId, type: "text",
      content, post_id: null, media_url: null,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  }

  d.chat_messages.push(message);
  c.reads = { ...c.reads, [user.id]: message.created_at, [canonUserId]: message.created_at };
  save();
  await persistChats(true);
  return {
    ...message,
    post: message.type === "post" && message.post_id ? postPreview(message.post_id, user.id) : null,
    seen: false,
    reactions: [],
    reply_to: null, // the sender's own view refetches and hydrates it
  };
}

/** One reaction per user per message: picking the same one again removes it,
 * picking a different one swaps it. Returns the fresh per-message summary. */
export async function reactToMessage(user: Profile, conversationId: string, messageId: string, reactionId: string):
  Promise<{ reactions: MessageReactionSummary[] } | { error: string; status?: number }> {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  if (!REACTION_IDS.includes(reactionId)) return { error: "Unknown reaction." };
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c) return { error: "Chat not found.", status: 404 };
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return { error: "Chat not found.", status: 404 };
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }
  const m = d.chat_messages.find((x) => x.id === messageId && x.conversation_id === c.id);
  if (!m) return { error: "Message not found.", status: 404 };

  const existing = d.message_reactions.find((r) => r.message_id === messageId && toCanonicalUuid(r.user_id) === canonUserId);
  if (existing && existing.reaction_id === reactionId) {
    d.message_reactions = d.message_reactions.filter((r) => r.id !== existing.id);
  } else if (existing) {
    existing.reaction_id = reactionId;
    existing.created_at = new Date().toISOString();
  } else {
    d.message_reactions.push({ id: uid(), message_id: messageId, user_id: canonUserId, reaction_id: reactionId, created_at: new Date().toISOString() });
  }
  save();
  await persistChats(true);
  return { reactions: summarizeReactions(d.message_reactions, messageId, user.id) };
}

/** Unsend: permanently deletes YOUR message and its reactions — gone for
 * everyone, no archive (the disappearing-chat rule, applied early). */
export async function unsendMessage(user: Profile, conversationId: string, messageId: string): Promise<{ ok: true } | { error: string; status?: number }> {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c) return { error: "Chat not found.", status: 404 };
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return { error: "Chat not found.", status: 404 };
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }
  const m = d.chat_messages.find((x) => x.id === messageId && x.conversation_id === c.id);
  if (!m) return { error: "Already gone." };
  if (toCanonicalUuid(m.sender_id) !== canonUserId) return { error: "You can only unsend your own messages.", status: 403 };
  d.chat_messages = d.chat_messages.filter((x) => x.id !== messageId);
  d.message_reactions = d.message_reactions.filter((r) => r.message_id !== messageId);
  save();
  await persistChats(true);
  return { ok: true };
}

export async function markRead(user: Profile, conversationId: string): Promise<boolean> {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || c.status !== "active") return false;
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return false;

  const oid = p0 === canonUserId ? p1 : p0;
  const lastRead = c.reads?.[user.id] ?? c.reads?.[canonUserId] ?? "";
  const hasUnread = d.chat_messages.some(
    (m) => m.conversation_id === c.id && toCanonicalUuid(m.sender_id) === oid && m.created_at > lastRead
  );
  if (!hasUnread) return false;

  const nowStr = new Date().toISOString();
  c.reads = { ...c.reads, [user.id]: nowStr, [canonUserId]: nowStr };
  save();
  await persistChats(false);
  return true;
}

export async function toggleMute(user: Profile, conversationId: string): Promise<boolean> {
  const d = db();
  ensureChats(d);
  const canonUserId = toCanonicalUuid(user.id);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c) return false;
  const p0 = toCanonicalUuid(c.participants[0]);
  const p1 = toCanonicalUuid(c.participants[1]);
  if (p0 !== canonUserId && p1 !== canonUserId) return false;
  const nextVal = !c.muted?.[user.id] && !c.muted?.[canonUserId];
  c.muted = { ...c.muted, [user.id]: nextVal, [canonUserId]: nextVal };
  save();
  await persistChats(false);
  return nextVal;
}

export function listContacts(user: Profile): ChatOtherUser[] {
  const d = db();
  const canonUserId = toCanonicalUuid(user.id);
  const blocked = new Set((user.blocked ?? []).map((b) => toCanonicalUuid(b)));
  return d.users
    .filter((u) => toCanonicalUuid(u.id) !== canonUserId && !u.suspended && !blocked.has(toCanonicalUuid(u.id)))
    .sort((a, b) => b.aura_balance - a.aura_balance)
    .slice(0, 30)
    .map((u) => ({ id: toCanonicalUuid(u.id), username: u.username, display_name: u.display_name, avatar_bg: u.avatar_bg }));
}

export function toggleBlock(user: Profile, targetUsername: string): { blocked: boolean } | { error: string } {
  const target = userBySlug(targetUsername);
  if (!target) return { error: "That user doesn't exist." };
  if (target.id === user.id) return { error: "You can't block yourself." };
  const blocked = new Set(user.blocked ?? []);
  if (blocked.has(target.id)) {
    blocked.delete(target.id);
    user.blocked = [...blocked];
  } else {
    blocked.add(target.id);
    user.blocked = [...blocked];
  }
  save();
  return { blocked: blocked.has(target.id) };
}
