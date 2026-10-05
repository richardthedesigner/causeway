/**
 * "On this route" (D-067): what a route went round, what's on it that may
 * slow you, and what's worth knowing, each with its label, source and date.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyCouncilFootways, loadSnapshot, type CouncilFootways, type GraphEdge, type GraphNode, type LiveState } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { anythingClosed, closureBlind, DRY, evaluateEdge, evaluateNode, explain, onRoute, Router, type Conditions, type Route } from "@causeway/router";
import { EDINBURGH_CENTRAL_JOURNEYS } from "../../../scripts/journeys.js";
import { blockedLine } from "../../../apps/web/src/lib/on-route.js";

const ROOT = join(import.meta.dirname, "../../..");
const walking = PRESETS.walking;
const chair = PRESETS["manual-wheelchair"];
const j = EDINBURGH_CENTRAL_JOURNEYS.find((x) => x.id === "causewayside-museum")!;
const DAY: Conditions = { ...DRY, now: new Date("2026-10-05T12:00:00Z") };
const closed = (reason: string, source = "TfL road disruptions"): LiveState => ({ status: "closed", reason, source, validFrom: "2026-10-05T00:00:00Z", validUntil: "2026-10-06T00:00:00Z" });

let router: Router;
let a: GraphNode;
let b: GraphNode;
let base: Route;

beforeAll(() => {
  const g = loadSnapshot(join(ROOT, "data/snapshots/edinburgh-central.graph.json.gz"));
  applyCouncilFootways(g, JSON.parse(readFileSync(join(ROOT, "data/council/edinburgh-central.footways.json"), "utf8")) as CouncilFootways);
  router = new Router(g);
  a = router.snap(j.from.lon, j.from.lat, walking, DAY);
  b = router.snap(j.to.lon, j.to.lat, walking, DAY);
  base = router.route(a, b, walking, DAY)!;
});

/** Plan as the app does: explanation, the closure-blind route once, then the list. */
function plan(c: Conditions = DAY) {
  const route = router.route(a, b, walking, c)!;
  const ex = explain(router, route, a, b, walking, walking, c);
  const items = onRoute(router, route, walking, c, { avoided: ex.avoided, blind: closureBlind(router, a, b, walking, c) });
  return { route, items };
}

