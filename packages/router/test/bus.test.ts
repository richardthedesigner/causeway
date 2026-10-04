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
    const walker = evaluateEdge(board, true, PRESETS.pram, TUE_10);
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

describe("waiting at the stop", () => {
  const ph = { wd: Array(24).fill(2), sa: Array(24).fill(2), su: Array(24).fill(2) };
  const edge = (stop: Record<string, unknown>) =>
    ({ id: 1, from: 1, to: 2, kind: "board", geometry: [], lengthM: 0, name: "Stop, 8 bus", level: 0, layer: 0, bridge: false, bidirectional: true, attrs: {} as never, service: { mode: "bus", route: "8", headsign: null, operator: null, perHour: ph, stop } }) as never;

  it("costs more without a seat for someone who needs rests, and says so", () => {
    const p = PRESETS.fatigue;
    const seat = evaluateEdge(edge({ bench: true }), true, p, TUE_10);
    const none = evaluateEdge(edge({ bench: false }), true, p, TUE_10);
    expect(none.cost).toBeGreaterThan(seat.cost);
    expect(none.reasons.find((r) => r.attr === "bus-seat")?.detail).toBe("no seat at the stop");
  });

  it("costs more in the rain without a shelter", () => {
    const wet = { ...TUE_10, wet: true };
    expect(evaluateEdge(edge({ shelter: false }), true, PRESETS.walking, wet).cost).toBeGreaterThan(evaluateEdge(edge({ shelter: true }), true, PRESETS.walking, wet).cost);
  });
});

describe("trams and the Metro", () => {
  const ph = { wd: Array(24).fill(6), sa: Array(24).fill(6), su: Array(24).fill(6) };
  const board = (mode: "tram" | "metro", station: string) =>
    ({ id: 1, from: 1, to: 2, kind: "board", geometry: [], lengthM: 0, name: `${station}, Metro Green line`, level: 0, layer: 0, bridge: false, bidirectional: true, attrs: {} as never, service: { mode, route: "GRN", headsign: null, operator: null, perHour: ph } }) as never;

  it("never calls an underground Metro station step-free without lift status", () => {
    const e = evaluateEdge(board("metro", "Monument"), true, PRESETS["manual-wheelchair"], TUE_10);
    expect(e.passable).toBe("unknown");
    expect(e.reasons.some((r) => /by lift/.test(r.detail))).toBe(true);
    expect(evaluateEdge(board("metro", "Monument"), true, PRESETS.walking, TUE_10).passable).toBe("yes");
  });

  it("keeps trams when buses are turned off, and asks scooter users to check", () => {
    const tram = evaluateEdge(board("tram", "Princes Street"), true, { ...PRESETS["manual-wheelchair"], buses: false }, TUE_10);
    expect(tram.passable).toBe("yes");
    expect(evaluateEdge(board("tram", "Princes Street"), true, PRESETS["mobility-scooter"], TUE_10).passable).toBe("unknown");
  });
});

describe("Newcastle: out of Gateshead Interchange (issue #7)", () => {
  it("reaches Jackson Street from the Metro on foot, and takes the Metro from Central Station", () => {
    const g = loadSnapshot(join(ROOT, "data/snapshots/newcastle-gateshead.graph.json.gz"));
    addBus(g, JSON.parse(readFileSync(join(ROOT, "data/transit/newcastle-gateshead/bus.json"), "utf8")) as BusNetwork);
    const r = new Router(g);
    const p = { ...PRESETS.walking, buses: false };
    const route = r.route(r.snap(-1.617, 54.9689, p), r.snap(-1.6025, 54.9617, p), p, TUE_10)!;
    expect(describeSegments(route).some((t) => /Metro/.test(t))).toBe(true);
    expect(route.seconds / 60).toBeLessThan(20);
  });
});
