/**
 * TfL line status and station disruptions on the rail graph (DATA-04, survey
 * §2 #4). Keyless, CORS-enabled.
 *
 * - Line status with `detail=true` lists the stations a closure affects, so a
 *   part closure ("no service between Green Park and Canary Wharf") closes
 *   exactly the rides between them. No message text is read.
 * - Station disruptions are free text. Only three plain cases act on the
 *   graph: the station is closed, trains don't call, or there's no step-free
 *   access. Everything else (entrances, footbridges, advice) is left alone.
 *
 * Each state carries TfL's own dates, so "Leaving later" sees planned
 * closures, and a refresh replaces them all.
 */
import type { LiveState } from "@causeway/graph";
import { getJson, type LiveOptions } from "./http.js";

export const TFL_RAIL_LINES = ["jubilee", "dlr"];
export const tflLineStatusUrl = (lines: string[] = TFL_RAIL_LINES) => `https://api.tfl.gov.uk/Line/${lines.join(",")}/Status?detail=true`;
export const tflStationDisruptionUrl = (modes = ["tube", "dlr"]) => `https://api.tfl.gov.uk/StopPoint/Mode/${modes.join(",")}/Disruption`;

/** TfL status severities that mean trains aren't running (all or part of the line). */
const CLOSED_SEVERITY = new Set([1, 2, 3, 4, 5, 11, 16, 20]);
/** "No Step Free Access". */
const NO_STEP_FREE_SEVERITY = 13;

export interface RailDisruption {
  /** A line closure, a loss of step-free access, or one station's message. */
  kind: "line-closed" | "line-no-step-free" | "station";
  /** Line id for line disruptions ("jubilee"). */
  line: string | null;
  /** Our station ids (940G NaPTAN codes) the disruption names. Empty: the whole line. */
  stations: string[];
  message: string;
  validFrom: string;
  validUntil: string;
}

interface Period {
  fromDate?: string;
  toDate?: string;
}

/** When a state with no dates of its own lasts: until the next refresh, with room to spare. */
const DEFAULT_TTL_MS = 30 * 60_000;

const periods = (list: Period[] | undefined, fetchedAt: string): { validFrom: string; validUntil: string }[] => {
  const ok = (list ?? []).filter((p) => p.fromDate && p.toDate && Date.parse(p.toDate) > Date.parse(p.fromDate));
  return ok.length ? ok.map((p) => ({ validFrom: p.fromDate!, validUntil: p.toDate! })) : [{ validFrom: fetchedAt, validUntil: new Date(Date.parse(fetchedAt) + DEFAULT_TTL_MS).toISOString() }];
};

export function parseLineStatus(json: unknown, fetchedAt: string): RailDisruption[] {
  if (!Array.isArray(json)) throw new Error("TfL line status: expected an array");
  const out: RailDisruption[] = [];
  for (const line of json as { id?: string; lineStatuses?: { statusSeverity?: number; reason?: string; validityPeriods?: Period[]; disruption?: { description?: string; affectedStops?: { naptanId?: string; id?: string }[] } }[] }[]) {
    for (const s of line.lineStatuses ?? []) {
      const sev = s.statusSeverity ?? 10;
      const kind = CLOSED_SEVERITY.has(sev) ? "line-closed" : sev === NO_STEP_FREE_SEVERITY ? "line-no-step-free" : null;
      if (!kind || !line.id) continue;
      const stations = (s.disruption?.affectedStops ?? []).map((a) => a.naptanId ?? a.id ?? "").filter(Boolean);
      const message = (s.reason ?? s.disruption?.description ?? "").replace(/\s+/g, " ").trim();
      for (const p of periods(s.validityPeriods, fetchedAt)) out.push({ kind, line: line.id, stations, message, ...p });
    }
  }
  return out;
}

export function parseStationDisruptions(json: unknown, fetchedAt: string): RailDisruption[] {
  if (!Array.isArray(json)) throw new Error("TfL station disruptions: expected an array");
  return (json as { stationAtcoCode?: string; atcoCode?: string; description?: string; fromDate?: string; toDate?: string }[])
    .filter((d) => (d.stationAtcoCode ?? d.atcoCode) && d.description)
    .flatMap((d) =>
      periods([{ fromDate: d.fromDate, toDate: d.toDate }], fetchedAt).map((p) => ({
        kind: "station" as const,
        line: null,
        stations: [(d.stationAtcoCode ?? d.atcoCode)!],
        message: d.description!.replace(/\s+/g, " ").trim(),
        ...p,
      })),
    );
}

export async function fetchRailDisruptions(fetchImpl: typeof fetch = fetch, now = new Date(), opts: Omit<LiveOptions, "fetchImpl"> = {}): Promise<RailDisruption[]> {
  const at = now.toISOString();
  const [lines, stations] = await Promise.all([getJson(tflLineStatusUrl(), "TfL line status", { ...opts, fetchImpl }), getJson(tflStationDisruptionUrl(), "TfL station disruptions", { ...opts, fetchImpl })]);
  return [...parseLineStatus(lines, at), ...parseStationDisruptions(stations, at)];
}

