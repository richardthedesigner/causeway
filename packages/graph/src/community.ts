/**
 * Community reports (FEAT-25, D-083): people tag good or bad access on the
 * map by category ("no dropped kerb", "broken lift", "good ramp"), and other
 * people agree, disagree or say whether it's still there.
 *
 * Like notes (D-026), reports are our own content in a separate layer from
 * the ODbL graph (D-008). They are joined to the graph at request time by
 * position and are never written into it.
 *
 * Confidence is evidence that decays: each person who says it's there adds
 * weight, each person who says it isn't takes some away, and every voice
 * halves in weight over the category's half-life. A broken lift fades in
 * days; a flight of steps lasts years. The router only acts on reports
 * that enough people have confirmed recently (see `reportLevel`).
 *
 * A report never carries the profile (D-009) and never says who made it.
 */
import { haversine } from "./geo.js";
import type { GraphEdge } from "./schema.js";

export type CommunityPolarity = "good" | "bad";

export type CommunityCategory =
  // Bad
  | "no-dropped-kerb"
  | "steps"
  | "broken-lift"
  | "narrow-pavement"
  | "blocked-pavement"
  | "rough-surface"
  | "steep"
  // Good
  | "dropped-kerb"
  | "ramp"
  | "big-lift"
  | "smooth-pavement"
  | "accessible-toilet"
  | "seat";

/** What a report is about, for snapping to the graph. */
export type CategoryTarget = "crossing" | "steps" | "lift" | "pavement" | "place";

export interface CategoryInfo {
  id: CommunityCategory;
  polarity: CommunityPolarity;
  /** Button and list label. Short, plain, British English. */
  label: string;
  /** The question asked when checking someone else's report. */
  question: string;
  /** How fast evidence fades. Temporary problems fade in days, built things in years. */
  halfLifeDays: number;
  target: CategoryTarget;
}

export const COMMUNITY_CATEGORIES: readonly CategoryInfo[] = [
  { id: "no-dropped-kerb", polarity: "bad", label: "No dropped kerb", question: "Is the kerb still not dropped?", halfLifeDays: 365, target: "crossing" },
  { id: "steps", polarity: "bad", label: "Steps", question: "Are the steps still the only way?", halfLifeDays: 730, target: "steps" },
  { id: "broken-lift", polarity: "bad", label: "Broken lift", question: "Is the lift still broken?", halfLifeDays: 5, target: "lift" },
  { id: "narrow-pavement", polarity: "bad", label: "Narrow pavement", question: "Is the pavement still this narrow?", halfLifeDays: 365, target: "pavement" },
  { id: "blocked-pavement", polarity: "bad", label: "Pavement blocked", question: "Is the pavement still blocked?", halfLifeDays: 7, target: "pavement" },
  { id: "rough-surface", polarity: "bad", label: "Rough or broken surface", question: "Is the surface still rough?", halfLifeDays: 180, target: "pavement" },
  { id: "steep", polarity: "bad", label: "Steep slope", question: "Is it as steep as this says?", halfLifeDays: 1825, target: "pavement" },
  { id: "dropped-kerb", polarity: "good", label: "Dropped kerb", question: "Is the dropped kerb still there?", halfLifeDays: 730, target: "crossing" },
  { id: "ramp", polarity: "good", label: "Good ramp", question: "Is the ramp still there and usable?", halfLifeDays: 730, target: "steps" },
  { id: "big-lift", polarity: "good", label: "Big lift", question: "Is the lift still there and working?", halfLifeDays: 90, target: "lift" },
  { id: "smooth-pavement", polarity: "good", label: "Wide, smooth pavement", question: "Is it still wide and smooth?", halfLifeDays: 365, target: "pavement" },
  { id: "accessible-toilet", polarity: "good", label: "Accessible toilet", question: "Is the accessible toilet still open to the public?", halfLifeDays: 365, target: "place" },
  { id: "seat", polarity: "good", label: "Somewhere to sit", question: "Is there still somewhere to sit?", halfLifeDays: 365, target: "place" },
];

