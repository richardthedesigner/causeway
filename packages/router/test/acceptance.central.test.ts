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
