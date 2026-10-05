import { describe, expect, it } from "vitest";
import type { LiveState } from "@causeway/graph";
import { applyKeyedStates, floodsHere, floodStates, parseFloodWarnings, type FloodAreas } from "../src/floods.js";

const AT = "2026-10-04T12:00:00Z";
const areas: FloodAreas = {
  area: "newcastle-gateshead",
  source: "Environment Agency flood areas",
  licence: "OGL v3",
  fetchedAt: "2026-10-04",
  areas: {
    "121FWT549": { label: "Tyne estuary at Newcastle Quayside", keys: ["1:10:11", "2:11:12"] },
    "121WAT913": { label: "Tyne estuary", keys: ["1:10:11", "3:12:13"] },
  },
};
// The shape the EA returns, trimmed.
const feed = (items: { id: string; level: number; name: string }[]) => ({
  items: items.map((i) => ({ floodAreaID: i.id, severityLevel: i.level, severity: i.name, description: "", message: "", timeRaised: AT })),
});

describe("Environment Agency flood warnings (DATA-07)", () => {
  it("closes paths under a severe warning, flags them under a warning, and only names an alert", () => {
    const severe = floodStates(parseFloodWarnings(feed([{ id: "121FWT549", level: 1, name: "Severe Flood Warning" }])), areas, AT);
    expect(severe.get("1:10:11")).toMatchObject({ status: "closed", reason: "Severe Flood Warning for Tyne estuary at Newcastle Quayside" });
    const warning = floodStates(parseFloodWarnings(feed([{ id: "121FWT549", level: 2, name: "Flood Warning" }])), areas, AT);
    expect(warning.get("2:11:12")?.status).toBe("restricted");
    const alert = parseFloodWarnings(feed([{ id: "121WAT913", level: 3, name: "Flood Alert" }]));
    expect(floodStates(alert, areas, AT).size).toBe(0);
    expect(floodsHere(alert, areas)).toEqual([{ severity: 3, name: "Flood Alert", label: "Tyne estuary" }]);
  });

  it("keeps the worst where areas overlap, ignores areas we don't cover and warnings no longer in force", () => {
    const s = floodStates(
      parseFloodWarnings(
        feed([
          { id: "121WAT913", level: 2, name: "Flood Warning" },
          { id: "121FWT549", level: 1, name: "Severe Flood Warning" },
          { id: "999XXX", level: 1, name: "Severe Flood Warning" },
          { id: "121FWT549", level: 4, name: "Warning no Longer in Force" },
        ]),
      ),
      areas,
      AT,
    );
    expect(s.get("1:10:11")!.status).toBe("closed");
    expect(s.get("3:12:13")!.status).toBe("restricted");
    expect(s.size).toBe(3);
  });

  it("never weakens a state already on a path", () => {
    const closed: LiveState = { status: "closed", reason: "works", source: "Street Manager", validFrom: AT, validUntil: AT };
    const g = { edges: [{ osmWayId: 1, from: 10, to: 11, live: closed }, { osmWayId: 2, from: 11, to: 12 }] as { osmWayId: number; from: number; to: number; live?: LiveState }[] };
    const n = applyKeyedStates(g, floodStates(parseFloodWarnings(feed([{ id: "121FWT549", level: 2, name: "Flood Warning" }])), areas, AT));
    expect(n).toBe(1);
    expect(g.edges[0]!.live).toBe(closed);
    expect(g.edges[1]!.live?.status).toBe("restricted");
  });
});
