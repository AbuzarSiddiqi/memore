// Chat service — MEMORE's ephemeral messaging, now E2EE end to end.
//   MESSAGE      = ephemeral. Each message owns a server-set expires_at
//                  (created_at + 24h) and is deleted individually.
//   CONVERSATION = persistent. It represents the thread and NEVER expires.
//   CONTACT      = persistent. The chat list is built from conversations, so
//                  @alice stays in the list even after every message is gone.
//
// PERSISTENCE: Supabase Postgres (database/migration_v6_e2ee_chat.sql).
// The server stores CIPHERTEXT ONLY — message bodies arrive pre-encrypted
// from the client (Signal protocol, lib/crypto/*) and leave as they came.
// The server sees metadata (type, timestamps, reads, reactions, media URLs)
// but never plaintext message content or media. The plaintext JSON snapshot
// (chats_v2.json) era is gone; legacy conversations were imported without
// their plaintext content, which simply expires.
//
// CLOCK: every created_at/expires_at is set by Postgres (server time).
// Expiration is enforced by queries + an idempotent deletion worker — the
// client countdown is decoration only.
import { userBySlug } from "./auth";
import { memeView } from "./views";
import { toCanonicalUuid } from "./sync";
import { REACTION_IDS } from "../reactions";
import { STICKER_IDS } from "../stickers";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ChatMessage, ChatListItem, ChatDetail, ChatMessageView,
  ChatOtherUser, ChatReplyRef, MessageReactionSummary, Profile,
} from "../types";
import fs from "fs";
import path from "path";
import { uploadsDir } from "./db";

export const CHAT_TTL_MS = 24 * 60 * 60 * 1000; // each MESSAGE lives 24h

// The ciphertext envelope is an opaque base64 blob (Signal protocol). Cap it
// so no one can smuggle bulk plaintext storage into the messages table.
export const MAX_CIPHERTEXT_CHARS = 60_000;

const NOT_PROVISIONED = "Chat storage isn't provisioned yet. Run database/migration_v6_e2ee_chat.sql in the Supabase SQL Editor.";

