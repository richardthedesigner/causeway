import { describe, expect, it } from "vitest";
import { PRESETS, kerbLimitText, stepKerbCm } from "@causeway/profile";

describe("presets on Inclusive Mobility values (D-013, D-053)", () => {
  it("rest distances: 50 m with a stick or crutches, 100 m with fatigue, 300 m with a rollator's seat", () => {
    expect(PRESETS["walking-stick"].maxRestIntervalM).toBe(50);
    expect(PRESETS.crutches.maxRestIntervalM).toBe(50);
    // Richard's call (2026-10-05): the rollator has a seat, so it keeps 300 m.
    expect(PRESETS.rollator.maxRestIntervalM).toBe(300);
    expect(PRESETS.fatigue.maxRestIntervalM).toBe(100);
    expect(PRESETS.walking.maxRestIntervalM).toBeNull();
  });

  it("a manual chair needs a dropped kerb within the flush band", () => {
    expect(PRESETS["manual-wheelchair"].maxKerbCm).toBe(0.6);
  });
});

describe("kerb limit in words and steps", () => {
  it("reads under a centimetre in millimetres", () => {
    expect(kerbLimitText(0)).toBe("Flush only");
    expect(kerbLimitText(0.6)).toBe("6 mm");
    expect(kerbLimitText(2)).toBe("2 cm");
    expect(kerbLimitText(4.6)).toBe("4.6 cm");
  });

  it("steps to whole centimetres and never below flush", () => {
    expect(stepKerbCm(0.6, 1)).toBe(1);
    expect(stepKerbCm(0.6, -1)).toBe(0);
    expect(stepKerbCm(2, 1)).toBe(3);
    expect(stepKerbCm(0, -1)).toBe(0);
    expect(stepKerbCm(20, 1)).toBe(20);
  });
});