/** What a station message means for the graph, if anything. Exported for tests. */
export function readStationMessage(message: string): { effect: "closed" | "no-step-free" | "not-calling" | null; partial: boolean } {
  const m = message.toLowerCase();
  // Only part of the station: an entrance, an exit, a platform, a footbridge. The rest still works.
  const partial = /\b(entrance|exit|footbridge|subway|car park|ticket hall|(east|west|north|south)bound|platform \d|towards)\b/.test(m);
  if (/step[- ]free access is (still )?available/.test(m)) return { effect: null, partial };
  if (/\bno step[- ]free access\b|\bstep[- ]free access is not available\b/.test(m)) return { effect: "no-step-free", partial };
  if (/\b(will not|won't|do not|does not) (call|stop)\b|\bnot (calling|stopping)\b/.test(m)) return { effect: "not-calling", partial };
  if (/\bstation (is |will be )?closed\b|\bthe station is closed\b/.test(m) && !partial) return { effect: "closed", partial };
  return { effect: null, partial };
}

const STRENGTH = (s: LiveState) => (s.status === "closed" ? (s.affects === "step-free" ? 2 : 3) : 1);

/** Keep the stronger state when two land on one edge: closed for everyone, then closed step-free, then restricted. */
export function mergeLiveStates(...maps: Map<string, LiveState>[]): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  for (const m of maps) for (const [ref, s] of m) if (!out.has(ref) || STRENGTH(s) > STRENGTH(out.get(ref)!)) out.set(ref, s);
  return out;
}

/**
 * Live states for rides and boarding. Line closures close the rides between
 * the stations TfL names (or the whole line); station messages close or flag
 * that station's boarding. Only the current or next state per edge is kept.
 */
export function railDisruptionStates(
  disruptions: RailDisruption[],
  net: { routes: { line: string; lineName: string; stops: string[] }[] },
  edgeRefs: Set<string>,
  now = new Date(),
): Map<string, LiveState> {
  const lineNames = [...new Map(net.routes.map((r) => [r.line, r.lineName])).entries()];
  const out = new Map<string, LiveState>();
  const put = (ref: string, s: LiveState) => {
    if (!edgeRefs.has(ref) || Date.parse(s.validUntil) <= now.getTime()) return;
    const cur = out.get(ref);
    // One state per edge: the one in force now beats a later one; otherwise the sooner.
    const inForce = (x: LiveState) => Date.parse(x.validFrom) <= now.getTime();
    if (!cur || (inForce(s) && !inForce(cur)) || (inForce(s) === inForce(cur) && (STRENGTH(s) > STRENGTH(cur) || Date.parse(s.validFrom) < Date.parse(cur.validFrom)))) out.set(ref, s);
  };
  const boards = (station: string, lines: string[] | null) => [...edgeRefs].filter((r) => r.startsWith("board:") && !r.startsWith("board:bus:") && r.endsWith(`:${station}`) && (!lines || lines.includes(r.split(":")[1]!)));
  for (const d of disruptions) {
    const base = { reason: d.message, validFrom: d.validFrom, validUntil: d.validUntil };
    if (d.kind === "line-closed" && d.line) {
      const set = new Set(d.stations);
      for (const r of net.routes.filter((r) => r.line === d.line)) {
        for (let i = 1; i < r.stops.length; i++) {
          const [a, b] = [r.stops[i - 1]!, r.stops[i]!];
          if (set.size && !(set.has(a) && set.has(b))) continue;
          const state: LiveState = { status: "closed", source: "TfL line status", ...base };
          put(`ride:${d.line}:${a}:${b}`, state);
          put(`ride:${d.line}:${b}:${a}`, state);
        }
      }
    } else if (d.kind === "line-no-step-free" && d.line) {
      for (const st of d.stations) for (const ref of boards(st, [d.line])) put(ref, { status: "closed", affects: "step-free", source: "TfL line status", ...base });
    } else if (d.kind === "station") {
      const { effect, partial } = readStationMessage(d.message);
      if (!effect) continue;
      const named = lineNames.filter(([id, name]) => d.message.toLowerCase().includes(name.toLowerCase()) || (id === "dlr" && /\bdlr\b/i.test(d.message))).map(([id]) => id);
      const lines = named.length ? named : null;
      // Another line named, none of ours: it isn't about our platforms.
      if (!lines && /\b(bakerloo|central|circle|district|hammersmith|metropolitan|northern|piccadilly|victoria|waterloo|elizabeth|overground)\b/i.test(d.message)) continue;
      for (const st of d.stations) {
        for (const ref of boards(st, lines)) {
          if (effect === "no-step-free") put(ref, { status: partial ? "restricted" : "closed", affects: "step-free", source: "TfL station disruptions", ...base });
          else put(ref, { status: partial ? "restricted" : "closed", source: "TfL station disruptions", ...base });
        }
      }
    }
  }
  return out;
}
