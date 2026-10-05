/**
 * Park gates from OS Open Greenspace (Ordnance Survey, OGL v3; DATA-08, survey §2 #11),
 * so a route to a park ends at a gate, not in the middle of the grass.
 *   pnpm build:greenspace
 * Writes data/places/<area>.greenspace.json: named sites with a bounding box and their
 * pedestrian access points.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromOsgb, registerOsgb, toOsgb } from "@causeway/graph/node";
import { AREAS } from "./areas.js";
import { CACHE, EDINBURGH_OLD_TOWN, cached, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const URL_ = (tile: string) => `https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads?area=${tile}&format=ESRI%C2%AE+Shapefile&redirect`;
/** The 100 km squares our areas sit in. */
const TILES: Record<string, string> = { "edinburgh-central": "NT", "newcastle-gateshead": "NZ", "london-jubilee": "TQ" };

await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
const dir = join(CACHE, "ogs");
mkdirSync(dir, { recursive: true });
for (const t of new Set(Object.values(TILES))) {
  const zip = join(CACHE, `opgrsp_essh_${t.toLowerCase()}.zip`);
  if (!existsSync(zip)) execFileSync("curl", ["-sSL", "-o", zip, URL_(t)], { stdio: "inherit" });
  if (!existsSync(join(dir, `${t}_AccessPoint.shp`))) execFileSync("unzip", ["-o", "-q", "-j", zip, "*data/*", "-d", dir], { stdio: "inherit" });
}
const boxes = Object.fromEntries(
  Object.values(AREAS).map((a) => {
    const [e0, n0] = toOsgb(a.bbox[0], a.bbox[1]);
    const [e1, n1] = toOsgb(a.bbox[2], a.bbox[3]);
    return [a.name, [e0, n0, e1, n1]];
  }),
);
const extract = join(CACHE, "greenspace.json");
execFileSync("python3", [join(ROOT, "scripts/greenspace-extract.py"), JSON.stringify({ dir, tiles: [...new Set(Object.values(TILES))], boxes, out: extract })], { stdio: "inherit" });
const all = JSON.parse((await import("node:fs")).readFileSync(extract, "utf8")) as Record<string, { id: string; name: string; function: string; bbox: number[]; gates: [number, number, string][] }[]>;
const ll = (e: number, n: number) => fromOsgb(e, n).map((v) => Math.round(v * 1e6) / 1e6) as [number, number];
for (const [area, sites] of Object.entries(all)) {
  const out = sites.map((s) => ({
    name: s.name,
    function: s.function,
    bbox: [...ll(s.bbox[0]!, s.bbox[1]!), ...ll(s.bbox[2]!, s.bbox[3]!)],
    gates: s.gates.map(([e, n, kind]) => [...ll(e, n), kind === "Pedestrian" ? 0 : 1]),
  }));
  writeFileSync(join(ROOT, "data/places", `${area}.greenspace.json`), JSON.stringify({ area, source: "OS Open Greenspace", licence: "Open Government Licence v3.0. Contains OS data © Crown copyright and database right", sites: out }));
  console.log(`${area}: ${out.length} named greenspaces, ${out.reduce((n, s) => n + s.gates.length, 0)} gates`);
}
