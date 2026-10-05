import { describe, expect, it } from "vitest";
import { buildIndex } from "../src/lib/search";
import { mergeToiletMap, type ToiletMapFile } from "../src/lib/toiletmap";
import { toiletsAlong } from "../src/lib/toilets";

const NOW = new Date("2026-10-05T12:00:00Z");

const file = (toilets: Partial<ToiletMapFile["toilets"][number]>[]): ToiletMapFile => ({
  area: "edinburgh-central",
  source: "Great British Public Toilet Map",
  licence: "CC BY 4.0",
  exportedAt: "2026-10-04",
  toilets: toilets.map((t, i) => ({ id: `t${i}`, x: -3.19, y: 55.94, name: null, accessible: null, radar: null, free: null, babyChange: null, checked: null, verified: false, ...t })),
});
const osmFile = {
  area: "edinburgh-central",
  source: "test",
  builtAt: "2026-10-04",
  zones: [],
  places: [{ n: "Nicolson Square Toilets", c: "amenity=toilets", x: -3.1866, y: 55.9461, a: { fee: "no" }, id: "n1" }],
  addresses: [],
  postcodes: [],
} as unknown as Parameters<typeof buildIndex>[0];

describe("Toilet Map (DATA-09)", () => {
  it("fills the facts OSM is missing on the same toilet, keeping OSM's own, and says when it was checked", () => {
    const index = buildIndex(osmFile, []);
    const r = mergeToiletMap(index, file([{ x: -3.18665, y: 55.94612, accessible: true, radar: true, free: false, verified: true, checked: "2025-03-01", hours: "Mo-Su 09:00-18:00" }]), NOW);
    expect(r).toEqual({ added: 0, filled: 1, disputed: 0 });
    const e = index.entries.find((x) => x.place.name === "Nicolson Square Toilets")!;
    expect(e.access).toMatchObject({ fee: "no", wheelchair: "yes", centralkey: "yes", opening_hours: "Mo-Su 09:00-18:00" });
    expect(e.place.facts).toContain("Mapped as a wheelchair accessible toilet");
    expect(e.place.factsSource).toMatch(/Great British Public Toilet Map, checked Mar 2025/);
  });

  it("adds a toilet OSM hasn't mapped, which then counts on routes", () => {
    const index = buildIndex(osmFile, []);
    expect(mergeToiletMap(index, file([{ name: "Bandstand", x: -3.2, y: 55.94, accessible: true, radar: true, checked: "2024-01-05" }]), NOW)).toEqual({ added: 1, filled: 0, disputed: 0 });
    const along = toiletsAlong(index, [[-3.21, 55.94], [-3.19, 55.94]]);
    expect(along.toilets.map((t) => [t.name, t.public, t.facts.includes("RADAR key")])).toEqual([["Bandstand", true, true]]);
  });

  it("does nothing without a file", () => {
    expect(mergeToiletMap(buildIndex(osmFile, []), null)).toEqual({ added: 0, filled: 0, disputed: 0 });
  });
});

describe("Toilet Map disputes and old records (D-065)", () => {
  const osmYes = { ...osmFile, places: [{ ...osmFile.places[0]!, a: { wheelchair: "yes" } }] } as typeof osmFile;

  it("says first when OSM and the Toilet Map disagree on access, and keeps the toilet off routes", () => {
    const index = buildIndex(osmYes, []);
    const r = mergeToiletMap(index, file([{ x: -3.18665, y: 55.94612, accessible: false, verified: true, checked: "2026-03-01" }]), NOW);
    expect(r.disputed).toBe(1);
    const e = index.entries.find((x) => x.place.name === "Nicolson Square Toilets")!;
    expect(e.disputed).toBe(true);
    expect(e.place.facts![0]).toBe("Sources differ: OpenStreetMap says accessible, the Toilet Map says not accessible. Mapped as a wheelchair accessible toilet");
    // Listed on the route, saying so, but it doesn't count as a stop.
    const along = toiletsAlong(index, [[-3.19, 55.9461], [-3.18, 55.9461]]);
    expect(along.toilets[0]!.facts[0]).toBe("Sources differ on access");
    expect(along.longestGapM).toBeGreaterThan(600);
  });

  it("says a record over 2 years old may be out of date, after any dispute", () => {
    const index = buildIndex(osmYes, []);
    mergeToiletMap(index, file([{ x: -3.18665, y: 55.94612, accessible: false, verified: true, checked: "2023-06-01" }]), NOW);
    const e = index.entries.find((x) => x.place.name === "Nicolson Square Toilets")!;
    expect(e.place.facts![0]).toMatch(/^Sources differ: OpenStreetMap says accessible, the Toilet Map says not accessible\. Toilet Map last checked Jun 2023, may be out of date\. Mapped/);
    expect(e.place.factsSource).toMatch(/checked Jun 2023, over 2 years ago/);
  });

  it("ranks an old toilet a little lower in search than a recent one", () => {
    const index = buildIndex({ ...osmFile, places: [] } as typeof osmFile, []);
    mergeToiletMap(index, file([{ name: "Old Loo", x: -3.2, y: 55.94, accessible: true, checked: "2020-01-01" }, { name: "New Loo", x: -3.21, y: 55.94, accessible: true, checked: "2026-01-01" }]), NOW);
    const [old, fresh] = ["Old Loo", "New Loo"].map((n) => index.entries.find((x) => x.place.name === n)!);
    expect(old!.rank).toBeGreaterThan(fresh!.rank);
    expect(old!.place.facts![0]).toBe("Toilet Map last updated Jan 2020, may be out of date. Mapped as a wheelchair accessible toilet");
    expect(fresh!.place.facts![0]).toBe("Mapped as a wheelchair accessible toilet");
  });
});
