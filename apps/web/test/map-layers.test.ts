import { attr, unknownAttr, type GraphEdge, type KerbInfo } from "@causeway/graph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isNarrow, isRough, layersFor, loadMapLayers, mapBenches, mapKerbs, sameLayers, saveMapLayers } from "../src/lib/map-layers";

const edge = (a: Partial<GraphEdge["attrs"]>) => ({ attrs: { surface: unknownAttr(), smoothness: unknownAttr(), width: unknownAttr(), ...a } }) as Pick<GraphEdge, "attrs">;
const osm = <T,>(v: T) => attr(v, "reported", "osm", "2026-01-01T00:00:00Z");

describe("map layers (FEAT-49)", () => {
  it("suit the kind of mobility before you choose", () => {
    expect(layersFor("manual-wheelchair")).toEqual({ slopes: false, steps: true, rough: true, narrow: true, kerbs: true, toilets: true, benches: false });
    expect(layersFor("rollator").benches).toBe(true);
    expect(layersFor("mobility-scooter").kerbs).toBe(true);
    expect(layersFor("visual-impairment")).toEqual({ slopes: false, steps: true, rough: false, narrow: false, kerbs: true, toilets: true, benches: false });
    expect(layersFor("walking-stick")).toEqual({ slopes: false, steps: true, rough: true, narrow: false, kerbs: false, toilets: true, benches: true });
  });

  it("mark setts, cobbles, gravel, grass and bad going as rough, and nothing unknown", () => {
    expect(isRough(edge({ surface: osm("sett") }))).toBe(true);
    expect(isRough(edge({ surface: osm("gravel") }))).toBe(true);
    expect(isRough(edge({ surface: osm("asphalt"), smoothness: osm("very_bad") }))).toBe(true);
    expect(isRough(edge({ surface: osm("paving_stones") }))).toBe(false);
    expect(isRough(edge({}))).toBe(false);
  });

  it("call a path narrow only when its width is known and under 1.5 m", () => {
    expect(isNarrow(edge({ width: osm(1.2) }))).toBe(true);
    expect(isNarrow(edge({ width: osm(1.5) }))).toBe(false);
    expect(isNarrow(edge({}))).toBe(false);
  });

  it("show mapped kerbs only: rolled counts as raised", () => {
    const k = (type: KerbInfo["type"]) => ({ lon: 1, lat: 2, kerb: { type, heightCm: unknownAttr<number>(), tactilePaving: unknownAttr<boolean>() } });
    const nodes = [k(osm("lowered")), k(osm("flush")), k(osm("raised")), k(osm("rolled")), k(unknownAttr()), { lon: 0, lat: 0 }];
    expect(mapKerbs(nodes).map((x) => x.raised)).toEqual([false, false, true, true]);
  });

  it("take benches from the amenities, not toilets", () => {
    expect(mapBenches([{ lon: 1, lat: 2, kind: "bench" }, { lon: 3, lat: 4, kind: "toilets" }])).toEqual([[1, 2]]);
    expect(mapBenches(undefined)).toEqual([]);
  });

  describe("your choice", () => {
    beforeEach(() => {
      const m = new Map<string, string>();
      vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
    });
    it("is kept, and forgotten on reset", () => {
      expect(loadMapLayers()).toBeNull();
      const mine = { ...layersFor("walking"), slopes: true };
      saveMapLayers(mine);
      expect(loadMapLayers()).toEqual(mine);
      saveMapLayers(null);
      expect(loadMapLayers()).toBeNull();
    });
    it("is ignored when it can't be read", () => {
      localStorage.setItem("causewayside.map-layers.v1", JSON.stringify({ slopes: "yes" }));
      expect(loadMapLayers()).toBeNull();
      localStorage.setItem("causewayside.map-layers.v1", "{");
      expect(loadMapLayers()).toBeNull();
    });
  });

  it("compare by every switch", () => {
    expect(sameLayers(layersFor("powerchair"), layersFor("pram"))).toBe(true);
    expect(sameLayers(layersFor("powerchair"), layersFor("walking"))).toBe(false);
  });
});
