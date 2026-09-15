// MEMORE's end-to-end encryption engine.
//
// Layers (UI never touches any of this):
//   UI → encryptMessagePayload()/decryptFromSender() → [Signal protocol] → wire
//
// Protocol: X3DH (signed-prekey variant) + Double Ratchet via
// @privacyresearch/libsignal-protocol-typescript — a faithful TypeScript port
// of Signal's reference libsignal-protocol-javascript running on WebCrypto.
// No custom cryptography lives in this repo.
//
// Guarantees of this layer:
//   • Private keys + ratchet state exist ONLY in this device's IndexedDB.
//   • The server receives opaque base64 envelopes, never plaintext.
//   • Decrypted content is held in a session-scoped in-memory map ONLY —
//     never persisted (localStorage/IndexedDB), wiped on logout.
//   • Encryption failure throws — there is no plaintext fallback.
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  setWebCrypto,
} from "@privacyresearch/libsignal-protocol-typescript";
import type { MessageType } from "@privacyresearch/libsignal-protocol-typescript";
import { IndexedDbProtocolStore, b64ToBuf, bufToB64 } from "./store";

export const ENCRYPTION_VERSION = "signal-x3dh-dr-v1";
export const UNDECRYPTABLE = "Unable to decrypt message.";

/** The plaintext payload format, JSON-serialized then encrypted.
 * Media keys ride INSIDE the envelope — the server never sees them. */
export interface MessagePayload {
  v: 1;
  text?: string;
  media?: { key: string; iv: string; mime: string }; // AES-GCM key/iv (base64) for the encrypted media blob
}

interface Envelope {
  type: number; // 3 = prekey (session start), 1 = whisper (normal ratchet)
  body: string; // base64 protobuf — converted to/from the lib's binary-string form
}

// The protocol library returns envelope bodies as raw binary strings; the
// wire/database want base64. Plain byte-string conversions — not crypto.
function binaryStringToB64(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}
function b64ToBinaryString(b64: string): string {
  const bin = atob(b64);
  let s = "";
  for (let i = 0; i < bin.length; i += 0x8000) {
    s += bin.slice(i, i + 0x8000);
  }
  return s;
}

class Engine {
  store: IndexedDbProtocolStore;
  private readyPromise: Promise<void>;
  private peerDevice = new Map<string, string>(); // peerUserId -> deviceId we last used
  /** Session-scoped decrypted content, keyed by message id. Memory only. */
  private decrypted = new Map<string, MessagePayload>();

  constructor(readonly userId: string) {
    this.store = new IndexedDbProtocolStore(userId);
    this.readyPromise = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    if (typeof window === "undefined") throw new Error("E2EE is browser-only.");
    setWebCrypto(window.crypto);

    let identity = await this.store.loadIdentity();
    if (identity && !/^\d+$/.test(identity.deviceId)) {
      // One-time migration: the first rollout generated UUID device ids, but
      // Signal session addresses are `<name>.<numericDeviceId>` — those
      // devices could never be addressed consistently. Reset the whole
      // identity and start clean.
      await this.store.wipeAll();
      identity = null;
    }
    if (!identity) {
      const keyPair = await KeyHelper.generateIdentityKeyPair();
      const registrationId = KeyHelper.generateRegistrationId();
      const deviceId = String(KeyHelper.generateRegistrationId());
      await this.store.persistIdentity(keyPair, registrationId, deviceId);
      identity = { keyPair, registrationId, deviceId };
    }
    if (!(await this.store.loadSignedPreKey(1))) {
      const signedPreKey = await KeyHelper.generateSignedPreKey(identity.keyPair, 1);
      await this.store.storeSignedPreKey(1, signedPreKey.keyPair);
      await this.register(signedPreKey.keyPair.pubKey, signedPreKey.signature);
    }
  }

