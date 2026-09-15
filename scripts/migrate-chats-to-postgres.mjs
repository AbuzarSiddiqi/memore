#!/usr/bin/env node
// One-time import of EXISTING chat contacts into the Postgres chat store
// (database/migration_v6_e2ee_chat.sql must be applied first).
//
// IMPORTANT: this script deliberately does NOT migrate message CONTENT.
// Legacy messages are plaintext; storing plaintext server-side is exactly
// what the E2EE migration removes. Imported conversations start empty —
// their (≤24h old) messages simply expire and are gone forever.
//
// Usage:  node scripts/migrate-chats-to-postgres.mjs
// Needs:  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.local)
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(process.cwd());
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
if (!URL_ || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Local JSON store is the fallback source; chats also lived in the cloud
// snapshot (system/CLOUD_STATE_FILE = db snapshot). Prefer the cloud copy.
const CLOUD_FILE = "cloud_db.json";
async function loadState() {
  const candidates = [path.join(ROOT, ".data", "db.json")];
  let local = null;
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      try { local = JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* skip */ }
    }
  }
  try {
    const { data } = await admin.storage.from("system").download(CLOUD_FILE);
    if (data) {
      const cloud = JSON.parse(await data.text());
      if (cloud?.chats?.length) return cloud;
    }
  } catch { /* no cloud snapshot — local only */ }
  return local;
}

const state = await loadState();
if (!state?.chats?.length) {
  console.log("No legacy conversations found. Nothing to import.");
  process.exit(0);
}

// Profiles that exist in Postgres:
const { data: profiles } = await admin.from("profiles").select("id");
const known = new Set((profiles ?? []).map((p) => p.id));

let convs = 0, parts = 0, skippedMsgs = 0;
for (const chat of state.chats) {
  const participants = (chat.participants ?? []).filter((p) => known.has(p));
  if (participants.length !== 2) { skippedMsgs += (state.chat_messages ?? []).filter((m) => m.conversation_id === chat.id).length; continue; }
  const { error } = await admin.from("conversations").upsert({
    id: chat.id,
    created_at: chat.created_at ?? new Date().toISOString(),
    updated_at: chat.updated_at ?? chat.created_at ?? new Date().toISOString(),
    temp_chat: !!chat.temp_chat,
  }, { onConflict: "id" });
  if (error) { console.warn("conversation skip:", chat.id, error.message); continue; }
  convs++;
  for (const userId of participants) {
    const lastRead = chat.reads?.[userId] ?? "1970-01-01T00:00:00Z";
    const muted = !!chat.muted?.[userId];
    const { error: perr } = await admin.from("conversation_participants").upsert({
      conversation_id: chat.id, user_id: userId, last_read_at: lastRead, muted,
    }, { onConflict: "conversation_id,user_id" });
    if (!perr) parts++;
  }
  // plaintext content is counted and deliberately dropped
  skippedMsgs += (state.chat_messages ?? []).filter((m) => m.conversation_id === chat.id).length;
}

console.log(`Imported ${convs} conversations / ${parts} participant rows.`);
console.log(`Dropped ${skippedMsgs} legacy PLAINTEXT messages (never re-stored server-side — E2EE starts fresh).`);

// ---- plaintext cleanup -----------------------------------------------------
// 1. The old chats_v2.json blob in Storage holds plaintext messages and is
//    orphaned after the cutover — delete it.
try {
  const { error } = await admin.storage.from("system").remove(["chats_v2.json"]);
  console.log(error ? `Could not delete chats_v2.json: ${error.message}` : "Deleted legacy chats_v2.json from Storage.");
} catch { /* bucket/object may not exist */ }

// 2. Strip legacy chat arrays from the local JSON store so no plaintext
//    message content remains in any active persistence path.
const localFile = path.join(ROOT, ".data", "db.json");
if (fs.existsSync(localFile)) {
  try {
    const local = JSON.parse(fs.readFileSync(localFile, "utf8"));
    const had = (local.chats?.length ?? 0) + (local.chat_messages?.length ?? 0);
    delete local.chats; delete local.chat_messages; delete local.message_reactions;
    fs.writeFileSync(localFile, JSON.stringify(local));
    console.log(`Stripped ${had} legacy plaintext chat rows from the local store.`);
  } catch { /* non-fatal */ }
}
