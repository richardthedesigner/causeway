/**
 * TfL Unified API: lift disruptions (the "PFL announcements" lineage, working
 * assumption). Keyless, CORS-enabled. https://api.tfl.gov.uk/Disruptions/Lifts/v2/
 *
 * The feed names stations and lift IDs (e.g. "940GZZLUWYP-Lift-5"). Mapping a
 * lift ID to a lift edge in our graph needs the London station graph (Phase 3);
 * `toLiveStates` takes that mapping as an index so the adapter stays pure.
 */
import { stepFreeLines, type LiveState, type StationAccess } from "@causeway/graph";

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

/**
 * Place lift outages on the graph's station edges. A TfL outage names a
 * station or hub and, in its message, usually the line it affects ("to the
 * Jubilee line") or the level ("between the street and the ticket hall").
 * We close only what the message supports; if it names neither, every
 * platform at that station is closed for step-free users. Never guesses
 * wider than the message.
 */
export function liftOutageStates(
  outages: LiftOutage[],
  net: { stations: Record<string, { id: string; hub: string | null; access?: StationAccess }>; routes: { line: string; lineName: string }[] },
  edgeRefs: Set<string>,
  ttlMinutes = 15,
): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  const lineNames = [...new Map(net.routes.map((r) => [r.line, r.lineName])).entries()];
  for (const o of outages) {
    const stations = Object.values(net.stations).filter((s) => s.id === o.stationId || s.hub === o.stationId);
    if (!stations.length) continue;
    const msg = o.message.toLowerCase();
    const lines = lineNames.filter(([id, name]) => msg.includes(name.toLowerCase()) || msg.includes(`${id} line`) || (id === "dlr" && /\bdlr\b/.test(msg)));
    const streetLevel = /street/.test(msg) && /ticket hall/.test(msg) && !lines.length;
    const state: LiveState = {
      status: "closed",
      affects: "step-free",
      reason: o.message,
      source: "TfL Unified API lift disruptions",
      validFrom: o.fetchedAt,
      validUntil: new Date(Date.parse(o.fetchedAt) + ttlMinutes * 60_000).toISOString(),
    };
    for (const s of stations) {
      // TfL's station layout says which lines this lift cuts off: close exactly those (DATA-03).
      if (s.access && (o.stationId === s.access.tflId || o.stationId === s.id)) {
        const before = stepFreeLines(s.access);
        const after = stepFreeLines(s.access, new Set(o.liftIds));
        for (const [line, v] of Object.entries(after)) {
          if (before[line] === "yes" && v !== "yes" && edgeRefs.has(`board:${line}:${s.id}`)) out.set(`board:${line}:${s.id}`, state);
        }
        continue;
      }
      if (streetLevel) {
        if (edgeRefs.has(`link:${s.id}`)) out.set(`link:${s.id}`, state);
        continue;
      }
      for (const ref of edgeRefs) {
        if (!ref.startsWith("board:") || !ref.endsWith(`:${s.id}`)) continue;
        const line = ref.split(":")[1]!;
        if (!lines.length || lines.some(([id]) => id === line)) out.set(ref, state);
      }
    }
  }
  return out;
}

/** Apply live states to a graph by edge ref. Returns how many edges changed. */
export function applyLiveStates(g: { edges: { ref?: string; live?: LiveState }[] }, states: Map<string, LiveState>): number {
  let n = 0;
  for (const e of g.edges) {
    if (e.ref && states.has(e.ref)) {
      e.live = states.get(e.ref)!;
      n++;
    }
  }
  return n;
}

/** Live departures from a London stop, minutes away, for one route. TfL's arrivals feed, no key. */
export async function fetchTflArrivals(stopId: string, route: string, fetchImpl: typeof fetch = fetch): Promise<number[]> {
  const res = await fetchImpl(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(stopId)}/Arrivals`);
  if (!res.ok) throw new Error(`TfL arrivals: HTTP ${res.status}`);
  const rows = (await res.json()) as { lineName: string; timeToStation: number }[];
  return rows
    .filter((r) => r.lineName.toLowerCase() === route.toLowerCase())
    .map((r) => Math.round(r.timeToStation / 60))
    .sort((a, b) => a - b)
    .slice(0, 3);
}
