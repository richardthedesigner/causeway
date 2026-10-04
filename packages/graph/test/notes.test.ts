import { describe, expect, it } from "vitest";
import {
  attr,
  corroborations,
  mobilityLabelFor,
  noteAttr,
  noteAttribution,
  noteConfidence,
  noteProblem,
  notesForPlace,
  notesForStretch,
  noteSignals,
  relevance,
  resolveNoteEdges,
  confidence,
  type GraphEdge,
  type UserNote,
} from "@causeway/graph";

const now = new Date("2026-10-04T12:00:00Z");
const BUILD = "2026-10-01T00:00:00Z";

const edge = (id: number, osmWayId: number, lon = -3.19, lat = 55.948): GraphEdge => ({
  id,
  from: id,
  to: id + 1,
  kind: "sidewalk",
  geometry: [[lon, lat], [lon + 0.0005, lat]],
  lengthM: 30,
  name: "Victoria Street",
  level: 0,
  layer: 0,
  bridge: false,
  bidirectional: true,
  attrs: {} as GraphEdge["attrs"],
  osmWayId,
});
const graph = { meta: { builtAt: BUILD }, edges: [edge(1, 100), edge(2, 100), edge(3, 200)] };

let seq = 0;
const way = (over: Partial<UserNote> = {}): UserNote => ({
  id: `n${++seq}`,
  author: "a",
  city: "edinburgh",
  target: { kind: "way", name: "Victoria Street", osmWayIds: [100], edgeIds: [1, 2], graphBuiltAt: BUILD },
  lon: -3.19,
  lat: 55.948,
  sentiment: "bad",
  text: "Setts are fine in the dry, lethal when wet.",
  photo: null,
  at: "2026-10-01T10:00:00Z",
  mobility: null,
  ...over,
});
const place = (over: Partial<UserNote> = {}): UserNote => ({
  ...way(),
  target: { kind: "place", ref: "demo:museum", name: "National Museum" },
  sentiment: "good",
  text: "Step-free side entrance on Chambers Street, staff very helpful.",
  ...over,
});

describe("note model", () => {
  it("needs a few words and a sentiment, and keeps it short", () => {
    expect(noteProblem({ text: "  ", sentiment: "good", mobility: null })).toMatch(/few words/);
    expect(noteProblem({ text: "x".repeat(281), sentiment: "good", mobility: null })).toMatch(/280/);
    expect(noteProblem({ text: "Heavy door", sentiment: "mixed", mobility: "walking aid" })).toBeNull();
    expect(noteProblem({ text: "Heavy door", sentiment: "meh" as never, mobility: null })).not.toBeNull();
  });

  it("turns a preset into a coarse label and never into anything with numbers", () => {
    expect(mobilityLabelFor("manual-wheelchair")).toBe("manual wheelchair");
    expect(mobilityLabelFor("manual-wheelchair-companion")).toBe("manual wheelchair");
    expect(mobilityLabelFor("mobility-scooter")).toBe("powerchair or scooter");
    expect(mobilityLabelFor("crutches")).toBe("walking aid");
    expect(mobilityLabelFor("walking")).toBe("walking");
  });

  it("attributes to a Causewayside user, with the label only when the author added it", () => {
    expect(noteAttribution({ mobility: "manual wheelchair" })).toBe("A Causewayside user, using a manual wheelchair");
    expect(noteAttribution({ mobility: null })).toBe("A Causewayside user");
    expect(noteAttribution({ mobility: "visual impairment" }, true)).toBe("You, with a visual impairment");
  });

  it("is always a reported fact from the notes layer", () => {
    const a = noteAttr(way(), 2);
    expect(a.state).toBe("reported");
    expect(a.source).toBe("notes");
    expect(a.corroborations).toBe(2);
  });
});

