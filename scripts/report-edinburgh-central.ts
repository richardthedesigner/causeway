/**
 * Phase 1 coverage, validation and performance report for central Edinburgh.
 *   pnpm report:central
 * Writes docs/PHASE1_COVERAGE.md and the debug map data.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  confidence,
  isKnown,
  loadSnapshot,
  os1km,
  registerOsgb,
  toOsgb,
  type Attr,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type InclineCheck,
} from "@causeway/graph";
import { PRESETS } from "@causeway/profile";
import { Router, summarise } from "@causeway/router";
import { EDINBURGH_JOURNEYS } from "./journeys.js";
import { cached, CACHE, EDINBURGH_OLD_TOWN, toArrayBuffer } from "./sources.js";

const ROOT = join(import.meta.dirname, "..");
const g: Graph = loadSnapshot(join(ROOT, "data/snapshots/edinburgh-central.graph.json.gz"));
const now = new Date(g.meta.builtAt);
await registerOsgb(toArrayBuffer(await cached(EDINBURGH_OLD_TOWN.ostn15.file, EDINBURGH_OLD_TOWN.ostn15.url)));
const nodes = new Map<number, GraphNode>(g.nodes.map((n) => [n.id, n]));

const [bx0, by0, bx1, by1] = g.meta.bbox;
const inArea = (e: GraphEdge) => {
  const [lon, lat] = e.geometry[Math.floor(e.geometry.length / 2)]!;
  return lon >= bx0 && lon <= bx1 && lat >= by0 && lat <= by1;
};
// Ways crossing the boundary are kept whole in the graph; statistics count only segments whose midpoint is inside.
const walkable = g.edges.filter((e) => e.kind !== "elevator" && e.lengthM > 0 && inArea(e));
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);

// ---------------------------------------------------------------- coverage
type Cov = { len: number; incline: number; cross: number; surface: number; width: number; mapped: number; conf: number; crossings: number; kerbKnown: number; kerbInferred: number };
const blank = (): Cov => ({ len: 0, incline: 0, cross: 0, surface: 0, width: 0, mapped: 0, conf: 0, crossings: 0, kerbKnown: 0, kerbInferred: 0 });
const city = blank();
const squares = new Map<string, Cov>();
const kerbState = (id: number): "reported" | "inferred" | "unknown" => {
  const k = nodes.get(id)?.kerb;
  if (!k || k.type.state === "unknown") return "unknown";
  return k.type.state === "inferred" ? "inferred" : "reported";
};
for (const e of walkable) {
  const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
  const sq = os1km(...toOsgb(mid[0], mid[1]));
  const c = squares.get(sq) ?? squares.set(sq, blank()).get(sq)!;
  for (const t of [city, c]) {
    const L = e.lengthM;
    t.len += L;
    if (isKnown(e.attrs.incline) || e.kind === "steps") t.incline += L;
    if (isKnown(e.attrs.crossSlope)) t.cross += L;
    if (isKnown(e.attrs.surface)) t.surface += L;
    if (isKnown(e.attrs.width)) t.width += L;
    if (e.kind !== "street_proxy") t.mapped += L;
    t.conf += L * ((confidence(e.attrs.incline, now) + confidence(e.attrs.surface, now) + confidence(e.attrs.width, now)) / 3);
    if (e.kind === "crossing") {
      t.crossings++;
      const s = [kerbState(e.from), kerbState(e.to)];
      if (s.every((x) => x === "reported")) t.kerbKnown++;
      else if (s.every((x) => x !== "unknown")) t.kerbInferred++;
    }
  }
}

// -------------------------------------------------------------- validation
const checksPath = join(CACHE, "edinburgh-central.incline-checks.json");
const checks: InclineCheck[] = existsSync(checksPath) ? JSON.parse(readFileSync(checksPath, "utf8")) : [];
// OSM incline tags are often the steepest part, and "up/down" sign errors are common: compare magnitudes against both mean and max.
const diffs = checks.map((c) => ({ ...c, d: Math.min(Math.abs(Math.abs(c.osm) - Math.abs(c.lidarMean)), Math.abs(Math.abs(c.osm) - Math.abs(c.lidarMax))), signAgrees: Math.sign(c.osm) === Math.sign(c.lidarMean) || Math.abs(c.lidarMean) < 1 }));
diffs.sort((a, b) => a.d - b.d);
const median = diffs.length ? diffs[Math.floor(diffs.length / 2)]!.d : NaN;
const within2 = diffs.filter((x) => x.d <= 2).length;
const signOk = diffs.filter((x) => x.signAgrees).length;

// ------------------------------------------------------------------- kerbs
const kerbNodes = g.nodes.filter((n) => n.kerb);
const kerbBy = (state: string) => kerbNodes.filter((n) => n.kerb!.type.state === state).length;
const kerbType = (t: string) => kerbNodes.filter((n) => n.kerb!.type.value === t).length;

// ------------------------------------------------------------- performance
const router = new Router(g);
const p = PRESETS["manual-wheelchair"];
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const [minLon, minLat, maxLon, maxLat] = g.meta.bbox;
const times: number[] = [];
let found = 0;
for (let i = 0; i < 200; i++) {
  const a = router.snap(minLon + rand() * (maxLon - minLon), minLat + rand() * (maxLat - minLat), p);
  const b = router.snap(minLon + rand() * (maxLon - minLon), minLat + rand() * (maxLat - minLat), p);
  const t = performance.now();
  const r = router.route(a, b, p);
  times.push(performance.now() - t);
  if (r) found++;
}
times.sort((a, b) => a - b);
const pctl = (q: number) => times[Math.floor(times.length * q)]!.toFixed(0);

// ------------------------------------------------------------- journeys
const journeyRows = EDINBURGH_JOURNEYS.map((j) => {
  const r = router.route(router.snap(j.from.lon, j.from.lat, p), router.snap(j.to.lon, j.to.lat, p), p);
  if (!r) return `| ${j.title} | no route | | | |`;
  const s = summarise(r, now);
  return `| ${j.title} | ${Math.round(s.minutes)} min / ${(s.distanceM / 1000).toFixed(1)} km | ${s.steps} | ${s.worstInclinePct === null ? "unknown" : Math.abs(s.worstInclinePct) + "%"} | ${s.unknownM} m |`;
});

// ------------------------------------------------------------------ write
const row = (name: string, c: Cov) =>
  `| ${name} | ${(c.len / 1000).toFixed(1)} km | ${pct(c.incline, c.len)}% | ${pct(c.cross, c.len)}% | ${pct(c.surface, c.len)}% | ${pct(c.width, c.len)}% | ${pct(c.mapped, c.len)}% | ${c.crossings ? `${pct(c.kerbKnown, c.crossings)}% / ${pct(c.kerbInferred, c.crossings)}%` : "n/a"} | ${(c.conf / c.len).toFixed(2)} |`;
const header = "| Area | Network | Incline | Cross-slope | Surface | Width | Pavement mapped | Crossings: kerbs mapped / inferred | Mean confidence |\n|---|---|---|---|---|---|---|---|---|";
const sqRows = [...squares.entries()].filter(([, c]) => c.len > 2000).sort((a, b) => a[0].localeCompare(b[0]));

const md = `# Phase 1 coverage: central Edinburgh

Generated by \`pnpm report:central\` from \`data/snapshots/edinburgh-central.graph.json.gz\` (${g.nodes.length.toLocaleString("en-GB")} nodes, ${g.edges.length.toLocaleString("en-GB")} edges, built ${g.meta.builtAt.slice(0, 10)}).

Area: ${g.meta.bbox.join(", ")} (Haymarket to Abbeyhill, Canonmills to the Grange; includes Causewayside).
Sources: ${g.meta.sources.map((s) => `${s.id} (${s.licence}): ${s.snapshot}`).join("; ")}.

"Known" means any state other than unknown. Inferred values count as known but carry lower confidence; see the confidence column.

## Whole area

${header}
${row("Central Edinburgh", city)}

## By OS 1 km square

Squares with at least 2 km of network.

${header}
${sqRows.map(([k, c]) => row(k, c)).join("\n")}

## Kerbs

| | Nodes |
|---|---|
| Kerb nodes | ${kerbNodes.length} |
| Mapped in OSM (reported) | ${kerbBy("reported")} |
| Inferred from UK crossing type | ${kerbBy("inferred")} |
| Lowered / flush / raised | ${kerbType("lowered")} / ${kerbType("flush")} / ${kerbType("raised")} |
| With a measured height | ${kerbNodes.filter((n) => isKnown(n.kerb!.heightCm)).length} |

## Validation: OSM incline tags against LiDAR

${checks.length} edges carry both a numeric OSM \`incline\` tag and a LiDAR gradient. Compared by magnitude against the closer of the LiDAR mean and steepest 10 m window (mappers usually tag the steepest part).${checks.length < 50 ? `

**${checks.length} is too few to validate the LiDAR gradients.** Numeric incline tags are rare in OSM (most are "up" or "down"). Validation needs measured ground truth: an inclinometer survey of a sample of segments in each city (Phase 1 field task).` : ""}

- Median difference: ${Number.isNaN(median) ? "n/a" : median.toFixed(1)} percentage points.
- Within 2 points: ${within2} of ${checks.length} (${pct(within2, checks.length)}%).
- Direction (up/down) agrees, or the edge is nearly flat: ${signOk} of ${checks.length} (${pct(signOk, checks.length)}%).

Largest disagreements (candidates for a survey or an OSM fix):

| Way | Length | OSM | LiDAR mean | LiDAR steepest |
|---|---|---|---|---|
${diffs.slice(-12).reverse().map((x) => `| ${x.name ?? "unnamed"} | ${x.lengthM} m | ${x.osm}% | ${x.lidarMean}% | ${x.lidarMax}% |`).join("\n")}

## Router at area scale

200 random origin and destination pairs, manual wheelchair profile, single thread: p50 ${pctl(0.5)} ms, p95 ${pctl(0.95)} ms, max ${times.at(-1)!.toFixed(0)} ms. Routes found: ${found} of 200 (the rest have no step-free path within the limits, or start in a disconnected fragment).

## Acceptance journeys on the area graph (manual wheelchair)

| Journey | Time / distance | Steps | Steepest | Unknown |
|---|---|---|---|---|
${journeyRows.join("\n")}
`;
writeFileSync(join(ROOT, "docs/PHASE1_COVERAGE.md"), md);

// ------------------------------------------------------------- debug data
// Compact, columnar: the debug map draws every edge coloured by any attribute and shows source/date/method on tap.
const STATES = ["unknown", "inferred", "reported", "verified"];
const pack = (a: Attr<unknown>) => (a.state === "unknown" ? null : [a.value, STATES.indexOf(a.state), a.source, a.observedAt?.slice(0, 10) ?? null, a.method ?? null]);
const strings = new Map<string, number>();
const s = (v: string | null) => (v === null ? -1 : (strings.get(v) ?? strings.set(v, strings.size).get(v)!));
const packS = (a: Attr<unknown>) => {
  const x = pack(a);
  return x && [typeof x[0] === "string" ? s(x[0] as string) : x[0], x[1], s(x[2] as string), s(x[3] as string | null), s(x[4] as string | null)];
};
const q = (v: number) => Math.round(v * 1e5);
const edges = walkable.map((e: GraphEdge) => {
  const c: number[] = [];
  let px = 0,
    py = 0;
  for (const [lon, lat] of e.geometry) {
    c.push(q(lon) - px, q(lat) - py);
    px = q(lon);
    py = q(lat);
  }
  const a = e.attrs;
  return [s(e.kind), s(e.name), c, packS(a.incline), packS(a.inclineMax), packS(a.crossSlope), packS(a.surface), packS(a.width), packS(a.smoothness), e.level, e.bridge ? 1 : 0, e.osmWayId ?? null];
});
const kerbs = kerbNodes.map((n) => [q(n.lon), q(n.lat), packS(n.kerb!.type), packS(n.kerb!.heightCm), packS(n.kerb!.tactilePaving)]);
const lifts = g.nodes.filter((n) => n.kind === "elevator").map((n) => [q(n.lon), q(n.lat), n.level]);
mkdirSync(join(ROOT, "docs/debug"), { recursive: true });
writeFileSync(
  join(ROOT, "docs/debug/edinburgh-central.json"),
  JSON.stringify({ meta: { ...g.meta, states: STATES }, strings: [...strings.keys()], edges, kerbs, lifts }),
);
console.log(md);
