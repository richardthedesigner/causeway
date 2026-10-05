import { describe, expect, it } from "vitest";
import { osmNoteItems, type OsmNotesFile } from "../src/lib/osm-notes";

const file: OsmNotesFile = {
  area: "edinburgh-central",
  source: "OpenStreetMap notes (open)",
  licence: "ODbL",
  fetchedAt: "2026-10-04",
  notes: [
    { id: 1, lon: -3.19, lat: 55.9401, opened: "2026-09-12", text: "Gate and steps newly at this location." },
    { id: 2, lon: -3.195, lat: 55.94005, opened: "2026-05-15", text: "Path reopened." },
    { id: 3, lon: -3.19, lat: 55.95, opened: "2026-01-01", text: "Far away." },
  ],
};
const line: [number, number][] = [[-3.2, 55.94], [-3.18, 55.94]];

describe("OpenStreetMap notes on a route (DATA-08, D-067)", () => {
  it("lists notes within 20 m, in order along the route, as reported by people and unchecked", () => {
    expect(osmNoteItems(file, line)).toEqual([
      { group: "info", text: 'A mapper wrote: “Path reopened.” Not checked by us', where: [], label: "reported", source: "OpenStreetMap Notes", date: "2026-05-15", until: null },
      { group: "info", text: 'A mapper wrote: “Gate and steps newly at this location.” Not checked by us', where: [], label: "reported", source: "OpenStreetMap Notes", date: "2026-09-12", until: null },
    ]);
  });

  it("lists the first three and counts the rest", () => {
    const many = { ...file, notes: [1, 2, 3, 4, 5].map((i) => ({ id: i, lon: -3.2 + i * 0.002, lat: 55.94, opened: `2026-0${i}-01`, text: `Steps ${i}.` })) };
    const out = osmNoteItems(many, line);
    expect(out).toHaveLength(4);
    expect(out[2]!.text).toMatch(/“Steps 3\.”/);
    expect(out[3]).toMatchObject({ text: "2 more places a mapper flagged on this route", date: "2026-05-01", label: "reported" });
    expect(osmNoteItems(many, line, 20, 4).at(-1)!.text).toBe("1 more place a mapper flagged on this route");
  });

  it("says nothing with no file or no notes nearby", () => {
    expect(osmNoteItems(null, line)).toEqual([]);
    expect(osmNoteItems(file, [[-3.2, 55.93], [-3.18, 55.93]])).toEqual([]);
  });
});
