/**
 * Build each area's bus network from the Bus Open Data Service GTFS downloads (no key):
 *   pnpm build:bus [area]
 * Writes data/transit/<area>/bus.json: stops, and per route direction the ride times
 * between stops and departures per hour on a typical weekday, Saturday and Sunday.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS } from "./areas.js";
import { CACHE } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const REGION: Record<string, string> = { "edinburgh-central": "scotland", "newcastle-gateshead": "north_east", "london-jubilee": "london" };
/** Sample days for "typical" service: a Tuesday, Saturday and Sunday clear of bank holidays. */
const DAYS = { wd: "20261006", sa: "20261010", su: "20261011" };

for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(REGION)) {
  const area = AREAS[name];
  const region = REGION[name];
  if (!area || !region) throw new Error(`no bus region for ${name}`);
  const zip = join(CACHE, `gtfs-${region}.zip`);
  if (!existsSync(zip)) execFileSync("curl", ["-sS", "-o", zip, `https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/${region}/`], { stdio: "inherit" });
  const zones = "apiTiles" in area.osm ? area.osm.apiTiles : [area.bbox];
  const dir = join(ROOT, "data/transit", name);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "bus.json");
  execFileSync("python3", [join(ROOT, "scripts/gtfs-bus.py"), JSON.stringify({ zip, zones, days: DAYS, out })], { stdio: "inherit" });
  const data = JSON.parse(readFileSync(out, "utf8"));
  writeFileSync(
    out,
    JSON.stringify({
      area: name,
      source: `Bus Open Data Service GTFS (${region}), timetables for ${DAYS.wd}, ${DAYS.sa} and ${DAYS.su}`,
      licence: "Open Government Licence v3.0",
      builtAt: new Date().toISOString().slice(0, 10),
      days: DAYS,
      ...data,
    }),
  );
}
