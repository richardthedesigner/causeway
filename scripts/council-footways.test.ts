/**
 * Matching Edinburgh's council footways and gritting routes to edges (D-062, D-064).
 * Ported from PR #36's adopted-roads and gritting tests.
 */
import { describe, expect, it } from "vitest";
import { dcatEntry, distanceToPolygon, footwayFor, LineIndex, onGrittingRoute, pickSurface, PolygonIndex, samples, type FootwayPolygon } from "./council-footways-lib.js";

/** A rectangle in metres. */
const rect = (id: number, x0: number, y0: number, x1: number, y1: number, surface: string | null, width: number | null): FootwayPolygon => ({
  id,
  surface,
  width,
  rings: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
});

describe("geometry", () => {
  it("measures distance to a polygon, zero inside", () => {
    const p = rect(1, 0, 0, 10, 2, "HRA", 2);
    expect(distanceToPolygon(5, 1, p)).toBe(0);
    expect(distanceToPolygon(5, 5, p)).toBeCloseTo(3);
  });

  it("samples every 5 m clear of the ends, or the middle of a short line", () => {
    expect(samples([[0, 0], [40, 0]]).map((s) => s.x)).toEqual([5, 10, 15, 20, 25, 30, 35]);
    expect(samples([[0, 0], [8, 0]]).map((s) => s.x)).toEqual([4]);
  });
});

describe("surface", () => {
  it("takes setts when they cover a quarter of the points, so a stretch isn't outvoted", () => {
    expect(pickSurface(["asphalt", "asphalt", "asphalt", "sett"])).toBe("sett");
    expect(pickSurface(["asphalt", "asphalt", "asphalt", "asphalt", "asphalt", "sett"])).toBe("asphalt");
  });
  it("otherwise the commonest on half the points, and nothing when too few are known", () => {
    expect(pickSurface(["asphalt", "concrete", "paving_stones"])).toBeNull();
    expect(pickSurface(["asphalt", null, null])).toBeNull();
  });
});

describe("matching footways", () => {
  // A road along y = 0 from x = 0 to 60; pavements either side.
  const north = rect(1, 0, 6, 60, 8, "Concrete Flags", 2);
  const south = rect(2, 0, -8, 60, -6.8, "Concrete Flags", 1.2);
  const index = new PolygonIndex([north, south]);

  it("a path drawn as its own line takes the polygon it lies in", () => {
    expect(footwayFor("footway", [[0, 7], [60, 7]], index)).toEqual({ surface: "paving_stones", width: 2 });
  });

  it("or one within 3 m, but not further", () => {
    expect(footwayFor("footway", [[0, 10.5], [60, 10.5]], index)).toEqual({ surface: "paving_stones", width: 2 });
    expect(footwayFor("footway", [[0, 12], [60, 12]], index)).toBeNull();
  });

  it("a road standing in for its pavements takes both sides, and the narrow side counts", () => {
    expect(footwayFor("street_proxy", [[0, 0], [60, 0]], index)).toEqual({ surface: "paving_stones", width: 1.2 });
  });

  it("gets nothing when under half its points find a footway", () => {
    const short = new PolygonIndex([rect(5, 0, 6, 20, 8, "Setts", 2)]);
    expect(footwayFor("footway", [[0, 7], [60, 7]], short)).toBeNull();
    expect(footwayFor("footway", [[0, 40], [60, 40]], index)).toBeNull();
  });

  it("ignores surfaces it can't place, Surface Dressing and Grass among them, and widths too small to be a pavement", () => {
    expect(footwayFor("footway", [[0, 0], [60, 0]], new PolygonIndex([rect(3, 0, -1, 60, 1, "Other", 0.5)]))).toBeNull();
    expect(footwayFor("footway", [[0, 0], [60, 0]], new PolygonIndex([rect(4, 0, -1, 60, 1, "Surface Dressing", 1.8)]))).toEqual({ surface: null, width: 1.8 });
    expect(footwayFor("footway", [[0, 0], [60, 0]], new PolygonIndex([rect(6, 0, -1, 60, 1, "Grass", null)]))).toBeNull();
  });
});

describe("gritting", () => {
  // A priority 1 street along y = 0 from x = 0 to 200, and another crossing it at x = 100.
  const index = new LineIndex([
    [
      [0, 0],
      [200, 0],
    ],
    [
      [100, -100],
      [100, 100],
    ],
  ]);

  it("takes a street proxy along the line, and a pavement beside it", () => {
    expect(onGrittingRoute("street_proxy", [[20, 1], [80, 1]], index)).toBe(true);
    expect(onGrittingRoute("sidewalk", [[20, 8], [80, 8]], index)).toBe(true);
  });

  it("leaves a pavement too far from the street, or a proxy beside it rather than on it", () => {
    expect(onGrittingRoute("sidewalk", [[20, 20], [80, 20]], index)).toBe(false);
    expect(onGrittingRoute("street_proxy", [[20, 10], [80, 10]], index)).toBe(false);
  });

  it("ignores a path that only crosses the route at a corner", () => {
    expect(onGrittingRoute("footway", [[30, -30], [30, 30]], index)).toBe(false);
  });

  it("never marks steps or crossings", () => {
    expect(onGrittingRoute("steps", [[20, 1], [80, 1]], index)).toBe(false);
    expect(onGrittingRoute("crossing", [[20, 1], [80, 1]], index)).toBe(false);
  });
});

describe("the council's DCAT feed", () => {
  const svc = "https://example/MapServer/9";
  const feed = (license: string, modified?: string) => ({ dataset: [{ title: "Gritting Routes", license, ...(modified ? { modified } : {}), distribution: [{ accessURL: svc }] }] });

  it("gives the published date for an OGL layer", () => {
    expect(dcatEntry(feed("supplied under the Open Government License v3.0 (https://…)", "2021-05-27T10:53:37.000Z"), svc)).toEqual({ title: "Gritting Routes", publishedAt: "2021-05-27" });
  });

  it("refuses a layer that isn't there, isn't OGL, or has no date: never today's date", () => {
    expect(() => dcatEntry(feed("Open Government Licence v3.0", "2021-05-27"), "https://example/other")).toThrow(/not in the council's DCAT feed/);
    expect(() => dcatEntry(feed("All rights reserved", "2021-05-27"), svc)).toThrow(/not listed as Open Government Licence/);
    expect(() => dcatEntry(feed("Open Government Licence v3.0"), svc)).toThrow(/no published date/);
  });
});
