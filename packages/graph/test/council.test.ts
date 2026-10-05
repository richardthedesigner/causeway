import { describe, expect, it } from "vitest";
import { applyCouncilFootways, councilSurface, type CouncilFootways } from "../src/council.js";
import { attr, unknownAttr } from "../src/attribute.js";
import type { Graph } from "../src/schema.js";

const layer: CouncilFootways = {
  area: "edinburgh-central",
  source: "City of Edinburgh Council, Adopted Roads",
  licence: "OGL v3",
  observedAt: "2026-10-01",
  edges: { "10:1:2": ["sett", 1.4, 0], "11:2:3": ["paving_stones", 2.2, 1] },
};
const edge = (way: number, from: number, to: number, surface = unknownAttr<string>(), width = unknownAttr<number>()) => ({ osmWayId: way, from, to, attrs: { surface, width } });

describe("council footways (DATA-06, D-008)", () => {
  it("maps Edinburgh's surface names, and says nothing for vague ones", () => {
    expect(["Setts", "Concrete Flags", "Stone Flags or Imitation", "Block Paving", "Concrete", "HRA", "DBM", "Surface Dressing", "Other", "Unknown", "Hard Landscaping"].map(councilSurface)).toEqual([
      "sett", "paving_stones", "paving_stones", "paving_stones", "concrete", "asphalt", "asphalt", null, null, null, null,
    ]);
  });

  it("fills only what OSM doesn't know, and says where it came from", () => {
    const osmSurface = attr("asphalt", "reported", "osm", null);
    const g = { edges: [edge(10, 1, 2), edge(11, 2, 3, osmSurface), edge(12, 3, 4)] } as unknown as Graph;
    expect(applyCouncilFootways(g, layer)).toBe(2);
    const [a, b, c] = g.edges;
    expect(a!.attrs.surface).toMatchObject({ value: "sett", state: "inferred", source: "council", observedAt: "2026-10-01" });
    // Inferred, so a narrow council width costs time and never closes the pavement (D-046).
    expect(a!.attrs.width).toMatchObject({ value: 1.4, state: "inferred" });
    // OSM's surface stays; the council width fills the gap, marked as the footways alongside.
    expect(b!.attrs.surface).toBe(osmSurface);
    expect(b!.attrs.width).toMatchObject({ value: 2.2, source: "council" });
    expect(b!.attrs.width.method).toMatch(/footways alongside/);
    expect(c!.attrs.surface.value).toBeNull();
  });

  it("says nothing for Grass, so a verge can't close a pavement (D-062)", () => {
    expect(councilSurface("Grass")).toBeNull();
  });

  it("on a street proxy whose OSM surface is only the carriageway's, the council's pavement surface wins (DATA-22)", () => {
    const carriageway = attr("sett", "inferred", "osm", null, "carriageway surface (OSM surface); the pavement may differ");
    const sidewalkTag = attr("sett", "reported", "osm", null, "OSM sidewalk:both:surface");
    const g = {
      edges: [
        { ...edge(11, 2, 3, carriageway), kind: "street_proxy" },
        { ...edge(11, 2, 3, sidewalkTag), kind: "street_proxy" },
        // A footway's own inferred OSM surface isn't the carriageway's: it stays.
        { ...edge(11, 2, 3, { ...carriageway, method: "OSM surface" }), kind: "footway" },
      ],
    } as unknown as Graph;
    applyCouncilFootways(g, layer);
    expect(g.edges[0]!.attrs.surface).toMatchObject({ value: "paving_stones", state: "inferred", source: "council" });
    expect(g.edges[0]!.attrs.surface.method).toMatch(/OSM's sett is the carriageway's/);
    expect(g.edges[1]!.attrs.surface).toBe(sidewalkTag);
    expect(g.edges[2]!.attrs.surface.value).toBe("sett");
  });
});

describe("gritting routes (DATA-07)", () => {
  it("marks every pavement on or off a gritting route when the layer has gritting data", () => {
    const g = { edges: [{ ...edge(10, 1, 2), kind: "sidewalk" }, { ...edge(13, 4, 5), kind: "footway" }, { ...edge(14, 5, 6), kind: "steps" }] } as unknown as Graph;
    applyCouncilFootways(g, { ...layer, gritting: "Pavement gritting routes", grittingObservedAt: "2021-05-27", edges: { "10:1:2": [null, null, 0, 1] } });
    // Dated when the council published the routes, not when we built the layer.
    expect(g.edges[0]!.attrs.gritted).toMatchObject({ value: true, source: "council", observedAt: "2021-05-27" });
    expect(g.edges[1]!.attrs.gritted).toMatchObject({ value: false });
    expect(g.edges[2]!.attrs.gritted).toBeUndefined();
  });
});
