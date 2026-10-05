/**
 * A route as plain text, to paste into a message for a carer or a friend
 * (SMALL-04). What the route is like and the directions in words. Never the
 * device or its limits: those stay on the phone (D-009).
 */
import type { PlannedRoute } from "./plan-types";

const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

export function routeText(from: { name: string }, to: { name: string }, r: Pick<PlannedRoute, "summary" | "segments" | "unknowns">, when = new Date()): string {
  const s = r.summary;
  const facts = [`About ${s.minutes} min, ${km(s.distanceM)}.`];
  if (s.worstInclinePct !== null) facts.push(`Steepest ${Math.abs(s.worstInclinePct)}%${s.worstInclineAt ? ` on ${s.worstInclineAt}` : ""}.`);
  facts.push(s.steps ? `${s.steps} step${s.steps === 1 ? "" : "s"}.` : "No steps.");
  if (s.lifts) facts.push(`${s.lifts} lift${s.lifts === 1 ? "" : "s"}.`);
  const lines = [`From ${from.name} to ${to.name}`, facts.join(" ")];
  if (r.unknowns.length) {
    const names = [...new Set(r.unknowns.map((u) => u.name))];
    lines.push(`Not known for ${km(s.unknownM)}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? " and more" : ""}.`);
  }
  lines.push("", ...r.segments.map((t, i) => `${i + 1}. ${t}`), "", `Planned with Causewayside on ${DAY.format(when)}. Things on the ground change, so check as you go.`);
  return lines.join("\n");
}
