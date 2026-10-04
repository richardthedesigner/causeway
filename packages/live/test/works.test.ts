import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { DRY, evaluateEdge } from "@causeway/router";
import { applyEdgeStates, streetManagerObservations, tflStreetObservations, wktPoints, worksStates, type StreetManagerPermit, type WorksObservation } from "../src/index.js";

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
