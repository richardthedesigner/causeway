import { describe, expect, it } from "vitest";
import { mergeOverture } from "./overture-merge.js";

const osm = [{ n: "Edward and Irwin", x: -3.2, y: 55.95 }];
const ov = (n: string, over: Partial<{ c: string | null; conf: number; x: number }> = {}) => ({ id: n, n, c: "fashion_and_apparel_store", x: -3.2001, y: 55.95, ad: null, conf: 0.9, ...over });

describe("mergeOverture", () => {
  it("drops a spelling variant of an OSM place next door", () => {
    expect(mergeOverture(osm, [ov("Edward & Irwyn")])).toEqual([]);
  });

  it("keeps a different place nearby, mapping a known category to the OSM tag", () => {
    const [p] = mergeOverture(osm, [ov("Söderberg", { c: "cafe" })]);
    expect(p).toMatchObject({ n: "Söderberg", c: "amenity=cafe", src: "overture" });
  });

  it("keeps the same name far away, and skips low confidence, uncategorised and home services", () => {
    expect(mergeOverture(osm, [ov("Edward and Irwin", { x: -3.19 })])).toHaveLength(1);
    expect(mergeOverture(osm, [ov("A", { conf: 0.5 }), ov("B", { c: null }), ov("C", { c: "home_service" })])).toEqual([]);
  });
});
