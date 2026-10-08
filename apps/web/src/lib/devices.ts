/**
 * Saved, named devices (D-034, D-036). Each device carries its own profile;
 * the app routes for the active one. Same privacy rules as the profile: on
 * this device only, guarded storage, works without it.
 *
 * Someone with nothing saved starts "fresh": routes use an unnamed manual
 * wheelchair, and the device button offers setup. `?demo=devices` instead
 * starts as the tester from 2026-10 feedback, with Cherry (a lightweight
 * powerchair that gets stuck on setts and cobbles) and Lulu (a pavement
 * scooter) already saved and favourited. Cherry has a demo 12 km battery range.
 */
import { hasBattery, PRESETS, savedDevice, type MobilityPreset, type Profile, type SavedDevice } from "@causeway/profile";
import { defaultStore, loadStored, readList, type Store, type StoredVersion } from "./stored";

const DEVICES_KEY = "causewayside.devices.v1";
const ACTIVE_KEY = "causewayside.device.active.v1";
/** The single profile from before devices. Still written, so an older build reads the active device. */
const LEGACY_PROFILE_KEY = "causewayside.profile.v1";

export interface DeviceState {
  devices: SavedDevice[];
  activeId: string;
  /** Nothing saved yet: first visit. Any saved change ends it. */
  fresh?: boolean;
}

/** What a first visitor routes as until they set up or skip: today's default. */
export const FIRST_VISIT: DeviceState = { devices: [savedDevice("device-1", "", "manual-wheelchair", {}, true)], activeId: "device-1", fresh: true };

export const SEED_DEVICES: SavedDevice[] = [
  savedDevice("cherry", "Cherry", "powerchair-light", { surfaces: { ...PRESETS["powerchair-light"].surfaces, sett: null, cobblestone: null }, maxRangeKm: 12 }, true),
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

/**
 * Devices, newest shape first (STAB-03). Today's list, then the single
 * profile from before devices, which becomes one unnamed device. A device
 * this build can't read (say, a type from a newer build) is left out, and
 * the stored list is backed up before anything overwrites it.
 */
const DEVICE_VERSIONS: StoredVersion<SavedDevice[]>[] = [
  {
    key: DEVICES_KEY,
    read: (json, dropped) => {
      const list = readList(json, dropped, (x) => {
        const d = x as Partial<SavedDevice> | null;
        const profile = d && typeof d.id === "string" ? revive(d.profile as Profile) : null;
        return profile ? { id: d!.id!, name: d!.name ?? "", favourite: !!d!.favourite, profile } : null;
      });
      // Nothing usable: try the older profile instead.
      return list?.length ? list : null;
    },
  },
  {
    key: LEGACY_PROFILE_KEY,
    read: (json) => {
      const legacy = revive(json as Profile);
      return legacy ? [{ id: "device-1", name: "", favourite: true, profile: legacy }] : null;
    },
  },
];

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
  if (d.name.trim()) return d.name.trim();
  return d.profile.label.replace(/^Manual wheelchair/, "Manual chair").replace(/, pushed$/, " + help");
}

/**
 * Load devices and the active one. Someone with a profile from before
 * devices keeps it, as one unnamed device; nobody loses their settings.
 */
