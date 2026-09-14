"use client";
// MEMORE Client Cache Engine — IndexedDB persistent storage, in-memory hot cache,
// in-flight request deduplication, stale-while-revalidate, and 24-hour chat expiration purge.

const DB_NAME = "memore_cache_v1";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

// ---------------------------------------------------------------- IndexedDB connection
export function openClientDb(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        // Feed tab cache
        if (!db.objectStoreNames.contains("feed")) {
          db.createObjectStore("feed", { keyPath: "tab" });
        }
        // Meme detail cache
        if (!db.objectStoreNames.contains("memes")) {
          db.createObjectStore("memes", { keyPath: "id" });
        }
        // Profiles cache
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "username" });
        }
        // Chats list cache
        if (!db.objectStoreNames.contains("chats")) {
          const s = db.createObjectStore("chats", { keyPath: "id" });
          s.createIndex("userId", "userId", { unique: false });
        }
        // Chat messages cache
        if (!db.objectStoreNames.contains("messages")) {
          const s = db.createObjectStore("messages", { keyPath: "id" });
          s.createIndex("conversation_id", "conversation_id", { unique: false });
          s.createIndex("created_at", "created_at", { unique: false });
        }
        // Notifications cache
        if (!db.objectStoreNames.contains("notifications")) {
          db.createObjectStore("notifications", { keyPath: "userId" });
        }
        // Generic key-value store (for search, settings, etc.)
        if (!db.objectStoreNames.contains("generic")) {
          db.createObjectStore("generic", { keyPath: "key" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[Cache] IndexedDB open error:", req.error);
        resolve(null);
      };
      req.onblocked = () => {
        console.warn("[Cache] IndexedDB blocked");
        resolve(null);
      };
    } catch (err) {
      console.warn("[Cache] Failed to initialize IndexedDB:", err);
      resolve(null);
    }
  });

  return dbPromise;
}

// ---------------------------------------------------------------- In-Memory Hot Store
const memStore = new Map<string, { data: any; timestamp: number }>();

export function getMemoryCache<T>(key: string, maxAgeMs = Infinity): T | null {
  const item = memStore.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAgeMs) {
    memStore.delete(key);
    return null;
  }
  return item.data as T;
}

export function setMemoryCache<T>(key: string, data: T): void {
  memStore.set(key, { data, timestamp: Date.now() });
}

export function deleteMemoryCache(key: string): void {
  memStore.delete(key);
}

export function getMemoryCacheAge(key: string): number | null {
  const item = memStore.get(key);
  if (!item) return null;
  return Date.now() - item.timestamp;
}

// ---------------------------------------------------------------- In-Flight Request Deduplication
const inFlight = new Map<string, Promise<any>>();

export function dedupRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fetcher()
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, p);
  return p;
}

// ---------------------------------------------------------------- Cross-Tab BroadcastChannel
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    syncChannel = new BroadcastChannel("memore_sync");
    syncChannel.onmessage = (event) => {
      handleCrossTabMessage(event.data);
    };
  } catch {}
}

type CrossTabEvent =
  | { type: "CHAT_EXPIRED"; conversationId: string }
  | { type: "LOGOUT"; userId: string }
  | { type: "POST_MUTATED"; memeId: string; patch: any }
  | { type: "CACHE_INVALIDATED"; prefix: string };

function broadcastSync(event: CrossTabEvent): void {
  try {
    if (syncChannel) syncChannel.postMessage(event);
  } catch {}
}

function handleCrossTabMessage(event: CrossTabEvent): void {
  if (!event || !event.type) return;
  if (event.type === "CHAT_EXPIRED") {
    void purgeExpiredChatLocal(event.conversationId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("memore:chat-expired", { detail: { id: event.conversationId } }));
    }
  } else if (event.type === "LOGOUT") {
    void purgeUserPrivateCache(event.userId);
  } else if (event.type === "POST_MUTATED") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("memore:post-mutated", { detail: event }));
    }
  }
}

