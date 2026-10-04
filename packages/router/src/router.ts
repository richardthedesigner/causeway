/**
 * A* over the pedestrian graph with per-request costs. Phase 0 spike
 * implementation: it exists to prove the data model and cost model, and
 * to be the reference the chosen engine is tested against (DECISIONS.md D-003).
 */
import { confidence, haversine, isKnown, type Graph, type GraphEdge, type GraphNode, type NoteSignal } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { darkCost, DRY, entranceVerdict, evaluateEdge, evaluateNode, surfaceLabel, type Conditions, type EdgeContext, type EntranceVerdict, type Evaluation, type Reason } from "./cost.js";

interface Arc {
  edge: GraphEdge;
  forward: boolean;
  to: number;
}

export interface Step {
  edge: GraphEdge;
  forward: boolean;
  eval: Evaluation;
  /** Node entered at the end of this step. */
  node: GraphNode;
  nodeEval: Evaluation;
}

export interface Route {
  steps: Step[];
  cost: number;
  seconds: number;
  lengthM: number;
}

export class Router {
  readonly nodes = new Map<number, GraphNode>();
  readonly out = new Map<number, Arc[]>();
  /** Connected component per node (ignoring direction and profile). */
  private readonly component = new Map<number, number>();
  private mainComponent = -1;
  /** Edge id to distance from its midpoint to the nearest bench (only when the graph has benches). */
  readonly benchM = new Map<number, number>();
  /** Distance from each edge to the nearest accessible toilet (public, or in a venue). */
  readonly toiletM = new Map<number, number>();
  /** Edge id to what people's notes say about it. Held beside the graph, never written into it (D-008). */
  noteSignals = new Map<number, NoteSignal>();

  /** Everything around an edge the cost model needs that isn't the edge itself. */
  edgeContext(id: number): EdgeContext {
    return { benchM: this.benchM.get(id), note: this.noteSignals.get(id) };
  }

  constructor(readonly graph: Graph) {
    for (const n of graph.nodes) this.nodes.set(n.id, n);
    for (const e of graph.edges) {
      this.arc(e.from, { edge: e, forward: true, to: e.to });
      this.arc(e.to, { edge: e, forward: false, to: e.from });
    }
    this.labelComponents();
    this.indexBenches();
    this.indexToilets();
  }

  /** Accessible toilets the graph didn't carry (venues, from the app's search index). Re-indexes. */
  addToilets(points: { lon: number; lat: number; name: string }[]) {
    let id = -1;
    for (const pt of points)
      (this.graph.amenities ??= []).push({
        id: id--,
        lon: pt.lon,
        lat: pt.lat,
        kind: "toilets",
        wheelchair: { value: "yes", state: "reported", source: "osm", observedAt: null, method: "toilets:wheelchair on a venue" },
        details: { access: { value: "customers", state: "reported", source: "osm", observedAt: null, method: "a venue's toilet" }, name: { value: pt.name, state: "reported", source: "osm", observedAt: null, method: "OSM name" } },
        osmId: 0,
      });
    this.indexToilets();
  }

  private indexToilets() {
    const pts = (this.graph.amenities ?? []).filter((a) => a.kind !== "bench" && (a.wheelchair.value === "yes" || a.kind === "changing_places")).map((a) => [a.lon, a.lat] as [number, number]);
    this.toiletM.clear();
    this.indexNear(pts, this.toiletM);
  }

  /**
   * Fastest straight-line speed anywhere in the graph, for the A* estimate: with rides on
   * board, the walking pace would overestimate and miss trains and buses.
   */
  private fastest(p: Profile): number {
    if (this.hasRides === undefined) this.hasRides = this.graph.edges.some((e) => e.kind === "transit");
    return this.hasRides ? Math.max(p.speedMps, 15) : p.speedMps;
  }
  private hasRides: boolean | undefined;

  private indexBenches() {
    this.indexNear((this.graph.amenities ?? []).filter((a) => a.kind === "bench").map((b) => [b.lon, b.lat] as [number, number]), this.benchM);
  }

