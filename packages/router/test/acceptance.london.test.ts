/**
 * London: wheeling plus step-free Underground. With the lift outages TfL
 * reported on 2026-10-04 (recorded), Canary Wharf's Jubilee line lift is out,
 * so a wheelchair user must be rerouted before they set off; someone walking
 * is not. The live variant runs the same check against TfL right now.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyStationAccess, loadSnapshot, refRides, type Graph, type TransitNetwork } from "@causeway/graph/node";
import { applyLiveStates, fetchLiftOutages, liftOutageStates, PART_HEADLINE, parseLiftDisruptions, parseLineStatus, railDisruptionStates } from "@causeway/live";
import { PRESETS } from "@causeway/profile";
import { closureBlind, describeSegments, diagnose, explain, onRoute, Router, summarise } from "@causeway/router";
import { LONDON_JOURNEYS } from "../../../scripts/journeys.js";

const ROOT = join(import.meta.dirname, "../../..");
const net = JSON.parse(readFileSync(join(ROOT, "data/transit/london/network.json"), "utf8")) as TransitNetwork;
// As the app does: TfL's per-line step-free facts on the board edges when the city loads (DATA-03).
const fresh = () => {
  const g = loadSnapshot(join(ROOT, "data/snapshots/london-jubilee.graph.json.gz"));
  applyStationAccess(g, net);
  refRides(g);
  return g;
};
const recorded = parseLiftDisruptions(JSON.parse(readFileSync(join(ROOT, "packages/live/test/fixtures/tfl-lifts-2026-10-04.json"), "utf8")), "2026-10-04T12:00:00Z");
const NOW = new Date("2026-10-04T12:05:00Z");
const j = LONDON_JOURNEYS[0]!;
const refs = (g: Graph) => new Set(g.edges.map((e) => e.ref).filter((r): r is string => !!r));

function plan(g: Graph, preset: keyof typeof PRESETS, now = NOW) {
  const r = new Router(g);
  const p = PRESETS[preset];
  const c = { now, wet: false, ice: false };
  const a = r.snap(j.from.lon, j.from.lat, p, c);
  const b = r.snap(j.to.lon, j.to.lat, p, c);
  const route = r.route(a, b, p, c);
  expect(route, preset).not.toBeNull();
  return { r, route: route!, a, b, p, c };
}

describe("Parliament Square to Canary Wharf", () => {
  it("places the Canary Wharf outage on the Jubilee line platforms only", () => {
    const states = liftOutageStates(recorded, net, refs(fresh()));
    expect(states.has("board:jubilee:940GZZLUCYF")).toBe(true);
    expect(states.has("board:dlr:940GZZDLCAN")).toBe(false);
    expect(states.get("board:jubilee:940GZZLUCYF")!.affects).toBe("step-free");
  });

  it("closes only the lines a lift outage cuts off, from TfL's station layout (DATA-03)", () => {
    const at = (lifts: string[]) => liftOutageStates([{ stationId: "HUBWSM", stationName: "Westminster", liftIds: lifts, message: "", alternativeMentioned: false, fetchedAt: "2026-10-04T12:00:00Z" }], net, refs(fresh()));
    // Lift 5 joins the District line level to the Jubilee platforms.
    expect(at(["HUBWSM-Lift-5"]).has("board:jubilee:940GZZLUWSM")).toBe(true);
    // Lift 3 serves the eastbound District platform only: the Jubilee line is still step-free by lifts 2, 4 and 5.
    expect(at(["HUBWSM-Lift-3"]).size).toBe(0);
  });

  it("counts every lift out at a station together, even on separate messages", () => {
    const out = (id: string) => ({ stationId: "HUBCAN", stationName: "Canning Town", liftIds: [id], message: `Canning Town ${id} out.`, alternativeMentioned: false, fetchedAt: "2026-10-04T12:00:00Z" });
    // Lift 1 or lift 3 alone leaves the other way from the street to the ticket hall. Both out cut off the Jubilee line.
    expect(liftOutageStates([out("HUBCAN-Lift-1")], net, refs(fresh())).has("board:jubilee:940GZZLUCGT")).toBe(false);
    expect(liftOutageStates([out("HUBCAN-Lift-3")], net, refs(fresh())).has("board:jubilee:940GZZLUCGT")).toBe(false);
    const both = liftOutageStates([out("HUBCAN-Lift-1"), out("HUBCAN-Lift-3")], net, refs(fresh()));
    expect(both.has("board:jubilee:940GZZLUCGT")).toBe(true);
    expect(both.get("board:jubilee:940GZZLUCGT")!.reason).toBe("Canning Town HUBCAN-Lift-1 out. Canning Town HUBCAN-Lift-3 out.");
  });

  it("a lift that cuts off some of a line's platforms restricts the line; one that cuts off all of them closes it (D-058)", () => {
    const out = (id: string) => liftOutageStates([{ stationId: "940GZZLUNGW", stationName: "North Greenwich", liftIds: [id], message: `North Greenwich ${id} out.`, alternativeMentioned: false, fetchedAt: "2026-10-04T12:00:00Z" }], net, refs(fresh()));
    // Without lift 1 one Jubilee line platform is still step-free; without lift 4 neither is.
    expect(out("940GZZLUNGW-Lift-1").get("board:jubilee:940GZZLUNGW")).toMatchObject({ status: "restricted", affects: "step-free", headline: "Lift out of service: step-free to some platforms only" });
    expect(out("940GZZLUNGW-Lift-4").get("board:jubilee:940GZZLUNGW")).toMatchObject({ status: "closed", affects: "step-free" });
  });

  it("says so when a platform the route uses may have lost step-free access (D-058)", () => {
    const g = fresh();
    const live = { status: "restricted" as const, affects: "step-free" as const, headline: PART_HEADLINE, reason: "Canary Wharf lift 1 out.", source: "TfL Unified API lift disruptions", validFrom: "2026-10-04T12:00:00Z", validUntil: "2026-10-04T12:15:00Z" };
    applyLiveStates(g, new Map([["board:jubilee:940GZZLUCYF", live]]));
    const { r, route, a, b, p, c } = plan(g, "manual-wheelchair");
    const ex = explain(r, route, a, b, p, PRESETS.walking, c);
    // Canary Wharf is where this journey ends, so the route still uses it, and says so.
    expect(route.steps.some((s) => s.edge.ref === "board:jubilee:940GZZLUCYF")).toBe(true);
    // Under "On this route" as Slower, with its source and time (D-067); not blocked, and nothing to go round.
    const items = onRoute(r, route, p, c, { avoided: ex.avoided, blind: closureBlind(r, a, b, p, c) });
    expect(items).toContainEqual({ group: "slower", text: "Lift out of service: step-free to some platforms only: Canary Wharf lift 1 out.", where: ["Canary Wharf, Jubilee line"], label: "live", source: "TfL", date: "2026-10-04T12:00:00Z", until: null });
    expect(items.some((i) => i.group === "blocked")).toBe(false);
    expect(ex.headline).not.toMatch(/closed/);
  });

  it("a Jubilee line station TfL maps with no step-free route is closed to wheelchair users, open to walkers", () => {
    const g = fresh();
    const e = g.edges.find((x) => x.ref === "board:jubilee:940GZZLUSWC")!;
    expect(e.attrs.stepCount.value).toBe(1);
    expect(e.attrs.stepCount.method).toMatch(/TfL station data .*no step-free route/);
  });

  it("with no outages, a wheelchair user takes the Jubilee line straight to Canary Wharf", () => {
    const { route } = plan(fresh(), "manual-wheelchair");
    expect(summarise(route, NOW).rides).toEqual([{ line: "Jubilee line", from: "Westminster", to: "Canary Wharf", stops: expect.any(Number) }]);
  });

  it("with the recorded outage, the wheelchair route avoids alighting at Canary Wharf on the Jubilee line, and says why", () => {
    const g = fresh();
    applyLiveStates(g, liftOutageStates(recorded, net, refs(g)));
    const { r, route, a, b, p, c } = plan(g, "manual-wheelchair");
    const rides = summarise(route, NOW).rides;
    expect(rides.some((x) => x.line === "Jubilee line" && x.to === "Canary Wharf")).toBe(false);
    expect(rides.length).toBeGreaterThan(0);
    const ex = explain(r, route, a, b, p, PRESETS.walking, c);
    expect(ex.headline).toMatch(/Avoids Canary Wharf, Jubilee line \(lift out of service\)\. Adds \d+ minutes?\./);
    // Blocked under "On this route", once, with TfL's words and the fetch time (D-067). Walking, nothing is blocked.
    const blocked = onRoute(r, route, p, c, { avoided: ex.avoided, blind: closureBlind(r, a, b, p, c) }).filter((i) => i.group === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.some((i) => /faulty lift/.test(i.text) && i.source === "TfL" && i.label === "live" && i.where.some((w) => /Canary Wharf/.test(w)))).toBe(true);
    const w = plan(g, "walking");
    expect(onRoute(w.r, w.route, w.p, w.c, { avoided: explain(w.r, w.route, w.a, w.b, w.p, PRESETS.walking, w.c).avoided, blind: closureBlind(w.r, w.a, w.b, w.p, w.c) }).some((i) => i.group === "blocked")).toBe(false);
    expect(describeSegments(route).some((s) => /^Take the /.test(s))).toBe(true);
  });

  it("with the recorded Jubilee line part closure (DATA-04), nobody is sent along the closed stretch", () => {
    const g = fresh();
    const closure = parseLineStatus(JSON.parse(readFileSync(join(ROOT, "packages/live/test/fixtures/tfl-line-status-2026-10-04.json"), "utf8")), "2026-10-04T12:00:00Z");
    expect(applyLiveStates(g, railDisruptionStates(closure, net, refs(g), NOW))).toBeGreaterThan(0);
    // Our two London zones are joined only by the Jubilee line, so with Green Park to Canary Wharf closed
    // there is honestly no way through: no route, rather than one along a closed line.
    const r = new Router(g);
    for (const preset of ["walking", "manual-wheelchair"] as const) {
      const p = PRESETS[preset];
      const c = { now: NOW, wet: false, ice: false };
      expect(r.route(r.snap(j.from.lon, j.from.lat, p, c), r.snap(j.to.lon, j.to.lat, p, c), p, c), preset).toBeNull();
    }
    // The day after, it runs again.
    expect(plan(g, "walking", new Date("2026-10-05T09:00:00Z")).route).not.toBeNull();
  });

  it("when a closure cuts the only way, \"In the way\" names the closure, not unjoined data (D-061)", () => {
    const g = fresh();
    const closure = parseLineStatus(JSON.parse(readFileSync(join(ROOT, "packages/live/test/fixtures/tfl-line-status-2026-10-04.json"), "utf8")), "2026-10-04T12:00:00Z");
    applyLiveStates(g, railDisruptionStates(closure, net, refs(g), NOW));
    const r = new Router(g);
    const p = PRESETS["manual-wheelchair"];
    const c = { now: NOW, wet: false, ice: false };
    const d = diagnose(r, r.snap(j.from.lon, j.from.lat, p, c), r.snap(j.to.lon, j.to.lat, PRESETS.walking, c), p, PRESETS.walking, c);
    expect(d.blockers.length).toBeGreaterThan(0);
    expect(d.blockers.every((b) => b.attr === "live")).toBe(true);
    expect(d.blockers[0]).toMatchObject({ detail: "no service", name: "Jubilee line" });
    // Nothing to relax: no limit of theirs is in the way.
    expect(d.relax).toBeNull();
  });

  it("someone walking is not rerouted by a lift outage", () => {
    const g = fresh();
    applyLiveStates(g, liftOutageStates(recorded, net, refs(g)));
    const { route } = plan(g, "walking");
    expect(summarise(route, NOW).rides.some((x) => x.to === "Canary Wharf" && x.line === "Jubilee line")).toBe(true);
  });

  it("an outage expires: an hour later, without a refresh, the direct route is back", () => {
    const g = fresh();
    applyLiveStates(g, liftOutageStates(recorded, net, refs(g)));
    const { route } = plan(g, "manual-wheelchair", new Date("2026-10-04T13:30:00Z"));
    expect(summarise(route, NOW).rides.some((x) => x.to === "Canary Wharf" && x.line === "Jubilee line")).toBe(true);
  });

  it.skipIf(!process.env.CAUSEWAY_LIVE)("live: never sends a step-free user through a platform TfL reports out of service right now", async () => {
    const now = new Date();
    const live = await fetchLiftOutages(fetch, now);
    const g = fresh();
    const states = liftOutageStates(live, net, refs(g));
    applyLiveStates(g, states);
    const { route } = plan(g, "manual-wheelchair", new Date(now.getTime() + 60_000));
    // A restricted platform (some platforms only) may be used, at a cost; a closed one never.
    for (const s of route.steps) if (s.edge.ref) expect(states.get(s.edge.ref)?.status, s.edge.ref).not.toBe("closed");
  });
});
