import { describe, expect, it } from "vitest";
import { defaultDevice, SEED_DEVICES } from "../src/lib/devices";

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
