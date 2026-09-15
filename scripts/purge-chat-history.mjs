#!/usr/bin/env node
// One-time chat-history purge: makes MEMORE's chat a clean slate.
//   • Postgres: deletes ALL conversations, participants, messages, reactions
//     (chat_devices is KEPT — those are registered public keys, not history;
//     deleting them would orphan already-registered devices)
//   • Supabase Storage: deletes the legacy plaintext chats_v2.json and strips
//     chat arrays from the cloud_db.json snapshot
//   • Local .data/db.json: strips chat arrays
// Run: node scripts/purge-chat-history.mjs
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const envFile = fs.existsSync(path.join(ROOT, ".env.local"))
  ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  : "";
function env(name) {
  if (process.env[name]) return process.env[name];
  const m = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !KEY) { console.error("Missing Supabase credentials."); process.exit(1); }
const admin = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. Postgres — all chat history (order matters: reactions → messages →
//    participants → conversations; children first)
const purges = [
  ["message_reactions", "id"],
  ["chat_messages", "id"],
  ["conversation_participants", "conversation_id"],
  ["conversations", "id"],
];
for (const [table, pk] of purges) {
  const { error, count } = await admin.from(table).delete().neq(pk, "00000000-0000-0000-0000-000000000000").select("id", { count: "exact" });
  console.log(`${table}: deleted ${count ?? 0} rows`, error?.message ?? "");
}

// 2. Storage — legacy plaintext blob + chat arrays in the cloud snapshot
const { error: rmErr } = await admin.storage.from("system").remove(["chats_v2.json"]);
console.log(rmErr ? `chats_v2.json: ${rmErr.message}` : "chats_v2.json: deleted");

try {
  const { data } = await admin.storage.from("system").download("cloud_db.json");
  if (data) {
    const snap = JSON.parse(await data.text());
    const had = (snap.chats?.length ?? 0) + (snap.chat_messages?.length ?? 0);
    delete snap.chats; delete snap.chat_messages; delete snap.message_reactions;
    await admin.storage.from("system").upload("cloud_db.json", Buffer.from(JSON.stringify(snap)), {
      contentType: "application/json", upsert: true,
    });
    console.log(`cloud_db.json: stripped ${had} legacy chat rows`);
  } else {
    console.log("cloud_db.json: not found (nothing to strip)");
  }
} catch (e) {
  console.log("cloud_db.json: not found (nothing to strip)");
}

// 3. Local JSON store — strip chat arrays
const localFile = path.join(ROOT, ".data", "db.json");
if (fs.existsSync(localFile)) {
  try {
    const local = JSON.parse(fs.readFileSync(localFile, "utf8"));
    const had = (local.chats?.length ?? 0) + (local.chat_messages?.length ?? 0) + (local.message_reactions?.length ?? 0);
    delete local.chats; delete local.chat_messages; delete local.message_reactions;
    fs.writeFileSync(localFile, JSON.stringify(local));
    console.log(`local db.json: stripped ${had} legacy chat rows`);
  } catch (e) {
    console.log(`local db.json: ${e.message}`);
  }
}
console.log("Purge complete.");
