import { describe, expect, it } from "vitest";
import { PRESETS, savedDevice } from "@causeway/profile";
import { activeDevice, defaultDevice, deviceLabel, loadDeviceState, orderDevices, saveDeviceState, SEED_DEVICES, withActive, withActiveProfile } from "../src/lib/devices";

/** An in-memory stand-in for localStorage. */
function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("saved devices seed", () => {
  it("has Cherry and Lulu, favourited and named, with their own limits", () => {
    const [cherry, lulu] = SEED_DEVICES;
    expect(cherry!.profile.label).toBe("Cherry");
    expect(cherry!.profile.preset).toBe("powerchair-light");
    expect(cherry!.profile.surfaces.sett).toBeNull();
    expect(cherry!.profile.surfaces.cobblestone).toBeNull();
    expect(lulu!.profile.label).toBe("Lulu");
    expect(lulu!.profile.preset).toBe("mobility-scooter");
    expect(SEED_DEVICES.every((d) => d.favourite)).toBe(true);
    expect(defaultDevice(SEED_DEVICES)?.name).toBe("Cherry");
  });
});

describe("loading devices", () => {
  it("starts with the seed, Cherry active, when nothing is saved", () => {
    const s = loadDeviceState(memory());
    expect(s.devices.map((d) => d.name)).toEqual(["Cherry", "Lulu"]);
    expect(s.activeId).toBe("cherry");
  });

  it("keeps a profile from before devices as one unnamed device", () => {
    const old = { ...PRESETS["walking-stick"], maxSteps: 12, speedMps: 0.9 };
    const s = loadDeviceState(memory({ "causewayside.profile.v1": JSON.stringify(old) }));
    expect(s.devices).toHaveLength(1);
    expect(s.devices[0]!.name).toBe("");
    expect(s.devices[0]!.profile).toMatchObject({ preset: "walking-stick", maxSteps: 12, speedMps: 0.9 });
    expect(s.activeId).toBe(s.devices[0]!.id);
  });

  it("round-trips through storage, Infinity steps included", () => {
    const store = memory();
    const walking = savedDevice("w", "", "walking");
    const state = withActive({ devices: [...SEED_DEVICES, walking], activeId: "cherry" }, "w");
    saveDeviceState(state, store);
    const back = loadDeviceState(store);
    expect(back.activeId).toBe("w");
    expect(back.devices.map((d) => d.id)).toEqual(["cherry", "lulu", "w"]);
    expect(activeDevice(back).profile.maxSteps).toBe(9999);
    // The old key follows the active device, so an older build still reads it.
    expect(JSON.parse(store.m.get("causewayside.profile.v1")!).preset).toBe("walking");
  });

  it("falls back to the first favourite when the saved active id is gone", () => {
    const store = memory({ "causewayside.device.active.v1": "deleted" });
    expect(loadDeviceState(store).activeId).toBe("cherry");
  });

  it("drops corrupt entries and survives storage that throws", () => {
    const bad = memory({ "causewayside.devices.v1": JSON.stringify([{ id: "x", profile: { preset: "hovercraft" } }, SEED_DEVICES[1]]) });
    expect(loadDeviceState(bad).devices.map((d) => d.name)).toEqual(["Lulu"]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadDeviceState(throwing).activeId).toBe("cherry");
    expect(() => saveDeviceState(loadDeviceState(throwing), throwing)).not.toThrow();
  });
});

describe("device rules", () => {
  it("lists favourites first, otherwise in saved order", () => {
    const a = savedDevice("a", "A", "walking");
    const b = savedDevice("b", "B", "pram", {}, true);
    const c = savedDevice("c", "C", "rollator");
    expect(orderDevices([a, b, c]).map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("labels a named device by name and an unnamed one by its shortened type", () => {
    expect(deviceLabel(SEED_DEVICES[0]!)).toBe("Cherry");
    expect(deviceLabel(savedDevice("m", "", "manual-wheelchair"))).toBe("Manual chair");
    expect(deviceLabel(savedDevice("p", "", "manual-wheelchair-companion"))).toBe("Manual chair + help");
    expect(savedDevice("p", "", "pram").profile.label).toBe("Pram or buggy");
  });

  it("keeps a named device's name when its limits or type change", () => {
    const s = { devices: SEED_DEVICES, activeId: "cherry" };
    const next = withActiveProfile(s, { ...PRESETS["powerchair"] });
    expect(activeDevice(next).profile.label).toBe("Cherry");
    expect(activeDevice(next).profile.preset).toBe("powerchair");
    expect(next.devices[1]).toBe(SEED_DEVICES[1]);
  });
});
