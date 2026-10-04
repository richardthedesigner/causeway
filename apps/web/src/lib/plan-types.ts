import type { Conditions, EntranceOption, NavPlan, RouteSummary } from "@causeway/router";
import type { Profile } from "@causeway/profile";
import type { Stretch, UserNote } from "@causeway/graph";

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
  /** Turn-by-turn plan for this route (manoeuvres, hazards, geometry). */
  nav: NavPlan;
  /** Where the data is missing, by street, so the user can judge it. */
  unknowns: { name: string; m: number; what: string }[];
  /** Named stretches in route order, for notes: which ones the route passes, and what to attach a new note to. */
  stretches: (Stretch & { m: number })[];
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

export interface LiftOutageMsg {
  stationId: string;
  stationName: string | null;
  liftIds: string[];
  message: string;
  alternativeMentioned: boolean;
  fetchedAt: string;
}

export type WorkerRequest =
  | { type: "init"; graphUrl: string; networkUrl?: string; places: Place[] }
  | { type: "live"; outages: LiftOutageMsg[] }
  | {
      type: "plan";
      id: number;
      from: Place;
      to: Place;
      profile: Profile;
      conditions: Omit<Conditions, "now"> & { now: string };
      /** Notes on this device, without photos. Soft signals for the cost model only. */
      notes: UserNote[];
    };

export type WorkerResponse =
  | { type: "ready"; places: Place[]; network: { coords: [number, number][]; bin: number }[]; bbox: [number, number, number, number]; builtAt: string }
  | { type: "error"; message: string }
  | { type: "live"; applied: number; fetchedAt: string }
  | { type: "plan"; id: number; result: PlanResult };
