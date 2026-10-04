import {
  buildGraphFromOsm,
  compositeDtm,
  enrichWithTerrain,
  loadDtmWindow,
  parseOsmXml,
  registerOsgb,
  toOsgb,
  type Graph,
  type OsmData,
  type TerrainStats,
} from "@causeway/graph";
import { cached, EDINBURGH_OLD_TOWN as AREA, osmTileUrl, toArrayBuffer } from "./sources.js";

/**
 * Build the Edinburgh Old Town graph from OSM + LiDAR. With `fresh`, OSM is
 * fetched now rather than read from the cache (the live acceptance variant).
 */
export async function buildEdinburgh({ fresh = false } = {}): Promise<{ graph: Graph; stats: TerrainStats }> {
  const osm: OsmData = { nodes: new Map(), ways: new Map() };
  for (const [i, t] of AREA.osmTiles.entries()) {
    const xml = fresh
      ? Buffer.from(await (await fetch(osmTileUrl(t), { headers: { "User-Agent": "Causewayside/0.0" } })).arrayBuffer())
      : await cached(`${AREA.name}-${i}.osm`, osmTileUrl(t));
    parseOsmXml(xml.toString("utf8"), osm);
  }
  const graph = buildGraphFromOsm(osm, {
    name: AREA.name,
    bbox: AREA.bbox,
    snapshot: `OSM API /map, ${fresh ? "fetched live" : "cached"} ${new Date().toISOString().slice(0, 10)}`,
  });
  await registerOsgb(toArrayBuffer(await cached(AREA.ostn15.file, AREA.ostn15.url)));
  const [minE, minN] = toOsgb(AREA.bbox[0], AREA.bbox[1]);
  const [maxE, maxN] = toOsgb(AREA.bbox[2], AREA.bbox[3]);
  const meta = { source: "lidar-scotland" as const, observedAt: AREA.dtm.observedAt, label: AREA.dtm.label };
  const dtm = compositeDtm(
    await Promise.all(AREA.dtm.urls.map((u) => loadDtmWindow(u, { minE, minN, maxE, maxN }, meta))),
    AREA.dtm.label,
  );
  const stats = enrichWithTerrain(graph, dtm);
  graph.meta.sources.push({
    id: "lidar-scotland",
    licence: "OGL-UK-3.0",
    attribution:
      "Contains public sector information licensed under the Open Government Licence v3.0 (Scottish Government, LiDAR for Scotland)",
    snapshot: AREA.dtm.urls.join(" "),
  });
  return { graph, stats };
}
