/**
 * Saved, named devices (D-034, D-036). Each device carries its own profile;
 * the app routes for the active one. Same privacy rules as the profile: on
 * this device only, guarded storage, works without it.
 *
 * DEMO SEED: until first-visit setup ships (plan step 5), someone with
 * nothing saved starts as if they had already saved and favourited the two
 * devices from tester feedback (2026-10): Cherry, a lightweight powerchair
 * that gets stuck on setts and cobbles, and Lulu, a pavement scooter.
 */
import { PRESETS, savedDevice, type Profile, type SavedDevice } from "@causeway/profile";

const DEVICES_KEY = "causewayside.devices.v1";
const ACTIVE_KEY = "causewayside.device.active.v1";
/** The single profile from before devices. Still written, so an older build reads the active device. */
const LEGACY_PROFILE_KEY = "causewayside.profile.v1";

type Store = Pick<Storage, "getItem" | "setItem">;

export interface DeviceState {
  devices: SavedDevice[];
  activeId: string;
}

export const SEED_DEVICES: SavedDevice[] = [
  savedDevice("cherry", "Cherry", "powerchair-light", { surfaces: { ...PRESETS["powerchair-light"].surfaces, sett: null, cobblestone: null } }, true),
  savedDevice("lulu", "Lulu", "mobility-scooter", {}, true),
];

/** Fill in anything a stored profile is missing, from its preset. JSON has no Infinity, so steps come back as a number. */
function revive(p: Profile): Profile | null {
  if (!p || !PRESETS[p.preset]) return null;
  return { ...PRESETS[p.preset], ...p, maxSteps: p.maxSteps ?? 0 };
}

const storable = (p: Profile): Profile => ({ ...p, maxSteps: Number.isFinite(p.maxSteps) ? p.maxSteps : 9999 });

const read = (store: Store | undefined, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const defaultStore = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Favourites first, otherwise in the order they were saved. */
export function orderDevices(list: SavedDevice[]): SavedDevice[] {
  return [...list.filter((d) => d.favourite), ...list.filter((d) => !d.favourite)];
}

/** The device to start with: the first favourite, else the first saved. */
export function defaultDevice(list: SavedDevice[]): SavedDevice | undefined {
  return orderDevices(list)[0];
}

/** What the device button says: the name for a named device, otherwise the type, shortened to fit the search bar. */
export function deviceLabel(d: SavedDevice): string {
  if (d.name) return d.name;
  return d.profile.label.replace(/^Manual wheelchair/, "Manual chair").replace(/, pushed$/, " + help");
}

/**
 * Load devices and the active one. Someone with a profile from before
 * devices keeps it, as one unnamed device; nobody loses their settings.
 */
export function loadDeviceState(store: Store | undefined = defaultStore()): DeviceState {
  let devices: SavedDevice[] | null = null;
  const raw = read(store, DEVICES_KEY);
  if (raw) {
    try {
      const list = JSON.parse(raw) as SavedDevice[];
      if (Array.isArray(list)) {
        devices = list.flatMap((d) => {
          const profile = d && typeof d.id === "string" ? revive(d.profile) : null;
          return profile ? [{ id: d.id, name: d.name ?? "", favourite: !!d.favourite, profile }] : [];
        });
      }
    } catch {
      /* corrupt: fall through */
    }
  }
  if (!devices?.length) {
    const legacyRaw = read(store, LEGACY_PROFILE_KEY);
    let legacy: Profile | null = null;
    try {
      legacy = legacyRaw ? revive(JSON.parse(legacyRaw) as Profile) : null;
    } catch {
      legacy = null;
    }
    devices = legacy ? [{ id: "device-1", name: "", favourite: true, profile: legacy }] : SEED_DEVICES;
  }
  const stored = read(store, ACTIVE_KEY);
  const activeId = devices.some((d) => d.id === stored) ? stored! : defaultDevice(devices)!.id;
  return { devices, activeId };
}

export function saveDeviceState(state: DeviceState, store: Store | undefined = defaultStore()) {
  try {
    store?.setItem(DEVICES_KEY, JSON.stringify(state.devices.map((d) => ({ ...d, profile: storable(d.profile) }))));
    store?.setItem(ACTIVE_KEY, state.activeId);
    const active = activeDevice(state);
    if (active) store?.setItem(LEGACY_PROFILE_KEY, JSON.stringify(storable(active.profile)));
  } catch {
    /* not saved; the devices still apply for this visit */
  }
}

export function activeDevice(state: DeviceState): SavedDevice {
  return state.devices.find((d) => d.id === state.activeId) ?? state.devices[0]!;
}

/**
 * Change the active device's limits. A named device keeps its name as the
 * profile label, so picking a different starting type never renames Cherry.
 */
export function withActiveProfile(state: DeviceState, profile: Profile): DeviceState {
  return {
    ...state,
    devices: state.devices.map((d) => (d.id === state.activeId ? { ...d, profile: d.name ? { ...profile, label: d.name } : profile } : d)),
  };
}

export function withActive(state: DeviceState, id: string): DeviceState {
  return state.devices.some((d) => d.id === id) ? { ...state, activeId: id } : state;
}
