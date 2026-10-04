/**
 * Every fact about a footway is an Attr: a value plus where it came from,
 * when it was observed and how far we trust it. A bare value is never
 * allowed into the graph, because "we don't know" must stay distinguishable
 * from "it's fine".
 */

export type ConfidenceState = "verified" | "inferred" | "reported" | "unknown";

/** Stable identifiers for data sources. Each one has an entry in docs/DATA_SOURCES.md. */
export type SourceId =
  | "osm"
  | "lidar-scotland"
  | "lidar-england"
  | "derived"
  | "mapillary"
  | "council"
  | "crowd"
  | "survey"
  | "tfl"
  | "street-manager"
  | "weather"
  | "none";

export interface Attr<T> {
  value: T | null;
  state: ConfidenceState;
  source: SourceId;
  /** ISO 8601. When the underlying observation was made, not when we ingested it. */
  observedAt: string | null;
  /** Free text on how the value was produced, e.g. "DTM 0.5 m, 2 m spacing". Shown on request. */
  method?: string;
  /** Number of independent corroborations (crowd reports, imagery frames). */
  corroborations?: number;
}

export const unknownAttr = <T>(): Attr<T> => ({
  value: null,
  state: "unknown",
  source: "none",
  observedAt: null,
});

export const attr = <T>(
  value: T,
  state: Exclude<ConfidenceState, "unknown">,
  source: SourceId,
  observedAt: string | null,
  method?: string,
): Attr<T> => ({ value, state, source, observedAt, ...(method ? { method } : {}) });

export const isKnown = <T>(a: Attr<T> | undefined): a is Attr<T> & { value: T } =>
  !!a && a.state !== "unknown" && a.value !== null;

/**
 * Base trust for each state, before ageing. These are deliberately coarse;
 * Phase 1 calibrates them against ground-truth samples per city.
 */
const BASE: Record<ConfidenceState, number> = {
  verified: 0.95,
  inferred: 0.7,
  reported: 0.6,
  unknown: 0,
};

/**
 * Half-life in days by state. Terrain barely changes; a crowd report about
 * a bin on the pavement goes stale in days. Verified ground truth still
 * decays because streets get resurfaced and kerbs get dropped.
 */
const HALF_LIFE_DAYS: Record<ConfidenceState, number> = {
  verified: 3 * 365,
  inferred: 5 * 365,
  reported: 2 * 365,
  unknown: 1,
};

/** Terrain-derived values age far more slowly than street furniture. */
const SLOW_SOURCES: ReadonlySet<SourceId> = new Set(["lidar-scotland", "lidar-england"]);

/**
 * Effective confidence in [0, 1] at time `now`. Unknown is always 0.
 * Corroboration lifts a reported value towards (but never to) verified.
 */
export function confidence(a: Attr<unknown> | undefined, now: Date = new Date()): number {
  if (!a || a.state === "unknown" || a.value === null) return 0;
  let base = BASE[a.state];
  if (a.state === "reported" && a.corroborations) {
    base = Math.min(0.9, base + 0.1 * a.corroborations);
  }
  if (!a.observedAt) return base * 0.8;
  const ageDays = Math.max(0, (now.getTime() - Date.parse(a.observedAt)) / 86_400_000);
  const halfLife = HALF_LIFE_DAYS[a.state] * (SLOW_SOURCES.has(a.source) ? 4 : 1);
  return base * Math.pow(0.5, ageDays / halfLife);
}
