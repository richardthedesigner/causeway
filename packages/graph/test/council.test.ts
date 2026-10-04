import { describe, expect, it } from "vitest";
import { applyCouncilFootways, councilSurface, type CouncilFootways } from "../src/council.js";
import { attr, unknownAttr } from "../src/attribute.js";
import type { Graph } from "../src/schema.js";

const layer: CouncilFootways = {
  area: "edinburgh-central",
  source: "City of Edinburgh Council, Adopted Roads",
  licence: "OGL v3",
  fetchedAt: "2026-10-04",
  edges: { "10:1:2": ["sett", 1.4, 0], "11:2:3": ["paving_stones", 2.2, 1] },
};
const edge = (way: number, from: number, to: number, surface = unknownAttr<string>(), width = unknownAttr<number>()) => ({ osmWayId: way, from, to, attrs: { surface, width } });

describe("council footways (DATA-06, D-008)", () => {
  it("maps Edinburgh's surface names, and says nothing for vague ones", () => {
    expect(["Setts", "Concrete Flags", "Stone Flags or Imitation", "Block Paving", "Concrete", "HRA", "DBM", "Surface Dressing", "Other", "Unknown", "Hard Landscaping"].map(councilSurface)).toEqual([
      "sett", "paving_stones", "paving_stones", "paving_stones", "concrete", "asphalt", "asphalt", "asphalt", null, null, null,
    ]);
  });

  it("fills only what OSM doesn't know, and says where it came from", () => {
    const osmSurface = attr("asphalt", "reported", "osm", null);
    const g = { edges: [edge(10, 1, 2), edge(11, 2, 3, osmSurface), edge(12, 3, 4)] } as unknown as Graph;
    expect(applyCouncilFootways(g, layer)).toBe(2);
    const [a, b, c] = g.edges;
    expect(a!.attrs.surface).toMatchObject({ value: "sett", state: "reported", source: "council", observedAt: "2026-10-04" });
    expect(a!.attrs.width.value).toBe(1.4);
    // OSM's surface stays; the council width fills the gap, marked as the footway alongside.
    expect(b!.attrs.surface).toBe(osmSurface);
    expect(b!.attrs.width).toMatchObject({ value: 2.2, source: "council" });
    expect(b!.attrs.width.method).toMatch(/footway alongside/);
    expect(c!.attrs.surface.value).toBeNull();
  });
});
