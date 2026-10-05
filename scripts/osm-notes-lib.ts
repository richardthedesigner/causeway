/**
 * Which open OpenStreetMap notes to keep (DATA-08, D-048): the pure part of
 * scripts/build-osm-notes.ts, so it is tested without the network.
 */

/** Notes about the ground people walk and wheel on. Shop hours and house numbers are left out. */
// "Closed" alone is mostly shops, so it has to come with something you walk on ("bridge now closed").
export const ABOUT_THE_GROUND = /\b(path|paths|footpath|footway|pavement|sidewalk|steps?|stairs?|kerbs?|curbs?|ramps?|gate|barrier|bollards?|crossing|lift|elevator|surface|cobbles?|setts|wheelchair|step-free|bridge|underpass|subway)\b/i;
/** StreetComplete's own "can't answer" notes are questions for mappers, not reports. */
const QUESTION = /^(Can't answer|Unable to answer|In overlay)/i;
/** StreetComplete questions about a business, not the way to it ("What are the opening hours? Is this place still here?"). From PR #36. */
const ABOUT_A_PLACE = /opening hours|house number|still here\?|name of this|what('|’)?s the name|is this place|cuisine|which brand|submitted note from a business/i;
/** A note this old with no comment since tells nobody anything: left out. */
export const OLD_NOTE_MS = 3 * 365.25 * 86_400_000;

/** Keep a note about the ground, not a business question, opened or commented on within three years. */
export function keepNote(n: { text: string; opened: string; comments: string[] }, now: Date): boolean {
  if (!n.text || QUESTION.test(n.text) || ABOUT_A_PLACE.test(n.text) || !ABOUT_THE_GROUND.test(n.text)) return false;
  const last = Math.max(...[n.opened, ...n.comments].map(apiDate).filter(Number.isFinite));
  return Number.isFinite(last) && now.getTime() - last <= OLD_NOTE_MS;
}

/** The Notes API's "2026-03-23 20:54:14 UTC" (or an ISO date) as milliseconds. */
export function apiDate(s: string): number {
  return Date.parse(s.replace(" UTC", "Z").replace(" ", "T"));
}
