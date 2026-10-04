import { describe, expect, it } from "vitest";
import { osmNotesNear, type OsmNotesFile } from "../src/lib/osm-notes";

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

describe("OpenStreetMap notes near a route (DATA-08)", () => {
  it("lists notes within 20 m, in order along the route, and marks them unchecked", () => {
    const out = osmNotesNear(file, [[-3.2, 55.94], [-3.18, 55.94]]);
    expect(out).toEqual([
      'An OpenStreetMap note near the route, from May 2026: "Path reopened." Not checked by us.',
      'An OpenStreetMap note near the route, from Sep 2026: "Gate and steps newly at this location." Not checked by us.',
    ]);
  });

  it("says nothing with no file or no notes nearby", () => {
    expect(osmNotesNear(null, [[-3.2, 55.94], [-3.18, 55.94]])).toEqual([]);
    expect(osmNotesNear(file, [[-3.2, 55.93], [-3.18, 55.93]])).toEqual([]);
  });
});
