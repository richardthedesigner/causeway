/**
 * Pedestrian graph schema. Modelled on OpenSidewalks (UW TCAT): footways are
 * first-class edges, each side of a street is its own edge, crossings and
 * kerbs are explicit, and vertical connectors (lifts, stairs, ramps,
 * escalators) are edges with their own state. The canonical store is
 * PostGIS (db/migrations); this is the in-memory/serialised form the router
 * consumes.
 */
import type { Attr } from "./attribute.js";

export type EdgeKind =
  /** OSM footway=sidewalk: one side of a street. */
  | "sidewalk"
  /** Stand-alone footway or path not tied to a street. */
  | "footway"
  /** Pedestrianised street (highway=pedestrian, living_street). */
  | "pedestrian"
  /** Marked or unmarked crossing of a carriageway. */
  | "crossing"
  | "steps"
  | "ramp"
  | "elevator"
  | "escalator"
  /** Indoor corridor (stations, malls). */
  | "corridor"
  /**
   * A road with no separately mapped footway. We route along the centreline
   * as a stand-in for its pavements, and say so: kerb and width facts are
   * unknown by construction, and the edge is never presented as verified.
   */
  | "street_proxy";

export type Surface =
  | "asphalt"
  | "concrete"
  | "paving_stones"
  | "sett"
  | "cobblestone"
  | "compacted"
  | "fine_gravel"
  | "gravel"
  | "grass"
  | "wood"
  | "metal"
  | "other";

export type Smoothness = "excellent" | "good" | "intermediate" | "bad" | "very_bad" | "horrible";

export type KerbType = "raised" | "lowered" | "flush" | "rolled";

export interface KerbInfo {
  type: Attr<KerbType>;
  /** Kerb upstand in centimetres. */
  heightCm: Attr<number>;
  tactilePaving: Attr<boolean>;
}

export type DoorType = "hinged" | "sliding" | "revolving" | "swinging" | "folding" | "overhead" | "no" | "other";
export type AutomaticDoor = "yes" | "no" | "button" | "motion" | "floor" | "continuous" | "slowdown_button";

/** A way into a building or station. Mostly on building outlines, so usually not part of the footway network. */
export interface EntranceInfo {
  /** OSM entrance=*: main, secondary, service, emergency, staircase, yes... */
  entrance: Attr<string>;
  door: Attr<DoorType>;
  automatic: Attr<AutomaticDoor>;
  widthM: Attr<number>;
  stepCount: Attr<number>;
  wheelchair: Attr<"yes" | "limited" | "no">;
  /** Ramp or kerb at the door, if tagged. */
  ramp: Attr<boolean>;
}

export interface Entrance extends EntranceInfo {
  id: number;
  lon: number;
  lat: number;
  level: number;
  name: string | null;
  osmId: number;
}

export type AmenityKind = "bench" | "toilets" | "changing_places";

/** Rest points and toilets: for rest- and toilet-aware routing and the map layer. */
export interface Amenity {
  id: number;
  lon: number;
  lat: number;
  kind: AmenityKind;
  wheelchair: Attr<"yes" | "limited" | "no">;
  /** Bench backrest / armrest, toilet changing table, RADAR key: free-form facts with source. */
  details: Record<string, Attr<string>>;
  osmId: number;
}

export type NodeKind = "junction" | "kerb" | "crossing" | "entrance" | "elevator" | "endpoint";

export interface GraphNode {
  id: number;
  lon: number;
  lat: number;
  /** Elevation of the walking surface in metres (ODN). */
  ele: Attr<number>;
  /** Building/structure level, OSM `level`. 0 = street. */
  level: number;
  kind: NodeKind;
  kerb?: KerbInfo;
  /** Present when this network node is a building or station entrance. */
  entrance?: EntranceInfo;
  /** OSM node id when the node maps 1:1 to OSM. */
  osmId?: number;
}

export interface EdgeAttrs {
  /**
   * Signed along-track gradient in percent, positive uphill from `from` to
   * `to`. The mean over the edge.
   */
  incline: Attr<number>;
  /** Steepest 10 m window along the edge, signed like incline. */
  inclineMax: Attr<number>;
  /** Cross-slope (camber) in percent, absolute. */
  crossSlope: Attr<number>;
  surface: Attr<Surface>;
  smoothness: Attr<Smoothness>;
  /** Usable width in metres (after pinch points). */
  width: Attr<number>;
  stepCount: Attr<number>;
  handrail: Attr<boolean>;
  lit: Attr<boolean>;
  covered: Attr<boolean>;
  /** OSM wheelchair=yes|limited|no on the way itself. */
  wheelchair: Attr<"yes" | "limited" | "no">;
}

export type LiveStatus = "open" | "closed" | "restricted" | "degraded";

export interface LiveState {
  status: LiveStatus;
  reason: string;
  source: string;
  /** ISO 8601. Live states always expire; nothing stays closed forever by accident. */
  validFrom: string;
  validUntil: string;
}

export interface GraphEdge {
  id: number;
  from: number;
  to: number;
  kind: EdgeKind;
  /** [lon, lat] pairs, from → to. */
  geometry: [number, number][];
  lengthM: number;
  name: string | null;
  /** True when `name` was borrowed from the nearest street rather than tagged on the way. */
  nameInferred?: boolean;
  level: number;
  /** OSM layer; >0 for bridges, <0 for tunnels. */
  layer: number;
  bridge: boolean;
  /** Movable bridge type (tilt, swing, bascule...): it closes while it moves. */
  movable?: string;
  /** Can it be traversed to → from? Escalators and some lifts cannot. */
  bidirectional: boolean;
  attrs: EdgeAttrs;
  live?: LiveState;
  osmWayId?: number;
}

export interface Graph {
  meta: {
    name: string;
    bbox: [number, number, number, number];
    builtAt: string;
    sources: { id: string; licence: string; attribution: string; snapshot: string }[];
    /** Live feeds that cover this area, e.g. "tfl-lifts". Absent means none: say so when it matters. */
    liveFeeds?: string[];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** All entrances in the area, on the network or not. */
  entrances?: Entrance[];
  amenities?: Amenity[];
}