interface PgError { code?: string; message?: string }
interface PgResult<T> { data: T | null; error: PgError | null }
// PostgREST reports "table does not exist" as PGRST205 (schema cache miss);
// 42P01 is the raw Postgres code when it surfaces directly.
export function isNotProvisioned(err: unknown): boolean {
  const code = (err as PgError)?.code;
  return code === "42P01" || code === "PGRST205";
}
function serviceError(err: unknown): { error: string; status: number } {
  if (isNotProvisioned(err)) return { error: NOT_PROVISIONED, status: 503 };
  console.warn("chat store warning:", (err as PgError)?.message ?? err);
  return { error: "Something went wrong with the chat store.", status: 500 };
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
function admin(): Admin {
  const a = createAdminClient();
  if (!a) throw new Error("Supabase service role is not configured.");
  return a;
}

// Row shapes straight from Postgres (snake_case, timestamptz → ISO strings)
interface ConvRow { id: string; created_at: string; updated_at: string; temp_chat: boolean }
interface PartRow { conversation_id: string; user_id: string; last_read_at: string; muted: boolean }
interface MsgRow {
  id: string; conversation_id: string; sender_id: string;
  type: ChatMessage["type"]; ciphertext: string; encryption_version: string; to_device: string | null;
  post_id: string | null; media_url: string | null; sticker_id: string | null;
  reply_to_message_id: string | null;
  created_at: string; expires_at: string; deleted_at: string | null;
}

// Postgrest builders are thenables, not Promises — await works, the helper
// signatures just have to accept PromiseLike.
async function select<T = unknown>(q: PromiseLike<PgResult<T[]>>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
async function single<T = unknown>(q: PromiseLike<PgResult<T>>): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ---------- access helpers ----------

function isBlocked(user: Profile, otherId: string): boolean {
  const blocked = (user.blocked ?? []).map((b) => toCanonicalUuid(b));
  return blocked.includes(toCanonicalUuid(otherId));
}

/** Membership check + both participant ids. Postgres uuids are already
 * canonical; toCanonicalUuid keeps the legacy-id guards harmless. */
export async function membership(convId: string, userId: string): Promise<{ parts: PartRow[]; conv: ConvRow; other: string } | null> {
  const a = admin();
  const conv = await single<ConvRow>(a.from("conversations").select("*").eq("id", convId).maybeSingle());
  if (!conv) return null;
  const parts = await select<PartRow>(
    a.from("conversation_participants").select("conversation_id,user_id,last_read_at,muted").eq("conversation_id", convId)
  );
  const me = parts.find((p) => toCanonicalUuid(p.user_id) === toCanonicalUuid(userId));
  if (!me || parts.length !== 2) return null;
  const other = parts.find((p) => toCanonicalUuid(p.user_id) !== toCanonicalUuid(userId));
  return { parts, conv, other: other ? toCanonicalUuid(other.user_id) : "" };
}

/** Encrypted chat media lives in the same uploads area as feed media, but the
 * BYTES are ciphertext (the client encrypted them before upload). Expiration,
 * unsend and TEMP CHAT close remove the blob from disk. */
function removeMediaFiles(urls: (string | null)[]): void {
  for (const url of urls) {
    if (!url || !url.startsWith("/api/media/")) continue;
    const name = url.replace("/api/media/", "").split("?")[0];
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    for (const file of [name, `${base}-poster.webp`]) {
      try { fs.unlinkSync(path.join(uploadsDir, file)); } catch { /* already gone */ }
    }
  }
}

// ---------- expiration worker ----------

/** Idempotent MESSAGE expiration: hard-deletes every expired message
 * (ciphertext + reactions cascade + media blobs). Conversations,
 * participants and chat-list contacts are NEVER touched — a thread whose
 * messages have all expired shows the empty state and stays in the list.
 * Server-authoritative (Postgres clock); runs on every chat API call. */
export async function expireChats(): Promise<void> {
  try {
    const a = admin();
    const dead = await select<{ id: string; conversation_id: string; media_url: string | null }>(
      a.from("chat_messages").delete().lt("expires_at", new Date().toISOString()).select("id,conversation_id,media_url")
    );
    if (dead.length > 0) {
      removeMediaFiles(dead.map((m) => m.media_url));
      await a.from("conversations").update({ updated_at: new Date().toISOString() })
        .in("id", [...new Set(dead.map((m) => m.conversation_id))]);
    }
  } catch (err) {
    if (isNotProvisioned(err)) return; // not provisioned yet — nothing to expire
    console.warn("expireChats warning:", (err as PgError)?.message ?? err);
  }
}

// ---------- chat list ----------

function partMap(parts: PartRow[], userId: string): { me: PartRow; other: PartRow } {
  const canon = toCanonicalUuid(userId);
  const me = parts.find((p) => toCanonicalUuid(p.user_id) === canon)!;
  const other = parts.find((p) => toCanonicalUuid(p.user_id) !== canon)!;
  return { me, other };
}

async function unreadCount(convId: string, otherId: string, lastReadAt: string): Promise<number> {
  const a = admin();
  // head:true + exact count → the resolved object carries `count`, data is null
  const { count, error } = await a.from("chat_messages").select("id", { count: "exact", head: true })
    .eq("conversation_id", convId)
    .eq("sender_id", otherId)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .gt("created_at", lastReadAt);
  if (error) throw error;
  return count ?? 0;
}

/** The chat list is built from PERSISTENT conversations — every conversation
 * the user participates in appears forever, even when all of its messages
 * have expired (then last_ciphertext is null → the client shows "start a
 * chat"). Previews of text messages arrive as CIPHERTEXT; the client
 * decrypts them locally. Expired last messages never leak. */
export async function listChats(user: Profile): Promise<ChatListItem[]> {
  const a = admin();
  const canonUserId = toCanonicalUuid(user.id);
  const blocked = new Set((user.blocked ?? []).map((b) => toCanonicalUuid(b)));
  const myParts = await select<PartRow>(
    a.from("conversation_participants").select("conversation_id,user_id,last_read_at,muted").eq("user_id", user.id)
  );
  if (myParts.length === 0) return [];
  const convs = await select<ConvRow>(
    a.from("conversations").select("id,created_at,updated_at,temp_chat")
      .in("id", myParts.map((p) => p.conversation_id))
      .order("updated_at", { ascending: false })
  );

  const items: ChatListItem[] = [];
  for (const conv of convs) {
    const parts = await select<PartRow>(
      a.from("conversation_participants").select("conversation_id,user_id,last_read_at,muted").eq("conversation_id", conv.id)
    );
    if (parts.length !== 2) continue;
    const { me, other } = partMap(parts, user.id);
    const oid = toCanonicalUuid(other.user_id);
    if (oid === canonUserId || blocked.has(oid)) continue; // blocked conversations vanish from the list
    const profile = userById(oid);
    if (!profile) continue;

    const last = (await select<{
      id: string; type: ChatMessage["type"]; ciphertext: string; encryption_version: string;
      to_device: string | null; media_url: string | null; sender_id: string; created_at: string;
    }>(
      a.from("chat_messages").select("id,type,ciphertext,encryption_version,to_device,media_url,sender_id,created_at")
        .eq("conversation_id", conv.id).is("deleted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1)
    ))[0] ?? null;

    const unread = await unreadCount(conv.id, oid, me.last_read_at);
    items.push({
      id: conv.id,
      other: { id: oid, username: profile.username, display_name: profile.display_name, avatar_bg: profile.avatar_bg, last_seen_at: profile.last_seen_at ?? null },
      preview: "", // built client-side from last_ciphertext (never plaintext server-side)
      preview_type: last?.type ?? "text",
      last_at: last?.created_at ?? conv.updated_at ?? conv.created_at,
      unread,
      temp_chat: conv.temp_chat,
      muted: me.muted,
      last_ciphertext: last?.ciphertext ?? null,
      last_encryption_version: last?.encryption_version ?? null,
      last_to_device: last?.to_device ?? null,
    });
  }
  return items.sort((a, b) => b.last_at.localeCompare(a.last_at));
}

export async function getOrCreateConversation(user: Profile, otherUsername: string): Promise<{ conversation: ConvRow; other: Profile } | { error: string }> {
  const other = userBySlug(otherUsername);
  if (!other) return { error: "That user doesn't exist." };
  const canonOther = toCanonicalUuid(other.id);
  if (canonOther === toCanonicalUuid(user.id)) return { error: "You can't chat with yourself. Try a diary." };
  if (isBlocked(user, canonOther)) return { error: "You blocked this user." };
  if (isBlocked(other, user.id) || other.suspended) return { error: "Chat isn't available with this user." };

  const a = admin();
  // 1-to-1 conversations: the shared thread is the one containing exactly
  // these two participants. Persistent — always reusable, no matter that its
  // messages may all have expired.
  const shared = await select<{ conversation_id: string }>(
    a.from("conversation_participants").select("conversation_id").in("user_id", [user.id, other.id])
  );
  const counts = new Map<string, number>();
  for (const s of shared) counts.set(s.conversation_id, (counts.get(s.conversation_id) ?? 0) + 1);
  for (const [convId, n] of counts) {
    if (n !== 2) continue;
    const parts = await select<PartRow>(
      a.from("conversation_participants").select("conversation_id,user_id,last_read_at,muted").eq("conversation_id", convId)
    );
    if (parts.length === 2) {
      const conv = await single<ConvRow>(a.from("conversations").select("id,created_at,updated_at,temp_chat").eq("id", convId).maybeSingle());
      if (conv) return { conversation: conv, other };
    }
  }

  const nowIso = new Date().toISOString();
  const conv = await single<ConvRow>(
    a.from("conversations").insert({ id: `c_${crypto.randomUUID()}`, created_at: nowIso, updated_at: nowIso, temp_chat: false }).select("id,created_at,updated_at,temp_chat").single()
  );
  if (!conv) return { error: "Couldn't start the chat. Try again." };
  const { error: partErr } = await a.from("conversation_participants").insert([
    { conversation_id: conv.id, user_id: user.id, last_read_at: nowIso, muted: false },
    { conversation_id: conv.id, user_id: other.id, last_read_at: "1970-01-01T00:00:00Z", muted: false },
  ]);
  if (partErr) {
    // never report success with an orphaned conversation — surface it
    console.warn("participant insert failed:", partErr.message);
    await a.from("conversations").delete().eq("id", conv.id);
    return { error: "Couldn't start the chat. Try again." };
  }
  return { conversation: conv, other };
}

// ---------- detail ----------


export async function getChatDetail(
  user: Profile,
  conversationId: string,
  options?: { after?: string; before?: string; limit?: number }
): Promise<ChatDetail | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>>;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  const { parts, conv, other: oid } = mship;
  const { other } = partMap(parts, user.id);
  const profile = userById(oid);
  if (!profile) return { error: "Chat not found.", status: 404 };

  // Only non-expired, non-deleted MESSAGES are ever returned — the server's
  // authoritative access restriction, independent of any client clock.
  const iso = (d: string) => new Date(d).toISOString();
  let query = a.from("chat_messages").select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (options?.after) query = query.gt("created_at", iso(options.after));
  else if (options?.before) query = query.lt("created_at", iso(options.before));

  let rows: MsgRow[];
  try {
    rows = await select<MsgRow>(options?.after ? query : query.limit(options?.limit ?? options?.before ? 10000 : 50));
  } catch (err) {
    return serviceError(err);
  }
  if (options?.before) rows = rows.slice(-(options?.limit ?? 50));

  const isDelta = !!options?.after;
  const otherRead = other.last_read_at;
  const messages: ChatMessageView[] = rows.map((m) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: toCanonicalUuid(m.sender_id),
    type: m.type,
    content: "", // never transmitted — the client decrypts `ciphertext` locally
    ciphertext: m.ciphertext,
    encryption_version: m.encryption_version,
    to_device: m.to_device,
    post_id: m.post_id,
    media_url: m.media_url,
    sticker_id: m.sticker_id,
    reply_to_message_id: m.reply_to_message_id,
    created_at: new Date(m.created_at).toISOString(),
    expires_at: new Date(m.expires_at).toISOString(),
    post: m.type === "post" && m.post_id ? postView(m.post_id, user.id) : null,
    seen: toCanonicalUuid(m.sender_id) === toCanonicalUuid(user.id) && otherRead >= m.created_at,
    reactions: [], // hydrated by hydrateReactions below
    reply_to: null,
  }));

  await hydrateReactions(messages, conversationId, user.id);
  hydrateReplyRefs(messages, rows, user.id);

  return {
    conversation: {
      id: conv.id,
      created_at: new Date(conv.created_at).toISOString(),
      temp_chat: conv.temp_chat,
      other_read_at: new Date(otherRead).toISOString(),
    },
    other: { id: oid, username: profile.username, display_name: profile.display_name, avatar_bg: profile.avatar_bg, last_seen_at: profile.last_seen_at ?? null },
    messages,
    is_delta: isDelta,
  };
}

