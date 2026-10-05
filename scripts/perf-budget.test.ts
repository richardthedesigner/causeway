/**
 * The speed budget (docs/plans/PERF_BASELINE.md, D-055). Fails when:
 * - the data a city downloads beside its graph, search index, buses and base
 *   map (council layer, park gates, notes, toilets, floods, works) comes to
 *   more than 400 KB compressed;
 * - routing the acceptance journeys settles more than 10% more nodes than the
 *   stored baseline (deterministic: the same on every machine);
 * - route time, over a fixed yardstick workload, is more than 10% above the
 *   stored baseline. Timings are the fastest of several runs, after a warm-up,
 *   and the best of up to four attempts. On CI runners, whose hardware differs
 *   from the machine that set the baseline, this check only fails past 50%
 *   and otherwise prints the figure;
 * - route plus trade-offs for the presets with a rest interval (REST_PRESETS),
 *   which plan with "More benches" searches that `alternatives` never makes,
 *   is more than 10% above its own stored baseline, on the same terms (D-054).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { AREAS, EXTRA_BUDGET_BYTES, ROUTE_BUDGET, calibrate, extraBytes, loadAll, measureAll, measurePlans, readBaseline, type LoadedCity, type Measurement } from "./perf.js";

const ATTEMPTS = 4;
const CI = !!process.env.CI;

describe("download budget", () => {
  for (const a of AREAS) {
    it(`${a.city}: data beside the graph stays within ${EXTRA_BUDGET_BYTES / 1024} KB compressed`, () => {
      expect(extraBytes(a.area)).toBeLessThanOrEqual(EXTRA_BUDGET_BYTES);
    });
  }
});
describe("route time budget", () => {
  let cities: LoadedCity[];
  let warm: Measurement;
  beforeAll(() => {
    cities = loadAll();
    warm = measureAll(cities, 1); // warm-up, and the deterministic counts
  }, 120_000);

  it("settles no more than 10% more nodes than the baseline, city by city", () => {
    const base = readBaseline();
    for (const c of cities) {
      const b = base.cities.find((x) => x.area === c.area.area);
      expect(b, `${c.area.area} has a baseline`).toBeDefined();
      const now = warm.cities.find((x) => x.area === c.area.area)!.totalSettled;
      expect(now, `${c.area.area}: ${now} nodes settled, baseline ${b!.totalSettled}`).toBeLessThanOrEqual(b!.totalSettled * (1 + ROUTE_BUDGET));
    }
  });

  it("route time stays within 10% of the baseline", () => {
    const base = readBaseline();
    let best = Infinity;
    for (let i = 0; i < ATTEMPTS && best > base.normalised * (1 + ROUTE_BUDGET); i++) best = Math.min(best, measureAll(cities).normalised);
    const ratio = best / base.normalised;
    const limit = CI ? 1.5 : 1 + ROUTE_BUDGET;
    console.log(`route time: ${best.toFixed(2)} against baseline ${base.normalised} (${((ratio - 1) * 100).toFixed(1)}%), yardstick ${calibrate(3).toFixed(1)} ms${CI ? ", CI: reported, fails only past 50%" : ""}`);
    expect(ratio).toBeLessThanOrEqual(limit);
  }, 180_000);

  it("route plus trade-offs for rest presets stays within 10% of the baseline", () => {
    const base = readBaseline().plans;
    expect(base, "perf-baseline.json has a plans baseline").toBeDefined();
    measurePlans(cities, 1); // warm-up
    let best = Infinity;
    for (let i = 0; i < ATTEMPTS && best > base!.normalised * (1 + ROUTE_BUDGET); i++) best = Math.min(best, measurePlans(cities).normalised);
    const ratio = best / base!.normalised;
    const limit = CI ? 1.5 : 1 + ROUTE_BUDGET;
    console.log(`rest presets, route plus trade-offs: ${best.toFixed(2)} against baseline ${base!.normalised} (${((ratio - 1) * 100).toFixed(1)}%)${CI ? ", CI: reported, fails only past 50%" : ""}`);
    expect(ratio).toBeLessThanOrEqual(limit);
  }, 300_000);
});
