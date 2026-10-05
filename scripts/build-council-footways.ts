/**
 * Edinburgh's Adopted Roads (City of Edinburgh Council, OGL v3; DATA-06, survey §2 #5):
 * footway polygons with surface and width, matched to our pavement edges. Also the
 * council's priority-1 pavement gritting routes (layer 3; DATA-07, survey §2 #10).
 *   pnpm build:footways
 * Writes data/council/edinburgh-central.footways.json: a separate layer keyed by
 * "<osm way>:<from node>:<to node>", applied when the city loads and never written into
 * the OSM-derived graph (D-008). OSM's own surface and width always come first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "@causeway/graph/node";
import { councilSurface, type Surface } from "@causeway/graph";
import { inside, metresAt } from "./geo-match.js";
import { CACHE } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const AREA = "edinburgh-central";
const LAYER = "https://edinburghcouncilmaps.info/arcgis/rest/services/Transport/Transport/MapServer/23/query";
const GRITTING = "https://edinburghcouncilmaps.info/arcgis/rest/services/Transport/Transport/MapServer/3/query";
/** A pavement edge is on a gritting route when its middle is this close to one. */
const GRIT_M = 8;
const BBOX = [-3.25, 55.92, -3.15, 55.975] as const;
/** A street proxy takes the footways within this distance of its middle (a pavement either side). */
const PROXY_M = 12;

interface Feature {
  attributes: { OBJECTID: number; type: string; surface: string | null; width: number | null };
  geometry: { rings: [number, number][][] };
}

async function fetchFootways(): Promise<{ features: Feature[]; fetchedAt: string }> {
  const file = join(CACHE, "edinburgh-adopted-footways.json");
  if (existsSync(file)) return { features: JSON.parse(readFileSync(file, "utf8")), fetchedAt: new Date().toISOString().slice(0, 10) };
  mkdirSync(CACHE, { recursive: true });
  const features: Feature[] = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({
      where: "type like '%Footway%' OR type like 'Fway%'",
      geometry: JSON.stringify({ xmin: BBOX[0], ymin: BBOX[1], xmax: BBOX[2], ymax: BBOX[3], spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID,type,surface,width",
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: "5000",
      orderByFields: "OBJECTID",
      geometryPrecision: "6",
      f: "json",
    });
    const d = (await (await fetch(`${LAYER}?${q}`)).json()) as { features?: Feature[]; exceededTransferLimit?: boolean };
    features.push(...(d.features ?? []));
    offset += d.features?.length ?? 0;
    if (!d.features?.length || !d.exceededTransferLimit) break;
  }
  writeFileSync(file, JSON.stringify(features));
  return { features, fetchedAt: new Date().toISOString().slice(0, 10) };
}

async function fetchGritting(): Promise<[number, number][][]> {
  const file = join(CACHE, "edinburgh-pavement-gritting.json");
  if (!existsSync(file)) {
    const q = new URLSearchParams({
      where: "1=1",
      geometry: JSON.stringify({ xmin: BBOX[0], ymin: BBOX[1], xmax: BBOX[2], ymax: BBOX[3], spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID",
      outSR: "4326",
      geometryPrecision: "6",
      f: "json",
    });
    writeFileSync(file, Buffer.from(await (await fetch(`${GRITTING}?${q}`)).arrayBuffer()));
  }
  const d = JSON.parse(readFileSync(file, "utf8")) as { features: { geometry: { paths: [number, number][][] } }[] };
  return d.features.flatMap((f) => f.geometry?.paths ?? []);
}

const { features, fetchedAt } = await fetchFootways();
const gritLines = await fetchGritting();
const polys = features
  .filter((f) => f.geometry?.rings?.length)
  .map((f) => ({ rings: f.geometry.rings, surface: councilSurface(f.attributes.surface), width: f.attributes.width && f.attributes.width >= 0.5 && f.attributes.width <= 10 ? f.attributes.width : null }))
  .filter((p) => p.surface || p.width);

// A coarse grid (about 70 by 110 m) so each edge only tests nearby polygons.
const CELL = 0.001;
const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
const grid = new Map<string, number[]>();
polys.forEach((p, i) => {
  const xs = p.rings.flat().map((c) => c[0]),
    ys = p.rings.flat().map((c) => c[1]);
  for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++)
    for (let y = Math.floor(Math.min(...ys) / CELL); y <= Math.floor(Math.max(...ys) / CELL); y++) (grid.get(`${x}:${y}`) ?? grid.set(`${x}:${y}`, []).get(`${x}:${y}`)!).push(i);
});
const near = (x: number, y: number) => {
  const out = new Set<number>();
  const [cx, cy] = [Math.floor(x / CELL), Math.floor(y / CELL)];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const k of grid.get(`${cx + i}:${cy + j}`) ?? []) out.add(k);
  return [...out];
};
const { toM, lineDistance, distance, middle } = metresAt(55.95);
/** Worst surface first, so a street's two pavements give the rougher one. */
const ROUGH: Surface[] = ["sett", "paving_stones", "concrete", "asphalt"];

// Gritting lines on the same grid, by the cells their vertices fall in.
const gritGrid = new Map<string, number[]>();
gritLines.forEach((line, i) => {
  const add = (x: number, y: number) => {
    const list = gritGrid.get(key(x, y)) ?? gritGrid.set(key(x, y), []).get(key(x, y))!;
    if (!list.includes(i)) list.push(i);
  };
  // Every 20 m along each segment, so a long straight stretch is found from any cell beside it.
  for (let s = 1; s < line.length; s++) {
    const [a, b] = [line[s - 1]!, line[s]!];
    const n = Math.max(1, Math.ceil(toM(b[0] - a[0], b[1] - a[1]) / 20));
    for (let t = 0; t <= n; t++) add(a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n);
  }
});
const gritted = (pt: [number, number]) => {
  const [cx, cy] = [Math.floor(pt[0] / CELL), Math.floor(pt[1] / CELL)];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const k of gritGrid.get(`${cx + i}:${cy + j}`) ?? []) {
        if (lineDistance(pt, gritLines[k]!) <= GRIT_M) return true;
      }
  return false;
};

