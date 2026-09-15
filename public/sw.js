// MEMORE service worker — static shell caching, network-first for data.
// Bump the cache version on every deploy that changes app code: the activate
// handler deletes every older cache, so clients pick up fresh bundles instead
// of silently serving stale pages (the "my fix isn't showing up" bug).
const CACHE = "memore-v25";
const SHELL = ["/", "/home", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  // API + uploads: network first, never cache sensitive data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "You are offline. The market sleeps." }), { status: 503, headers: { "Content-Type": "application/json" } }))
    );
    return;
  }

  // static assets: cache first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/sfx/") || url.pathname.startsWith("/memes/") || url.pathname.startsWith("/videos/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(event.request).then((hit) =>
        hit ?? fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
      )
    );
    return;
  }

  // pages: network first (short timeout — a slow/hung server must fall back to
  // the cached shell quickly) with shell fallback
  event.respondWith(
    Promise.race([
      fetch(event.request),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).then((res) => {
      if (res) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      }
      return caches.match(event.request).then((hit) => hit ?? caches.match("/"));
    })
  );
});
