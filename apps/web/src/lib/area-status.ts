/**
 * Lines for the weather and health extras (D-066): UKHSA heat and cold
 * alerts, gusts, air quality, pollen and UV, and the Water of Leith. Every
 * line says where it's from and when. A feed that failed is said quietly in
 * "Where this comes from" and changes nothing else.
 */
import { WATER_OF_LEITH_HIGH_M, type AreaNote } from "@causeway/live";
import { GUST_BRIDGE_KMH, utcShort } from "@causeway/router";
import type { LiveArea, LiveHealthAlert } from "./use-planner";

const hhmm = (iso: string) => `${iso.slice(11, 16)} UTC`;

/** Area-wide air lines for "Why this way?": only what is high (the feed sends nothing else). */
export const airLines = (notes: readonly AreaNote[] | null): string[] => (notes ?? []).map((n) => `${n.text}, across the area (${n.source}, ${utcShort(n.at)}).`);

/** "Where this comes from": UKHSA. */
export function healthAlertStatus(a: LiveHealthAlert): string | null {
  if (a.state === "none" || a.state === "loading") return null;
  if (a.state === "failed") return `Couldn't get heat and cold health alerts for ${a.region} from UKHSA at ${hhmm(a.at)}.`;
  if (!a.alert) return `Heat and cold health alerts for ${a.region} from UKHSA at ${hhmm(a.at)}: none at amber or red in force.`;
  const h = a.alert;
  return `UKHSA ${h.level} ${h.kind} health alert for ${h.region}${h.until ? ` until ${utcShort(h.until)}` : ""}, checked at ${hhmm(a.at)}. Routes for people who need rests favour benches${h.kind === "heat" ? " and cover" : ""}.`;
}

/** "Where this comes from": gusts. */
export function gustStatus(g: { kmh: number; at: string; source: string } | undefined): string | null {
  if (!g) return null;
  return `Gusts up to ${Math.round(g.kmh)} km/h, from ${g.source} for ${utcShort(g.at)}.${g.kmh >= GUST_BRIDGE_KMH ? " Exposed bridges cost more for scooters, manual wheelchairs and lightweight powerchairs." : ""}`;
}

/** "Where this comes from": air quality, pollen and UV, then the river. */
export function areaStatus(a: LiveArea, river: boolean): string[] {
  const out: string[] = [];
  if (a.airFailed) out.push("Couldn't get air quality, pollen and UV from Open-Meteo.");
  else if (a.air) out.push(`Air quality, pollen and UV from the Copernicus Atmosphere Monitoring Service, via Open-Meteo: ${a.air.length ? a.air.map((n) => n.text).join("; ") : "nothing high"}.`);
  if (river) {
    if (a.riverFailed) out.push("Couldn't get the Water of Leith level from SEPA.");
    else if (a.river) out.push(`Water of Leith at Murrayfield from SEPA at ${hhmm(a.river.at)}: ${a.river.metres.toFixed(2)} m. Said on routes using the walkway from ${WATER_OF_LEITH_HIGH_M.toFixed(2)} m.`);
  }
  return out;
}
