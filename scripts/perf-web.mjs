/**
 * Load and first-route timing of the built app on an emulated mid-range phone (SPEED-01).
 *   pnpm web:build && pnpm perf:web
 * Each run is a cold visit in a fresh browser context: a Moto G Power sized screen,
 * the CPU slowed 4x, the network throttled, no cache and no service worker. Per city it
 * records first and largest contentful paint, when the map first draws, when the city's
 * graph has loaded (the "Where to?" box appears), and the time from choosing a
 * destination to the first route. Bytes are counted by the server, as sent (brotli for
 * text, as Vercel does), and split by kind. Prints the median and the range of each.
 * It serves apps/web/out with the headers from apps/web/vercel.json, like the e2e check.
 *
 * Options:
 *   --runs 5            runs per city (default 5)
 *   --network fast4g    fast4g (9 Mbit/s, 60 ms), slow4g (1.6 Mbit/s, 150 ms) or none
 *   --cpu 4             CPU slowdown on the page's main thread (default 4)
 *   --city edinburgh    only this city (repeat for more); edinburgh, newcastle, london
 *   --json out.json     also write every run as JSON
 *   --debug             print the draw-call frames the map-drawn time is read from, and when each file loaded
 *
 * The CPU slowdown applies to the page's main thread only. The router and the graph
 * parse run in a worker, which Chromium does not slow (checked: a fixed loop takes the same
 * time in a worker at 1x and 4x). So "worker setup after download" is a desktop figure: scale
 * it by hand for a phone (docs/perf/2026-10.md says how). The map is drawn in software here,
 * since the container has no GPU, so "map drawn" is a ceiling.
 */
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { hereIn, launchBrowser } from "./serve-out.mjs";

const WEB = join(import.meta.dirname, "../apps/web");
const OUT = join(WEB, "out");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const RUNS = Number(opt("runs", 5));
const NETWORK = opt("network", "fast4g");
const CPU = Number(opt("cpu", 4));
const DEBUG = args.includes("--debug");
const JSON_OUT = opt("json", null);
const ONLY = args.flatMap((a, i) => (a === "--city" ? [args[i + 1]] : []));

/** Chrome DevTools' presets. Bytes per second is what the protocol takes. */
const NETWORKS = {
  fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 },
};
if (NETWORK !== "none" && !NETWORKS[NETWORK]) throw new Error(`--network: fast4g, slow4g or none, not "${NETWORK}"`);

