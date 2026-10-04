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
/** GTFS route types to add beyond buses and trams: the Metro in Newcastle (London's comes from TfL). */
const EXTRA_MODES: Record<string, Record<string, string>> = { "newcastle-gateshead": { "1": "metro" } };
/**
 * Sample days for "typical" service: the next Tuesday, Saturday and Sunday at least two days
 * ahead, so the timetables published now cover them. Override with BUS_DAYS=YYYYMMDD,YYYYMMDD,YYYYMMDD
 * (for example to step around a bank holiday).
 */
const nextDay = (dow: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
};
const [wd, sa, su] = process.env.BUS_DAYS?.split(",") ?? [nextDay(2), nextDay(6), nextDay(0)];
const DAYS = { wd: wd!, sa: sa!, su: su! };

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
  execFileSync("python3", [join(ROOT, "scripts/gtfs-bus.py"), JSON.stringify({ zip, zones, days: DAYS, extraModes: EXTRA_MODES[name] ?? {}, out })], { stdio: "inherit" });
  const data = JSON.parse(readFileSync(out, "utf8")) as { stops: Record<string, { facts?: unknown }> };

  // Shelter, seat and kerb from OSM, joined on the NaPTAN code that both share.
  const osmInputs = "file" in area.osm ? [join(CACHE, "Edinburgh.osm.pbf")] : area.osm.apiTiles.map((_, i) => join(CACHE, `${name}-${i}.osm`));
  const factsFile = join(CACHE, `${name}.bus-stop-facts.json`);
  execFileSync("python3", [join(ROOT, "scripts/osm-bus-stops.py"), JSON.stringify({ inputs: osmInputs, out: factsFile })], { stdio: "inherit" });
  const facts = JSON.parse(readFileSync(factsFile, "utf8")) as Record<string, unknown>;
  let joined = 0;
  for (const [id, s] of Object.entries(data.stops)) if (facts[id]) (s.facts = facts[id], joined++);
  console.log(`${joined} of ${Object.keys(data.stops).length} stops have OSM facts`);
  writeFileSync(
    out,
    JSON.stringify({
      area: name,
      source: `Bus Open Data Service GTFS (${region}), timetables for ${DAYS.wd}, ${DAYS.sa} and ${DAYS.su}; stop facts from OpenStreetMap`,
      licence: "Open Government Licence v3.0",
      builtAt: new Date().toISOString().slice(0, 10),
      days: DAYS,
      ...data,
    }),
  );
}