function postView(postId: string, viewerId: string) {
  return memePostView(postId, viewerId);
}

// reactions + reply refs ----------------------------------------------------

async function hydrateReactions(messages: ChatMessageView[], conversationId: string, userId: string): Promise<void> {
  if (messages.length === 0) return;
  const a = admin();
  const rows = await select<{ id: string; message_id: string; user_id: string; reaction_id: string }>(
    a.from("message_reactions").select("id,message_id,user_id,reaction_id")
      .in("message_id", messages.map((m) => m.id))
  );
  const canonUserId = toCanonicalUuid(userId);
  for (const m of messages) {
    const byId = new Map<string, MessageReactionSummary>();
    for (const r of rows.filter((r) => r.message_id === m.id)) {
      const cur = byId.get(r.reaction_id);
      if (cur) {
        cur.count += 1;
        cur.mine = cur.mine || toCanonicalUuid(r.user_id) === canonUserId;
      } else {
        byId.set(r.reaction_id, { reaction_id: r.reaction_id, count: 1, mine: toCanonicalUuid(r.user_id) === canonUserId });
      }
    }
    m.reactions = [...byId.values()].sort((x, y) => y.count - x.count);
  }
}

/** Reply quotes carry metadata only (id/sender/type) — the quoted TEXT is
 * decrypted on the device from the target message's own ciphertext. */
