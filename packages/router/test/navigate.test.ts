import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { buildNavPlan, hazardText, Navigator, Router, type NavPlan } from "@causeway/router";
import { EDINBURGH_JOURNEYS } from "../../../scripts/journeys.js";

let plan: NavPlan;
beforeAll(() => {
  const router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-old-town.graph.json.gz")));
  const j = EDINBURGH_JOURNEYS.find((x) => x.id === "royal-mile-victoria-street")!;
  const p = PRESETS["manual-wheelchair"];
  const r = router.route(router.snap(j.from.lon, j.from.lat, p), router.snap(j.to.lon, j.to.lat, p), p)!;
  plan = buildNavPlan(r, p);
});

/** Points every `step` metres along the route, as a phone would report them. */
function walk(pl: NavPlan, step = 5): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= pl.length; d += step) {
    let i = 0;
    while (i < pl.cum.length - 2 && pl.cum[i + 1]! < d) i++;
    const t = (d - pl.cum[i]!) / Math.max(1e-6, pl.cum[i + 1]! - pl.cum[i]!);
    const a = pl.coords[i]!,
      b = pl.coords[i + 1]!;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  out.push(pl.coords[pl.coords.length - 1]!);
  return out;
}

describe("navigation plan", () => {
  it("starts, ends, and names the street it turns onto", () => {
    expect(plan.maneuvers[0]!.type).toBe("start");
    expect(plan.maneuvers.at(-1)!.type).toBe("arrive");
    expect(plan.maneuvers.some((m) => /Victoria Street|George IV Bridge/.test(m.text))).toBe(true);
    for (const m of plan.maneuvers) expect(m.text).not.toMatch(/—/);
  });

  it("warns about the setts and the slope on Victoria Street", () => {
    expect(plan.hazards.some((h) => h.kind === "setts")).toBe(true);
    expect(plan.hazards.some((h) => h.kind === "steep" && /downhill|uphill/.test(h.detail))).toBe(true);
    for (const h of plan.hazards) expect(hazardText(h)).toMatch(/^[A-Z]/);
  });
});

describe("Navigator", () => {
  it("tracks progress forward, announces hazards before reaching them, and arrives", () => {
    const nav = new Navigator(plan);
    const said: string[] = [];
    let last = 0;
    for (const [lon, lat] of walk(plan)) {
      const p = nav.update(lon, lat, 8);
      expect(p.along).toBeGreaterThanOrEqual(last);
      last = p.along;
      expect(p.offRoute).toBe(false);
      if (p.announce) said.push(p.announce);
    }
    expect(said.some((s) => /^(Setts|Steep section) in \d+ metres/.test(s))).toBe(true);
    expect(said.at(-1)).toBe("You have arrived.");
    // Each thing is said once, not on every fix.
    expect(new Set(said).size).toBe(said.length);
  });

  it("calls off-route only after two fixes well away from the line", () => {
    const nav = new Navigator(plan);
    const [lon, lat] = plan.coords[3]!;
    nav.update(lon, lat);
    const away: [number, number] = [lon + 0.0015, lat + 0.0015]; // about 190 m away
    expect(nav.update(...away).offRoute).toBe(false);
    const p = nav.update(...away);
    expect(p.offRoute).toBe(true);
    expect(p.announce).toMatch(/off the route/);
  });

  it("tolerates a poor fix when the phone says its accuracy is poor", () => {
    const nav = new Navigator(plan);
    const [lon, lat] = plan.coords[3]!;
    const near: [number, number] = [lon + 0.0004, lat]; // about 25 m east
    nav.update(...near, 60);
    expect(nav.update(...near, 60).offRoute).toBe(false);
  });
});
