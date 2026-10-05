/**
 * The Water of Leith at Murrayfield, live from SEPA (D-066). Edinburgh only.
 *
 * SEPA's KiWIS time series service (Open Government Licence v3, no key, open
 * to browsers) gives the river level every 15 minutes. SEPA publishes no level
 * at which the Water of Leith Walkway floods, so the level is only worth
 * knowing when it reaches the lowest peak in SEPA's own peaks-over-threshold
 * record for the station since 2015 (1.05 m, checked 2026-10-05), and then
 * only on routes that use the walkway. It never changes a route. A typical
 * level is about 0.5 m. This is not a flood warning: SEPA's warnings have no
 * open feed yet (DATA-25).
 */
import { getJson, type LiveOptions } from "./http.js";

/** Murrayfield (station 14868), stage, 15-minute values. */
export const SEPA_MURRAYFIELD_TS = "54261010";
export const sepaLevelUrl = (tsId = SEPA_MURRAYFIELD_TS) =>
  `https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json&request=getTimeseriesValues&ts_id=${tsId}&period=PT2H&returnfields=Timestamp,Value`;
export const SEPA_SOURCE = "SEPA";
/** The lowest peak in SEPA's peaks-over-threshold series for Murrayfield, 2015 to 2025 (ts 65153010). */
export const WATER_OF_LEITH_HIGH_M = 1.05;
/** Walkway edges, by their OSM names. */
export const WALKWAY_NAME = /^Water of Leith (Walkway|Path)$/;

export interface RiverLevel {
  metres: number;
  /** ISO 8601, UTC: the reading's own time. */
  at: string;
}

/** The latest reading in a KiWIS getTimeseriesValues response. Null when there is none. */
export function parseLatestLevel(json: unknown): RiverLevel | null {
  const data = (json as { data?: unknown }[] | undefined)?.[0]?.data;
  if (!Array.isArray(data)) throw new Error("SEPA: no data");
  for (let i = data.length - 1; i >= 0; i--) {
    const [t, v] = (Array.isArray(data[i]) ? data[i] : []) as [unknown, unknown];
    if (typeof t === "string" && typeof v === "number" && Number.isFinite(v) && !Number.isNaN(Date.parse(t))) return { metres: v, at: new Date(t).toISOString() };
  }
  return null;
}

/** Is the river high enough to be worth a line on the walkway? */
export const riverHigh = (level: RiverLevel | null | undefined): level is RiverLevel => !!level && level.metres >= WATER_OF_LEITH_HIGH_M;

/** Does a route use the walkway (by its edges' names)? */
export const usesWalkway = (names: Iterable<string | null>) => {
  for (const n of names) if (n && WALKWAY_NAME.test(n)) return true;
  return false;
};

/** The words for a route on the walkway when the river is high. Listed under "On this route", worth knowing, with SEPA and the reading's time (D-067). */
export const riverText = (level: RiverLevel) => `Water of Leith high at Murrayfield (${level.metres.toFixed(2)} m): the walkway can flood`;

export async function fetchRiverLevel(opts: LiveOptions = {}): Promise<RiverLevel | null> {
  return parseLatestLevel(await getJson<unknown>(sepaLevelUrl(), "SEPA river level", opts));
}
