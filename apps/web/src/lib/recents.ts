import type { Place } from "./plan-types";

const KEY = (city: string) => `causewayside.recents.${city}.v1`;
const MAX = 5;

/** Places you've asked for directions to, newest first. This device only; never sent anywhere. */
export function loadRecents(city: string): Place[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(city)) ?? "[]");
    return Array.isArray(v) ? (v as Place[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(city: string, p: Place): Place[] {
  // Pins and "as close as you can get" points are one-offs, not places you'd go back to.
  if (p.id.startsWith("pin:") || p.id.startsWith("closest:") || p.id.startsWith("me")) return loadRecents(city);
  const next = [p, ...loadRecents(city).filter((x) => x.id !== p.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY(city), JSON.stringify(next));
  } catch {
    /* not remembered; fine */
  }
  return next;
}
