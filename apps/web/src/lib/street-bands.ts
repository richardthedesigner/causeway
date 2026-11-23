/**
 * Street bands (design v3, FEAT-66): the route strip opened out, one row per
 * stretch, in the order you travel. Built in the router worker from the
 * router's own steps, so every figure is the router's. Pure: no graph, no
 * clock, no state.
 *
 * The rules, with the choices made where the handoff is silent:
 * - Consecutive steps on the same street make one band. A street's name is
 *   the name on the edge, including one borrowed from the street a pavement
 *   runs beside (`nameInferred`): that pavement belongs to the street's band.
 * - Steps with no name, the few metres to a stop or station, and lifts join
 *   the stretch before them. At the start of the route, or straight after a
 *   ride, there is no stretch before: they join the street that follows.
 *   A walk with no named street at all is one band called by its stop's name,
 *   or "A path".
 * - A band is `unknown` when more than half its metres carry a critical
 *   unknown: `hasCriticalUnknown`, the test behind `summary.unknownM`.
 * - Unknown bands next to each other merge into one, named by the count
 *   ("Nine streets"), with the street names kept in `names`. One unknown
 *   street on its own keeps its name. A ride between two unknown bands keeps
 *   them apart.
 * - A ride (bus, tram, train) is one band per vehicle, named by its line and
 *   where you get off. Its metres are the ride's and are not ground you cover.
 * - Walking bands' metres are whole and add up to `summary.walkM` exactly:
 *   each band takes the rounded running total less what went before.
 * - `blocked`: the closest route stops short of the blocker, so no stretch on
 *   it holds the blocker. The blocker is added as a last band of 0 m.
 */
import { isKnown, type GraphEdge } from "@causeway/graph";
import { hasCriticalUnknown, isRideKind, surfaceLabel, type Evaluation } from "@causeway/router";

export interface StreetBand {
  /** Street name; the count in words when unknown streets merge ("Nine streets"); the line and stop for a ride ("Bus 23 to Tollcross"). */
  name: string;
  /** Metres, whole. Walking bands add up to `summary.walkM`. A ride's metres are the ride's. A blocked band has 0. */
  m: number;
  state: "measured" | "unknown" | "blocked" | "ride";
  /** Steepest 10 m window on the stretch, signed, + uphill, as `summary.worstInclinePct` has it. Null when not known, and for rides. */
  steepestPct: number | null;
  /** One short line: "Level", "About 5% down", "Setts, about 4% up", "Nobody has measured", "5 stops", or the blocker's detail. */
  condition: string;
  /** The stretch's edges in travel order, to light it on the map. */
  edgeIds: number[];
  /** Merged unknown streets only: their names in travel order, each once. */
  names?: string[];
}

/** What a band needs from a router `Step`. A `Route` from the router fits as it is. */
export interface BandStep {
  edge: Pick<GraphEdge, "id" | "name" | "kind" | "lengthM" | "service"> & { attrs: Pick<GraphEdge["attrs"], "incline" | "inclineMax" | "surface"> };
  forward: boolean;
  eval: Pick<Evaluation, "passable">;
  nodeEval: Pick<Evaluation, "passable">;
}

/** At or under this slope a stretch reads as level: the flag's "nothing over 3%". */
export const LEVEL_PCT = 3;

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** A count in words up to twenty, then in figures: "nine", "21". */
export const countWord = (n: number): string => WORDS[n] ?? String(n);
export const capitalise = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The slope in words: "level", "about 5% down". Whole per cent, "about" for any slope. */
export function slopeWords(pct: number): string {
  return Math.abs(pct) <= LEVEL_PCT ? "level" : `about ${Math.round(Math.abs(pct))}% ${pct > 0 ? "up" : "down"}`;
}

/** Joins its neighbour: no name, the link to a stop or station, or a lift. */
const joins = (s: BandStep) => !s.edge.name || s.edge.kind === "station_link" || s.edge.kind === "elevator";
const sumM = (steps: BandStep[]) => steps.reduce((t, s) => t + s.edge.lengthM, 0);
const stopName = (s: BandStep) => (s.edge.name ?? "").split(", ")[0]!;

/** Signed steepest slope of one step, as `summarise` reads it: the steepest window, else the mean. */
function steepOf(s: BandStep): number | null {
  const a = s.edge.attrs;
  const dir = s.forward ? 1 : -1;
  return isKnown(a.inclineMax) ? a.inclineMax.value * dir : isKnown(a.incline) ? a.incline.value * dir : null;
}

function steepest(steps: BandStep[]): number | null {
  let worst: number | null = null;
  for (const s of steps) {
    const w = steepOf(s);
    if (w !== null && (worst === null || Math.abs(w) > Math.abs(worst))) worst = w;
  }
  return worst === null ? null : Math.round(worst * 10) / 10;
}

