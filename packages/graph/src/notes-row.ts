/**
 * UserNote <-> the `note` table and `note_public` view (db/migrations/0002,
 * 0003). Pure, so the shape is tested here and the app's sync code only
 * moves bytes. The author id never goes into a row: the database fills it
 * from the signed-in (anonymous) user.
 */
import { MOBILITY_LABELS, type MobilityLabel, type NoteGround, type NoteSentiment, type UserNote } from "./notes.js";

/** What the app inserts into `note`. */
export interface NoteInsertRow {
  id: string;
  area_id: string;
  target_kind: "place" | "way";
  target_name: string;
  place_ref: string | null;
  osm_way_ids: number[];
  edge_ids: number[];
  graph_built_at: string | null;
  geom: string;
  sentiment: NoteSentiment;
  body: string;
  photo_path: string | null;
  mobility_label: MobilityLabel | null;
  ground: NoteGround | null;
  observed_at: string;
}

/** What `note_public` returns. */
export interface NotePublicRow {
  id: string;
  area_id: string;
  target_kind: "place" | "way";
  target_name: string;
  place_ref: string | null;
  osm_way_ids: number[];
  edge_ids: number[];
  graph_built_at: string | null;
  lon: number;
  lat: number;
  sentiment: NoteSentiment;
  body: string;
  photo_path: string | null;
  mobility_label: string | null;
  ground: string | null;
  observed_at: string;
  author_key: string;
  own: boolean;
}

export function toNoteRow(n: UserNote, photoPath: string | null = null): NoteInsertRow {
  const way = n.target.kind === "way" ? n.target : null;
  return {
    id: n.id,
    area_id: n.city,
    target_kind: n.target.kind,
    target_name: n.target.name,
    place_ref: n.target.kind === "place" ? n.target.ref : null,
    osm_way_ids: way?.osmWayIds ?? [],
    edge_ids: way?.edgeIds ?? [],
    graph_built_at: way?.graphBuiltAt ?? null,
    // EWKT: PostgREST hands it to PostGIS as is.
    geom: `SRID=4326;POINT(${n.lon} ${n.lat})`,
    sentiment: n.sentiment,
    body: n.text.trim(),
    photo_path: photoPath,
    mobility_label: n.mobility,
    ground: n.ground ?? null,
    observed_at: n.at,
  };
}

/**
 * A shared note as the app holds it. Other people are told apart by their
 * pseudonym (for corroboration); your own notes take this device's author
 * id so they show as "You". Anything malformed is dropped, never guessed.
 */
export function fromPublicRow(r: NotePublicRow, deviceAuthor: string, photoUrl: (path: string) => string = (p) => p): UserNote | null {
  if (!["good", "mixed", "bad"].includes(r.sentiment) || !Number.isFinite(r.lon) || !Number.isFinite(r.lat) || !r.body) return null;
  const target: UserNote["target"] | null =
    r.target_kind === "place" && r.place_ref
      ? { kind: "place", ref: r.place_ref, name: r.target_name }
      : r.target_kind === "way"
        ? { kind: "way", name: r.target_name, osmWayIds: r.osm_way_ids ?? [], edgeIds: r.edge_ids ?? [], graphBuiltAt: r.graph_built_at ?? "" }
        : null;
  if (!target) return null;
  return {
    id: r.id,
    author: r.own ? deviceAuthor : `shared:${r.author_key}`,
    city: r.area_id,
    target,
    lon: r.lon,
    lat: r.lat,
    sentiment: r.sentiment,
    text: r.body,
    photo: r.photo_path ? photoUrl(r.photo_path) : null,
    at: r.observed_at,
    mobility: MOBILITY_LABELS.includes(r.mobility_label as MobilityLabel) ? (r.mobility_label as MobilityLabel) : null,
    ground: r.ground === "dry" || r.ground === "wet" ? r.ground : null,
  };
}

/** Your notes and shared ones, once each. Your own copy wins: it may hold a photo the shared one is still waiting on. */
export function mergeNotes(local: readonly UserNote[], shared: readonly UserNote[]): UserNote[] {
  const ids = new Set(local.map((n) => n.id));
  return [...local, ...shared.filter((n) => !ids.has(n.id))];
}
