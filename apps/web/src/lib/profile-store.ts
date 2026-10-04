/**
 * The user's mobility profile lives on this device only (UK GDPR special
 * category data; D-009). localStorage can be unavailable, so every access is
 * guarded and the app works without it.
 */
import { PRESETS, type MobilityPreset, type Profile } from "@causeway/profile";

const KEY = "causewayside.profile.v1";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p && PRESETS[p.preset]) return { ...PRESETS[p.preset], ...p, maxSteps: p.maxSteps ?? 0 };
    }
  } catch {
    /* storage blocked or corrupt: fall through to the default */
  }
  return PRESETS["manual-wheelchair"];
}

export function saveProfile(p: Profile) {
  try {
    // JSON can't hold Infinity; store a large number instead.
    localStorage.setItem(KEY, JSON.stringify({ ...p, maxSteps: Number.isFinite(p.maxSteps) ? p.maxSteps : 9999 }));
  } catch {
    /* not saved; the profile still applies for this visit */
  }
}

export const PRESET_ORDER: MobilityPreset[] = [
  "walking",
  "walking-stick",
  "crutches",
  "rollator",
  "manual-wheelchair",
  "manual-wheelchair-companion",
  "powerchair",
  "mobility-scooter",
  "pram",
  "fatigue",
  "visual-impairment",
];
