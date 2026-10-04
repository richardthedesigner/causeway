/**
 * Turn-by-turn: manoeuvres, hazards ahead and progress along a route.
 * Pure functions over a planned route, so the same code runs in the web app,
 * the Expo app and tests. Instructions follow the brief's copy rules: plain,
 * British English, distances rounded to what a person can use.
 */
import { haversine, isKnown, type GraphEdge } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { surfaceLabel } from "./cost.js";
import { placeName, toGeoJSON, type Route } from "./router.js";

export type ManeuverType = "start" | "turn" | "continue" | "cross" | "lift" | "enter-station" | "board" | "change" | "alight" | "leave-station" | "arrive";

export interface Maneuver {
  type: ManeuverType;
  /** Distance along the route where it happens, metres. */
  at: number;
  text: string;
  /** Short form for the instruction card when close: "Turn left". */
  short: string;
}

export interface Hazard {
  kind: "steep" | "setts" | "unknown" | "kerb" | "bridge" | "camber";
  at: number;
  length: number;
  /** "Steep section" */
  title: string;
  /** "8% downhill for 30 m" */
  detail: string;
}

export const hazardText = (h: Hazard) => (!h.detail ? h.title : h.detail.startsWith("for ") ? `${h.title} ${h.detail}` : `${h.title}: ${h.detail}`);

export interface NavPlan {
  coords: [number, number][];
  /** Cumulative distance at each coordinate. */
  cum: number[];
  length: number;
  maneuvers: Maneuver[];
  hazards: Hazard[];
}

const RAIL = new Set(["transit", "board", "interchange"]);

