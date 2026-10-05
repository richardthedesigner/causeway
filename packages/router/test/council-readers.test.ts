/**
 * Every reader of surface and width sees the council's inferred values the same way (D-062):
 * the route's surface mix, the setts warning in navigation, and "relax a limit". They read the
 * edge's attributes, which the council layer fills when the city loads, so this checks the
 * joins on a real route rather than each reader alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyCouncilFootways, isKnown, type CouncilFootways } from "@causeway/graph";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { buildNavPlan, DRY, evaluateEdge, Router, summarise, surfaceLabel, type Route } from "@causeway/router";
import { EDINBURGH_CENTRAL_JOURNEYS } from "../../../scripts/journeys.js";

const ROOT = join(import.meta.dirname, "../../..");
let router: Router;
let route: Route;
const p = PRESETS["manual-wheelchair"];

beforeAll(() => {
  const g = loadSnapshot(join(ROOT, "data/snapshots/edinburgh-central.graph.json.gz"));
  applyCouncilFootways(g, JSON.parse(readFileSync(join(ROOT, "data/council/edinburgh-central.footways.json"), "utf8")) as CouncilFootways);
  router = new Router(g);
  const j = EDINBURGH_CENTRAL_JOURNEYS.find((x) => x.id === "causewayside-waverley")!;
  route = router.route(router.snap(j.from.lon, j.from.lat, p), router.snap(j.to.lon, j.to.lat, p), p)!;
  expect(route).toBeTruthy();
}, 60_000);

describe("council surfaces and widths in the readers (D-062)", () => {
  it("the route's surface mix counts council surfaces as known", () => {
    const council = route.steps.filter((s) => s.edge.attrs.surface.source === "council");
    expect(council.length).toBeGreaterThan(0);
    const mix = summarise(route).surfaceMix;
    for (const s of council) expect(mix[surfaceLabel(s.edge.attrs.surface.value!)]).toBeGreaterThan(0);
    const unknownM = route.steps.filter((s) => !isKnown(s.edge.attrs.surface) && !["board", "ride", "transfer"].includes(s.edge.kind)).reduce((t, s) => t + s.edge.lengthM, 0);
    expect(Math.abs((mix["unknown"] ?? 0) - unknownM)).toBeLessThan(2);
  });

  it("navigation warns of council setts as it does of OSM's", () => {
    const setts = router.graph.edges.find((e) => e.attrs.surface.source === "council" && e.attrs.surface.value === "sett" && e.lengthM >= 10)!;
    expect(setts).toBeDefined();
    const ev = evaluateEdge(setts, true, PRESETS.walking, DRY);
    const plan = buildNavPlan({ ...route, steps: [{ ...route.steps[1]!, edge: setts, forward: true, eval: ev }] }, PRESETS.walking);
    expect(plan.hazards.some((h) => h.kind === "setts")).toBe(true);
  });

  it("a narrow council width never closes a pavement, so it is never offered as a limit to relax", () => {
    const narrow = router.graph.edges.filter((e) => e.attrs.width.source === "council" && e.attrs.width.value! < 0.9);
    expect(narrow.length).toBeGreaterThan(0);
    for (const e of narrow.slice(0, 200)) {
      const ev = evaluateEdge(e, true, PRESETS.powerchair, DRY);
      expect(ev.reasons.some((r) => r.kind === "excluded" && r.attr === "width")).toBe(false);
    }
  });
});
