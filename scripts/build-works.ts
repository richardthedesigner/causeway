/**
 * Build each English area's works file from Street Manager's monthly archives,
 * permits (works) and activities (skips, scaffolding, hoardings: DATA-05):
 *   pnpm build:works [YYYY/MM] [--keep]   (default: last month; --keep leaves the activity archives in .data-cache)
 * Writes data/live/<area>.works.json (WorksObservations still open at build time).
 * Activities are read from the last six monthly archives (about 13 MB each, deleted after
 * use), because a scaffold licensed in May may still stand in October. A month that fails
 * to download or is truncated is skipped with a warning (D-027).
 * Edinburgh's works come from the Scottish Road Works Register instead (scripts/build-srwr.ts, D-057).
 *
 * Production replaces the monthly archive with Street Manager's live SNS notifications,
 * through the same adapter (streetManagerObservations).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromOsgb, registerOsgb, toOsgb } from "@causeway/graph/node";
import { streetManagerActivityObservations, streetManagerObservations, type StreetManagerActivity, type StreetManagerPermit } from "@causeway/live";
import { AREAS } from "./areas.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
/** The last complete month: Street Manager publishes each month's archive after it ends. */
const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const keep = process.argv.includes("--keep");
const month = process.argv.slice(2).find((a) => /^\d{4}\/\d{2}$/.test(a)) ?? lastMonth();
/** `month` and the five before it, oldest first. */
const activityMonths = (() => {
  const [y, m] = month.split("/").map(Number) as [number, number];
  return [5, 4, 3, 2, 1, 0].map((back) => {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
})();
const zipFile = join(CACHE, `sm-permit-${month.replace("/", "-")}.zip`);
if (!existsSync(zipFile)) execFileSync("curl", ["-sS", "-o", zipFile, `https://opendata.manage-roadworks.service.gov.uk/permit/${month}.zip`], { stdio: "inherit" });

await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
const english = Object.values(AREAS).flatMap((a) => ("apiTiles" in a.osm ? [{ ...a, osm: a.osm }] : []));
const boxes = Object.fromEntries(
  english.map((a) => {
    const [e0, n0] = toOsgb(a.bbox[0], a.bbox[1]);
    const [e1, n1] = toOsgb(a.bbox[2], a.bbox[3]);
    return [a.name, [e0 - 50, n0 - 50, e1 + 50, n1 + 50]];
  }),
);
const extract = join(CACHE, `sm-permit-${month.replace("/", "-")}.json`);
if (!existsSync(extract)) execFileSync("python3", [join(ROOT, "scripts/streetmanager-extract.py"), JSON.stringify({ zip: zipFile, boxes, out: extract })], { stdio: "inherit" });
const permits = JSON.parse(readFileSync(extract, "utf8")) as (StreetManagerPermit & { area: string })[];

// Activities: skips, scaffolding, hoardings, cranes, events, from six monthly archives. A month that fails to download is skipped.
mkdirSync(CACHE, { recursive: true });
const activityZips: string[] = [];
for (const m of activityMonths) {
  const f = join(CACHE, `sm-activity-${m.replace("/", "-")}.zip`);
  if (!existsSync(f)) {
    try {
      execFileSync("curl", ["-sSf", "--retry", "3", "-o", f, `https://opendata.manage-roadworks.service.gov.uk/activity/${m}.zip`], { stdio: "inherit" });
    } catch {
      console.warn(`Street Manager activity archive ${m}: download failed; skipped`);
      rmSync(f, { force: true });
      continue;
    }
  }
  activityZips.push(f);
}
const actExtract = join(CACHE, `sm-activity-${month.replace("/", "-")}.json`);
execFileSync("python3", [join(ROOT, "scripts/streetmanager-extract.py"), JSON.stringify({ kind: "activity", zip: activityZips, boxes, out: actExtract })], { stdio: "inherit" });
const { read, activities } = JSON.parse(readFileSync(actExtract, "utf8")) as { read: string[]; activities: (StreetManagerActivity & { area: string })[] };
/** The months actually read: not downloaded or not readable ones are left out of the file's source line. */
const readMonths = activityMonths.filter((m) => read.some((f) => f.endsWith(`sm-activity-${m.replace("/", "-")}.zip`)));
const skipped = activityMonths.filter((m) => !readMonths.includes(m));
if (!keep) for (const f of [...activityZips, actExtract]) rmSync(f, { force: true });
mkdirSync(join(ROOT, "data/live"), { recursive: true });
const now = new Date();
for (const a of english) {
  const inTiles = (o: { geometry: [number, number][] }) => o.geometry.some(([x, y]) => a.osm.apiTiles.some((t) => t[0] <= x && x <= t[2] && t[1] <= y && y <= t[3]));
  const works = streetManagerObservations(
    permits.filter((p) => p.area === a.name),
    fromOsgb,
    now,
  ).filter(inTiles);
  const acts = streetManagerActivityObservations(
    activities.filter((p) => p.area === a.name),
    fromOsgb,
    now,
  ).filter(inTiles);
  const obs = [...works, ...acts];
  const months = readMonths.length ? `activity archives ${readMonths[0]} to ${readMonths[readMonths.length - 1]}${skipped.length ? ` (${skipped.join(", ")} skipped)` : ""}` : "no activity archive";
  writeFileSync(
    join(ROOT, "data/live", `${a.name}.works.json`),
    JSON.stringify({ area: a.name, source: `Street Manager open data, permit archive ${month}, ${months}`, licence: "Open Government Licence v3.0", builtAt: now.toISOString(), works: obs }, null, 0),
  );
  const count = (h: string) => acts.filter((o) => o.headline?.startsWith(h)).length;
  console.log(
    `${a.name}: ${works.length} works on pavements (${works.filter((o) => o.footway === "closed").length} closing them); ${acts.length} activities (${count("A skip")} skips, ${count("Scaffolding")} scaffolding, ${count("A hoarding")} hoardings, ${count("A crane")} cranes, ${count("An event")} events; ${acts.filter((o) => o.footway === "closed").length} closing the pavement)`,
  );
}
if (skipped.length) console.warn(`Activity archives skipped: ${skipped.join(", ")}`);
