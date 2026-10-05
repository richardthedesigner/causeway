/**
 * Build an area's search index: named places with OSM access tags, addresses and postcodes.
 *   pnpm build:places <name>     (names in scripts/areas.ts)
 * Writes data/places/<name>.json.gz. Edinburgh reads the BBBike PBF; the API-tile areas read their cached tiles.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { AREAS } from "./areas.js";
import { mergeOverture } from "./overture-merge.js";
import { cached, CACHE, osmTileUrl } from "./sources.js";

const area = AREAS[process.argv[2] ?? ""];
if (!area) throw new Error(`usage: build-places <${Object.keys(AREAS).join("|")}>`);
const ROOT = join(import.meta.dirname, "..");

let inputs: string[];
let zones: [number, number, number, number][];
let source: string;
if ("file" in area.osm) {
  const pbf = join(CACHE, "Edinburgh.osm.pbf");
  if (!existsSync(pbf)) throw new Error(`missing ${pbf}`);
  inputs = [pbf];
  zones = [area.bbox];
  source = area.osm.note;
} else {
  inputs = [];
  for (const [i, t] of area.osm.apiTiles.entries()) {
    await cached(`${area.name}-${i}.osm`, osmTileUrl(t));
    inputs.push(join(CACHE, `${area.name}-${i}.osm`));
  }
  zones = area.osm.apiTiles;
  source = area.osm.note;
}

mkdirSync(join(ROOT, "data/places"), { recursive: true });
const out = join(ROOT, "data/places", `${area.name}.json`);
execFileSync("python3", [join(ROOT, "scripts/places-extract.py"), JSON.stringify({ inputs, zones, out })], { stdio: "inherit" });
const data = JSON.parse(readFileSync(out, "utf8")) as { places: { n: string; c: string; x: number; y: number; [k: string]: unknown }[] };

// Overture adds the venues OSM hasn't mapped (no access tags; they fill search, nothing else).
const OVERTURE_RELEASE = "2026-09-23.1";
const ovOut = join(CACHE, `${area.name}.overture-${OVERTURE_RELEASE}.json`);
if (!existsSync(ovOut)) execFileSync("python3", [join(ROOT, "scripts/overture-places.py"), JSON.stringify({ release: OVERTURE_RELEASE, zones, out: ovOut })], { stdio: "inherit" });
const overture = JSON.parse(readFileSync(ovOut, "utf8")) as { id: string; n: string; c: string | null; h?: string[]; x: number; y: number; ad: string | null; conf: number | null; src?: string[] }[];
const before = data.places.length;
data.places.push(...mergeOverture(data.places, overture));
console.log(`${data.places.length - before} places added from Overture ${OVERTURE_RELEASE}`);
writeFileSync(`${out}.gz`, gzipSync(JSON.stringify({ area: area.name, source: `${source}; Overture Maps places ${OVERTURE_RELEASE}`, builtAt: new Date().toISOString().slice(0, 10), zones, ...data })));
rmSync(out);

