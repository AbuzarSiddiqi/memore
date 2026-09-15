// Full ENGINE-to-ENGINE integration test: runs the real lib/crypto/engine.ts
// (compiled to CJS in .test-engine/) for two "devices" in one Node process —
// IndexedDB via fake-indexeddb, window.crypto via node webcrypto, and an
// in-memory /api/chat/keys server.
// Covers: bootstrap + registration, numeric device ids, X3DH session build,
// prekey-envelope streak, Double Ratchet continuation, identity re-pin after
// a peer device migration, and UUID→numeric device-id migration.
// Run: node scripts/test-engine-integration.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { webcrypto } from "node:crypto";

execSync(
  "npx tsc lib/crypto/engine.ts lib/crypto/store.ts --outDir .test-engine --module commonjs --target es2022 --esModuleInterop --skipLibCheck",
  { stdio: "inherit", cwd: process.cwd() }
);

const require2 = createRequire(import.meta.url);
require2("fake-indexeddb/auto");
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
globalThis.window = { crypto: webcrypto };

const { getEngine, encryptMessagePayload, decryptFromSender } = require2("../.test-engine/engine.js");
const { IndexedDbProtocolStore } = require2("../.test-engine/store.js");

// ---- in-memory key server (mimics /api/chat/keys) ----
const bundles = new Map(); // userId -> public bundle
async function keyServer(url, opts = {}) {
  const u = new URL(url, "http://local");
  if (u.pathname !== "/api/chat/keys") throw new Error("unexpected fetch " + url);
  if (opts.method === "POST") {
    // handled per-engine via withOwner() below; here: reject loudly
    throw new Error("unscoped key registration");
  }
  const peer = u.searchParams.get("user");
  return { ok: true, json: async () => ({ device: bundles.get(peer) ?? null }) };
}
globalThis.fetch = (url, opts) => keyServer(url, opts);

// Boot one engine per user; while an engine registers, scope POSTs to it.
async function bootEngine(userId) {
  const engine = getEngine(userId);
  globalThis.fetch = async (url, opts = {}) => {
    if (opts.method === "POST") {
      const b = JSON.parse(opts.body);
      bundles.set(userId, {
        device_id: b.device_id,
        registration_id: b.registration_id,
        identity_key: b.identity_key,
        signed_prekey_id: b.signed_prekey_id,
        signed_prekey_public: b.signed_prekey_public,
        signed_prekey_signature: b.signed_prekey_signature,
      });
      return { ok: true, json: async () => ({ registered: true }) };
    }
    return keyServer(url, opts);
  };
  await engine.ready();
  globalThis.fetch = (url, opts) => keyServer(url, opts);
  const d = bundles.get(userId).device_id;
  if (!/^\d+$/.test(d)) throw new Error(`device id not numeric: ${d}`);
  console.log(`registered ${userId.slice(0, 6)}… → device ${d}`);
  return engine;
}

const UA = "11111111-1111-1111-1111-111111111111"; // user A
const UB = "22222222-2222-2222-2222-222222222222"; // user B
await bootEngine(UA);
await bootEngine(UB);

// A → B: three messages before B replies (prekey-envelope streak)
for (let i = 0; i < 3; i++) {
  const wire = await encryptMessagePayload(UA, UB, { v: 1, text: `msg-${i}` });
  const got = await decryptFromSender(UB, `id-b${i}`, UA, wire);
  if (got?.text !== `msg-${i}`) throw new Error(`B decrypt failed on ${i}`);
  console.log(`B decrypted #${i}:`, got.text);
}

// B replies → A on the normal ratchet now
const reply = await encryptMessagePayload(UB, UA, { v: 1, text: "reply" });
const gotReply = await decryptFromSender(UA, "id-a1", UB, reply);
if (gotReply?.text !== "reply") throw new Error("A decrypt of reply failed");
console.log("A decrypted reply:", gotReply.text);

const post = await encryptMessagePayload(UA, UB, { v: 1, text: "post-ratchet" });
const got2 = await decryptFromSender(UB, "id-b9", UA, post);
if (got2?.text !== "post-ratchet") throw new Error("B post-ratchet decrypt failed");
console.log("B decrypted post-ratchet:", got2.text);

// Simulate a page reload: brand-new engine module state but the SAME
// IndexedDB. B sends a NEW message (replaying an already-decrypted envelope
// is correctly refused — Double Ratchet message keys are one-time).
const reply2 = await encryptMessagePayload(UB, UA, { v: 1, text: "post-reload" });
delete require2.cache[require2.resolve("../.test-engine/engine.js")];
const freshMod = require2("../.test-engine/engine.js");
const gotFresh = await freshMod.decryptFromSender(UA, "id-fresh", UB, reply2);
if (gotFresh?.text !== "post-reload") throw new Error("post-reload decrypt failed");
console.log("post-reload decrypt:", gotFresh.text);

// UUID→numeric device migration: seed a legacy UUID identity, bootstrap must
// wipe and regenerate a numeric device.
const legacy = new IndexedDbProtocolStore(UA);
const kp = await legacy.getIdentityKeyPair();
await legacy.persistIdentity(kp ?? { pubKey: new ArrayBuffer(32), privKey: new ArrayBuffer(32) }, 1, "legacy-uuid-device");
await bootEngine(UA); // re-register after migration (new identity)
const migratedId = bundles.get(UA).device_id;
if (!/^\d+$/.test(migratedId)) throw new Error(`migration failed, device id still ${migratedId}`);
console.log("UUID→numeric migration OK → device", migratedId);

// A's new identity means B must re-pin and re-establish (identity shim):
const afterMigration = await encryptMessagePayload(UA, UB, { v: 1, text: "after-migration" });
const got3 = await decryptFromSender(UB, "id-b10", UA, afterMigration);
if (got3?.text !== "after-migration") throw new Error("post-migration decrypt failed");
console.log("B decrypted after A's device migration:", got3.text);

console.log("ENGINE INTEGRATION: PASS");
process.exit(0);