const BY_ID = new Map(COMMUNITY_CATEGORIES.map((c) => [c.id, c]));
export const categoryInfo = (id: CommunityCategory): CategoryInfo => BY_ID.get(id)!;
export const isCategory = (id: string): id is CommunityCategory => BY_ID.has(id as CommunityCategory);

/** Agree and still-there count for a report; disagree and gone count against it. */
export type VoteKind = "agree" | "disagree" | "still-there" | "gone";
export const VOTE_KINDS: readonly VoteKind[] = ["agree", "disagree", "still-there", "gone"];
const SUPPORTS: Record<VoteKind, boolean> = { agree: true, "still-there": true, disagree: false, gone: false };

export interface CommunityVote {
  kind: VoteKind;
  /** ISO 8601. */
  at: string;
}

export const REVIEW_MAX_CHARS = 200;

export interface CommunityReport {
  id: string;
  city: string;
  category: CommunityCategory;
  lon: number;
  lat: number;
  /** Optional short review, at most REVIEW_MAX_CHARS. */
  text: string | null;
  /** On the device: a small JPEG data URL. From the server: a public URL, only once a person has checked it. */
  photo: string | null;
  /** ISO 8601: when the reporter saw it. */
  at: string;
  /** Everyone else's votes, one per person (the server keeps only each person's latest). */
  votes: CommunityVote[];
  /** Made on this device (so: can be deleted here, and can't be voted on by its author). */
  own?: boolean;
  /** This device's own vote, if any. */
  myVote?: VoteKind | null;
  /** Shared with the server. Absent or false: only on this device. */
  shared?: boolean;
}

