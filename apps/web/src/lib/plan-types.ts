import type { FloodWarning, RiverLevel } from "@causeway/live";
import type { Conditions, EntranceOption, NavPlan, OnRouteItem, RouteSummary } from "@causeway/router";
import type { Profile } from "@causeway/profile";
import type { WorksObservation } from "@causeway/live";
import type { CommunityReport, Stretch, UserNote } from "@causeway/graph";

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
  /** OpenStreetMap opening_hours, as mapped. */
  hours?: string;
}

/** A street or path on the route where some data is missing: what, how much, and a point on it to report from (FEAT-03). */
export interface RouteUnknown {
  name: string;
  m: number;
  what: string;
  lon: number;
  lat: number;
  /** Each missing attribute once, with the router's words for it ("kerb at crossing not mapped"). */
  attrs: { attr: string; detail: string }[];
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
  /** Rides a train (Underground, DLR): the TfL disruption feeds matter to this route (D-061). */
  train: boolean;
  /** Bus legs, for the departures line: stop, route, buses an hour now (timetable). */
  busLegs: { stopId: string; stopName: string; route: string; headsign: string | null; perHour: number }[];
  /** Where the data is missing, by street, so the user can judge it. */
  unknowns: RouteUnknown[];
  /** Named stretches in route order, for notes: which ones the route passes, and what to attach a new note to. */
  stretches: (Stretch & { m: number })[];
  /** The route as one bar: slope bands and what's on the way, for the route strip. */
  strip: RouteStrip;
  /** The route line in pieces by slope band, so the map matches the strip. */
  bands: { bin: number; coords: [number, number][] }[];
  /** "On this route" (D-067): blocked, slower and worth knowing, each with its label, source and date. */
  onRoute: OnRouteItem[];
}

/**
 * Slope band per part: 0-4 gradient bands (as on the map), -1 not known,
 * 5 steps, 6 a ride (bus, tram, train). Rides are drawn short: what matters
 * is the ground you cover yourself.
 */
export interface RouteStrip {
  /** Display length (rides compressed). */
  length: number;
  /** t0/t1: distance along the route (the nav plan's scale); d0/d1: along the strip. */
  parts: { t0: number; t1: number; d0: number; d1: number; bin: number }[];
  marks: { at: number; kind: "steep" | "setts" | "kerb" | "bridge" | "camber" | "lift" | "ride" | "door"; text: string }[];
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
      /** A park: the route ends at one of its gates (DATA-08). */
      gate?: { park: string } | null;
    }
  | {
      status: "none";
      message: string;
      /** What stops you on the direct way, past the closest point you can reach. */
      blockers: { name: string; attr: string; detail: string; lon: number; lat: number }[];
      /** As close as you can get, and how far short that is. */
      closest: (PlannedRoute & { name: string; leftM: number; end: [number, number] }) | null;
      /** A change to the limits, for this journey only, that finds a way. */
      relax: { patch: Partial<Profile>; what: string[]; minutes: number } | null;
    };

/** A quick verdict for a place you've been to before, from where you are now. */
export interface Check {
  placeId: string;
  verdict: "passable" | "passable-with-unknowns" | "none";
  minutes: number | null;
}

export interface LiftOutageMsg {
  stationId: string;
  stationName: string | null;
  liftIds: string[];
  message: string;
  alternativeMentioned: boolean;
  fetchedAt: string;
}

export interface RailDisruptionMsg {
  kind: "line-closed" | "line-no-step-free" | "station";
  line: string | null;
  stations: string[];
  message: string;
  validFrom: string;
  validUntil: string;
}

/** A flood warning in force over this city's paths: 1 severe, 2 warning, 3 alert. */
export interface FloodHere {
  severity: 1 | 2 | 3;
  name: string;
  label: string;
}

export type WorkerRequest =
  | { type: "init"; graphUrl: string; networkUrl?: string; worksUrl?: string; busUrl?: string; footwaysUrl?: string; floodsUrl?: string; greenspaceUrl?: string; osmNotesUrl?: string; places: Place[] }
  /** Environment Agency warnings in force (DATA-07). */
  | { type: "floods"; warnings: FloodWarning[]; fetchedAt: string }
  | { type: "works-live"; works: WorksObservation[]; fetchedAt: string }
  /** Venues with an accessible toilet, from the search index, so routing can pass them. */
  | { type: "toilets"; points: { lon: number; lat: number; name: string }[]; disputed?: { lon: number; lat: number }[] }
  /** Lift outages, and TfL line and station disruptions where they could be fetched (DATA-04). */
  /** `outages` null: the lift feed failed, so the last ones stand until they expire. A disruption feed that failed is null (D-061). */
  | { type: "live"; outages: LiftOutageMsg[] | null; disruptions: { lines: RailDisruptionMsg[] | null; stations: RailDisruptionMsg[] | null; fetchedAt: string } }
  | {
      type: "plan";
      id: number;
      from: Place;
      to: Place;
      profile: Profile;
      conditions: Omit<Conditions, "now"> & { now: string };
      /** Notes on this device, without photos. Soft signals for the cost model only. */
      notes: UserNote[];
      /** Community reports for the city, without photos (FEAT-25). Confirmed ones can block; others only warn. */
      community?: CommunityReport[];
      /** SEPA's latest Water of Leith reading (Edinburgh, D-066): a line on routes using the walkway when it's high. */
      river?: RiverLevel | null;
    }
  | { type: "check"; id: number; from: Place; to: Place[]; profile: Profile; conditions: Omit<Conditions, "now"> & { now: string } }
  /** Can each of these saved devices make this journey? For "Lulu can do this one" (D-036). */
  | { type: "fits"; id: number; from: Place; to: Place; profiles: { key: string; profile: Profile }[]; conditions: Omit<Conditions, "now"> & { now: string } };

export type WorkerResponse =
  | { type: "ready"; places: Place[]; network: { coords: [number, number][]; bin: number }[]; bbox: [number, number, number, number]; builtAt: string; buses: { stops: number; lines: number; source: string } | null }
  | { type: "error"; message: string }
  | { type: "works"; summary: WorksSummary }
  /** Flood warnings that touch this city's paths, worst first. */
  | { type: "floods"; here: FloodHere[]; fetchedAt: string }
  /**
   * `applied`: platforms closed to step-free travel by lifts. `limited`: lines left step-free to some platforms only (D-058).
   * `lines`: line closures in force now, in TfL's words. `liftsFailed`, `missing`: which feeds didn't answer this time (D-061).
   */
  | { type: "live"; applied: number; limited: number; lines: string[]; fetchedAt: string; liftsFailed: boolean; missing: "both" | "stations" | "lines" | null }
  | { type: "plan"; id: number; result: PlanResult }
  | { type: "check"; id: number; checks: Check[] }
  | { type: "fits"; id: number; fits: { key: string; minutes: number | null }[] };

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
