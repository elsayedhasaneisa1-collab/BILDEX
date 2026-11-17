const CACHE = "buildex-static-v2";
const APP_SHELL = ["/offline.html", "/icon.png", "/icon-192.png", "/icon-512.png", "/apple-icon.png", "/brand/mark.png", "/images/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api") || url.pathname.startsWith("/_next")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname.startsWith("/images/") || url.pathname.startsWith("/brand/") || url.pathname.endsWith(".png"))) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html"))));
});