/** Weight of one voice of age `ageDays` for a category: 1 when new, halving every half-life. */
export function decay(ageDays: number, halfLifeDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

/**
 * Prior weight against a report: one fresh report on its own is a coin
 * toss (0.5), two people 0.67, three 0.75. Corroboration matters more than
 * any one voice.
 */
const PRIOR = 1;
/** At or above this, with nobody fresh against it, the router treats a report as fact. Three fresh voices clear it; two don't. */
export const CONFIRMED_AT = 0.7;
/** Below this much live support a report has faded: nobody has said it's still there for about two half-lives. */
export const FADED_BELOW = 0.3;

export interface ReportEvidence {
  /** Decayed weight saying it's there: the reporter plus agree and still-there votes. */
  support: number;
  /** Decayed weight saying it isn't: disagree and gone votes. */
  against: number;
  /** support / (support + against + prior), in [0, 1). */
  confidence: number;
  /** How many people have voted, in total, regardless of age. */
  voters: number;
  /** ISO time of the latest voice saying it's there (the report or a vote). */
  lastSeen: string;
}

const days = (from: string, now: Date) => (now.getTime() - Date.parse(from)) / 86_400_000;

export function evidence(r: Pick<CommunityReport, "category" | "at" | "votes">, now: Date = new Date()): ReportEvidence {
  const hl = categoryInfo(r.category).halfLifeDays;
  let support = decay(days(r.at, now), hl);
  let against = 0;
  let lastSeen = r.at;
  for (const v of r.votes) {
    const w = decay(days(v.at, now), hl);
    if (SUPPORTS[v.kind]) {
      support += w;
      if (v.at > lastSeen) lastSeen = v.at;
    } else against += w;
  }
  return { support, against, confidence: support / (support + against + PRIOR), voters: r.votes.length, lastSeen };
}

/**
 * - `confirmed`: enough people, recently enough. The router treats it as fact (it can block).
 * - `reported`: one or two people, or older. The router warns and leans away a little.
 * - `disputed`: as many people say it isn't there as say it is. Shown, not used.
 * - `faded`: nobody has said it's still there for a long time. Hidden unless asked for, not used.
 */
export type ReportLevel = "confirmed" | "reported" | "disputed" | "faded";

export function reportLevel(e: ReportEvidence): ReportLevel {
  if (e.support < FADED_BELOW) return "faded";
  if (e.against > 0 && e.against >= e.support * 0.75) return "disputed";
  if (e.confidence >= CONFIRMED_AT) return "confirmed";
  return "reported";
}

export const LEVEL_LABEL: Record<ReportLevel, string> = {
  confirmed: "Confirmed",
  reported: "Not confirmed yet",
  disputed: "Disputed",
  faded: "Old, not checked lately",
};

/** Why a report can't be saved, or null if it can. */
export function reportProblem(r: Pick<CommunityReport, "category" | "text" | "lon" | "lat">): string | null {
  if (!isCategory(r.category)) return "Choose what you found.";
  if (r.text && r.text.trim().length > REVIEW_MAX_CHARS) return `Keep the review under ${REVIEW_MAX_CHARS} characters.`;
  if (!Number.isFinite(r.lon) || !Number.isFinite(r.lat)) return "Put the pin on the map.";
  return null;
}

/**
 * Where everyone else sees a report: rounded to 4 decimal places, about
 * 11 m north to south and 7 m east to west in the UK. Close enough to find
 * a kerb, not a front door. The server rounds the same way (0009).
 */
export const publicPoint = (lon: number, lat: number): [number, number] => [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];

/** One report as the router sees it: on which edges, how sure, what it says. */
export interface CommunitySignal {
  reportId: string;
  category: CommunityCategory;
  level: Exclude<ReportLevel, "faded" | "disputed">;
  confidence: number;
  /** Plain words for the route explanation: "No dropped kerb: 3 people, last seen 2 days ago". */
  detail: string;
  /** ISO time someone last said it's there. */
  lastSeen: string;
}

const TARGET_KINDS: Record<CategoryTarget, ReadonlySet<string> | null> = {
  crossing: new Set(["crossing"]),
  steps: new Set(["steps", "ramp"]),
  lift: new Set(["elevator", "escalator"]),
  pavement: null,
  place: null,
};

/** Kinds a report may never land on: transit rides and boarding aren't pavement. */
const NEVER: ReadonlySet<string> = new Set(["transit", "board", "interchange", "station_link"]);

function distToEdge(p: [number, number], g: [number, number][]): number {
  let best = Infinity;
  const k = Math.cos((p[1] * Math.PI) / 180);
  for (let i = 0; i < g.length; i++) {
    const a = g[i]!;
    const b = g[i + 1] ?? a;
    const ax = (a[0] - p[0]) * k,
      ay = a[1] - p[1],
      bx = (b[0] - p[0]) * k,
      by = b[1] - p[1];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 111_320);
  }
  return best;
}

/** Search radius, metres. A pin dropped by thumb on a phone is rarely closer than this. */
export const SNAP_M = 15;

/**
 * The edges a report is about. Crossing, steps and lift reports look for
 * that kind of edge within SNAP_M first (a kerb is at a crossing); anything
 * else, or when none is near, takes the nearest pavement edge. Places
 * (toilets, seats) aren't on an edge.
 */
