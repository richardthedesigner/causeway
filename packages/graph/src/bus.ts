/**
 * Buses in the pedestrian graph, built from a GTFS cut (scripts/gtfs-bus.py)
 * when the app loads, so timetables can refresh without rebuilding the
 * street graph. Same shape as rail (transit.ts): a stop node on the
 * pavement, a board edge per route direction at each stop, and ride edges
 * between consecutive stops. Board edges carry how often buses leave, so the
 * router can price the wait for the time of day.
 *
 * Accessibility: every UK local bus is low-floor with a ramp and a
 * wheelchair space (PSVAR 2000, in force for all single and double deckers
 * by 2017). What isn't known is whether the space is free; the cost model
 * says so rather than treating the bus as certain.
 */
import { attr, unknownAttr } from "./attribute.js";
import { haversine } from "./geo.js";
import type { EdgeAttrs, Graph, GraphEdge } from "./schema.js";

export interface BusStop {
  n: string;
  /** NaPTAN SMS code, shown on the stop flag in some places. */
  code: string | null;
  x: number;
  y: number;
}

/** Departures per hour (0-23, local time) on a typical weekday, Saturday and Sunday. */
export interface PerHour {
  wd: number[];
  sa: number[];
  su: number[];
}

export interface BusLine {
  /** "<route_id>:<direction>" */
  id: string;
  /** Public route number, "23". */
  route: string;
  operator: string | null;
  headsign: string | null;
  /** Stop id to departures per hour from that stop. */
  calls: Record<string, PerHour>;
  /** [from stop, to stop, typical seconds, trips seen]. */
  rides: [string, string, number, number][];
}

export interface BusNetwork {
  area: string;
  source: string;
  licence: string;
  builtAt: string;
  stops: Record<string, BusStop>;
  lines: BusLine[];
}

/** How a bus edge is served, for the cost model and the directions. */
export interface BusService {
  mode: "bus";
  route: string;
  headsign: string | null;
  operator: string | null;
  /** Board edges: departures per hour from this stop. */
  perHour?: PerHour;
  /** Ride edges: typical seconds stop to stop. */
  runS?: number;
}

/** A stop links to pavement within this distance. */
const LINK_M = 35;

function busAttrs(source: string, observedAt: string): EdgeAttrs {
  return {
    incline: attr(0, "inferred", "derived", null, "bus"),
    inclineMax: attr(0, "inferred", "derived", null, "bus"),
    crossSlope: attr(0, "inferred", "derived", null, "bus"),
    surface: attr("other", "inferred", "derived", null, "bus"),
    smoothness: unknownAttr(),
    width: unknownAttr(),
    // Low-floor with a ramp by law (PSVAR): no steps to board.
    stepCount: attr(0, "inferred", "derived", observedAt, `${source}; low-floor buses with ramps (PSVAR 2000)`),
    handrail: attr(true, "inferred", "derived", null, "bus"),
    lit: attr(true, "inferred", "derived", null, "bus"),
    covered: attr(true, "inferred", "derived", null, "bus"),
    wheelchair: attr("yes", "inferred", "derived", observedAt, "PSVAR 2000: wheelchair space and ramp on every local bus"),
  };
}

/**
 * Add buses to a graph. Returns how many stops found pavement to stand on;
 * stops with none (in a bus station mapped indoors, say) are left out.
 */