function hydrateReplyRefs(messages: ChatMessageView[], rows: MsgRow[], userId: string): void {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const m of messages) {
    if (!m.reply_to_message_id) continue;
    const t = rowById.get(m.reply_to_message_id);
    if (!t) continue;
    const ref: ChatReplyRef = {
      id: t.id,
      sender_id: toCanonicalUuid(t.sender_id),
      type: t.type,
      content: "", // filled client-side after local decryption
      sticker_id: t.sticker_id ?? null,
      post: t.type === "post" && t.post_id ? postView(t.post_id, userId) : null,
    };
    m.reply_to = ref;
  }
}

// ---------- send ----------

export type SendInput = {
  type: ChatMessage["type"];
  ciphertext?: string;      // client-encrypted envelope — REQUIRED for text/image/video
  to_device?: string;
  content?: string;         // accepted for compatibility but NEVER stored
  post_id?: string;
  media_url?: string;
  sticker_id?: string;
  reply_to_message_id?: string;
};

export async function sendMessage(user: Profile, conversationId: string, input: SendInput): Promise<ChatMessageView | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };

  // A reply references another message in this same conversation — never a copy.
  let replyTo: string | null = null;
  if (input.reply_to_message_id) {
    const target = await single<MsgRow>(
      a.from("chat_messages").select("id").eq("id", input.reply_to_message_id)
        .eq("conversation_id", conversationId).is("deleted_at", null).maybeSingle()
    );
    if (!target) return { error: "That message is gone." };
    replyTo = target.id;
  }

  // The envelope is opaque; the server only gates its presence and size.
  const ciphertext = typeof input.ciphertext === "string" ? input.ciphertext : "";
  const needsCipher = input.type === "text" || input.type === "image" || input.type === "video" || (input.type === "post" && !!input.content);
  if (needsCipher && !ciphertext) {
    // No plaintext fallback, ever — an unsent message beats an insecure one.
    return { error: "Couldn't secure this message. Try again." };
  }
  if (ciphertext.length > MAX_CIPHERTEXT_CHARS) return { error: "Message too long." };

  let row: Partial<MsgRow> & { conversation_id: string; sender_id: string };
  if (input.type === "sticker") {
    const sticker = input.sticker_id && STICKER_IDS.includes(input.sticker_id) ? input.sticker_id : null;
    if (!sticker) return { error: "Unknown sticker." };
    row = { conversation_id: conversationId, sender_id: user.id, type: "sticker", ciphertext: "", sticker_id: sticker, post_id: null, media_url: null, reply_to_message_id: replyTo, to_device: input.to_device ?? null };
  } else if (input.type === "post") {
    const post = dbMeme(input.post_id ?? "");
    if (!post) return { error: "That meme is gone." };
    row = { conversation_id: conversationId, sender_id: user.id, type: "post", ciphertext, post_id: post.id, media_url: null, sticker_id: null, reply_to_message_id: replyTo, to_device: input.to_device ?? null };
  } else if (input.type === "image" || input.type === "video") {
    if (!input.media_url) return { error: "Missing media." };
    row = { conversation_id: conversationId, sender_id: user.id, type: input.type, ciphertext, media_url: input.media_url, post_id: null, sticker_id: null, reply_to_message_id: replyTo, to_device: input.to_device ?? null };
  } else {
    row = { conversation_id: conversationId, sender_id: user.id, type: "text", ciphertext, post_id: null, media_url: null, sticker_id: null, reply_to_message_id: replyTo, to_device: input.to_device ?? null };
  }

  // Server-authoritative timestamps: Postgres stamps created_at, and the TTL
  // constraint + default pin expires_at to created_at + 24h. A client with a
  // wrong clock cannot extend (or forge) any lifetime.
  let inserted: MsgRow | null;
  try {
    inserted = await single<MsgRow>(
      a.from("chat_messages").insert(row).select("*").single()
    );
  } catch (err) {
    return serviceError(err);
  }
  if (!inserted) return { error: "Message didn't send. Try again." };

  const nowIso = new Date().toISOString();
  await Promise.all([
    a.from("conversation_participants").update({ last_read_at: nowIso })
      .eq("conversation_id", conversationId).eq("user_id", user.id),
    a.from("conversations").update({ updated_at: nowIso }).eq("id", conversationId),
  ]);

  return {
    id: inserted.id,
    conversation_id: inserted.conversation_id,
    sender_id: toCanonicalUuid(inserted.sender_id),
    type: inserted.type,
    content: "",
    ciphertext: inserted.ciphertext,
    encryption_version: inserted.encryption_version,
    to_device: inserted.to_device,
    post_id: inserted.post_id,
    media_url: inserted.media_url,
    sticker_id: inserted.sticker_id,
    reply_to_message_id: inserted.reply_to_message_id,
    created_at: new Date(inserted.created_at).toISOString(),
    expires_at: new Date(inserted.expires_at).toISOString(),
    post: inserted.type === "post" && inserted.post_id ? postView(inserted.post_id, user.id) : null,
    seen: false,
    reactions: [],
    reply_to: null, // the sender's own view refetches and hydrates it
  };
}

