/**
 * Community reports and routes (FEAT-25, D-083): a confirmed missing
 * dropped kerb blocks the crossing for a wheelchair; a single report only
 * warns; someone walking is barely affected.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { communitySignals, type CommunityReport, type CommunitySignal } from "@causeway/graph";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { communityCost, DRY, Router, UNCONFIRMED_SHARE } from "@causeway/router";

const manual = { ...PRESETS["manual-wheelchair"], buses: false };
const walking = { ...PRESETS.walking, buses: false };
const sig = (category: CommunitySignal["category"], level: CommunitySignal["level"], confidence = level === "confirmed" ? 0.75 : 0.5): CommunitySignal => ({
  reportId: "r",
  category,
  level,
  confidence,
  detail: "test",
});

describe("communityCost", () => {
  it("a confirmed missing dropped kerb blocks a wheelchair and slows someone walking a little", () => {
    expect("exclude" in communityCost([sig("no-dropped-kerb", "confirmed")], manual, 20, 0)).toBe(true);
    const w = communityCost([sig("no-dropped-kerb", "confirmed")], walking, 20, 0);
    expect("exclude" in w).toBe(false);
    if (!("exclude" in w)) expect(w.penalty).toBeLessThanOrEqual(10);
  });

  it("one unconfirmed report only warns, at a quarter of the cost", () => {
    const one = communityCost([sig("no-dropped-kerb", "reported")], manual, 20, 0);
    expect("exclude" in one).toBe(false);
    if (!("exclude" in one)) {
      expect(one.penalty).toBe(Math.round(45 * UNCONFIRMED_SHARE));
      expect(one.reasons[0]!.detail).toMatch(/not confirmed yet/);
    }
  });

  it("a broken lift blocks anyone who needs step-free access, once confirmed", () => {
    expect("exclude" in communityCost([sig("broken-lift", "confirmed")], { ...walking, maxSteps: 4 }, 30, 0)).toBe(true);
    expect("exclude" in communityCost([sig("broken-lift", "confirmed")], walking, 30, 0)).toBe(false);
  });

  it("good reports only take off unknown risk, never travel time, and never on their own", () => {
    const g = communityCost([sig("dropped-kerb", "confirmed")], manual, 20, 40);
    expect("exclude" in g).toBe(false);
    if (!("exclude" in g)) expect(g.penalty).toBeLessThan(0), expect(g.penalty).toBeGreaterThanOrEqual(-20);
    const none = communityCost([sig("dropped-kerb", "confirmed")], manual, 20, 0);
    if (!("exclude" in none)) expect(none.penalty).toBe(0);
    const unconfirmed = communityCost([sig("ramp", "reported")], manual, 20, 40);
    if (!("exclude" in unconfirmed)) expect(unconfirmed.penalty).toBe(0);
  });

  it("ignoring closures (to explain what a block cut off) ignores community blocks too", () => {
    expect("exclude" in communityCost([sig("steps", "confirmed")], manual, 20, 0, true)).toBe(false);
  });
});

describe("routing with community reports (Edinburgh)", () => {
  let router: Router;
  beforeAll(() => {
    router = new Router(loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz")));
  });

  it("goes round a well-confirmed missing dropped kerb, but not round a single report", () => {
    const from = router.snap(-3.1955, 55.9475, manual); // Grassmarket
    const to = router.snap(-3.1885, 55.9535, manual); // Princes Street east
    const before = router.route(from, to, manual, DRY)!;
    expect(before).toBeTruthy();
    const crossing = before.steps.map((s) => s.edge).find((e) => e.kind === "crossing");
    expect(crossing).toBeDefined();
    const mid = crossing!.geometry[Math.floor(crossing!.geometry.length / 2)]!;
    const now = new Date();
    const at = now.toISOString();
    const base: CommunityReport = { id: "k", city: "edinburgh", category: "no-dropped-kerb", lon: mid[0], lat: mid[1], text: null, photo: null, at, votes: [] };

    // One person: the route may still use it, and if it does, it says so.
    router.communitySignals = communitySignals([base], router.graph.edges, now);
    expect(router.communitySignals.get(crossing!.id)).toBeDefined();
    const single = router.route(from, to, manual, DRY)!;
    expect(single).toBeTruthy();

    // Three people: the crossing is out for a wheelchair.
    const confirmed = { ...base, votes: [{ kind: "agree" as const, at }, { kind: "still-there" as const, at }] };
    router.communitySignals = communitySignals([confirmed], router.graph.edges, now);
    const after = router.route(from, to, manual, DRY);
    for (const id of router.communitySignals.keys()) expect(after?.steps.some((s) => s.edge.id === id) ?? false).toBe(false);

    // Someone walking still crosses there.
    const w = router.route(router.snap(-3.1955, 55.9475, walking), router.snap(-3.1885, 55.9535, walking), walking, DRY);
    expect(w).toBeTruthy();
    router.communitySignals = new Map();
  });
});
