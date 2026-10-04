/// <reference lib="webworker" />
/**
 * Routing runs on the device, in a worker. The profile (health data) never
 * leaves the phone: it arrives here with each request and is not stored.
 */
import { isKnown, type Graph, type GraphEdge } from "@causeway/graph";
import { PRESETS } from "@causeway/profile";
import {
  describeSegments,
  elevationProfile,
  entrancesNear,
  explain,
  Router,
  summarise,
  toGeoJSON,
  tradeoffs,
  type Route,
} from "@causeway/router";
import type { Place, PlannedRoute, PlanResult, WorkerRequest, WorkerResponse } from "./plan-types";

declare const self: DedicatedWorkerGlobalScope;
let router: Router | null = null;
let graph: Graph | null = null;

const post = (m: WorkerResponse) => self.postMessage(m);

async function load(url: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`graph: HTTP ${res.status}`);
  // Hosts that won't serve .gz get the same bytes as base64 text (the private preview build).
  const gz = url.endsWith(".b64.txt") ? new Blob([Uint8Array.from(atob((await res.text()).trim()), (c) => c.charCodeAt(0))]).stream() : res.body;
  const text = await new Response(gz.pipeThrough(new DecompressionStream("gzip"))).text();
  graph = JSON.parse(text) as Graph;
  router = new Router(graph);
  post({ type: "ready", places: places(graph), network: network(graph), bbox: graph.meta.bbox, builtAt: graph.meta.builtAt });
}

