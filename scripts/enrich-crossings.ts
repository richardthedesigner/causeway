/**
 * Add crossing cues and shared-path facts (packages/graph/src/crossing-info.ts) to committed snapshots,
 * from the cached OSM the area was built from, without the full LiDAR rebuild.
 *   pnpm tsx scripts/enrich-crossings.ts [area...]
 * New builds get these facts in buildGraphFromOsm directly.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addCrossingInfo, loadSnapshot, parseOsmXml, saveSnapshot, type OsmData } from "@causeway/graph/node";
import { AREAS } from "./areas.js";
import { CACHE } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(AREAS)) {
  const area = AREAS[name]!;
  const files = "file" in area.osm ? [join(CACHE, area.osm.file)] : area.osm.apiTiles.map((_, i) => join(CACHE, `${name}-${i}.osm`));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`missing OSM cache: ${missing.join(", ")}`);
  const osm: OsmData = { nodes: new Map(), ways: new Map() };
  for (const f of files) parseOsmXml(readFileSync(f, "utf8"), osm);
  const path = join(ROOT, "data/snapshots", `${name}.graph.json.gz`);
  const g = loadSnapshot(path);
  const r = addCrossingInfo(g, osm.nodes, osm.ways);
  saveSnapshot(path, g);
  console.log(`${name}: ${r.crossings} crossings, ${r.shared} shared paths`);
}