  /** For every edge, metres from its middle to the nearest of `points` (within about 400 m). */
  private indexNear(points: [number, number][], into: Map<number, number>) {
    if (!points.length) return;
    const CELL = 0.002; // about 200 m
    const grid = new Map<string, [number, number][]>();
    const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
    for (const b of points) (grid.get(key(b[0], b[1])) ?? grid.set(key(b[0], b[1]), []).get(key(b[0], b[1]))!).push(b);
    for (const e of this.graph.edges) {
      const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
      const cx = Math.floor(mid[0] / CELL),
        cy = Math.floor(mid[1] / CELL);
      let best = Infinity;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const b of grid.get(`${cx + dx}:${cy + dy}`) ?? []) best = Math.min(best, haversine(mid, b));
      into.set(e.id, best);
    }
  }

  /**
   * Fragments of the network (an unconnected platform, a clipped path at the
   * bbox edge) would otherwise swallow a snap and return "no route".
   */
  private labelComponents() {
    const size = new Map<number, number>();
    let c = 0;
    for (const start of this.nodes.keys()) {
      if (this.component.has(start)) continue;
      const stack = [start];
      this.component.set(start, c);
      let n = 0;
      while (stack.length) {
        const u = stack.pop()!;
        n++;
        for (const a of this.out.get(u) ?? []) {
          if (!this.component.has(a.to)) {
            this.component.set(a.to, c);
            stack.push(a.to);
          }
        }
      }
      size.set(c, n);
      c++;
    }
    this.mainComponent = [...size.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  }

  private arc(from: number, a: Arc) {
    (this.out.get(from) ?? this.out.set(from, []).get(from)!).push(a);
  }

  /** Nearest node the profile can actually use, so we never start someone on a staircase. */
  snap(lon: number, lat: number, p: Profile, c: Conditions = DRY): GraphNode {
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const d = haversine([lon, lat], [n.lon, n.lat]);
      if (d >= bestD || this.component.get(n.id) !== this.mainComponent) continue;
      const usable = (this.out.get(n.id) ?? []).some((a) => evaluateEdge(a.edge, a.forward, p, c).cost < Infinity);
      if (usable) {
        best = n;
        bestD = d;
      }
    }
    if (!best) throw new Error("no usable node near point");
    return best;
  }

  route(
    from: GraphNode,
    to: GraphNode,
    p: Profile,
    c: Conditions = DRY,
    edgePenalty?: Map<number, number>,
  ): Route | null {
    const vmax = this.fastest(p);
    const h = (n: GraphNode) => haversine([n.lon, n.lat], [to.lon, to.lat]) / vmax;
    const g = new Map<number, number>([[from.id, 0]]);
    const prev = new Map<number, Step>();
    const heap = new MinHeap();
    heap.push(from.id, h(from));
    const closed = new Set<number>();
    while (heap.size) {
      const u = heap.pop()!;
      if (closed.has(u)) continue;
      closed.add(u);
      if (u === to.id) break;
      const gu = g.get(u)!;
      for (const a of this.out.get(u) ?? []) {
        if (closed.has(a.to)) continue;
        const ev = evaluateEdge(a.edge, a.forward, p, c, this.edgeContext(a.edge.id));
        if (ev.cost === Infinity) continue;
        const v = this.nodes.get(a.to)!;
        const nv = evaluateNode(v, a.edge.kind === "crossing", p, c);
        if (nv.cost === Infinity) continue;
        const pen = edgePenalty?.get(a.edge.id) ?? 1;
        const cost = gu + ev.cost * pen + nv.cost;
        if (cost < (g.get(a.to) ?? Infinity)) {
          g.set(a.to, cost);
          prev.set(a.to, { edge: a.edge, forward: a.forward, eval: ev, node: v, nodeEval: nv });
          heap.push(a.to, cost + h(v));
        }
      }
    }
    if (!prev.has(to.id) && from.id !== to.id) return null;
    const steps: Step[] = [];
    for (let cur = to.id; cur !== from.id; ) {
      const s = prev.get(cur)!;
      steps.push(s);
      cur = s.forward ? s.edge.from : s.edge.to;
    }
    steps.reverse();
    return {
      steps,
      cost: steps.reduce((t, s) => t + s.eval.cost + s.nodeEval.cost, 0),
      seconds: steps.reduce((t, s) => t + s.eval.seconds + s.nodeEval.seconds, 0),
      lengthM: steps.reduce((t, s) => t + s.edge.lengthM, 0),
    };
  }

  /**
   * Route that never goes more than `maxGapM` without passing a mapped bench
   * (within 30 m of the edge), or with `stop: "toilet"` an accessible toilet
   * (within 80 m). Resource-constrained A*: the state is the node plus
   * distance since the last stop, in eight buckets. Null when no such route
   * exists in the mapped data.
   */
  routeWithRests(from: GraphNode, to: GraphNode, p: Profile, c: Conditions = DRY, maxGapM = p.maxRestIntervalM ?? 400, stop: "bench" | "toilet" = "bench"): Route | null {
    // A bench counts within 30 m of the path; a toilet within 80 m (worth a short detour off it).
    const near = stop === "bench" ? this.benchM : this.toiletM;
    const reach = stop === "bench" ? 30 : 80;
    const B = 8;
    const bucketM = maxGapM / B;
    const vmax = this.fastest(p);
    const h = (n: GraphNode) => haversine([n.lon, n.lat], [to.lon, to.lat]) / vmax;
    type Lab = { node: number; gap: number; cost: number; prev: Lab | null; step: Step | null };
    const best = new Map<string, number>();
    const heap = new MinHeap();
    const labels: Lab[] = [{ node: from.id, gap: 0, cost: 0, prev: null, step: null }];
    heap.push(0, h(from));
    const closed = new Set<string>();
    let goal: Lab | null = null;
    while (heap.size) {
      const li = heap.pop()!;
      const L = labels[li]!;
      const key = `${L.node}:${Math.floor(L.gap / bucketM)}`;
      if (closed.has(key)) continue;
      closed.add(key);
      if (L.node === to.id) {
        goal = L;
        break;
      }
      for (const a of this.out.get(L.node) ?? []) {
        const benchHere = (near.get(a.edge.id) ?? Infinity) <= reach;
        const gap = RAIL.has(a.edge.kind) ? 0 : benchHere ? 0 : L.gap + a.edge.lengthM;
        if (gap > maxGapM) continue;
        const ev = evaluateEdge(a.edge, a.forward, p, c, { note: this.noteSignals.get(a.edge.id) });
        if (ev.cost === Infinity) continue;
        const v = this.nodes.get(a.to)!;
        const nv = evaluateNode(v, a.edge.kind === "crossing", p, c);
        if (nv.cost === Infinity) continue;
        const cost = L.cost + ev.cost + nv.cost;
        const k = `${a.to}:${Math.floor(gap / bucketM)}`;
        if (cost >= (best.get(k) ?? Infinity)) continue;
        best.set(k, cost);
        labels.push({ node: a.to, gap, cost, prev: L, step: { edge: a.edge, forward: a.forward, eval: ev, node: v, nodeEval: nv } });
        heap.push(labels.length - 1, cost + h(v));
      }
    }
    if (!goal) return null;
    const steps: Step[] = [];
    for (let l: Lab | null = goal; l && l.step; l = l.prev) steps.push(l.step);
    steps.reverse();
    return {
      steps,
      cost: goal.cost,
      seconds: steps.reduce((t, s) => t + s.eval.seconds + s.nodeEval.seconds, 0),
      lengthM: steps.reduce((t, s) => t + s.edge.lengthM, 0),
    };
  }

  /**
   * Up to `k` genuinely different routes, by the penalty method: re-run with
   * the edges of earlier routes made more expensive, keep results that share
   * less than 70% of their length with every route already accepted.
   */
  alternatives(from: GraphNode, to: GraphNode, p: Profile, c: Conditions = DRY, k = 3): Route[] {
    const best = this.route(from, to, p, c);
    if (!best) return [];
    const routes = [best];
    const penalty = new Map<number, number>();
    for (let i = 0; i < k * 3 && routes.length < k; i++) {
      for (const r of routes) for (const s of r.steps) penalty.set(s.edge.id, (penalty.get(s.edge.id) ?? 1) * 1.6);
      const r = this.route(from, to, p, c, penalty);
      if (!r) break;
      // r.cost is the true cost (penalties only steer the search). Short trips get an absolute allowance.
      if (r.cost > Math.max(best.cost * 1.6, best.cost + 300)) break;
      const ids = new Set(r.steps.map((s) => s.edge.id));
      const distinct = routes.every((o) => {
        const shared = o.steps.filter((s) => ids.has(s.edge.id)).reduce((t, s) => t + s.edge.lengthM, 0);
        return shared / Math.max(r.lengthM, o.lengthM) < 0.7;
      });
      if (distinct) routes.push(r);
    }
    return routes.sort((a, b) => a.cost - b.cost);
  }

  /** Every node this person can reach from `from` (one flood, no target). For "how close can I get?". */
  reach(from: GraphNode, p: Profile, c: Conditions = DRY): Set<number> {
    const seen = new Set<number>([from.id]);
    const queue = [from.id];
    while (queue.length) {
      const u = queue.pop()!;
      for (const a of this.out.get(u) ?? []) {
        if (seen.has(a.to)) continue;
        if (evaluateEdge(a.edge, a.forward, p, c, this.edgeContext(a.edge.id)).cost === Infinity) continue;
        if (evaluateNode(this.nodes.get(a.to)!, a.edge.kind === "crossing", p, c).cost === Infinity) continue;
        seen.add(a.to);
        queue.push(a.to);
      }
    }
    return seen;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number | undefined {
    if (!this.ids.length) return undefined;
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.ids.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}

// ---------------------------------------------------------------- summaries

export interface RouteSummary {
  minutes: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  /** Steepest 10 m window traversed, signed (+ uphill). */
  worstInclinePct: number | null;
  worstInclineAt: string | null;
  /** Metres by surface label, including "unknown". */
  surfaceMix: Record<string, number>;
  kerbs: { lowered: number; flush: number; raised: number; unknown: number };
  steps: number;
  lifts: number;
  /** Metres of route with at least one critical unknown. */
  unknownM: number;
  /** Length-weighted confidence in [0, 1] across incline, surface and width. */
  confidence: number;
  /** Distance on foot or wheels, excluding train rides. */
  walkM: number;
  /** Train legs, in order. */
  rides: { line: string; from: string; to: string; stops: number }[];
  /** Names of movable bridges crossed (they close while they tilt or swing). */
  movableBridges: { name: string; type: string }[];
  /** Plain-language passability verdict. Never "step-free" unless we know. */
  verdict: "passable" | "passable-with-unknowns" | "not-passable";
}

export function summarise(r: Route, now: Date = DRY.now): RouteSummary {
  let ascent = 0,
    descent = 0,
    worst: number | null = null,
    worstAt: string | null = null,
    unknownM = 0,
    confSum = 0,
    lifts = 0,
    steps = 0;
  const surfaceMix: Record<string, number> = {};
  const kerbs = { lowered: 0, flush: 0, raised: 0, unknown: 0 };
  for (const s of r.steps) {
    const a = s.edge.attrs;
    const L = s.edge.lengthM;
    // Train legs aren't footway: station unknowns are reported per station (see verdict and notes), not by track length.
    if (RAIL.has(s.edge.kind)) continue;
    if (isKnown(a.incline)) {
      const rise = (a.incline.value * (s.forward ? 1 : -1) * L) / 100;
      if (rise > 0) ascent += rise;
      else descent -= rise;
    }
    const w = isKnown(a.inclineMax) ? a.inclineMax.value * (s.forward ? 1 : -1) : isKnown(a.incline) ? a.incline.value * (s.forward ? 1 : -1) : null;
    if (w !== null && (worst === null || Math.abs(w) > Math.abs(worst))) {
      worst = w;
      worstAt = s.edge.name;
    }
    const surf = isKnown(a.surface) ? surfaceLabel(a.surface.value) : "unknown";
    surfaceMix[surf] = (surfaceMix[surf] ?? 0) + L;
    if (s.eval.passable === "unknown" || s.nodeEval.passable === "unknown") unknownM += L;
    confSum += L * ((confidence(a.incline, now) + confidence(a.surface, now) + confidence(a.width, now)) / 3);
    if (s.edge.kind === "elevator" || s.node.kind === "elevator") lifts++;
    if (s.edge.kind === "steps") steps++;
    if (s.node.kerb) {
      const t = s.node.kerb.type.value;
      if (t === "lowered" || t === "flush" || t === "raised") kerbs[t]++;
      else kerbs.unknown++;
    } else if (s.edge.kind === "crossing") kerbs.unknown++;
  }
  for (const k of Object.keys(surfaceMix)) surfaceMix[k] = Math.round(surfaceMix[k]!);
  const movable = new Map<string, string>();
  const rides = ridesOf(r);
  const walkM = r.steps.filter((s) => !RAIL.has(s.edge.kind)).reduce((t, s) => t + s.edge.lengthM, 0);
  for (const s of r.steps) if (s.edge.movable) movable.set(s.edge.name ?? "a movable bridge", s.edge.movable);
  const blocked = r.steps.some((s) => s.eval.passable === "no" || s.nodeEval.passable === "no");
  const walkLen = Math.max(1, walkM);
  return {
    minutes: Math.round((r.seconds / 60) * 10) / 10,
    distanceM: Math.round(r.lengthM),
    ascentM: Math.round(ascent * 10) / 10,
    descentM: Math.round(descent * 10) / 10,
    worstInclinePct: worst === null ? null : Math.round(worst * 10) / 10,
    worstInclineAt: worstAt,
    surfaceMix,
    kerbs,
    steps,
    lifts,
    unknownM: Math.round(unknownM),
    confidence: Math.round((confSum / walkLen) * 100) / 100,
    movableBridges: [...movable].map(([name, type]) => ({ name, type })),
    walkM: Math.round(walkM),
    rides,
    verdict: blocked ? "not-passable" : unknownM > 0 || r.steps.some((s) => RAIL.has(s.edge.kind) && s.eval.passable === "unknown") ? "passable-with-unknowns" : "passable",
  };
}

/** Distance/elevation pairs for the route's elevation chart. Unknown elevations are gaps, not zeros. */
export function elevationProfile(r: Route, start: GraphNode): { d: number; z: number | null }[] {
  const out = [{ d: 0, z: start.ele.value }];
  let d = 0;
  for (const s of r.steps) {
    d += s.edge.lengthM;
    out.push({ d: Math.round(d), z: s.node.ele.value === null ? null : Math.round(s.node.ele.value * 10) / 10 });
  }
  return out;
}

const RAIL: ReadonlySet<string> = new Set(["transit", "board", "interchange"]);

/** Train legs: board (forward), one or more rides, alight (backward). */
function ridesOf(r: Route): { line: string; from: string; to: string; stops: number }[] {
  const out: { line: string; from: string; to: string; stops: number }[] = [];
  let cur: { line: string; from: string; stops: number } | null = null;
  const station = (e: GraphEdge) => (e.name ?? "").split(", ")[0]!;
  for (const s of r.steps) {
    if (s.edge.kind === "board" && s.forward) cur = { line: (s.edge.name ?? "").split(", ").slice(1).join(", "), from: station(s.edge), stops: 0 };
    else if (s.edge.kind === "transit" && cur) cur.stops++;
    else if (s.edge.kind === "board" && !s.forward && cur) {
      out.push({ ...cur, to: station(s.edge) });
      cur = null;
    }
  }
  return out;
}

// ------------------------------------------------------------- explanation

export interface Avoided {
  name: string;
  reason: Reason;
  lengthM: number;
}

export interface Explanation {
  /** One sentence, plain English: "Avoids Cockburn Street (9.6% uphill). Adds 4 minutes." */
  headline: string;
  avoided: Avoided[];
  addedMinutes: number;
  /** Things on the chosen route the user should know about. */
  notes: string[];
}

/**
 * "Why this way?" Compare the user's route with the route a profile with no
 * limits would take, and name what was avoided and why. Unnamed footways
 * are grouped as "a path"; we never invent a name.
 */
export function explain(router: Router, chosen: Route, from: GraphNode, to: GraphNode, p: Profile, unconstrained: Profile, c: Conditions = DRY): Explanation {
  const base = router.route(from, to, unconstrained, c);
  const chosenIds = new Set(chosen.steps.map((s) => s.edge.id));
  const avoidedByName = new Map<string, Avoided>();
  if (base) {
    for (const s of base.steps) {
      if (chosenIds.has(s.edge.id)) continue;
      const ev = evaluateEdge(s.edge, s.forward, p, c, { note: router.noteSignals.get(s.edge.id) });
      const nv = evaluateNode(s.node, s.edge.kind === "crossing", p, c);
      const worst = [...ev.reasons, ...nv.reasons]
        .filter((r) => r.kind !== "penalty" || r.seconds > 5)
        .sort((a, b) => b.seconds - a.seconds)[0];
      if (!worst) continue;
      const name = placeName(s.edge);
      const cur = avoidedByName.get(name);
      if (!cur || worst.seconds > cur.reason.seconds) avoidedByName.set(name, { name, reason: worst, lengthM: (cur?.lengthM ?? 0) + s.edge.lengthM });
      else cur.lengthM += s.edge.lengthM;
    }
  }
  // Exclusions first, then by how much of the direct route they account for.
  const avoided = [...avoidedByName.values()].sort(
    (a, b) => Number(b.reason.kind === "excluded") - Number(a.reason.kind === "excluded") || b.lengthM - a.lengthM,
  );
  // The direct route's time at this user's pace (rides take the same time for everyone).
  const baseSeconds = base ? base.steps.reduce((t, st) => t + (RAIL.has(st.edge.kind) ? st.eval.seconds : st.edge.lengthM / p.speedMps), 0) : 0;
  const addedMinutes = base ? Math.max(0, Math.round((chosen.seconds - baseSeconds) / 60)) : 0;

  const notes: string[] = [];
  const sum = summarise(chosen, c.now);
  for (const a of avoided) {
    if (a.reason.attr !== "live") continue;
    const full = a.reason.detail.replace(/^(lift out of service|closed): /, "");
    notes.push(`${a.name}: ${full} (TfL, live)`);
    a.reason = { ...a.reason, detail: a.reason.detail.startsWith("lift") ? "lift out of service" : "closed" };
  }
  for (const s of chosen.steps) {
    if (s.edge.kind === "board" && s.eval.passable === "unknown") notes.push(`TfL doesn't confirm step-free access at ${s.edge.name}. Check before you travel.`);
  }
  if (sum.lifts) {
    const live = router.graph.meta.liveFeeds?.some((f) => f.endsWith("lifts"));
    notes.push(`Uses ${sum.lifts === 1 ? "a lift" : `${sum.lifts} lifts`}.${live ? "" : " We have no live lift status here, so check before you set off."}`);
  }
  if (p.maxRestIntervalM) {
    const rs = restStats(router.graph, chosen);
    notes.push(
      rs.longestWithoutBenchM <= p.maxRestIntervalM
        ? `A mapped bench at least every ${p.maxRestIntervalM} m (${rs.benches} along the way).`
        : `Longest stretch without a mapped bench: ${Math.round(rs.longestWithoutBenchM / 10) * 10} m (you asked for ${p.maxRestIntervalM} m). Not every bench is mapped.`,
    );
  }
  if (p.maxToiletIntervalM) {
    const t = restStats(router.graph, chosen).toilets.filter((x) => x.wheelchair === "yes" || x.changingPlaces);
    notes.push(t.length ? `${t.length} accessible public toilet${t.length === 1 ? "" : "s"} mapped near the route.` : "No accessible public toilets mapped near this route. Venues with one are listed under Accessible toilets.");
  }
  for (const b of sum.movableBridges) {
    const verb = b.type === "tilt" ? "tilting" : b.type === "swing" ? "swing" : "movable";
    notes.push(`Crosses ${b.name}, a ${verb} bridge. It closes for a few minutes while it moves for boats. We don't have its timetable yet.`);
  }
  const setts = (sum.surfaceMix["setts"] ?? 0) + (sum.surfaceMix["cobbles"] ?? 0);
  if (setts > 20) notes.push(`${setts} m on setts or cobbles.`);
  if (c.dark && p.litAfterDarkPer100mS) {
    let unlit = 0,
      unmapped = 0;
    for (const s of chosen.steps) {
      const r = darkCost(s.edge, p, c);
      if (r?.detail === "not lit") unlit += s.edge.lengthM;
      else if (r) unmapped += s.edge.lengthM;
    }
    const [u, m] = [Math.round(unlit / 10) * 10, Math.round(unmapped / 10) * 10];
    if (u || m) notes.push(`After dark: ${u ? `${u} m isn't lit` : "no stretch is mapped as unlit"}${m ? `, and lighting isn't mapped for ${m} m` : ""}.`);
    else notes.push("After dark: every stretch of this route is mapped as lit.");
  }
  if (sum.worstInclinePct !== null && Math.abs(sum.worstInclinePct) >= p.comfortInclinePct)
    notes.push(`Steepest part ${Math.abs(sum.worstInclinePct)}% ${sum.worstInclinePct > 0 ? "uphill" : "downhill"}${sum.worstInclineAt ? ` on ${sum.worstInclineAt}` : ""}.`);
  if (sum.unknownM > 0) notes.push(`${sum.unknownM} m where we don't have full data, shown dashed on the map.`);

  const top = avoided.filter((a) => a.reason.kind === "excluded").slice(0, 2);
  const penalties = avoided.filter((a) => a.reason.kind === "penalty").slice(0, 1);
  const lead = top.length ? top : penalties;
  const extra = addedMinutes > 0 ? `Adds ${addedMinutes} minute${addedMinutes === 1 ? "" : "s"}.` : "No extra time.";
  // An unknown is never presented as the reason a street is bad: we say we steered towards known ground.
  const headline = lead.length
    ? `Avoids ${lead.map((a) => `${a.name} (${a.reason.detail})`).join(" and ")}. ${extra}`
    : avoided.length
      ? `Takes streets we have better data for. ${extra}`
      : "This is the most direct route that fits your settings.";
  return { headline, avoided, addedMinutes, notes };
}

/** How we refer to an edge in copy. Borrowed names are qualified, never asserted. */
export function placeName(e: GraphEdge): string {
  if (!e.name) return e.kind === "steps" ? "unnamed steps" : "a path";
  if (!e.nameInferred) return e.name;
  if (e.kind === "steps") return `steps off ${e.name}`;
  if (e.kind === "footway") return `a path by ${e.name}`;
  return e.name;
}

/**
 * The route as an ordered spoken list, for the non-visual route mode.
 * Consecutive steps on the same named way and kind merge into one segment.
 */
export function describeSegments(r: Route): string[] {
  // Rail legs read as one instruction each; walking parts as before.
  const out: string[] = [];
  let walk: Step[] = [];
  const flush = () => {
    if (walk.length) out.push(...describeWalk({ steps: walk, cost: 0, seconds: 0, lengthM: 0 }));
    walk = [];
  };
  const rides = ridesOf(r);
  let ri = 0;
  for (const s of r.steps) {
    const k = s.edge.kind;
    if (k === "station_link" && s.edge.ref?.startsWith("link:bus:")) {
      // The few metres to the stop flag: the boarding instruction names the stop.
      continue;
    } else if (k === "station_link") {
      flush();
      out.push(s.forward ? `Leave ${s.edge.name} station.` : `Go into ${s.edge.name} station.`);
    } else if (k === "board" && s.forward) {
      flush();
      const ride = rides[ri++];
      if (ride) out.push(`Take the ${ride.line} from ${ride.from} to ${ride.to}, ${ride.stops} stop${ride.stops === 1 ? "" : "s"}.`);
    } else if (k === "interchange") {
      flush();
      out.push(`${s.edge.name}.`);
    } else if (k === "transit" || k === "board") {
      continue;
    } else walk.push(s);
  }
  flush();
  return out;
}

function describeWalk(r: Route): string[] {
  type Seg = { name: string; kind: string; m: number; rise: number; surface: string | null; unknown: boolean };
  const segs: Seg[] = [];
  for (const s of r.steps) {
    const a = s.edge.attrs;
    const name = s.edge.name ? placeName(s.edge) : "path";
    const kind = s.edge.kind;
    const rise = isKnown(a.incline) ? (a.incline.value * (s.forward ? 1 : -1) * s.edge.lengthM) / 100 : 0;
    const surface = isKnown(a.surface) ? surfaceLabel(a.surface.value) : null;
    const last = segs[segs.length - 1];
    if (last && last.name === name && last.kind === kind) {
      last.m += s.edge.lengthM;
      last.rise += rise;
      last.unknown ||= s.eval.passable === "unknown";
      last.surface ??= surface;
    } else segs.push({ name, kind, m: s.edge.lengthM, rise, surface, unknown: s.eval.passable === "unknown" });
  }
  return segs
    .filter((s) => s.m >= 3 || s.kind === "elevator" || s.kind === "crossing")
    .map((s) => {
      if (s.kind === "elevator") return "Take the lift.";
      if (s.kind === "crossing") return `Cross ${s.name === "path" ? "the road" : s.name}.`;
      const g = s.m > 0 ? (s.rise / s.m) * 100 : 0;
      const slope = Math.abs(g) < 2 ? "level" : `${g > 0 ? "uphill" : "downhill"} about ${Math.abs(g).toFixed(0)}%`;
      const bits = [`${s.name === "path" ? "Path" : s.name}, ${Math.round(s.m)} m`, slope];
      if (s.surface) bits.push(s.surface);
      if (s.unknown) bits.push("some details unknown");
      return bits.join(", ") + ".";
    });
}

export function toGeoJSON(r: Route, props: Record<string, unknown> = {}) {
  const coords: [number, number][] = [];
  for (const s of r.steps) {
    const g = s.forward ? s.edge.geometry : [...s.edge.geometry].reverse();
    for (const c of coords.length ? g.slice(1) : g) coords.push(c);
  }
  return {
    type: "Feature" as const,
    properties: props,
    geometry: { type: "LineString" as const, coordinates: coords },
  };
}

// ------------------------------------------------------------- trade-offs

export interface Tradeoff {
  id: "smoother" | "gentler" | "more-certain" | "more-benches" | "more-toilets";
  label: string;
  /** null when no route exists with this constraint: we say so rather than hide it. */
  route: Route | null;
  message: string;
}

/**
 * The alternatives that matter to this user are not "route 2 and route 3"
 * but "the one without setts" and "the one that's less steep". For each soft
 * cost on the chosen route, make it hard and see what that costs.
 */
export function tradeoffs(router: Router, chosen: Route, from: GraphNode, to: GraphNode, p: Profile, c: Conditions = DRY): Tradeoff[] {
  const sum = summarise(chosen, c.now);
  const out: Tradeoff[] = [];
  const mins = (r: Route) => Math.max(0, Math.round((r.seconds - chosen.seconds) / 60));
  const setts = (sum.surfaceMix["setts"] ?? 0) + (sum.surfaceMix["cobbles"] ?? 0);
  if (setts > 20) {
    const q: Profile = { ...p, surfaces: { ...p.surfaces, sett: null, cobblestone: null } };
    const r = router.route(from, to, q, c);
    out.push({
      id: "smoother",
      label: "Avoid setts",
      route: r,
      message: r ? `Avoids setts. Adds ${mins(r)} min.` : "Every way there that fits your settings has setts.",
    });
  }
  if (sum.worstInclinePct !== null && Math.abs(sum.worstInclinePct) > p.comfortInclinePct) {
    const cap = Math.max(p.comfortInclinePct, Math.floor(Math.abs(sum.worstInclinePct)) - 1);
    const q: Profile = { ...p, maxInclineUpPct: Math.min(p.maxInclineUpPct, cap), maxInclineDownPct: Math.min(p.maxInclineDownPct, cap) };
    const r = router.route(from, to, q, c);
    out.push({
      id: "gentler",
      label: `Keep under ${cap}%`,
      route: r,
      message: r ? `Nothing steeper than ${cap}%. Adds ${mins(r)} min.` : `No way there stays under ${cap}%.`,
    });
  }
  if (p.maxRestIntervalM) {
    const gap = restStats(router.graph, chosen).longestWithoutBenchM;
    if (gap > p.maxRestIntervalM) {
      // Try the user's interval first, then relax: shorter worst gaps are still worth offering.
      let best: { r: Route; gap: number } | null = null;
      for (const f of [1, 1.5, 2, 3]) {
        const r = router.routeWithRests(from, to, p, c, p.maxRestIntervalM * f);
        if (r) {
          const g2 = restStats(router.graph, r).longestWithoutBenchM;
          if (g2 < gap * 0.85) best = { r, gap: g2 };
          break;
        }
      }
      out.push({
        id: "more-benches",
        label: "More benches",
        route: best?.r ?? null,
        message: !best
          ? `No way there has mapped benches closer together than this. Not every bench is mapped.`
          : best.gap <= p.maxRestIntervalM
            ? `A mapped bench at least every ${p.maxRestIntervalM} m. Adds ${mins(best.r)} min.`
            : `Longest stretch without a bench ${Math.round(best.gap / 10) * 10} m instead of ${Math.round(gap / 10) * 10} m. Adds ${mins(best.r)} min.`,
      });
    }
  }
  if (p.maxToiletIntervalM) {
    const gap = restStats(router.graph, chosen).longestWithoutToiletM;
    if (gap > p.maxToiletIntervalM) {
      let best: { r: Route; gap: number } | null = null;
      for (const f of [1, 1.5, 2, 3]) {
        const r = router.routeWithRests(from, to, p, c, p.maxToiletIntervalM * f, "toilet");
        if (r) {
          const g2 = restStats(router.graph, r).longestWithoutToiletM;
          if (g2 < gap * 0.85) best = { r, gap: g2 };
          break;
        }
      }
      out.push({
        id: "more-toilets",
        label: "Past more toilets",
        route: best?.r ?? null,
        message: !best
          ? "No way there passes mapped accessible toilets closer together than this. Not every toilet is mapped."
          : best.gap <= p.maxToiletIntervalM
            ? `An accessible toilet at least every ${p.maxToiletIntervalM >= 1000 ? `${p.maxToiletIntervalM / 1000} km` : `${p.maxToiletIntervalM} m`}. Adds ${mins(best.r)} min.`
            : `Longest stretch without one ${Math.round(best.gap / 10) * 10} m instead of ${Math.round(gap / 10) * 10} m. Adds ${mins(best.r)} min.`,
      });
    }
  }
  if (sum.unknownM > 0) {
    const r = router.route(from, to, { ...p, uncertaintyTolerance: 0 }, c);
    const unknownM = r ? summarise(r, c.now).unknownM : Infinity;
    if (r && unknownM < sum.unknownM - 20) {
      out.push({ id: "more-certain", label: "Fewer unknowns", route: r, message: `${unknownM} m unknown instead of ${sum.unknownM} m. Adds ${mins(r)} min.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------- arrival

export interface EntranceOption {
  lon: number;
  lat: number;
  name: string | null;
  distanceM: number;
  verdict: EntranceVerdict;
  /** "OSM node 123, 2024-05-01": every access fact shows its source on request. */
  source: string;
  /** OSM node id: the stable key notes about this entrance hang off. */
  osmId: number;
}

/**
 * Entrances within `radiusM` of a destination, best for this user first.
 * The app routes to the first one that fits ("yes"), falling back to the building's centre.
 */
export function entrancesNear(g: Graph, lon: number, lat: number, p: Profile, radiusM = 40): EntranceOption[] {
  const rank = { yes: 0, unknown: 1, no: 2 } as const;
  // Service and emergency doors are not a way in for visitors.
  const NOT_FOR_VISITORS = new Set(["service", "emergency", "exit", "staircase"]);
  return (g.entrances ?? [])
    .filter((e) => !NOT_FOR_VISITORS.has(e.entrance.value ?? ""))
    .map((e) => ({ e, d: haversine([lon, lat], [e.lon, e.lat]) }))
    .filter(({ d }) => d <= radiusM)
    .map(({ e, d }) => ({
      osmId: e.osmId,
      lon: e.lon,
      lat: e.lat,
      name: e.name,
      distanceM: Math.round(d),
      verdict: entranceVerdict(e, p),
      source: `OpenStreetMap node ${e.osmId}${e.door.observedAt ? `, ${e.door.observedAt.slice(0, 10)}` : ""}`,
    }))
    .sort((a, b) => rank[a.verdict.passable] - rank[b.verdict.passable] || a.distanceM - b.distanceM);
}

// ------------------------------------------------------------- rest stops

export interface RestStats {
  /** Longest stretch of the route with no mapped bench within 25 m. */
  longestWithoutBenchM: number;
  benches: number;
  /** Toilets within 80 m of the route, in order along it. */
  toilets: { at: number; wheelchair: "yes" | "limited" | "no" | null; changingPlaces: boolean }[];
  /** Longest stretch with no accessible toilet within 80 m. */
  longestWithoutToiletM: number;
}

/** Benches and toilets along a route, from what OSM has mapped (never complete; say so in copy). */
export function restStats(g: Graph, r: Route): RestStats {
  const coords = toGeoJSON(r).geometry.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + haversine(coords[i - 1]!, coords[i]!));
  const along = (pt: [number, number], within: number): number | null => {
    let best: { d: number; at: number } | null = null;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!,
        b = coords[i + 1]!;
      const k = Math.cos((pt[1] * Math.PI) / 180);
      const ax = (a[0] - pt[0]) * k, ay = a[1] - pt[1], bx = (b[0] - pt[0]) * k, by = b[1] - pt[1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111_320;
      if (d <= within && (!best || d < best.d)) best = { d, at: cum[i]! + t * (cum[i + 1]! - cum[i]!) };
    }
    return best?.at ?? null;
  };
  const [minX, minY, maxX, maxY] = coords.reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const near = (g.amenities ?? []).filter((a) => a.lon >= minX - 0.001 && a.lon <= maxX + 0.001 && a.lat >= minY - 0.001 && a.lat <= maxY + 0.001);
  const benchAt = near.filter((a) => a.kind === "bench").map((a) => along([a.lon, a.lat], 25)).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const stops = [0, ...benchAt, cum[cum.length - 1] ?? 0];
  let gap = 0;
  for (let i = 1; i < stops.length; i++) gap = Math.max(gap, stops[i]! - stops[i - 1]!);
  const toilets = near
    .filter((a) => a.kind !== "bench")
    .map((a) => ({ at: along([a.lon, a.lat], 80), wheelchair: a.wheelchair.value, changingPlaces: a.kind === "changing_places" }))
    .filter((t): t is { at: number; wheelchair: "yes" | "limited" | "no" | null; changingPlaces: boolean } => t.at !== null)
    .sort((a, b) => a.at - b.at);
  const loos = [0, ...toilets.filter((t) => t.wheelchair === "yes" || t.changingPlaces).map((t) => t.at), cum[cum.length - 1] ?? 0];
  let toiletGap = 0;
  for (let i = 1; i < loos.length; i++) toiletGap = Math.max(toiletGap, loos[i]! - loos[i - 1]!);
  return { longestWithoutBenchM: Math.round(gap), benches: benchAt.length, toilets, longestWithoutToiletM: Math.round(toiletGap) };
}

// ------------------------------------------------------------- no route

export interface Blocker {
  /** Where, as we'd say it: "Castle Wynd South". */
  name: string;
  attr: string;
  /** "14 steps", "9.6% uphill", "6 cm kerb". */
  detail: string;
  lon: number;
  lat: number;
}

export interface Diagnosis {
  /** What stops this person on the way someone with no limits would go, in route order. */
  blockers: Blocker[];
  /** The point on that way nearest the destination that this person can reach, and how far short it is. */
  closest: { route: Route; name: string; leftM: number } | null;
  /** The smallest change to the limits, for this journey only, that finds a way; null when none would (a closure, a one-way). */
  relax: { patch: Partial<Profile>; what: string[]; route: Route } | null;
}

/** Limits a person can choose to stretch for one journey; closures, one-ways and "not wheelchair accessible" are not theirs to stretch. */
const RELAXABLE = new Set(["steps", "escalator", "incline", "kerb", "surface", "width"]);

/**
 * When nothing fits: say what is in the way, how close you can get, and
 * what one-off change would find a way. Never a dead end (D-035).
 *
 * "In the way" means on the way someone with no limits would go, past the
 * last point this person can reach: earlier obstacles already have a way round.
 */
export function diagnose(router: Router, from: GraphNode, to: GraphNode, p: Profile, unconstrained: Profile, c: Conditions = DRY): Diagnosis {
  const base = router.route(from, to, unconstrained, c);
  if (!base) return { blockers: [], closest: null, relax: null };

  // How close: the last node along that way you can reach.
  const reach = router.reach(from, p, c);
  let closest: Diagnosis["closest"] = null;
  let past = -1;
  for (let i = base.steps.length - 1; i >= 0; i--) {
    const n = base.steps[i]!.node;
    if (!reach.has(n.id)) continue;
    past = i;
    const leftM = haversine([n.lon, n.lat], [to.lon, to.lat]);
    const r = n.id === from.id ? null : router.route(from, n, p, c);
    if (r && leftM >= 10) closest = { route: r, name: placeName(base.steps[i]!.edge), leftM: Math.round(leftM) };
    break;
  }

  const found: { b: Blocker; r: Reason; s: Step }[] = [];
  base.steps.forEach((s, i) => {
    if (i <= past) return;
    const ev = evaluateEdge(s.edge, s.forward, p, c, router.edgeContext(s.edge.id));
    const nv = evaluateNode(s.node, s.edge.kind === "crossing", p, c);
    const mid = s.edge.geometry[Math.floor(s.edge.geometry.length / 2)]!;
    for (const [r, at] of [
      [ev.reasons.find((x) => x.kind === "excluded"), mid],
      [nv.reasons.find((x) => x.kind === "excluded"), [s.node.lon, s.node.lat]],
    ] as [Reason | undefined, [number, number]][]) {
      if (r) found.push({ b: { name: placeName(s.edge), attr: r.attr, detail: r.detail, lon: at[0], lat: at[1] }, r, s });
    }
  });
  // One entry per street and kind of obstacle.
  const blockers = found.map((f) => f.b).filter((b, i, all) => i === 0 || all[i - 1]!.name !== b.name || all[i - 1]!.attr !== b.attr);

  const patch: Partial<Profile> = {};
  /** One phrase per limit, overwritten as it grows ("slopes up to 8%", then "up to 10%"). */
  const what = new Map<string, string>();
  let relaxable = found.length > 0;
  for (const { r, s } of found) {
    if (!RELAXABLE.has(r.attr) || / in ice$/.test(r.detail)) {
      relaxable = false;
      break;
    }
    const a = s.edge.attrs;
    if (r.attr === "steps") {
      patch.maxSteps = Math.max(patch.maxSteps ?? 0, isKnown(a.stepCount) ? a.stepCount.value : Infinity);
      what.set("steps", "steps");
    } else if (r.attr === "escalator") {
      patch.escalators = true;
      what.set("escalator", "escalators");
    } else if (r.attr === "incline") {
      const v = Math.ceil(parseFloat(r.detail));
      if (/uphill/.test(r.detail)) patch.maxInclineUpPct = Math.max(patch.maxInclineUpPct ?? p.maxInclineUpPct, v);
      else patch.maxInclineDownPct = Math.max(patch.maxInclineDownPct ?? p.maxInclineDownPct, v);
      what.set("incline", `slopes up to ${Math.max(patch.maxInclineUpPct ?? 0, patch.maxInclineDownPct ?? 0)}%`);
    } else if (r.attr === "kerb") {
      const cm = /(\d+(\.\d+)?) cm/.exec(r.detail);
      patch.maxKerbCm = Math.max(patch.maxKerbCm ?? p.maxKerbCm, cm ? Math.ceil(parseFloat(cm[1]!)) : 13);
      what.set("kerb", `kerbs up to ${patch.maxKerbCm} cm`);
    } else if (r.attr === "surface" && isKnown(a.surface)) {
      patch.surfaces = { ...(patch.surfaces ?? p.surfaces), [a.surface.value]: 1 };
      what.set(`surface:${a.surface.value}`, surfaceLabel(a.surface.value));
    } else if (r.attr === "width" && isKnown(a.width)) {
      patch.minWidthM = Math.min(patch.minWidthM ?? p.minWidthM, Math.floor(a.width.value * 10) / 10);
      what.set("width", `paths ${patch.minWidthM} m wide`);
    }
  }
  // Smallest change first: one limit on its own, then all of them together.
  let relax: Diagnosis["relax"] = null;
  if (relaxable && what.size) {
    const groups: [Partial<Profile>, string[]][] = [];
    for (const [k, w] of what) {
      const key = k.startsWith("surface:") ? "surfaces" : ({ steps: "maxSteps", escalator: "escalators", kerb: "maxKerbCm", width: "minWidthM" } as Record<string, keyof Profile>)[k];
      const only: Partial<Profile> = key ? { [key]: patch[key] } : { maxInclineUpPct: patch.maxInclineUpPct, maxInclineDownPct: patch.maxInclineDownPct };
      groups.push([Object.fromEntries(Object.entries(only).filter(([, v]) => v !== undefined)), [w]]);
    }
    if (groups.length > 1) groups.push([patch, [...what.values()]]);
    for (const [q, words] of groups) {
      const r = router.route(from, to, { ...p, ...q }, c);
      if (r) {
        relax = { patch: q, what: words, route: r };
        break;
      }
    }
  }
  return { blockers, closest, relax };
}
