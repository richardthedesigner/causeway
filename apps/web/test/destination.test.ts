import { describe, expect, it } from "vitest";
import { doorFirst, isParkKind } from "../src/lib/destination";
import { parkGates, type GreenspaceFile } from "../src/lib/greenspace";

const file: GreenspaceFile = {
  area: "edinburgh-central",
  source: "OS Open Greenspace",
  licence: "OGL v3",
  sites: [{ name: "George Square Gardens", function: "Public Park Or Garden", bbox: [-3.1895, 55.9425, -3.1875, 55.944], gates: [[-3.188, 55.944, 0]] }],
};
const from = { lon: -3.18, lat: 55.94 };

describe("door or gate at the end of a route (D-018, D-048)", () => {
  it("a park found by name ends at its gate, not a neighbouring building's door", () => {
    const park = { id: "osm:n9", name: "George Square Gardens", kind: "Garden / George Square", venue: true, lon: -3.1885, lat: 55.943 };
    const gates = parkGates(file, park, from);
    expect(gates).toHaveLength(1);
    expect(doorFirst(park, gates)).toBe(false);
  });

  it("keeps door-first for pins, other venues, and a park we have no gates for", () => {
    const at = { lon: -3.1885, lat: 55.943 };
    const pin = { id: "pin:1", name: "Dropped pin", kind: "Pin", ...at };
    expect(doorFirst(pin, parkGates(file, pin, from))).toBe(true);
    const cafe = { id: "osm:n8", name: "Garden Café", kind: "Café", venue: true, ...at };
    expect(doorFirst(cafe, parkGates(file, cafe, from))).toBe(true);
    const far = { id: "osm:n7", name: "Far Park", kind: "Park", venue: true, lon: -3.1, lat: 55.9 };
    expect(doorFirst(far, parkGates(file, far, from))).toBe(true);
    expect(doorFirst(far, parkGates(null, far, from))).toBe(true);
    const street = { id: "s1", name: "High Street", kind: "Street", ...at };
    expect(doorFirst(street, [])).toBe(false);
  });

  it("knows the park-like kinds", () => {
    expect(["Park", "Garden", "Garden / George Square", "Parking", "Beer garden"].map(isParkKind)).toEqual([true, true, true, false, false]);
  });
});
