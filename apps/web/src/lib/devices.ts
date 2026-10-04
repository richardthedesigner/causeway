/**
 * Saved, named devices (D-034). Same privacy rules as the profile: on this
 * device only, guarded storage, works without it.
 *
 * DEMO SEED: until the device switcher ships, the app starts as if the user
 * had already saved and favourited the two devices from tester feedback
 * (2026-10): Lulu, a pavement scooter, and Cherry, a lightweight powerchair
 * that gets stuck on setts and cobbles. Remove SEED_DEVICES when onboarding
 * creates the first device.
 */
import { PRESETS, savedDevice, type SavedDevice } from "@causeway/profile";

const KEY = "causewayside.devices.v1";

export const SEED_DEVICES: SavedDevice[] = [
  savedDevice("cherry", "Cherry", "powerchair-light", { surfaces: { ...PRESETS["powerchair-light"].surfaces, sett: null, cobblestone: null } }, true),
  savedDevice("lulu", "Lulu", "mobility-scooter", {}, true),
];

export function loadDevices(): SavedDevice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as SavedDevice[];
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* storage blocked or corrupt: fall through to the seed */
  }
  return SEED_DEVICES;
}

export function saveDevices(list: SavedDevice[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map((d) => ({ ...d, profile: { ...d.profile, maxSteps: Number.isFinite(d.profile.maxSteps) ? d.profile.maxSteps : 9999 } }))));
  } catch {
    /* not saved; the list still applies for this visit */
  }
}

/** The device to start with: the first favourite, else the first saved. */
export function defaultDevice(list: SavedDevice[] = loadDevices()): SavedDevice | undefined {
  return list.find((d) => d.favourite) ?? list[0];
}
