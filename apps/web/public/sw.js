// Offline: cache the app shell and any city graph once fetched. Routing runs on the device,
// so with these cached, planning works with no signal. Network first for the page, cache first for data.
const CACHE = "causewayside-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isData = url.pathname.includes("/graph/") || url.pathname.includes("/_next/static/");
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (isData) {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return (await cache.match(e.request)) ?? Response.error();
      }
    })(),
  );
});
