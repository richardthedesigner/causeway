import { describe, expect, it } from "vitest";
import { buildIndex, type PlacesFile } from "../src/lib/search";
import { toiletsAlong } from "../src/lib/toilets";

const M = 1 / 111_320;
const file: PlacesFile = {
  area: "t",
  source: "t",
  builtAt: "",
  zones: [],
  addresses: [],
  postcodes: [],
  places: [
    { n: "", c: "amenity=toilets", x: 0.001, y: 20 * M, a: { wheelchair: "yes", centralkey: "radar", fee: "no", changing_places: "yes" }, id: "n1" },
    { n: "Café", c: "amenity=cafe", x: 0.005, y: -10 * M, a: { "toilets:wheelchair": "yes" }, id: "n2" },
    { n: "", c: "amenity=toilets", x: 0.003, y: 0, a: { wheelchair: "no" }, id: "n3" },
    { n: "Far", c: "amenity=cafe", x: 0.004, y: 500 * M, a: { "toilets:wheelchair": "yes" }, id: "n4" },
  ],
};

describe("toiletsAlong", () => {
  const route: [number, number][] = [
    [0, 0],
    [0.01, 0],
  ];
  it("lists accessible toilets near the route in order, with what matters on arrival", () => {
    const { toilets, longestGapM } = toiletsAlong(buildIndex(file, []), route);
    expect(toilets.map((t) => t.public)).toEqual([true, false]);
    expect(toilets[0]!.facts).toEqual(["Changing Places", "RADAR key", "Free"]);
    expect(toilets[1]!.facts).toContain("Customers");
    expect(longestGapM).toBeGreaterThan(500);
  });
});
