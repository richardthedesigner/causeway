/**
 * TfL Unified API: lift disruptions (the "PFL announcements" lineage, working
 * assumption). Keyless, CORS-enabled. https://api.tfl.gov.uk/Disruptions/Lifts/v2/
 *
 * The feed names stations and lift IDs (e.g. "940GZZLUWYP-Lift-5"). Mapping a
 * lift ID to a lift edge in our graph needs the London station graph (Phase 3);
 * `toLiveStates` takes that mapping as an index so the adapter stays pure.
 */
import type { LiveState } from "@causeway/graph";

export interface TflLiftDisruption {
  stationUniqueId: string;
  disruptedLiftUniqueIds: string[];
  message: string;
}

export interface LiftOutage {
  stationId: string;
  stationName: string | null;
  liftIds: string[];
  message: string;
  /** Step-free access still possible another way, according to TfL's own message. */
  alternativeMentioned: boolean;
  fetchedAt: string;
}

export const TFL_LIFTS_URL = "https://api.tfl.gov.uk/Disruptions/Lifts/v2/";

export function parseLiftDisruptions(json: unknown, fetchedAt: string): LiftOutage[] {
  if (!Array.isArray(json)) throw new Error("TfL lift feed: expected an array");
  return (json as TflLiftDisruption[])
    .filter((d) => typeof d?.stationUniqueId === "string" && Array.isArray(d.disruptedLiftUniqueIds))
    .map((d) => {
      const name = /^([A-Z0-9'&.\- ]+?) STATION:/.exec(d.message ?? "")?.[1] ?? null;
      return {
        stationId: d.stationUniqueId,
        stationName: name ? titleCase(name) : null,
        liftIds: d.disruptedLiftUniqueIds,
        message: (d.message ?? "").trim(),
        alternativeMentioned: /step-free access is (still )?available/i.test(d.message ?? ""),
        fetchedAt,
      };
    });
}

export async function fetchLiftOutages(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<LiftOutage[]> {
  const res = await fetchImpl(TFL_LIFTS_URL);
  if (!res.ok) throw new Error(`TfL lift feed: HTTP ${res.status}`);
  return parseLiftDisruptions(await res.json(), now.toISOString());
}

/**
 * Turn outages into live states for lift edges. The feed carries no end
 * time, so each state expires after `ttlMinutes` and must be refreshed:
 * a stale "closed" never outlives the feed that said so.
 */
export function toLiveStates(
  outages: LiftOutage[],
  liftIndex: Map<string, number[]>,
  ttlMinutes = 15,
): Map<number, LiveState> {
  const out = new Map<number, LiveState>();
  for (const o of outages) {
    for (const lift of o.liftIds) {
      for (const edgeId of liftIndex.get(lift) ?? []) {
        out.set(edgeId, {
          status: "closed",
          reason: o.message,
          source: "TfL Unified API lift disruptions",
          validFrom: o.fetchedAt,
          validUntil: new Date(Date.parse(o.fetchedAt) + ttlMinutes * 60_000).toISOString(),
        });
      }
    }
  }
  return out;
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/'S\b/g, "'s");
