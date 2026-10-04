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

describe("address matching", () => {
  it("normalises street addresses", async () => {
    const { streetAddress } = await import("./overture-merge.js");
    expect(streetAddress("30 Grindlay St, EH3 9AX")).toBe("30 grindlay street");
    expect(streetAddress("30 Grindlay Street")).toBe("30 grindlay street");
    expect(streetAddress("Grindlay Street")).toBeNull();
  });

  it("drops a same-address place of the same kind under another name, but keeps other businesses in the building", () => {
    const osmHotel = [{ n: "InterContinental Edinburgh", x: -3.1925, y: 55.9535, ad: "19-21 George Street, EH2 2PB", c: "tourism=hotel" }];
    const ovHotel = { id: "h", n: "The George", c: "hotel", x: -3.1926, y: 55.9535, ad: "19-21 George St", conf: 0.95 };
    expect(mergeOverture(osmHotel, [ovHotel])).toEqual([]);
    expect(mergeOverture(osmHotel, [{ ...ovHotel, ad: "25 George St" }])).toHaveLength(1);
    expect(mergeOverture(osmHotel, [{ ...ovHotel, n: "Smith Accountants", c: "accountant" }])).toHaveLength(1);
  });
});

describe("scraped records (D-028, survey §9)", () => {
  const atp = ["AllThePlaces", "Overture"];
  it("leaves out AllThePlaces-only Changing Places toilets and health services", () => {
    const out = mergeOverture([], [
      { ...ov("Changing Places", { c: "public_restroom" }), src: atp },
      { ...ov("Braefoot Medical Practice", { c: "doctors_office" }), h: ["health_care", "outpatient_care_facility", "doctors_office"], src: atp },
      { ...ov("Avante Pharmacy", { c: "pharmacy" }), src: atp },
    ]);
    expect(out).toEqual([]);
  });

  it("keeps the same kinds of place from another source, and other AllThePlaces records", () => {
    const out = mergeOverture([], [
      { ...ov("Braefoot Medical Practice", { c: "doctors_office" }), h: ["health_care"], src: ["AllThePlaces", "Foursquare", "Overture"] },
      { ...ov("Library", { c: "library" }), src: atp },
      { ...ov("Toilets", { c: "public_restroom" }), src: ["meta", "Overture"] },
    ]);
    expect(out.map((p) => p.n)).toEqual(["Braefoot Medical Practice", "Library", "Toilets"]);
  });
});
