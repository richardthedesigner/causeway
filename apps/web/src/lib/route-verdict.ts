/**
 * The words of the route moment (design v3, FEAT-66): the verdict word, the
 * one-line flag under it, the sentence when it unfolds, the note under the
 * bands, and how a band is read aloud. Pure, and every figure comes from
 * `PlanResult` and `PlannedRoute`.
 *
 * Distances follow the device's unit (D-074), through `formatDistance`.
 * `route` defaults to the best route of an "ok" result, and to the closest
 * route of a "none" result.
 */
import { formatDistance, type DistanceUnit } from "@causeway/profile";
import type { PlannedRoute, PlanResult } from "./plan-types";
import { capitalise, countWord, LEVEL_PCT, type StreetBand } from "./street-bands";

export interface RouteVerdict {
  word: "Fits" | "Unsure" | "Doesn't fit";
  /** The fill token for the pill and the bands. */
  fill: "--ok-fill" | "--caution-fill" | "--stop-fill";
  /** The stone's state. */
  stone: "fits" | "unsure" | "nope";
}

const FITS: RouteVerdict = { word: "Fits", fill: "--ok-fill", stone: "fits" };
const UNSURE: RouteVerdict = { word: "Unsure", fill: "--caution-fill", stone: "unsure" };
const NOPE: RouteVerdict = { word: "Doesn't fit", fill: "--stop-fill", stone: "nope" };

type MomentRoute = Pick<PlannedRoute, "summary" | "minutesExtra" | "id"> & { streetBands?: StreetBand[] };

const pick = (result: PlanResult, route?: MomentRoute | null): MomentRoute | null => route ?? (result.status === "ok" ? (result.routes[0] ?? null) : result.closest);

/** Fits, Unsure or Doesn't fit. A "none" result never fits, whatever its closest route's own verdict. */
export function routeVerdict(result: PlanResult, route?: MomentRoute | null): RouteVerdict {
  if (result.status === "none") return NOPE;
  const v = pick(result, route)?.summary.verdict;
  return v === "passable" ? FITS : v === "passable-with-unknowns" ? UNSURE : NOPE;
}

/**
 * The one line under the word: what decided it. Null when the router gives
 * nothing to say (a route that fits with no slope data: "level" would be a claim).
 */
export function flagLine(result: PlanResult, route?: MomentRoute | null, unit: DistanceUnit = "kmh"): string | null {
  if (result.status === "none") {
    const b = result.blockers[0];
    return b ? `${capitalise(b.detail)} on ${b.name}` : result.message;
  }
  const s = pick(result, route)?.summary;
  if (!s || s.verdict === "not-passable") return null;
  if (s.verdict === "passable-with-unknowns") {
    // No unknown metres: the doubt is a station or a stop, which has no length.
    return s.unknownM > 0 ? `${formatDistance(s.unknownM, unit)} nobody has measured` : "Some of it nobody has measured";
  }
  if (s.worstInclinePct === null) return null;
  if (Math.abs(s.worstInclinePct) <= LEVEL_PCT) return "Level all the way";
  return `Steepest ${Math.abs(s.worstInclinePct)}%${s.worstInclineAt ? `, on ${s.worstInclineAt}` : ""}`;
}

/** The sentence under the pill once the moment has unfolded. */
export function unfoldedSentence(result: PlanResult, route?: MomentRoute | null, unit: DistanceUnit = "kmh"): string {
  if (result.status === "none") {
    const b = result.blockers[0];
    return b ? `${capitalise(b.name)} stops this way.` : `${result.message}.`;
  }
  const r = pick(result, route);
  const v = routeVerdict(result, r);
  if (v === FITS) return "Fits all the way.";
  if (v === NOPE || !r) return "This way doesn't fit.";
  const n = (r.streetBands ?? []).filter((b) => b.state === "unknown").length;
  // No band is mostly unknown: say how much, as the flag does.
  const what = n === 1 ? "One stretch" : n > 1 ? `${capitalise(countWord(n))} stretches` : r.summary.unknownM > 0 ? formatDistance(r.summary.unknownM, unit) : "Some of it";
  return `Fine most of the way. ${what} nobody's measured yet.`;
}

/**
 * The note under the bands: what the best route goes round. Null when it
 * goes round nothing, and for other routes: `avoided` describes the best
 * route only. "Adds n min" shows when the route's `minutesExtra` is over 0.
 */
export function noteLine(result: PlanResult, route?: MomentRoute | null): string | null {
  if (result.status !== "ok") return null;
  const a = result.avoided[0];
  const best = result.routes[0];
  const r = pick(result, route);
  if (!a || !best || !r || r.id !== best.id) return null;
  return `Goes round ${a.name}, ${a.detail}.${r.minutesExtra > 0 ? ` Adds ${r.minutesExtra} min.` : ""}`;
}

const lower = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** A band as one item for a screen reader: "Marchmont Road, about 5% down, 204 metres." */
export function bandLabel(b: StreetBand, unit: DistanceUnit = "kmh"): string {
  const dist = formatDistance(b.m, unit, { long: true, precise: true });
  if (b.state === "ride") return `${b.name}, ${b.condition}.`;
  if (b.state === "blocked") return `Blocked: ${b.name}, ${lower(b.condition)}.`;
  if (b.state === "unknown") return b.names ? `${b.name} nobody has measured, ${dist}: ${b.names.join(", ")}.` : `${b.name}, nobody has measured, ${dist}.`;
  return `${b.name}, ${lower(b.condition)}, ${dist}.`;
}
