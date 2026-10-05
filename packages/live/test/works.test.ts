import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { DRY, evaluateEdge } from "@causeway/router";
import {
  FOOTWAY_CLOSED,
  TFL_FOOTWAY_CLOSED,
  applyEdgeStates,
  saysClosed,
  simplifyLine,
  srwrObservations,
  streetManagerActivityObservations,
  streetManagerObservations,
  tflStreetObservations,
  wktParts,
  wktPoints,
  worksStates,
  type SrwrActivity,
  type StreetManagerActivity,
  type StreetManagerPermit,
  type WorksObservation,
} from "../src/index.js";

const NOW = new Date("2026-10-04T12:00:00Z");
const permit = (over: Partial<StreetManagerPermit>): StreetManagerPermit => ({
  ref: "X-01",
  event_time: "2026-09-20T10:00:00Z",
  event_type: "PERMIT_GRANTED",
  geom: "POINT(425000 564000)",
  street: "GREY STREET",
  town: "NEWCASTLE",
  promoter: "Northern Gas Networks",
  activity: "Utility repair and maintenance works",
  location_type: "Footway",
  close_footway: "no",
  status: "planned",
  permit_status: "granted",
  start: "2026-10-01T00:00:00Z",
  end: "2026-10-10T00:00:00Z",
  proposed_end: "2026-10-10T00:00:00Z",
  ...over,
});
const ident = (e: number, n: number): [number, number] => [e, n];

describe("Street Manager adapter", () => {
  it("reads WKT", () => expect(wktPoints("LINESTRING(1 2,3.5 4)")).toEqual([[1, 2], [3.5, 4]]));

  it("closes the pavement for a diversion, degrades it for a temporary walkway or works on it", () => {
    const [a, b, c] = streetManagerObservations(
      [permit({ ref: "a", close_footway: "yes_provide_alternative_route" }), permit({ ref: "b", close_footway: "yes_provide_pedestrian_walkway" }), permit({ ref: "c" })],
      ident,
      NOW,
    );
    expect(a!.footway).toBe("closed");
    expect(b!.footway).toBe("affected");
    expect(b!.description).toMatch(/temporary walkway/);
    expect(c!.footway).toBe("affected");
    expect(a!.street).toBe("Grey Street");
  });

  it("leaves out carriageway-only, finished, cancelled and past works", () => {
    const out = streetManagerObservations(
      [
        permit({ ref: "road", location_type: "Carriageway" }),
        permit({ ref: "done", status: "completed" }),
        permit({ ref: "stop", event_type: "WORK_STOP" }),
        permit({ ref: "cancel", permit_status: "cancelled" }),
        permit({ ref: "past", end: "2026-09-30T00:00:00Z" }),
      ],
      ident,
      NOW,
    );
    expect(out).toEqual([]);
  });
});

describe("TfL street adapter", () => {
  it("keeps only disruptions that mention the pavement", () => {
    const seg = { distruptedStreetId: "1", streetName: "MARSH WALL (E14)", lineString: "[[-0.02,51.5],[-0.021,51.5]]", closure: "Closed", category: "Works", startDateTime: "2026-10-01T00:00:00Z", endDateTime: "2026-10-09T00:00:00Z" };
    const out = tflStreetObservations([{ ...seg, comments: "Lane closure for Thames Water works" }, { ...seg, distruptedStreetId: "2", comments: "Footway closed, pedestrians diverted to the opposite side" }], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.footway).toBe("closed");
    expect(out[0]!.street).toBe("Marsh Wall");
  });

  it("doesn't close a pavement when TfL's words deny the closure", () => {
    const seg = { distruptedStreetId: "1", streetName: "MARSH WALL", lineString: "[[-0.02,51.5],[-0.021,51.5]]", closure: "Closed", category: "Works", startDateTime: "2026-10-01T00:00:00Z", endDateTime: "2026-10-09T00:00:00Z" };
    const out = tflStreetObservations([{ ...seg, comments: "Lane closure. No footway closed, pedestrians kept on the north side" }], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.footway).toBe("affected");
  });
});

