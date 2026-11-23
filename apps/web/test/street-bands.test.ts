import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { hasCriticalUnknown, isRideKind, summarise, type RouteSummary } from "@causeway/router";
import type { PlannedRoute, PlanResult } from "../src/lib/plan-types";
import { bandLabel, flagLine, noteLine, routeVerdict, unfoldedSentence } from "../src/lib/route-verdict";
import { countWord, slopeWords, streetBands, type BandStep, type StreetBand } from "../src/lib/street-bands";
import { FIXTURE_PATH, planGrassmarket, type BandsFixture } from "../../../scripts/street-bands-fixture";

// ---------------------------------------------------------------- made-up steps, for the rules

let nextId = 1;
type Opts = { kind?: string; pct?: number | null; surface?: string | null; unknown?: boolean; nodeUnknown?: boolean; forward?: boolean; service?: { mode: "bus" | "tram" | "metro"; route: string } };
const attr = <T,>(value: T | null) => ({ value, state: value === null ? ("unknown" as const) : ("measured" as const), source: "osm" as const, observedAt: null });
function step(name: string | null, m: number, o: Opts = {}): BandStep {
  return {
    edge: {
      id: nextId++,
      name,
      kind: (o.kind ?? "sidewalk") as BandStep["edge"]["kind"],
      lengthM: m,
      ...(o.service ? { service: { ...o.service, headsign: null, operator: null } } : {}),
      attrs: { incline: attr(o.pct ?? null), inclineMax: attr(o.pct === undefined ? 0 : o.pct), surface: attr((o.surface ?? "asphalt") as never) },
    },
    forward: o.forward ?? true,
    eval: { passable: o.unknown ? "unknown" : "yes" },
    nodeEval: { passable: o.nodeUnknown ? "unknown" : "yes" },
  };
}
const bus = (route: string, from: string, to: string, hops: number[]): BandStep[] => [
  step(`${from}, ${route} bus towards Somewhere`, 0, { kind: "board", service: { mode: "bus", route } }),
  ...hops.map((m) => step(`${route} bus towards Somewhere`, m, { kind: "transit", service: { mode: "bus", route } })),
  step(`${to}, ${route} bus towards Somewhere`, 0, { kind: "board", forward: false, service: { mode: "bus", route } }),
];
const bands = (steps: BandStep[], blocker?: { name: string; detail: string }) => streetBands({ steps }, blocker);
const walked = (bs: StreetBand[]) => bs.filter((b) => b.state !== "ride").reduce((t, b) => t + b.m, 0);

describe("street bands: grouping", () => {
  it("groups consecutive steps by street, in travel order, with their edges", () => {
    const steps = [step("Marchmont Road", 100), step("Marchmont Road", 104), step("Melville Drive", 50), step("Marchmont Road", 20)];
    const out = bands(steps);
    expect(out.map((b) => [b.name, b.m])).toEqual([["Marchmont Road", 204], ["Melville Drive", 50], ["Marchmont Road", 20]]);
    expect(out[0]!.edgeIds).toEqual([steps[0]!.edge.id, steps[1]!.edge.id]);
    expect(out.every((b) => b.state === "measured")).toBe(true);
  });

  it("an unnamed path joins the stretch before it", () => {
    const out = bands([step("Marchmont Road", 100), step(null, 30, { kind: "footway" }), step(null, 5, { kind: "crossing" }), step("Melville Drive", 50)]);
    expect(out.map((b) => [b.name, b.m])).toEqual([["Marchmont Road", 135], ["Melville Drive", 50]]);
  });

  it("a route that starts on an unnamed path gives it to the street that follows", () => {
    const out = bands([step(null, 40, { kind: "footway" }), step("Marchmont Road", 100)]);
    expect(out.map((b) => [b.name, b.m])).toEqual([["Marchmont Road", 140]]);
  });

  it("a walk with no named street at all is one band, 'A path'", () => {
    expect(bands([step(null, 40, { kind: "footway" }), step(null, 10, { kind: "footway" })]).map((b) => [b.name, b.m])).toEqual([["A path", 50]]);
  });

  it("the link to a stop and a lift join a street, never stand as bands", () => {
    const out = bands([step("Lothian Road", 80), step("Tollcross", 12, { kind: "station_link" }), ...bus("23", "Tollcross", "Forrest Road", [400]), step("Forrest Road", 3, { kind: "station_link" }), step(null, 4, { kind: "elevator" }), step("Bristo Place", 60)]);
    expect(out.map((b) => [b.name, b.m, b.state])).toEqual([
      ["Lothian Road", 92, "measured"],
      ["Bus 23 to Forrest Road", 400, "ride"],
      ["Bristo Place", 67, "measured"],
    ]);
  });
});

