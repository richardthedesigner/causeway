/**
 * Serve the static export (apps/web/out) for browser checks, with the same
 * response headers Vercel adds from apps/web/vercel.json, so a Content
 * Security Policy that would break the app fails here first (SEC-01).
 * Used by scripts/a11y-check.mjs and scripts/e2e.mjs.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const WEB = join(import.meta.dirname, "../apps/web");
const OUT = join(WEB, "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".gz": "application/gzip", ".pmtiles": "application/octet-stream", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml" };

/** Headers from vercel.json rules that apply to every path ("/(.*)"). */
function vercelHeaders() {
  const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8"));
  const out = {};
  for (const rule of config.headers ?? []) if (rule.source === "/(.*)") for (const h of rule.headers) out[h.key] = h.value;
  // Served over http locally: upgrading requests to https would break every fetch.
  if (out["Content-Security-Policy"]) out["Content-Security-Policy"] = out["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "");
  delete out["Strict-Transport-Security"];
  return out;
}

export async function serveOut() {
  if (!existsSync(OUT)) throw new Error("apps/web/out missing: run pnpm web:build first");
  const headers = vercelHeaders();
  const server = createServer((req, res) => {
    let path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (path.endsWith("/")) path += "index.html";
    const file = join(OUT, path);
    if (!file.startsWith(OUT) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

/** Locally the pre-installed Chromium may not match Playwright's expected build; CI installs the right one. */
export function launchBrowser() {
  return chromium.launch(existsSync("/opt/pw-browsers/chromium") && !process.env.CI ? { executablePath: "/opt/pw-browsers/chromium" } : {});
}

/** Collect Content Security Policy violations on a page, so a check can fail on them. */
export function watchCsp(page, into) {
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) into.push(m.text());
  });
}
