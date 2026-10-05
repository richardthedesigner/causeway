/**
 * Where to get on and off the train for level access (D-060). TfL names the
 * doors on some platforms ("2 centre doors on cars 5 and 6"). A board edge
 * covers every platform of its line at the station, so the platform is
 * picked by the direction of the ride: a "Northbound" platform for a ride
 * heading mostly north. When that can't be told, every platform with a
 * door location is named.
 */
import type { GraphEdge, PlatformBoarding } from "@causeway/graph";
import type { Step } from "./router.js";

const BOUNDS = ["Northbound", "Southbound", "Eastbound", "Westbound"] as const;

/** The compass word for a ride from a to b ([lon, lat]), by its larger component. */
function bound(a: [number, number], b: [number, number]): (typeof BOUNDS)[number] {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "Eastbound" : "Westbound") : dy > 0 ? "Northbound" : "Southbound";
}

/** The platforms of a board edge the ride uses: matched by direction, or all of them. */
function platformsFor(board: GraphEdge, ride: Step | undefined): PlatformBoarding[] {
  const all = board.boarding?.platforms ?? [];
  if (!ride || all.length < 2) return all;
  const g = ride.edge.geometry;
  const [a, b] = ride.forward ? [g[0]!, g[g.length - 1]!] : [g[g.length - 1]!, g[0]!];
  const word = bound(a, b);
  const match = all.filter((p) => p.platform.startsWith(word));
  return match.length ? match : all;
}

const doorsText = (ps: PlatformBoarding[]) => {
  const named = ps.filter((p) => p.levelAccessAt);
  if (!named.length) return null;
  if (named.length === 1 || named.every((p) => p.levelAccessAt === named[0]!.levelAccessAt)) return `the ${lower(named[0]!.levelAccessAt!)}`;
  return named.map((p) => `the ${lower(p.levelAccessAt!)} on ${p.platform}`).join(", or ");
};
const lower = (s: string) => s.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());

/**
 * Level-access door advice for a train leg that starts with the board step at
 * `i` (forward). Says where to board, and where to be on the train to get off
 * level, when TfL says. Null when TfL names no doors at either end.
 */
export function levelAccessAdvice(steps: readonly Step[], i: number): string | null {
  const board = steps[i];
  if (!board || board.edge.kind !== "board" || !board.forward) return null;
  let j = i + 1;
  while (j < steps.length && steps[j]!.edge.kind === "transit") j++;
  const firstRide = steps[i + 1]?.edge.kind === "transit" ? steps[i + 1] : undefined;
  const lastRide = j - 1 > i && steps[j - 1]!.edge.kind === "transit" ? steps[j - 1] : undefined;
  const alight = steps[j]?.edge.kind === "board" && !steps[j]!.forward ? steps[j]!.edge : null;
  const parts: string[] = [];
  const on = doorsText(platformsFor(board.edge, firstRide));
  if (on) parts.push(`For level access, board at ${on}.`);
  const off = alight ? doorsText(platformsFor(alight, lastRide)) : null;
  if (off && alight) parts.push(`To get off level at ${(alight.name ?? "").split(", ")[0]}, be at ${off}.`);
  return parts.length ? parts.join(" ") : null;
}
