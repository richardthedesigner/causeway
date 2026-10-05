/**
 * The high-contrast map (SMALL-05). On by itself for the low-vision device
 * or when the phone asks for more contrast; the layers menu can turn it
 * on or off, and that choice is kept on this phone.
 */
import type { MobilityPreset } from "@causeway/profile";

/**
 * High contrast (SMALL-05): plain ground, roads edged in ink, buildings and
 * water that stand out, and labels in black or white. For people with low vision.
 */
export const HIGH_CONTRAST = {
  light: { ground: "#ffffff", earth: "#ffffff", park: "#bcd9b0", water: "#7fb0d4", building: "#a9afa8", road: "#ffffff", roadCasing: "#1b211d", label: "#000000", labelHalo: "#ffffff", minor: "#ffffff", rail: "#454d47" },
  dark: { ground: "#000000", earth: "#000000", park: "#1b4526", water: "#123f60", building: "#4a514c", road: "#000000", roadCasing: "#e6eae4", label: "#ffffff", labelHalo: "#000000", minor: "#000000", rail: "#9aa49d" },
};

const KEY = "causewayside.map-contrast.v1";

export function loadMapContrast(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

export function saveMapContrast(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* Private mode: it lasts until the page closes. */
  }
}

export function mapContrastOn(chosen: boolean | null, preset: MobilityPreset, phoneAsks: boolean): boolean {
  return chosen ?? (preset === "visual-impairment" || phoneAsks);
}
