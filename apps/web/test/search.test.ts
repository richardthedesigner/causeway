import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { accessFacts, buildIndex, formatPostcode, parseQuery, search, type PlacesFile } from "../src/lib/search";

const file = JSON.parse(gunzipSync(readFileSync(new URL("../../../data/places/edinburgh-central.json.gz", import.meta.url))).toString()) as PlacesFile;
const index = buildIndex(file, [
  { id: "street:Grassmarket", name: "Grassmarket", kind: "Street", lon: -3.196, lat: 55.9476 },
  { id: "street:Bank Street", name: "Bank Street", kind: "Street", lon: -3.1925, lat: 55.9497 },
]);
const nearMound = { lon: -3.1953, lat: 55.9509 };

describe("search", () => {
  it("parses category and access words", () => {
    expect(parseQuery("accessible toilet")).toMatchObject({ cats: ["amenity=toilets"], accessible: true, terms: [] });
    expect(parseQuery("step-free café")).toMatchObject({ cats: ["amenity=cafe"], accessible: true });
    expect(parseQuery("pub")).toMatchObject({ cats: ["amenity=pub", "amenity=bar"], accessible: false });
  });

  it("finds a named place by prefix", () => {
    const { hits } = search(index, "national muse", nearMound);
    expect(hits[0]?.place.name).toMatch(/National Museum/);
  });

  it("puts an exact street name first", () => {
    expect(search(index, "grassmarket", nearMound).hits[0]?.place.name).toBe("Grassmarket");
  });

  it("lists only toilets mapped as wheelchair accessible, nearest first, and counts the rest", () => {
    const { hits, hiddenNotMapped } = search(index, "accessible toilet", nearMound);
    expect(hits.length).toBeGreaterThan(3);
    for (const h of hits) expect(["yes", "designated"]).toContain(h.access?.wheelchair);
    for (let i = 1; i < hits.length; i++) expect(hits[i]!.metres).toBeGreaterThanOrEqual(hits[i - 1]!.metres);
    expect(hiddenNotMapped).toBeGreaterThan(0);
  });

  it("still finds a street whose name contains a category word", () => {
    expect(search(index, "bank street", nearMound).hits.some((h) => /Bank Street/i.test(h.place.name))).toBe(true);
  });

  it("finds addresses and postcodes", () => {
    expect(search(index, "10 picardy", nearMound).hits[0]?.place.name).toBe("10 Picardy Place");
    expect(formatPostcode("eh13jt")).toBe("EH1 3JT");
    expect(search(index, "EH1 3JT", nearMound).hits[0]?.place.kind).toBe("Postcode");
  });

  it("states access facts as mapped, never as a verdict", () => {
    expect(accessFacts({ wheelchair: "limited", step_count: "1" })).toEqual(["Mapped as partly wheelchair accessible", "1 step at the entrance"]);
    expect(accessFacts({ wheelchair: "yes" }).join(" ")).not.toMatch(/step-free/i);
  });
});
