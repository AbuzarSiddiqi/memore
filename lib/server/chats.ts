// Chat service — MEMORE's 24-hour disappearing conversations.
// The server is the only clock that matters: expires_at is set here at
// creation, every request re-checks it, and expired conversations are wiped
// (messages + reactions + media) by an idempotent cleanup pass that runs on
// every chat API call. Expired conversations can never be queried again.
import { db, save, uid, uploadsDir } from "./db";
import { userBySlug } from "./auth";
import { memeView } from "./views";
import { REACTION_IDS } from "../reactions";
import { STICKER_IDS } from "../stickers";
import type {
  ChatConversation, ChatMessage, ChatListItem, ChatDetail, ChatMessageView,
  ChatOtherUser, ChatReplyRef, MemeView, MessageReaction, MessageReactionSummary, Profile,
} from "../types";
import fs from "fs";
import path from "path";

export const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

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
}

function activeChats(d: ReturnType<typeof db>): ChatConversation[] {
  const now = Date.now();
  return d.chats.filter((c) => c.status === "active" && new Date(c.expires_at).getTime() > now);
}

function otherId(c: ChatConversation, userId: string): string {
  return c.participants[0] === userId ? c.participants[1] : c.participants[0];
}

function isBlocked(user: Profile, otherId: string): boolean {
  return (user.blocked ?? []).includes(otherId);
}

export function chatUnreadTotal(user: Profile): number {
  const d = db();
  ensureChats(d);
  let total = 0;
  for (const c of activeChats(d)) {
    if (!c.participants.includes(user.id)) continue;
    if (c.muted?.[user.id]) continue;
    const last = d.chat_messages.filter((m) => m.conversation_id === c.id);
    const other = otherId(c, user.id);
    const lastRead = c.reads?.[user.id] ?? "";
    total += last.filter((m) => m.sender_id === other && m.created_at > lastRead).length;
  }
  return total;
}

export function listChats(user: Profile): ChatListItem[] {
  const d = db();
  ensureChats(d);
  const blocked = new Set(user.blocked ?? []);
  const items: ChatListItem[] = [];
  for (const c of activeChats(d)) {
    if (!c.participants.includes(user.id)) continue;
    const oid = otherId(c, user.id);
    if (blocked.has(oid)) continue; // blocked conversations vanish from the list
    const otherProfile = d.users.find((u) => u.id === oid);
    if (!otherProfile) continue;
    const msgs = d.chat_messages
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = msgs[msgs.length - 1];
    const lastRead = c.reads?.[user.id] ?? "";
    const unread = msgs.filter((m) => m.sender_id === oid && m.created_at > lastRead).length;
    const previewUser = last ? d.users.find((u) => u.id === last.sender_id) : null;
    const previewText =
      last == null ? "Say something. It'll be gone tomorrow."
      : last.type === "post" ? (last.content || "Sent a MEMORE post") + (previewUser && previewUser.id === user.id ? "" : "")
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
      muted: !!c.muted?.[user.id],
    });
  }
  return items.sort((a, b) => b.last_at.localeCompare(a.last_at));
}

export function getOrCreateConversation(user: Profile, otherUsername: string): { conversation: ChatConversation; other: Profile } | { error: string } {
  const d = db();
  ensureChats(d);
  const other = userBySlug(otherUsername);
  if (!other) return { error: "That user doesn't exist." };
  if (other.id === user.id) return { error: "You can't chat with yourself. Try a diary." };
  if (isBlocked(user, other.id)) return { error: "You blocked this user." };
  if (isBlocked(other, user.id) || other.suspended) return { error: "Chat isn't available with this user." };

  const existing = activeChats(d).find(
    (c) => c.participants.includes(user.id) && c.participants.includes(other.id)
  );
  if (existing) return { conversation: existing, other };

  const now = new Date();
  const conversation: ChatConversation = {
    id: `c_${uid()}`,
    participants: [user.id, other.id].sort() as [string, string],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CHAT_TTL_MS).toISOString(),
    status: "active",
    reads: { [user.id]: now.toISOString() },
    muted: {},
  };
  d.chats.push(conversation);
  save();
  return { conversation, other };
}

export function getChatDetail(user: Profile, conversationId: string): ChatDetail | { error: string; status?: number } {
  const d = db();
  ensureChats(d);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id)) return { error: "Chat not found.", status: 404 };
  const remaining = new Date(c.expires_at).getTime() - Date.now();
  if (c.status !== "active" || remaining <= 0) return { error: "expired", status: 410 };

  const oid = otherId(c, user.id);
  const otherProfile = d.users.find((u) => u.id === oid);
  if (!otherProfile) return { error: "Chat not found.", status: 404 };

  const otherRead = c.reads?.[oid] ?? "";
  const convMessages = d.chat_messages
    .filter((m) => m.conversation_id === c.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const byId = new Map(convMessages.map((m) => [m.id, m]));
  const replyRef = (m: ChatMessage): ChatReplyRef | null => {
    if (!m.reply_to_message_id) return null;
    const t = byId.get(m.reply_to_message_id);
    if (!t) return null;
    const post = t.type === "post" && t.post_id ? d.memes.find((x) => x.id === t.post_id) : null;
    return {
      id: t.id,
      sender_id: t.sender_id,
      type: t.type,
      content: t.content,
      sticker_id: t.sticker_id ?? null,
      post: post ? { id: post.id, caption: post.caption, thumbnail_url: post.thumbnail_url } : null,
    };
  };
  const messages: ChatMessageView[] = convMessages.map((m) => ({
    ...m,
    post: m.type === "post" && m.post_id ? postPreview(m.post_id, user.id) : null,
    seen: m.sender_id === user.id && otherRead >= m.created_at,
    reactions: summarizeReactions(d.message_reactions, m.id, user.id),
    reply_to: replyRef(m),
  }));

  return {
    conversation: { id: c.id, created_at: c.created_at, expires_at: c.expires_at, remaining_ms: Math.max(0, remaining) },
    other: { id: oid, username: otherProfile.username, display_name: otherProfile.display_name, avatar_bg: otherProfile.avatar_bg },
    messages,
  };
}

