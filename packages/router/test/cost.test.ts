import { describe, expect, it } from "vitest";
import { attr, unknownAttr, type EdgeAttrs, type EntranceInfo, type GraphEdge, type GraphNode } from "@causeway/graph";
import { PRESETS } from "@causeway/profile";
import { DRY, entranceVerdict, evaluateEdge, evaluateNode } from "@causeway/router";

const baseAttrs = (): EdgeAttrs => ({
  incline: attr(0, "inferred", "lidar-scotland", "2022-01-01T00:00:00Z"),
  inclineMax: attr(0, "inferred", "lidar-scotland", "2022-01-01T00:00:00Z"),
  crossSlope: attr(1, "inferred", "lidar-scotland", "2022-01-01T00:00:00Z"),
  surface: attr("asphalt", "reported", "osm", "2024-01-01T00:00:00Z"),
  smoothness: unknownAttr(),
  width: attr(2, "reported", "osm", "2024-01-01T00:00:00Z"),
  stepCount: attr(0, "inferred", "derived", null),
  handrail: unknownAttr(),
  lit: unknownAttr(),
  covered: unknownAttr(),
  wheelchair: unknownAttr(),
});

const edge = (over: Partial<GraphEdge> = {}, attrs: Partial<EdgeAttrs> = {}): GraphEdge => ({
  id: 1,
  from: 1,
  to: 2,
  kind: "sidewalk",
  geometry: [[0, 0], [0, 0.001]],
  lengthM: 100,
  name: "Test Street",
  level: 0,
  layer: 0,
  bridge: false,
  bidirectional: true,
  attrs: { ...baseAttrs(), ...attrs },
  ...over,
});

const manual = PRESETS["manual-wheelchair"];
const walking = PRESETS.walking;

describe("evaluateEdge", () => {
  it("excludes steps for anyone who cannot use them, and only them", () => {
    const steps = edge({ kind: "steps" }, { stepCount: attr(12, "reported", "osm", null) });
    expect(evaluateEdge(steps, true, manual, DRY).passable).toBe("no");
    expect(evaluateEdge(steps, true, walking, DRY).passable).toBe("yes");
  });

  it("treats gradient as directional", () => {
    const hill = edge({}, { incline: attr(7, "inferred", "lidar-scotland", null), inclineMax: attr(7, "inferred", "lidar-scotland", null) });
    const q = { ...manual, maxInclineUpPct: 6, maxInclineDownPct: 8 };
    expect(evaluateEdge(hill, true, q, DRY).passable).toBe("no"); // 7% up > 6%
    expect(evaluateEdge(hill, false, q, DRY).passable).toBe("yes"); // 7% down < 8%
  });

  it("excludes on the steepest window, not the average", () => {
    const pinch = edge({}, { incline: attr(4, "inferred", "lidar-scotland", null), inclineMax: attr(11, "inferred", "lidar-scotland", null) });
    const ev = evaluateEdge(pinch, true, manual, DRY);
    expect(ev.passable).toBe("no");
    expect(ev.reasons.at(-1)?.detail).toBe("11.0% uphill");
  });

  it("charges cautious users more for the unknown", () => {
    const unknown = edge({}, { incline: unknownAttr(), inclineMax: unknownAttr() });
    const cautious = evaluateEdge(unknown, true, { ...manual, uncertaintyTolerance: 0 }, DRY);
    const relaxed = evaluateEdge(unknown, true, { ...manual, uncertaintyTolerance: 1 }, DRY);
    expect(cautious.passable).toBe("unknown");
    expect(cautious.cost).toBeGreaterThan(relaxed.cost);
  });

  it("never calls an unknown passable", () => {
    const proxy = edge({ kind: "street_proxy" });
    expect(evaluateEdge(proxy, true, manual, DRY).passable).toBe("unknown");
  });

  it("makes wet setts worse for a manual chair", () => {
    const setts = edge({}, { surface: attr("sett", "reported", "osm", null) });
    const dry = evaluateEdge(setts, true, manual, DRY).cost;
    const wet = evaluateEdge(setts, true, manual, { ...DRY, wet: true }).cost;
    expect(wet).toBeGreaterThan(dry);
  });

  it("honours a live closure until it expires", () => {
    const closed = edge({ live: { status: "closed", reason: "hoarding", source: "test", validFrom: "2026-10-01T00:00:00Z", validUntil: "2026-10-10T00:00:00Z" } });
    expect(evaluateEdge(closed, true, walking, DRY).passable).toBe("no");
    expect(evaluateEdge(closed, true, walking, { ...DRY, now: new Date("2026-11-01T00:00:00Z") }).passable).toBe("yes");
  });
});

