/**
 * Environment Agency flood areas (OGL v3; DATA-07, survey §2 #8) for each English area:
 * which walking edges lie inside each flood warning or alert area. The app fetches the
 * warnings in force live and closes or flags those edges (packages/live/src/floods.ts).
 *   pnpm build:floods
 * Writes data/live/<area>.flood-areas.json, keyed like the council layer by
 * "<osm way>:<from node>:<to node>". Flood areas change rarely; rerun after a graph rebuild.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "@causeway/graph/node";
import { AREAS } from "./areas.js";
import { inside, metresAt, type Pt } from "./geo-match.js";
import { CACHE } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const API = "https://environment.data.gov.uk/flood-monitoring";
/** Everything people walk or wheel along outside: a flood can cover any of it. */
const WALKED = new Set(["footway", "sidewalk", "pedestrian", "street_proxy", "ramp", "crossing", "steps", "path"]);

async function json<T>(url: string, file: string): Promise<T> {
  const p = join(CACHE, file);
  if (!existsSync(p)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

const english = Object.values(AREAS).filter((a) => "apiTiles" in a.osm);
for (const a of english) {
  const [x0, y0, x1, y1] = a.bbox;
  const { toM, middle } = metresAt((y0 + y1) / 2);
  const centre: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
  const km = Math.ceil(toM(x1 - x0, y1 - y0) / 2000) + 1;
  const list = await json<{ items: { notation: string; label: string }[] }>(`${API}/id/floodAreas?lat=${centre[1]}&long=${centre[0]}&dist=${km}&_limit=2000`, `ea-flood-areas-${a.name}.json`);
  const g = loadSnapshot(join(ROOT, `data/snapshots/${a.name}.graph.json.gz`));
  const edges = g.edges.filter((e) => WALKED.has(e.kind) && e.osmWayId).map((e) => ({ key: `${e.osmWayId}:${e.from}:${e.to}`, mid: middle(e.geometry as Pt[]) }));
  const areas: Record<string, { label: string; keys: string[] }> = {};
  for (const fa of list.items) {
    const poly = await json<{ features: { geometry: { type: string; coordinates: Pt[][] | Pt[][][] } }[] }>(`${API}/id/floodAreas/${encodeURIComponent(fa.notation)}/polygon`, `ea-flood-area-${fa.notation}.json`);
    // Each polygon of a MultiPolygon tested on its own, holes and all.
    const polys: Pt[][][] = poly.features.flatMap((f) => (f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as Pt[][][]) : [f.geometry.coordinates as Pt[][]]));
    const xs = polys.flat(2).map((p) => p[0]),
      ys = polys.flat(2).map((p) => p[1]);
    const [bx0, by0, bx1, by1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const keys = edges.filter(({ mid }) => mid[0] >= bx0 && mid[0] <= bx1 && mid[1] >= by0 && mid[1] <= by1 && polys.some((rings) => inside(mid, rings))).map((e) => e.key);
    if (keys.length) areas[fa.notation] = { label: fa.label, keys };
  }
  const out = join(ROOT, "data/live", `${a.name}.flood-areas.json`);
  writeFileSync(out, JSON.stringify({ area: a.name, source: "Environment Agency flood areas", licence: "Open Government Licence v3.0", fetchedAt: new Date().toISOString().slice(0, 10), areas }));
  console.log(`${a.name}: ${list.items.length} flood areas nearby, ${Object.keys(areas).length} cover our paths (${Object.values(areas).reduce((n, x) => n + x.keys.length, 0)} edge links)`);
}
