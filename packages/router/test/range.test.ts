import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS, profileFrom } from "@causeway/profile";
import { CLIMB_FLAT_EQUIVALENT_M, explain, rangeNote, rangeUse, Router, summarise, type Route } from "@causeway/router";

const SNAPSHOT = join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz");
const cherry = profileFrom("powerchair-light", { surfaces: { ...PRESETS["powerchair-light"].surfaces, sett: null, cobblestone: null } });
let router: Router;
let route: Route;
const ends = () => [router.snap(-3.1857, 55.9572, cherry), router.snap(-3.196, 55.9476, cherry)] as const;
beforeAll(() => {
  router = new Router(loadSnapshot(SNAPSHOT));
  const [a, b] = ends();
  route = router.route(a, b, cherry)!;
}, 60_000);

describe("battery range (Picardy Place to the Grassmarket)", () => {
  it("says nothing when no range is set", () => {
    expect(rangeUse(route, cherry)).toBeNull();
    const [a, b] = ends();
    expect(explain(router, route, a, b, cherry, PRESETS.walking).notes.join(" ")).not.toMatch(/battery/);
  });

  it("counts the climbs on top of the distance", () => {
    const s = summarise(route);
    expect(s.ascentM).toBeGreaterThan(0);
    const u = rangeUse(route, { ...cherry, maxRangeKm: 20 })!;
    expect(u.km).toBeCloseTo((s.walkM + s.ascentM * CLIMB_FLAT_EQUIVALENT_M) / 1000, 5);
    expect(u.km).toBeGreaterThan(s.walkM / 1000);
  });

  it("grades the trip against the range", () => {
    const km = rangeUse(route, { ...cherry, maxRangeKm: 100 })!.km;
    expect(rangeUse(route, { ...cherry, maxRangeKm: km * 3 })!.level).toBe("ok");
    expect(rangeUse(route, { ...cherry, maxRangeKm: km * 1.5 })!.level).toBe("over-half");
    expect(rangeUse(route, { ...cherry, maxRangeKm: km * 0.8 })!.level).toBe("over");
  });

  it("warns in the route notes when the trip is longer than the range", () => {
    const p = { ...cherry, maxRangeKm: 1 };
    const [a, b] = ends();
    const notes = explain(router, route, a, b, p, PRESETS.walking).notes;
    expect(notes.some((n) => /more than your 1 km range/.test(n))).toBe(true);
  });
});

describe("range wording", () => {
  it("is plain and never certain", () => {
    expect(rangeNote({ km: 3.24, rangeKm: 12, unit: "kmh", level: "ok" })).toBeNull();
    expect(rangeNote({ km: 7.04, rangeKm: 12, unit: "kmh", level: "over-half" })).toBe(
      "About 7 km of battery, counting the climbs. That's over half your 12 km range, so you may need to charge before the way back.",
    );
    expect(rangeNote({ km: 14.6, rangeKm: 12, unit: "kmh", level: "over" })).toBe(
      "About 15 km of battery, counting the climbs. That's more than your 12 km range, so it may not fit on one charge.",
    );
    expect(rangeNote({ km: 7.04, rangeKm: 12, unit: "mph", level: "over-half" })).toBe(
      "About 4.4 miles of battery, counting the climbs. That's over half your 7.5 miles range, so you may need to charge before the way back.",
    );
    expect(rangeNote(null)).toBeNull();
  });
});
