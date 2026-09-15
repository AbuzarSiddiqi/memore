// Signal-protocol device storage — IndexedDB only.
// PRIVATE keys (identity, signed prekey, all session/ratchet state) live here
// and nowhere else: never localStorage, never the server, never logs. One
// database per user id, so accounts on the same browser are cryptographically
// isolated from each other.
import type { KeyPairType, StorageType, Direction, SessionRecordType } from "@privacyresearch/libsignal-protocol-typescript";

const DB_VERSION = 1;

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`memore-e2ee-${userId}`, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("identity")) db.createObjectStore("identity");
      if (!db.objectStoreNames.contains("identities")) db.createObjectStore("identities");
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions");
      if (!db.objectStoreNames.contains("signedPreKeys")) db.createObjectStore("signedPreKeys");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function req2promise<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
export function b64ToBuf(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
export function bufToB64(b: ArrayBuffer): string {
  return b64(b);
}

/** The subset of StorageType the protocol needs, backed by IndexedDB. */
export class IndexedDbProtocolStore implements StorageType {
  private db: Promise<IDBDatabase>;
  private identityKeyPair: KeyPairType | null = null;
  private localRegistrationId = 0;
  deviceId = "";

  constructor(readonly userId: string) {
    this.db = openDb(userId);
  }

  private async tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.db;
    return db.transaction(store, mode).objectStore(store);
  }

  private async kvGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return req2promise<T | undefined>((await this.tx(store, "readonly")).get(key));
  }
  private async kvPut(store: string, key: IDBValidKey, value: unknown): Promise<void> {
    await req2promise((await this.tx(store, "readwrite")).put(value as never, key));
  }

  // ---------- own identity ----------

  async loadIdentity(): Promise<{ keyPair: KeyPairType; registrationId: number; deviceId: string } | null> {
    const keyPair = await this.kvGet<KeyPairType>("identity", "keyPair");
    const registrationId = (await this.kvGet<number>("identity", "registrationId")) ?? 0;
    const deviceId = (await this.kvGet<string>("identity", "deviceId")) ?? "";
    if (!keyPair || !deviceId) return null;
    this.identityKeyPair = keyPair;
    this.localRegistrationId = registrationId;
    this.deviceId = deviceId;
    return { keyPair, registrationId, deviceId };
  }

  async persistIdentity(keyPair: KeyPairType, registrationId: number, deviceId: string): Promise<void> {
    this.identityKeyPair = keyPair;
    this.localRegistrationId = registrationId;
    this.deviceId = deviceId;
    await this.kvPut("identity", "keyPair", keyPair);
    await this.kvPut("identity", "registrationId", registrationId);
    await this.kvPut("identity", "deviceId", deviceId);
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return this.identityKeyPair ?? (await this.kvGet<KeyPairType>("identity", "keyPair")) ?? undefined;
  }
  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.localRegistrationId || (await this.kvGet<number>("identity", "registrationId")) || undefined;
  }
  async getDeviceId(): Promise<string> {
    return this.deviceId || ((await this.kvGet<string>("identity", "deviceId")) ?? "");
  }

  // ---------- peer identities (TOFU pinning) ----------

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, _direction: Direction): Promise<boolean> {
    void _direction;
    // The protocol passes the peer's NAME here and the full
    // `<name>.<deviceId>` address to saveIdentity — key both by NAME so the
    // pin actually holds across session rebuilds.
    const saved = await this.kvGet<ArrayBuffer>("identities", identifier);
    // Trust on first use, then pin: a changed identity key for the same
    // address is refused (a rotating key would enable a MITM re-registration).
    if (!saved) return true;
    return b64(saved) === b64(identityKey);
  }
  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer): Promise<boolean> {
    // store under the NAME half of `<peer>.<device>` — see isTrustedIdentity
    const name = encodedAddress.split(".")[0] || encodedAddress;
    await this.kvPut("identities", name, publicKey);
    return true;
  }
  /** Migration shim: forget a pinned identity so a device that legitimately
   * regenerated (e.g. the one-time UUID→numeric device-id migration) can
   * re-establish sessions instead of deadlocking on "Identity key changed". */
  async removeIdentity(name: string): Promise<void> {
    const store = await this.tx("identities", "readwrite");
    store.delete(name);
  }

  // ---------- sessions (serialized Double Ratchet state) ----------

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    await this.kvPut("sessions", encodedAddress, record);
  }
  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return this.kvGet<SessionRecordType>("sessions", encodedAddress);
  }
  async sessionAddressList(): Promise<string[]> {
    const store = await this.tx("sessions", "readonly");
    return req2promise<string[]>(store.getAllKeys());
  }

  // ---------- signed prekey ----------

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.kvPut("signedPreKeys", String(keyId), keyPair);
  }
  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return this.kvGet<KeyPairType>("signedPreKeys", String(keyId));
  }
  async removeSignedPreKey(keyId: number | string): Promise<void> {
    const store = await this.tx("signedPreKeys", "readwrite");
    store.delete(String(keyId));
  }
  async hasSignedPreKey(keyId: number | string): Promise<boolean> {
    return !!(await this.kvGet("signedPreKeys", String(keyId)));
  }

  // V1 uses the signed prekey for X3DH (no one-time prekeys yet — see the
  // report). The protocol API requires these; they simply never match.
  async loadPreKey(_encodedAddress: string | number): Promise<KeyPairType | undefined> {
    return undefined;
  }
  async storePreKey(_keyId: number | string, _keyPair: KeyPairType): Promise<void> {
    /* no one-time prekeys in V1 */
  }
  async removePreKey(_keyId: number | string): Promise<void> {
    /* no one-time prekeys in V1 */
  }

  /** Hard wipe for logout / account switch. */
  async destroy(): Promise<void> {
    const db = await this.db;
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }

  /** Clear every store but keep the database handle (device-identity reset). */
  async wipeAll(): Promise<void> {
    const db = await this.db;
    await Promise.all(
      [...db.objectStoreNames].map(
        (name) =>
          new Promise<void>((resolve) => {
            const tx = db.transaction(name, "readwrite");
            tx.objectStore(name).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          })
      )
    );
  }
}
