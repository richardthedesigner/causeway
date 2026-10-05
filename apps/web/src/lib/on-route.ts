/**
 * Words for the "On this route" list (D-067). Pure, so it's tested without a browser.
 */
import type { AreaNote } from "@causeway/live";
import type { OnRouteGroup, OnRouteItem, OnRouteLabel } from "@causeway/router";

export const LABEL_WORDS: Record<OnRouteLabel, string> = {
  live: "Live",
  static: "Static data",
  reported: "Reported by people",
};

export const GROUP_WORDS: Record<OnRouteGroup, { title: string; short: string; hint: string }> = {
  blocked: { title: "Blocked", short: "blocked", hint: "Closed for you, so this route goes round it." },
  slower: { title: "Slower", short: "slower", hint: "On this route, and may slow you down." },
  info: { title: "Worth knowing", short: "worth knowing", hint: "Good to know before you set off." },
};

const UK = "Europe/London";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UK_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "numeric", year: "numeric" });
/** "12 Sep 2026", in London's calendar. Our own month words: browsers disagree on "Sep" and "Sept". */
const day = (d: Date) => {
  const p = Object.fromEntries(UK_DATE.formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
};
const time = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });

/** "Live, TfL, at 12:05"; "Static data, Scottish Road Works Register, dated 1 Oct 2026, until 20 Oct 2026". */
export function itemMeta(it: Pick<OnRouteItem, "label" | "source" | "date" | "until">, now: Date = new Date()): string {
  const parts = [LABEL_WORDS[it.label], it.source];
  const d = it.date ? new Date(it.date) : null;
  if (d && !Number.isNaN(d.getTime())) {
    if (it.label === "live") parts.push(day(d) === day(now) ? `at ${time(d)}` : `at ${time(d)} on ${day(d)}`);
    else parts.push(`dated ${day(d)}`);
  }
  // An end over a year away is a placeholder, not a date anyone set.
  const u = it.until ? new Date(it.until) : null;
  if (u && !Number.isNaN(u.getTime()) && u.getTime() - now.getTime() < 365 * 86_400_000) parts.push(`until ${day(u)}`);
  return parts.join(", ");
}

const count = (items: readonly OnRouteItem[], g: OnRouteGroup) => items.filter((i) => i.group === g).length;

/** The summary row: "1 blocked, 2 worth knowing", or that we know of nothing. */
export function onRouteAside(items: readonly OnRouteItem[]): string {
  const parts = (["blocked", "slower", "info"] as const).filter((g) => count(items, g)).map((g) => `${count(items, g)} ${GROUP_WORDS[g].short}`);
  return parts.length ? parts.join(", ") : "Nothing known";
}

/** It opens by itself only when something is blocked or slower. */
export const onRouteUrgent = (items: readonly OnRouteItem[]) => items.some((i) => i.group !== "info");

/** "On Chambers Street", "On Chambers Street, Forrest Road and 2 more". */
export function whereText(where: readonly string[]): string | null {
  if (!where.length) return null;
  if (where.length <= 2) return `On ${where.join(" and ")}`;
  return `On ${where.slice(0, 2).join(", ")} and ${where.length - 2} more`;
}

/** The route card's line when the route went round a closure: the count only, the details in the list. */
export function blockedLine(items: readonly OnRouteItem[]): string | null {
  const n = count(items, "blocked");
  if (!n) return null;
  return `Goes round ${n === 1 ? "a closure" : `${n} closures`} on the way. See On this route.`;
}

/** The route card's line when this route itself passes through a flood warning area (not the whole city's warnings). */
export function floodLine(items: readonly OnRouteItem[]): string | null {
  const f = items.find((i) => i.group === "slower" && i.source === "Environment Agency");
  return f ? "Passes through a flood warning area. See On this route." : null;
}

/** Air quality, pollen and UV when high: area-wide, live, worth knowing (D-066). */
export const airItems = (notes: readonly AreaNote[] | null): OnRouteItem[] =>
  (notes ?? []).map((n) => ({ group: "info", text: `${n.text}, across the area`, where: [], label: "live", source: n.source, date: n.at, until: null }));