export function reportEdges(r: Pick<CommunityReport, "category" | "lon" | "lat">, edges: readonly Pick<GraphEdge, "id" | "kind" | "geometry">[]): number[] {
  const info = categoryInfo(r.category);
  if (info.target === "place") return [];
  const p: [number, number] = [r.lon, r.lat];
  const want = TARGET_KINDS[info.target];
  const near: { id: number; kind: string; m: number }[] = [];
  const pad = (SNAP_M * 2) / 111_320;
  for (const e of edges) {
    if (NEVER.has(e.kind)) continue;
    const g = e.geometry;
    // Cheap reject on the bounding box before measuring.
    let hit = false;
    for (const [x, y] of g) {
      if (Math.abs(y - r.lat) < pad * 4 && Math.abs(x - r.lon) < pad * 6) {
        hit = true;
        break;
      }
    }
    if (!hit && g.length > 2) {
      // A long edge can pass near the pin with no vertex near it.
      const [x0, x1] = [Math.min(...g.map((q) => q[0])), Math.max(...g.map((q) => q[0]))];
      const [y0, y1] = [Math.min(...g.map((q) => q[1])), Math.max(...g.map((q) => q[1]))];
      hit = r.lon >= x0 - pad && r.lon <= x1 + pad && r.lat >= y0 - pad && r.lat <= y1 + pad;
    }
    if (!hit) continue;
    const m = distToEdge(p, g);
    if (m <= SNAP_M) near.push({ id: e.id, kind: e.kind, m });
  }
  if (!near.length) return [];
  near.sort((a, b) => a.m - b.m);
  if (want) {
    const typed = near.filter((n) => want.has(n.kind));
    if (typed.length) {
      // Both kerbs of a crossing are one report: every crossing edge as close as the nearest, give or take 5 m.
      const best = typed[0]!.m;
      return typed.filter((n) => n.m <= best + 5).map((n) => n.id);
    }
  }
  return [near[0]!.id];
}

function ago(iso: string, now: Date): string {
  const d = Math.floor(days(iso, now));
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m < 24 ? `${m} months ago` : `${Math.round(d / 365)} years ago`;
}

export function signalDetail(r: Pick<CommunityReport, "category" | "votes">, e: ReportEvidence, now: Date): string {
  const people = 1 + r.votes.filter((v) => SUPPORTS[v.kind]).length;
  return `${categoryInfo(r.category).label}: ${people === 1 ? "1 person" : `${people} people`}, last seen ${ago(e.lastSeen, now)}`;
}

/**
 * Edge id to the community reports on it that the router should hear about.
 * Faded and disputed reports are left out: they're shown on the map, not routed on.
 */
export function communitySignals(
  reports: readonly CommunityReport[],
  edges: readonly Pick<GraphEdge, "id" | "kind" | "geometry">[],
  now: Date = new Date(),
): Map<number, CommunitySignal[]> {
  const out = new Map<number, CommunitySignal[]>();
  if (!reports.length) return out;
  // Edges in a grid of about 100 m cells, by bounding box, so each report only measures the edges near it.
  const CELL = 0.001;
  const grid = new Map<string, Pick<GraphEdge, "id" | "kind" | "geometry">[]>();
  for (const e of edges) {
    if (NEVER.has(e.kind) || !e.geometry.length) continue;
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of e.geometry) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = `${cx},${cy}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(e);
      }
  }
  const near = (lon: number, lat: number) => {
    const set = new Set<Pick<GraphEdge, "id" | "kind" | "geometry">>();
    const [cx, cy] = [Math.floor(lon / CELL), Math.floor(lat / CELL)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const e of grid.get(`${cx + dx},${cy + dy}`) ?? []) set.add(e);
    return [...set];
  };
  for (const r of reports) {
    if (!isCategory(r.category)) continue;
    const e = evidence(r, now);
    const level = reportLevel(e);
    if (level === "faded" || level === "disputed") continue;
    const sig: CommunitySignal = { reportId: r.id, category: r.category, level, confidence: e.confidence, detail: signalDetail(r, e, now), lastSeen: e.lastSeen };
    for (const id of reportEdges(r, near(r.lon, r.lat))) (out.get(id) ?? out.set(id, []).get(id)!).push(sig);
  }
  return out;
}

/** Reports near a point, nearest first, for "is this already reported?" before adding a duplicate. */
export function nearbyReports<T extends Pick<CommunityReport, "lon" | "lat" | "category">>(reports: readonly T[], lon: number, lat: number, category: CommunityCategory | null, radiusM = 20): T[] {
  return reports
    .map((r) => ({ r, m: haversine([r.lon, r.lat], [lon, lat]) }))
    .filter((x) => x.m <= radiusM && (category === null || x.r.category === category))
    .sort((a, b) => a.m - b.m)
    .map((x) => x.r);
}
