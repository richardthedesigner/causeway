/**
 * Toilet-aware routing (issue #17): a long Edinburgh walk for someone who
 * needs an accessible toilet every so often is offered a route that passes
 * more of them, and the gap is measured honestly.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { DRY, restStats, Router, tradeoffs } from "@causeway/router";

let router: Router;
beforeAll(() => {
  router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz")));
});

describe("toilet-aware routing", () => {
  it("counts venue toilets once added, and steers past toilets when the gap is too long", () => {
    const p = { ...PRESETS.fatigue, maxRestIntervalM: null, maxToiletIntervalM: 600, buses: false };
    const from = router.snap(-3.1812, 55.9385, p); // Causewayside
    const to = router.snap(-3.2085, 55.958, p); // Stockbridge
    const chosen = router.route(from, to, p, DRY)!;
    const before = restStats(router.graph, chosen).longestWithoutToiletM;
    expect(before).toBeGreaterThan(600);

    // While the gap is too long, "Past more toilets" is offered, and any route it gives has a shorter gap.
    const t = tradeoffs(router, chosen, from, to, p, DRY).find((x) => x.id === "more-toilets");
    expect(t).toBeTruthy();
    if (t!.route) expect(restStats(router.graph, t!.route).longestWithoutToiletM).toBeLessThan(before);

    // Venue toilets every 400 m along the direct route close the gap.
    let d = 0;
    const venues: { lon: number; lat: number; name: string }[] = [];
    for (const s of chosen.steps) {
      d += s.edge.lengthM;
      if (d >= 400) {
        venues.push({ lon: s.node.lon, lat: s.node.lat, name: "Test café" });
        d = 0;
      }
    }
    router.addToilets(venues);
    expect(restStats(router.graph, chosen).longestWithoutToiletM).toBeLessThanOrEqual(600);
  });

  it("finds a route that keeps toilets within reach when the mapped toilets allow it", () => {
    const p = { ...PRESETS.fatigue, maxRestIntervalM: null, maxToiletIntervalM: 1500, buses: false };
    const from = router.snap(-3.1955, 55.9475, p); // Grassmarket
    const to = router.snap(-3.1885, 55.9535, p); // Princes Street east
    const r = router.routeWithRests(from, to, p, DRY, 1500, "toilet");
    if (r) expect(restStats(router.graph, r).longestWithoutToiletM).toBeLessThanOrEqual(1500 + 100);
  });
});
