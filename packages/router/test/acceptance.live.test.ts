/**
 * Live-data variant of the acceptance journeys: rebuilds the graph from
 * today's OSM and the LiDAR tiles, then checks the same invariants.
 * Network-dependent, so opt-in:  CAUSEWAY_LIVE=1 pnpm test
 * Phase 3 adds live overlays (closures, lift outages, weather) here.
 */
import { describe, expect, it } from "vitest";
import { PRESETS } from "@causeway/profile";
import { Router, summarise } from "@causeway/router";
import { buildEdinburgh } from "../../../scripts/build-edinburgh.js";
import { EDINBURGH_JOURNEYS } from "../../../scripts/journeys.js";

describe.skipIf(!process.env.CAUSEWAY_LIVE)("Edinburgh journeys on live data", () => {
  it("every journey routes step-free for a manual chair, within limits", { timeout: 300_000 }, async () => {
    const { graph } = await buildEdinburgh({ fresh: true });
    const router = new Router(graph);
    const p = PRESETS["manual-wheelchair"];
    for (const j of EDINBURGH_JOURNEYS) {
      const r = router.route(router.snap(j.from.lon, j.from.lat, p), router.snap(j.to.lon, j.to.lat, p), p);
      expect(r, j.id).not.toBeNull();
      const s = summarise(r!);
      expect(s.steps, j.id).toBe(0);
      expect(Math.abs(s.worstInclinePct ?? 0), j.id).toBeLessThanOrEqual(p.maxInclineUpPct + 0.5);
    }
  });
});
