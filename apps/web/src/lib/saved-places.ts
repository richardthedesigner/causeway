/**
 * Saved places (FEAT-04): home, work, a friend's, named by you. Kept on this
 * phone only, like devices (D-009): where someone lives is as private as how
 * they get around. One list per city.
 */
import type { Place } from "./plan-types";

export interface SavedPlace {
  label: string;
  place: Place;
}

const KEY = (city: string) => `causewayside.saved.${city}.v1`;
const MAX = 12;
export const LABEL_MAX = 40;
/** Home first, then work, then the rest as you saved them. */
const rank = (label: string) => ["home", "work"].indexOf(label.toLowerCase()) >>> 0;

export function loadSaved(city: string): SavedPlace[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(city)) ?? "[]");
    return Array.isArray(v) ? (v as SavedPlace[]).filter((s) => typeof s?.label === "string" && s.place && Number.isFinite(s.place.lon) && Number.isFinite(s.place.lat)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function store(city: string, list: SavedPlace[]): SavedPlace[] {
  try {
    localStorage.setItem(KEY(city), JSON.stringify(list));
  } catch {
    /* Private mode: kept until the page closes. */
  }
  return list;
}

/** Save a place under a name. The same place or the same name replaces the old one. */
export function savePlace(city: string, label: string, place: Place): SavedPlace[] {
  const name = label.trim().slice(0, LABEL_MAX);
  if (!name) return loadSaved(city);
  const rest = loadSaved(city).filter((s) => s.place.id !== place.id && s.label.toLowerCase() !== name.toLowerCase());
  const next = [...rest, { label: name, place }].sort((a, b) => rank(a.label) - rank(b.label)).slice(0, MAX);
  return store(city, next);
}

export function unsavePlace(city: string, id: string): SavedPlace[] {
  return store(city, loadSaved(city).filter((s) => s.place.id !== id));
}