// ---------------------------------------------------------------- Feed Cache Operations
export async function getCachedFeed(tab: string): Promise<any[] | null> {
  // Hot memory first (0ms)
  const mem = getMemoryCache<any[]>(`feed:${tab}`, 60_000);
  if (mem && mem.length > 0) return mem;

  const db = await openClientDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("feed", "readonly");
      const store = tx.objectStore("feed");
      const req = store.get(tab);
      req.onsuccess = () => {
        const row = req.result;
        if (row && Array.isArray(row.memes) && row.memes.length > 0) {
          setMemoryCache(`feed:${tab}`, row.memes);
          resolve(row.memes);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedFeed(tab: string, memes: any[]): Promise<void> {
  setMemoryCache(`feed:${tab}`, memes);

  // Seed individual meme detail cache from feed posts
  for (const m of memes) {
    if (m && m.id) setMemoryCache(`meme:${m.id}`, m);
  }

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction(["feed", "memes"], "readwrite");
    const feedStore = tx.objectStore("feed");
    const memeStore = tx.objectStore("memes");

    feedStore.put({ tab, memes: memes.slice(0, 100), timestamp: Date.now() });

    for (const m of memes.slice(0, 50)) {
      if (m && m.id) {
        memeStore.put({ id: m.id, data: m, timestamp: Date.now() });
      }
    }
  } catch (err) {
    console.warn("[Cache] setCachedFeed error:", err);
  }
}

// ---------------------------------------------------------------- Meme Detail Cache
export async function getCachedMeme(id: string): Promise<any | null> {
  const mem = getMemoryCache<any>(`meme:${id}`, 120_000);
  if (mem) return mem;

  const db = await openClientDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("memes", "readonly");
      const store = tx.objectStore("memes");
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result?.data) {
          setMemoryCache(`meme:${id}`, req.result.data);
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedMeme(id: string, data: any): Promise<void> {
  setMemoryCache(`meme:${id}`, data);
  const db = await openClientDb();
  if (!db) return;
  try {
    const tx = db.transaction("memes", "readwrite");
    tx.objectStore("memes").put({ id, data, timestamp: Date.now() });
  } catch {}
}

// ---------------------------------------------------------------- Chat List Cache
export async function getCachedChats(userId?: string): Promise<any[] | null> {
  const memKey = userId ? `chats:${userId}` : "chats:all";
  const mem = getMemoryCache<any[]>(memKey, 15_000);
  if (mem) return mem;

  const db = await openClientDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("chats", "readonly");
      const store = tx.objectStore("chats");
      const req = store.getAll();
      req.onsuccess = () => {
        const now = Date.now();
        const rows = (req.result || [])
          .filter((r: any) => {
            // Check 24-hour expiration
            if (r.expires_at && new Date(r.expires_at).getTime() <= now) return false;
            if (userId && r.userId && r.userId !== userId) return false;
            return true;
          })
          .map((r: any) => r.data)
          .sort((a: any, b: any) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));

        if (rows.length > 0) {
          setMemoryCache(memKey, rows);
          resolve(rows);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedChats(userId: string, chats: any[]): Promise<void> {
  const memKey = `chats:${userId}`;
  const now = Date.now();
  const validChats = chats.filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now);
  setMemoryCache(memKey, validChats);

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction("chats", "readwrite");
    const store = tx.objectStore("chats");
    for (const c of validChats) {
      store.put({ id: c.id, data: c, userId, expires_at: c.expires_at, timestamp: now });
    }
  } catch {}
}

// ---------------------------------------------------------------- Chat Messages Cache & Cursor
export async function getCachedMessages(conversationId: string): Promise<any[]> {
  const mem = getMemoryCache<any[]>(`messages:${conversationId}`);
  if (mem && mem.length > 0) return mem;

  const db = await openClientDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const idx = store.index("conversation_id");
      const req = idx.getAll(conversationId);
      req.onsuccess = () => {
        const rows = (req.result || [])
          .map((r: any) => r.data)
          .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
        if (rows.length > 0) {
          setMemoryCache(`messages:${conversationId}`, rows);
        }
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function appendCachedMessages(conversationId: string, newMessages: any[], expiresAt?: string): Promise<any[]> {
  if (!newMessages || newMessages.length === 0) {
    return getCachedMessages(conversationId);
  }

  const current = await getCachedMessages(conversationId);
  const byId = new Map<string, any>(current.map((m) => [m.id, m]));

  for (const m of newMessages) {
    byId.set(m.id, m);
  }

  const merged = Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  setMemoryCache(`messages:${conversationId}`, merged);

  const db = await openClientDb();
  if (db) {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      for (const m of newMessages) {
        store.put({
          id: m.id,
          conversation_id: conversationId,
          data: m,
          created_at: m.created_at,
          expires_at: expiresAt,
        });
      }
    } catch (err) {
      console.warn("[Cache] appendCachedMessages error:", err);
    }
  }

  return merged;
}

export async function removeCachedMessage(conversationId: string, messageId: string): Promise<void> {
  const mem = getMemoryCache<any[]>(`messages:${conversationId}`);
  if (mem) {
    setMemoryCache(`messages:${conversationId}`, mem.filter((m) => m.id !== messageId));
  }
  const db = await openClientDb();
  if (db) {
    try {
      const tx = db.transaction("messages", "readwrite");
      tx.objectStore("messages").delete(messageId);
    } catch {}
  }
}

export async function updateCachedMessageReactions(conversationId: string, messageId: string, reactions: any[]): Promise<void> {
  const mem = getMemoryCache<any[]>(`messages:${conversationId}`);
  if (mem) {
    const updated = mem.map((m) => (m.id === messageId ? { ...m, reactions } : m));
    setMemoryCache(`messages:${conversationId}`, updated);
  }
  const db = await openClientDb();
  if (db) {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const req = store.get(messageId);
      req.onsuccess = () => {
        if (req.result) {
          const item = req.result;
          item.data = { ...item.data, reactions };
          store.put(item);
        }
      };
    } catch {}
  }
}


// ---------------------------------------------------------------- 24-Hour Purge & Expiration
export async function purgeExpiredChatLocal(conversationId: string): Promise<void> {
  deleteMemoryCache(`messages:${conversationId}`);

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction(["chats", "messages"], "readwrite");
    tx.objectStore("chats").delete(conversationId);

    const msgStore = tx.objectStore("messages");
    const idx = msgStore.index("conversation_id");
    const req = idx.getAllKeys(conversationId);
    req.onsuccess = () => {
      for (const key of req.result || []) {
        msgStore.delete(key);
      }
    };
  } catch {}
}

export async function sweepExpiredChats(): Promise<void> {
  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction(["chats", "messages"], "readwrite");
    const chatStore = tx.objectStore("chats");
    const msgStore = tx.objectStore("messages");
    const now = Date.now();

    const req = chatStore.getAll();
    req.onsuccess = () => {
      const deadIds: string[] = [];
      for (const row of req.result || []) {
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
          deadIds.push(row.id);
          chatStore.delete(row.id);
          deleteMemoryCache(`messages:${row.id}`);
        }
      }

      if (deadIds.length > 0) {
        const idx = msgStore.index("conversation_id");
        for (const deadId of deadIds) {
          const keysReq = idx.getAllKeys(deadId);
          keysReq.onsuccess = () => {
            for (const k of keysReq.result || []) {
              msgStore.delete(k);
            }
          };
          broadcastSync({ type: "CHAT_EXPIRED", conversationId: deadId });
        }
      }
    };
  } catch {}
}

