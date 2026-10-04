import { describe, expect, it } from "vitest";
import { corroborations, fromPublicRow, mergeNotes, toNoteRow, type NotePublicRow, type UserNote } from "@causeway/graph";

const note: UserNote = {
  id: "11111111-0000-0000-0000-000000000001",
  author: "device-1",
  city: "edinburgh",
  target: { kind: "way", name: "Victoria Street", osmWayIds: [100], edgeIds: [1, 2], graphBuiltAt: "2026-10-01T00:00:00Z" },
  lon: -3.1937,
  lat: 55.9484,
  sentiment: "bad",
  text: "  Setts are lethal when wet. ",
  photo: "data:image/jpeg;base64,xx",
  at: "2026-10-04T10:00:00Z",
  mobility: "manual wheelchair",
  ground: "wet",
};

const row = (over: Partial<NotePublicRow> = {}): NotePublicRow => ({
  id: "22222222-0000-0000-0000-000000000001",
  area_id: "edinburgh",
  target_kind: "place",
  target_name: "National Museum of Scotland",
  place_ref: "nms",
  osm_way_ids: [],
  edge_ids: [],
  graph_built_at: null,
  lon: -3.19,
  lat: 55.947,
  sentiment: "good",
  body: "Step-free side entrance",
  photo_path: null,
  mobility_label: null,
  ground: null,
  observed_at: "2026-10-04T10:00:00Z",
  author_key: "k1",
  own: false,
  ...over,
});

describe("note rows", () => {
  it("never sends the author, the photo bytes or anything from the profile", () => {
    const r = toNoteRow(note, "uid/1.jpg");
    expect(r).not.toHaveProperty("author");
    expect(r).not.toHaveProperty("author_id");
    expect(JSON.stringify(r)).not.toContain("base64");
    expect(r.photo_path).toBe("uid/1.jpg");
    expect(r.body).toBe("Setts are lethal when wet.");
    expect(r.geom).toBe("SRID=4326;POINT(-3.1937 55.9484)");
    expect(r).toMatchObject({ target_kind: "way", place_ref: null, osm_way_ids: [100], mobility_label: "manual wheelchair", ground: "wet" });
  });

  it("reads shared notes back, with your own as yours and others by pseudonym", () => {
    expect(fromPublicRow(row({ own: true }), "device-1")!.author).toBe("device-1");
    expect(fromPublicRow(row(), "device-1")!.author).toBe("shared:k1");
    expect(fromPublicRow(row({ target_kind: "way", place_ref: null, osm_way_ids: [9] }), "d")!.target).toMatchObject({ kind: "way", osmWayIds: [9] });
  });

  it("drops what it can't trust rather than guessing", () => {
    expect(fromPublicRow(row({ sentiment: "great" as never }), "d")).toBeNull();
    expect(fromPublicRow(row({ place_ref: null }), "d")).toBeNull();
    expect(fromPublicRow(row({ mobility_label: "marathon runner" }), "d")!.mobility).toBeNull();
    expect(fromPublicRow(row({ ground: "slushy" }), "d")!.ground).toBeNull();
  });

  it("counts two shared notes from different people as corroboration", () => {
    const a = fromPublicRow(row({ id: "a", author_key: "k1" }), "d")!;
    const b = fromPublicRow(row({ id: "b", author_key: "k2" }), "d")!;
    const a2 = fromPublicRow(row({ id: "c", author_key: "k1" }), "d")!;
    expect(corroborations(a, [a, b, a2])).toBe(1);
  });

  it("keeps your local copy when the same note comes back shared", () => {
    const local = { ...note };
    const shared = { ...note, photo: null };
    expect(mergeNotes([local], [shared])).toEqual([local]);
  });
});
