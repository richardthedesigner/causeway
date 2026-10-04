/**
 * After dark: the sun's position on the device, and routes that keep to lit
 * streets for people who asked, without calling unmapped lighting unlit.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { darkCost, DRY, explain, isDark, Router, sunAltitude, type Conditions, type Route } from "@causeway/router";

const EDI = [-3.19, 55.95] as const;
const at = (iso: string) => isDark(new Date(iso), EDI[0], EDI[1]);
const VI = PRESETS["visual-impairment"];
const DARK: Conditions = { ...DRY, now: new Date("2026-10-04T21:00:00Z"), dark: true };

describe("is it dark?", () => {
  it("knows an Edinburgh October evening from the afternoon", () => {
    expect(at("2026-10-04T12:00:00Z")).toBe(false);
    expect(at("2026-10-04T17:30:00Z")).toBe(false); // just before sunset (about 17:40 UTC)
    expect(at("2026-10-04T19:00:00Z")).toBe(true); // after civil dusk (about 18:20 UTC)
    expect(at("2026-10-05T04:00:00Z")).toBe(true);
  });

  it("puts the midsummer noon sun near its textbook height", () => {
    // 90 - 55.95 + 23.44 = 57.5 degrees.
    expect(sunAltitude(new Date("2026-06-21T12:13:00Z"), EDI[0], EDI[1])).toBeCloseTo(57.5, 0);
  });
});

describe("lighting cost", () => {
  const edge = (lit: boolean | null) =>
    ({ kind: "footway", lengthM: 100, attrs: { lit: { value: lit, state: lit === null ? "unknown" : "reported" }, covered: { value: null, state: "unknown" } } }) as never;
  it("prices unlit stretches only after dark, only for those who asked", () => {
    expect(darkCost(edge(false), VI, DARK)!.seconds).toBe(60);
    expect(darkCost(edge(false), VI, DRY)).toBeNull();
    expect(darkCost(edge(false), PRESETS.walking, DARK)).toBeNull();
    expect(darkCost(edge(true), VI, DARK)).toBeNull();
    // Unmapped lighting is a smaller penalty, named as not mapped, never as unlit.
    const u = darkCost(edge(null), VI, DARK)!;
    expect(u.detail).toBe("lighting not mapped");
    expect(u.seconds).toBeLessThan(60);
  });
});

describe("Edinburgh after dark", () => {
  let router: Router;
  beforeAll(() => {
    router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz")));
  });
  const unlitM = (r: Route) => r.steps.filter((s) => s.edge.attrs.lit.value === false).reduce((t, s) => t + s.edge.lengthM, 0);

  it("leaves the Water of Leith walkway for lit streets, Stockbridge to Dean Village", () => {
    const from = router.snap(-3.2085, 55.958, VI),
      to = router.snap(-3.2175, 55.952, VI);
    const day = router.route(from, to, VI, DRY)!;
    const night = router.route(from, to, VI, DARK)!;
    // By day about 700 m of the route is unlit path; after dark, almost none, for a few hundred metres more.
    expect(unlitM(day)).toBeGreaterThan(500);
    expect(unlitM(night)).toBeLessThan(50);
    expect(explain(router, night, from, to, VI, PRESETS.walking, DARK).notes.some((n) => n.startsWith("After dark:"))).toBe(true);
  });

  it("never walks more unlit metres at night than by day", () => {
    const trips: [number, number, number, number][] = [
      [-3.172, 55.955, -3.183, 55.955], // Abbeyhill to Calton Hill
      [-3.197, 55.963, -3.21, 55.966], // Canonmills to Inverleith
      [-3.1812, 55.9385, -3.1955, 55.9475], // Causewayside to Grassmarket
    ];
    for (const [a, b, c, d] of trips) {
      const from = router.snap(a, b, VI),
        to = router.snap(c, d, VI);
      expect(unlitM(router.route(from, to, VI, DARK)!)).toBeLessThanOrEqual(unlitM(router.route(from, to, VI, DRY)!) + 1);
    }
  });
});
