/**
 * The user's own limits. One engine, per-user cost functions: nothing in
 * the router special-cases "wheelchair". Every threshold here is something
 * the user can set with a slider; presets are only starting points.
 *
 * This is health data under UK GDPR (special category). It lives on the
 * device by default and is passed to the router per request. It is never
 * logged, never sent to analytics, and never stored server-side without
 * explicit consent and a completed DPIA. See docs/DATA_MODEL.md.
 */

export type MobilityPreset =
  | "walking"
  | "manual-wheelchair"
  | "manual-wheelchair-companion"
  | "powerchair"
  | "mobility-scooter"
  | "rollator"
  | "crutches"
  | "pram"
  | "fatigue"
  | "visual-impairment";

/** How much a surface costs this user. 0 = no penalty, 1 = avoid where possible, null = never. */
export type SurfaceTolerance = Record<
  "asphalt" | "concrete" | "paving_stones" | "sett" | "cobblestone" | "compacted" | "fine_gravel" | "gravel" | "grass" | "wood" | "metal" | "other",
  number | null
>;

export interface Profile {
  preset: MobilityPreset;
  /** Display label; the user can rename it ("Dad's chair"). */
  label: string;

  /** Comfortable speed on the flat, metres per second. Learned over time in Phase 4. */
  speedMps: number;

  /** Steepest sustained uphill gradient the user can manage, percent. Beyond this: excluded. */
  maxInclineUpPct: number;
  /** Steepest downhill. Often lower than uphill for manual chairs (control, braking). */
  maxInclineDownPct: number;
  /** Gradient at which effort starts to bite: soft penalty ramps from here to the max. */
  comfortInclinePct: number;
  /** Maximum cross-slope (camber), percent. */
  maxCrossSlopePct: number;
  /** Highest kerb upstand the user can mount or descend, centimetres. 0 = needs dropped/flush. */
  maxKerbCm: number;
  /** Minimum usable width, metres. */
  minWidthM: number;
  /** Steps: never, or a maximum count the user can manage. */
  maxSteps: number;
  /** Can use escalators. */
  escalators: boolean;
  surfaces: SurfaceTolerance;
  /** Extra penalty multiplier for setts and painted surfaces in the wet. 1 = none. */
  wetSurfaceSensitivity: number;
  /** Longest distance between rest points (benches), metres. null = no constraint. */
  maxRestIntervalM: number | null;
  /** Longest distance from an accessible toilet, metres. null = no constraint. */
  maxToiletIntervalM: number | null;
  /**
   * 0 = only take routes we know are passable. 1 = happy to take unknowns.
   * Scales the risk penalty for unknown attributes.
   */
  uncertaintyTolerance: number;
  /** Someone else is pushing. Changes incline limits and speed; set by the companion toggle. */
  companion: boolean;
}

const SMOOTH: SurfaceTolerance = {
  asphalt: 0,
  concrete: 0,
  paving_stones: 0.1,
  sett: 0.6,
  cobblestone: 1,
  compacted: 0.4,
  fine_gravel: 0.6,
  gravel: null,
  grass: null,
  wood: 0.1,
  metal: 0.2,
  other: 0.5,
};

const ANY: SurfaceTolerance = {
  asphalt: 0,
  concrete: 0,
  paving_stones: 0,
  sett: 0.05,
  cobblestone: 0.1,
  compacted: 0,
  fine_gravel: 0,
  gravel: 0.1,
  grass: 0.2,
  wood: 0,
  metal: 0,
  other: 0.1,
};

/**
 * Starting points only. The numbers come from UK guidance where it exists
 * (Inclusive Mobility 2021: preferred max gradient 5%, absolute 8% over
 * short distances; cross-fall 2.5%; dropped kerb flush to 6 mm) and are
 * deliberately more permissive than guidance where real users routinely
 * exceed it. Phase 2 user testing replaces these with research.
 */