function postPreview(postId: string, viewerId: string): MemeView | null {
  const d = db();
  const m = d.memes.find((x) => x.id === postId);
  return m ? memeView(m, viewerId) : null;
}

export type SendInput = { type: ChatMessage["type"]; content?: string; post_id?: string; media_url?: string; sticker_id?: string; reply_to_message_id?: string };

export function sendMessage(user: Profile, conversationId: string, input: SendInput): ChatMessageView | { error: string; status?: number } {
  const d = db();
  ensureChats(d);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id)) return { error: "Chat not found.", status: 404 };
  // server-authoritative expiration — a tampered client clock changes nothing
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }
  const oid = otherId(c, user.id);

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
      id: uid(), conversation_id: c.id, sender_id: user.id, type: "sticker",
      content: "", post_id: null, media_url: null, sticker_id: sticker, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else if (input.type === "post") {
    const post = d.memes.find((m) => m.id === input.post_id && m.status === "live");
    if (!post) return { error: "That meme is gone." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: user.id, type: "post",
      content: (input.content ?? "").slice(0, 280), post_id: post.id, media_url: null,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else if (input.type === "image" || input.type === "video") {
    if (!input.media_url) return { error: "Missing media." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: user.id, type: input.type,
      content: (input.content ?? "").slice(0, 280), post_id: null, media_url: input.media_url,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  } else {
    const content = (input.content ?? "").trim().slice(0, 280);
    if (!content) return { error: "Say something (anything)." };
    message = {
      id: uid(), conversation_id: c.id, sender_id: user.id, type: "text",
      content, post_id: null, media_url: null,
      sticker_id: null, reply_to_message_id: replyTo,
      created_at: new Date().toISOString(),
    };
  }

  d.chat_messages.push(message);
  c.reads = { ...c.reads, [user.id]: message.created_at }; // sender has read up to now
  save();
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
export function reactToMessage(user: Profile, conversationId: string, messageId: string, reactionId: string):
  { reactions: MessageReactionSummary[] } | { error: string; status?: number } {
  const d = db();
  ensureChats(d);
  if (!REACTION_IDS.includes(reactionId)) return { error: "Unknown reaction." };
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id)) return { error: "Chat not found.", status: 404 };
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }
  const m = d.chat_messages.find((x) => x.id === messageId && x.conversation_id === c.id);
  if (!m) return { error: "Message not found.", status: 404 };

  const existing = d.message_reactions.find((r) => r.message_id === messageId && r.user_id === user.id);
  if (existing && existing.reaction_id === reactionId) {
    d.message_reactions = d.message_reactions.filter((r) => r.id !== existing.id);
  } else if (existing) {
    existing.reaction_id = reactionId;
    existing.created_at = new Date().toISOString();
  } else {
    d.message_reactions.push({ id: uid(), message_id: messageId, user_id: user.id, reaction_id: reactionId, created_at: new Date().toISOString() });
  }
  save();
  return { reactions: summarizeReactions(d.message_reactions, messageId, user.id) };
}

/** Unsend: permanently deletes YOUR message and its reactions — gone for
 * everyone, no archive (the disappearing-chat rule, applied early). */
export function unsendMessage(user: Profile, conversationId: string, messageId: string): { ok: true } | { error: string; status?: number } {
  const d = db();
  ensureChats(d);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id)) return { error: "Chat not found.", status: 404 };
  if (c.status !== "active" || new Date(c.expires_at).getTime() <= Date.now()) {
    return { error: "Too late. This chat disappeared.", status: 410 };
  }
  const m = d.chat_messages.find((x) => x.id === messageId && x.conversation_id === c.id);
  if (!m) return { error: "Already gone." };
  if (m.sender_id !== user.id) return { error: "You can only unsend your own messages.", status: 403 };
  d.chat_messages = d.chat_messages.filter((x) => x.id !== messageId);
  d.message_reactions = d.message_reactions.filter((r) => r.message_id !== messageId);
  save();
  return { ok: true };
}

export function markRead(user: Profile, conversationId: string): boolean {
  const d = db();
  ensureChats(d);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id) || c.status !== "active") return false;
  c.reads = { ...c.reads, [user.id]: new Date().toISOString() };
  save();
  return true;
}

export function toggleMute(user: Profile, conversationId: string): boolean {
  const d = db();
  ensureChats(d);
  const c = d.chats.find((x) => x.id === conversationId);
  if (!c || !c.participants.includes(user.id)) return false;
  c.muted = { ...c.muted, [user.id]: !c.muted?.[user.id] };
  save();
  return !!c.muted[user.id];
}

export function listContacts(user: Profile): ChatOtherUser[] {
  const d = db();
  const blocked = new Set(user.blocked ?? []);
  return d.users
    .filter((u) => u.id !== user.id && !u.suspended && !blocked.has(u.id))
    .sort((a, b) => b.aura_balance - a.aura_balance)
    .slice(0, 30)
    .map((u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_bg: u.avatar_bg }));
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
