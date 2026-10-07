// Offline: routing runs on the device, so with the city's data cached, planning works with no signal.
//  - Hashed app code (/_next/static/): cache first. A new build has new names.
//  - City data (graph, bus timetables, search index, base map, fonts): stale-while-revalidate. Show what
//    we have at once, and fetch a fresh copy in the background for next time, so the weekly data refresh
//    reaches people instead of being pinned forever by the first download.
//  - The base map is read in byte ranges (D-079). A range is cut from the cached whole file when we have
//    it (offline too), and otherwise goes to the network uncached: a partial response can't be stored.
//    The page then fetches the whole file in the background, which is what gets cached.
//  - Live data (/live/: pavement works): network first, cache only as a fallback.
//  - Pages: network first, cache as fallback.
const CACHE = "causewayside-v2";
const STATIC = ["/_next/static/", "/next/static/"];
const CITY_DATA = ["/graph/", "/places/", "/basemap/", "/fonts/"];

/** Answer "Range: bytes=a-b" (or "a-") from a cached whole file, as a 206. Null for a form we don't cut. */
async function rangeFrom(hit, range) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
  if (!m || hit.status !== 200) return null;
  const blob = await hit.blob();
  const start = Number(m[1]);
  const end = Math.min(m[2] ? Number(m[2]) : blob.size - 1, blob.size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  const headers = new Headers({ "Content-Range": `bytes ${start}-${end}/${blob.size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" });
  for (const h of ["Content-Type", "ETag", "Last-Modified"]) if (hit.headers.has(h)) headers.set(h, hit.headers.get(h));
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

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
      const range = e.request.headers.get("range");
      if (range && has(CITY_DATA)) {
        // By address only: a range request's own headers mustn't stop it matching the whole file.
        const hit = await cache.match(e.request.url, { ignoreVary: true });
        const cut = hit && (await rangeFrom(hit, range));
        if (cut) return cut;
        try {
          return await fetch(e.request);
        } catch {
          return Response.error();
        }
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
