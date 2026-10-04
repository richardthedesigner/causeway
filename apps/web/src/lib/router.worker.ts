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
  diagnose,
  elevationProfile,
  hazardText,
  entrancesNear,
  explain,
  placeName,
  Router,
  summarise,
  toGeoJSON,
  tradeoffs,
  type NavPlan,
  type Route,
} from "@causeway/router";
import type { Check, Place, PlannedRoute, PlanResult, RouteStrip, WorkerRequest, WorkerResponse } from "./plan-types";

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
  const rides: PlannedRoute["rides"] = [];
  let ride: PlannedRoute["rides"][number] | null = null;
  for (const s of r.steps) {
    if (s.edge.kind === "board" && s.forward) {
      const sv = s.edge.service;
      const line = (s.edge.name ?? "").split(", ").slice(1).join(", ");
      // Short labels for the map: "8", "Tram", "Metro", "Jubilee".
      const label = sv ? (sv.mode === "bus" ? sv.route : sv.mode === "tram" ? "Tram" : "Metro") : line.replace(/ line$/, "").replace(/ towards .*/, "");
      ride = { coords: [s.edge.geometry[0]!], label };
    } else if (s.edge.kind === "transit" && ride) {
      ride.coords.push(s.forward ? s.edge.geometry[s.edge.geometry.length - 1]! : s.edge.geometry[0]!);
    } else if (s.edge.kind === "board" && !s.forward && ride) {
      if (ride.coords.length > 1) rides.push(ride);
      ride = null;
    }
  }
  const nav = buildNavPlan(r, p);
  return {
    rides,
    nav,
    ...stripOf(r, nav),
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
const RIDE_KINDS = new Set(["transit", "board", "interchange"]);

/** Slope band for one step of a route: the same bins as the map's slope layer, plus steps and rides. */
function binOf(s: Route["steps"][number]): number {
  const e = s.edge;
  if (RIDE_KINDS.has(e.kind)) return 6;
  if (e.kind === "steps") return 5;
  if (e.kind === "elevator" || e.kind === "station_link") return 0;
  const a = e.attrs;
  const v = isKnown(a.inclineMax) ? Math.abs(a.inclineMax.value) : isKnown(a.incline) ? Math.abs(a.incline.value) : null;
  if (v === null) return -1;
  return v < 3 ? 0 : v < 5 ? 1 : v < 8 ? 2 : v < 12 ? 3 : 4;
}

/**
 * The route strip and the matching coloured line. Distances along the strip
 * use edge lengths, as the nav plan's hazards do; rides are shortened so a
 * train journey doesn't swallow the bar.
 */
function stripOf(r: Route, nav: NavPlan): { strip: RouteStrip; bands: PlannedRoute["bands"] } {
  const walkM = r.steps.filter((s) => !RIDE_KINDS.has(s.edge.kind)).reduce((t, s) => t + s.edge.lengthM, 0);
  const parts: RouteStrip["parts"] = [];
  const bands: PlannedRoute["bands"] = [];
  let t = 0;
  for (const s of r.steps) {
    const bin = binOf(s);
    const L = s.edge.lengthM;
    const last = parts[parts.length - 1];
    if (last && last.bin === bin) last.t1 = t + L;
    else parts.push({ t0: t, t1: t + L, d0: 0, d1: 0, bin });
    t += L;
    const g = s.forward ? s.edge.geometry : [...s.edge.geometry].reverse();
    const lb = bands[bands.length - 1];
    if (lb && lb.bin === bin) lb.coords.push(...g.slice(1));
    else bands.push({ bin, coords: [...g] });
  }
  let d = 0;
  for (const pt of parts) {
    const len = pt.t1 - pt.t0;
    pt.d0 = d;
    d += pt.bin === 6 ? Math.max(walkM * 0.06, Math.min(len, walkM * 0.15)) : len;
    pt.d1 = d;
  }
  const marks: RouteStrip["marks"] = [];
  for (const h of nav.hazards) {
    // Sideways slope is common and spoken during navigation; on the strip it would crowd out what decides the route.
    if (h.kind === "unknown" || h.kind === "camber" || (h.kind === "kerb" && !/not mapped/.test(h.title))) continue;
    marks.push({ at: h.at, kind: h.kind, text: hazardText(h) });
  }
  for (const m of nav.maneuvers) {
    if (m.type === "lift") marks.push({ at: m.at, kind: "lift", text: "Lift" });
    if (m.type === "board") marks.push({ at: m.at, kind: "ride", text: m.text });
  }
  marks.sort((a, b) => a.at - b.at);
  return { strip: { length: d, parts, marks }, bands };
}

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
  // A building: aim for the door that fits this person (D-018), not its middle. Fall back to the middle if no door fits or none is reachable.
  const isVenue = !!req.to.venue || req.to.id.startsWith("pin:");
  const entrances = isVenue ? entrancesNear(graph, req.to.lon, req.to.lat, p, 50).slice(0, 4) : [];
  const fits = entrances.find((e) => e.verdict.passable === "yes");
  let door: { name: string | null; osmId: number; detail: string } | null = null;
  let b = router.snap(req.to.lon, req.to.lat, p, c);
  let alts: Route[] = [];
  if (fits) {
    const bd = router.snap(fits.lon, fits.lat, p, c);
    alts = router.alternatives(a, bd, p, c, 3);
    if (alts.length) {
      b = bd;
      door = { name: fits.name, osmId: fits.osmId, detail: fits.verdict.detail };
    }
  }
  if (!alts.length) alts = router.alternatives(a, b, p, c, 3);
  if (!alts.length) {
    const bw = router.snap(req.to.lon, req.to.lat, PRESETS.walking, c);
    const d = diagnose(router, a, bw, p, PRESETS.walking, c);
    const cl = d.closest;
    const planned = cl ? toPlanned(cl.route, a, "closest", "As close as you can get", cl.route.seconds, c.now, p) : null;
    return {
      status: "none",
      message: d.blockers.length ? "No way there fits your limits" : "We couldn't find a way there",
      blockers: d.blockers,
      closest: cl && planned ? { ...planned, name: cl.name, leftM: cl.leftM, end: planned.coords[planned.coords.length - 1]! } : null,
      relax: d.relax ? { patch: d.relax.patch, what: d.relax.what, minutes: Math.round(d.relax.route.seconds / 60) } : null,
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
    entrances,
    door,
  };
}

/** Quick verdicts for places you've been before: one search each, no alternatives or explanations. */
function check(req: Extract<WorkerRequest, { type: "check" }>): Check[] {
  if (!router) return [];
  const c = { ...req.conditions, now: new Date(req.conditions.now) };
  const a = router.snap(req.from.lon, req.from.lat, req.profile, c);
  return req.to.map((pl) => {
    try {
      const r = router!.route(a, router!.snap(pl.lon, pl.lat, req.profile, c), req.profile, c);
      if (!r) return { placeId: pl.id, verdict: "none", minutes: null };
      const s = summarise(r, c.now);
      return { placeId: pl.id, verdict: s.verdict === "passable" ? "passable" : "passable-with-unknowns", minutes: Math.round(s.minutes) };
    } catch {
      return { placeId: pl.id, verdict: "none", minutes: null };
    }
  });
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  try {
    if (m.type === "init") await load(m.graphUrl, m.networkUrl, m.worksUrl, m.busUrl, m.places);
    else if (m.type === "toilets") router?.addToilets(m.points);
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
    else if (m.type === "check") post({ type: "check", id: m.id, checks: check(m) });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