function bearing(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toRad) * Math.cos(b[1] * toRad);
  const x = Math.cos(a[1] * toRad) * Math.sin(b[1] * toRad) - Math.sin(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.cos((b[0] - a[0]) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function turnWord(delta: number): { word: string; type: ManeuverType } {
  const d = ((delta + 540) % 360) - 180; // -180..180, positive = right
  const a = Math.abs(d);
  if (a < 25) return { word: "Continue", type: "continue" };
  if (a < 60) return { word: d > 0 ? "Bear right" : "Bear left", type: "turn" };
  if (a < 150) return { word: d > 0 ? "Turn right" : "Turn left", type: "turn" };
  return { word: "Turn around", type: "turn" };
}

const label = (e: GraphEdge) => (e.name ? placeName(e) : null);

export function buildNavPlan(r: Route, p: Profile): NavPlan {
  const coords = toGeoJSON(r).geometry.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + haversine(coords[i - 1]!, coords[i]!));
  const length = cum[cum.length - 1] ?? 0;

  // Distance at which each step starts, and its oriented geometry.
  const starts: number[] = [];
  let d = 0;
  for (const s of r.steps) {
    starts.push(d);
    d += s.edge.lengthM;
  }
  const geom = (i: number) => {
    const s = r.steps[i]!;
    return s.forward ? s.edge.geometry : [...s.edge.geometry].reverse();
  };

  const maneuvers: Maneuver[] = [{ type: "start", at: 0, text: r.steps[0] ? `Head off${label(r.steps[0].edge) ? ` along ${label(r.steps[0].edge)}` : ""}.` : "Start.", short: "Start" }];
  for (let i = 1; i < r.steps.length; i++) {
    const prev = r.steps[i - 1]!,
      s = r.steps[i]!;
    const at = starts[i]!;
    const k = s.edge.kind;
    if (k === "elevator" || (s.node.kind === "elevator" && prev.edge.kind !== "elevator")) {
      if (k === "elevator") maneuvers.push({ type: "lift", at, text: "Take the lift.", short: "Lift" });
      continue;
    }
    if (k === "station_link") {
      maneuvers.push(s.forward ? { type: "leave-station", at, text: `Leave ${s.edge.name} station.`, short: "Leave station" } : { type: "enter-station", at, text: `Go into ${s.edge.name} station.`, short: "Station" });
      continue;
    }
    if (k === "board") {
      const [station, line] = [(s.edge.name ?? "").split(", ")[0], (s.edge.name ?? "").split(", ").slice(1).join(", ")];
      if (s.forward) {
        let j = i + 1;
        while (j < r.steps.length && r.steps[j]!.edge.kind === "transit") j++;
        const to = r.steps[j]?.edge.kind === "board" ? (r.steps[j]!.edge.name ?? "").split(", ")[0] : null;
        maneuvers.push({ type: "board", at, text: `Take the ${line}${to ? ` to ${to}` : ""} from ${station}.`, short: line ?? "Train" });
      } else maneuvers.push({ type: "alight", at, text: `Get off at ${station}.`, short: `Get off at ${station}` });
      continue;
    }
    if (k === "interchange") {
      maneuvers.push({ type: "change", at, text: `${s.edge.name}.`, short: "Change" });
      continue;
    }
    if (k === "transit") continue;
    if (k === "crossing" && prev.edge.kind !== "crossing") {
      const name = label(s.edge);
      maneuvers.push({ type: "cross", at, text: `Cross ${name ?? "the road"}.`, short: "Cross" });
      continue;
    }
    if (RAIL.has(prev.edge.kind) || prev.edge.kind === "station_link") continue;
    const nameChanged = label(s.edge) !== label(prev.edge) && label(s.edge) !== null;
    const pg = geom(i - 1),
      ng = geom(i);
    const b1 = bearing(pg[Math.max(0, pg.length - 2)]!, pg[pg.length - 1]!);
    const b2 = bearing(ng[0]!, ng[Math.min(1, ng.length - 1)]!);
    const t = turnWord(b2 - b1);
    if (t.type === "turn" || nameChanged) {
      const name = label(s.edge);
      const text = t.type === "continue" ? `Continue onto ${name}.` : nameChanged && name ? `${t.word} onto ${name}.` : `${t.word}.`;
      // Collapse a manoeuvre that follows another within 8 m (map noise at junctions).
      const last = maneuvers[maneuvers.length - 1]!;
      if (at - last.at < 8 && last.type === "turn") maneuvers[maneuvers.length - 1] = { ...last, text, short: t.word };
      else maneuvers.push({ type: t.type, at, text, short: t.word });
    }
  }
  maneuvers.push({ type: "arrive", at: length, text: "You have arrived.", short: "Arrived" });

  // Hazards: what a person would want warning of before they reach it.
  const hazards: Hazard[] = [];
  const len10 = (m: number) => `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const push = (h: Hazard) => {
    let last: Hazard | undefined;
    for (let k = hazards.length - 1; k >= 0; k--) if (hazards[k]!.kind === h.kind) {
      last = hazards[k];
      break;
    }
    // Merge continuing stretches of the same thing (a long steep street split into several edges).
    // Both kerbs of one crossing are one warning.
    if (h.kind === "kerb" && last && h.at - last.at < 15 && last.title === h.title) return;
    const head = (x: string) => x.replace(/(^| )?for \d+ m$/, "");
    if (last && last.kind === h.kind && h.length > 0 && h.at - (last.at + last.length) < 5 && head(last.detail) === head(h.detail)) {
      last.length = h.at + h.length - last.at;
      const hd = head(last.detail);
      last.detail = hd ? `${hd} for ${len10(last.length)}` : `for ${len10(last.length)}`;
    } else hazards.push(h);
  };
  r.steps.forEach((s, i) => {
    if (RAIL.has(s.edge.kind)) return;
    const a = s.edge.attrs;
    const L = s.edge.lengthM;
    const at = starts[i]!;
    const w = isKnown(a.inclineMax) ? a.inclineMax.value * (s.forward ? 1 : -1) : null;
    if (w !== null && Math.abs(w) >= Math.max(5, p.comfortInclinePct) && L >= 5) {
      push({ kind: "steep", at, length: L, title: "Steep section", detail: `${Math.round(Math.abs(w))}% ${w > 0 ? "uphill" : "downhill"} for ${len10(L)}` });
    }
    if (isKnown(a.surface) && (a.surface.value === "sett" || a.surface.value === "cobblestone") && L >= 10) {
      const name = surfaceLabel(a.surface.value);
      push({ kind: "setts", at, length: L, title: name[0]!.toUpperCase() + name.slice(1), detail: `for ${len10(L)}` });
    }
    if (isKnown(a.crossSlope) && a.crossSlope.value > p.maxCrossSlopePct && L >= 10) {
      push({ kind: "camber", at, length: L, title: "Pavement slopes sideways", detail: `${Math.round(a.crossSlope.value)}% for ${len10(L)}` });
    }
    if (s.edge.movable) push({ kind: "bridge", at, length: L, title: s.edge.name ?? "Moving bridge", detail: `closes when it ${s.edge.movable === "swing" ? "swings" : "tilts"} for boats` });
    if (s.nodeEval.reasons.some((x) => x.kind === "unknown" && x.attr === "kerb")) push({ kind: "kerb", at: at + L, length: 0, title: "Kerb not mapped", detail: "at the next crossing" });
    else if (s.nodeEval.reasons.some((x) => /inferred/.test(x.detail))) push({ kind: "kerb", at: at + L, length: 0, title: "Dropped kerb expected", detail: "not confirmed" });
    if (s.eval.passable === "unknown" && L >= 20) push({ kind: "unknown", at, length: L, title: "Missing data", detail: `for ${len10(L)}` });
  });

  hazards.sort((a, b) => a.at - b.at);
  return { coords, cum, length, maneuvers, hazards };
}

export interface Progress {
  /** Distance along the route, metres. */
  along: number;
  /** Distance from the route line, metres. */
  offBy: number;
  offRoute: boolean;
  arrived: boolean;
  next: Maneuver | null;
  distanceToNext: number;
  /** Something to say now, if anything: a new manoeuvre or a hazard coming up. */
  announce: string | null;
  /** The hazard within warning range, for the banner. */
  hazard: (Hazard & { inM: number }) | null;
}

const OFF_ROUTE_M = 25;
const HAZARD_WARN_M = 60;
const MANEUVER_WARN_M = 40;

/**
 * Tracks progress along a plan. Feed it position fixes; it snaps to the
 * route without jumping backwards, decides when you are off route (two fixes
 * in a row beyond 25 m or the fix's accuracy, whichever is larger), and
 * produces at most one announcement per manoeuvre or hazard.
 */
export class Navigator {
  private along = 0;
  private offCount = 0;
  private said = new Set<string>();
  constructor(readonly plan: NavPlan) {}

  update(lon: number, lat: number, accuracyM = 10): Progress {
    const { coords, cum } = this.plan;
    let best = { d: Infinity, along: this.along };
    // Search forward from current progress (plus a little back) so a loop in the route can't make us jump.
    let i0 = 0;
    while (i0 < cum.length - 1 && cum[i0 + 1]! < this.along - 30) i0++;
    for (let i = i0; i < coords.length - 1 && cum[i]! < this.along + 400; i++) {
      const proj = project([lon, lat], coords[i]!, coords[i + 1]!);
      if (proj.d < best.d) best = { d: proj.d, along: cum[i]! + proj.t * (cum[i + 1]! - cum[i]!) };
    }
    const limit = Math.max(OFF_ROUTE_M, accuracyM);
    if (best.d > limit) this.offCount++;
    else {
      this.offCount = 0;
      this.along = Math.max(this.along, best.along);
    }
    const offRoute = this.offCount >= 2;
    const arrived = this.plan.length - this.along < 15;
    const next = this.plan.maneuvers.find((m) => m.at > this.along + 2) ?? null;
    const distanceToNext = next ? Math.max(0, next.at - this.along) : 0;
    const live = (h: Hazard) => h.at + h.length > this.along && h.at - this.along <= HAZARD_WARN_M;
    // Banner: whatever you're in or about to reach. Announcement: the first one not yet said.
    const banner = this.plan.hazards.find(live) ?? null;
    const ahead = this.plan.hazards.find((h, i) => live(h) && !this.said.has(`h:${i}`)) ?? null;
    let announce: string | null = null;
    if (arrived && !this.said.has("arrive")) {
      announce = "You have arrived.";
      this.said.add("arrive");
    } else if (offRoute && !this.said.has(`off:${Math.round(this.along / 50)}`)) {
      announce = "You're off the route. Working out a new one.";
      this.said.add(`off:${Math.round(this.along / 50)}`);
    } else if (ahead && !this.said.has(`h:${this.plan.hazards.indexOf(ahead)}`)) {
      // Everything starting at about the same place is said together: "Steep section in 50 metres: 7% downhill for 70 m. Setts for 70 m."
      const group = this.plan.hazards.filter((h) => Math.abs(h.at - ahead.at) <= 10 && !this.said.has(`h:${this.plan.hazards.indexOf(h)}`));
      for (const h of group) this.said.add(`h:${this.plan.hazards.indexOf(h)}`);
      const inM = Math.max(0, Math.round((ahead.at - this.along) / 10) * 10);
      const [first, ...others] = group;
      const rest = others.filter((h, i) => hazardText(h) !== hazardText(first!) && others.findIndex((o) => hazardText(o) === hazardText(h)) === i);
      const lead = inM > 5 ? `${first!.title} in ${inM} metres${first!.detail ? (first!.detail.startsWith("for ") ? `, ${first!.detail}` : `: ${first!.detail}`) : ""}.` : `${hazardText(first!)}.`;
      announce = [lead, ...rest.map((h) => `${hazardText(h)}.`)].join(" ");
    } else if (next && next.type !== "arrive" && distanceToNext <= MANEUVER_WARN_M && !this.said.has(`m:${next.at}`)) {
      announce = distanceToNext > 10 ? `In ${Math.round(distanceToNext / 10) * 10} metres, ${next.text.charAt(0).toLowerCase()}${next.text.slice(1)}` : next.text;
      this.said.add(`m:${next.at}`);
    }
    return {
      along: this.along,
      offBy: best.d,
      offRoute,
      arrived,
      next,
      distanceToNext,
      announce,
      hazard: banner ? { ...banner, inM: Math.max(0, Math.round(banner.at - this.along)) } : null,
    };
  }
}

function project(p: [number, number], a: [number, number], b: [number, number]): { d: number; t: number } {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k,
    ay = a[1] - p[1],
    bx = (b[0] - p[0]) * k,
    by = b[1] - p[1];
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx,
    y = ay + t * dy;
  return { d: Math.hypot(x, y) * 111_320, t };
}