/** Moto G Power (2022): 720 by 1600 at 1.75 pixel ratio, a Helio G37 phone. */
const PHONE = {
  viewport: { width: 412, height: 914 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 12; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

const CITIES = [
  { id: "edinburgh", to: "Hamilton Place" },
  { id: "newcastle", to: "Grainger Market" },
  { id: "london", to: "Westminster Abbey" },
].filter((c) => !ONLY.length || ONLY.includes(c.id));

// ---- A static server with Vercel's headers, brotli for text, and a count of bytes sent per path.

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".gz": "application/gzip", ".pmtiles": "application/octet-stream", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
/** Vercel compresses these on the fly. A .gz file is already compressed and goes as it is. */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

function vercelHeaders() {
  const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8"));
  const out = {};
  for (const rule of config.headers ?? []) if (rule.source === "/(.*)") for (const h of rule.headers) out[h.key] = h.value;
  // Plain http locally: upgrading requests to https would break every fetch.
  if (out["Content-Security-Policy"]) out["Content-Security-Policy"] = out["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "");
  delete out["Strict-Transport-Security"];
  return out;
}

async function serve() {
  if (!existsSync(OUT)) throw new Error("apps/web/out missing: run pnpm web:build first");
  const headers = vercelHeaders();
  const brotli = new Map();
  const sent = new Map();
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    let path = normalize(decodeURIComponent(url));
    if (path.endsWith("/")) path += "index.html";
    const file = join(OUT, path);
    if (!file.startsWith(OUT) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    const ext = extname(file);
    const base = { ...headers, "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=0, must-revalidate" };
    const count = (n) => sent.set(path, (sent.get(path) ?? 0) + n);
    if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers["accept-encoding"] ?? "")) {
      let body = brotli.get(file);
      if (!body) brotli.set(file, (body = brotliCompressSync(readFileSync(file), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })));
      count(body.length);
      return res.writeHead(200, { ...base, "content-encoding": "br", "content-length": body.length, vary: "Accept-Encoding" }).end(body);
    }
    const size = statSync(file).size;
    // Byte ranges, as Vercel serves them (D-079): one "bytes=a-b" range, a 206 and a strong ETag.
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
      if (start > end) return res.writeHead(416, { ...base, "content-range": `bytes */${size}` }).end();
      count(end - start + 1);
      res.writeHead(206, { ...base, etag: `"${size}"`, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }
    count(size);
    res.writeHead(200, { ...base, etag: `"${size}"`, "accept-ranges": "bytes", "content-length": size });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, sent, close: () => server.close() };
}

/** What a path is, for the split of bytes. */
function kindOf(path) {
  if (/places\/[^/]*\.json\.gz$/.test(path)) return "search index";
  if (/graph\/[^/]*\.graph\.json\.gz$/.test(path)) return "graph";
  if (/\.pmtiles$|fonts\/glyphs/.test(path)) return "tiles";
  if (/\.(m?js)$/.test(path)) return "js";
  if (/^\/(graph|places|live)\//.test(path)) return "other city data";
  return "page and other";
}
const KINDS = ["js", "graph", "tiles", "search index", "other city data", "page and other"];

// ---- In the page: the paint metrics, and the marks the app doesn't publish.

/** Runs before the app. Counts WebGL draw calls per frame (the map draws with them), and marks when the city is ready and the route appears. */
function pageHooks() {
  const perf = { frames: [], ready: null, chosen: null, route: null, error: null };
  window.__perf = perf;
  let draws = 0;
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const real = proto[fn];
      if (real)
        proto[fn] = function (...a) {
          draws++;
          return real.apply(this, a);
        };
    }
  }
  const tick = () => {
    if (draws) perf.frames.push([performance.now(), draws]);
    draws = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new MutationObserver(() => {
    if (perf.ready === null && document.querySelector('input[placeholder="Where to?"]')) perf.ready = performance.now();
    if (perf.chosen !== null && perf.route === null && document.body.textContent.includes("Why this way?")) perf.route = performance.now();
    if (perf.route === null && document.querySelector('[role="alert"]')) perf.error = document.querySelector('[role="alert"]').textContent;
  }).observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener(
    "click",
    (e) => {
      if (perf.chosen === null && e.target instanceof Element && e.target.closest('[role="option"]')) perf.chosen = performance.now();
    },
    true,
  );
  perf.paint = {};
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") perf.paint.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) perf.paint.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
}

/**
 * The map has drawn once a frame makes this many draw calls. Measured: 7 calls for the
 * empty ground, about 75 once the base map's layers are added with no tiles yet, and 280
 * to 350 once tiles paint. Frames are drawn in software here (no GPU in the container), so
 * this time is longer than on a phone's GPU. Read it as a ceiling, and as a comparison.
 */
const DRAWN_CALLS = 150;

async function run(browser, server, city) {
  server.sent.clear();
  // The phone shares where it is, near the city's start, so the first route starts from "Your location" (FEAT-20).
  const context = await browser.newContext({ ...PHONE, ...hereIn(city.id) });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  if (NETWORK !== "none") await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORKS[NETWORK] });
  // When each file finished downloading, in epoch ms, including the worker's own fetches.
  const finished = [];
  const sizing = [];
  context.on("requestfinished", (req) => {
    const t = req.timing();
    const f = { path: new URL(req.url()).pathname, start: t.startTime, end: t.startTime + t.responseEnd, bytes: 0 };
    finished.push(f);
    sizing.push(req.sizes().then((z) => (f.bytes = z.responseBodySize), () => undefined));
  });
  await page.addInitScript((id) => localStorage.setItem("causewayside.city.v1", id), city.id);
  await page.addInitScript(pageHooks);
  const t0 = Date.now();
  await page.goto(server.url, { waitUntil: "commit" });
  const wait = (fn, label, timeout = 120_000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).catch(() => {
    throw new Error(`${city.id}: ${label} never happened`);
  });
  await wait(() => window.__perf.ready !== null, "the city loading");
  // The map draws when the base map has arrived: wait for a busy frame after it.
  await wait(() => {
    const base = performance.getEntriesByType("resource").find((r) => r.name.endsWith(".pmtiles"));
    return base && base.responseEnd > 0 && window.__perf.frames.some(([t, n]) => t >= base.responseEnd && n >= 150);
  }, "the map drawing");
  const input = page.getByPlaceholder("Where to?");
  await input.fill(city.to);
  const option = page.getByRole("option").first();
  await option.waitFor({ timeout: 60_000 });
  await option.click();
  await wait(() => window.__perf.route !== null || window.__perf.error, "the first route");
  const r = await page.evaluate(() => {
    const base = performance.getEntriesByType("resource").find((e) => e.name.endsWith(".pmtiles"));
    return { ...window.__perf, origin: performance.timeOrigin, baseEnd: base?.responseEnd ?? null, baseStart: base?.startTime ?? null };
  });
  await Promise.all(sizing);
  await context.close();
  if (r.error && r.route === null) throw new Error(`${city.id}: ${r.error}`);
  const drawn = r.frames.find(([t, n]) => r.baseEnd !== null && t >= r.baseEnd && n >= DRAWN_CALLS);
  if (DEBUG) console.log(`  base map ${r.baseStart?.toFixed(0)} to ${r.baseEnd?.toFixed(0)} ms; ready ${r.ready?.toFixed(0)}; frames:`, r.frames.slice(0, 40).map(([t, n]) => `${t.toFixed(0)}:${n}`).join(" "));
  // Which files landed when, so the order of downloads before "ready" can be checked (SPEED-08).
  if (DEBUG) console.log("  files:", finished.sort((a, b) => a.end - b.end).map((f) => `${(f.start - r.origin).toFixed(0)}-${(f.end - r.origin).toFixed(0)}:${f.path}`).join(" "));
  // The router worker's data: the graph and what joins it. After the last of it lands, the worker unzips,
  // parses and indexes it, then the page shows the city. Chromium doesn't slow workers, so this is desktop speed.
  const workerData = finished.filter((f) => /^\/(graph|live)\/|\/places\/[^/]*\.(greenspace|osm-notes)\./.test(f.path)).map((f) => f.end);
  const workerSetup = workerData.length ? r.origin + r.ready - Math.max(...workerData) : null;
  // What had downloaded by the time the map drew (D-079's target is 2 MB or less), and how much of it was base map.
  const drawnAt = drawn ? r.origin + drawn[0] : null;
  const landed = drawnAt === null ? [] : finished.filter((f) => f.end <= drawnAt);
  const beforeMap = drawnAt === null ? null : landed.reduce((s, f) => s + f.bytes, 0);
  const tilesBeforeMap = drawnAt === null ? null : landed.filter((f) => f.path.endsWith(".pmtiles")).reduce((s, f) => s + f.bytes, 0);
  const bytes = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const [path, n] of server.sent) bytes[kindOf(path)] += n;
  return {
    city: city.id,
    fcp: r.paint.fcp ?? null,
    lcp: r.paint.lcp ?? null,
    mapDrawn: drawn ? drawn[0] : null,
    graphReady: r.ready,
    workerSetup,
    toRoute: r.route - r.chosen,
    beforeMap,
    tilesBeforeMap,
    bytes,
    wall: (Date.now() - t0) / 1000,
  };
}