describe("Blocked: only what the route went round", () => {
  it("lists a closure on the way it would have gone, once, labelled live, with where", () => {
    // Close a middle stretch of the route on its own: the route goes round it.
    const target = base.steps.find((s, i) => i > base.steps.length / 3 && s.edge.name && !s.edge.nameInferred && s.edge.kind !== "crossing")!.edge;
    target.live = closed("burst water main");
    try {
      const { route, items } = plan();
      expect(route.steps.some((s) => s.edge.id === target.id)).toBe(false);
      const blocked = items.filter((i) => i.group === "blocked");
      expect(blocked).toEqual([{ group: "blocked", text: "Closed: burst water main", where: [target.name], label: "live", source: "TfL road disruptions", date: "2026-10-05T00:00:00Z", until: "2026-10-06T00:00:00Z" }]);
      expect(blockedLine(items)).toBe("Goes round a closure on the way. See On this route.");
      // A closure for step-free travel only doesn't block someone walking.
      target.live = { ...closed("lift out"), affects: "step-free" };
      expect(plan().items.some((i) => i.group === "blocked")).toBe(false);
    } finally {
      delete target.live;
    }
  });

  it("a closed side edge that leaves the route unchanged is not listed (the fix in PR #36)", () => {
    const onIds = new Set(base.steps.map((s) => s.edge.id));
    const sides = [...new Set(base.steps.flatMap((s) => (router.out.get(s.node.id) ?? []).map((x) => x.edge)))].filter((e) => !onIds.has(e.id));
    let checked = 0;
    for (const side of sides.slice(0, 8)) {
      side.live = closed("Closed for works", "Scottish Road Works Register");
      try {
        const { route, items } = plan();
        if (route.steps.map((s) => s.edge.id).join() !== base.steps.map((s) => s.edge.id).join()) continue;
        expect(items.some((i) => i.group === "blocked")).toBe(false);
        expect(blockedLine(items)).toBeNull();
        checked++;
      } finally {
        delete side.live;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("makes the closure-blind search only when something is closed, and at most once a plan", () => {
    expect(anythingClosed(router, walking, DAY)).toBe(false);
    const spy = vi.spyOn(router, "route");
    try {
      expect(closureBlind(router, a, b, walking, DAY)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      const e = base.steps[3]!.edge;
      e.live = closed("closed");
      try {
        expect(closureBlind(router, a, b, walking, DAY)).not.toBeNull();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0]![3]).toMatchObject({ ignoreClosures: true });
        // A closure that has ended, or not begun, costs nothing.
        expect(closureBlind(router, a, b, walking, { ...DAY, now: new Date("2026-10-07T12:00:00Z") })).toBeNull();
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        delete e.live;
      }
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Slower and worth knowing: what's on the route", () => {
  it("works on the pavement from a register: Slower, static data, dated, with the end date", () => {
    const e = base.steps.find((s) => s.edge.kind === "sidewalk" || s.edge.kind === "footway")!.edge;
    e.live = { status: "degraded", headline: "Café tables on the pavement", reason: "Street café licence on Causewayside until 2026-11-30", source: "Scottish Road Works Register", validFrom: "2026-04-01T00:00:00Z", validUntil: "2026-11-30T00:00:00Z" };
    try {
      const items = onRoute(router, base, walking, DAY, { readAt: { "Scottish Road Works Register": "2026-10-04T06:00:00Z" } });
      expect(items.find((i) => i.group === "slower")).toEqual({ group: "slower", text: "Café tables on the pavement: Street café licence on Causewayside", where: [expect.any(String)], label: "static", source: "Scottish Road Works Register", date: "2026-10-04T06:00:00Z", until: "2026-11-30T00:00:00Z" });
    } finally {
      delete e.live;
    }
  });

  it("the council's setts are Slower where they add a fifth or more for this person, not for someone walking", () => {
    const e = router.graph.edges.find((x) => x.attrs.surface.source === "council" && x.attrs.surface.value === "sett" && x.bidirectional && x.lengthM > 10 && (x.kind === "sidewalk" || x.kind === "footway" || x.kind === "street_proxy"))!;
    expect(e).toBeDefined();
    const one = (p: typeof walking): Route => {
      const node = router.nodes.get(e.to)!;
      const ev = evaluateEdge(e, true, p, DAY);
      return { steps: [{ edge: e, forward: true, eval: ev, node, nodeEval: evaluateNode(node, false, p, DAY) }], cost: ev.cost, seconds: ev.seconds, lengthM: e.lengthM };
    };
    expect(onRoute(router, one(chair), chair, DAY)).toContainEqual({ group: "slower", text: "Setts on the pavement", where: [expect.any(String)], label: "static", source: "City of Edinburgh Council, Adopted Roads (List of Public Roads)", date: "2026-10-01", until: null });
    expect(onRoute(router, one(walking), walking, DAY).some((i) => i.text === "Setts on the pavement")).toBe(false);
  });

  it("lighting after dark only for people who asked; unmapped stretches for everyone", () => {
    const dark = { ...DAY, dark: true };
    const lit = { ...walking, litAfterDarkPer100mS: 60 };
    expect(onRoute(router, base, walking, dark).some((i) => i.text.startsWith("After dark"))).toBe(false);
    const route = router.route(a, b, lit, dark)!;
    const items = onRoute(router, route, lit, dark);
    if (route.steps.some((s) => s.edge.attrs.lit.value !== true && s.edge.kind !== "crossing")) expect(items.some((i) => i.text.startsWith("After dark") && i.source === "OpenStreetMap" && i.label === "static")).toBe(true);
  });

  it("TfL's informational station messages, for routes through that station, for everyone", () => {
    const fake: GraphEdge = { ...base.steps[0]!.edge, kind: "station_link", ref: "link:940GZZLUCYF" };
    const r: Route = { ...base, steps: [{ ...base.steps[0]!, edge: fake }] };
    const notes = new Map([["940GZZLUCYF", [{ message: "Reduced escalator service at Canary Wharf.", at: "2026-10-05T11:55:00Z", validFrom: "2026-10-05T11:55:00Z", validUntil: "2026-10-05T12:25:00Z" }]]]);
    expect(onRoute(router, r, walking, DAY, { stationNotes: notes })).toContainEqual({ group: "info", text: "Reduced escalator service at Canary Wharf.", where: [], label: "live", source: "TfL", date: "2026-10-05T11:55:00Z", until: null });
    expect(onRoute(router, base, walking, DAY, { stationNotes: notes }).some((i) => /escalator/.test(i.text))).toBe(false);
  });

  it("in ice, how much of the route is on the council's gritting routes, with their date", () => {
    const ice = { ...DAY, ice: true };
    const route = router.route(a, b, walking, ice)!;
    const g = onRoute(router, route, walking, ice).find((i) => i.text.startsWith("Icy:"));
    expect(g).toMatchObject({ group: "info", label: "static", source: "City of Edinburgh Council, Gritting Routes (pavements, priority 1)", date: "2021-05-27" });
    expect(onRoute(router, base, walking, DAY).some((i) => i.text.startsWith("Icy:"))).toBe(false);
  });
});
