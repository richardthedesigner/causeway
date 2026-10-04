import { describe, expect, it } from "vitest";
import { attr, confidence, unknownAttr } from "@causeway/graph";

const now = new Date("2026-10-04T00:00:00Z");

describe("confidence", () => {
  it("is zero for unknown, always", () => {
    expect(confidence(unknownAttr(), now)).toBe(0);
  });

  it("decays with age", () => {
    const fresh = attr(5, "verified", "survey", "2026-09-01T00:00:00Z");
    const old = attr(5, "verified", "survey", "2020-09-01T00:00:00Z");
    expect(confidence(fresh, now)).toBeGreaterThan(confidence(old, now));
  });

  it("ages terrain far more slowly than street observations", () => {
    const lidar = attr(5, "inferred", "lidar-scotland", "2016-01-01T00:00:00Z");
    const imagery = attr(5, "inferred", "mapillary", "2016-01-01T00:00:00Z");
    expect(confidence(lidar, now)).toBeGreaterThan(confidence(imagery, now));
  });

  it("lifts a crowd report with corroboration but never to verified", () => {
    const one = attr(true, "reported", "crowd", "2026-10-01T00:00:00Z");
    const many = { ...one, corroborations: 10 };
    const verified = attr(true, "verified", "survey", "2026-10-01T00:00:00Z");
    expect(confidence(many, now)).toBeGreaterThan(confidence(one, now));
    expect(confidence(many, now)).toBeLessThan(confidence(verified, now));
  });
});
