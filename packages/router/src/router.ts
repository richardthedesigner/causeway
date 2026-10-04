/**
 * A* over the pedestrian graph with per-request costs. Phase 0 spike
 * implementation: it exists to prove the data model and cost model, and
 * to be the reference the chosen engine is tested against (DECISIONS.md D-003).
 */
import { confidence, haversine, isKnown, type Graph, type GraphEdge, type GraphNode } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { DRY, entranceVerdict, evaluateEdge, evaluateNode, surfaceLabel, type Conditions, type EntranceVerdict, type Evaluation, type Reason } from "./cost.js";

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

  constructor(readonly graph: Graph) {
    for (const n of graph.nodes) this.nodes.set(n.id, n);
    for (const e of graph.edges) {
      this.arc(e.from, { edge: e, forward: true, to: e.to });
      this.arc(e.to, { edge: e, forward: false, to: e.from });
    }
    this.labelComponents();
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
    const vmax = p.speedMps;
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
        const ev = evaluateEdge(a.edge, a.forward, p, c);
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
  for (const s of r.steps) if (s.edge.movable) movable.set(s.edge.name ?? "a movable bridge", s.edge.movable);
  const blocked = r.steps.some((s) => s.eval.passable === "no" || s.nodeEval.passable === "no");
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
    confidence: r.lengthM ? Math.round((confSum / r.lengthM) * 100) / 100 : 0,
    movableBridges: [...movable].map(([name, type]) => ({ name, type })),
    verdict: blocked ? "not-passable" : unknownM > 0 ? "passable-with-unknowns" : "passable",
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
      const ev = evaluateEdge(s.edge, s.forward, p, c);
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
  const addedMinutes = base ? Math.max(0, Math.round((chosen.seconds - base.lengthM / p.speedMps) / 60)) : 0;

  const notes: string[] = [];
  const sum = summarise(chosen, c.now);
  if (sum.lifts) {
    const live = router.graph.meta.liveFeeds?.some((f) => f.endsWith("lifts"));
    notes.push(`Uses ${sum.lifts === 1 ? "a lift" : `${sum.lifts} lifts`}.${live ? "" : " We have no live lift status here, so check before you set off."}`);
  }
  for (const b of sum.movableBridges) {
    const verb = b.type === "tilt" ? "tilting" : b.type === "swing" ? "swing" : "movable";
    notes.push(`Crosses ${b.name}, a ${verb} bridge. It closes for a few minutes while it moves for boats. We don't have its timetable yet.`);
  }
  const setts = (sum.surfaceMix["setts"] ?? 0) + (sum.surfaceMix["cobbles"] ?? 0);
  if (setts > 20) notes.push(`${setts} m on setts or cobbles.`);
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
  id: "smoother" | "gentler" | "more-certain";
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
}

/**
 * Entrances within `radiusM` of a destination, best for this user first.
 * Phase 2 routes to the chosen entrance rather than to the building's centre.
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
      lon: e.lon,
      lat: e.lat,
      name: e.name,
      distanceM: Math.round(d),
      verdict: entranceVerdict(e, p),
      source: `OpenStreetMap node ${e.osmId}${e.door.observedAt ? `, ${e.door.observedAt.slice(0, 10)}` : ""}`,
    }))
    .sort((a, b) => rank[a.verdict.passable] - rank[b.verdict.passable] || a.distanceM - b.distanceM);
}
