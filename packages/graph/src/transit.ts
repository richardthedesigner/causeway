/**
 * Step-free rail as part of the pedestrian graph. Phase 3 "transit lite":
 * stations, platforms per line, rides between consecutive stops, boarding,
 * and same-building interchanges are edges, so one cost model, one router
 * and one "Why this way?" cover the whole journey, and a lift outage is just
 * a live state on the right edge. OpenTripPlanner (D-003) replaces the ride
 * layer when timetables matter; the station and lift modelling carries over.
 */
import { attr, unknownAttr, type Attr } from "./attribute.js";
import { haversine } from "./geo.js";
import type { EdgeAttrs, Graph, GraphEdge, GraphNode, PlatformBoarding } from "./schema.js";

export interface TransitStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  mode: "tube" | "dlr" | "rail";
  /** TfL hub (interchange complex) the station belongs to. */
  hub: string | null;
  /** Street to platform without steps. */
  stepFree: "yes" | "no" | "unknown";
  /** Where the step-free fact came from, shown on request. */
  stepFreeSource: string;
  /** TfL's own interchange or access note, verbatim. */
  note: string | null;
  /** How the station's areas join up, from TfL's station data (DATA-03). Absent where TfL has none. */
  access?: StationAccess;
}

/**
 * A station's step-free layout from TfL's station data: the areas (ticket hall,
 * concourse, platforms) and the level paths, ramps and lifts between them.
 * Anything not listed (stairs, escalators) isn't step-free. A lift outage then
 * closes exactly the lines it cuts off, with no reading of the message text.
 */
export interface StationAccess {
  /** TfL's station id, as the lift feed names it ("HUBWSM", "940GZZLUCYF"). */
  tflId: string;
  /** Where the street is in `paths`. */
  outside: string;
  /** Area to area. The third value is the lift joining them, or null for a level path or ramp. Both ways. */
  paths: [string, string, string | null][];
  lines: Record<string, StationLineAccess>;
  /** Toilets TfL lists at the station. */
  toilets: { accessible: boolean; radar: boolean; insideGate: boolean; location: string | null }[];
  source: string;
}

export interface StationLineAccess {
  /** This line's platform areas (one per direction, usually). */
  platforms: string[];
  /** TfL says it has step-free route information for these platforms. */
  mapped: boolean;
  /** Platform to train, in words: the step and gap, or where level boarding is. */
  train: string | null;
  /** Platform to train, in figures, one entry per platform (D-060). Absent in data built before it. */
  boarding?: PlatformBoarding[];
}

/**
 * Which of a station's lines can be reached from the street without steps,
 * given lifts that are out. "yes": every platform of the line; "part": some
 * (one direction only); "no": none, where TfL has mapped the routes; "unknown":
 * none, and TfL hasn't mapped them.
 */
export function stepFreeLines(a: StationAccess, liftsOut: ReadonlySet<string> = new Set()): Record<string, "yes" | "part" | "no" | "unknown"> {
  const next = new Map<string, string[]>();
  const link = (x: string, y: string) => (next.get(x) ?? next.set(x, []).get(x)!).push(y);
  for (const [x, y, lift] of a.paths) {
    if (lift && liftsOut.has(lift)) continue;
    link(x, y);
    link(y, x);
  }
  const seen = new Set([a.outside]);
  const queue = [a.outside];
  while (queue.length) for (const y of next.get(queue.pop()!) ?? []) if (!seen.has(y)) seen.add(y), queue.push(y);
  const out: Record<string, "yes" | "part" | "no" | "unknown"> = {};
  for (const [line, l] of Object.entries(a.lines)) {
    const n = l.platforms.filter((p) => seen.has(p)).length;
    out[line] = n && n === l.platforms.length ? "yes" : n ? "part" : l.mapped ? "no" : "unknown";
  }
  return out;
}

/**
 * Give every ride edge a ref, `ride:<line>:<station>:<station>`, so a line
 * closure can find the stretch it closes (DATA-04). Snapshots built before
 * rides had refs get them from the board edges at either end. Returns how many
 * were labelled.
 */
export function refRides(g: Graph): number {
  const platform = new Map<number, { line: string; station: string }>();
  for (const e of g.edges) {
    if (e.kind !== "board" || !e.ref || e.service) continue;
    const [, line, station] = e.ref.split(":");
    if (line && station) platform.set(e.to, { line, station });
  }
  let n = 0;
  for (const e of g.edges) {
    if (e.kind !== "transit" || e.ref || e.service) continue;
    const a = platform.get(e.from),
      b = platform.get(e.to);
    if (!a || !b || a.line !== b.line) continue;
    e.ref = `ride:${a.line}:${a.station}:${b.station}`;
    n++;
  }
  return n;
}