// ---------- reactions ----------

/** One reaction per user per message: picking the same one again removes it,
 * picking a different one swaps it. Reaction ids are catalog keys — never
 * user content, so they live in the clear. */
export async function reactToMessage(user: Profile, conversationId: string, messageId: string, reactionId: string):
  Promise<{ reactions: MessageReactionSummary[] } | { error: string; status?: number }> {
  if (!REACTION_IDS.includes(reactionId)) return { error: "Unknown reaction." };
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  const m = await single<MsgRow>(a.from("chat_messages").select("id").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle());
  if (!m) return { error: "Message not found.", status: 404 };

  const existing = await single<{ id: string; reaction_id: string }>(
    a.from("message_reactions").select("id,reaction_id").eq("message_id", messageId).eq("user_id", user.id).maybeSingle()
  );
  if (existing?.reaction_id === reactionId) {
    await a.from("message_reactions").delete().eq("id", existing.id);
  } else if (existing) {
    await a.from("message_reactions").update({ reaction_id: reactionId }).eq("id", existing.id);
  } else {
    await a.from("message_reactions").insert({ message_id: messageId, user_id: user.id, reaction_id: reactionId });
  }

  const rows = await select<{ user_id: string; reaction_id: string }>(
    a.from("message_reactions").select("user_id,reaction_id").eq("message_id", messageId)
  );
  const byId = new Map<string, MessageReactionSummary>();
  for (const r of rows) {
    const mine = toCanonicalUuid(r.user_id) === toCanonicalUuid(user.id);
    const cur = byId.get(r.reaction_id);
    if (cur) {
      cur.count += 1;
      cur.mine = cur.mine || mine;
    } else {
      byId.set(r.reaction_id, { reaction_id: r.reaction_id, count: 1, mine });
    }
  }
  return { reactions: [...byId.values()].sort((x, y) => y.count - x.count) };
}

