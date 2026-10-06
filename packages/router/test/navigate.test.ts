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

  it("says what each announcement is about, so hazards-only speech can skip the turns (SMALL-03)", () => {
    const nav = new Navigator(plan);
    const kinds: [string, string][] = [];
    for (const [lon, lat] of walk(plan)) {
      const p = nav.update(lon, lat, 8);
      if (p.announce) kinds.push([p.announceKind!, p.announce]);
      else expect(p.announceKind).toBeNull();
    }
    for (const [k, text] of kinds) {
      if (k === "hazard") expect(text).toMatch(/Setts|Steep|Missing data|Kerb|Dropped kerb|slopes sideways|bridge/i);
      if (k === "turn") expect(text).not.toMatch(/^(Setts|Steep section)/);
    }
    expect(kinds.some(([k]) => k === "hazard")).toBe(true);
    expect(kinds.some(([k]) => k === "turn")).toBe(true);
    expect(kinds.at(-1)![0]).toBe("arrive");
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

describe("Navigator on a bus", () => {
  // 200 m walk, 1.8 km ride, then a walk: straight east along a line of latitude.
  const M = 1 / (111_320 * Math.cos((55.95 * Math.PI) / 180));
  const xs = [0, 200, 2000, 2200];
  const plan = {
    coords: xs.map((x) => [-3.2 + x * M, 55.95] as [number, number]),
    cum: xs,
    length: 2200,
    maneuvers: [],
    hazards: [],
    rides: [{ from: 200, to: 2000, alight: "Dean Bridge" }],
  };
  const at = (x: number, northM = 0) => [-3.2 + x * M, 55.95 + northM / 111_320] as const;

  it("allows for the road between stops, says when to get off, and is strict again on foot", () => {
    const nav = new Navigator(plan);
    nav.update(...at(100));
    nav.update(...at(250));
    // 100 m off the straight line mid-ride: the bus is on its road, not lost.
    expect(nav.update(...at(900, 100)).offRoute).toBe(false);
    expect(nav.update(...at(1000, 100)).offRoute).toBe(false);
    const near = nav.update(...at(1700));
    expect(near.announce).toBe("Get ready to get off. Your stop is Dean Bridge.");
    nav.update(...at(2100));
    nav.update(...at(2150, 100));
    expect(nav.update(...at(2160, 100)).offRoute).toBe(true);
  });
});

describe("navigation in miles mode (SMALL-02)", () => {
  const mph = { ...PRESETS["manual-wheelchair"], speedUnit: "mph" as const };
  it("plans and says distances in yards and miles, never metres", () => {
    const router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-old-town.graph.json.gz")));
    const j = EDINBURGH_JOURNEYS.find((x) => x.id === "royal-mile-victoria-street")!;
    const r = router.route(router.snap(j.from.lon, j.from.lat, mph), router.snap(j.to.lon, j.to.lat, mph), mph)!;
    const pl = buildNavPlan(r, mph);
    expect(pl.unit).toBe("mph");
    expect(plan.unit).toBe("kmh");
    for (const h of pl.hazards) expect(h.detail).not.toMatch(/\d m\b/);
    expect(pl.hazards.some((h) => /\d yd\b/.test(h.detail))).toBe(true);
    const nav = new Navigator(pl);
    const said: string[] = [];
    for (const [lon, lat] of walk(pl)) {
      const p = nav.update(lon, lat, 5);
      if (p.announce) said.push(p.announce);
    }
    expect(said.some((s) => /^(Setts|Steep section) in \d+ yards/.test(s))).toBe(true);
    for (const s of said) expect(s).not.toMatch(/\d+ (metres|m|km)\b/);
  });
});
