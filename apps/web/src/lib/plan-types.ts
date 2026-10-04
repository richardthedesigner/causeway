import type { Conditions, EntranceOption, RouteSummary } from "@causeway/router";
import type { Profile } from "@causeway/profile";

export interface Place {
  id: string;
  name: string;
  /** Short context line: "Street", "Station", "Demo address". */
  kind: string;
  lon: number;
  lat: number;
  /** A building you go into (show "Getting in"); streets and areas are not. */
  venue?: boolean;
}

export interface PlannedRoute {
  id: string;
  label: string;
  coords: [number, number][];
  /** Parts of the route with missing data, drawn dashed. */
  unknownCoords: [number, number][][];
  summary: RouteSummary;
  elevation: { d: number; z: number | null }[];
  segments: string[];
  minutesExtra: number;
  /** Where the data is missing, by street, so the user can judge it. */
  unknowns: { name: string; m: number; what: string }[];
}

export interface Tradeoff {
  id: string;
  label: string;
  message: string;
  route: PlannedRoute | null;
}

export type PlanResult =
  | {
      status: "ok";
      routes: PlannedRoute[];
      headline: string;
      notes: string[];
      avoided: { name: string; detail: string }[];
      tradeoffs: Tradeoff[];
      entrances: EntranceOption[];
    }
  | { status: "none"; message: string; walkingHeadline: string | null };

export type WorkerRequest =
  | { type: "init"; graphUrl: string }
  | { type: "plan"; id: number; from: Place; to: Place; profile: Profile; conditions: Omit<Conditions, "now"> & { now: string } };

export type WorkerResponse =
  | { type: "ready"; places: Place[]; network: { coords: [number, number][]; bin: number }[]; bbox: [number, number, number, number]; builtAt: string }
  | { type: "error"; message: string }
  | { type: "plan"; id: number; result: PlanResult };
