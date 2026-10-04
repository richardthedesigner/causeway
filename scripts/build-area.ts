/**
 * Build an area's honest graph: OSM + LiDAR terrain.
 *   pnpm build:area <name>     (names in scripts/areas.ts)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addTransit, buildGraphFromOsm, enrichWithTerrain, type TransitNetwork, loadChunkedDtm, parseOsmXml, registerOsgb, saveSnapshot, toOsgb, type OsmData } from "@causeway/graph/node";
import { AREAS } from "./areas.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, osmTileUrl, toArrayBuffer } from "./sources.js";

const area = AREAS[process.argv[2] ?? ""];
if (!area) throw new Error(`usage: build-area <${Object.keys(AREAS).join("|")}>`);
const ROOT = join(import.meta.dirname, "..");
const t0 = Date.now();
const log = (s: string) => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}\n`);

const osm: OsmData = { nodes: new Map(), ways: new Map() };
if ("file" in area.osm) {
  const p = join(CACHE, area.osm.file);
  if (!existsSync(p)) throw new Error(`missing ${p}: run scripts/osm-extract.py first (see README)`);
  parseOsmXml(readFileSync(p, "utf8"), osm);
} else {
  for (const [i, t] of area.osm.apiTiles.entries()) parseOsmXml((await cached(`${area.name}-${i}.osm`, osmTileUrl(t))).toString("utf8"), osm);
}
log(`parsed ${osm.nodes.size} nodes, ${osm.ways.size} ways`);
const g = buildGraphFromOsm(osm, { name: area.name, bbox: area.bbox, snapshot: `${area.osm.note}, built ${new Date().toISOString().slice(0, 10)}` });
log(`graph ${g.nodes.length} nodes, ${g.edges.length} edges, ${g.entrances?.length ?? 0} entrances`);

await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
function* points(): Generator<[number, number]> {
  for (const n of g.nodes) yield toOsgb(n.lon, n.lat);
  for (const e of g.edges) for (const [lon, lat] of e.geometry) yield toOsgb(lon, lat);
}
const dtm = await loadChunkedDtm(points(), area.dtm, { log });
log(`dtm ${JSON.stringify(dtm.stats)}`);
const stats = enrichWithTerrain(g, dtm);
log(`terrain sampled ${stats.sampledEdges}, off-ground ${stats.offGroundEdges}, discontinuities ${stats.discontinuities}, osm incline checks ${stats.inclineChecks.length}`);
g.meta.sources.push({ id: area.dtm[0]!.source, licence: "OGL-UK-3.0", attribution: area.terrainCredit, snapshot: `sources used: ${JSON.stringify(dtm.stats.byPhase)}` });

if (area.transit) {
  const net = JSON.parse(readFileSync(join(ROOT, area.transit), "utf8")) as TransitNetwork;
  const { stationNode, platformNode } = addTransit(g, net);
  log(`transit: ${stationNode.size} stations, ${platformNode.size} platforms, ${g.edges.filter((e) => e.kind === "station_link").length} street links`);
}

saveSnapshot(join(ROOT, `data/snapshots/${area.name}.graph.json.gz`), g);
writeFileSync(join(CACHE, `${area.name}.incline-checks.json`), JSON.stringify(stats.inclineChecks));
log("done");
