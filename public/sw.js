// AURA service worker — static shell caching, network-first for data.
const CACHE = "memore-v1";
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
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/memes/") || url.pathname.startsWith("/videos/") || url.pathname.startsWith("/icons/")) {
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

  // pages: network first with shell fallback
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match("/")))
  );
});
