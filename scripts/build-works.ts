/**
 * Build each English area's works file from the latest Street Manager monthly archive:
 *   pnpm build:works [YYYY/MM]
 * Writes data/live/<area>.works.json (WorksObservations still open at build time).
 * Scotland's register (SRWR) has no open feed yet, so Edinburgh gets none (DATA_SOURCES.md).
 *
 * Production replaces the monthly archive with Street Manager's live SNS notifications,
 * through the same adapter (streetManagerObservations).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromOsgb, registerOsgb, toOsgb } from "@causeway/graph/node";
import { streetManagerObservations, type StreetManagerPermit } from "@causeway/live";
import { AREAS } from "./areas.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const month = process.argv[2] ?? "2026/09";
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

mkdirSync(join(ROOT, "data/live"), { recursive: true });
const now = new Date();
for (const a of english) {
  const obs = streetManagerObservations(
    permits.filter((p) => p.area === a.name),
    fromOsgb,
    now,
  ).filter((o) => o.geometry.some(([x, y]) => a.osm.apiTiles.some((t) => t[0] <= x && x <= t[2] && t[1] <= y && y <= t[3])));
  writeFileSync(
    join(ROOT, "data/live", `${a.name}.works.json`),
    JSON.stringify({ area: a.name, source: `Street Manager open data, permit archive ${month}`, licence: "Open Government Licence v3.0", builtAt: now.toISOString(), works: obs }, null, 0),
  );
  console.log(`${a.name}: ${obs.length} works on pavements (${obs.filter((o) => o.footway === "closed").length} closing them)`);
}
