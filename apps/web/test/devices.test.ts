import { describe, expect, it } from "vitest";
import { PRESETS, savedDevice } from "@causeway/profile";
import { activeDevice, compareLine, defaultDevice, deviceLabel, loadDeviceState, orderDevices, saveDeviceState, SEED_DEVICES, withActive, withActiveName, withActiveProfile, withDeviceProfile, withFavourite, withoutDevice, withSetup, presetProfile } from "../src/lib/devices";

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
  it("starts fresh, as an unnamed manual wheelchair, when nothing is saved", () => {
    const s = loadDeviceState(memory());
    expect(s.fresh).toBe(true);
    expect(s.devices).toHaveLength(1);
    expect(activeDevice(s)).toMatchObject({ name: "", profile: { preset: "manual-wheelchair" } });
  });

  it("starts as Cherry and Lulu with the demo link, but only when nothing is saved", () => {
    const s = loadDeviceState(memory(), { demo: true });
    expect(s.devices.map((d) => d.name)).toEqual(["Cherry", "Lulu"]);
    expect(s.activeId).toBe("cherry");
    expect(s.fresh).toBeFalsy();
    const saved = memory();
    saveDeviceState({ devices: [savedDevice("w", "", "walking")], activeId: "w" }, saved);
    expect(loadDeviceState(saved, { demo: true }).devices.map((d) => d.id)).toEqual(["w"]);
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
    const store = memory({ "causewayside.devices.v1": JSON.stringify(SEED_DEVICES), "causewayside.device.active.v1": "deleted" });
    expect(loadDeviceState(store).activeId).toBe("cherry");
  });

  it("drops corrupt entries and survives storage that throws", () => {
    const bad = memory({ "causewayside.devices.v1": JSON.stringify([{ id: "x", profile: { preset: "hovercraft" } }, SEED_DEVICES[1]]) });
    expect(loadDeviceState(bad).devices.map((d) => d.name)).toEqual(["Lulu"]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadDeviceState(throwing).fresh).toBe(true);
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

  it("setup replaces the first-visit stand-in, then adds", () => {
    const first = withSetup(loadDeviceState(memory()), { preset: "powerchair-light", name: " Cherry ", favourite: true }, "c");
    expect(first.fresh).toBeFalsy();
    expect(first.devices.map((d) => d.id)).toEqual(["c"]);
    expect(activeDevice(first)).toMatchObject({ name: "Cherry", favourite: true, profile: { preset: "powerchair-light", label: "Cherry" } });
    const second = withSetup(first, { preset: "mobility-scooter", name: "", favourite: false }, "l");
    expect(second.devices.map((d) => d.id)).toEqual(["c", "l"]);
    expect(second.activeId).toBe("l");
    expect(deviceLabel(activeDevice(second))).toBe("Mobility scooter, pavement");
  });

  it("ignores a switch to a device that isn't saved", () => {
    const s = { devices: SEED_DEVICES, activeId: "cherry" };
    expect(withActive(s, "nope")).toBe(s);
  });

  it("renames the active device, and a blank name falls back to the type", () => {
    const s = { devices: SEED_DEVICES, activeId: "lulu" };
    const named = withActiveName(s, "Lulu  the  scooter");
    expect(activeDevice(named)).toMatchObject({ name: "Lulu the scooter", profile: { label: "Lulu the scooter" } });
    const blank = withActiveName(s, "   ");
    expect(activeDevice(blank).name).toBe("");
    expect(activeDevice(blank).profile.label).toBe("Mobility scooter, pavement");
    expect(deviceLabel(activeDevice(blank))).toBe("Mobility scooter, pavement");
  });

  it("favourites and unfavourites a device", () => {
    const s = withFavourite({ devices: SEED_DEVICES, activeId: "cherry" }, "cherry", false);
    expect(s.devices[0]!.favourite).toBe(false);
    expect(orderDevices(s.devices).map((d) => d.id)).toEqual(["lulu", "cherry"]);
  });

  it("removes a device and moves to a favourite, but never removes the last one", () => {
    const s = withoutDevice({ devices: SEED_DEVICES, activeId: "cherry" }, "cherry");
    expect(s.devices.map((d) => d.id)).toEqual(["lulu"]);
    expect(s.activeId).toBe("lulu");
    expect(withoutDevice(s, "lulu")).toBe(s);
  });

  it("says what a switch changed", () => {
    expect(compareLine(12, { label: "Cherry", minutes: 19 })).toBe("7 min quicker than Cherry's route.");
    expect(compareLine(21, { label: "Cherry", minutes: 19 })).toBe("2 min longer than Cherry's route.");
    expect(compareLine(19, { label: "Cherry", minutes: 19 })).toBe("Same time as Cherry's route.");
    expect(compareLine(14, { label: "Cherry", minutes: null })).toBe("Cherry had no route here.");
  });

  it("changes a device that isn't the active one, keeping its name", () => {
    const s = { devices: SEED_DEVICES, activeId: "cherry" };
    const next = withDeviceProfile(s, "lulu", { ...SEED_DEVICES[1]!.profile, speedMps: 2.1, label: "whatever" });
    expect(next.devices[1]!.profile).toMatchObject({ speedMps: 2.1, label: "Lulu" });
    expect(next.devices[0]).toBe(SEED_DEVICES[0]);
    expect(next.activeId).toBe("cherry");
  });
});

describe("battery range across a change of type (D-043)", () => {
  const cherry = SEED_DEVICES[0]!.profile;
  it("keeps the range on another powered type, and on reset", () => {
    expect(cherry.maxRangeKm).toBe(12);
    expect(presetProfile(cherry, "powerchair").maxRangeKm).toBe(12);
    expect(presetProfile(cherry, "mobility-scooter-road").maxRangeKm).toBe(12);
    expect(presetProfile(cherry, "powerchair-light")).toEqual({ ...PRESETS["powerchair-light"], maxRangeKm: 12 });
  });
  it("drops it for a type with no battery", () => {
    expect(presetProfile(cherry, "manual-wheelchair").maxRangeKm).toBeUndefined();
    expect(presetProfile(cherry, "walking")).toEqual(PRESETS.walking);
  });
  it("never invents one", () => {
    expect(presetProfile(PRESETS["manual-wheelchair"], "powerchair").maxRangeKm).toBeUndefined();
  });
});

describe("speed unit across a change of type (FEAT-18)", () => {
  it("keeps the unit someone chose; a type change never picks one for them", () => {
    const lulu = { ...PRESETS["mobility-scooter-road"], speedUnit: "kmh" as const };
    expect(presetProfile(lulu, "mobility-scooter").speedUnit).toBe("kmh");
    expect(presetProfile(lulu, "powerchair").speedUnit).toBe("kmh");
    expect(presetProfile(PRESETS["mobility-scooter-road"], "powerchair").speedUnit).toBeUndefined();
  });
});
