import { describe, expect, it } from "vitest";
import { PRESETS, distanceUnit, formatDistance, rangeInUnit, rangeToKm, speakableDistances, speedUnit } from "@causeway/profile";

describe("distances in kilometres mode (SMALL-02, D-073)", () => {
  it("says metres, to the nearest 10, under a kilometre", () => {
    expect(formatDistance(0, "kmh")).toBe("0 m");
    expect(formatDistance(4, "kmh")).toBe("10 m");
    expect(formatDistance(47, "kmh")).toBe("50 m");
    expect(formatDistance(994, "kmh")).toBe("990 m");
  });
  it("says kilometres from 1 km, with one decimal under 10 and none from 10", () => {
    expect(formatDistance(996, "kmh")).toBe("1 km");
    expect(formatDistance(1000, "kmh")).toBe("1 km");
    expect(formatDistance(1440, "kmh")).toBe("1.4 km");
    expect(formatDistance(12_340, "kmh")).toBe("12 km");
  });
  it("can keep the whole metre", () => {
    expect(formatDistance(47, "kmh", { precise: true })).toBe("47 m");
  });
  it("reads aloud in full words", () => {
    expect(formatDistance(50, "kmh", { long: true })).toBe("50 metres");
    expect(formatDistance(1000, "kmh", { long: true })).toBe("1 kilometre");
    expect(formatDistance(2300, "kmh", { long: true })).toBe("2.3 kilometres");
  });
});

describe("distances in miles mode", () => {
  it("says yards under a quarter of a mile", () => {
    expect(formatDistance(0, "mph")).toBe("0 yd");
    expect(formatDistance(50, "mph")).toBe("50 yd"); // 54.7 yd
    expect(formatDistance(100, "mph")).toBe("110 yd"); // 109.4 yd
    expect(formatDistance(300, "mph")).toBe("330 yd");
    expect(formatDistance(390, "mph")).toBe("430 yd");
  });
  it("says miles from a quarter of a mile", () => {
    expect(formatDistance(400, "mph")).toBe("440 yd");
    expect(formatDistance(403, "mph")).toBe("0.3 miles");
    expect(formatDistance(1000, "mph")).toBe("0.6 miles");
    expect(formatDistance(1609.344, "mph")).toBe("1 mile");
    expect(formatDistance(1440, "mph")).toBe("0.9 miles");
    expect(formatDistance(7000, "mph")).toBe("4.3 miles");
    expect(formatDistance(19_312, "mph")).toBe("12 miles");
  });
  it("reads aloud in full words", () => {
    expect(formatDistance(100, "mph", { long: true })).toBe("110 yards");
    expect(formatDistance(1609.344, "mph", { long: true })).toBe("1 mile");
    expect(formatDistance(3000, "mph", { long: true })).toBe("1.9 miles");
  });
  it("never says metres or kilometres", () => {
    for (const m of [0, 3, 80, 440, 900, 5000, 40_000]) expect(formatDistance(m, "mph")).not.toMatch(/\d m\b|km/);
  });
});

describe("the unit follows the speed choice", () => {
  it("is the same per-device setting as speeds (D-051)", () => {
    expect(distanceUnit(PRESETS["mobility-scooter"])).toBe(speedUnit(PRESETS["mobility-scooter"]));
    expect(distanceUnit(PRESETS["mobility-scooter"])).toBe("mph");
    expect(distanceUnit(PRESETS["manual-wheelchair"])).toBe("kmh");
    expect(distanceUnit({ ...PRESETS["manual-wheelchair"], speedUnit: "mph" })).toBe("mph");
    expect(distanceUnit({ ...PRESETS["mobility-scooter"], speedUnit: "kmh" })).toBe("kmh");
  });
});

describe("spoken text", () => {
  it("expands short units", () => {
    expect(speakableDistances("Setts for 30 m.")).toBe("Setts for 30 metres.");
    expect(speakableDistances("Steep section for 110 yd and 1.2 km")).toBe("Steep section for 110 yards and 1.2 kilometres");
    expect(speakableDistances("Setts in 50 metres")).toBe("Setts in 50 metres");
  });
});

describe("battery range, kept in km", () => {
  it("shows whole miles and converts back", () => {
    expect(rangeInUnit(12, "kmh")).toBe(12);
    expect(rangeInUnit(12, "mph")).toBe(7);
    expect(rangeToKm(12, "kmh")).toBe(12);
    expect(rangeToKm(7, "mph")).toBe(11.3);
  });
});