describe("saysClosed", () => {
  it("reads plain closures as closed", () => {
    for (const t of ["footway closed, pedestrians diverted", "pavement will be closed", "closed to pedestrians", "pedestrians diverted"]) expect(saysClosed(TFL_FOOTWAY_CLOSED, t), t).toBe(true);
  });
  it("does not close a pavement when the words around the phrase deny it", () => {
    for (const t of ["no footway closed", "works without pavement closed", "footway closed: n/a", "pavement closed: not required", "pedestrians diverted: none"]) expect(saysClosed(TFL_FOOTWAY_CLOSED, t), t).toBe(false);
  });
  it("still closes when a plain closure sits beside a denied one", () => {
    expect(saysClosed(TFL_FOOTWAY_CLOSED, "no footway closed on the north side. footway closed on the south side")).toBe(true);
  });
});

describe("Street Manager activities", () => {
  const act = (over: Partial<StreetManagerActivity>): StreetManagerActivity => ({
    ref: "A-1",
    event_time: "2026-09-20T10:00:00Z",
    event_type: "ACTIVITY_CREATED",
    geom: "POINT(425000 564000)",
    street: "GREY STREET",
    activity: "scaffolding",
    details: "Scaffold outside 12 Grey Street for J Smith Builders",
    location_type: "Footway",
    cancelled: "No",
    start_date: "2026-10-01",
    start_time: null,
    end_date: "2026-10-20",
    end_time: null,
    ...over,
  });
  it("describes them in our own words, never the record's free text", () => {
    const out = streetManagerActivityObservations([act({}), act({ ref: "A-2", activity: "unknown_kind", details: "Impact Area" })], ident, NOW);
    expect(out.map((o) => o.description)).toEqual(["Scaffolding on the pavement", "An obstruction on the pavement"]);
    expect(JSON.stringify(out)).not.toMatch(/Smith|Impact/);
    expect(out.every((o) => o.footway === "affected")).toBe(true);
  });
  it("closes the pavement only when its own words say so, and still shows none of them (D-027)", () => {
    const [o] = streetManagerActivityObservations([act({ activity: "crane_mobile_platform", location_description: "Footway closed, pedestrians diverted opposite No 12" })], ident, NOW);
    expect(o).toMatchObject({ footway: "closed", description: "Pavement closed", headline: "A crane or mobile platform on the pavement" });
    expect(JSON.stringify(o)).not.toMatch(/No 12|diverted/);
    for (const t of [{ name: "No footway closure required" }, { details: "Footway closure: N/A" }, { location_description: "Diversion route: Grey Street" }]) {
      expect(streetManagerActivityObservations([act(t)], ident, NOW)[0]!.footway, JSON.stringify(t)).toBe("affected");
    }
  });
  it("says path for a footpath on its own", () => {
    expect(streetManagerActivityObservations([act({ location_type: "Footpath" })], ident, NOW)[0]!.description).toBe("Scaffolding on the path");
    expect(streetManagerActivityObservations([act({ location_type: "Footway, Carriageway" })], ident, NOW)[0]!.description).toBe("Scaffolding on the pavement");
  });
  it("leaves out activities starting more than five weeks away, and splits a multi-part shape", () => {
    expect(streetManagerActivityObservations([act({ start_date: "2026-12-01", end_date: "2026-12-05" })], ident, NOW)).toEqual([]);
    const out = streetManagerActivityObservations([act({ geom: "MULTIPOINT((425000 564000),(425100 564100))" })], ident, NOW);
    expect(out.map((o) => o.id)).toEqual(["sma:A-1#0", "sma:A-1#1"]);
  });
});

describe("works on the Newcastle graph", () => {
  const g = loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/newcastle-gateshead.graph.json.gz"));
  const file = JSON.parse(readFileSync(join(import.meta.dirname, "../../../data/live/newcastle-gateshead.works.json"), "utf8")) as { works: WorksObservation[] };

  it("closes pavement edges near a closure for everyone, only while the works last", () => {
    const states = worksStates(file.works, g.edges, NOW);
    expect(applyEdgeStates(g, states, ["Street Manager"])).toBeGreaterThan(0);
    const closed = g.edges.find((e) => e.live?.status === "closed" && Date.parse(e.live.validFrom) <= NOW.getTime() && Date.parse(e.live.validUntil) > NOW.getTime())!;
    expect(closed).toBeTruthy();
    expect(evaluateEdge(closed, true, PRESETS.walking, DRY).cost).toBe(Infinity);
    const after = { ...DRY, now: new Date(Date.parse(closed.live!.validUntil) + 60_000) };
    expect(evaluateEdge(closed, true, PRESETS.walking, after).cost).toBeLessThan(Infinity);
  });

  it("never touches rail or lift edges", () => {
    for (const e of g.edges) if (e.live?.source === "Street Manager") expect(["sidewalk", "footway", "pedestrian", "street_proxy", "ramp"]).toContain(e.kind);
  });
});

