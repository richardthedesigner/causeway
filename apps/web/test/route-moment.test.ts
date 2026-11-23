import { describe, expect, it } from "vitest";
import type { RouteSummary } from "@causeway/router";
import type { PlannedRoute, PlanResult } from "../src/lib/plan-types";
import { momentLine, readAloud } from "../src/lib/route-verdict";
import type { StreetBand } from "../src/lib/street-bands";
import { bandDelayMs, createSeen, cubicBezier, easeHop, easeOut, journeyKey, openingView, stoneTarget } from "../src/components/v3/route-moment";

const summary: RouteSummary = { minutes: 33.6, distanceM: 1440, ascentM: 12, descentM: 4, worstInclinePct: -6.1, worstInclineAt: "Middle Meadow Walk", surfaceMix: {}, kerbs: { lowered: 3, flush: 0, raised: 0, unknown: 0 }, steps: 0, lifts: 0, unknownM: 0, confidence: 0.8, walkM: 1440, rides: [], movableBridges: [], verdict: "passable" };
const band = (name: string, state: StreetBand["state"], m = 100, condition = state === "unknown" ? "Nobody has measured" : "Level"): StreetBand => ({ name, m, state, steepestPct: null, condition, edgeIds: [] });
const route = (s: Partial<RouteSummary> = {}, streetBands: StreetBand[] = []) => ({ id: "r0", minutesExtra: 0, summary: { ...summary, ...s }, streetBands }) as PlannedRoute;
const ok = (routes: PlannedRoute[], avoided: { name: string; detail: string }[] = []): PlanResult => ({ status: "ok", routes, headline: "", notes: [], avoided, tradeoffs: [], entrances: [], door: null });
const none = (closest: PlannedRoute | null): PlanResult => ({
  status: "none",
  message: "No way there fits your limits",
  blockers: [{ name: "Castle Wynd South", detail: "14 steps", attr: "steps", lon: 0, lat: 0 }],
  closest: closest ? { ...closest, name: "Johnston Terrace", leftM: 80, end: [0, 0] } : null,
  relax: null,
});

describe("which journey a result belongs to", () => {
  it("is the start and the destination", () => {
    expect(journeyKey("place:1", "place:2")).toBe("place:1>place:2");
    expect(journeyKey("place:2", "place:1")).not.toBe(journeyKey("place:1", "place:2"));
  });

  it("your location is one start, however often the phone moves it", () => {
    expect(journeyKey("me", "place:2")).toBe("me>place:2");
    expect(journeyKey("me:1700000000000", "place:2")).toBe("me>place:2");
    expect(journeyKey("meadows", "place:2")).toBe("meadows>place:2");
  });
});

describe("what the route screen opens on", () => {
  it("a new journey: loading until its own result is in, then the moment", () => {
    const seen = createSeen();
    expect(openingView("a>b", seen, false, true)).toBe("loading");
    // The last journey's result is still on screen while this one is planned.
    expect(openingView("a>b", seen, true, true)).toBe("loading");
    expect(openingView("a>b", seen, true, false)).toBe("moment");
  });

  it("a journey this visit has shown opens unfolded, with no moment", () => {
    const seen = createSeen();
    seen.add("a>b");
    expect(openingView("a>b", seen, true, false)).toBe("open");
    expect(openingView("a>b", seen, true, true)).toBe("open");
    expect(openingView("a>c", seen, true, false)).toBe("moment");
  });

  it("a visit's memory is its own", () => {
    const one = createSeen();
    one.add("a>b");
    expect(createSeen().has("a>b")).toBe(false);
  });
});

