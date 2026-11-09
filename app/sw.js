/* Service worker: guarda la app, los datos y los mosaicos del mapa para uso 100% offline. */
const BUILD = "mw8r5mcf";                       // lo reemplaza tools/stamp.js en cada despliegue
const VERSION = "papa-shell-" + BUILD;
const SHELL = ["./", "index.html", "style.css", "app.js", "geo.js", "nav.js", "config.js", "data.json", "nav.json", "extras.json",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
  "img/logo-vertical.svg", "img/wordmark-dorado.svg", "img/isotipo.svg"];

async function precacheOptional(cache) { await Promise.allSettled(["roads.json", "avisos.json"].map((p) => cache.add(new URL(p, self.registration.scope)))); }
async function precacheTiles(cache) {              // opcional: solo si existe tiles/index.json
  try {
    const r = await fetch(new URL("tiles/index.json", self.registration.scope), { cache: "no-cache" });
    if (!r.ok) return;
    const list = await r.json(); await cache.put(new URL("tiles/index.json", self.registration.scope), new Response(JSON.stringify(list), { headers: { "content-type": "application/json" } }));
    for (let i = 0; i < list.length; i += 12)
      await Promise.allSettled(list.slice(i, i + 12).map((p) => cache.add(new URL(p, self.registration.scope))));
  } catch (e) {}
}
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => { await c.addAll(SHELL); await precacheOptional(c); await precacheTiles(c); }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("papa-shell-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/avisos.json")) {   // avisos: red primero, y si no hay señal el último guardado
    const key = new URL("avisos.json", self.registration.scope);
    e.respondWith(fetch(req).then((r) => { if (r && r.ok) { const c = r.clone(); caches.open(VERSION).then((ch) => ch.put(key, c)); } return r; })
      .catch(async () => (await caches.match(key, { ignoreSearch: true })) || Response.error()));
    return;
  }
  const isTile = url.pathname.includes("/tiles/") && !url.pathname.endsWith("index.json");
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit && isTile) return hit;                 // mosaicos: cache primero, no cambian
    const net = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }     // resto: cache primero y se actualiza en segundo plano
    const r = await net;
    return r || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
  }));
});
