// Server-side persistent store. Multi-device cloud sync via Supabase PostgreSQL & Storage,
// backed by in-memory caching and debounced atomic writes.
import fs from "fs";
import path from "path";
import { seedWorld, emptyWorld } from "./seed";
import { persistSnapshotToSupabase, hydrateFromSupabase, CREATOR_UUID_MAP, toCanonicalUuid } from "./sync";
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
export function normalizeDbUuids(d: DB) {
  for (const u of d.users) {
    const canon = toCanonicalUuid(u.id);
    if (canon !== u.id) {
      const oldId = u.id;
      u.id = canon;
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
  if (d.chats) {
    for (const c of d.chats) {
      c.participants = [toCanonicalUuid(c.participants[0]), toCanonicalUuid(c.participants[1])] as [string, string];
      if (c.reads) {
        const nr: Record<string, string> = {};
        for (const [k, v] of Object.entries(c.reads)) nr[toCanonicalUuid(k)] = v;
        c.reads = nr;
      }
      if (c.muted) {
        const nm: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(c.muted)) nm[toCanonicalUuid(k)] = v;
        c.muted = nm;
      }
    }
  }
  if (d.chat_messages) {
    for (const m of d.chat_messages) {
      m.sender_id = toCanonicalUuid(m.sender_id);
    }
  }
  if (d.message_reactions) {
    for (const r of d.message_reactions) {
      r.user_id = toCanonicalUuid(r.user_id);
    }
  }
  if (d.follows) {
    for (const f of d.follows) {
      f.follower_id = toCanonicalUuid(f.follower_id);
      f.following_id = toCanonicalUuid(f.following_id);
    }
  }
  if (d.saved_memes) {
    for (const sm of d.saved_memes) {
      sm.user_id = toCanonicalUuid(sm.user_id);
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
  // Clean start — real memes hydrate directly from Supabase PostgreSQL
  state = emptyWorld();
  normalizeDbUuids(state);
  triggerBackgroundCloudSync();
  return state;
}

let lastCloudSyncAt = 0;
let inFlightSync: Promise<DB> | null = null;

export function triggerBackgroundCloudSync(): Promise<void> {
  return ensureHydrated().then(() => {});
}

export async function ensureHydrated(force = false): Promise<DB> {
  const current = db();
  const now = Date.now();
  if (!force && lastCloudSyncAt > 0 && now - lastCloudSyncAt < 8000) {
    return current;
  }

  // If memory already has live memes and this is not a forced sync, run sync in background without stalling HTTP requests!
  if (!force && current.memes.length > 0 && lastCloudSyncAt > 0) {
    if (!inFlightSync) {
      inFlightSync = (async () => {
        try {
          const cloudDb = await hydrateFromSupabase();
          if (cloudDb && state) {
            mergeCloudDbIntoState(state, cloudDb);
            lastCloudSyncAt = Date.now();
            save();
          }
        } catch (err) {
          console.warn("Background cloud sync warning:", err);
        } finally {
          inFlightSync = null;
        }
        return current;
      })();
    }
    return current;
  }

  if (inFlightSync) {
    try { await inFlightSync; } catch {}
    return current;
  }

  inFlightSync = (async () => {
    try {
      const cloudDb = await hydrateFromSupabase();
      if (cloudDb && state) {
        mergeCloudDbIntoState(state, cloudDb);
        lastCloudSyncAt = Date.now();
        save();
      }
    } catch (err) {
      console.warn("ensureHydrated cloud sync warning:", err);
    } finally {
      inFlightSync = null;
    }
    return current;
  })();

  try { await inFlightSync; } catch {}
  return current;
}

function mergeCloudDbIntoState(s: DB, cloudDb: DB) {
  // Authoritative memes directly from Supabase PostgreSQL (ordered newest first).
  // Text memes may exist only in the local store / Storage snapshot (table schema
  // dependent) — never drop them during a cloud merge.
  const cloudIds = new Set(cloudDb.memes.map((m) => m.id));
  const localTextMemes = s.memes.filter((m) => m.media_type === "text" && !cloudIds.has(m.id));
  s.memes = [...localTextMemes, ...cloudDb.memes].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Merge users/profiles
  for (const cu of cloudDb.users) {
    const idx = s.users.findIndex((u) => u.id === cu.id);
    if (idx >= 0) {
      const wasOnboarded = !!s.users[idx].onboarded || !!cu.onboarded;
      s.users[idx] = { ...s.users[idx], ...cu, onboarded: wasOnboarded };
    } else {
      s.users.push(cu);
    }
  }

  if (cloudDb.holdings?.length) s.holdings = cloudDb.holdings;
  if (cloudDb.transactions?.length) s.transactions = cloudDb.transactions;
  if (cloudDb.comments?.length) s.comments = cloudDb.comments;

  // Merge follows (authoritative from Supabase)
  if (cloudDb.follows) {
    const followMap = new Map<string, typeof s.follows[0]>();
    for (const f of s.follows || []) {
      followMap.set(`${toCanonicalUuid(f.follower_id)}:${toCanonicalUuid(f.following_id)}`, f);
    }
    for (const f of cloudDb.follows) {
      followMap.set(`${toCanonicalUuid(f.follower_id)}:${toCanonicalUuid(f.following_id)}`, f);
    }
    s.follows = Array.from(followMap.values());
  }

  // Merge saved_memes (authoritative from Supabase)
  if (cloudDb.saved_memes) {
    const saveMap = new Map<string, typeof s.saved_memes[0]>();
    for (const sm of s.saved_memes || []) {
      saveMap.set(`${toCanonicalUuid(sm.user_id)}:${sm.meme_id}`, sm);
    }
    for (const sm of cloudDb.saved_memes) {
      saveMap.set(`${toCanonicalUuid(sm.user_id)}:${sm.meme_id}`, sm);
    }
    s.saved_memes = Array.from(saveMap.values());
  }

  // Merge notifications
  if (cloudDb.notifications) {
    const notifMap = new Map<string, typeof s.notifications[0]>();
    for (const n of s.notifications || []) notifMap.set(n.id, n);
    for (const n of cloudDb.notifications) notifMap.set(n.id, n);
    s.notifications = Array.from(notifMap.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 500);
  }

  // Merge calls
  if (cloudDb.calls) {
    const callMap = new Map<string, typeof s.calls[0]>();
    for (const c of s.calls || []) callMap.set(c.id, c);
    for (const c of cloudDb.calls) callMap.set(c.id, c);
    s.calls = Array.from(callMap.values());
  }

  normalizeDbUuids(s);
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

