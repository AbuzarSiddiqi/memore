// Dev-only smoke test of the Signal protocol usage pattern from
// lib/crypto/engine.ts (X3DH session build + Double Ratchet roundtrip).
// Run: node scripts/test-e2ee-roundtrip.mjs
import lib from "@privacyresearch/libsignal-protocol-typescript";
import { webcrypto } from "node:crypto";
lib.setWebCrypto(webcrypto);

const te = (s) => new TextEncoder().encode(s).buffer;
const td = (b) => new TextDecoder().decode(b);
// mirror the engine's wire encoding: lib bodies are binary strings, wire is base64
const toWire = (msg) => ({ type: msg.type, body: Buffer.from(msg.body, "binary").toString("base64") });
const fromWire = (b64) => Buffer.from(b64, "base64").toString("binary");

function mkStore(id) {
  return {
    id,
    identity: null,
    sessions: new Map(),
    identities: new Map(),
    signed: new Map(),
    async getIdentityKeyPair() { return this.identity ?? undefined; },
    async getLocalRegistrationId() { return this.regId ?? undefined; },
    async isTrustedIdentity(identifier, key) {
      const saved = this.identities.get(identifier);
      return !saved || Buffer.compare(Buffer.from(saved), Buffer.from(key)) === 0;
    },
    async saveIdentity(addr, key) { this.identities.set(addr, key); return true; },
    async loadPreKey() { return undefined; },
    async storePreKey() {}, async removePreKey() {},
    async storeSession(addr, rec) { this.sessions.set(addr, rec); },
    async loadSession(addr) { return this.sessions.get(addr); },
    async loadSignedPreKey(keyId) { return this.signed.get(String(keyId)); },
    async storeSignedPreKey(keyId, kp) { this.signed.set(String(keyId), kp); },
    async removeSignedPreKey() {},
  };
}

// decrypt exactly the way lib/crypto/engine.ts does: by the envelope's own type
async function decryptEnvelopes(cipher, envelopes) {
  const out = [];
  for (const env of envelopes) {
    const body = fromWire(env.body);
    const bytes = env.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(body, "binary")
      : await cipher.decryptWhisperMessage(body, "binary");
    out.push(td(bytes));
  }
  return out;
}

const alice = mkStore("alice");
const bob = mkStore("bob");

// Both devices bootstrap their identities (engine.bootstrap() does this in-app)
alice.identity = await lib.KeyHelper.generateIdentityKeyPair();
alice.regId = 1111;
const bobIK = await lib.KeyHelper.generateIdentityKeyPair();
const bobSPK = await lib.KeyHelper.generateSignedPreKey(bobIK, 1);
await bob.storeSignedPreKey(1, bobSPK.keyPair);
bob.identity = bobIK;
bob.regId = 4242;

// Alice builds the session from Bob's PUBLIC bundle (X3DH, signed-prekey variant)
const builder = new lib.SessionBuilder(alice, new lib.SignalProtocolAddress("bob", 1));
await builder.processPreKey({
  identityKey: bobIK.pubKey,
  registrationId: 4242,
  signedPreKey: { keyId: 1, publicKey: bobSPK.keyPair.pubKey, signature: bobSPK.signature },
});
const aCipher = new lib.SessionCipher(alice, new lib.SignalProtocolAddress("bob", 1));
const bCipher = new lib.SessionCipher(bob, new lib.SignalProtocolAddress("alice", 1));

// 1. First message arrives as a prekey envelope; Bob decrypts it
const m1 = toWire(await aCipher.encrypt(te(JSON.stringify({ v: 1, text: "hello bro, this is secret" }))));
console.log("m1 type:", m1.type, "wire bytes:", Buffer.from(m1.body, "base64").length);
const [p1] = await decryptEnvelopes(bCipher, [m1]);
console.log("bob decrypted #1:", p1);

// 2. Before Bob replies, Alice's messages STILL carry the prekey header —
//    decrypt them through the same path (idempotent prekey processing).
const m2 = toWire(await aCipher.encrypt(te(JSON.stringify({ v: 1, text: "second" }))));
const [p2] = await decryptEnvelopes(bCipher, [m2]);
console.log("bob decrypted #2:", p2);

// 3. Bob replies — Alice is now on the normal ratchet (whisper messages)
const m3 = toWire(await bCipher.encrypt(te(JSON.stringify({ v: 1, text: "reply from bob" }))));
const [p3] = await decryptEnvelopes(aCipher, [m3]);
console.log("alice decrypted #3:", p3);

const m4 = toWire(await aCipher.encrypt(te(JSON.stringify({ v: 1, text: "after ratchet roundtrip" }))));
console.log("m4 type (should be 1):", m4.type);
const [p4] = await decryptEnvelopes(bCipher, [m4]);
console.log("bob decrypted #4:", p4);

// 4. Out-of-order delivery: three messages decrypted in reverse
const batch = [];
for (let i = 0; i < 3; i++) batch.push(toWire(await aCipher.encrypt(te(JSON.stringify({ v: 1, text: `oo-${i}` })))));
const reversed = (await decryptEnvelopes(bCipher, [...batch].reverse())).reverse();
console.log("out-of-order:", reversed.join(","));

const textOf = (s) => { try { return JSON.parse(s).text ?? ""; } catch { return ""; } };
if (textOf(p1) !== "hello bro, this is secret" || textOf(p2) !== "second" ||
    textOf(p3) !== "reply from bob" || textOf(p4) !== "after ratchet roundtrip" ||
    reversed.map(textOf).join(",") !== "oo-0,oo-1,oo-2") {
  console.error("E2EE roundtrip: FAIL");
  process.exit(1);
}
console.log("E2EE roundtrip: PASS");
