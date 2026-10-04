/// <reference lib="webworker" />
/**
 * Routing runs on the device, in a worker. The profile (health data) never
 * leaves the phone: it arrives here with each request and is not stored.
 */
import { addBus, isKnown, mobilityLabelFor, noteSignals, type Graph, type GraphEdge, type Stretch, type TransitNetwork, type BusNetwork } from "@causeway/graph";
import { applyEdgeStates, applyLiveStates, liftOutageStates, worksStates, type WorksObservation } from "@causeway/live";
import { PRESETS, type Profile } from "@causeway/profile";
import {
  buildNavPlan,
  busWait,
  describeSegments,
  elevationProfile,
  entrancesNear,
  explain,
  placeName,
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
let network: TransitNetwork | null = null;
/** Works from the area's built file and from live feeds, kept apart so a refresh replaces only its own. */
let fileWorks: { works: WorksObservation[]; source: string; builtAt: string } | null = null;
let liveWorks: { works: WorksObservation[]; fetchedAt: string } | null = null;
const WORKS_SOURCES = ["Street Manager", "TfL road disruptions"];

function applyWorks() {
  if (!graph) return;
  const all = [...(fileWorks?.works ?? []), ...(liveWorks?.works ?? [])];
  const now = new Date();
  applyEdgeStates(graph, worksStates(all, graph.edges, now), WORKS_SOURCES);
  const t = now.getTime();
  const current = all.filter((w) => Date.parse(w.start) <= t && Date.parse(w.end) > t);
  const sources = [fileWorks ? fileWorks.source : null, liveWorks ? "TfL road disruptions (live)" : null].filter((s): s is string => !!s);
  post({
    type: "works",
    summary: {
      closedNow: current.filter((w) => w.footway === "closed").length,
      affectedNow: current.filter((w) => w.footway === "affected").length,
      upcoming: all.filter((w) => Date.parse(w.start) > t).length,
      sources,
      asOf: liveWorks?.fetchedAt ?? fileWorks?.builtAt ?? now.toISOString(),
    },
  });
}

const post = (m: WorkerResponse) => self.postMessage(m);

async function load(url: string, networkUrl: string | undefined, worksUrl: string | undefined, busUrl: string | undefined, demo: Place[]) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`graph: HTTP ${res.status}`);
  // Hosts that won't serve .gz get the same bytes as base64 text (the private preview build).
  const gz = url.endsWith(".b64.txt") ? new Blob([Uint8Array.from(atob((await res.text()).trim()), (c) => c.charCodeAt(0))]).stream() : res.body;
  const text = await new Response(gz.pipeThrough(new DecompressionStream("gzip"))).text();
  graph = JSON.parse(text) as Graph;
  // Buses join before the router indexes the graph. No bus file: walking and rail still work.
  let buses: { stops: number; lines: number; source: string } | null = null;
  if (busUrl) {
    try {
      const net = (await (await fetch(busUrl)).json()) as BusNetwork;
      buses = { ...addBus(graph, net), source: net.source };
    } catch {
      buses = null;
    }
  }
  router = new Router(graph);
  network = networkUrl ? ((await (await fetch(networkUrl)).json()) as TransitNetwork) : null;
  post({ type: "ready", places: places(graph, demo, network), network: networkLines(graph), bbox: graph.meta.bbox, builtAt: graph.meta.builtAt, buses });
  if (worksUrl) {
    try {
      fileWorks = (await (await fetch(worksUrl)).json()) as { works: WorksObservation[]; source: string; builtAt: string };
      applyWorks();
    } catch {
      /* no works file: routes stand without it, and the panel says nothing about works */
    }
  }
}

