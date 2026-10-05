/**
 * Platform to train (D-059): TfL's measured step and gap against the
 * person's limits, the staff ramp, and where the level-access doors are.
 * Figures are TfL's own (station data published 2026-08-03). Ported from the
 * overnight build (PR #36).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attr, type GraphEdge, type PlatformBoarding, type TransitNetwork } from "@causeway/graph";
import { PRESETS } from "@causeway/profile";
import { boardingReason, describeSegments, DRY, evaluateEdge, explain, levelAccessAdvice, platformFit, Router, type Route, type Step } from "@causeway/router";
import { applyStationAccess, loadSnapshot, refRides } from "@causeway/graph/node";
import { LONDON_JOURNEYS } from "../../../scripts/journeys.js";

const plat = (over: Partial<PlatformBoarding>): PlatformBoarding => ({ platform: "Northbound Platform 1", towards: [], stepMm: [0, 50], gapMm: [0, 85], ramp: false, levelAccessAt: null, ...over });
const KILBURN = [plat({ platform: "Northbound Platform 1", stepMm: [0, 140], gapMm: [0, 77], ramp: true }), plat({ platform: "Southbound Platform 2", stepMm: [0, 127], gapMm: [0, 80], ramp: true })];
const NO_RAMP = [plat({ platform: "Southbound Platform 1", stepMm: [147, 173], gapMm: [90, 100] })];

const stepFreeAttrs = { stepCount: attr(0, "reported", "tfl", null, "TfL station data: step-free from street to every platform"), wheelchair: attr("yes", "reported", "tfl", null) } as never;
const board = (platforms: PlatformBoarding[] | null, name = "Kilburn, Jubilee line"): GraphEdge =>
  ({ id: 1, from: 1, to: 2, kind: "board", ref: "board:jubilee:X", geometry: [[0, 0], [0, 0]], lengthM: 0, name, level: 0, layer: 0, bridge: false, bidirectional: true, attrs: stepFreeAttrs, ...(platforms ? { boarding: { platforms, source: "TfL station data (2026-08-03)" } } : {}) }) as GraphEdge;
const manual = PRESETS["manual-wheelchair"];

describe("platform to train", () => {
  it("treats TfL's level-access band (step to 50 mm, gap to 85 mm) as level for everyone", () => {
    expect(platformFit(plat({}), manual)).toBe("level");
    expect(evaluateEdge(board([plat({})]), true, manual, DRY)).toMatchObject({ passable: "yes" });
    expect(evaluateEdge(board([plat({})]), true, manual, DRY).cost).toBe(evaluateEdge(board(null), true, manual, DRY).cost);
  });

  it("holds measured figures to the person's limits, and counts the staff ramp as a way on, with time to ask", () => {
    expect(platformFit(KILBURN[0]!, manual)).toBe("ramp");
    const ev = evaluateEdge(board(KILBURN), true, manual, DRY);
    expect(ev.passable).toBe("yes");
    expect(ev.reasons.find((r) => r.attr === "ramp")).toMatchObject({ kind: "penalty", detail: "staff ramp onto the train: ask staff", seconds: 180 });
    expect(ev.cost - evaluateEdge(board([plat({})]), true, manual, DRY).cost).toBe(180);
  });

  it("a step beyond someone's limit with no ramp shuts the platform; on every platform, the edge", () => {
    const ev = evaluateEdge(board(NO_RAMP, "Stanmore, Jubilee line"), true, manual, DRY);
    expect(ev.passable).toBe("no");
    expect(ev.reasons.at(-1)!.detail).toBe("step up to 173 mm, gap up to 100 mm between platform and train");
  });

  it("one platform out and one fine is unknown: the edge doesn't know which way you're going", () => {
    const ev = evaluateEdge(board([...NO_RAMP, plat({ platform: "Northbound Platform 2" })]), true, manual, DRY);
    expect(ev.passable).toBe("unknown");
    expect(ev.reasons.at(-1)!.detail).toMatch(/Southbound Platform 1/);
    expect(ev.reasons.at(-1)!.seconds).toBeCloseTo(900 * (1 - manual.uncertaintyTolerance));
  });

  it("missing figures are unknown, never level", () => {
    expect(platformFit(plat({ stepMm: null, gapMm: null }), manual)).toBe("unknown");
    expect(platformFit(plat({ stepMm: [0, 40], gapMm: null }), manual)).toBe("unknown");
    const ev = evaluateEdge(board([plat({ stepMm: null, gapMm: null })]), true, manual, DRY);
    expect(ev.passable).toBe("unknown");
    expect(ev.reasons.at(-1)!.detail).toBe("TfL doesn't publish the step and gap to the train on Northbound Platform 1");
    // With a staff ramp listed, the ramp is the way on.
    expect(platformFit(plat({ stepMm: null, gapMm: null, ramp: true }), manual)).toBe("ramp");
  });

  it("a larger kerb limit takes a measured step; a gap limit can be set", () => {
    const fig = plat({ stepMm: [0, 60], gapMm: [0, 100] });
    expect(platformFit(fig, { ...PRESETS["mobility-scooter-road"], maxKerbCm: 7 })).toBe("part");
    expect(platformFit(fig, { ...PRESETS["mobility-scooter-road"], maxKerbCm: 7, maxGapMm: 100 })).toBe("fits");
  });

  it("level-access doors where the figures are beyond the limit count as a way on", () => {
    expect(platformFit(plat({ stepMm: [0, 140], gapMm: [0, 77], levelAccessAt: "2 centre doors on cars 5 and 6" }), manual)).toBe("doors");
    expect(boardingReason([plat({ stepMm: [0, 140], gapMm: [0, 77], levelAccessAt: "2 centre doors on cars 5 and 6" })], manual)).toBeNull();
  });

  it("doesn't judge people who can manage a step", () => {
    expect(evaluateEdge(board(NO_RAMP, "Stanmore, Jubilee line"), true, PRESETS.walking, DRY).passable).toBe("yes");
  });
});

describe("level-access doors in directions", () => {
  const edge = (kind: GraphEdge["kind"], name: string, geometry: [number, number][], platforms?: PlatformBoarding[]): GraphEdge =>
    ({ id: 1, from: 1, to: 2, kind, geometry, lengthM: 100, name, level: 0, layer: 0, bridge: false, bidirectional: true, attrs: stepFreeAttrs, ...(platforms ? { boarding: { platforms, source: "TfL" } } : {}) }) as GraphEdge;
  const step = (e: GraphEdge, forward: boolean) => ({ edge: e, forward }) as Step;
  // Kingsbury's own figures: level, with TfL's designated level access doors.
  const KINGSBURY = [plat({ platform: "Northbound Platform 1", levelAccessAt: "2 centre doors on cars 5 and 6" }), plat({ platform: "Southbound Platform 2", levelAccessAt: "2 centre doors on cars 2 and 3" })];

  it("names the doors on the platform the ride leaves from, picked by direction", () => {
    const north = [step(edge("board", "Kingsbury, Jubilee line", [[-0.279, 51.585]], KINGSBURY), true), step(edge("transit", "Jubilee line", [[-0.279, 51.585], [-0.285, 51.6]]), true), step(edge("board", "Queensbury, Jubilee line", [[-0.285, 51.6]]), false)];
    expect(levelAccessAdvice(north, 0)).toBe("For level access, board at the 2 centre doors on cars 5 and 6.");
  });

  it("says where to be on the train to get off level", () => {
    const south = [step(edge("board", "Queensbury, Jubilee line", [[-0.285, 51.6]]), true), step(edge("transit", "Jubilee line", [[-0.285, 51.6], [-0.279, 51.585]]), true), step(edge("board", "Kingsbury, Jubilee line", [[-0.279, 51.585]], KINGSBURY), false)];
    expect(levelAccessAdvice(south, 0)).toBe("To get off level at Kingsbury, be at the 2 centre doors on cars 2 and 3.");
  });

  it("says nothing when TfL names no doors", () => {
    const s = [step(edge("board", "Westminster, Jubilee line", [[0, 0]], [plat({})]), true), step(edge("transit", "Jubilee line", [[0, 0], [0.01, 0]]), true), step(edge("board", "Waterloo, Jubilee line", [[0.01, 0]], [plat({})]), false)];
    expect(levelAccessAdvice(s, 0)).toBeNull();
  });

  it("goes into the spoken route only for someone who needs step-free access", () => {
    const north = [step(edge("board", "Kingsbury, Jubilee line", [[-0.279, 51.585]], KINGSBURY), true), step(edge("transit", "Jubilee line", [[-0.279, 51.585], [-0.285, 51.6]]), true), step(edge("board", "Queensbury, Jubilee line", [[-0.285, 51.6]]), false)];
    const r = { steps: north.map((s) => ({ ...s, node: { id: 0, lon: 0, lat: 0, level: 0, attrs: {} }, eval: { passable: "yes", seconds: 0, cost: 0, reasons: [] } })), cost: 0, seconds: 0, lengthM: 0 } as unknown as Route;
    expect(describeSegments(r, manual).join(" ")).toContain("For level access, board at the 2 centre doors on cars 5 and 6.");
    expect(describeSegments(r, PRESETS.walking).join(" ")).not.toContain("level access");
    expect(describeSegments(r).join(" ")).not.toContain("level access");
  });
});

describe("TfL's figures on the London graph", () => {
  const ROOT = join(import.meta.dirname, "../../..");
  const net = JSON.parse(readFileSync(join(ROOT, "data/transit/london/network.json"), "utf8")) as TransitNetwork;

  it("puts every platform's figures on the board edges when the city loads", () => {
    const g = loadSnapshot(join(ROOT, "data/snapshots/london-jubilee.graph.json.gz"));
    applyStationAccess(g, net);
    const wsm = g.edges.find((e) => e.ref === "board:jubilee:940GZZLUWSM")!;
    expect(wsm.boarding?.platforms.map((b) => [b.platform, b.stepMm, b.gapMm])).toEqual([
      ["Eastbound Platform 3", [0, 50], [0, 85]],
      ["Westbound Platform 4", [0, 50], [0, 85]],
    ]);
    // Westminster's Jubilee line is level: a wheelchair user pays nothing to board.
    expect(evaluateEdge(wsm, true, manual, DRY).reasons.some((r) => r.attr === "boarding" || r.attr === "ramp")).toBe(false);
  });

  it("Parliament Square to Canary Wharf by wheelchair still goes by the Jubilee line, with no boarding doubt", () => {
    const g = loadSnapshot(join(ROOT, "data/snapshots/london-jubilee.graph.json.gz"));
    applyStationAccess(g, net);
    refRides(g);
    const j = LONDON_JOURNEYS[0]!;
    const r = new Router(g);
    const a = r.snap(j.from.lon, j.from.lat, manual, DRY);
    const b = r.snap(j.to.lon, j.to.lat, manual, DRY);
    const route = r.route(a, b, manual, DRY)!;
    expect(route.steps.some((s) => s.edge.kind === "board" && s.eval.reasons.some((x) => x.attr === "boarding"))).toBe(false);
    expect(explain(r, route, a, b, manual, PRESETS.walking, DRY).notes.some((n) => /TfL station data/.test(n))).toBe(false);
  });

  it("says which platform TfL publishes no figures for, and when to ask for the ramp", () => {
    const g = loadSnapshot(join(ROOT, "data/snapshots/london-jubilee.graph.json.gz"));
    applyStationAccess(g, net);
    refRides(g);
    const cyf = g.edges.find((e) => e.ref === "board:jubilee:940GZZLUCYF")!;
    const j = LONDON_JOURNEYS[0]!;
    const notesWith = (platforms: PlatformBoarding[]) => {
      cyf.boarding = { platforms, source: "TfL station data (2026-08-03)" };
      const r = new Router(g);
      const a = r.snap(j.from.lon, j.from.lat, manual, DRY);
      const b = r.snap(j.to.lon, j.to.lat, manual, DRY);
      return explain(r, r.route(a, b, manual, DRY)!, a, b, manual, PRESETS.walking, DRY).notes;
    };
    expect(notesWith([plat({ platform: "Westbound Platform 1", stepMm: null, gapMm: null })])).toContain(
      "Canary Wharf, Jubilee line: TfL doesn't publish the step and gap to the train on Westbound Platform 1 (TfL station data). Check before you travel.",
    );
    expect(notesWith(KILBURN)).toContain("Canary Wharf, Jubilee line: board with the staff ramp, so ask staff (TfL station data).");
  });
});
