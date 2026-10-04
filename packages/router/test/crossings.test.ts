/**
 * Crossings for blind and partially sighted people: prefer lights that beep
 * or have a rotating cone, avoid crossings with no lights or zebra, and say
 * when the cues aren't mapped rather than assume.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { crossingFromTags, sharedWithCyclesFromTags, unknownAttr, type GraphNode } from "@causeway/graph";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { crossingCueCost, DRY, evaluateNode, Router, type Route } from "@causeway/router";

const node = (tags: Record<string, string>): GraphNode => ({ id: 1, lon: 0, lat: 0, ele: unknownAttr(), level: 0, kind: "crossing", crossing: crossingFromTags({ highway: "crossing", ...tags }, "2026-01-01")! });
const VI = PRESETS["visual-impairment"];

describe("crossing cues from OSM", () => {
  it("reads control and cues, leaving unmapped cues unknown", () => {
    const x = crossingFromTags({ highway: "crossing", crossing: "traffic_signals", "traffic_signals:sound": "yes" }, null)!;
    expect(x.control.value).toBe("signals");
    expect(x.sound.value).toBe(true);
    expect(x.vibration.state).toBe("unknown");
    expect(crossingFromTags({ highway: "crossing", crossing: "uncontrolled", crossing_ref: "zebra" }, null)!.control.value).toBe("zebra");
    expect(crossingFromTags({ highway: "footway" }, null)).toBeUndefined();
  });

  it("calls a cycle path shared unless it's segregated", () => {
    expect(sharedWithCyclesFromTags({ highway: "footway", bicycle: "designated", segregated: "no" }, null)!.value).toBe(true);
    expect(sharedWithCyclesFromTags({ highway: "footway", bicycle: "designated", segregated: "yes" }, null)!.value).toBe(false);
    expect(sharedWithCyclesFromTags({ highway: "footway", bicycle: "yes" }, null)!.state).toBe("inferred");
    expect(sharedWithCyclesFromTags({ highway: "footway" }, null)).toBeUndefined();
  });

  it("prices what a crossing lacks for this profile only", () => {
    const beeps = node({ crossing: "traffic_signals", "traffic_signals:sound": "yes", tactile_paving: "yes" });
    const silent = node({ crossing: "traffic_signals", "traffic_signals:sound": "no", "traffic_signals:vibration": "no", tactile_paving: "yes" });
    const none = node({ crossing: "unmarked", tactile_paving: "no" });
    expect(crossingCueCost(beeps, VI)!.cost).toBe(0);
    expect(crossingCueCost(silent, VI)!.reasons[0]!.detail).toBe("lights with no beep or rotating cone");
    expect(crossingCueCost(none, VI)!.cost).toBeGreaterThan(crossingCueCost(silent, VI)!.cost);
    expect(crossingCueCost(none, PRESETS.walking)).toBeNull();
    // Unmapped cues are unknown, never assumed: the crossing is passable but not "known good".
    expect(evaluateNode(node({ crossing: "traffic_signals" }), true, VI, DRY).passable).toBe("unknown");
  });
});

describe("Edinburgh: a visually impaired route takes better crossings", () => {
  let router: Router;
  beforeAll(() => {
    router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz")));
  });
  const crossings = (r: Route) => r.steps.map((s) => s.node.crossing).filter((x) => !!x);
  const poor = (r: Route) => crossings(r).filter((x) => x!.control.value === "uncontrolled" || x!.control.value === "marked").length;

  it("uses no more uncontrolled crossings than the walking route, and fewer across these trips in total", () => {
    const trips: [number, number, number, number][] = [
      [-3.1812, 55.9385, -3.1955, 55.9475], // Causewayside to Grassmarket
      [-3.2085, 55.958, -3.1885, 55.9535], // Stockbridge to Princes Street east
      [-3.1983, 55.9417, -3.1745, 55.9507], // Tollcross to Holyrood Road
    ];
    let walk = 0,
      vi = 0;
    for (const [a, b, c, d] of trips) {
      const w = router.route(router.snap(a, b, PRESETS.walking), router.snap(c, d, PRESETS.walking), PRESETS.walking)!;
      const v = router.route(router.snap(a, b, VI), router.snap(c, d, VI), VI)!;
      expect(poor(v)).toBeLessThanOrEqual(poor(w));
      walk += poor(w);
      vi += poor(v);
    }
    expect(vi).toBeLessThan(walk);
  });
});