/** Search index: demo places plus every street name in the graph (tagged names only, never borrowed ones). */
function places(g: Graph, demo: Place[], net: TransitNetwork | null): Place[] {
  const stations: Place[] = net
    ? [...new Map(Object.values(net.stations).map((st) => [st.name, st])).values()]
        .filter((st) => g.edges.some((e) => e.ref === `link:${st.id}`))
        .map((st) => ({ id: `station:${st.id}`, name: `${st.name} station`, kind: st.mode === "dlr" ? "DLR" : "Underground", lon: st.lon, lat: st.lat, venue: true }))
    : [];
  demo = [...demo, ...stations];
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

/** Base network for the map, binned by steepest gradient (0-4) or unknown (-1). Rail is not drawn as pavement. */
function networkLines(g: Graph) {
  const bin = (e: GraphEdge) => {
    if (e.kind === "steps") return 5;
    const v = isKnown(e.attrs.inclineMax) ? Math.abs(e.attrs.inclineMax.value) : null;
    if (v === null) return -1;
    return v < 3 ? 0 : v < 5 ? 1 : v < 8 ? 2 : v < 12 ? 3 : 4;
  };
  const rail = new Set(["transit", "board", "interchange", "station_link", "elevator"]);
  return g.edges.filter((e) => !rail.has(e.kind)).map((e) => ({ coords: e.geometry, bin: bin(e) }));
}

function toPlanned(r: Route, start: Parameters<typeof elevationProfile>[1], id: string, label: string, baseSeconds: number, now: Date, p: Profile): PlannedRoute {
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
  const busLegs = r.steps
    .filter((s) => s.forward && s.edge.kind === "board" && s.edge.service?.mode === "bus")
    .map((s) => {
      const sv = s.edge.service!;
      const w = busWait(sv.perHour, now);
      return { stopId: sv.stopId ?? "", stopName: (s.edge.name ?? "").split(", ")[0]!, route: sv.route, headsign: sv.headsign, perHour: w?.perHour ?? 0 };
    });
  return {
    nav: buildNavPlan(r, p),
    unknowns,
    busLegs,
    stretches: stretchesOf(r),
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

const RAIL_KINDS = new Set(["transit", "board", "interchange", "station_link", "elevator"]);

/** The route's named stretches in the order you reach them (a street you come back to joins its first visit). */
function stretchesOf(r: Route): (Stretch & { m: number })[] {
  const by = new Map<string, Stretch & { m: number }>();
  for (const s of r.steps) {
    if (RAIL_KINDS.has(s.edge.kind)) continue;
    const name = placeName(s.edge);
    const cur = by.get(name) ?? by.set(name, { name, edgeIds: [], osmWayIds: [], points: [], m: 0 }).get(name)!;
    cur.edgeIds.push(s.edge.id);
    if (s.edge.osmWayId !== undefined && !cur.osmWayIds.includes(s.edge.osmWayId)) cur.osmWayIds.push(s.edge.osmWayId);
    cur.points.push(s.edge.geometry[Math.floor(s.edge.geometry.length / 2)]!);
    cur.m += s.edge.lengthM;
  }
  return [...by.values()].map((x) => ({ ...x, m: Math.round(x.m) }));
}

function plan(req: Extract<WorkerRequest, { type: "plan" }>): PlanResult {
  if (!router || !graph) throw new Error("graph not loaded");
  const p = req.profile;
  const c = { ...req.conditions, now: new Date(req.conditions.now) };
  // Notes stay a separate layer: joined to edge ids here, per request, never written into the graph.
  router.noteSignals = noteSignals(req.notes, graph, c.now, mobilityLabelFor(p.preset), c.wet);
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
  const all = alts.map((r, i) => toPlanned(r, a, `r${i}`, i === 0 ? "Best for you" : "", best.seconds, c.now, p));
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
    route: t.route ? toPlanned(t.route, a, `t-${t.id}`, t.label, best.seconds, c.now, p) : null,
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
    if (m.type === "init") await load(m.graphUrl, m.networkUrl, m.worksUrl, m.busUrl, m.places);
    else if (m.type === "works-live") {
      liveWorks = { works: m.works, fetchedAt: m.fetchedAt };
      applyWorks();
    }
    else if (m.type === "live") {
      if (!graph || !network) return;
      for (const e of graph.edges) if (e.live?.affects === "step-free") delete e.live;
      const refs = new Set(graph.edges.map((e) => e.ref).filter((r): r is string => !!r));
      const applied = applyLiveStates(graph, liftOutageStates(m.outages, network, refs));
      post({ type: "live", applied, fetchedAt: m.outages[0]?.fetchedAt ?? new Date().toISOString() });
    }
    else if (m.type === "plan") post({ type: "plan", id: m.id, result: plan(m) });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