export function loadDeviceState(store: Store | undefined = defaultStore(), { demo = false } = {}): DeviceState {
  const devices = loadStored(DEVICE_VERSIONS, store)?.value ?? [];
  if (!devices.length) return demo ? { devices: SEED_DEVICES, activeId: SEED_DEVICES[0]!.id } : FIRST_VISIT;
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

/** Change one device's limits, whichever is active (pace learned on a borrowed-for-this-trip device goes to that device). */
export function withDeviceProfile(state: DeviceState, id: string, profile: Profile): DeviceState {
  return {
    ...state,
    devices: state.devices.map((d) => (d.id === id ? { ...d, profile: d.name.trim() ? { ...profile, label: d.name.trim() } : profile } : d)),
  };
}

/**
 * Change the active device's limits. A named device keeps its name as the
 * profile label, so picking a different starting type never renames Cherry.
 */
export function withActiveProfile(state: DeviceState, profile: Profile): DeviceState {
  return withDeviceProfile(state, state.activeId, profile);
}

export function withActive(state: DeviceState, id: string): DeviceState {
  return state.devices.some((d) => d.id === id) ? { ...state, activeId: id } : state;
}

/** Rename the active device. A blank name goes back to calling it by its type. */
export function withActiveName(state: DeviceState, raw: string): DeviceState {
  const name = raw.replace(/\s+/g, " ").trimStart();
  return {
    ...state,
    devices: state.devices.map((d) =>
      d.id === state.activeId ? { ...d, name, profile: { ...d.profile, label: name.trim() || PRESETS[d.profile.preset].label } } : d,
    ),
  };
}

export function withFavourite(state: DeviceState, id: string, favourite: boolean): DeviceState {
  return { ...state, devices: state.devices.map((d) => (d.id === id ? { ...d, favourite } : d)) };
}

/** Remove a device. The last one can't go: there must always be one to route for. */
export function withoutDevice(state: DeviceState, id: string): DeviceState {
  const devices = state.devices.filter((d) => d.id !== id);
  if (!devices.length) return state;
  return { devices, activeId: state.activeId === id ? defaultDevice(devices)!.id : state.activeId };
}

export interface SetupChoice {
  preset: MobilityPreset;
  name: string;
  favourite: boolean;
}

/**
 * Save what setup chose. On a first visit it replaces the stand-in device;
 * otherwise it's added. Either way it becomes the device in use.
 */
export function withSetup(state: DeviceState, choice: SetupChoice, id: string): DeviceState {
  const name = choice.name.replace(/\s+/g, " ").trim();
  const device = savedDevice(id, name, choice.preset, {}, choice.favourite);
  return { devices: state.fresh ? [device] : [...state.devices, device], activeId: id };
}

const TIP_KEY = "causewayside.tip.devices.v1";
/** The one-time "tap to switch" tip: shown after the first device is saved, until dismissed. */
export function tipPending(store: Store | undefined = defaultStore()): boolean {
  return read(store, TIP_KEY) === "pending";
}
export function setTip(state: "pending" | "seen", store: Store | undefined = defaultStore()) {
  try {
    store?.setItem(TIP_KEY, state);
  } catch {
    /* the tip may show again; harmless */
  }
}

/** What changed after switching device, for the route: "7 min quicker than Cherry's route". */
export function compareLine(minutes: number, prev: { label: string; minutes: number | null }): string {
  if (prev.minutes === null) return `${prev.label} had no route here.`;
  const d = minutes - prev.minutes;
  if (d === 0) return `Same time as ${prev.label}'s route.`;
  return `${Math.abs(d)} min ${d < 0 ? "quicker" : "longer"} than ${prev.label}'s route.`;
}

/**
 * A device's limits after picking a type (or resetting to it). The battery range
 * isn't a limit the type sets: it's the person's own figure, so it carries over
 * to another powered type and goes when the type has no battery (D-043).
 */
export function presetProfile(current: Profile, preset: MobilityPreset): Profile {
  const next: Profile = { ...PRESETS[preset] };
  if (current.maxRangeKm && hasBattery(next)) next.maxRangeKm = current.maxRangeKm;
  // How someone reads speeds is theirs, not the type's.
  if (current.speedUnit) next.speedUnit = current.speedUnit;
  return next;
}

/** Range choices in the editor, in km on one charge. */
export const RANGE_MIN_KM = 3;
export const RANGE_MAX_KM = 60;
/** A starting figure when someone turns the range on: a typical lightweight powerchair. */
export const RANGE_DEFAULT_KM = 15;

/**
 * Who the routes are for, as the route screen says it (FEAT-21): the name, and
 * the type beside it. An unnamed device has only its type, as the name.
 */
export function routingFor(d: SavedDevice): { name: string; type: string | null; named: boolean } {
  const type = PRESETS[d.profile.preset].label;
  const name = d.name.trim();
  return name ? { name, type, named: true } : { name: type, type: null, named: false };
}

/** The limits that shape a route most, in one short line (FEAT-22): kerbs, slopes, steps. */
export function limitsLine(p: Profile): string {
  const kerb = p.maxKerbCm <= 0 ? "No kerbs" : `Kerbs up to ${p.maxKerbCm} cm`;
  const slope = `slopes up to ${p.maxInclineUpPct}%`;
  const steps = p.maxSteps <= 0 ? "no steps" : p.maxSteps >= 99 ? "steps fine" : `up to ${p.maxSteps} step${p.maxSteps === 1 ? "" : "s"}`;
  return [kerb, slope, steps].join(" · ");
}
