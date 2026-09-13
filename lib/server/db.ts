// Server-side persistent store. Multi-device cloud sync via Supabase PostgreSQL & Storage,
// backed by in-memory caching and debounced atomic writes.
import fs from "fs";
import path from "path";
import { seedWorld, emptyWorld } from "./seed";
import { persistSnapshotToSupabase, hydrateFromSupabase, CREATOR_UUID_MAP } from "./sync";
import type { DB } from "../types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export const uploadsDir = UPLOADS_DIR;

let state: DB | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export let cloudHydrationPromise: Promise<void> | null = null;

export function dataDirReady() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {
    // Ignore in read-only serverless filesystems
  }
}

/** Normalize all legacy usernames/prefixes to canonical Supabase UUIDs */
function normalizeDbUuids(d: DB) {
  for (const u of d.users) {
    if (CREATOR_UUID_MAP[u.id]) {
      const oldId = u.id;
      u.id = CREATOR_UUID_MAP[oldId];
      // update all references in state
      for (const m of d.memes) if (m.creator_id === oldId) m.creator_id = u.id;
      for (const h of d.holdings) if (h.user_id === oldId) h.user_id = u.id;
      for (const t of d.transactions) if (t.user_id === oldId) t.user_id = u.id;
      for (const c of d.comments) if (c.user_id === oldId) c.user_id = u.id;
      for (const s of d.sessions) if (s.user_id === oldId) s.user_id = u.id;
      for (const cl of d.calls) if (cl.user_id === oldId) cl.user_id = u.id;
      for (const n of d.notifications) if (n.user_id === oldId) n.user_id = u.id;
    }
  }
}

export function resetToEmpty(): DB {
  dataDirReady();
  state = emptyWorld();
  normalizeDbUuids(state);
  persistNow();
  return state;
}

export function db(): DB {
  if (state) return state;
  dataDirReady();
  if (fs.existsSync(DB_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as DB;
      if (state) normalizeDbUuids(state);
      triggerBackgroundCloudSync();
      return state!;
    } catch {
      // corrupted file — reset rather than crash
    }
  }
  // Baseline demo world so cold-starts on Vercel are rich and active
  state = seedWorld();
  normalizeDbUuids(state);
  triggerBackgroundCloudSync();
  persistNow();
  return state;
}

export function triggerBackgroundCloudSync(): Promise<void> {
  if (cloudHydrationPromise) return cloudHydrationPromise;
  cloudHydrationPromise = (async () => {
    try {
      const cloudDb = await hydrateFromSupabase();
      if (cloudDb && cloudDb.memes?.length) {
        if (state) {
          const existingMemeIds = new Set(state.memes.map((m) => m.id));
          const newMemes = cloudDb.memes.filter((m) => !existingMemeIds.has(m.id));
          state.memes.unshift(...newMemes);

          const existingUserIds = new Set(state.users.map((u) => u.id));
          for (const cu of cloudDb.users) {
            if (!existingUserIds.has(cu.id)) state.users.push(cu);
          }
        }
      }
    } catch (err) {
      console.warn("Background cloud hydration warning:", err);
    }
  })();
  return cloudHydrationPromise;
}

export async function ensureHydrated(): Promise<DB> {
  const current = db();
  if (cloudHydrationPromise) {
    try { await cloudHydrationPromise; } catch {}
  }
  return current;
}

export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 400);
}

export function persistNow() {
  if (!state) return;
  dataDirReady();
  try {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    // Read-only filesystem in serverless environments
  }
  
  // Persist cloud snapshot to Supabase Storage
  void persistSnapshotToSupabase(state);

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function uid(): string {
  return crypto.randomUUID();
}

