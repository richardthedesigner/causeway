/**
 * Where a route ends: a building's door that fits (D-018), or a park's gate (DATA-08).
 */
import type { ParkGate } from "./greenspace";

/** Park-like kinds in our search ("Park", "Garden", "Garden / George Square"). */
export const isParkKind = (kind: string) => /^(Park|Garden)$/.test(kind.split(" / ")[0] ?? "");

/**
 * Whether to look for a building door that fits first. Yes for venues and pins. Not for a park
 * found by name that we have gates for: a neighbouring building's door is the wrong place to end,
 * so its gate wins (D-048, from PR #36).
 */
export function doorFirst(to: { id: string; kind: string; venue?: boolean }, gates: readonly ParkGate[]): boolean {
  if (!to.venue && !to.id.startsWith("pin:")) return false;
  return !(gates.length > 0 && isParkKind(to.kind));
}
