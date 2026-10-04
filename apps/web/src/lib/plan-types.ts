import type { Conditions, EntranceOption, NavPlan, RouteSummary } from "@causeway/router";
import type { Profile } from "@causeway/profile";
import type { WorksObservation } from "@causeway/live";

export interface Place {
  id: string;
  name: string;
  /** Short context line: "Street", "Station", "Demo address". */
  kind: string;
  lon: number;
  lat: number;
  /** A building you go into (show "Getting in"); streets and areas are not. */
  venue?: boolean;
  /** Access facts as the source states them ("Mapped as wheelchair accessible"), never our verdict. */
  facts?: string[];
  /** Where the facts come from and how old they are: "OpenStreetMap, checked Mar 2025". */
  factsSource?: string;
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
  | { type: "init"; graphUrl: string; networkUrl?: string; worksUrl?: string; places: Place[] }
  | { type: "works-live"; works: WorksObservation[]; fetchedAt: string }
  | { type: "live"; outages: LiftOutageMsg[] }
  | { type: "plan"; id: number; from: Place; to: Place; profile: Profile; conditions: Omit<Conditions, "now"> & { now: string } };

export type WorkerResponse =
  | { type: "ready"; places: Place[]; network: { coords: [number, number][]; bin: number }[]; bbox: [number, number, number, number]; builtAt: string }
  | { type: "error"; message: string }
  | { type: "works"; summary: WorksSummary }
  | { type: "live"; applied: number; fetchedAt: string }
  | { type: "plan"; id: number; result: PlanResult };

/** Street works on pavements in the loaded area, for the "what we know right now" line. */
export interface WorksSummary {
  /** Works on pavements going on now: closed, and on the pavement but not closing it. */
  closedNow: number;
  affectedNow: number;
  /** Planned later (still within their dates when they start). */
  upcoming: number;
  sources: string[];
  /** When the newest feed was read. */
  asOf: string;
}
