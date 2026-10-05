/**
 * The route card's line when a TfL feed couldn't be checked (D-061). Lift
 * status counts for every route here; line status and station disruptions
 * only for a route that rides a train.
 */
import type { DisruptionsMissing } from "@causeway/live";

export function liveFailedLine(liftsFailed: boolean, disruptions: DisruptionsMissing): string | null {
  const what = disruptions === "both" ? "station and line disruptions" : disruptions === "stations" ? "station disruptions" : disruptions === "lines" ? "line status" : null;
  if (liftsFailed && what) return `Couldn't get live lift status or ${what} from TfL. Check before you travel.`;
  if (liftsFailed) return "Couldn't get live lift status from TfL. Check before you travel.";
  if (what) return `Couldn't get live ${what} from TfL. Check before you travel.`;
  return null;
}
