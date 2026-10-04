// Offline: routing runs on the device, so with the city's data cached, planning works with no signal.
//  - Hashed app code (/_next/static/): cache first. A new build has new names.
//  - City data (graph, bus timetables, search index, base map, fonts): stale-while-revalidate. Show what
//    we have at once, and fetch a fresh copy in the background for next time, so the weekly data refresh
//    reaches people instead of being pinned forever by the first download.
//  - Live data (/live/: pavement works): network first, cache only as a fallback.
//  - Pages: network first, cache as fallback.
const CACHE = "causewayside-v2";
const STATIC = ["/_next/static/", "/next/static/"];
const CITY_DATA = ["/graph/", "/places/", "/basemap/", "/fonts/"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const has = (list) => list.some((p) => url.pathname.includes(p));
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (has(STATIC)) {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }
      if (has(CITY_DATA)) {
        const hit = await cache.match(e.request);
        const refresh = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => null);
        if (hit) {
          e.waitUntil(refresh);
          return hit;
        }
        return (await refresh) ?? Response.error();
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
