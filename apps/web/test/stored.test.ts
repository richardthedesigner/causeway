import { describe, expect, it } from "vitest";
import { savedDevice } from "@causeway/profile";
import { loadDeviceState, saveDeviceState } from "../src/lib/devices";
import { loadStored, readList, saveStored, type StoredVersion } from "../src/lib/stored";

/** An in-memory stand-in for localStorage. */
function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const numbers: StoredVersion<number[]>[] = [
  { key: "n.v2", read: (j, dropped) => readList(j, dropped, (x) => (typeof x === "number" ? x : null)) },
  // v1 kept numbers as strings.
  { key: "n.v1", read: (j, dropped) => readList(j, dropped, (x) => (typeof x === "string" ? Number(x) : null)) },
];

describe("versioned stores (STAB-03)", () => {
  it("reads the newest version there", () => {
    const s = memory({ "n.v2": "[3]", "n.v1": '["1"]' });
    expect(loadStored(numbers, s)).toEqual({ value: [3], key: "n.v2" });
  });

  it("carries an older version forward without touching it", () => {
    const s = memory({ "n.v1": '["1","2"]' });
    expect(loadStored(numbers, s)?.value).toEqual([1, 2]);
    saveStored("n.v2", [1, 2, 3], s);
    expect(s.m.get("n.v1")).toBe('["1","2"]');
    expect(loadStored(numbers, s)?.value).toEqual([1, 2, 3]);
  });

  it("backs up what it can't read, and falls back to the older version", () => {
    const s = memory({ "n.v2": "{broken", "n.v1": '["7"]' });
    expect(loadStored(numbers, s)?.value).toEqual([7]);
    expect(s.m.get("n.v2.backup")).toBe("{broken");
  });

  it("backs up a list when items had to be dropped", () => {
    const s = memory({ "n.v2": '[1,"x",2]' });
    expect(loadStored(numbers, s)?.value).toEqual([1, 2]);
    expect(s.m.get("n.v2.backup")).toBe('[1,"x",2]');
  });

  it("treats a reader that throws as unreadable, not as a crash", () => {
    const s = memory({ k: "[1]" });
    const bad: StoredVersion<number[]>[] = [{ key: "k", read: () => { throw new Error("bad migration"); } }];
    expect(loadStored(bad, s)).toBeNull();
    expect(s.m.get("k.backup")).toBe("[1]");
  });

  it("works with no storage at all", () => {
    expect(loadStored(numbers, undefined)).toBeNull();
    expect(saveStored("n.v2", [1], undefined)).toBe(false);
  });
});

describe("devices survive a newer or broken store (STAB-03)", () => {
  it("keeps the devices it can read, and a copy of the ones it can't", () => {
    const raw = JSON.stringify([
      { id: "a", name: "Cherry", favourite: true, profile: { ...savedDevice("a", "Cherry", "powerchair-light").profile } },
      { id: "b", name: "Trike", favourite: false, profile: { preset: "trike-from-a-newer-build" } },
    ]);
    const s = memory({ "causewayside.devices.v1": raw });
    const state = loadDeviceState(s);
    expect(state.devices.map((d) => d.name)).toEqual(["Cherry"]);
    saveDeviceState(state, s);
    expect(s.m.get("causewayside.devices.v1.backup")).toBe(raw);
  });

  it("falls back to the single profile from before devices when the list is unreadable", () => {
    const s = memory({ "causewayside.devices.v1": "not json", "causewayside.profile.v1": JSON.stringify(savedDevice("x", "", "rollator").profile) });
    const state = loadDeviceState(s);
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]!.profile.preset).toBe("rollator");
    expect(s.m.get("causewayside.devices.v1.backup")).toBe("not json");
  });
});
