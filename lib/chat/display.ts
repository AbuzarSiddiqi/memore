// Chat display bridge — the ONLY place wire ciphertext becomes renderable.
//
//   server/broadcast ciphertext → hydrateForDisplay() → React state (memory)
//
// Plaintext exists exclusively inside this module's in-memory maps for the
// lifetime of the tab. Nothing here touches localStorage, IndexedDB or any
// persistent store — the persistent cache keeps ciphertext only.
import type { ChatMessage, ChatMessageView } from "@/lib/types";
import { decryptFromSender, UNDECRYPTABLE, type MessagePayload } from "@/lib/crypto/engine";

interface MediaKeyInfo { key: string; iv: string; mime: string }

const mediaKeys = new Map<string, MediaKeyInfo>();
const payloadPromises = new Map<string, Promise<MessagePayload | null>>();

/** Register the media key for OUR OWN outgoing message at send time (the
 * sender never decrypts its own envelope). */
export function rememberMediaKey(messageId: string, media: MediaKeyInfo | undefined): void {
  if (media) mediaKeys.set(messageId, media);
}

export function mediaKeyFor(messageId: string): MediaKeyInfo | undefined {
  return mediaKeys.get(messageId);
}

function envelopeOf(m: Pick<ChatMessage, "ciphertext" | "encryption_version">): { ciphertext: string; encryption_version: string } | null {
  if (!m.ciphertext) return null;
  return { ciphertext: m.ciphertext, encryption_version: m.encryption_version || "signal-x3dh-dr-v1" };
}

/** Decrypt-once payload fetch (memoized per message id). */
export function payloadFor(userId: string, m: Pick<ChatMessage, "id" | "sender_id" | "ciphertext" | "encryption_version">): Promise<MessagePayload | null> {
  const env = envelopeOf(m);
  if (!env) return Promise.resolve(null);
  let p = payloadPromises.get(m.id);
  if (!p) {
    p = decryptFromSender(userId, m.id, m.sender_id, env);
    payloadPromises.set(m.id, p);
  }
  return p;
}

/** Turn wire messages (content always "") into display messages: text filled
 * in, media keys stashed, reply quotes resolved within the batch. The input
 * array is left untouched; caching happens before this is called.
 *
 * The SENDER's own messages are NOT decrypted — the peer envelope is
 * undecryptable without the peer's ratchet state. Their content comes from
 * the device-private local cache, where send() persisted it (the Signal-app
 * model: your sent history lives on your device only). */
export async function hydrateForDisplay(userId: string, messages: ChatMessageView[]): Promise<ChatMessageView[]> {
  const canonUserId = userId;
  const payloads = new Map<string, MessagePayload | null>();
  await Promise.all(
    messages.map(async (m) => {
      if (!m.ciphertext) return;
      if (m.sender_id === canonUserId) return; // own copy comes from the local cache
      const payload = await payloadFor(userId, m);
      payloads.set(m.id, payload);
      if (payload?.media) rememberMediaKey(m.id, payload.media);
    })
  );
  return messages.map((m) => {
    if (!m.ciphertext) return m; // stickers carry no ciphertext
    if (m.sender_id === canonUserId) {
      // own message: trust the cached copy; a cache miss shows an empty
      // bubble rather than a misleading "unable to decrypt" error.
      // Own media keys ride along in the device-private cache.
      if (m.media_key && m.media_iv) {
        rememberMediaKey(m.id, {
          key: m.media_key,
          iv: m.media_iv,
          mime: m.media_mime || (m.type === "video" ? "video/mp4" : "image/jpeg"),
        });
      }
      return m;
    }
    const payload = payloads.get(m.id) ?? null;
    let content = "";
    if (payload?.text != null) content = payload.text;
    else if (m.ciphertext) content = UNDECRYPTABLE;
    let reply_to = m.reply_to;
    if (reply_to && !reply_to.content) {
      const target = payloads.get(reply_to.id);
      if (target?.text) reply_to = { ...reply_to, content: target.text };
    }
    return { ...m, content, reply_to };
  });
}

/** Chat-list preview text: decrypt the newest message's envelope locally.
 * Falls back to the type-based label the old server preview used. */
export async function previewTextFor(userId: string, cacheKey: string, senderId: string, item: { preview_type: ChatMessage["type"]; last_ciphertext?: string | null; last_encryption_version?: string | null }): Promise<string> {
  const type = item.preview_type;
  if (type === "image") return "photo";
  if (type === "video") return "video";
  if (type === "sticker") return "sticker";
  if (type === "post") return "Sent a MEMORE post";
  if (!item.last_ciphertext) return "";
  const payload = await payloadFor(userId, {
    id: `preview:${cacheKey}`,
    sender_id: senderId,
    ciphertext: item.last_ciphertext,
    encryption_version: item.last_encryption_version || "signal-x3dh-dr-v1",
  });
  return payload?.text ?? (item.last_ciphertext ? UNDECRYPTABLE : "");
}