const g = loadSnapshot(join(ROOT, `data/snapshots/${AREA}.graph.json.gz`));
const PAVEMENT = new Set(["footway", "sidewalk", "pedestrian", "street_proxy", "ramp"]);
const edges: Record<string, [Surface | null, number | null, 0 | 1, 0 | 1]> = {};
let matched = 0;
for (const e of g.edges) {
  if (!PAVEMENT.has(e.kind) || !e.osmWayId) continue;
  const mid = middle(e.geometry);
  const proxy = e.kind === "street_proxy";
  const hits = near(mid[0], mid[1])
    .map((i) => polys[i]!)
    .filter((p) => (proxy ? distance(mid, p.rings) <= PROXY_M : inside(mid, p.rings)));
  const grit = gritted(mid) ? 1 : 0;
  if (!hits.length) {
    if (grit) (edges[`${e.osmWayId}:${e.from}:${e.to}`] = [null, null, proxy ? 1 : 0, 1]), matched++;
    continue;
  }
  const surfaces = hits.map((h) => h.surface).filter((s): s is Surface => !!s);
  const surface = surfaces.sort((a, b) => ROUGH.indexOf(a) - ROUGH.indexOf(b))[0] ?? null;
  const widths = hits.map((h) => h.width).filter((w): w is number => w !== null);
  const width = widths.length ? Math.min(...widths) : null;
  if (!surface && width === null && !grit) continue;
  // [surface, width in metres, 1 if it's the footway alongside a street proxy, 1 if on a priority gritting route]
  edges[`${e.osmWayId}:${e.from}:${e.to}`] = [surface, width === null ? null : Math.round(width * 10) / 10, proxy ? 1 : 0, grit];
  matched++;
}
mkdirSync(join(ROOT, "data/council"), { recursive: true });
const out = join(ROOT, `data/council/${AREA}.footways.json`);
writeFileSync(out, JSON.stringify({ area: AREA, source: "City of Edinburgh Council, Adopted Roads (List of Public Roads)", gritting: "City of Edinburgh Council, pavement gritting routes (priority 1)", licence: "Open Government Licence v3.0", fetchedAt, edges }));
const pav = g.edges.filter((e) => PAVEMENT.has(e.kind) && e.osmWayId).length;
console.log(`${polys.length} footway polygons; matched ${matched} of ${pav} pavement edges (${Object.values(edges).filter((v) => v[0] === "sett").length} setts, ${Object.values(edges).filter((v) => v[3]).length} on gritting routes)`);
