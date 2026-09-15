// E2EE chat media: AES-GCM (WebCrypto, standard AEAD — no custom crypto).
// The plaintext file NEVER leaves the device. A fresh random key+iv is
// generated per file; the key travels INSIDE the Signal-encrypted message
// envelope (lib/crypto/engine.ts), so the storage bucket holds ciphertext
// only. Nothing here is chat-specific — feed media keeps its existing path.
export interface EncryptedMedia {
  blob: ArrayBuffer; // ciphertext to upload
  key: string; // base64 AES-256 key — goes inside the message envelope
  iv: string; // base64 96-bit nonce
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt file bytes locally, before any upload. Runs off the render path —
 * call it from the file handler, never during render/scroll. */
export async function encryptMedia(bytes: ArrayBuffer): Promise<EncryptedMedia> {
  const rawKey = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(rawKey);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const blob = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { blob, key: b64(rawKey), iv: b64(iv) };
}

/** Decrypt a downloaded ciphertext blob on the recipient's device. */
export async function decryptMedia(ciphertext: ArrayBuffer, keyB64: string, ivB64: string): Promise<Blob> {
  const rawKey = unb64(keyB64);
  const iv = unb64(ivB64);
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Blob([plain]);
}