// ---------- unsend ----------

/** Unsend: permanently deletes YOUR message and its reactions — gone for
 * everyone, no archive (the disappearing-chat rule, applied early). */
export async function unsendMessage(user: Profile, conversationId: string, messageId: string): Promise<{ ok: true } | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  const m = await single<MsgRow>(a.from("chat_messages").select("id,sender_id,media_url").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle());
  if (!m) return { error: "Already gone." };
  if (toCanonicalUuid(m.sender_id) !== toCanonicalUuid(user.id)) return { error: "You can only unsend your own messages.", status: 403 };

  try {
    const dead = await select<{ media_url: string | null }>(
      a.from("chat_messages").delete().eq("id", messageId).select("media_url")
    );
    removeMediaFiles(dead.map((d) => d.media_url));
  } catch (err) {
    return serviceError(err);
  }
  return { ok: true };
}

// ---------- reads / mute / temp chat ----------

export async function markRead(user: Profile, conversationId: string): Promise<boolean> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    if (isNotProvisioned(err)) return false;
    throw err;
  }
  if (!mship) return false;
  const { conv, other: oid } = mship;
  const { me } = partMap(mship.parts, user.id);
  const unread = await unreadCount(conv.id, oid, me.last_read_at);
  if (unread === 0) return false;
  await a.from("conversation_participants").update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).eq("user_id", user.id);
  return true;
}

