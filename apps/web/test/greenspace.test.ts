import { describe, expect, it } from "vitest";
import { parkGates, type GreenspaceFile } from "../src/lib/greenspace";

const file: GreenspaceFile = {
  area: "edinburgh-central",
  source: "OS Open Greenspace",
  licence: "OGL v3",
  sites: [
    { name: "West Meadow Park", function: "Public Park Or Garden", bbox: [-3.200, 55.938, -3.190, 55.943], gates: [[-3.200, 55.940, 0], [-3.190, 55.941, 0], [-3.195, 55.943, 1]] },
    { name: "George Square Gardens", function: "Public Park Or Garden", bbox: [-3.1895, 55.9425, -3.1875, 55.9440], gates: [[-3.1880, 55.9440, 0]] },
  ],
};

describe("park gates (DATA-08)", () => {
  it("ends a trip to a park at the gate nearest where you're coming from", () => {
    const to = { name: "The Meadows", kind: "Park", lon: -3.195, lat: 55.940 };
    const fromEast = parkGates(file, to, { lon: -3.18, lat: 55.941 });
    expect(fromEast[0]).toEqual({ park: "West Meadow Park", lon: -3.19, lat: 55.941 });
    expect(parkGates(file, to, { lon: -3.21, lat: 55.94 })[0]!.lon).toBe(-3.2);
    expect(fromEast).toHaveLength(3);
  });

  it("picks the smaller site when one sits inside another, and matches a name nearby", () => {
    expect(parkGates(file, { name: "George Square Gardens", kind: "Garden / George Square", lon: -3.1885, lat: 55.943 }, { lon: -3.18, lat: 55.94 })[0]!.park).toBe("George Square Gardens");
    expect(parkGates(file, { name: "west meadow park", kind: "Street", lon: -3.2, lat: 55.945 }, { lon: -3.18, lat: 55.94 })).toHaveLength(3);
  });

  it("leaves anything else alone", () => {
    expect(parkGates(file, { name: "Café", kind: "Café", lon: -3.195, lat: 55.940 }, { lon: -3.18, lat: 55.94 })).toEqual([]);
    expect(parkGates(null, { name: "The Meadows", kind: "Park", lon: -3.195, lat: 55.940 }, { lon: -3.18, lat: 55.94 })).toEqual([]);
  });
});