/** Setts or cobbles, when they are more than half the stretch: the surface worth a word. */
function roughSurface(steps: BandStep[], total: number): string | null {
  const by = new Map<string, number>();
  for (const s of steps) {
    const a = s.edge.attrs.surface;
    if (isKnown(a) && (a.value === "sett" || a.value === "cobblestone")) by.set(a.value, (by.get(a.value) ?? 0) + s.edge.lengthM);
  }
  const rough = [...by.values()].reduce((t, v) => t + v, 0);
  if (!(rough > total / 2)) return null;
  return surfaceLabel([...by.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
}

type Draft = Omit<StreetBand, "m"> & { raw: number };

function walkBand(name: string | null, steps: BandStep[]): Draft {
  const raw = sumM(steps);
  const unknownM = sumM(steps.filter(hasCriticalUnknown));
  const pct = steepest(steps);
  const unknown = unknownM > raw / 2;
  const surface = roughSurface(steps, raw);
  return {
    name: name ?? (steps.map((s) => s.edge.name).find((n): n is string => !!n) ?? "A path"),
    raw,
    state: unknown ? "unknown" : "measured",
    steepestPct: pct,
    condition: unknown ? "Nobody has measured" : capitalise([surface, pct === null ? "slope not measured" : slopeWords(pct)].filter(Boolean).join(", ")),
    edgeIds: steps.map((s) => s.edge.id),
  };
}

function rideBand(steps: BandStep[]): Draft {
  const on = steps.find((s) => s.edge.kind === "board" && s.forward);
  const off = [...steps].reverse().find((s) => s.edge.kind === "board" && !s.forward);
  const sv = on?.edge.service;
  // "Viewforth, 23 bus towards Lennox Row" and "Canary Wharf, Jubilee line towards Stratford": the line is after the stop.
  const line = (on?.edge.name ?? "").split(", ").slice(1).join(", ").replace(/ towards .*/, "");
  const what = sv ? (sv.mode === "bus" ? `Bus ${sv.route}` : sv.mode === "tram" ? "Tram" : "Metro") : capitalise(line) || "Ride";
  const stops = steps.filter((s) => s.edge.kind === "transit").length;
  return {
    name: off ? `${what} to ${stopName(off)}` : what,
    raw: sumM(steps),
    state: "ride",
    steepestPct: null,
    condition: `${stops} ${stops === 1 ? "stop" : "stops"}`,
    edgeIds: steps.map((s) => s.edge.id),
  };
}

function merge(run: Draft[]): Draft {
  if (run.length === 1) return run[0]!;
  const names = [...new Set(run.flatMap((b) => b.names ?? [b.name]))];
  const pct = run.reduce<number | null>((w, b) => (b.steepestPct !== null && (w === null || Math.abs(b.steepestPct) > Math.abs(w)) ? b.steepestPct : w), null);
  return {
    name: names.length === 1 ? names[0]! : `${capitalise(countWord(names.length))} streets`,
    raw: run.reduce((t, b) => t + b.raw, 0),
    state: "unknown",
    steepestPct: pct,
    condition: "Nobody has measured",
    edgeIds: run.flatMap((b) => b.edgeIds),
    ...(names.length > 1 ? { names } : {}),
  };
}

/**
 * The route as street bands. `blocker`: for the closest route of a
 * `status: "none"` result, the first thing in the way, added as the last band.
 */
export function streetBands(route: { steps: readonly BandStep[] }, blocker?: { name: string; detail: string } | null): StreetBand[] {
  const groups: { ride: boolean; name: string | null; steps: BandStep[] }[] = [];
  for (const s of route.steps) {
    const cur = groups[groups.length - 1];
    if (isRideKind(s.edge.kind)) {
      // Each vehicle is its own band: getting on starts a new one.
      if (cur?.ride && !(s.edge.kind === "board" && s.forward)) cur.steps.push(s);
      else groups.push({ ride: true, name: null, steps: [s] });
      continue;
    }
    const name = joins(s) ? null : s.edge.name;
    if (!cur || cur.ride || (name !== null && cur.name !== null && cur.name !== name)) groups.push({ ride: false, name, steps: [s] });
    else {
      cur.name ??= name;
      cur.steps.push(s);
    }
  }
  const drafts: Draft[] = [];
  for (const g of groups) {
    const b = g.ride ? rideBand(g.steps) : walkBand(g.name, g.steps);
    const last = drafts[drafts.length - 1];
    if (b.state === "unknown" && last?.state === "unknown") drafts[drafts.length - 1] = merge([last, b]);
    else drafts.push(b);
  }
  let walked = 0;
  const bands = drafts.map(({ raw, ...b }): StreetBand => {
    if (b.state === "ride") return { ...b, m: Math.round(raw) };
    const before = Math.round(walked);
    walked += raw;
    return { ...b, m: Math.round(walked) - before };
  });
  if (blocker) bands.push({ name: capitalise(blocker.name), m: 0, state: "blocked", steepestPct: null, condition: capitalise(blocker.detail), edgeIds: [] });
  return bands;
}
