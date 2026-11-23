import { formatDistance, type DistanceUnit } from "@causeway/profile";

/**
 * A band's distance as the band shows it: the figure large, its unit small
 * beside it. In the device's unit (D-074), to the whole metre or yard, from
 * the one formatter every distance goes through: "204 m", "1.2 km", "120 yd",
 * "0.4 miles".
 */
export function bandDistance(m: number, unit: DistanceUnit): { figure: string; unit: string } {
  const text = formatDistance(m, unit, { precise: true });
  const cut = text.indexOf(" ");
  return cut < 0 ? { figure: text, unit: "" } : { figure: text.slice(0, cut), unit: text.slice(cut + 1) };
}