  /** Upload OUR public bundle. Only the PUBLIC halves and the signature ever
   * leave the device — private material is never serialized into this call. */
  private async register(signedPreKeyPublic: ArrayBuffer, signature: ArrayBuffer): Promise<void> {
    const identityPair = (await this.store.getIdentityKeyPair())!;
    const res = await fetch("/api/chat/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: this.store.deviceId,
        registration_id: await this.store.getLocalRegistrationId(),
        identity_key: bufToB64(identityPair.pubKey),
        signed_prekey_id: 1,
        signed_prekey_public: bufToB64(signedPreKeyPublic),
        signed_prekey_signature: bufToB64(signature),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Couldn't register encryption keys.");
    }
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  private addressFor(peerId: string, deviceId: string): SignalProtocolAddress {
    // device ids are numeric strings (they become part of the session address)
    const numeric = /^\d+$/.test(deviceId) ? Number(deviceId) : 1;
    return new SignalProtocolAddress(peerId, numeric);
  }

  /** Find any stored session with this peer that is open, preferring the last
   * one we used. Session addresses look like `<peerId>.<deviceId>`. */
  private async openSessionAddress(peerId: string): Promise<string | null> {
    const preferred = this.peerDevice.get(peerId);
    const candidates = (await this.store.sessionAddressList()).filter((a) => a.startsWith(`${peerId}.`));
    const ordered = preferred
      ? [`${peerId}.${preferred}`, ...candidates.filter((a) => a !== `${peerId}.${preferred}`)]
      : candidates;
    for (const addr of ordered) {
      const cipher = new SessionCipher(this.store, SignalProtocolAddress.fromString(addr));
      if (await cipher.hasOpenSession()) {
        this.peerDevice.set(peerId, addr.slice(peerId.length + 1));
        return addr;
      }
    }
    return null;
  }

  /** Establish a session from the peer's PUBLIC bundle (X3DH as initiator).
   * If the peer's device legitimately regenerated its identity since we
   * pinned it (device migration), re-pin once instead of deadlocking. */
  private async establishSession(peerId: string): Promise<string> {
    try {
      return await this.establishSessionInner(peerId);
    } catch (err) {
      if (String((err as Error)?.message ?? "").includes("Identity key changed")) {
        await this.store.removeIdentity(peerId);
        return await this.establishSessionInner(peerId);
      }
      throw err;
    }
  }

  private async establishSessionInner(peerId: string): Promise<string> {
    const res = await fetch(`/api/chat/keys?user=${encodeURIComponent(peerId)}`);
    if (!res.ok) throw new Error("Couldn't fetch their encryption keys.");
    const data = await res.json();
    const device = data?.device;
    if (!device) throw new Error("They haven't set up encrypted chat yet.");

    const address = this.addressFor(peerId, device.device_id);
    const builder = new SessionBuilder(this.store, address);
    await builder.processPreKey({
      identityKey: b64ToBuf(device.identity_key),
      registrationId: device.registration_id,
      signedPreKey: {
        keyId: device.signed_prekey_id,
        publicKey: b64ToBuf(device.signed_prekey_public),
        signature: b64ToBuf(device.signed_prekey_signature),
      },
    });
    this.peerDevice.set(peerId, String(device.device_id));
    return address.toString();
  }

  /** Encrypt one payload for a peer. Throws on any failure — NEVER falls
   * back to plaintext. The sender's own copy is kept in the device-private
   * local cache (the Signal-app model: your sent history lives on your
   * device; the peer envelope is undecryptable without the peer's state). */
  async encrypt(peerId: string, payload: MessagePayload): Promise<Envelope> {
    return await this.encryptTo(peerId, payload);
  }

  private async encryptTo(recipientId: string, payload: MessagePayload): Promise<Envelope> {
    await this.ready();
    const open = await this.openSessionAddress(recipientId);
    if (!open) await this.establishSession(recipientId);
    const cipher = new SessionCipher(this.store, this.addressFor(recipientId, this.peerDevice.get(recipientId) ?? "1"));
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer;
    const msg: MessageType = await cipher.encrypt(bytes);
    if (msg.body == null) throw new Error("Encryption produced no output.");
    return { type: msg.type, body: binaryStringToB64(msg.body) };
  }

  /** Decrypt an envelope sent by `senderId`. Result is memoized for the
   * session; failures return null (UI renders UNDECRYPTABLE, never garbage). */
  async decrypt(messageId: string, senderId: string, envelope: Envelope): Promise<MessagePayload | null> {
    const cached = this.decrypted.get(messageId);
    if (cached) return cached;
    await this.ready();
    const bytes = await this.decryptBytes(senderId, envelope);
    if (!bytes) return null;
    let payload: MessagePayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes)) as MessagePayload;
    } catch {
      return null;
    }
    this.decrypted.set(messageId, payload);
    return payload;
  }

  private async decryptBytes(senderId: string, envelope: Envelope): Promise<ArrayBuffer | null> {
    // Legacy/foreign formats (a JSON container from the brief self-envelope
    // experiment) fall back to their peer part; a bare base64 body passes
    // straight through.
    let raw = envelope.body;
    if (raw.startsWith("{") && raw.includes('"peer"')) {
      try {
        const container = JSON.parse(raw) as { peer?: [number, string] };
        if (!container.peer?.[1]) return null;
        raw = container.peer[1];
      } catch {
        return null;
      }
    }
    const body = b64ToBinaryString(raw);
    // Candidate sessions: the last device we used, then every stored session
    // for this sender, then the default slot. First success wins.
    const preferred = this.peerDevice.get(senderId);
    const seen = new Set<string>();
    const attempts: SessionCipher[] = [];
    const push = (deviceId: string) => {
      if (!deviceId || seen.has(deviceId)) return;
      seen.add(deviceId);
      attempts.push(new SessionCipher(this.store, this.addressFor(senderId, deviceId)));
    };
    push(preferred ?? "");
    for (const addr of await this.store.sessionAddressList()) {
      if (!addr.startsWith(`${senderId}.`)) continue;
      push(addr.slice(senderId.length + 1));
    }
    push("1");

    for (const cipher of attempts) {
      // The container doesn't record the envelope type (the sender emits
      // prekey envelopes until it gets a reply) — try both, first wins.
      for (const type of [3, 1]) {
        try {
          const bytes =
            type === 3
              ? await cipher.decryptPreKeyWhisperMessage(body, "binary")
              : await cipher.decryptWhisperMessage(body, "binary");
          return bytes;
        } catch {
          // try the next path — never log payloads or keys
        }
      }
    }
    return null;
  }

  /** Drop the in-memory plaintext for expired/deleted/unsent messages. */
  forget(messageIds: string[]): void {
    for (const id of messageIds) this.decrypted.delete(id);
  }
  /** Wipe ALL session-scoped plaintext (logout / account switch). */
  wipeMemory(): void {
    this.decrypted.clear();
  }
}

