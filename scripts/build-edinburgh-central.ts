/**
 * Phase 1: central Edinburgh honest graph.
 *   python3 scripts/osm-extract.py .data-cache/Edinburgh.osm.pbf .data-cache/edinburgh-central.osm -3.25 55.92 -3.15 55.975
 *   pnpm build:central
 * Writes the graph snapshot plus coverage and validation inputs for the report.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGraphFromOsm,
  enrichWithTerrain,
  loadChunkedDtm,
  parseOsmXml,
  registerOsgb,
  saveSnapshot,
  toOsgb,
} from "@causeway/graph/node";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

export const EDINBURGH_CENTRAL = {
  name: "edinburgh-central",
  bbox: [-3.25, 55.92, -3.15, 55.975] as [number, number, number, number],
  osm: "BBBike Edinburgh extract (download.bbbike.org/osm/bbbike/Edinburgh), OSM data to 2026-10-02T23:00Z",
};

const ROOT = join(import.meta.dirname, "..");
const t0 = Date.now();
const log = (s: string) => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}\n`);

const osm = parseOsmXml(readFileSync(join(CACHE, "edinburgh-central.osm"), "utf8"));
log(`parsed ${osm.nodes.size} nodes, ${osm.ways.size} ways`);
const g = buildGraphFromOsm(osm, { name: EDINBURGH_CENTRAL.name, bbox: EDINBURGH_CENTRAL.bbox, snapshot: EDINBURGH_CENTRAL.osm });
log(`graph ${g.nodes.length} nodes, ${g.edges.length} edges`);

await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
function* points(): Generator<[number, number]> {
  for (const n of g.nodes) yield toOsgb(n.lon, n.lat);
  for (const e of g.edges) for (const [lon, lat] of e.geometry) yield toOsgb(lon, lat);
}
const dtm = await loadChunkedDtm(points(), undefined, { log });
log(`dtm ${JSON.stringify(dtm.stats)}`);
const stats = enrichWithTerrain(g, dtm);
log(`terrain sampled ${stats.sampledEdges}, off-ground ${stats.offGroundEdges}, discontinuities ${stats.discontinuities}, osm incline checks ${stats.inclineChecks.length}`);
g.meta.sources.push({
  id: "lidar-scotland",
  licence: "OGL-UK-3.0",
  attribution: "Contains public sector information licensed under the Open Government Licence v3.0 (Scottish Government, LiDAR for Scotland)",
  snapshot: `phases used: ${JSON.stringify(dtm.stats.byPhase)}`,
});

saveSnapshot(join(ROOT, "data/snapshots/edinburgh-central.graph.json.gz"), g);
writeFileSync(join(CACHE, "edinburgh-central.incline-checks.json"), JSON.stringify(stats.inclineChecks));
log("done");
