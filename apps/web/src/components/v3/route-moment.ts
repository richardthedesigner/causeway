/**
 * The rules behind the route moment (design v3, FEAT-68). Pure, so they can be
 * tested without a browser.
 *
 * - Which journey a result belongs to, and whether this visit has shown it.
 * - What the route screen opens on: the moment, the unfolded way, or today's
 *   loading line.
 * - Which band the stone walks to.
 */
import type { StreetBand } from "@/lib/street-bands";

/** The route's verdict, in the stone's words. */
type Verdict = "fits" | "unsure" | "nope";

/**
 * A journey: where it starts and where it ends. "Your location" is one start,
 * however often the phone moves it (`me`, `me:1700000000000`).
 */
export const journeyKey = (fromId: string, toId: string): string => `${/^me(:|$)/.test(fromId) ? "me" : fromId}>${toId}`;

/** The journeys whose result this visit has shown. */
export interface Seen {
  has(key: string): boolean;
  add(key: string): void;
}

export function createSeen(): Seen {
  const keys = new Set<string>();
  return { has: (k) => keys.has(k), add: (k) => void keys.add(k) };
}

/** This visit: kept in memory only, so a reload or a new visit starts again. */
export const seenThisVisit = createSeen();

/** What the route screen shows. */
export type RouteView = "loading" | "moment" | "open";

/**
 * What the route screen opens on when a journey comes up.
 *
 * - A journey this visit has already shown opens unfolded: you are coming back to it.
 * - A new journey shows the moment once its own result is in.
 * - Until then it shows today's loading line. The result on screen while a new
 *   journey is planned belongs to the last journey, so it is not shown as this one's answer.
 *
 * Asked once per journey. A re-plan of the same journey (the weather, live data,
 * another device) keeps whatever is on screen.
 */
export function openingView(key: string, seen: Seen, hasResult: boolean, planning: boolean): RouteView {
  if (!hasResult) return "loading";
  if (seen.has(key)) return "open";
  return planning ? "loading" : "moment";
}

/**
 * The band the stone walks to, by its place in the list.
 * - Unsure: the first band nobody has measured, the stretch it can't vouch for.
 * - Doesn't fit: the blocked band, where the blocker is.
 * - Fits: the last band, at the destination.
 * An Unsure route with no unlit band (the doubt is a station, which has no
 * length) and a "none" result with no blocked band fall back to the last band.
 */
export function stoneTarget(bands: readonly Pick<StreetBand, "state">[], verdict: Verdict): number | null {
  if (!bands.length) return null;
  const want = verdict === "unsure" ? "unknown" : verdict === "nope" ? "blocked" : null;
  const i = want ? bands.findIndex((b) => b.state === want) : -1;
  return i >= 0 ? i : bands.length - 1;
}

/** The motion table's band stagger: 180 ms, then 60 ms more for each of the first eight bands; the rest arrive together. */
export const bandDelayMs = (i: number): number => 180 + 60 * Math.min(i, 8);

/**
 * A CSS `cubic-bezier()` as a function of progress, 0 to 1, for motion done in
 * script (the stone's walk). Matches the tokens `--ease-out` and `--ease-hop`.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 30; i++) {
      const got = at(x1, x2, t);
      if (Math.abs(got - x) < 1e-5) break;
      if (got < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(y1, y2, t);
  };
}

/** `--ease-out`. */
export const easeOut = cubicBezier(0.2, 0.8, 0.2, 1);
/** `--ease-hop`: overshoots a little and settles, so the stone lands with a hop. */
export const easeHop = cubicBezier(0.34, 1.56, 0.64, 1);
