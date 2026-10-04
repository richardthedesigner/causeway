/**
 * Phase 1: every Edinburgh journey on the central Edinburgh graph, including
 * the Causewayside demo address. Same invariants as the Old Town spike.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { Router, summarise } from "@causeway/router";
import { EDINBURGH_CENTRAL_JOURNEYS } from "../../../scripts/journeys.js";

const SNAPSHOT = join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz");
let router: Router;
beforeAll(() => {
  router = new Router(loadSnapshot(SNAPSHOT));
}, 60_000);

describe("central Edinburgh journeys, manual wheelchair", () => {
  for (const j of EDINBURGH_CENTRAL_JOURNEYS) {
    it(j.title, () => {
      const p = PRESETS["manual-wheelchair"];
      const r = router.route(router.snap(j.from.lon, j.from.lat, p), router.snap(j.to.lon, j.to.lat, p), p);
      expect(r).not.toBeNull();
      const s = summarise(r!);
      expect(s.steps).toBe(0);
      expect(Math.abs(s.worstInclinePct ?? 0)).toBeLessThanOrEqual(p.maxInclineUpPct + 0.5);
      if (s.unknownM > 0) expect(s.verdict).toBe("passable-with-unknowns");
      expect(r!.steps.some((x) => x.edge.name === "Cockburn Street")).toBe(false);
    });
  }
});

describe("rest stops", () => {
  it("offers a route with shorter stretches between benches for someone who needs to rest", async () => {
    const { restStats, tradeoffs } = await import("@causeway/router");
    const p = PRESETS.rollator;
    const a = router.snap(-3.1812, 55.9385, p);
    const b = router.snap(-3.1925, 55.9405, p);
    const r = router.route(a, b, p)!;
    const gap = restStats(router.graph, r).longestWithoutBenchM;
    const more = tradeoffs(router, r, a, b, p).find((t) => t.id === "more-benches");
    expect(more).toBeDefined();
    expect(more!.route).not.toBeNull();
    expect(restStats(router.graph, more!.route!).longestWithoutBenchM).toBeLessThan(gap);
    expect(more!.message).toMatch(/bench/);
  });
});
