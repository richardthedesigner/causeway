import { describe, expect, it } from "vitest";
import { routeText } from "../src/lib/route-text";

const summary = { minutes: 23, distanceM: 1440, ascentM: 12, descentM: 4, worstInclinePct: -6.1, worstInclineAt: "Middle Meadow Walk", surfaceMix: {}, kerbs: { lowered: 3, flush: 0, raised: 0, unknown: 1 }, steps: 0, lifts: 0, unknownM: 120, confidence: 0.8, walkM: 1440, rides: [], movableBridges: [], verdict: "passable-with-unknowns" as const };

describe("the route as text (SMALL-04)", () => {
  it("says what it's like, what isn't known, and the way in numbered steps", () => {
    const text = routeText({ name: "Causewayside" }, { name: "Hamilton Place" }, { summary, segments: ["Head north on Causewayside.", "Turn left onto Melville Drive."], unknowns: [{ name: "Jawbone Walk", m: 80, what: "surface" }, { name: "Jawbone Walk", m: 40, what: "width" }] }, new Date("2026-10-05T10:00:00Z"));
    expect(text).toBe(
      [
        "From Causewayside to Hamilton Place",
        "About 23 min, 1.4 km. Steepest 6.1% on Middle Meadow Walk. No steps.",
        "Not known for 120 m: Jawbone Walk.",
        "",
        "1. Head north on Causewayside.",
        "2. Turn left onto Melville Drive.",
        "",
        "Planned with Causewayside on 5 Oct 2026. Things on the ground change, so check as you go.",
      ].join("\n"),
    );
  });

  it("never mentions the device or its limits", () => {
    const text = routeText({ name: "A" }, { name: "B" }, { summary: { ...summary, steps: 2, lifts: 1 }, segments: [], unknowns: [] });
    expect(text).toContain("2 steps. 1 lift.");
    expect(text).not.toMatch(/wheelchair|powerchair|scooter|limit|kerb/i);
  });
});