describe("street bands: what nobody has measured", () => {
  it("uses the router's own test for a critical unknown", () => {
    expect(hasCriticalUnknown(step("A", 1, { unknown: true }))).toBe(true);
    expect(hasCriticalUnknown(step("A", 1, { nodeUnknown: true }))).toBe(true);
    expect(hasCriticalUnknown(step("A", 1))).toBe(false);
  });

  it("is unknown only when more than half the metres are", () => {
    const half = bands([step("A Street", 50, { unknown: true }), step("A Street", 50)]);
    expect(half[0]!.state).toBe("measured");
    const over = bands([step("B Street", 51, { nodeUnknown: true }), step("B Street", 49)]);
    expect(over[0]).toMatchObject({ state: "unknown", condition: "Nobody has measured", m: 100 });
    expect(over[0]!.names).toBeUndefined();
  });

  it("one unknown street on its own keeps its name", () => {
    const out = bands([step("A Street", 40), step("Leven Terrace", 90, { unknown: true }), step("C Street", 40)]);
    expect(out.map((b) => [b.name, b.state])).toEqual([["A Street", "measured"], ["Leven Terrace", "unknown"], ["C Street", "measured"]]);
  });

  it("merges a run of unknown streets into one band named by the count, and keeps the names", () => {
    const names = ["Leven Terrace", "Lonsdale Terrace", "Lauriston Gardens", "Chalmers Street", "Lauriston Place", "Heriot Place", "Keir Street", "Lady Lawson Street", "West Port"];
    const steps = [step("Marchmont Road", 100), ...names.map((n, i) => step(n, 100 + i, { unknown: true, pct: i === 4 ? -6.2 : 1 })), step("Grassmarket", 80)];
    const out = bands(steps);
    expect(out.map((b) => b.name)).toEqual(["Marchmont Road", "Nine streets", "Grassmarket"]);
    const merged = out[1]!;
    expect(merged.state).toBe("unknown");
    expect(merged.names).toEqual(names);
    expect(merged.m).toBe(names.reduce((t, _, i) => t + 100 + i, 0));
    expect(merged.steepestPct).toBe(-6.2);
    expect(merged.edgeIds).toEqual(steps.slice(1, 10).map((s) => s.edge.id));
    expect(merged.condition).toBe("Nobody has measured");
  });

  it("a street met twice in a run is named once", () => {
    const out = bands([step("A Street", 10, { unknown: true }), step("B Street", 10, { unknown: true }), step("A Street", 10, { unknown: true })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Two streets", names: ["A Street", "B Street"], m: 30 });
  });

  it("a ride between two unknown streets keeps them apart", () => {
    const out = bands([step("A Street", 10, { unknown: true }), ...bus("2", "A Street", "B Street", [300]), step("B Street", 10, { unknown: true })]);
    expect(out.map((b) => b.state)).toEqual(["unknown", "ride", "unknown"]);
  });

  it("counts in words up to twenty, then in figures", () => {
    expect([1, 2, 9, 12, 20, 21].map(countWord)).toEqual(["one", "two", "nine", "twelve", "twenty", "21"]);
    const out = bands(Array.from({ length: 21 }, (_, i) => step(`Street ${i}`, 10, { unknown: true })));
    expect(out[0]!.name).toBe("21 streets");
  });
});

describe("street bands: slope and surface", () => {
  it("the steepest part is signed, up is plus, and follows the way you travel", () => {
    expect(bands([step("A", 50, { pct: 2 }), step("A", 50, { pct: -5.26 })])[0]!.steepestPct).toBe(-5.3);
    expect(bands([step("A", 50, { pct: -7.1, forward: false })])[0]!.steepestPct).toBe(7.1);
  });

  it("says the slope in whole per cent with 'about', and level at 3% or under", () => {
    expect(slopeWords(3)).toBe("level");
    expect(slopeWords(-2.9)).toBe("level");
    expect(slopeWords(-5.3)).toBe("about 5% down");
    expect(slopeWords(6.6)).toBe("about 7% up");
    expect(bands([step("A", 50, { pct: 1.2 })])[0]!.condition).toBe("Level");
    expect(bands([step("A", 50, { pct: -5.3 })])[0]!.condition).toBe("About 5% down");
  });

  it("names setts when they are most of the stretch", () => {
    expect(bands([step("West Bow", 60, { pct: 4.4, surface: "sett" }), step("West Bow", 20, { pct: 1 })])[0]!.condition).toBe("Setts, about 4% up");
    expect(bands([step("West Bow", 20, { pct: 4.4, surface: "sett" }), step("West Bow", 60, { pct: 1 })])[0]!.condition).toBe("About 4% up");
    expect(bands([step("The Close", 30, { pct: 0, surface: "cobblestone" })])[0]!.condition).toBe("Cobbles, level");
  });

  it("never calls a stretch level without slope data", () => {
    expect(bands([step("A", 50, { pct: null })])[0]).toMatchObject({ steepestPct: null, condition: "Slope not measured", state: "measured" });
  });
});

describe("street bands: rides", () => {
  it("names a ride by its line and where you get off, one band per vehicle", () => {
    const out = bands([step("A Street", 30), ...bus("23", "Viewforth", "Tollcross", [300, 250]), ...bus("2", "Tollcross", "Grassmarket", [280]), step("Grassmarket", 20)]);
    expect(out.map((b) => [b.name, b.state, b.condition])).toEqual([
      ["A Street", "measured", "Level"],
      ["Bus 23 to Tollcross", "ride", "2 stops"],
      ["Bus 2 to Grassmarket", "ride", "1 stop"],
      ["Grassmarket", "measured", "Level"],
    ]);
    expect(out[1]).toMatchObject({ m: 550, steepestPct: null });
  });

  it("names a tram and a train line", () => {
    const tram = [step("Princes Street, tram towards Airport", 0, { kind: "board", service: { mode: "tram", route: "T" } }), step("tram", 900, { kind: "transit" }), step("Haymarket, tram towards Airport", 0, { kind: "board", forward: false })];
    expect(bands(tram)[0]!.name).toBe("Tram to Haymarket");
    const train = [step("Canary Wharf, Jubilee line towards Stratford", 0, { kind: "board" }), step("Jubilee line", 2000, { kind: "transit" }), step("North Greenwich, Jubilee line towards Stratford", 0, { kind: "board", forward: false })];
    expect(bands(train)[0]!.name).toBe("Jubilee line to North Greenwich");
  });

  it("ride kinds are the router's, so a ride is never counted as ground", () => {
    expect(["board", "transit", "interchange"].every(isRideKind)).toBe(true);
    expect(["station_link", "elevator", "sidewalk", "crossing"].some(isRideKind)).toBe(false);
  });
});

describe("street bands: metres", () => {
  it("are whole, and the walking bands add up to the rounded walk exactly", () => {
    // 13 bands of 10.4 m: rounded one by one they would lose 5 m.
    const steps = Array.from({ length: 13 }, (_, i) => step(`Street ${i}`, 10.4));
    const out = bands(steps);
    expect(out.every((b) => Number.isInteger(b.m))).toBe(true);
    expect(walked(out)).toBe(Math.round(13 * 10.4));
  });

  it("a ride's metres are not part of the walk", () => {
    const steps = [step("A Street", 100.4), ...bus("23", "A", "B", [1000.3]), step("B Street", 50.4)];
    const out = bands(steps);
    expect(walked(out)).toBe(151);
    expect(out[1]!.m).toBe(1000);
  });
});

describe("street bands: blocked", () => {
  it("adds the blocker as the last band of the closest route", () => {
    const out = bands([step("Johnston Terrace", 120), step("Castle Wynd South", 15)], { name: "Castle Wynd South", detail: "14 steps" });
    expect(out.map((b) => [b.name, b.state, b.m])).toEqual([["Johnston Terrace", "measured", 120], ["Castle Wynd South", "measured", 15], ["Castle Wynd South", "blocked", 0]]);
    expect(out[2]).toMatchObject({ condition: "14 steps", edgeIds: [], steepestPct: null });
    expect(walked(out)).toBe(135);
  });

  it("no band is blocked without a blocker", () => {
    expect(bands([step("A", 10)]).some((b) => b.state === "blocked")).toBe(false);
  });
});

// ---------------------------------------------------------------- the words

const summary: RouteSummary = { minutes: 23, distanceM: 1440, ascentM: 12, descentM: 4, worstInclinePct: -6.1, worstInclineAt: "Middle Meadow Walk", surfaceMix: {}, kerbs: { lowered: 3, flush: 0, raised: 0, unknown: 0 }, steps: 0, lifts: 0, unknownM: 0, confidence: 0.8, walkM: 1440, rides: [], movableBridges: [], verdict: "passable" };
const route = (s: Partial<RouteSummary> = {}, more: Partial<PlannedRoute> = {}) => ({ id: "r0", minutesExtra: 0, summary: { ...summary, ...s }, ...more }) as PlannedRoute;
const ok = (routes: PlannedRoute[], avoided: { name: string; detail: string }[] = []): PlanResult => ({ status: "ok", routes, headline: "", notes: [], avoided, tradeoffs: [], entrances: [], door: null });
const none = (blockers: { name: string; detail: string }[], closest: PlannedRoute | null = null): PlanResult => ({
  status: "none",
  message: blockers.length ? "No way there fits your limits" : "We couldn't find a way there",
  blockers: blockers.map((b) => ({ ...b, attr: "steps", lon: 0, lat: 0 })),
  closest: closest ? { ...closest, name: "Johnston Terrace", leftM: 80, end: [0, 0] } : null,
  relax: null,
});
const unknownBand = (name: string): StreetBand => ({ name, m: 100, state: "unknown", steepestPct: null, condition: "Nobody has measured", edgeIds: [] });

describe("the verdict word", () => {
  it("maps the router's verdict to the word, the fill and the stone", () => {
    expect(routeVerdict(ok([route()]))).toEqual({ word: "Fits", fill: "--ok-fill", stone: "fits" });
    expect(routeVerdict(ok([route({ verdict: "passable-with-unknowns" })]))).toEqual({ word: "Unsure", fill: "--caution-fill", stone: "unsure" });
    expect(routeVerdict(ok([route({ verdict: "not-passable" })]))).toEqual({ word: "Doesn't fit", fill: "--stop-fill", stone: "nope" });
  });

  it("a result with no way never fits, whatever the closest route says of itself", () => {
    expect(routeVerdict(none([{ name: "Castle Wynd South", detail: "14 steps" }], route())).word).toBe("Doesn't fit");
    expect(routeVerdict(none([])).stone).toBe("nope");
  });

  it("judges the route it is given, not only the best", () => {
    const r = ok([route(), route({ verdict: "passable-with-unknowns" }, { id: "r1" })]);
    expect(routeVerdict(r, r.status === "ok" ? r.routes[1] : null).word).toBe("Unsure");
  });
});

describe("the flag", () => {
  it("unsure: the unknown metres, rounded to 10 m", () => {
    expect(flagLine(ok([route({ verdict: "passable-with-unknowns", unknownM: 987 })]))).toBe("990 m nobody has measured");
    expect(flagLine(ok([route({ verdict: "passable-with-unknowns", unknownM: 175 })]))).toBe("180 m nobody has measured");
    expect(flagLine(ok([route({ verdict: "passable-with-unknowns", unknownM: 4 })]))).toBe("10 m nobody has measured");
  });

  it("unsure: follows the device's distance unit (D-074)", () => {
    expect(flagLine(ok([route({ verdict: "passable-with-unknowns", unknownM: 175 })]), null, "mph")).toBe("190 yd nobody has measured");
  });

  it("unsure with no unknown metres (a station we can't confirm) gives no figure", () => {
    expect(flagLine(ok([route({ verdict: "passable-with-unknowns", unknownM: 0 })]))).toBe("Some of it nobody has measured");
  });

  it("fits: the steepest part, or level when nothing is over 3%", () => {
    expect(flagLine(ok([route()]))).toBe("Steepest 6.1%, on Middle Meadow Walk");
    expect(flagLine(ok([route({ worstInclinePct: 7.1, worstInclineAt: null })]))).toBe("Steepest 7.1%");
    expect(flagLine(ok([route({ worstInclinePct: -3 })]))).toBe("Level all the way");
    expect(flagLine(ok([route({ worstInclinePct: 3.1 })]))).toBe("Steepest 3.1%, on Middle Meadow Walk");
  });

  it("fits with no slope data says nothing, never 'level'", () => {
    expect(flagLine(ok([route({ worstInclinePct: null, worstInclineAt: null })]))).toBeNull();
  });

  it("doesn't fit: the first blocker in words", () => {
    expect(flagLine(none([{ name: "Castle Wynd South", detail: "14 steps" }, { name: "Castlehill", detail: "9.6% uphill" }]))).toBe("14 steps on Castle Wynd South");
    expect(flagLine(none([{ name: "Jubilee line", detail: "no service" }]))).toBe("No service on Jubilee line");
    expect(flagLine(none([]))).toBe("We couldn't find a way there");
  });
});

describe("the unfolded sentence", () => {
  it("fits", () => {
    expect(unfoldedSentence(ok([route()]))).toBe("Fits all the way.");
  });

  it("unsure: counts the unknown bands as stretches", () => {
    const u = { verdict: "passable-with-unknowns" as const, unknownM: 300 };
    expect(unfoldedSentence(ok([route(u, { streetBands: [unknownBand("Nine streets")] })]))).toBe("Fine most of the way. One stretch nobody's measured yet.");
    expect(unfoldedSentence(ok([route(u, { streetBands: [unknownBand("A"), { ...unknownBand("B"), state: "measured" }, unknownBand("C")] })]))).toBe("Fine most of the way. Two stretches nobody's measured yet.");
  });

  it("unsure with no band mostly unknown says how much instead", () => {
    expect(unfoldedSentence(ok([route({ verdict: "passable-with-unknowns", unknownM: 42 }, { streetBands: [] })]))).toBe("Fine most of the way. 40 m nobody's measured yet.");
    expect(unfoldedSentence(ok([route({ verdict: "passable-with-unknowns", unknownM: 0 })]))).toBe("Fine most of the way. Some of it nobody's measured yet.");
  });

  it("doesn't fit: names what stops it", () => {
    expect(unfoldedSentence(none([{ name: "Castle Wynd South", detail: "14 steps" }]))).toBe("Castle Wynd South stops this way.");
    expect(unfoldedSentence(none([{ name: "a path", detail: "10.2% downhill" }]))).toBe("A path stops this way.");
    expect(unfoldedSentence(none([]))).toBe("We couldn't find a way there.");
  });
});

describe("the note under the bands", () => {
  const avoided = [{ name: "Candlemaker Row", detail: "8.1% down" }, { name: "Cowgate", detail: "setts" }];

  it("says what the best route goes round, and what that adds", () => {
    expect(noteLine(ok([route({}, { minutesExtra: 9 })], avoided))).toBe("Goes round Candlemaker Row, 8.1% down. Adds 9 min.");
  });

  it("leaves out the minutes when there are none to add", () => {
    expect(noteLine(ok([route()], avoided))).toBe("Goes round Candlemaker Row, 8.1% down.");
  });

  it("only when it applies: nothing avoided, another route, or no way", () => {
    expect(noteLine(ok([route()]))).toBeNull();
    const r = ok([route(), route({}, { id: "r1", minutesExtra: 4 })], avoided);
    expect(noteLine(r, r.status === "ok" ? r.routes[1] : null)).toBeNull();
    expect(noteLine(none([{ name: "Castle Wynd South", detail: "14 steps" }]))).toBeNull();
  });
});

describe("a band read aloud", () => {
  it("is one item: name, condition, metres", () => {
    expect(bandLabel({ name: "Marchmont Road", m: 204, state: "measured", steepestPct: -5.3, condition: "About 5% down", edgeIds: [] })).toBe("Marchmont Road, about 5% down, 204 metres.");
    expect(bandLabel({ name: "West Bow", m: 19, state: "measured", steepestPct: 7.1, condition: "Setts, about 7% up", edgeIds: [] }, "mph")).toBe("West Bow, setts, about 7% up, 21 yards.");
  });

  it("merged unknowns list their streets", () => {
    expect(bandLabel({ ...unknownBand("Three streets"), m: 990, names: ["Leven Terrace", "Lonsdale Terrace", "West Port"] })).toBe("Three streets nobody has measured, 990 metres: Leven Terrace, Lonsdale Terrace, West Port.");
    expect(bandLabel(unknownBand("Leven Terrace"))).toBe("Leven Terrace, nobody has measured, 100 metres.");
  });

  it("rides and blockers have no metres to read", () => {
    expect(bandLabel({ name: "Bus 23 to Tollcross", m: 1600, state: "ride", steepestPct: null, condition: "5 stops", edgeIds: [] })).toBe("Bus 23 to Tollcross, 5 stops.");
    expect(bandLabel({ name: "Castle Wynd South", m: 0, state: "blocked", steepestPct: null, condition: "14 steps", edgeIds: [] })).toBe("Blocked: Castle Wynd South, 14 steps.");
  });
});

// ---------------------------------------------------------------- the real journey

describe("Grassmarket fixture: Warrender Park Road to the Grassmarket, manual wheelchair", () => {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as BandsFixture;
  const out = streetBands({ steps: fx.steps });

  it("gives the bands the fixture was written with", () => {
    expect(out).toEqual(fx.bands);
  });

  it("walking bands add up to the router's walkM, and rides stay out of it", () => {
    expect(walked(out)).toBe(fx.summary.walkM);
    const rides = fx.steps.filter((s) => isRideKind(s.edge.kind)).reduce((t, s) => t + s.edge.lengthM, 0);
    expect(out.filter((b) => b.state === "ride").reduce((t, b) => t + b.m, 0)).toBeCloseTo(rides, -1);
  });

  it("every step's edge is on exactly one band, in order", () => {
    expect(out.flatMap((b) => b.edgeIds)).toEqual(fx.steps.map((s) => s.edge.id));
  });

  it("the steepest band is the router's steepest part", () => {
    const worst = Math.max(...out.map((b) => Math.abs(b.steepestPct ?? 0)));
    expect(worst).toBe(Math.abs(fx.summary.worstInclinePct!));
    expect(out.find((b) => Math.abs(b.steepestPct ?? 0) === worst)!.name).toBe(fx.summary.worstInclineAt);
  });

  it("unknown bands hold the router's unknown metres, and only the unknown bands are unlit", () => {
    const inUnknownBands = new Set(out.filter((b) => b.state === "unknown").flatMap((b) => b.edgeIds));
    const unknownSteps = fx.steps.filter((s) => !isRideKind(s.edge.kind) && hasCriticalUnknown(s));
    // On this journey every unknown metre falls in an unknown band: the stone has nowhere else to stand.
    expect(unknownSteps.every((s) => inUnknownBands.has(s.edge.id))).toBe(true);
    expect(Math.round(unknownSteps.reduce((t, s) => t + s.edge.lengthM, 0))).toBe(fx.summary.unknownM);
    expect(fx.summary.verdict === "passable-with-unknowns").toBe(out.some((b) => b.state === "unknown"));
  });

  it("the words come from the same data", () => {
    const planned = { id: "r0", minutesExtra: 0, summary: fx.summary, streetBands: out } as PlannedRoute;
    const result = ok([planned]);
    const n = out.filter((b) => b.state === "unknown").length;
    expect(routeVerdict(result).word).toBe(fx.summary.verdict === "passable" ? "Fits" : "Unsure");
    if (fx.summary.verdict === "passable-with-unknowns") {
      expect(flagLine(result)).toBe(`${Math.max(10, Math.round(fx.summary.unknownM / 10) * 10)} m nobody has measured`);
      expect(unfoldedSentence(result)).toMatch(n === 1 ? /^Fine most of the way\. One stretch / : /^Fine most of the way\. \w+ stretches /);
    }
    expect(out.every((b) => b.name.length > 0 && b.condition.length > 0 && Number.isInteger(b.m))).toBe(true);
    expect(out.every((b) => b.state !== "blocked")).toBe(true);
  });
});

describe("the real router today, same journey", () => {
  let planned: ReturnType<typeof planGrassmarket>;
  beforeAll(() => {
    planned = planGrassmarket();
  });

  it("a router Route goes straight in, and the rules hold on live output", () => {
    const out = streetBands(planned.route);
    const s = planned.summary;
    expect(walked(out)).toBe(s.walkM);
    expect(out.flatMap((b) => b.edgeIds)).toEqual(planned.route.steps.map((x) => x.edge.id));
    expect(Math.max(0, ...out.map((b) => Math.abs(b.steepestPct ?? 0)))).toBe(Math.abs(s.worstInclinePct ?? 0));
    expect(out.filter((b) => b.state === "ride")).toHaveLength(s.rides.length);
    if (s.verdict === "passable") expect(out.some((b) => b.state === "unknown")).toBe(false);
  });

  it("adding the bands changes nothing the router says", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const steps = JSON.stringify(planned.route.steps.map((x) => [x.edge.id, x.forward, x.eval.passable, x.nodeEval.passable]));
    streetBands(planned.route);
    expect(JSON.stringify(planned.route.steps.map((x) => [x.edge.id, x.forward, x.eval.passable, x.nodeEval.passable]))).toBe(steps);
    expect(summarise(planned.route, now)).toEqual(planned.summary);
  });
});