describe("where the stone lands", () => {
  const grassmarket = [band("Warrender Park Road", "measured"), band("Bus 23 to Tollcross", "ride"), band("Bruntsfield Terrace", "unknown"), band("Lauriston Place", "measured"), band("Two streets", "unknown")];

  it("unsure: the first band nobody has measured", () => {
    expect(stoneTarget(grassmarket, "unsure")).toBe(2);
  });

  it("fits: the last band, at the destination", () => {
    expect(stoneTarget([band("A", "measured"), band("Bus 23 to Tollcross", "ride"), band("B", "measured")], "fits")).toBe(2);
  });

  it("doesn't fit: the blocked band", () => {
    expect(stoneTarget([band("Johnston Terrace", "measured"), band("Castle Wynd South", "blocked", 0, "14 steps")], "nope")).toBe(1);
  });

  it("falls back to the last band when there is no band of the kind it wants", () => {
    expect(stoneTarget([band("A", "measured"), band("B", "measured")], "unsure")).toBe(1);
    expect(stoneTarget([band("A", "measured")], "nope")).toBe(0);
  });

  it("no bands, no stone", () => {
    expect(stoneTarget([], "fits")).toBeNull();
  });
});

describe("the band stagger", () => {
  it("180 ms, then 60 ms a band, and only the first eight bands stagger", () => {
    expect([0, 1, 7, 8, 9, 20].map(bandDelayMs)).toEqual([180, 240, 600, 660, 660, 660]);
  });
});

describe("the easing curves", () => {
  it("start at 0 and end at 1", () => {
    for (const f of [easeOut, easeHop]) expect([f(0), f(1)]).toEqual([0, 1]);
  });

  it("a straight line is a straight line", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0.1, 0.25, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 3);
  });

  it("ease-out is ahead early; the hop overshoots, then settles", () => {
    expect(easeOut(0.3)).toBeGreaterThan(0.6);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeHop((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1.05);
    expect(easeHop(0.99)).toBeCloseTo(1, 1);
  });
});

describe("the line above the stone", () => {
  it("is the destination and the route's minutes, from the router", () => {
    expect(momentLine(ok([route()]), "Grassmarket")).toBe("Grassmarket, 34 min");
  });

  it("follows the route it is given", () => {
    const r = ok([route(), route({ minutes: 41 })]);
    expect(momentLine(r, "Grassmarket", r.status === "ok" ? r.routes[1] : null)).toBe("Grassmarket, 41 min");
  });

  it("has no time when nothing fits: the closest route goes somewhere else", () => {
    expect(momentLine(none(route()), "Edinburgh Castle")).toBe("Edinburgh Castle");
  });
});

describe("read aloud", () => {
  it("says the moment, then the way, in reading order", () => {
    const r = ok(
      [route({ verdict: "passable-with-unknowns", unknownM: 175 }, [band("Warrender Park Road", "measured", 97), band("Bruntsfield Terrace", "unknown", 175)])],
      [{ name: "Candlemaker Row", detail: "8.1% down" }],
    );
    expect(readAloud(r, "Grassmarket")).toBe(
      "Unsure. 180 m nobody has measured. Grassmarket, 34 min. Fine most of the way. One stretch nobody's measured yet. Warrender Park Road, level, 97 metres. Bruntsfield Terrace, nobody has measured, 175 metres. Goes round Candlemaker Row, 8.1% down.",
    );
  });

  it("follows the device's unit", () => {
    const r = ok([route({}, [band("Warrender Park Road", "measured", 97)])]);
    expect(readAloud(r, "Grassmarket", null, "mph")).toContain("Warrender Park Road, level, 106 yards.");
  });

  it("nothing fits: the blocker, and the closest route's bands ending on it", () => {
    const r = none(route({}, [band("Johnston Terrace", "measured", 120), band("Castle Wynd South", "blocked", 0, "14 steps")]));
    expect(readAloud(r, "Edinburgh Castle")).toBe("Doesn't fit. 14 steps on Castle Wynd South. Edinburgh Castle. Castle Wynd South stops this way. Johnston Terrace, level, 120 metres. Blocked: Castle Wynd South, 14 steps.");
  });
});