describe("evaluateNode", () => {
  const node = (kerb?: GraphNode["kerb"]): GraphNode => ({ id: 1, lon: 0, lat: 0, ele: unknownAttr(), level: 0, kind: kerb ? "kerb" : "junction", ...(kerb ? { kerb } : {}) });

  it("blocks a raised kerb for a manual chair but not for walking", () => {
    const raised = node({ type: attr("raised", "reported", "osm", null), heightCm: unknownAttr(), tactilePaving: unknownAttr() });
    expect(evaluateNode(raised, true, manual, DRY).passable).toBe("no");
    expect(evaluateNode(raised, true, walking, DRY).passable).toBe("yes");
  });

  it("flags an unmapped kerb at a crossing as unknown, not fine", () => {
    expect(evaluateNode(node(), true, manual, DRY).passable).toBe("unknown");
  });
});

describe("entranceVerdict", () => {
  const en = (over: Partial<EntranceInfo> = {}): EntranceInfo => ({
    entrance: attr("main", "reported", "osm", null),
    door: unknownAttr(),
    automatic: unknownAttr(),
    widthM: unknownAttr(),
    stepCount: unknownAttr(),
    wheelchair: unknownAttr(),
    ramp: unknownAttr(),
    ...over,
  });

  it("never calls an entrance accessible when the step is unknown", () => {
    const v = entranceVerdict(en({ automatic: attr("motion", "reported", "osm", null) }), manual);
    expect(v.passable).toBe("unknown");
    expect(v.detail).toMatch(/automatic door/);
  });
  it("is step-free with an automatic door", () => {
    const v = entranceVerdict(en({ automatic: attr("yes", "reported", "osm", null), stepCount: attr(0, "reported", "osm", null) }), manual);
    expect(v).toEqual({ passable: "yes", detail: "automatic door, step-free" });
  });
  it("rules out a manual revolving door for a wheelchair, not for walking", () => {
    const revolving = en({ door: attr("revolving", "reported", "osm", null), stepCount: attr(0, "reported", "osm", null) });
    expect(entranceVerdict(revolving, manual).passable).toBe("no");
    expect(entranceVerdict(revolving, walking).passable).toBe("yes");
  });
  it("respects the user's step limit", () => {
    const twoSteps = en({ stepCount: attr(2, "reported", "osm", null) });
    expect(entranceVerdict(twoSteps, manual).passable).toBe("no");
    expect(entranceVerdict(twoSteps, PRESETS["walking-stick"]).passable).not.toBe("no");
  });
});

describe("learnPace", () => {
  it("moves towards the observed pace, more at first, and ignores nonsense", async () => {
    const { learnPace } = await import("@causeway/profile");
    const p = { ...manual, speedMps: 1.0, paceSamples: 0 };
    const once = learnPace(p, 0.7);
    expect(once.speedMps).toBeLessThan(1.0);
    expect(once.speedMps).toBeGreaterThan(0.7);
    expect(once.paceSamples).toBe(1);
    expect(learnPace(p, 12).speedMps).toBe(1.0); // a bus ride is not a pace
  });
});

describe("notes in the cost model", () => {
  const unknownSurface = { surface: unknownAttr<never>() } as Partial<EdgeAttrs>;

  it("adds a capped soft penalty for bad notes and never excludes", () => {
    const plain = evaluateEdge(edge(), true, manual, DRY);
    const bad = evaluateEdge(edge(), true, manual, DRY, { note: { score: -2, count: 3 } });
    expect(bad.cost).toBeGreaterThan(plain.cost);
    expect(bad.cost).toBeLessThanOrEqual(plain.cost + plain.seconds * 0.5 + 1e-9);
    expect(bad.passable).toBe("yes");
    expect(bad.reasons.some((r) => r.attr === "note" && r.kind === "penalty")).toBe(true);
  });

  it("lets good notes ease the unknown risk but never the travel time or the verdict", () => {
    const plain = evaluateEdge(edge({}, unknownSurface), true, manual, DRY);
    const good = evaluateEdge(edge({}, unknownSurface), true, manual, DRY, { note: { score: 2, count: 3 } });
    expect(good.cost).toBeLessThan(plain.cost);
    expect(good.cost).toBeGreaterThanOrEqual(good.seconds);
    expect(good.passable).toBe(plain.passable);
    // Nothing unknown on a known edge: a good note changes nothing.
    expect(evaluateEdge(edge(), true, manual, DRY, { note: { score: 2, count: 1 } }).cost).toBe(evaluateEdge(edge(), true, manual, DRY).cost);
  });

  it("does not lift an exclusion, however good the notes", () => {
    const steep = edge({}, { incline: attr(12, "inferred", "lidar-scotland", "2022-01-01T00:00:00Z"), inclineMax: attr(12, "inferred", "lidar-scotland", "2022-01-01T00:00:00Z") });
    expect(evaluateEdge(steep, true, manual, DRY, { note: { score: 2, count: 9 } }).cost).toBe(Infinity);
  });
});