// One engine per user id, per tab. Engines are never recreated across renders.
const engines = new Map<string, Engine>();
export function getEngine(userId: string): Engine {
  let engine = engines.get(userId);
  if (!engine) {
    engine = new Engine(userId);
    engines.set(userId, engine);
  }
  return engine;
}
export function dropEngine(userId: string): void {
  engines.delete(userId);
}

// ---------- the two calls the UI/chat service uses ----------

export interface WireEnvelope {
  ciphertext: string;
  to_device: string | null;
  encryption_version: string;
}

/** Encrypt a message payload for `peerId`. Throws if encryption fails — the
 * caller must NOT send plaintext. */
export async function encryptMessagePayload(userId: string, peerId: string, payload: MessagePayload): Promise<WireEnvelope> {
  const engine = getEngine(userId);
  const envelope = await engine.encrypt(peerId, payload);
  return { ciphertext: envelope.body, to_device: engine.store.deviceId, encryption_version: ENCRYPTION_VERSION };
}

export type EnvelopeInput = { ciphertext?: string | null; encryption_version?: string | null; to_device?: string | null } | null | undefined;

/** Decrypt a message envelope sent by `senderId`. Returns null when it cannot
 * be decrypted — the UI renders UNDECRYPTABLE instead of garbage. */
export async function decryptFromSender(userId: string, messageId: string, senderId: string, envelope: EnvelopeInput): Promise<MessagePayload | null> {
  if (!envelope?.ciphertext) return null;
  const engine = getEngine(userId);
  return engine.decrypt(messageId, senderId, { type: 0, body: envelope.ciphertext });
}

/** Wipe session plaintext for messages that are gone (expiration/unsend). */
export function forgetDecrypted(userId: string, messageIds: string[]): void {
  if (messageIds.length === 0) return;
  try {
    getEngine(userId).forget(messageIds);
  } catch {
    /* engine not initialized — nothing to forget */
  }
}

/** Wipe ALL session plaintext on logout/account switch. */
export function wipeDecryptedMemory(): void {
  for (const engine of engines.values()) engine.wipeMemory();
}

export { IndexedDbProtocolStore } from "./store";
