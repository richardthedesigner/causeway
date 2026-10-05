/**
 * Gusts on exposed bridges and UKHSA heat and cold alerts as small costs
 * (D-066). Neither closes anything; both are said on the route.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { GraphEdge } from "@causeway/graph";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS, type Profile } from "@causeway/profile";
import { DRY, evaluateEdge, explain, GUST_BRIDGE_KMH, onRoute, Router, windSensitive, type Conditions } from "@causeway/router";

const walking = PRESETS.walking;
const manual = PRESETS["manual-wheelchair"];
const fatigue = PRESETS.fatigue;
const GUST: Conditions = { ...DRY, gust: { kmh: 62, at: "2026-10-05T01:00:00Z", source: "Open-Meteo" } };
const HEAT: Conditions = { ...DRY, healthAlert: { kind: "heat", level: "amber", region: "London", at: "2026-07-18T08:00:00Z", until: "2026-07-20T08:00:00Z" } };

let router: Router;
let footway: GraphEdge;
let bridge: GraphEdge;
let shortBridge: GraphEdge;

beforeAll(() => {
  router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz")));
  const flat = (e: GraphEdge) => e.bidirectional && Math.abs(e.attrs.inclineMax.value ?? 9) < 2 && e.attrs.covered.value !== true && e.attrs.wheelchair.value !== "no" && !e.service;
  footway = router.graph.edges.find((e) => e.kind === "sidewalk" && !e.bridge && e.lengthM > 20 && flat(e))!;
  bridge = router.graph.edges.find((e) => e.bridge && e.kind === "sidewalk" && e.lengthM >= 20 && flat(e))!;
  shortBridge = router.graph.edges.find((e) => e.bridge && (e.kind === "sidewalk" || e.kind === "footway") && e.lengthM < 15 && e.attrs.covered.value !== true && !e.service)!;
});

const reason = (e: GraphEdge, p: Profile, c: Conditions, attr: string, benchM?: number) => evaluateEdge(e, true, p, c, { benchM }).reasons.find((r) => r.attr === attr);

describe("gusts on exposed bridges", () => {
  it("are for scooters, manual wheelchairs and lightweight powerchairs", () => {
    expect(windSensitive(manual)).toBe(true);
    expect(windSensitive(PRESETS["manual-wheelchair-companion"])).toBe(true);
    expect(windSensitive(PRESETS["powerchair-light"])).toBe(true);
    expect(windSensitive(PRESETS["mobility-scooter"])).toBe(true);
    expect(windSensitive(PRESETS["mobility-scooter-road"])).toBe(true);
    expect(windSensitive(PRESETS.powerchair)).toBe(false);
    expect(windSensitive(walking)).toBe(false);
  });

  it("cost as much again from 50 km/h, on bridges 15 m or longer only", () => {
    const p = reason(bridge, manual, GUST, "gust");
    expect(p?.detail).toBe("exposed bridge in gusts up to 62 km/h");
    expect(p?.seconds).toBe(Math.round(evaluateEdge(bridge, true, manual, DRY).seconds));
    expect(reason(bridge, walking, GUST, "gust")).toBeUndefined();
    expect(reason(bridge, manual, { ...GUST, gust: { ...GUST.gust!, kmh: GUST_BRIDGE_KMH - 1 } }, "gust")).toBeUndefined();
    expect(reason(footway, manual, GUST, "gust")).toBeUndefined();
    expect(evaluateEdge(shortBridge, true, manual, DRY).cost).toBeLessThan(Infinity);
    expect(reason(shortBridge, manual, GUST, "gust")).toBeUndefined();
    // Never closes.
    expect(evaluateEdge(bridge, true, manual, GUST).passable).toBe(evaluateEdge(bridge, true, manual, DRY).passable);
  });

  it("are listed under On this route over North Bridge, with source and time, and not in Why this way? (D-067)", () => {
    const from = router.snap(-3.1907, 55.9496, manual)!,
      to = router.snap(-3.1893, 55.952, manual)!;
    const r = router.route(from, to, manual, GUST)!;
    expect(onRoute(router, r, manual, GUST)).toContainEqual({ group: "info", text: "Strong gusts on exposed bridges: up to 62 km/h", where: expect.arrayContaining(["North Bridge"]), label: "live", source: "Open-Meteo", date: "2026-10-05T01:00:00Z", until: null });
    expect(explain(router, r, from, to, manual, walking, GUST).notes.some((n) => n.startsWith("Strong gusts"))).toBe(false);
    // Walking: no cost, so no line.
    const w = router.route(from, to, walking, GUST)!;
    expect(onRoute(router, w, walking, GUST).some((i) => i.text.startsWith("Strong gusts"))).toBe(false);
  });
});

describe("UKHSA heat and cold alerts", () => {
  it("make stretches with no bench cost a little more for presets with a rest limit, and nobody else", () => {
    const base = evaluateEdge(footway, true, fatigue, DRY, { benchM: 200 });
    const hot = evaluateEdge(footway, true, fatigue, HEAT, { benchM: 200 });
    const rest = base.reasons.find((r) => r.attr === "rest")!.seconds;
    expect(hot.reasons.find((r) => r.attr === "alert")!.seconds).toBe(Math.round(rest * 0.25 + base.seconds * 0.05));
    // Cold: the bench part only.
    const cold = evaluateEdge(footway, true, fatigue, { ...DRY, healthAlert: { ...HEAT.healthAlert!, kind: "cold" } }, { benchM: 200 });
    expect(cold.reasons.find((r) => r.attr === "alert")!.seconds).toBe(Math.round(rest * 0.25));
    expect(reason(footway, walking, HEAT, "alert", 200)).toBeUndefined();
    expect(hot.passable).toBe(base.passable);
  });

  it("are listed for everyone under On this route, with UKHSA's end date (D-067)", () => {
    const from = router.snap(-3.1812, 55.9385, walking)!,
      to = router.snap(-3.1897, 55.9469, walking)!;
    const r = router.route(from, to, walking, HEAT)!;
    expect(onRoute(router, r, walking, HEAT)).toContainEqual({ group: "info", text: "Amber heat health alert for London", where: [], label: "live", source: "UKHSA", date: "2026-07-18T08:00:00Z", until: "2026-07-20T08:00:00Z" });
    expect(explain(router, r, from, to, walking, walking, HEAT).notes.some((n) => /health alert/.test(n))).toBe(false);
    const f = router.route(from, to, fatigue, HEAT)!;
    expect(onRoute(router, f, fatigue, HEAT).map((i) => i.text)).toContain("Amber heat health alert for London: we've favoured places to rest");
  });
});