/**
 * Put TfL's per-line step-free facts on a graph's board edges (`board:<line>:<station>`).
 * Run when a city loads, so a refreshed network.json needs no graph rebuild.
 * Returns how many board edges changed.
 */
export function applyStationAccess(g: Graph, net: TransitNetwork): number {
  let n = 0;
  const byRef = new Map(g.edges.filter((e) => e.kind === "board" && e.ref).map((e) => [e.ref!, e]));
  for (const s of Object.values(net.stations)) {
    if (!s.access) continue;
    for (const [line, state] of Object.entries(stepFreeLines(s.access))) {
      const e = byRef.get(`board:${line}:${s.id}`);
      if (!e) continue;
      const train = s.access.lines[line]?.train;
      const why = `${s.access.source}: ${state === "yes" ? "step-free from street to every platform" : state === "part" ? "step-free to some platforms only" : state === "no" ? "no step-free route to the platform" : "no step-free route information"}${train ? `. ${train}` : ""}`;
      e.attrs.stepCount = state === "yes" ? attr(0, "reported", "tfl", net.fetchedAt, why) : state === "no" ? attr(1, "reported", "tfl", net.fetchedAt, why) : { ...unknownAttr<number>(), method: why };
      e.attrs.wheelchair = state === "yes" ? attr("yes", "reported", "tfl", net.fetchedAt, why) : state === "no" ? attr("no", "reported", "tfl", net.fetchedAt, why) : unknownAttr();
      const boarding = s.access.lines[line]?.boarding;
      if (boarding?.length) e.boarding = { platforms: boarding, source: s.access.source };
      n++;
    }
  }
  return n;
}

export interface TransitRoute {
  line: string;
  lineName: string;
  mode: TransitStation["mode"];
  stops: string[];
}

export interface TransitNetwork {
  source: string;
  fetchedAt: string;
  stations: Record<string, TransitStation>;
  routes: TransitRoute[];
}

/** Average speed between stops including dwell, metres per second (about 30 km/h). */
const RIDE_MPS = 8.5;
/** Same-building interchanges closer than this get a direct edge; farther ones go via the street graph. */
const SAME_BUILDING_M = 150;
/** Street link: connect a station to street nodes within this distance. */
const LINK_M = 180;

const platformId = (line: string, station: string) => `plat:${line}:${station}`;
const stationNodeId = (station: string) => `stn:${station}`;

function baseAttrs(stepFree: TransitStation["stepFree"], source: string, observedAt: string): EdgeAttrs {
  const steps: Attr<number> = stepFree === "yes" ? attr(0, "reported", "tfl", observedAt, source) : unknownAttr();
  return {
    incline: attr(0, "inferred", "derived", null, "station interior"),
    inclineMax: attr(0, "inferred", "derived", null, "station interior"),
    crossSlope: attr(0, "inferred", "derived", null, "station interior"),
    surface: attr("concrete", "inferred", "derived", null, "station interior"),
    smoothness: unknownAttr(),
    width: unknownAttr(),
    stepCount: steps,
    handrail: unknownAttr(),
    lit: attr(true, "inferred", "derived", null, "station interior"),
    covered: attr(true, "inferred", "derived", null, "station interior"),
    wheelchair: stepFree === "yes" ? attr("yes", "reported", "tfl", observedAt, source) : unknownAttr(),
  };
}

/**
 * Add a transit network to a pedestrian graph. Node ids for transit are
 * negative numbers allocated from `startId` downwards so they never collide
 * with OSM ids. Returns a lookup from station id to its graph nodes, which
 * the live adapters use to place lift outages.
 */