const srwr = (over: Partial<SrwrActivity>): SrwrActivity => ({
  ref: "CE010-S1/1",
  category: "Minor With Excavation",
  licence: "",
  traffic: "Works Entirely On The Footway",
  status: "In Progress",
  location: "O/S 12",
  description: "Replace damaged slabs for Mr Smith - R/26/44023",
  street: "Forrest Road",
  start: "2026-10-01T00:00:00Z",
  end: "2026-10-10T00:00:00Z",
  updated: "2026-09-30T10:00:00Z",
  geom: "LINESTRING (325000 673000, 325010 673000)",
  ...over,
});

describe("Scottish Road Works Register adapter (D-057)", () => {
  it("splits multi-part WKT so parts are never joined up", () => {
    expect(wktParts("MULTIPOLYGON (((1 1, 2 1, 2 2, 1 1)), ((5 5, 6 5, 6 6, 5 5)))")).toEqual([
      [[1, 1], [2, 1], [2, 2], [1, 1]],
      [[5, 5], [6, 5], [6, 6], [5, 5]],
    ]);
    expect(wktParts("MULTIPOINT ((1 2), (3 4))")).toEqual([[[1, 2]], [[3, 4]]]);
    expect(wktParts("POINT (1 2)")).toEqual([[[1, 2]]]);
  });

  it("simplifies lines without moving their ends", () => {
    const line: [number, number][] = [[-3.19, 55.95], [-3.18995, 55.950000001], [-3.1899, 55.95]];
    expect(simplifyLine(line)).toEqual([[-3.19, 55.95], [-3.1899, 55.95]]);
  });

  it("treats footway works as on the pavement, and closed only when the register says so", () => {
    const [a, b] = srwrObservations([srwr({}), srwr({ ref: "b", description: "Footway closure for cell site construction" })], ident, NOW);
    expect(a).toMatchObject({ id: "srwr:CE010-S1/1", footway: "affected", headline: "Works on the pavement", description: "Works on the pavement", source: "Scottish Road Works Register", street: "Forrest Road" });
    expect(b).toMatchObject({ footway: "closed", headline: "Pavement closed" });
  });

  it("never shows the register's free text or the promoter: our own words and the street", () => {
    const out = srwrObservations(
      [srwr({}), srwr({ ref: "cafe", licence: "Street Café", traffic: "No Obstruction On C/W Or F/W", category: "Permission", status: "Commenced", description: "Dishoom-562356" })],
      ident,
      NOW,
    );
    expect(out).toHaveLength(2);
    expect(JSON.stringify(out)).not.toMatch(/Smith|slabs|Dishoom|562356|44023/);
  });

  it("keeps café footprints as narrowing, never closing, the pavement", () => {
    const [c] = srwrObservations(
      [srwr({ licence: "Street Café", traffic: "No Obstruction On C/W Or F/W", category: "Permission", status: "Commenced", description: "Pavement closed to pedestrians", geom: "POLYGON ((1 1, 2 1, 2 2, 1 1))" })],
      ident,
      NOW,
    );
    expect(c).toMatchObject({ footway: "affected", headline: "Café tables on the pavement" });
  });

  it("keeps road closures only when they mention the footway, and site permits only on it", () => {
    const out = srwrObservations(
      [
        srwr({ ref: "rc", traffic: "Road Closure", location: "Entire street", description: "Carriageway resurfacing" }),
        srwr({ ref: "rcf", traffic: "Road Closure", location: "on C/WAY and F/WAY", description: "Resurfacing and footway improvements" }),
        srwr({ ref: "rcx", traffic: "Road Closure", location: "At railway bridge", description: "Examination with a full road closure (Including Footpaths)." }),
        srwr({ ref: "nb", traffic: "Road Closure", location: "Full width, footways and carriageway", description: "Bridge refurbishment" }),
        srwr({ ref: "cab", licence: "Containers/Cabins/Storage", traffic: "Road Narrowing (Two Way Working)", location: "C/Way o/s 16", description: "Welfare cabins" }),
        srwr({ ref: "scaf", licence: "Scaffolding", category: "Permission", description: "Scaffolding (R/26/44023)" }),
        srwr({ ref: "emb", licence: "Seasonal Embargo", category: "Event", traffic: "No Obstruction On C/W Or F/W", description: "Winter Embargo - no obstruction on C/W or F/W" }),
        srwr({ ref: "ev", licence: "Public Event", category: "Event", location: "Event entirely on footway at Old Colt Bridge", description: "Christmas market" }),
      ],
      ident,
      NOW,
    );
    expect(out.map((o) => [o.id, o.footway, o.headline])).toEqual([
      ["srwr:rcf", "affected", "Road closed, works on the pavement"],
      ["srwr:rcx", "closed", "Road and pavement closed"],
      // North Bridge: "full width, footways and carriageway" says where the works are, not that people are shut out.
      ["srwr:nb", "affected", "Road closed, works on the pavement"],
      ["srwr:scaf", "affected", "Scaffolding on the pavement"],
      ["srwr:ev", "affected", "Event on the pavement"],
    ]);
  });

  it("leaves out early notices, ended works and works starting more than five weeks away", () => {
    const out = srwrObservations(
      [
        srwr({ ref: "pot", status: "Potential" }),
        srwr({ ref: "adv", status: "Advance Planning", category: "Major", start: "2026-10-01T00:00:00Z", end: "2027-06-06T00:00:00Z" }),
        srwr({ ref: "past", end: "2026-10-01T00:00:00Z" }),
        srwr({ ref: "far", start: "2026-12-01T00:00:00Z", end: "2026-12-10T00:00:00Z" }),
      ],
      ident,
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("closes only on plain words, not denied ones", () => {
    for (const t of ["Footway closed, pedestrians diverted", "Footway closure required", "Road closure including footways", "Closed to pedestrians", "Footpath diversion in place"]) expect(saysClosed(FOOTWAY_CLOSED, t), t).toBe(true);
    for (const t of ["No footway closure required", "Footway closure not required", "Footway closure: N/A", "Works without footway closure", "Footway closure isn't needed"]) expect(saysClosed(FOOTWAY_CLOSED, t), t).toBe(false);
  });
});

describe("register works on the Edinburgh graph", () => {
  const g = loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz"));
  const file = JSON.parse(readFileSync(join(import.meta.dirname, "../../../data/live/edinburgh-central.works.json"), "utf8")) as { source: string; works: WorksObservation[] };

  it("says where it came from, in our own words", () => {
    expect(file.source).toMatch(/^Scottish Road Works Register, disruptions export \d{4}-\d{2}-\d{2}$/);
    expect(file.works.length).toBeGreaterThan(0);
    for (const w of file.works) {
      expect(w.description).toMatch(/^(Café tables|Event|Road closed|Road and pavement closed|Works|Pavement closed|Building site|Scaffolding|Site cabins|Hoarding|Skip|Building materials)/);
      if (w.headline === "Café tables on the pavement") expect(w.footway).toBe("affected");
    }
  });

  it("puts works only on pavement edges, quickly, with their own words", () => {
    const at = new Date(Math.max(...file.works.filter((w) => w.headline === "Café tables on the pavement").map((w) => Date.parse(w.start))));
    const t0 = performance.now();
    const states = worksStates(file.works, g.edges, at);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(applyEdgeStates(g, states, ["Scottish Road Works Register"])).toBeGreaterThan(0);
    for (const e of g.edges) if (e.live?.source === "Scottish Road Works Register") expect(["sidewalk", "footway", "pedestrian", "street_proxy", "ramp"]).toContain(e.kind);
    const cafe = g.edges.find((e) => e.live?.headline === "Café tables on the pavement")!;
    expect(cafe).toBeTruthy();
    const ev = evaluateEdge(cafe, true, PRESETS.walking, { ...DRY, now: at });
    expect(ev.passable).toBe("unknown");
    expect(ev.reasons.find((r) => r.attr === "live")!.detail).toMatch(/^Café tables on the pavement( on .+)? until \d{4}-\d{2}-\d{2}$/);
  });
});
