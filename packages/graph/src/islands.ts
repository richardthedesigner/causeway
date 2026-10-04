/**
 * Join small islands of footway to the main network across short gaps.
 *
 * OSM often ends a footway at a crossing node on a road we drop (a bus-only
 * road in an interchange, tagged access=no), so the pavements beyond become
 * an island a few metres from the street. Routes then can't reach places
 * people walk to every day (Gateshead Interchange, issue #7).
 *
 * The connector is honest about what it is: every attribute unknown, kind
 * "crossing" when either end is a mapped crossing (so kerbs count as
 * unknown too), and a "gap:" ref so reports and the inspector can find it.
 */
import { unknownAttr } from "./attribute.js";
import { haversine } from "./geo.js";
import type { EdgeAttrs, Graph, GraphNode } from "./schema.js";

export interface BridgeOptions {
  /** Longest gap to bridge, metres. */
  maxGapM?: number;
  /** Only islands up to this many nodes; bigger ones are separate areas, not mapping gaps. */
  maxIslandNodes?: number;
}

export interface BridgeResult {
  islands: number;
  bridged: number;
  /** [island node, main node, metres] per connector. */
  connectors: [number, number, number][];
}

const unknownAttrs = (): EdgeAttrs => ({
  incline: unknownAttr(),
  inclineMax: unknownAttr(),
  crossSlope: unknownAttr(),
  surface: unknownAttr(),
  smoothness: unknownAttr(),
  width: unknownAttr(),
  stepCount: unknownAttr(),
  handrail: unknownAttr(),
  lit: unknownAttr(),
  covered: unknownAttr(),
  wheelchair: unknownAttr(),
});

/** Street-level nodes only: an island of platform or indoor nodes is joined some other way. */
const streetLevel = (n: GraphNode) => n.level === 0;

export function bridgeIslands(g: Graph, opts: BridgeOptions = {}): BridgeResult {
  const maxGap = opts.maxGapM ?? 15;
  const maxIsland = opts.maxIslandNodes ?? 500;
  const adj = new Map<number, number[]>();
  // Nodes on bridges or tunnels: a short gap there is usually a height difference, not a missing link.
  const offGround = new Set<number>();
  for (const e of g.edges) {
    if (e.bridge || e.layer !== 0) (offGround.add(e.from), offGround.add(e.to));
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  // Components (nodes with no edges are not part of the walkable network).
  const comp = new Map<number, number>();
  const sizes: number[] = [];
  for (const n of g.nodes) {
    if (comp.has(n.id) || !adj.has(n.id)) continue;
    const c = sizes.length;
    const stack = [n.id];
    comp.set(n.id, c);
    let k = 0;
    while (stack.length) {
      const u = stack.pop()!;
      k++;
      for (const v of adj.get(u) ?? [])
        if (!comp.has(v)) {
          comp.set(v, c);
          stack.push(v);
        }
    }
    sizes.push(k);
  }
  const result: BridgeResult = { islands: 0, bridged: 0, connectors: [] };
  if (sizes.length < 2) return result;
  const main = sizes.indexOf(Math.max(...sizes));

  // Main-network nodes on a grid (about 30 m cells) for nearest lookups.
  const CELL = 1 / 3600;
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  const grid = new Map<string, GraphNode[]>();
  for (const n of g.nodes) if (comp.get(n.id) === main && streetLevel(n)) (grid.get(key(n.lon, n.lat)) ?? grid.set(key(n.lon, n.lat), []).get(key(n.lon, n.lat))!).push(n);
  const nearestMain = (n: GraphNode) => {
    const cx = Math.floor(n.lon / CELL),
      cy = Math.floor(n.lat / CELL);
    let best: { n: GraphNode; d: number } | null = null;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const m of grid.get(`${cx + i}:${cy + j}`) ?? []) {
          if (offGround.has(m.id)) continue;
          // Known ground heights more than 2 m apart: a wall or embankment, not a gap.
          if (n.ele.value !== null && m.ele.value !== null && Math.abs(n.ele.value - m.ele.value) > 2) continue;
          const d = haversine([n.lon, n.lat], [m.lon, m.lat]);
          if (d <= maxGap && (!best || d < best.d)) best = { n: m, d };
        }
    return best;
  };

  // Railway platforms are islands on purpose: you reach them through the station, not across the tracks.
  const platformComps = new Set<number>();
  for (const e of g.edges) if (e.name && /^Platform\b/i.test(e.name)) platformComps.add(comp.get(e.from)!);
  const byComp = new Map<number, GraphNode[]>();
  for (const n of g.nodes) {
    const c = comp.get(n.id);
    if (c === undefined || c === main || platformComps.has(c) || sizes[c]! > maxIsland || !streetLevel(n) || offGround.has(n.id)) continue;
    (byComp.get(c) ?? byComp.set(c, []).get(c)!).push(n);
  }
  let nextEdge = Math.max(0, ...g.edges.map((e) => e.id)) + 1;
  for (const nodes of byComp.values()) {
    result.islands++;
    // The closest pair, preferring a mapped crossing on the island side (that's where people cross).
    let best: { a: GraphNode; b: GraphNode; d: number; score: number } | null = null;
    for (const a of nodes) {
      const m = nearestMain(a);
      if (!m) continue;
      const score = m.d - (a.kind === "crossing" ? 5 : 0);
      if (!best || score < best.score) best = { a, b: m.n, d: m.d, score };
    }
    if (!best) continue;
    const crossing = best.a.kind === "crossing" || best.b.kind === "crossing";
    g.edges.push({
      id: nextEdge++,
      from: best.a.id,
      to: best.b.id,
      kind: crossing ? "crossing" : "footway",
      geometry: [
        [best.a.lon, best.a.lat],
        [best.b.lon, best.b.lat],
      ],
      lengthM: Math.max(1, best.d),
      name: null,
      level: 0,
      layer: 0,
      bridge: false,
      bidirectional: true,
      attrs: unknownAttrs(),
      ref: `gap:${best.a.id}:${best.b.id}`,
    });
    result.bridged++;
    result.connectors.push([best.a.id, best.b.id, Math.round(best.d * 10) / 10]);
  }
  return result;
}
