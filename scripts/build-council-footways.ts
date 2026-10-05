/**
 * Edinburgh's Adopted Roads (City of Edinburgh Council, OGL v3; DATA-06, survey §2 #5):
 * footway polygons with surface and width, matched to our pavement edges. Also the
 * council's priority 1 pavement gritting routes (DATA-07, survey §2 #10).
 *   pnpm build:footways
 * Writes data/council/edinburgh-central.footways.json: a separate layer keyed by
 * "<osm way>:<from node>:<to node>", applied when the city loads and never written into
 * the OSM-derived graph (D-008).
 *
 * Both layers must be listed as Open Government Licence v3 in the council's DCAT feed,
 * and each carries the date the council published it there. No licence or no date: no
 * build (D-046, D-047). Matching is along each edge, not at its middle
 * (scripts/council-footways-lib.ts, DATA-31).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot, registerOsgb, toOsgb } from "@causeway/graph/node";
import type { CouncilFootways } from "@causeway/graph";
import { dcatEntry, footwayFor, LineIndex, onGrittingRoute, PolygonIndex, type FootwayPolygon, type XY } from "./council-footways-lib.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const AREA = "edinburgh-central";
const DCAT = "https://data.edinburghcouncilmaps.info/api/feed/dcat-us/1.1.json";
const FOOTWAYS = "https://edinburghcouncilmaps.info/arcgis/rest/services/Transport/Transport/MapServer/23";
/**
 * "Gritting Routes" (Misc/INSPIRE layer 9): one line per street with a footway priority.
 * The Transport service's "Pavement gritting routes (priority 1)" (layer 3) has the same
 * lines but isn't in the council's DCAT feed, so it has no published licence.
 */
const GRITTING = "https://edinburghcouncilmaps.info/arcgis/rest/services/Misc/INSPIRE/MapServer/9";
const BBOX = [-3.25, 55.92, -3.15, 55.975] as const;
const UA = { "User-Agent": "Causewayside/0.1 (accessible wayfinding; github.com/richardthedesigner/causeway)" };

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const j = (await res.json()) as T & { error?: { message?: string } };
      if (j.error) throw new Error(`${url}: ${j.error.message ?? "error"}`);
      return j;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`fetch failed (attempt ${attempt}), retrying: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

/** Every feature of a layer in the area, in pages, cached in .data-cache. */
async function query<A>(service: string, where: string, outFields: string, file: string): Promise<{ attributes: A; geometry?: { rings?: [number, number][][]; paths?: [number, number][][] } }[]> {
  const p = join(CACHE, file);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  const out: { attributes: A; geometry?: { rings?: [number, number][][]; paths?: [number, number][][] } }[] = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({
      where,
      geometry: JSON.stringify({ xmin: BBOX[0], ymin: BBOX[1], xmax: BBOX[2], ymax: BBOX[3], spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      // British National Grid, reprojected here with OSTN15. Asked for WGS84, the server's own
      // transformation put the gritting lines about 90 m west of the streets (D-064).
      outSR: "27700",
      resultOffset: String(offset),
      resultRecordCount: "2000",
      orderByFields: "OBJECTID",
      geometryPrecision: "2",
      f: "json",
    });
    const d = await getJson<{ features?: typeof out; exceededTransferLimit?: boolean }>(`${service}/query?${q}`);
    out.push(...(d.features ?? []));
    offset += d.features?.length ?? 0;
    if (!d.features?.length || !d.exceededTransferLimit) break;
  }
  writeFileSync(p, JSON.stringify(out));
  return out;
}

// 1. Licences and published dates, from the council's DCAT feed.
const dcat = await getJson<Parameters<typeof dcatEntry>[0]>(DCAT);
const footwaysEntry = dcatEntry(dcat, FOOTWAYS);
const grittingEntry = dcatEntry(dcat, GRITTING);

// 2. The layers, in British National Grid metres.
await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
const plane = (p: readonly [number, number]): XY => toOsgb(p[0], p[1]);
const footwayFeatures = await query<{ OBJECTID: number; surface: string | null; width: number | null }>(FOOTWAYS, "type like '%Footway%' OR type like 'Fway%'", "OBJECTID,type,surface,width", "edinburgh-adopted-footways-bng.json");
const polys: FootwayPolygon[] = footwayFeatures
  .filter((f) => f.geometry?.rings?.length)
  .map((f) => ({ id: f.attributes.OBJECTID, surface: f.attributes.surface, width: f.attributes.width, rings: f.geometry!.rings! }));
if (polys.length < 1000) throw new Error(`only ${polys.length} footway polygons: refusing to write a thin layer`);
const gritFeatures = await query<{ OBJECTID: number }>(GRITTING, "footway__1 = 1", "OBJECTID,primary_ns,footway__1", "edinburgh-gritting-footway-p1-bng.json");
const gritLines: XY[][] = gritFeatures.flatMap((f) => f.geometry?.paths ?? []);
if (gritLines.length < 100) throw new Error(`only ${gritLines.length} priority 1 footway gritting lines: refusing to write a thin layer`);

// 3. Match to the graph.
const polyIndex = new PolygonIndex(polys);
const lineIndex = new LineIndex(gritLines);
const g = loadSnapshot(join(ROOT, `data/snapshots/${AREA}.graph.json.gz`));
const PAVEMENT = new Set(["footway", "sidewalk", "pedestrian", "street_proxy", "ramp"]);
const edges: CouncilFootways["edges"] = {};
for (const e of g.edges) {
  if (!PAVEMENT.has(e.kind) || !e.osmWayId) continue;
  const line = e.geometry.map(plane);
  const fw = footwayFor(e.kind, line, polyIndex);
  const grit = onGrittingRoute(e.kind, line, lineIndex) ? 1 : 0;
  if (!fw && !grit) continue;
  // [surface, width in metres, 1 if it's the footway alongside a street proxy, 1 if on a priority gritting route]
  edges[`${e.osmWayId}:${e.from}:${e.to}`] = [fw?.surface ?? null, fw?.width ?? null, e.kind === "street_proxy" ? 1 : 0, grit];
}

mkdirSync(join(ROOT, "data/council"), { recursive: true });
const layer: CouncilFootways = {
  area: AREA,
  source: "City of Edinburgh Council, Adopted Roads (List of Public Roads)",
  gritting: "City of Edinburgh Council, Gritting Routes (pavements, priority 1)",
  licence: "Open Government Licence v3.0",
  observedAt: footwaysEntry.publishedAt,
  grittingObservedAt: grittingEntry.publishedAt,
  edges,
};
writeFileSync(join(ROOT, `data/council/${AREA}.footways.json`), JSON.stringify(layer));
const v = Object.values(edges);
const pav = g.edges.filter((e) => PAVEMENT.has(e.kind) && e.osmWayId).length;
console.log(
  `${polys.length} footway polygons (published ${footwaysEntry.publishedAt}), ${gritLines.length} gritting lines (published ${grittingEntry.publishedAt}); ` +
    `${v.length} of ${pav} pavement edges: ${v.filter((x) => x[0]).length} with a surface (${v.filter((x) => x[0] === "sett").length} setts), ` +
    `${v.filter((x) => x[1] !== null).length} with a width (${v.filter((x) => x[1] !== null && x[1] < 1.2).length} under 1.2 m), ${v.filter((x) => x[3]).length} on gritting routes`,
);
