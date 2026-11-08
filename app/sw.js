/* Service worker: guarda la app y los datos para uso 100% offline.
   Los mosaicos del mapa base (otro origen) los administra la propia app en Cache Storage. */
const VERSION = "papa-shell-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "geo.js", "config.js", "data.json",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("papa-shell-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Cache primero, y se actualiza en segundo plano cuando hay red (stale-while-revalidate).
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const r = await net;
      return r || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
    })
  );
});