export async function toggleMute(user: Profile, conversationId: string): Promise<boolean | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  const { me } = partMap(mship.parts, user.id);
  const next = !me.muted;
  await a.from("conversation_participants").update({ muted: next })
    .eq("conversation_id", conversationId).eq("user_id", user.id);
  return next;
}

/** TEMP CHAT toggle — a conversation-level setting shared by both
 * participants. The conversation itself never expires or disappears; only
 * the lifetime of messages inside it changes. */
export async function setTempChat(user: Profile, conversationId: string, enabled: boolean): Promise<boolean | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  await a.from("conversations").update({ temp_chat: enabled, updated_at: new Date().toISOString() }).eq("id", conversationId);
  return enabled;
}

/** TEMP CHAT close: the user left a temporary chat, so the server purges its
 * messages (ciphertext + reactions cascade + media blobs) — exactly like
 * expiration. Deliberately NEVER deletes: the conversation, its participants,
 * the chat-list contact, or the user relationship. No-op when TEMP CHAT is off. */
export async function closeTempChat(user: Profile, conversationId: string): Promise<{ purged: number } | { error: string; status?: number }> {
  const a = admin();
  let mship: Awaited<ReturnType<typeof membership>> | null;
  try {
    mship = await membership(conversationId, user.id);
  } catch (err) {
    return serviceError(err);
  }
  if (!mship) return { error: "Chat not found.", status: 404 };
  if (!mship.conv.temp_chat) return { purged: 0 };
  try {
    const dead = await select<{ id: string; media_url: string | null }>(
      a.from("chat_messages").delete().eq("conversation_id", conversationId).select("id,media_url")
    );
    removeMediaFiles(dead.map((d) => d.media_url));
    return { purged: dead.length };
  } catch (err) {
    return serviceError(err);
  }
}

// ---------- contacts / block (user data still lives in the JSON store) ----------

export function listContacts(user: Profile): ChatOtherUser[] {
  const { allUsers } = usersIndex();
  const canonUserId = toCanonicalUuid(user.id);
  const blocked = new Set((user.blocked ?? []).map((b) => toCanonicalUuid(b)));
  return allUsers()
    .filter((u) => toCanonicalUuid(u.id) !== canonUserId && !u.suspended && !blocked.has(toCanonicalUuid(u.id)))
    .sort((a, b) => b.aura_balance - a.aura_balance)
    .slice(0, 30)
    .map((u) => ({ id: toCanonicalUuid(u.id), username: u.username, display_name: u.display_name, avatar_bg: u.avatar_bg, last_seen_at: u.last_seen_at ?? null }));
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
  const { persistUsers } = usersIndex();
  persistUsers();
  return { blocked: blocked.has(target.id) };
}

export async function chatUnreadTotal(user: Profile): Promise<number> {
  try {
    const chats = await listChats(user);
    return chats.reduce((s, c) => s + (c.muted ? 0 : c.unread), 0);
  } catch {
    return 0;
  }
}

// ---------- JSON-store shims -------------------------------------------------
// User profiles, blocks and the meme market still live in the JSON store
// (lib/server/db.ts). These tiny helpers keep this module from importing the
// whole store at module scope (avoids cycles) while chats move to Postgres.

import { db, save } from "./db";
import type { Meme } from "../types";

function usersIndex() {
  return {
    allUsers: () => db().users,
    persistUsers: () => save(),
  };
}
function userById(id: string): Profile | undefined {
  return db().users.find((u) => toCanonicalUuid(u.id) === toCanonicalUuid(id));
}
function dbMeme(postId: string): Meme | undefined {
  return db().memes.find((m) => m.id === postId && m.status === "live");
}
function memePostView(postId: string, viewerId: string) {
  const m = dbMeme(postId);
  return m ? memeView(m, viewerId) : null;
}
