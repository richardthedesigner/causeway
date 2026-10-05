import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { learnPace, PRESETS } from "@causeway/profile";
import { buildNavPlan, onRoadAt, Router, secondsLeft, summarise } from "@causeway/router";

const SNAPSHOT = join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz");
const road = PRESETS["mobility-scooter-road"];
const oneSpeed = { ...road, roadSpeedMps: undefined };
let router: Router;
// Causewayside to Waverley: most of it on streets without separately mapped pavements.
const ends = (p = road) => [router.snap(-3.1812, 55.9385, p), router.snap(-3.1893, 55.952, p)] as const;
beforeAll(() => {
  router = new Router(loadSnapshot(SNAPSHOT));
}, 60_000);

describe("road speed for road-legal scooters", () => {
  it("is quicker than one pavement pace everywhere", () => {
    const [a, b] = ends();
    const fast = router.route(a, b, road)!;
    const slow = router.route(a, b, oneSpeed)!;
    expect(summarise(fast).minutes).toBeLessThan(summarise(slow).minutes * 0.8);
  });

  it("doesn't change anyone who isn't road-legal", () => {
    const pav = PRESETS["mobility-scooter"];
    const [a, b] = ends(pav);
    const r1 = router.route(a, b, pav)!;
    const r2 = router.route(a, b, { ...pav, roadSpeedMps: 3.6 })!;
    expect(r2.seconds).toBeCloseTo(r1.seconds, 6);
  });

  it("marks the road stretches and times them at road speed", () => {
    const [a, b] = ends();
    const r = router.route(a, b, road)!;
    const plan = buildNavPlan(r, road);
    const roadM = (plan.roads ?? []).reduce((t, x) => t + x.to - x.from, 0);
    expect(roadM).toBeGreaterThan(500);
    const first = plan.roads![0]!;
    expect(onRoadAt(plan, (first.from + first.to) / 2)).toBe(true);
    // Flat-ground time left: road at road speed, the rest at the pavement pace.
    const expected = (plan.length - roadM) / road.speedMps + roadM / road.roadSpeedMps!;
    expect(secondsLeft(plan, 0, road.speedMps, road.roadSpeedMps)).toBeCloseTo(expected, 3);
    expect(secondsLeft(plan, 0, road.speedMps)).toBeCloseTo(plan.length / road.speedMps, 3);
  });

  it("has no road stretches for a pavement scooter", () => {
    const pav = PRESETS["mobility-scooter"];
    const [a, b] = ends(pav);
    expect(buildNavPlan(router.route(a, b, pav)!, pav).roads).toEqual([]);
  });

  it("leaves the road speed alone when the pavement pace is learned", () => {
    const p = learnPace(road, 1.5);
    expect(p.speedMps).toBeLessThan(road.speedMps);
    expect(p.roadSpeedMps).toBe(road.roadSpeedMps);
  });
});
