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
  it("a narrow council width costs time and never closes the pavement (D-046)", () => {
    const council = evaluateEdge(edge({}, { width: attr(0.7, "inferred", "council", "2026-10-04") }), true, manual, DRY);
    expect(council.cost).toBeLessThan(Infinity);
    expect(council.reasons.some((r) => r.attr === "width" && r.kind === "penalty")).toBe(true);
    expect(evaluateEdge(edge({}, { width: attr(0.7, "reported", "osm", "2024-01-01T00:00:00Z") }), true, manual, DRY).cost).toBe(Infinity);
  });

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

describe("a lift out that may have cut off some of a line's platforms (D-058)", () => {
  const at = { ...DRY, now: new Date("2026-10-04T12:05:00Z") };
  const live = { status: "restricted" as const, affects: "step-free" as const, headline: "Lift out of service: step-free to some platforms only", reason: "Lift 1 out of service", source: "TfL Unified API lift disruptions", validFrom: "2026-10-04T12:00:00Z", validUntil: "2026-10-04T12:15:00Z" };
  const stepFree = { stepCount: attr(0, "reported", "tfl", null, "TfL station data: step-free from street to every platform"), wheelchair: attr("yes" as const, "reported", "tfl", null) };
  const open = edge({ kind: "board", ref: "board:jubilee:940GZZLUNGW", name: "North Greenwich, Jubilee line", lengthM: 0 }, stepFree);
  const link = edge({ kind: "station_link", ref: "link:940GZZLUNGW", name: "North Greenwich", lengthM: 30 });

  it("costs a cautious wheelchair user the unknown-station penalty on a board edge, and leaves it passable but unknown", () => {
    const a = evaluateEdge(open, true, manual, at);
    const b = evaluateEdge({ ...open, live }, true, manual, at);
    expect(b.passable).toBe("unknown");
    expect(b.cost - a.cost).toBeCloseTo(900 * (1 - manual.uncertaintyTolerance));
    expect(b.reasons.find((r) => r.attr === "live")).toMatchObject({ kind: "unknown", detail: "Lift out of service: step-free to some platforms only: Lift 1 out of service" });
  });

  it("costs the same on a street link", () => {
    const a = evaluateEdge(link, true, manual, at);
    const b = evaluateEdge({ ...link, live }, true, manual, at);
    expect(b.passable).toBe("unknown");
    expect(b.cost - a.cost).toBeCloseTo(900 * (1 - manual.uncertaintyTolerance));
  });

  it("costs nothing extra for someone who doesn't need step-free access", () => {
    expect(evaluateEdge({ ...open, live }, true, walking, at).cost).toBe(evaluateEdge(open, true, walking, at).cost);
  });

  it("doesn't charge twice where the station was unconfirmed already", () => {
    const unconfirmed = edge({ kind: "board", lengthM: 0 }, { stepCount: unknownAttr() });
    const a = evaluateEdge(unconfirmed, true, manual, at);
    const b = evaluateEdge({ ...unconfirmed, live }, true, manual, at);
    expect(b.cost).toBeCloseTo(a.cost);
  });

  it("a restricted pavement (works) still costs no station penalty", () => {
    const works = { ...live, affects: undefined, headline: "Works on the pavement", reason: "Works on the pavement on Test Street" };
    expect(evaluateEdge(edge({ live: works }), true, manual, at).cost).toBeCloseTo(evaluateEdge(edge(), true, manual, at).cost);
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

  it("holds a manual chair to Inclusive Mobility's flush band, 0 to 6 mm (D-054)", () => {
    expect(PRESETS["manual-wheelchair"].maxKerbCm).toBe(0.6);
    const lowered = (h: number | null) => node({ type: attr("lowered", "reported", "osm", null), heightCm: h === null ? unknownAttr() : attr(h, "reported", "osm", null), tactilePaving: unknownAttr() });
    // A dropped kerb with no height is taken at 6 mm: fine for a manual chair, not for "flush only".
    expect(evaluateNode(lowered(null), true, manual, DRY).passable).toBe("yes");
    expect(evaluateNode(lowered(null), true, { ...manual, maxKerbCm: 0 }, DRY).passable).toBe("no");
    // A measured 2 cm upstand is over the band.
    expect(evaluateNode(lowered(2), true, manual, DRY).passable).toBe("no");
    expect(evaluateNode(lowered(0.5), true, manual, DRY).passable).toBe("yes");
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

describe("powerchair and scooter classes", () => {
  const light = PRESETS["powerchair-light"];
  const heavy = PRESETS.powerchair;
  const road = PRESETS["mobility-scooter-road"];
  const pavementScooter = PRESETS["mobility-scooter"];

  it("a lightweight powerchair manages less than a heavy duty one", () => {
    const cobbles = edge({}, { surface: attr("cobblestone", "reported", "osm", null) });
    expect(evaluateEdge(cobbles, true, light, DRY).passable).toBe("no");
    expect(evaluateEdge(cobbles, true, heavy, DRY).passable).toBe("yes");
    const hill = edge({}, { incline: attr(10, "inferred", "lidar-scotland", null), inclineMax: attr(10, "inferred", "lidar-scotland", null) });
    expect(evaluateEdge(hill, true, light, DRY).passable).toBe("no");
    expect(evaluateEdge(hill, true, heavy, DRY).passable).toBe("yes");
  });

  it("a road scooter takes a street with no pavement, or an unmapped one, in its stride", () => {
    const noPavement = edge({ kind: "street_proxy" }, { pavement: attr("no", "reported", "osm", null) });
    expect(evaluateEdge(noPavement, true, road, DRY).cost).toBeLessThan(evaluateEdge(noPavement, true, pavementScooter, DRY).cost);
    const unmapped = edge({ kind: "street_proxy" });
    expect(evaluateEdge(unmapped, true, road, DRY).reasons.some((r) => r.attr === "pavement")).toBe(false);
    expect(evaluateEdge(unmapped, true, pavementScooter, DRY).reasons.some((r) => r.attr === "pavement")).toBe(true);
  });
});

describe("ice and gritting (DATA-07)", () => {
  const ice = { ...DRY, wet: true, ice: true };
  const gritted = (v: boolean) => ({ gritted: attr(v, "reported", "council", "2026-10-04") });

  it("in ice, a pavement off the gritting routes costs more than one on them, most for wheels", () => {
    const on = evaluateEdge(edge({}, gritted(true)), true, manual, ice);
    const off = evaluateEdge(edge({}, gritted(false)), true, manual, ice);
    expect(off.cost).toBeGreaterThan(on.cost);
    expect(off.reasons.some((r) => r.attr === "gritted" && /not on a gritting route/.test(r.detail))).toBe(true);
    expect(on.reasons.some((r) => r.attr === "gritted" && r.detail === "on a gritting route")).toBe(true);
    const walkOff = evaluateEdge(edge({}, gritted(false)), true, walking, ice);
    const walkOn = evaluateEdge(edge({}, gritted(true)), true, walking, ice);
    expect(walkOff.cost - walkOn.cost).toBeLessThan(off.cost - on.cost);
  });

  it("changes nothing without ice, or where there's no gritting data", () => {
    expect(evaluateEdge(edge({}, gritted(false)), true, manual, DRY).cost).toBe(evaluateEdge(edge({}, gritted(true)), true, manual, DRY).cost);
    expect(evaluateEdge(edge(), true, manual, ice).reasons.some((r) => r.attr === "gritted")).toBe(false);
  });
});
