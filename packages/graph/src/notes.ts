/**
 * User notes: people's own experience of a place or a stretch of footway
 * ("Step-free side entrance on Chambers Street, staff very helpful").
 *
 * Notes are our own content, kept as a separate layer from the ODbL graph
 * (D-008). They point at the graph (OSM way ids, edge ids, a place ref) but
 * are never written into it: edges stay OSM-derived, and notes are joined
 * at query time. A note is always `reported`, ages like any crowd report
 * and gains trust when other people say the same.
 *
 * A note never carries the author's profile (D-009). The only mobility fact
 * it may hold is a coarse label the author chose to add for that one note.
 */
import { confidence, type Attr } from "./attribute.js";
import { haversine } from "./geo.js";
import type { GraphEdge } from "./schema.js";

export type NoteSentiment = "good" | "mixed" | "bad";

export const NOTE_SENTIMENTS: { sentiment: NoteSentiment; label: string }[] = [
  { sentiment: "good", label: "Good" },
  { sentiment: "mixed", label: "Mixed" },
  { sentiment: "bad", label: "Bad" },
];

/** Coarse on purpose: a label someone can share without sharing their limits. */
export type MobilityLabel =
  | "manual wheelchair"
  | "powerchair or scooter"
  | "walking aid"
  | "walking"
  | "pram or buggy"
  | "visual impairment"
  | "fatigue or chronic illness";

export const MOBILITY_LABELS: readonly MobilityLabel[] = [
  "manual wheelchair",
  "powerchair or scooter",
  "walking aid",
  "walking",
  "pram or buggy",
  "visual impairment",
  "fatigue or chronic illness",
];

/** The label for a profile preset. Takes the preset id, never the profile, so no threshold can leak into a note. */
export function mobilityLabelFor(preset: string): MobilityLabel {
  switch (preset) {
    case "manual-wheelchair":
    case "manual-wheelchair-companion":
      return "manual wheelchair";
    case "powerchair":
    case "mobility-scooter":
      return "powerchair or scooter";
    case "rollator":
    case "walking-stick":
    case "crutches":
      return "walking aid";
    case "pram":
      return "pram or buggy";
    case "visual-impairment":
      return "visual impairment";
    case "fatigue":
      return "fatigue or chronic illness";
    default:
      return "walking";
  }
}

export type NoteTarget =
  /** A venue or entrance. `ref` is the place id ("demo:...", "station:...", "pin:...") or "entrance:<osm id>". */
  | { kind: "place"; ref: string; name: string }
  /**
   * A stretch of footway. OSM way ids survive graph rebuilds; edge ids are a
   * fast path that only holds for the graph build they were taken from.
   */
  | { kind: "way"; name: string; osmWayIds: number[]; edgeIds: number[]; graphBuiltAt: string };

export interface UserNote {
  id: string;
  /** Pseudonymous id for the device (later, the account). Only used to count different people; never shown. */
  author: string;
  city: string;
  target: NoteTarget;
  lon: number;
  lat: number;
  sentiment: NoteSentiment;
  text: string;
  /** Small JPEG data URL on the device; a storage path on a server. */
  photo: string | null;
  /** ISO 8601: when the person was there (the time they wrote it). */
  at: string;
  /** Opt-in per note. A label only, never thresholds. */
  mobility: MobilityLabel | null;
}

export const NOTE_MAX_CHARS = 280;

/** Why a note can't be saved, or null if it can. */
export function noteProblem(n: Pick<UserNote, "text" | "sentiment" | "mobility">): string | null {
  const t = n.text.trim();
  if (!t) return "Write a few words about it.";
  if (t.length > NOTE_MAX_CHARS) return `Keep it under ${NOTE_MAX_CHARS} characters.`;
  if (!NOTE_SENTIMENTS.some((s) => s.sentiment === n.sentiment)) return "Choose good, mixed or bad.";
  if (n.mobility !== null && !MOBILITY_LABELS.includes(n.mobility)) return "Unknown mobility label.";
  return null;
}

/** Do two notes talk about the same thing? */
export function sameTarget(a: UserNote, b: UserNote): boolean {
  if (a.city !== b.city || a.target.kind !== b.target.kind) return false;
  if (a.target.kind === "place" && b.target.kind === "place") {
    return a.target.ref === b.target.ref || haversine([a.lon, a.lat], [b.lon, b.lat]) <= 30;
  }
  if (a.target.kind === "way" && b.target.kind === "way") {
    if (haversine([a.lon, a.lat], [b.lon, b.lat]) > 200) return false;
    const ways = new Set(a.target.osmWayIds);
    if (b.target.osmWayIds.some((w) => ways.has(w))) return true;
    if (a.target.graphBuiltAt !== b.target.graphBuiltAt) return false;
    const edges = new Set(a.target.edgeIds);
    return b.target.edgeIds.some((e) => edges.has(e));
  }
  return false;
}

/** Other people (distinct authors) who left a note on the same thing with the same sentiment. */
export function corroborations(n: UserNote, all: readonly UserNote[]): number {
  const authors = new Set<string>();
  for (const o of all) {
    if (o.id === n.id || o.author === n.author || o.sentiment !== n.sentiment) continue;
    if (sameTarget(n, o)) authors.add(o.author);
  }
  return authors.size;
}

/** A note as an attribute: always `reported`, from our own notes layer. */
export function noteAttr(n: UserNote, corroborationCount = 0): Attr<NoteSentiment> {
  return {
    value: n.sentiment,
    state: "reported",
    source: "notes",
    observedAt: n.at,
    ...(corroborationCount ? { corroborations: corroborationCount } : {}),
  };
}

