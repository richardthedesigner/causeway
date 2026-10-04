/**
 * Newcastle / Gateshead: the journey that failed. Hotel on Grey Street to BALTIC.
 * Must handle the Gateshead Millennium Bridge (level, tilting), avoid the
 * steep banks (Dean Street, Side, Castle Stairs) for low-incline profiles,
 * and be honest about lifts it has no live status for.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isKnown, loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { DRY, evaluateEdge, explain, Router, summarise, type Route } from "@causeway/router";
import { NEWCASTLE_JOURNEYS } from "../../../scripts/journeys.js";

const SNAPSHOT = join(import.meta.dirname, "../../../data/snapshots/newcastle-gateshead.graph.json.gz");
let router: Router;
beforeAll(() => {
  router = new Router(loadSnapshot(SNAPSHOT));
});

const j = NEWCASTLE_JOURNEYS[0]!;
const plan = (preset: keyof typeof PRESETS) => {
  const p = PRESETS[preset];
  const a = router.snap(j.from.lon, j.from.lat, p);
  const b = router.snap(j.to.lon, j.to.lat, p);
  const r = router.route(a, b, p);
  expect(r, preset).not.toBeNull();
  return { r: r!, a, b, p };
};
const uses = (r: Route, names: RegExp) => r.steps.some((s) => names.test(s.edge.name ?? ""));
const BANKS = /^(Dean Street|Side|Castle Stairs|Akenside Hill)$/;

describe("Grey Street to BALTIC", () => {
  it("the steep banks really are steep in the LiDAR", () => {
    for (const name of ["Dean Street", "Side", "Akenside Hill"]) {
      const steepest = Math.max(...router.graph.edges.filter((e) => e.name === name && isKnown(e.attrs.inclineMax)).map((e) => Math.abs(e.attrs.inclineMax.value!)));
      expect(steepest, name).toBeGreaterThan(9);
    }
  });

  it("the Millennium Bridge is level and known to tilt", () => {
    const decks = router.graph.edges.filter((e) => e.movable === "tilt");
    expect(decks.length).toBeGreaterThan(0);
    for (const d of decks) expect(Math.abs(d.attrs.incline.value ?? 0)).toBeLessThan(2);
    // Never sampled from the river bed: deck gradients come from the abutments.
    expect(decks.every((d) => d.attrs.incline.source !== "lidar-england")).toBe(true);
  });

  it("walking takes the short way down, stairs and all", () => {
    const { r } = plan("walking");
    expect(summarise(r).steps).toBeGreaterThan(0);
  });

  it("a manual wheelchair avoids the banks and every step, within its limit", () => {
    const { r, p } = plan("manual-wheelchair");
    const s = summarise(r);
    expect(uses(r, BANKS)).toBe(false);
    expect(s.steps).toBe(0);
    expect(Math.abs(s.worstInclinePct ?? 0)).toBeLessThanOrEqual(p.maxInclineUpPct + 0.5);
  });

  it("the manual route crosses the tilting bridge and says so", () => {
    const { r, a, b, p } = plan("manual-wheelchair");
    const s = summarise(r);
    expect(s.movableBridges.some((x) => x.type === "tilt")).toBe(true);
    const ex = explain(router, r, a, b, p, PRESETS.walking);
    expect(ex.notes.some((n) => /tilting bridge/.test(n) && /timetable/.test(n))).toBe(true);
    expect(ex.headline).toMatch(/^Avoids /);
  });

  it("the banks are excluded for an 8% profile in both directions", () => {
    const p = PRESETS["manual-wheelchair"];
    const steep = router.graph.edges.filter((e) => BANKS.test(e.name ?? "") && Math.abs(e.attrs.inclineMax.value ?? 0) > p.maxInclineUpPct + 0.5);
    expect(steep.length).toBeGreaterThan(0);
    for (const e of steep) {
      expect(evaluateEdge(e, true, p, DRY).passable).toBe("no");
      expect(evaluateEdge(e, false, p, DRY).passable).toBe("no");
    }
  });

  it("is honest that there is no live lift status in Newcastle", () => {
    expect(router.graph.meta.liveFeeds ?? []).not.toContain("tfl-lifts");
    const { r, a, b, p } = plan("powerchair");
    const ex = explain(router, r, a, b, p, PRESETS.walking);
    if (summarise(r).lifts > 0) expect(ex.notes.some((n) => /no live lift status/.test(n))).toBe(true);
  });
});
