import { beforeEach, describe, expect, it } from "vitest";
import { loadSaved, savedMarkers, savePlace, unsavePlace } from "../src/lib/saved-places";
import type { Place } from "../src/lib/plan-types";

const place = (id: string): Place => ({ id, name: id, kind: "Street", lon: -3.19, lat: 55.95 });

describe("saved places (FEAT-04)", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
  });

  it("keeps home first, then work, then the rest as saved, one list per city", () => {
    savePlace("edinburgh", "Mum's", place("a"));
    savePlace("edinburgh", "Work", place("b"));
    savePlace("edinburgh", "  home ", place("c"));
    expect(loadSaved("edinburgh").map((s) => s.label)).toEqual(["home", "Work", "Mum's"]);
    expect(loadSaved("london")).toEqual([]);
  });

  it("replaces a place saved twice, or a name used twice", () => {
    savePlace("edinburgh", "Home", place("a"));
    savePlace("edinburgh", "Gran's", place("a"));
    expect(loadSaved("edinburgh").map((s) => [s.label, s.place.id])).toEqual([["Gran's", "a"]]);
    savePlace("edinburgh", "gran's", place("b"));
    expect(loadSaved("edinburgh").map((s) => [s.label, s.place.id])).toEqual([["gran's", "b"]]);
  });

  it("ignores a blank name, cuts a long one, and removes", () => {
    savePlace("edinburgh", "   ", place("a"));
    expect(loadSaved("edinburgh")).toEqual([]);
    savePlace("edinburgh", "x".repeat(60), place("a"));
    expect(loadSaved("edinburgh")[0]!.label).toHaveLength(40);
    expect(unsavePlace("edinburgh", "a")).toEqual([]);
    expect(loadSaved("edinburgh")).toEqual([]);
  });

  it("survives a damaged list", () => {
    localStorage.setItem("causewayside.saved.edinburgh.v1", "{not json");
    expect(loadSaved("edinburgh")).toEqual([]);
    localStorage.setItem("causewayside.saved.edinburgh.v1", JSON.stringify([{ label: "Home" }, { label: "Work", place: place("b") }]));
    expect(loadSaved("edinburgh").map((s) => s.label)).toEqual(["Work"]);
  });

  it("shows every saved place on the map except where the route already marks it (SMALL-13)", () => {
    savePlace("edinburgh", "Home", place("a"));
    savePlace("edinburgh", "Mum's", place("b"));
    const list = loadSaved("edinburgh");
    expect(savedMarkers(list, []).map((m) => [m.id, m.label])).toEqual([["a", "Home"], ["b", "Mum's"]]);
    expect(savedMarkers(list, ["a", null, undefined]).map((m) => m.id)).toEqual(["b"]);
    expect(savedMarkers(list, ["a", "b"])).toEqual([]);
    expect(savedMarkers(list, [])[0]).toEqual({ id: "a", label: "Home", lon: -3.19, lat: 55.95 });
  });
});