export const PRESETS: Record<MobilityPreset, Profile> = {
  walking: {
    preset: "walking",
    label: "Walking",
    speedMps: 1.3,
    maxInclineUpPct: 100,
    maxInclineDownPct: 100,
    comfortInclinePct: 10,
    maxCrossSlopePct: 100,
    maxKerbCm: 30,
    minWidthM: 0.4,
    maxSteps: Infinity,
    escalators: true,
    surfaces: ANY,
    wetSurfaceSensitivity: 1,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 1,
    companion: false,
  },
  "manual-wheelchair": {
    preset: "manual-wheelchair",
    label: "Manual wheelchair",
    speedMps: 1.0,
    maxInclineUpPct: 8,
    maxInclineDownPct: 8,
    comfortInclinePct: 4,
    maxCrossSlopePct: 4,
    maxKerbCm: 2,
    minWidthM: 0.9,
    maxSteps: 0,
    escalators: false,
    surfaces: SMOOTH,
    wetSurfaceSensitivity: 1.8,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.3,
    companion: false,
  },
  "manual-wheelchair-companion": {
    preset: "manual-wheelchair-companion",
    label: "Manual wheelchair, pushed",
    speedMps: 1.1,
    maxInclineUpPct: 10,
    maxInclineDownPct: 9,
    comfortInclinePct: 5,
    maxCrossSlopePct: 6,
    maxKerbCm: 6,
    minWidthM: 0.9,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.4, cobblestone: 0.8 },
    wetSurfaceSensitivity: 1.5,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.4,
    companion: true,
  },
  powerchair: {
    preset: "powerchair",
    label: "Powerchair",
    speedMps: 1.4,
    maxInclineUpPct: 12,
    maxInclineDownPct: 10,
    comfortInclinePct: 8,
    maxCrossSlopePct: 6,
    maxKerbCm: 5,
    minWidthM: 1.0,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.3, cobblestone: 0.6, compacted: 0.2, fine_gravel: 0.3 },
    wetSurfaceSensitivity: 1.3,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.3,
    companion: false,
  },
  "mobility-scooter": {
    preset: "mobility-scooter",
    label: "Mobility scooter",
    speedMps: 1.8,
    maxInclineUpPct: 10,
    maxInclineDownPct: 10,
    comfortInclinePct: 6,
    maxCrossSlopePct: 5,
    maxKerbCm: 5,
    minWidthM: 1.1,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.4 },
    wetSurfaceSensitivity: 1.3,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.3,
    companion: false,
  },
  rollator: {
    preset: "rollator",
    label: "Rollator",
    speedMps: 0.8,
    maxInclineUpPct: 10,
    maxInclineDownPct: 10,
    comfortInclinePct: 5,
    maxCrossSlopePct: 5,
    maxKerbCm: 6,
    minWidthM: 0.7,
    maxSteps: 2,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.7 },
    wetSurfaceSensitivity: 1.6,
    maxRestIntervalM: 300,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.4,
    companion: false,
  },
  crutches: {
    preset: "crutches",
    label: "Crutches",
    speedMps: 0.8,
    maxInclineUpPct: 12,
    maxInclineDownPct: 10,
    comfortInclinePct: 5,
    maxCrossSlopePct: 8,
    maxKerbCm: 15,
    minWidthM: 0.9,
    maxSteps: 20,
    escalators: false,
    surfaces: { ...ANY, sett: 0.4, cobblestone: 0.7, gravel: 0.6, grass: 0.8 },
    wetSurfaceSensitivity: 2,
    maxRestIntervalM: 400,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.6,
    companion: false,
  },
  pram: {
    preset: "pram",
    label: "Pram or buggy",
    speedMps: 1.2,
    maxInclineUpPct: 14,
    maxInclineDownPct: 14,
    comfortInclinePct: 7,
    maxCrossSlopePct: 8,
    maxKerbCm: 8,
    minWidthM: 0.7,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.3, gravel: 0.8, grass: 1 },
    wetSurfaceSensitivity: 1.2,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.6,
    companion: false,
  },
  fatigue: {
    preset: "fatigue",
    label: "Fatigue or chronic illness",
    speedMps: 0.9,
    maxInclineUpPct: 10,
    maxInclineDownPct: 14,
    comfortInclinePct: 4,
    maxCrossSlopePct: 10,
    maxKerbCm: 20,
    minWidthM: 0.5,
    maxSteps: 15,
    escalators: true,
    surfaces: ANY,
    wetSurfaceSensitivity: 1.2,
    maxRestIntervalM: 250,
    maxToiletIntervalM: 800,
    uncertaintyTolerance: 0.6,
    companion: false,
  },
  "visual-impairment": {
    preset: "visual-impairment",
    label: "Visual impairment",
    speedMps: 1.1,
    maxInclineUpPct: 100,
    maxInclineDownPct: 100,
    comfortInclinePct: 10,
    maxCrossSlopePct: 100,
    maxKerbCm: 30,
    minWidthM: 0.9,
    maxSteps: Infinity,
    escalators: true,
    surfaces: ANY,
    wetSurfaceSensitivity: 1,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.5,
    companion: false,
  },
};

export function profileFrom(preset: MobilityPreset, overrides: Partial<Profile> = {}): Profile {
  return { ...PRESETS[preset], ...overrides };
}
