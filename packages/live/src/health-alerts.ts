/**
 * UKHSA weather-health alerts, live (D-066). England only.
 *
 * The UK Health Security Agency's dashboard API lists the heat and cold alert
 * for each English region (Open Government Licence v3, no key, open to
 * browsers). Green and yellow change nothing. Amber and red are said on every
 * route, with UKHSA's end date, and for presets with a rest limit they make
 * stretches with no bench cost a little more (the cost model, D-066).
 *
 * An alert counts only while it is in force: never past the end date UKHSA
 * gives, and never outside its season (heat 1 June to 30 September, cold
 * 1 November to 31 March). The list keeps a region's last status long after
 * the period ends: on 2026-10-05 the heat list still showed August's.
 */
import type { HealthAlert } from "@causeway/router";
import { getJson, type LiveOptions } from "./http.js";

export const UKHSA_ALERTS_BASE = "https://ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1";
export const ukhsaAlertsUrl = (kind: "heat" | "cold") => `${UKHSA_ALERTS_BASE}/${kind}`;
export const ukhsaAlertUrl = (kind: "heat" | "cold", regionCode: string) => `${UKHSA_ALERTS_BASE}/${kind}/${regionCode}`;
export const UKHSA_SOURCE = "UKHSA";

/** The English regions our cities sit in. */
export const UKHSA_REGIONS = {
  london: { code: "E12000007", name: "London" },
  northEast: { code: "E12000001", name: "North East" },
} as const;

type Status = "Green" | "Yellow" | "Amber" | "Red";
const STATUSES = new Set<string>(["Green", "Yellow", "Amber", "Red"]);

export interface RegionAlert {
  status: Status;
  regionCode: string;
  regionName: string;
  refreshed: string;
}

/** The list response: one status per region. Unknown statuses are dropped, never read as green. */
export function parseRegionAlerts(json: unknown): RegionAlert[] {
  if (!Array.isArray(json)) throw new Error("UKHSA alerts: not a list");
  return (json as Record<string, unknown>[]).flatMap((x) =>
    typeof x?.status === "string" && STATUSES.has(x.status) && typeof x.geography_code === "string"
      ? [{ status: x.status as Status, regionCode: x.geography_code, regionName: typeof x.geography_name === "string" ? x.geography_name : x.geography_code, refreshed: typeof x.refresh_date === "string" ? x.refresh_date : "" }]
      : [],
  );
}

const UK_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric", day: "numeric" });

/** Heat 1 June to 30 September, cold 1 November to 31 March, by the UK date. */
export function inSeason(kind: "heat" | "cold", at: Date): boolean {
  const parts = Object.fromEntries(UK_DATE.formatToParts(at).map((p) => [p.type, Number(p.value)]));
  const month = parts.month!;
  return kind === "heat" ? month >= 6 && month <= 9 : month >= 11 || month <= 3;
}

/** Does this alert count at this moment: in its season and not past its end? */
export function alertInForce(a: HealthAlert, at: Date): boolean {
  if (!inSeason(a.kind, at)) return false;
  return !a.until || at.getTime() < Date.parse(a.until);
}

const iso = (t: string) => (Number.isNaN(Date.parse(t)) ? t : new Date(t).toISOString());

/**
 * An amber or red alert for the region, from the list and, when it answers, the region's own
 * record, which gives the end of the period and has the last word on the status. Null when
 * nothing is in force at `now`.
 */
export function alertFor(kind: "heat" | "cold", list: RegionAlert[], regionCode: string, detail?: unknown, now = new Date()): HealthAlert | null {
  const r = list.find((x) => x.regionCode === regionCode);
  if (!r) return null;
  const d = (detail ?? {}) as { status?: unknown; period_end?: unknown; refresh_date?: unknown };
  const status = typeof d.status === "string" && STATUSES.has(d.status) ? (d.status as Status) : r.status;
  if (status !== "Amber" && status !== "Red") return null;
  const refreshed = typeof d.refresh_date === "string" && !Number.isNaN(Date.parse(d.refresh_date)) ? d.refresh_date : r.refreshed;
  const end = typeof d.period_end === "string" && !Number.isNaN(Date.parse(d.period_end)) ? { until: iso(d.period_end) } : {};
  const a: HealthAlert = { kind, level: status === "Red" ? "red" : "amber", region: r.regionName, at: iso(refreshed), ...end };
  return alertInForce(a, now) ? a : null;
}

/** Red beats amber; at the same level, heat first (they don't overlap in practice). */
export function strongestAlert(...alerts: (HealthAlert | null)[]): HealthAlert | null {
  const rank = (a: HealthAlert) => (a.level === "red" ? 2 : 1);
  return alerts.filter((a): a is HealthAlert => !!a).sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

async function one(kind: "heat" | "cold", regionCode: string, opts: LiveOptions, now: Date): Promise<HealthAlert | null> {
  // Out of season, nothing counts, so there's nothing to ask.
  if (!inSeason(kind, now)) return null;
  const list = parseRegionAlerts(await getJson<unknown>(ukhsaAlertsUrl(kind), `UKHSA ${kind} alerts`, opts));
  if (!alertFor(kind, list, regionCode, undefined, now)) return null;
  // The region's own record says when the alert ends. Without it, an in-season alert still counts.
  const detail = await getJson<unknown>(ukhsaAlertUrl(kind, regionCode), `UKHSA ${kind} alert`, opts).catch(() => undefined);
  return alertFor(kind, list, regionCode, detail, now);
}

/** Heat and cold together, each with D-052's time limit. Throws when a feed failed and nothing was found. */
export async function fetchHealthAlert(regionCode: string, opts: LiveOptions = {}, now = new Date()): Promise<HealthAlert | null> {
  const [heat, cold] = await Promise.allSettled([one("heat", regionCode, opts, now), one("cold", regionCode, opts, now)]);
  const found = strongestAlert(heat.status === "fulfilled" ? heat.value : null, cold.status === "fulfilled" ? cold.value : null);
  // "None in force" only when every feed in season answered.
  const failed = [heat, cold].find((x) => x.status === "rejected");
  if (!found && failed) throw failed.reason;
  return found;
}
