import { describe, expect, it } from "vitest";
import { formatDistance } from "@causeway/profile";
import { bandDistance } from "../src/components/v3/band-distance";

describe("bandDistance (design v3, FEAT-67)", () => {
  it("splits the figure from its unit, to the whole metre", () => {
    expect(bandDistance(204, "kmh")).toEqual({ figure: "204", unit: "m" });
    expect(bandDistance(6, "kmh")).toEqual({ figure: "6", unit: "m" });
  });

  it("reads long stretches in kilometres", () => {
    expect(bandDistance(1240, "kmh")).toEqual({ figure: "1.2", unit: "km" });
  });

  it("follows a device set to miles: yards, then miles", () => {
    expect(bandDistance(182, "mph")).toEqual({ figure: "199", unit: "yd" });
    expect(bandDistance(1240, "mph")).toEqual({ figure: "0.8", unit: "miles" });
    expect(bandDistance(1609, "mph")).toEqual({ figure: "1", unit: "mile" });
  });

  it("is the app's one formatter, cut in two", () => {
    for (const unit of ["kmh", "mph"] as const) {
      for (const m of [1, 8, 97, 412, 999, 1000, 5300]) {
        const d = bandDistance(m, unit);
        expect(`${d.figure} ${d.unit}`).toBe(formatDistance(m, unit, { precise: true }));
      }
    }
  });
});
