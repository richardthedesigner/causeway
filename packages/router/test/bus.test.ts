/**
 * Buses in Edinburgh: a long, hilly trip for a manual wheelchair user should
 * use a bus when one runs, price the wait by the time of day, and respect
 * the rules about who a bus can carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { addBus, type BusNetwork } from "@causeway/graph";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS, type Profile } from "@causeway/profile";
import { busWait, describeSegments, evaluateEdge, Router, type Route } from "@causeway/router";

const ROOT = join(import.meta.dirname, "../../..");
let router: Router;
let added: { stops: number; lines: number };
beforeAll(() => {
  const g = loadSnapshot(join(ROOT, "data/snapshots/edinburgh-central.graph.json.gz"));
  added = addBus(g, JSON.parse(readFileSync(join(ROOT, "data/transit/edinburgh-central/bus.json"), "utf8")) as BusNetwork);
  router = new Router(g);
});

// Tuesday 10:00 in Edinburgh (BST).
const TUE_10 = { now: new Date("2026-10-06T09:00:00Z"), wet: false, ice: false };
const FROM = { lon: -3.1812, lat: 55.9385 }; // Causewayside
const TO = { lon: -3.2085, lat: 55.958 }; // Stockbridge

const plan = (p: Profile, c = TUE_10): Route | null => router.route(router.snap(FROM.lon, FROM.lat, p), router.snap(TO.lon, TO.lat, p), p, c);
const busLegs = (r: Route | null) => (r?.steps ?? []).filter((s) => s.edge.kind === "board" && s.forward && s.edge.service?.mode === "bus");

describe("buses in Edinburgh", () => {
  it("links most stops to the pavement", () => {
    expect(added.stops).toBeGreaterThan(600);
    expect(added.lines).toBeGreaterThan(100);
  });

  it("takes a bus for a manual wheelchair user crossing the Old Town", () => {
    const r = plan(PRESETS["manual-wheelchair"]);
    expect(busLegs(r).length).toBeGreaterThan(0);
    expect(describeSegments(r!).some((t) => /Take the \S+ bus/.test(t))).toBe(true);
  });

  it("prices the wheelchair space risk for wheelchair users only", () => {
    const board = busLegs(plan(PRESETS["manual-wheelchair"]))[0]!.edge;
    const chair = evaluateEdge(board, true, PRESETS["manual-wheelchair"], TUE_10);
    const walker = evaluateEdge(board, true, PRESETS.rollator, TUE_10);
    expect(chair.reasons.some((x) => x.attr === "bus-space")).toBe(true);
    expect(walker.reasons.some((x) => x.attr === "bus-space")).toBe(false);
    expect(chair.cost).toBeGreaterThan(walker.cost);
  });

  it("leaves buses out when turned off, and for a scooter without a permit", () => {
    expect(busLegs(plan({ ...PRESETS["manual-wheelchair"], buses: false }))).toHaveLength(0);
    expect(busLegs(plan(PRESETS["mobility-scooter"]))).toHaveLength(0);
  });

  it("waits longer when buses are rarer", () => {
    const ph = { wd: Array(24).fill(0), sa: Array(24).fill(0), su: Array(24).fill(0) };
    ph.wd[10] = 6;
    ph.wd[11] = 2;
    expect(busWait(ph, TUE_10.now)!.seconds).toBe(300);
    expect(busWait(ph, new Date("2026-10-06T10:00:00Z"))!.seconds).toBe(900);
    expect(busWait(ph, new Date("2026-10-06T14:00:00Z"))).toBeNull();
  });
});
