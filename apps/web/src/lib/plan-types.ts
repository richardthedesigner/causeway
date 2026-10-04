import type { Conditions, EntranceOption, NavPlan, RouteSummary } from "@causeway/router";
import type { Profile } from "@causeway/profile";
import type { WorksObservation } from "@causeway/live";
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
  /** Rides (bus, tram, Metro, train), drawn apart from the walking and labelled where you board. */
  rides: { coords: [number, number][]; label: string }[];
  /** Bus legs, for the departures line: stop, route, buses an hour now (timetable). */
  busLegs: { stopId: string; stopName: string; route: string; headsign: string | null; perHour: number }[];
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
      /** The entrance the route ends at, when one near a building fits this person; null means the building's centre. */
      door: { name: string | null; osmId: number; detail: string } | null;
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
  | { type: "init"; graphUrl: string; networkUrl?: string; worksUrl?: string; busUrl?: string; places: Place[] }
  | { type: "works-live"; works: WorksObservation[]; fetchedAt: string }
  /** Venues with an accessible toilet, from the search index, so routing can pass them. */
  | { type: "toilets"; points: { lon: number; lat: number; name: string }[] }
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
  | { type: "ready"; places: Place[]; network: { coords: [number, number][]; bin: number }[]; bbox: [number, number, number, number]; builtAt: string; buses: { stops: number; lines: number; source: string } | null }
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