describe("matching notes to places and stretches", () => {
  it("finds place notes by ref or by distance", () => {
    const byRef = place();
    const nearby = place({ target: { kind: "place", ref: "pin:x", name: "Dropped pin" }, lon: -3.1901, lat: 55.948 });
    const far = place({ target: { kind: "place", ref: "pin:y", name: "Dropped pin" }, lon: -3.2, lat: 55.95 });
    const hits = notesForPlace([byRef, nearby, far, way()], { id: "demo:museum", lon: -3.19, lat: 55.948 });
    expect(hits).toEqual([byRef, nearby]);
  });

  it("finds stretch notes by edge on the same build, and by OSM way after a rebuild", () => {
    const stretch = { name: "Victoria Street", edgeIds: [7], osmWayIds: [100], points: [[-3.19, 55.948]] as [number, number][] };
    const n = way();
    expect(notesForStretch([n], stretch, "2027-01-01")).toEqual([n]);
    expect(notesForStretch([n], { ...stretch, osmWayIds: [999] }, "2027-01-01")).toEqual([]);
    // On the same build, a neighbouring stretch that shares the OSM way but not the edges is a different stretch.
    expect(notesForStretch([n], { ...stretch, edgeIds: [3] }, BUILD)).toEqual([]);
    expect(notesForStretch([n], { ...stretch, edgeIds: [1] }, BUILD)).toEqual([n]);
    expect(resolveNoteEdges(n, graph)).toEqual([1, 2]);
    expect(resolveNoteEdges(n, { ...graph, meta: { builtAt: "2027-01-01" } })).toEqual([1, 2]);
  });

  it("doesn't match a long way across town by its OSM id alone", () => {
    const far = way({ lon: -3.17, lat: 55.96 });
    expect(resolveNoteEdges(far, { ...graph, meta: { builtAt: "2027-01-01" } })).toEqual([]);
  });
});

describe("note confidence", () => {
  it("decays with age", () => {
    const fresh = way();
    const old = way({ at: "2022-10-01T10:00:00Z" });
    expect(noteConfidence(fresh, [fresh], now)).toBeGreaterThan(noteConfidence(old, [old], now));
    expect(noteConfidence(fresh, [fresh], now)).toBeLessThanOrEqual(0.6);
  });

  it("counts corroboration from other people only, with the same sentiment", () => {
    const mine = way({ author: "a" });
    const mineAgain = way({ author: "a" });
    const b = way({ author: "b" });
    const c = way({ author: "c", target: { kind: "way", name: "Victoria Street", osmWayIds: [100], edgeIds: [], graphBuiltAt: "older" } });
    const disagree = way({ author: "d", sentiment: "good" });
    const all = [mine, mineAgain, b, c, disagree];
    expect(corroborations(mine, all)).toBe(2);
    expect(noteConfidence(mine, all, now)).toBeGreaterThan(noteConfidence(mine, [mine], now));
  });

  it("never reaches verified, however many agree", () => {
    const many = Array.from({ length: 20 }, (_, i) => way({ author: `p${i}` }));
    const verified = confidence(attr(true, "verified", "survey", "2026-10-01T10:00:00Z"), now);
    expect(noteConfidence(many[0]!, many, now)).toBeLessThan(verified);
  });
});

describe("note signals for routing", () => {
  it("adds bad notes up as a negative score on the edges they cover", () => {
    const s = noteSignals([way(), way({ author: "b" })], graph, now, "manual wheelchair");
    expect(s.get(1)!.score).toBeLessThan(0);
    expect(s.get(1)!.count).toBe(2);
    expect(s.has(3)).toBe(false);
  });

  it("weighs a note by how close the author's label is to the user", () => {
    expect(relevance("manual wheelchair", "manual wheelchair")).toBeGreaterThan(relevance(null, "manual wheelchair"));
    expect(relevance(null, "manual wheelchair")).toBeGreaterThan(relevance("walking", "manual wheelchair"));
    const same = noteSignals([way({ mobility: "manual wheelchair" })], graph, now, "manual wheelchair").get(1)!.score;
    const other = noteSignals([way({ mobility: "walking" })], graph, now, "manual wheelchair").get(1)!.score;
    expect(same).toBeLessThan(other);
  });

  it("ignores place notes (they show on the place, they don't steer the route)", () => {
    expect(noteSignals([place()], graph, now, null).size).toBe(0);
  });
});
