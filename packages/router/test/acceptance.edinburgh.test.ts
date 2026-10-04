/**
 * Edinburgh acceptance journeys against the committed snapshot.
 * These are the Phase 0 definition of "routes differ for the right reasons".
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph";
import { PRESETS } from "@causeway/profile";
import { DRY, evaluateEdge, explain, Router, summarise, tradeoffs, type Route } from "@causeway/router";
import { EDINBURGH_JOURNEYS } from "../../../scripts/journeys.js";

const SNAPSHOT = join(import.meta.dirname, "../../../data/snapshots/edinburgh-old-town.graph.json.gz");
let router: Router;
beforeAll(() => {
  router = new Router(loadSnapshot(SNAPSHOT));
});

const journey = (id: string) => EDINBURGH_JOURNEYS.find((j) => j.id === id)!;
const plan = (id: string, preset: keyof typeof PRESETS) => {
  const j = journey(id);
  const p = PRESETS[preset];
  const a = router.snap(j.from.lon, j.from.lat, p);
  const b = router.snap(j.to.lon, j.to.lat, p);
  const r = router.route(a, b, p);
  expect(r, `${preset} route for ${id}`).not.toBeNull();
  return { r: r!, a, b, p };
};
const names = (r: Route) => new Set(r.steps.map((s) => s.edge.name));
const usesName = (r: Route, re: RegExp) => r.steps.some((s) => re.test(s.edge.name ?? ""));

describe("Waverley Station to the Grassmarket", () => {
  it("walking takes the direct way, steps and all", () => {
    const { r } = plan("waverley-grassmarket", "walking");
    expect(summarise(r).steps).toBeGreaterThan(0);
  });

  it("manual wheelchair: no steps, nothing over the limit, never Waverley Steps", () => {
    const { r, p } = plan("waverley-grassmarket", "manual-wheelchair");
    const s = summarise(r);
    expect(s.steps).toBe(0);
    expect(usesName(r, /Waverley Steps/)).toBe(false);
    expect(Math.abs(s.worstInclinePct ?? 0)).toBeLessThanOrEqual(p.maxInclineUpPct + 0.5);
  });

  it("manual wheelchair leaves the station by a ramp or lift, not stairs", () => {
    const { r } = plan("waverley-grassmarket", "manual-wheelchair");
    const exit = r.steps.findIndex((s) => s.edge.level === 0 && !/Platform/.test(s.edge.name ?? "") && s.edge.name !== null);
    const inStation = r.steps.slice(0, exit + 1);
    expect(inStation.some((s) => s.edge.kind === "steps" || s.edge.kind === "escalator")).toBe(false);
    expect(r.steps.some((s) => /Ramp/.test(s.edge.name ?? "") || s.edge.kind === "elevator" || s.node.kind === "elevator")).toBe(true);
  });

  it("the routes differ, and the explanation names what was avoided", () => {
    const w = plan("waverley-grassmarket", "walking").r;
    const { r, a, b, p } = plan("waverley-grassmarket", "manual-wheelchair");
    expect(r.lengthM).toBeGreaterThan(w.lengthM);
    const ex = explain(router, r, a, b, p, PRESETS.walking);
    expect(ex.avoided.some((x) => x.reason.kind === "excluded" && x.reason.attr === "steps")).toBe(true);
    expect(ex.avoided.some((x) => x.reason.kind === "excluded" && x.reason.attr === "incline")).toBe(true);
    expect(ex.headline).toMatch(/^Avoids .+\. Adds \d+ minutes?\.$/);
    expect(ex.headline).not.toMatch(/—/);
  });

  it("is honest about unknowns rather than calling the route step-free and done", () => {
    const { r } = plan("waverley-grassmarket", "manual-wheelchair");
    const s = summarise(r);
    if (s.unknownM > 0) expect(s.verdict).toBe("passable-with-unknowns");
  });
});

describe("Cockburn Street", () => {
  it("is steep in the data (LiDAR), with setts", () => {
    const edges = router.graph.edges.filter((e) => e.name === "Cockburn Street" && e.attrs.inclineMax.value !== null);
    const steepest = Math.max(...edges.map((e) => Math.abs(e.attrs.inclineMax.value!)));
    expect(steepest).toBeGreaterThan(8);
    expect(edges.some((e) => e.attrs.surface.value === "sett")).toBe(true);
  });

  it("is excluded for a manual chair where it exceeds the limit, in both directions", () => {
    const p = PRESETS["manual-wheelchair"];
    const steep = router.graph.edges.filter((e) => e.name === "Cockburn Street" && Math.abs(e.attrs.inclineMax.value ?? 0) > p.maxInclineUpPct + 0.5);
    expect(steep.length).toBeGreaterThan(0);
    for (const e of steep) {
      expect(evaluateEdge(e, true, p, DRY).passable).toBe("no");
      expect(evaluateEdge(e, false, p, DRY).passable).toBe("no");
    }
  });

  it("is not used by a manual chair going from Market Street up to the High Street", () => {
    const { r } = plan("market-street-high-street", "manual-wheelchair");
    expect(names(r).has("Cockburn Street")).toBe(false);
    expect(summarise(r).steps).toBe(0);
  });
});

describe("Royal Mile to Victoria Street", () => {
  it("surfaces the setts and the gradient explicitly", () => {
    const { r, a, b, p } = plan("royal-mile-victoria-street", "manual-wheelchair");
    const s = summarise(r);
    expect(s.surfaceMix["setts"] ?? 0).toBeGreaterThan(50);
    expect(s.worstInclinePct).not.toBeNull();
    const ex = explain(router, r, a, b, p, PRESETS.walking);
    expect(ex.notes.some((n) => /setts/.test(n))).toBe(true);
    expect(ex.notes.some((n) => /Steepest part/.test(n))).toBe(true);
  });

  it("offers the alternative, or says plainly that there isn't one", () => {
    const { r, a, b, p } = plan("royal-mile-victoria-street", "manual-wheelchair");
    const t = tradeoffs(router, r, a, b, p);
    const smoother = t.find((x) => x.id === "smoother");
    expect(smoother).toBeDefined();
    expect(smoother!.message.length).toBeGreaterThan(0);
  });
});

describe("profiles", () => {
  it("a powerchair and a manual chair can take different routes for the same journey", () => {
    const m = plan("market-street-high-street", "manual-wheelchair").r;
    const pc = plan("market-street-high-street", "powerchair").r;
    const ids = (r: Route) => r.steps.map((s) => s.edge.id).join(",");
    expect(ids(m)).not.toBe(ids(pc));
  });
});
