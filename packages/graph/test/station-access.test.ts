import { describe, expect, it } from "vitest";
import { applyStationAccess, stepFreeLines, type Graph, type StationAccess, type TransitNetwork } from "../src/index.js";
import { attr, unknownAttr } from "../src/attribute.js";

/** Street, ticket hall, then a lift to each line. Line b's southbound platform is only by stairs. */
const access: StationAccess = {
  tflId: "HUBX",
  outside: "out",
  paths: [
    ["out", "hall", null],
    ["hall", "a-level", "lift-1"],
    ["a-level", "a-nb", null],
    ["a-level", "a-sb", null],
    ["hall", "b-nb", "lift-2"],
  ],
  lines: {
    a: { platforms: ["a-nb", "a-sb"], mapped: true, train: "Step up to 5 cm between platform and train." },
    b: { platforms: ["b-nb", "b-sb"], mapped: true, train: null },
    c: { platforms: ["c-nb"], mapped: true, train: null },
    d: { platforms: ["d-nb"], mapped: false, train: null },
  },
  toilets: [],
  source: "TfL station data (2026-08-03)",
};

describe("station access from TfL's station data (DATA-03)", () => {
  it("says which lines are step-free from the street", () => {
    expect(stepFreeLines(access)).toEqual({ a: "yes", b: "part", c: "no", d: "unknown" });
  });

  it("works out what a lift outage cuts off, using paths both ways", () => {
    expect(stepFreeLines(access, new Set(["lift-1"])).a).toBe("no");
    expect(stepFreeLines(access, new Set(["lift-2"])).a).toBe("yes");
  });

  it("puts the facts on the board edges, with where they came from", () => {
    const blank = () => ({ stepCount: unknownAttr<number>(), wheelchair: unknownAttr<"yes" | "limited" | "no">() });
    const g = { edges: ["a", "b", "c"].map((l) => ({ kind: "board", ref: `board:${l}:S`, attrs: blank() })) } as unknown as Graph;
    const net = { fetchedAt: "2026-10-04", stations: { S: { id: "S", access } } } as unknown as TransitNetwork;
    expect(applyStationAccess(g, net)).toBe(3);
    const [a, b, c] = g.edges;
    expect(a!.attrs.stepCount).toMatchObject({ value: 0, state: "reported", source: "tfl" });
    expect(a!.attrs.stepCount.method).toBe("TfL station data (2026-08-03): step-free from street to every platform. Step up to 5 cm between platform and train.");
    expect(b!.attrs.stepCount.value).toBeNull();
    expect(b!.attrs.stepCount.method).toMatch(/some platforms only/);
    expect(c!.attrs.stepCount).toMatchObject({ value: 1, state: "reported" });
    expect(c!.attrs.wheelchair).toEqual(attr("no", "reported", "tfl", "2026-10-04", c!.attrs.stepCount.method));
  });
});