// ---------------------------------------------------------------- Account Isolation & Logout Purge
export async function purgeUserPrivateCache(userId: string): Promise<void> {
  // Clear memory
  for (const key of memStore.keys()) {
    if (key.includes(userId) || key.startsWith("chats:") || key.startsWith("messages:")) {
      memStore.delete(key);
    }
  }

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction(["chats", "messages", "notifications"], "readwrite");
    // Purge notifications
    tx.objectStore("notifications").delete(userId);

    // Purge chats & messages
    const chatStore = tx.objectStore("chats");
    const idx = chatStore.index("userId");
    const req = idx.getAllKeys(userId);
    req.onsuccess = () => {
      const msgStore = tx.objectStore("messages");
      const msgIdx = msgStore.index("conversation_id");
      for (const chatId of req.result || []) {
        chatStore.delete(chatId);
        const mReq = msgIdx.getAllKeys(chatId);
        mReq.onsuccess = () => {
          for (const mk of mReq.result || []) msgStore.delete(mk);
        };
      }
    };
  } catch {}
}

// ---------------------------------------------------------------- Notifications Cache
export async function getCachedNotifications(userId: string): Promise<{ notifications: any[]; unread: number } | null> {
  const mem = getMemoryCache<{ notifications: any[]; unread: number }>(`notifs:${userId}`, 30_000);
  if (mem) return mem;

  const db = await openClientDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("notifications", "readonly");
      const req = tx.objectStore("notifications").get(userId);
      req.onsuccess = () => {
        if (req.result?.items) {
          const res = { notifications: req.result.items, unread: req.result.unread ?? 0 };
          setMemoryCache(`notifs:${userId}`, res);
          resolve(res);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedNotifications(userId: string, notifications: any[], unread: number): Promise<void> {
  const payload = { notifications, unread };
  setMemoryCache(`notifs:${userId}`, payload);

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction("notifications", "readwrite");
    tx.objectStore("notifications").put({ userId, items: notifications.slice(0, 50), unread, timestamp: Date.now() });
  } catch {}
}

// ---------------------------------------------------------------- Profiles Cache
export async function getCachedProfile(username: string): Promise<any | null> {
  const clean = username.toLowerCase().trim();
  const mem = getMemoryCache<any>(`profile:${clean}`, 60_000);
  if (mem) return mem;

  const db = await openClientDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("profiles", "readonly");
      const req = tx.objectStore("profiles").get(clean);
      req.onsuccess = () => {
        if (req.result?.data) {
          setMemoryCache(`profile:${clean}`, req.result.data);
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedProfile(username: string, data: any): Promise<void> {
  const clean = username.toLowerCase().trim();
  setMemoryCache(`profile:${clean}`, data);

  const db = await openClientDb();
  if (!db) return;

  try {
    const tx = db.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put({ username: clean, data, timestamp: Date.now() });
  } catch {}
}

// ---------------------------------------------------------------- Post Creation Cache Seed
/** Fold a freshly created post (e.g. a text meme) into existing caches
 * without refetching: detail cache + prepend to known feed tabs, and tell
 * other tabs about it. Server response is authoritative — call only after
 * a successful POST. */
export async function seedPostToCaches(meme: any): Promise<void> {
  if (!meme?.id) return;
  setMemoryCache(`meme:${meme.id}`, meme);
  const db = await openClientDb();
  if (db) {
    try {
      db.transaction("memes", "readwrite").objectStore("memes").put({ id: meme.id, data: meme, timestamp: Date.now() });
    } catch {}
  }
  for (const tab of ["foryou", "new", "mix"]) {
    const mem = getMemoryCache<any[]>(`feed:${tab}`);
    if (mem && mem.length > 0 && !mem.some((m) => m.id === meme.id)) {
      await setCachedFeed(tab, [meme, ...mem]);
    }
  }
  broadcastSync({ type: "POST_MUTATED", memeId: meme.id, patch: meme });
}

/** Remove a post from feed caches after a delete. */
export async function removePostFromCaches(memeId: string): Promise<void> {
  for (const tab of ["foryou", "new", "mix", "trending", "following"]) {
    const mem = getMemoryCache<any[]>(`feed:${tab}`);
    if (mem) setMemoryCache(`feed:${tab}`, mem.filter((m) => m.id !== memeId));
  }
  deleteMemoryCache(`meme:${memeId}`);
  const db = await openClientDb();
  if (!db) return;
  try {
    const tx = db.transaction(["memes", "feed"], "readwrite");
    tx.objectStore("memes").delete(memeId);
    const feedStore = tx.objectStore("feed");
    const req = feedStore.getAll();
    req.onsuccess = () => {
      for (const row of req.result ?? []) {
        if (Array.isArray(row.memes) && row.memes.some((m: any) => m.id === memeId)) {
          feedStore.put({ ...row, memes: row.memes.filter((m: any) => m.id !== memeId) });
        }
      }
    };
  } catch {}
}

// ---------------------------------------------------------------- Periodic cleanup trigger on load
if (typeof window !== "undefined") {
  setTimeout(() => {
    void sweepExpiredChats();
  }, 2000);
}