/** Search index: demo places plus every street name in the graph (tagged names only, never borrowed ones). */
function places(g: Graph): Place[] {
  const demo: Place[] = [
    { id: "causewayside", name: "Causewayside", kind: "Southside / demo address", lon: -3.1812, lat: 55.9385 },
    { id: "waverley", name: "Edinburgh Waverley", kind: "Railway station", lon: -3.1893, lat: 55.952, venue: true },
    { id: "grassmarket", name: "Grassmarket", kind: "Old Town", lon: -3.196, lat: 55.9476 },
    { id: "nms", name: "National Museum of Scotland", kind: "Chambers Street", lon: -3.1897, lat: 55.9469, venue: true },
    { id: "victoria-street", name: "Victoria Street", kind: "Old Town", lon: -3.1937, lat: 55.9484 },
    { id: "st-giles", name: "High Street by St Giles'", kind: "Royal Mile", lon: -3.1907, lat: 55.9496 },
    { id: "meadows", name: "The Meadows", kind: "Park", lon: -3.1925, lat: 55.9405 },
  ];
  const best = new Map<string, GraphEdge>();
  for (const e of g.edges) {
    if (!e.name || e.nameInferred || e.kind === "steps" || /^Platform/.test(e.name)) continue;
    const cur = best.get(e.name);
    if (!cur || e.lengthM > cur.lengthM) best.set(e.name, e);
  }
  const streets: Place[] = [...best.entries()]
    .filter(([name]) => !demo.some((d) => d.name === name))
    .map(([name, e]) => {
      const [lon, lat] = e.geometry[Math.floor(e.geometry.length / 2)]!;
      return { id: `street:${name}`, name, kind: "Street", lon, lat };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...demo, ...streets];
}

/** Base network for the map, binned by steepest gradient (0-4) or unknown (-1). */
function network(g: Graph) {
  const bin = (e: GraphEdge) => {
    if (e.kind === "steps") return 5;
    const v = isKnown(e.attrs.inclineMax) ? Math.abs(e.attrs.inclineMax.value) : null;
    if (v === null) return -1;
    return v < 3 ? 0 : v < 5 ? 1 : v < 8 ? 2 : v < 12 ? 3 : 4;
  };
  return g.edges.filter((e) => e.kind !== "elevator").map((e) => ({ coords: e.geometry, bin: bin(e) }));
}

function toPlanned(r: Route, start: Parameters<typeof elevationProfile>[1], id: string, label: string, baseSeconds: number, now: Date): PlannedRoute {
  const unknownCoords: [number, number][][] = [];
  for (const s of r.steps) {
    if (s.eval.passable !== "unknown" && s.nodeEval.passable !== "unknown") continue;
    unknownCoords.push(s.forward ? s.edge.geometry : [...s.edge.geometry].reverse());
  }
  const byName = new Map<string, { m: number; what: Set<string> }>();
  for (const s of r.steps) {
    const reasons = [...s.eval.reasons, ...s.nodeEval.reasons].filter((x) => x.kind === "unknown");
    if (!reasons.length) continue;
    const name = s.edge.name ?? "an unnamed path";
    const cur = byName.get(name) ?? byName.set(name, { m: 0, what: new Set() }).get(name)!;
    cur.m += s.edge.lengthM;
    for (const x of reasons) cur.what.add(x.detail);
  }
  const unknowns = [...byName.entries()]
    .map(([name, v]) => ({ name, m: Math.round(v.m), what: [...v.what].join(", ") }))
    .sort((a, b) => b.m - a.m);
  return {
    unknowns,
    id,
    label,
    coords: toGeoJSON(r).geometry.coordinates,
    unknownCoords,
    summary: summarise(r, now),
    elevation: elevationProfile(r, start),
    segments: describeSegments(r),
    minutesExtra: Math.max(0, Math.round((r.seconds - baseSeconds) / 60)),
  };
}

function plan(req: Extract<WorkerRequest, { type: "plan" }>): PlanResult {
  if (!router || !graph) throw new Error("graph not loaded");
  const p = req.profile;
  const c = { ...req.conditions, now: new Date(req.conditions.now) };
  const a = router.snap(req.from.lon, req.from.lat, p, c);
  const b = router.snap(req.to.lon, req.to.lat, p, c);
  const alts = router.alternatives(a, b, p, c, 3);
  if (!alts.length) {
    const w = router.route(router.snap(req.from.lon, req.from.lat, PRESETS.walking, c), router.snap(req.to.lon, req.to.lat, PRESETS.walking, c), PRESETS.walking, c);
    return {
      status: "none",
      message: "No way there fits your settings.",
      walkingHeadline: w ? `The walking route has ${summarise(w, c.now).steps ? "steps" : "slopes"} your settings rule out.` : null,
    };
  }
  const best = alts[0]!;
  const ex = explain(router, best, a, b, p, PRESETS.walking, c);
  const all = alts.map((r, i) => toPlanned(r, a, `r${i}`, i === 0 ? "Best for you" : "", best.seconds, c.now));
  // Different paths can still be the same choice to a person: drop alternatives that match an earlier one on time, distance and steepness.
  const same = (x: PlannedRoute, y: PlannedRoute) =>
    Math.abs(x.summary.minutes - y.summary.minutes) < 1.5 &&
    Math.abs(x.summary.distanceM - y.summary.distanceM) < 150 &&
    Math.abs(Math.abs(x.summary.worstInclinePct ?? 0) - Math.abs(y.summary.worstInclinePct ?? 0)) < 0.5;
  const routes = all.filter((r, i) => all.slice(0, i).every((o) => !same(o, r)));
  // Name alternatives by what makes them different, not by number.
  const b0 = routes[0]!.summary;
  for (const r of routes.slice(1)) {
    const s = r.summary;
    const setts = (x: typeof s) => (x.surfaceMix["setts"] ?? 0) + (x.surfaceMix["cobbles"] ?? 0);
    r.label =
      s.unknownM < b0.unknownM - 50
        ? "Fewer unknowns"
        : Math.abs(s.worstInclinePct ?? 0) < Math.abs(b0.worstInclinePct ?? 0) - 0.4
          ? "Gentler"
          : setts(s) < setts(b0) - 30
            ? "Fewer setts"
            : s.lifts < b0.lifts
              ? "Fewer lifts"
              : "Another way";
  }
  const seen = new Set<string>();
  for (const r of routes) {
    if (seen.has(r.label)) r.label = "Another way";
    seen.add(r.label);
  }
  const tos = tradeoffs(router, best, a, b, p, c).map((t) => ({
    id: t.id,
    label: t.label,
    message: t.message,
    route: t.route ? toPlanned(t.route, a, `t-${t.id}`, t.label, best.seconds, c.now) : null,
  }));
  return {
    status: "ok",
    routes,
    headline: ex.headline,
    notes: ex.notes,
    avoided: ex.avoided.slice(0, 4).map((x) => ({ name: x.name, detail: x.reason.detail })),
    tradeoffs: tos,
    entrances: entrancesNear(graph, req.to.lon, req.to.lat, p, 50).slice(0, 4),
  };
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  try {
    if (m.type === "init") await load(m.graphUrl);
    else if (m.type === "plan") post({ type: "plan", id: m.id, result: plan(m) });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
