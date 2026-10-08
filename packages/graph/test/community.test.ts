import { describe, expect, it } from "vitest";
import {
  COMMUNITY_CATEGORIES,
  communitySignals,
  confirmedToilets,
  decay,
  evidence,
  publicPoint,
  reportEdges,
  reportLevel,
  reportProblem,
  type CommunityReport,
  type CommunityVote,
  type GraphEdge,
} from "@causeway/graph";

const NOW = new Date("2026-10-08T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const vote = (kind: CommunityVote["kind"], d = 0): CommunityVote => ({ kind, at: daysAgo(d) });

const report = (over: Partial<CommunityReport> = {}): CommunityReport => ({
  id: "r1",
  city: "edinburgh",
  category: "no-dropped-kerb",
  lon: -3.19,
  lat: 55.95,
  text: null,
  photo: null,
  at: daysAgo(0),
  votes: [],
  ...over,
});

const level = (r: CommunityReport, now = NOW) => reportLevel(evidence(r, now));

describe("confidence", () => {
  it("one fresh report is a coin toss, and only warns", () => {
    const e = evidence(report(), NOW);
    expect(e.confidence).toBeCloseTo(0.5);
    expect(reportLevel(e)).toBe("reported");
  });

  it("three people make it confirmed; two don't", () => {
    expect(level(report({ votes: [vote("agree")] }))).toBe("reported");
    expect(level(report({ votes: [vote("agree"), vote("still-there")] }))).toBe("confirmed");
  });

  it("a dispute pulls it back, and as many against as for makes it disputed", () => {
    expect(level(report({ votes: [vote("agree"), vote("agree"), vote("disagree")] }))).toBe("reported");
    expect(level(report({ votes: [vote("gone")] }))).toBe("disputed");
  });

  it("decays: half the weight after one half-life", () => {
    expect(decay(0, 10)).toBe(1);
    expect(decay(10, 10)).toBeCloseTo(0.5);
    expect(decay(20, 10)).toBeCloseTo(0.25);
    expect(decay(-5, 10)).toBe(1); // a clock a little ahead never boosts a report
  });

  it("a broken lift fades in days, a flight of steps lasts years", () => {
    const lift = report({ category: "broken-lift", at: daysAgo(21), votes: [vote("agree", 21), vote("agree", 21)] });
    expect(level(lift)).toBe("faded");
    const steps = report({ category: "steps", at: daysAgo(14), votes: [vote("agree", 14), vote("agree", 14)] });
    expect(level(steps)).toBe("confirmed");
  });

  it("'still there?' refreshes an old report", () => {
    const old = report({ category: "blocked-pavement", at: daysAgo(20) });
    expect(level(old)).toBe("faded");
    const refreshed = { ...old, votes: [vote("still-there", 0), vote("still-there", 1), vote("still-there", 1)] };
    expect(level(refreshed)).toBe("confirmed");
    expect(evidence(refreshed, NOW).lastSeen).toBe(daysAgo(0));
  });

  it("confirmation itself decays: confirmed a year ago is only reported now", () => {
    const r = report({ category: "narrow-pavement", at: daysAgo(365), votes: [vote("agree", 365), vote("agree", 365)] });
    expect(level(r, NOW)).toBe("reported");
    expect(level(r, new Date(Date.parse(daysAgo(365))))).toBe("confirmed");
  });
});

describe("reports", () => {
  it("every category has a label, a question and a sensible half-life", () => {
    for (const c of COMMUNITY_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.question.endsWith("?")).toBe(true);
      expect(c.halfLifeDays).toBeGreaterThan(0);
    }
    expect(COMMUNITY_CATEGORIES.filter((c) => c.polarity === "good").length).toBeGreaterThan(3);
  });

  it("checks what can be saved", () => {
    expect(reportProblem(report())).toBeNull();
    expect(reportProblem(report({ text: "x".repeat(201) }))).toMatch(/under 200/);
    expect(reportProblem(report({ category: "nope" as never }))).toMatch(/Choose/);
  });

  it("others see a point rounded to about 10 m", () => {
    expect(publicPoint(-3.191234, 55.951278)).toEqual([-3.1912, 55.9513]);
  });

  it("only confirmed accessible toilets count on routes", () => {
    expect(confirmedToilets([report({ category: "accessible-toilet" })], NOW)).toHaveLength(0);
    expect(confirmedToilets([report({ category: "accessible-toilet", votes: [vote("agree"), vote("agree")] })], NOW)).toHaveLength(1);
  });
});

describe("snapping to the graph", () => {
  const e = (id: number, kind: GraphEdge["kind"], geometry: [number, number][]) => ({ id, kind, geometry });
  // Two parallel pavements 20 m apart, joined by a crossing; a bus ride on top of one.
  const edges = [
    e(1, "sidewalk", [[-3.19, 55.95], [-3.189, 55.95]]),
    e(2, "sidewalk", [[-3.19, 55.95018], [-3.189, 55.95018]]),
    e(3, "crossing", [[-3.1895, 55.95], [-3.1895, 55.95018]]),
    e(4, "transit", [[-3.19, 55.95], [-3.189, 55.95]]),
  ];

  it("a kerb report lands on the crossing, not the pavement beside it", () => {
    expect(reportEdges({ category: "no-dropped-kerb", lon: -3.1896, lat: 55.95002 }, edges)).toEqual([3]);
  });

  it("a pavement report takes the nearest pavement, never a bus ride", () => {
    expect(reportEdges({ category: "rough-surface", lon: -3.1898, lat: 55.95001 }, edges)).toEqual([1]);
  });

  it("nothing within 15 m: no edge", () => {
    expect(reportEdges({ category: "steps", lon: -3.185, lat: 55.95 }, edges)).toEqual([]);
  });

  it("places aren't on an edge", () => {
    expect(reportEdges({ category: "seat", lon: -3.1898, lat: 55.95 }, edges)).toEqual([]);
  });

  it("faded and disputed reports never reach the router", () => {
    const at = { lon: -3.1896, lat: 55.95002 };
    const sigs = communitySignals(
      [
        report({ id: "a", ...at }),
        report({ id: "b", ...at, votes: [vote("gone")] }),
        report({ id: "c", ...at, category: "broken-lift", at: daysAgo(60) }),
      ],
      edges,
      NOW,
    );
    expect(sigs.get(3)?.map((s) => s.reportId)).toEqual(["a"]);
    expect(sigs.get(3)![0]!.detail).toMatch(/No dropped kerb: 1 person, last seen today/);
  });
});