export function addTransit(g: Graph, net: TransitNetwork): { stationNode: Map<string, number>; platformNode: Map<string, number> } {
  let nextNode = Math.min(0, ...g.nodes.map((n) => n.id)) - 1_000_000;
  let nextEdge = Math.max(0, ...g.edges.map((e) => e.id)) + 1;
  const stationNode = new Map<string, number>();
  const platformNode = new Map<string, number>();
  const nodeOf = new Map<string, number>();
  const addNode = (key: string, s: TransitStation, level: number, kind: GraphNode["kind"]) => {
    const id = nextNode--;
    nodeOf.set(key, id);
    g.nodes.push({ id, lon: s.lon, lat: s.lat, ele: unknownAttr(), level, kind });
    return id;
  };
  const addEdge = (e: Omit<GraphEdge, "id" | "level" | "layer" | "bridge">) => {
    g.edges.push({ id: nextEdge++, level: 0, layer: 0, bridge: false, ...e });
  };

  const used = new Set(net.routes.flatMap((r) => r.stops));
  const streetNodes = g.nodes;
  // Nodes whose every edge is indoor (corridor or level other than 0) are not the street.
  const outdoor = new Set<number>();
  for (const e of g.edges) {
    if (e.kind !== "corridor" && e.level === 0 && e.attrs.covered.value !== true) {
      outdoor.add(e.from);
      outdoor.add(e.to);
    }
  }
  const isIndoorOnly = new Set(g.nodes.filter((n) => !outdoor.has(n.id)).map((n) => n.id));
  for (const sid of used) {
    const s = net.stations[sid];
    if (!s) continue;
    const sn = addNode(stationNodeId(sid), s, 0, "entrance");
    stationNode.set(sid, sn);
    // Street links: nearest street nodes within reach (a station outside any street zone simply has none).
    // Street level only: stations mapped indoors in OSM (Canary Wharf) have platform-level corridors that
    // must not stand in for the street. The station's interior is modelled by its board edges instead.
    const near = streetNodes
      .filter((n) => n.id > 0 && n.level === 0 && !isIndoorOnly.has(n.id))
      .map((n) => ({ n, d: haversine([s.lon, s.lat], [n.lon, n.lat]) }))
      .filter((x) => x.d <= LINK_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    for (const { n, d } of near) {
      addEdge({
        from: sn,
        to: n.id,
        kind: "station_link",
        ref: `link:${sid}`,
        geometry: [
          [s.lon, s.lat],
          [n.lon, n.lat],
        ],
        lengthM: Math.max(10, d),
        name: s.name,
        bidirectional: true,
        attrs: baseAttrs(s.stepFree, s.stepFreeSource, net.fetchedAt),
      });
    }
  }

  for (const r of net.routes) {
    for (const sid of r.stops) {
      const s = net.stations[sid];
      if (!s || nodeOf.has(platformId(r.line, sid))) continue;
      const pn = addNode(platformId(r.line, sid), s, -1, "junction");
      platformNode.set(platformId(r.line, sid), pn);
      // Boarding / alighting: street-level station to this line's platform. Carries the step-free fact and any lift outage.
      addEdge({
        from: stationNode.get(sid)!,
        to: pn,
        kind: "board",
        ref: `board:${r.line}:${sid}`,
        geometry: [
          [s.lon, s.lat],
          [s.lon, s.lat],
        ],
        lengthM: 0,
        name: `${s.name}, ${r.lineName}`,
        bidirectional: true,
        attrs: baseAttrs(s.stepFree, s.stepFreeSource, net.fetchedAt),
      });
    }
    for (let i = 1; i < r.stops.length; i++) {
      const a = net.stations[r.stops[i - 1]!],
        b = net.stations[r.stops[i]!];
      if (!a || !b) continue;
      const from = nodeOf.get(platformId(r.line, a.id))!,
        to = nodeOf.get(platformId(r.line, b.id))!;
      if (g.edges.some((e) => e.kind === "transit" && ((e.from === from && e.to === to) || (e.from === to && e.to === from)))) continue;
      addEdge({
        from,
        to,
        kind: "transit",
        ref: `ride:${r.line}:${a.id}:${b.id}`,
        geometry: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
        lengthM: haversine([a.lon, a.lat], [b.lon, b.lat]),
        name: r.lineName,
        bidirectional: true,
        attrs: baseAttrs("yes", "train", net.fetchedAt),
      });
    }
  }

  // Same-building interchanges (shared hub, close together). Farther pairs connect through the street graph.
  const byHub = new Map<string, TransitStation[]>();
  for (const sid of used) {
    const s = net.stations[sid];
    if (s?.hub) (byHub.get(s.hub) ?? byHub.set(s.hub, []).get(s.hub)!).push(s);
  }
  for (const group of byHub.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!,
          b = group[j]!;
        const d = haversine([a.lon, a.lat], [b.lon, b.lat]);
        if (d > SAME_BUILDING_M) continue;
        const both = a.stepFree === "yes" && b.stepFree === "yes" ? "yes" : "unknown";
        addEdge({
          from: stationNode.get(a.id)!,
          to: stationNode.get(b.id)!,
          kind: "interchange",
          ref: `interchange:${a.id}:${b.id}`,
          geometry: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
          lengthM: Math.max(50, d),
          name: a.name === b.name ? `Change at ${a.name}` : `Change from ${a.name} to ${b.name}`,
          bidirectional: true,
          attrs: baseAttrs(both, "both stations step-free (TfL)", net.fetchedAt),
        });
      }
    }
  }
  g.meta.liveFeeds = [...new Set([...(g.meta.liveFeeds ?? []), "tfl-lifts"])];
  g.meta.sources.push({ id: "tfl", licence: "TfL open data terms", attribution: "Powered by TfL Open Data", snapshot: `${net.source}, ${net.fetchedAt}` });
  return { stationNode, platformNode };
}
