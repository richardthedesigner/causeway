import { describe, expect, it } from "vitest";
import { SPEAK_NEXT, shouldSpeak } from "../src/lib/speak";

describe("how often navigation speaks (SMALL-03)", () => {
  it("says nothing when off, everything on every turn, and all but the turns for hazards only", () => {
    const kinds = ["turn", "hazard", "arrive", "alight", "off-route"] as const;
    expect(kinds.filter((k) => shouldSpeak("off", k))).toEqual([]);
    expect(kinds.filter((k) => shouldSpeak("all", k))).toEqual([...kinds]);
    expect(kinds.filter((k) => shouldSpeak("hazards", k))).toEqual(["hazard", "arrive", "alight", "off-route"]);
    expect(shouldSpeak("all", null)).toBe(true);
    expect(shouldSpeak("hazards", null)).toBe(false);
  });

  it("steps off, hazards only, every turn, and round again", () => {
    expect([SPEAK_NEXT.off, SPEAK_NEXT.hazards, SPEAK_NEXT.all]).toEqual(["hazards", "all", "off"]);
  });
});