// ---- Report.

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (xs) => (xs.some((x) => x == null) ? "n/a" : `${(median(xs) / 1000).toFixed(2)} s (${(Math.min(...xs) / 1000).toFixed(2)} to ${(Math.max(...xs) / 1000).toFixed(2)})`);
const kb = (n) => `${Math.round(n / 1024)} KB`;

const server = await serve();
const browser = await launchBrowser();
const all = [];
console.log(`perf:web: ${RUNS} cold runs per city, ${PHONE.viewport.width}x${PHONE.viewport.height} at ${PHONE.deviceScaleFactor}x, CPU ${CPU}x slower, network ${NETWORK}`);
try {
  for (const city of CITIES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const one = await run(browser, server, city);
      runs.push(one);
      console.log(`  ${city.id} run ${i + 1}: graph ready ${(one.graphReady / 1000).toFixed(2)} s, route ${(one.toRoute / 1000).toFixed(2)} s`);
    }
    all.push(...runs);
    const col = (k) => runs.map((x) => x[k]);
    console.log(`\n${city.id} (median, with the range of ${RUNS} runs)`);
    console.log(`  first contentful paint   ${ms(col("fcp"))}`);
    console.log(`  largest contentful paint ${ms(col("lcp"))}`);
    console.log(`  map drawn                ${ms(col("mapDrawn"))}`);
    console.log(`  city graph loaded        ${ms(col("graphReady"))}`);
    console.log(`  destination to route     ${ms(col("toRoute"))}`);
    console.log(`  worker setup after download ${ms(col("workerSetup"))} (the part of graph loaded that ran in the unslowed worker)`);
    console.log(`  before the map drew      ${kb(median(col("beforeMap")))}, of which base map ${kb(median(col("tilesBeforeMap")))}`);
    const total = runs.map((x) => KINDS.reduce((s, k) => s + x.bytes[k], 0));
    console.log(`  transferred              ${kb(median(total))}: ${KINDS.map((k) => `${k} ${kb(median(runs.map((x) => x.bytes[k])))}`).join(", ")}\n`);
  }
} finally {
  await browser.close();
  server.close();
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ runs: RUNS, network: NETWORK, cpu: CPU, phone: PHONE, results: all }, null, 2));