/** Confidence in [0, 0.9]: ages like any crowd report, rises with corroboration, never reaches verified. */
export function noteConfidence(n: UserNote, all: readonly UserNote[], now: Date = new Date()): number {
  return confidence(noteAttr(n, corroborations(n, all)), now);
}

/** Notes about a place: matched by ref, or by being within `radiusM` of it (dropped pins move). */
export function notesForPlace(notes: readonly UserNote[], place: { id: string; lon: number; lat: number }, radiusM = 40): UserNote[] {
  return notes.filter(
    (n) => n.target.kind === "place" && (n.target.ref === place.id || haversine([n.lon, n.lat], [place.lon, place.lat]) <= radiusM),
  );
}

/** A named stretch of a route, as the app sees it. */
export interface Stretch {
  name: string;
  edgeIds: number[];
  osmWayIds: number[];
  /** Midpoints of the stretch's edges, for "nearest stretch" and the 200 m sanity check. */
  points: [number, number][];
}

/** Notes about this stretch of a route. */
export function notesForStretch(notes: readonly UserNote[], s: Stretch, graphBuiltAt: string): UserNote[] {
  const ways = new Set(s.osmWayIds);
  const edges = new Set(s.edgeIds);
  return notes.filter((n) => {
    if (n.target.kind !== "way") return false;
    // Same build: edge ids are exact. Only after a rebuild fall back to OSM ways near the note.
    if (n.target.graphBuiltAt === graphBuiltAt) return n.target.edgeIds.some((e) => edges.has(e));
    return n.target.osmWayIds.some((w) => ways.has(w)) && s.points.some((p) => haversine(p, [n.lon, n.lat]) <= 200);
  });
}

/**
 * Graph edges a stretch note refers to. Edge ids are used as they are when
 * the note was taken on this build; otherwise the note's OSM ways near the
 * note's own point (a long way can run across town).
 */
export function resolveNoteEdges(n: UserNote, graph: { meta: { builtAt: string }; edges: readonly GraphEdge[] }, byWay?: Map<number, GraphEdge[]>): number[] {
  if (n.target.kind !== "way") return [];
  if (n.target.graphBuiltAt === graph.meta.builtAt) return n.target.edgeIds;
  const index = byWay ?? wayIndex(graph.edges);
  const out: number[] = [];
  for (const w of n.target.osmWayIds) {
    for (const e of index.get(w) ?? []) {
      if (e.geometry.some((p) => haversine(p, [n.lon, n.lat]) <= 200)) out.push(e.id);
    }
  }
  return out;
}

function wayIndex(edges: readonly GraphEdge[]): Map<number, GraphEdge[]> {
  const m = new Map<number, GraphEdge[]>();
  for (const e of edges) if (e.osmWayId !== undefined) (m.get(e.osmWayId) ?? m.set(e.osmWayId, []).get(e.osmWayId)!).push(e);
  return m;
}

/**
 * What the notes on one edge add up to, for the cost model. `score` is in
 * roughly [-2, 2]: positive means people found it fine, negative means hard
 * going. Each note counts by its confidence and by how relevant the
 * author's label is to this user.
 */
export interface NoteSignal {
  score: number;
  count: number;
}

const SENTIMENT_WEIGHT: Record<NoteSentiment, number> = { good: 1, mixed: -0.4, bad: -1 };

/** Someone who gets around like you counts most; an unlabelled note counts a bit less; a different way of getting around, less again. */
export function relevance(note: MobilityLabel | null, user: MobilityLabel | null): number {
  if (note === null || user === null) return 0.6;
  return note === user ? 1 : 0.4;
}

export function noteSignals(
  notes: readonly UserNote[],
  graph: { meta: { builtAt: string }; edges: readonly GraphEdge[] },
  now: Date,
  user: MobilityLabel | null,
): Map<number, NoteSignal> {
  const out = new Map<number, NoteSignal>();
  const ways = notes.some((n) => n.target.kind === "way" && n.target.graphBuiltAt !== graph.meta.builtAt) ? wayIndex(graph.edges) : undefined;
  for (const n of notes) {
    if (n.target.kind !== "way") continue;
    const w = SENTIMENT_WEIGHT[n.sentiment] * noteConfidence(n, notes, now) * relevance(n.mobility, user);
    for (const id of new Set(resolveNoteEdges(n, graph, ways))) {
      const cur = out.get(id) ?? { score: 0, count: 0 };
      out.set(id, { score: Math.max(-2, Math.min(2, cur.score + w)), count: cur.count + 1 });
    }
  }
  return out;
}

const MOBILITY_PHRASE: Record<MobilityLabel, string> = {
  "manual wheelchair": "using a manual wheelchair",
  "powerchair or scooter": "using a powerchair or scooter",
  "walking aid": "using a walking aid",
  walking: "walking",
  "pram or buggy": "with a pram or buggy",
  "visual impairment": "with a visual impairment",
  "fatigue or chronic illness": "with fatigue or a chronic illness",
};

/** "A Causewayside user, using a manual wheelchair". Never a name, never a number from the profile. */
export function noteAttribution(n: Pick<UserNote, "mobility">, own = false): string {
  const who = own ? "You" : "A Causewayside user";
  return n.mobility ? `${who}, ${MOBILITY_PHRASE[n.mobility]}` : who;
}
