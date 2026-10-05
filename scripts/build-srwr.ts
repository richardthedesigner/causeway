/**
 * Build Edinburgh's works file from the Scottish Road Works Register's daily disruptions export:
 *   pnpm build:srwr [--keep]   (--keep leaves the zip in .data-cache for another run within 6 hours)
 * Writes data/live/edinburgh-central.works.json (WorksObservations still open at build time):
 * footway works, road closures that include the footway, street café footprints,
 * scaffolding, hoardings, site cabins and events on the footway (D-057).
 *
 * One request for the export (it redirects to a dated zip); the register rate-limits,
 * so retries wait a minute. The zip goes in .data-cache and is deleted after use.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromOsgb, registerOsgb, toOsgb } from "@causeway/graph/node";
import { srwrObservations, type SrwrActivity } from "@causeway/live";
import { AREAS } from "./areas.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const EXPORT = "https://downloads.srwr.scot/export/disruptions-daily/";
const AUTHORITY = "City of Edinburgh Council";
const area = AREAS["edinburgh-central"]!;

mkdirSync(CACHE, { recursive: true });
const zipFile = join(CACHE, "srwr-disruptions.zip");
const urlFile = `${zipFile}.url`;
const keep = process.argv.includes("--keep");
let finalUrl = "";
if (existsSync(zipFile) && existsSync(urlFile) && Date.now() - statSync(zipFile).mtimeMs < 6 * 3_600_000) finalUrl = readFileSync(urlFile, "utf8");
else
  for (let attempt = 1; ; attempt++) {
    try {
      finalUrl = execFileSync("curl", ["-sSfL", "--retry", "2", "--retry-delay", "60", "-o", zipFile, "-w", "%{url_effective}", EXPORT], { encoding: "utf8" });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`SRWR download failed (attempt ${attempt}); waiting a minute`);
      execFileSync("sleep", ["60"]);
    }
  }
writeFileSync(urlFile, finalUrl);
// The redirect names the export's date: .../SRWRDisruptionsExport20261005.zip. No date, no build: never today's date in its place.
const m = /DisruptionsExport(\d{4})(\d{2})(\d{2})/.exec(finalUrl);
if (!m) throw new Error(`SRWR: no export date in ${finalUrl.split("?")[0]}`);
const exportDate = `${m[1]}-${m[2]}-${m[3]}`;

await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
const [e0, n0] = toOsgb(area.bbox[0], area.bbox[1]);
const [e1, n1] = toOsgb(area.bbox[2], area.bbox[3]);
const extract = join(CACHE, "srwr-edinburgh.json");
execFileSync("python3", [join(ROOT, "scripts/srwr-extract.py"), JSON.stringify({ zip: zipFile, authority: AUTHORITY, boxes: { [area.name]: [e0 - 50, n0 - 50, e1 + 50, n1 + 50] }, out: extract })], { stdio: "inherit" });
const rows = (JSON.parse(readFileSync(extract, "utf8")) as Record<string, SrwrActivity[]>)[area.name] ?? [];
if (!keep) for (const f of [zipFile, urlFile]) rmSync(f, { force: true });
rmSync(extract, { force: true });

const now = new Date();
const [x0, y0, x1, y1] = area.bbox;
const obs = srwrObservations(rows, fromOsgb, now).filter((o) => o.geometry.some(([x, y]) => x0 <= x && x <= x1 && y0 <= y && y <= y1));
mkdirSync(join(ROOT, "data/live"), { recursive: true });
writeFileSync(
  join(ROOT, "data/live", `${area.name}.works.json`),
  JSON.stringify({ area: area.name, source: `Scottish Road Works Register, disruptions export ${exportDate}`, licence: "Open Government Licence v3.0", builtAt: now.toISOString(), works: obs }, null, 0),
);
const count = (h: string) => obs.filter((o) => o.headline === h).length;
console.log(
  `${area.name}: ${obs.length} works on pavements from ${rows.length} rows (${obs.filter((o) => o.footway === "closed").length} closing them, ${count("Café tables on the pavement")} café footprints; ${rows.filter((r) => r.status === "Advance Planning").length} advance notices left out)`,
);