export function addBus(g: Graph, net: BusNetwork): { stops: number; lines: number } {
  let nextNode = Math.min(0, ...g.nodes.map((n) => n.id)) - 2_000_000;
  let nextEdge = Math.max(0, ...g.edges.map((e) => e.id)) + 1;
  const addEdge = (e: Omit<GraphEdge, "id" | "level" | "layer" | "bridge">) => g.edges.push({ id: nextEdge++, level: 0, layer: 0, bridge: false, ...e });
  const attrs = busAttrs(net.source, net.builtAt);

  // Pavement nodes on a coarse grid, for linking stops quickly.
  const PAVEMENT = new Set(["sidewalk", "footway", "pedestrian", "street_proxy"]);
  // Each pavement node remembers one of its pavement edges: the few metres to the stop flag are that pavement.
  const pavementAttrs = new Map<number, EdgeAttrs>();
  for (const e of g.edges) {
    if (!PAVEMENT.has(e.kind) || e.kind === "crossing" || e.level !== 0) continue;
    if (!pavementAttrs.has(e.from)) pavementAttrs.set(e.from, e.attrs);
    if (!pavementAttrs.has(e.to)) pavementAttrs.set(e.to, e.attrs);
  }
  const onPavement = new Set(pavementAttrs.keys());
  const cell = (x: number, y: number) => `${Math.floor(x * 2000)}:${Math.floor(y * 2000)}`;
  const grid = new Map<string, typeof g.nodes>();
  for (const n of g.nodes) if (onPavement.has(n.id)) (grid.get(cell(n.lon, n.lat)) ?? grid.set(cell(n.lon, n.lat), []).get(cell(n.lon, n.lat))!).push(n);
  const nearest = (x: number, y: number) => {
    const cx = Math.floor(x * 2000),
      cy = Math.floor(y * 2000);
    let best: { id: number; d: number; lon: number; lat: number } | null = null;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const n of grid.get(`${cx + i}:${cy + j}`) ?? []) {
          const d = haversine([x, y], [n.lon, n.lat]);
          if (d <= LINK_M && (!best || d < best.d)) best = { id: n.id, d, lon: n.lon, lat: n.lat };
        }
    return best;
  };

  const stopNode = new Map<string, number>();
  for (const [sid, s] of Object.entries(net.stops)) {
    const near = nearest(s.x, s.y);
    if (!near) continue;
    const id = nextNode--;
    g.nodes.push({ id, lon: s.x, lat: s.y, ele: unknownAttr(), level: 0, kind: "junction" });
    stopNode.set(sid, id);
    addEdge({
      from: near.id,
      to: id,
      kind: "station_link",
      ref: `link:bus:${sid}`,
      geometry: [
        [near.lon, near.lat],
        [s.x, s.y],
      ],
      lengthM: Math.max(3, near.d),
      name: s.n,
      bidirectional: true,
      attrs: { ...pavementAttrs.get(near.id)!, stepCount: attr(0, "inferred", "derived", null, "same pavement as the stop") },
    });
  }

  let lines = 0;
  for (const ln of net.lines) {
    const label = `${ln.route} bus${ln.headsign ? ` towards ${ln.headsign}` : ""}`;
    const service = { mode: "bus" as const, route: ln.route, headsign: ln.headsign, operator: ln.operator };
    // One on-board node per stop on this route direction.
    const onBoard = new Map<string, number>();
    const boardAt = (sid: string) => {
      if (onBoard.has(sid)) return onBoard.get(sid)!;
      const s = net.stops[sid],
        sn = stopNode.get(sid);
      if (!s || sn === undefined) return null;
      const id = nextNode--;
      g.nodes.push({ id, lon: s.x, lat: s.y, ele: unknownAttr(), level: 0, kind: "junction" });
      onBoard.set(sid, id);
      addEdge({
        from: sn,
        to: id,
        kind: "board",
        ref: `board:bus:${ln.id}:${sid}`,
        geometry: [
          [s.x, s.y],
          [s.x, s.y],
        ],
        lengthM: 0,
        name: `${s.n}, ${label}`,
        bidirectional: true,
        attrs,
        service: { ...service, perHour: ln.calls[sid] },
      });
      return id;
    };
    let any = false;
    for (const [a, b, runS] of ln.rides) {
      const na = boardAt(a),
        nb = boardAt(b);
      if (na === null || nb === null) continue;
      const sa = net.stops[a]!,
        sb = net.stops[b]!;
      addEdge({
        from: na,
        to: nb,
        kind: "transit",
        ref: `ride:bus:${ln.id}:${a}:${b}`,
        geometry: [
          [sa.x, sa.y],
          [sb.x, sb.y],
        ],
        lengthM: haversine([sa.x, sa.y], [sb.x, sb.y]),
        name: label,
        // Buses only go one way along their route.
        bidirectional: false,
        attrs,
        service: { ...service, runS },
      });
      any = true;
    }
    if (any) lines++;
  }
  return { stops: stopNode.size, lines };
}
