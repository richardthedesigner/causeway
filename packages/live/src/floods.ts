/**
 * Environment Agency flood warnings (England; DATA-07, survey §2 #8). Keyless,
 * CORS-enabled, OGL v3. The build maps each flood area to the paths inside it
 * (scripts/build-flood-areas.ts); this reads which warnings are in force.
 *
 * Flood areas are drawn round property, and the tidal Thames areas cover whole
 * districts, so the response is graded:
 * - Severe Flood Warning (1): the paths inside are closed.
 * - Flood Warning (2): flagged as unknown ("flooding is expected").
 * - Flood Alert (3): named on the route, nothing more.
 */
import type { LiveState } from "@causeway/graph";
import { getJson, type LiveOptions } from "./http.js";

export const EA_FLOODS_URL = "https://environment.data.gov.uk/flood-monitoring/id/floods";

export interface FloodAreas {
  area: string;
  source: string;
  licence: string;
  fetchedAt: string;
  /** Flood area id to its name and the edge keys ("<osm way>:<from>:<to>") inside it. */
  areas: Record<string, { label: string; keys: string[] }>;
}

export interface FloodWarning {
  floodAreaId: string;
  /** 1 severe, 2 warning, 3 alert, 4 no longer in force. */
  severity: 1 | 2 | 3 | 4;
  /** "Flood Warning", in the EA's words. */
  severityName: string;
  description: string;
  message: string | null;
  raisedAt: string | null;
}

export function parseFloodWarnings(json: unknown): FloodWarning[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error("EA flood warnings: expected items");
  return (items as { floodAreaID?: string; severityLevel?: number; severity?: string; description?: string; message?: string; timeRaised?: string }[])
    .filter((w) => typeof w.floodAreaID === "string" && [1, 2, 3, 4].includes(w.severityLevel ?? 0))
    .map((w) => ({
      floodAreaId: w.floodAreaID!,
      severity: w.severityLevel as FloodWarning["severity"],
      severityName: w.severity ?? "Flood warning",
      description: (w.description ?? "").trim(),
      message: w.message?.replace(/\s+/g, " ").trim() || null,
      raisedAt: w.timeRaised ?? null,
    }));
}

export async function fetchFloodWarnings(fetchImpl: typeof fetch = fetch, opts: Omit<LiveOptions, "fetchImpl"> = {}): Promise<FloodWarning[]> {
  return parseFloodWarnings(await getJson(EA_FLOODS_URL, "EA flood warnings", { ...opts, fetchImpl }));
}

/** The warnings in force that touch our paths, worst first, for the route panel. */
export function floodsHere(warnings: FloodWarning[], areas: FloodAreas): { severity: 1 | 2 | 3; name: string; label: string }[] {
  return warnings
    .filter((w): w is FloodWarning & { severity: 1 | 2 | 3 } => w.severity < 4 && !!areas.areas[w.floodAreaId])
    .sort((a, b) => a.severity - b.severity)
    .map((w) => ({ severity: w.severity, name: w.severityName, label: areas.areas[w.floodAreaId]!.label }));
}

/**
 * Live states keyed by edge key ("<osm way>:<from>:<to>"). They last
 * `ttlMinutes` past the fetch and are replaced on the next refresh, so a
 * lifted warning lifts here too.
 */
export function floodStates(warnings: FloodWarning[], areas: FloodAreas, fetchedAt: string, ttlMinutes = 30): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  const until = new Date(Date.parse(fetchedAt) + ttlMinutes * 60_000).toISOString();
  for (const w of [...warnings].sort((a, b) => b.severity - a.severity)) {
    if (w.severity > 2) continue;
    const fa = areas.areas[w.floodAreaId];
    if (!fa) continue;
    const state: LiveState = {
      status: w.severity === 1 ? "closed" : "restricted",
      reason: `${w.severityName} for ${fa.label}`,
      source: "Environment Agency flood warnings",
      validFrom: fetchedAt,
      validUntil: until,
    };
    // Worst last, so a severe warning overwrites a lesser one on the same path.
    for (const k of fa.keys) out.set(k, state);
  }
  return out;
}

/**
 * Apply states keyed by "<osm way>:<from>:<to>", without weakening one already
 * there (works closing a pavement stay closed under a flood warning). Returns
 * how many edges changed.
 */
export function applyKeyedStates(g: { edges: { osmWayId?: number; from: number; to: number; live?: LiveState }[] }, states: Map<string, LiveState>): number {
  let n = 0;
  if (!states.size) return 0;
  const rank = (s: LiveState | undefined) => (!s ? 0 : s.status === "closed" ? 2 : 1);
  for (const e of g.edges) {
    if (!e.osmWayId) continue;
    const s = states.get(`${e.osmWayId}:${e.from}:${e.to}`);
    if (s && rank(s) > rank(e.live)) (e.live = s), n++;
  }
  return n;
}
