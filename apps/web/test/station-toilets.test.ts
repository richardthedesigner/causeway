import { describe, expect, it } from "vitest";
import { buildIndex } from "../src/lib/search";
import { mergeStationToilets, type NetworkFile } from "../src/lib/station-toilets";
import { toiletsAlong } from "../src/lib/toilets";

type Loo = NonNullable<NetworkFile["stations"][string]["access"]>["toilets"][number];
const station = (id: string, name: string, lon: number, lat: number, toilets: Loo[]) => ({
  id,
  name,
  lon,
  lat,
  mode: "tube" as const,
  hub: null,
  stepFree: "yes" as const,
  stepFreeSource: "test",
  note: null,
  access: { tflId: id, outside: "street", paths: [], lines: {}, toilets, source: "test" },
});
const loo = (t: Partial<Loo>): Loo => ({ accessible: false, radar: false, insideGate: false, location: null, ...t });

describe("TfL station toilets (DATA-23)", () => {
  it("adds one place per station, preferring an accessible toilet outside the gates", () => {
    const index = buildIndex(null, []);
    const file: NetworkFile = {
      stations: {
        a: station("a", "Westminster", -0.1248, 51.501, [loo({ insideGate: true }), loo({ accessible: true, location: "Located in ticket hall" }), loo({ accessible: true, insideGate: true })]),
        b: station("b", "Green Park", -0.1428, 51.5067, []),
      },
    };
    expect(mergeStationToilets(index, file)).toEqual({ added: 1, filled: 0 });
    const e = index.entries.find((x) => x.place.id === "tfl-toilet:a")!;
    expect(e.place.name).toBe("Toilets at Westminster station");
    expect(e.access).toEqual({ wheelchair: "yes" });
    expect(e.place.facts).toEqual(["Mapped as a wheelchair accessible toilet", "Outside the ticket gates", "Located in ticket hall"]);
    expect(e.place.factsSource).toBe("TfL station data");
  });

  it("marks a station whose only accessible toilet is past the gates as for customers", () => {
    const index = buildIndex(null, []);
    mergeStationToilets(index, { stations: { a: station("a", "Stratford", -0.0035, 51.5418, [loo({ accessible: true, insideGate: true, radar: true })]) } });
    const e = index.entries[0]!;
    expect(e.access).toEqual({ wheelchair: "yes", centralkey: "yes", access: "customers" });
    expect(e.place.facts).toContain("Inside the ticket gates");
    const along = toiletsAlong(index, [[-0.005, 51.5418], [-0.002, 51.5418]]);
    expect(along.toilets[0]?.facts).toEqual(["RADAR key", "Customers"]);
  });

  it("fills an OSM toilet at the station instead of adding a second one", () => {
    const osm = { area: "london-jubilee", source: "t", builtAt: "t", zones: [], places: [{ n: "Station toilets", c: "amenity=toilets", x: -0.12485, y: 51.5011, a: {}, id: "n1" }], addresses: [], postcodes: [] } as unknown as Parameters<typeof buildIndex>[0];
    const index = buildIndex(osm, []);
    expect(mergeStationToilets(index, { stations: { a: station("a", "Westminster", -0.1248, 51.501, [loo({ accessible: true })]) } })).toEqual({ added: 0, filled: 1 });
    expect(index.entries.filter((e) => e.cat === "amenity=toilets")).toHaveLength(1);
    expect(index.entries[0]!.place.factsSource).toMatch(/TfL station data/);
  });

  it("finds the real file's toilets", async () => {
    const { readFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync(new URL("../../../data/transit/london/network.json", import.meta.url), "utf8")) as NetworkFile;
    const index = buildIndex(null, []);
    const r = mergeStationToilets(index, file);
    expect(r.added + r.filled).toBe(24);
  });
});
