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
  | "powerchair-light"
  | "mobility-scooter"
  | "mobility-scooter-road"
  | "rollator"
  | "walking-stick"
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

  /** Comfortable speed on the flat, metres per second. Learned from completed journeys (paceSamples). */
  speedMps: number;
  /** How many journeys the speed has been learned from (0 or absent: the preset's figure). */
  paceSamples?: number;

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
  /**
   * Widest gap between platform and train the user can cross, millimetres (D-068).
   * Absent: TfL's level-access band, 85 mm. No setting in the app yet.
   */
  maxGapMm?: number;
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
  /** Use buses when they help. Absent means yes. */
  buses?: boolean;
  /** Has an operator's permit to take this mobility scooter on buses (CPT code: class 2, small enough). */
  busScooterPermit?: boolean;
  /**
   * Crossing cues, in seconds of detour worth taking to avoid each: crossings with no lights or
   * zebra, zebras (no signal that traffic has stopped), lights without a beep or rotating cone, and
   * no tactile paving. Absent: crossings cost nothing extra.
   */
  crossingCues?: { uncontrolledS: number; zebraS: number; silentSignalS: number; noTactileS: number };
  /** Seconds per 100 m to avoid paths shared with cycles. Absent: no preference. */
  sharedPathPer100mS?: number;
  /** After dark, seconds per 100 m to avoid streets that aren't lit. Absent: no preference. */
  litAfterDarkPer100mS?: number;
  /**
   * Road-legal (class 3) mobility scooter: registered, may use the carriageway
   * at up to 8 mph, so a street with no pavement is an ordinary road, not a hazard.
   */
  roadLegal?: boolean;
  /**
   * How far the battery goes on one charge, in km on the flat. Absent or null
   * means not set, and no range warning is given: we never guess someone's battery.
   */
  maxRangeKm?: number | null;
  /**
   * Speed on the carriageway for a road-legal scooter, metres per second (8 mph
   * is 3.576). `speedMps` stays the pavement pace, which is what pace learning
   * learns. Ignored unless `roadLegal`.
   */
  roadSpeedMps?: number;
  /** How this person reads speeds: pace and road speed. Absent means the default for the type (see `speedUnit`). */
  speedUnit?: SpeedUnit;
}

export type SpeedUnit = "mph" | "kmh";
/** Scooters are sold and regulated in mph ("class 3: 8 mph"); everyone else defaults to km/h, as before. */
export const speedUnit = (p: Pick<Profile, "preset" | "speedUnit">): SpeedUnit => (p.speedUnit === "mph" || p.speedUnit === "kmh" ? p.speedUnit : isScooter(p) ? "mph" : "kmh");
export const MPS_PER_MPH = 0.44704;
/** "8 mph", "12.9 km/h". `long` is for screen readers: "8 miles per hour". */
export function formatSpeed(mps: number, unit: SpeedUnit, long = false): string {
  const v = unit === "mph" ? mps / MPS_PER_MPH : mps * 3.6;
  const n = Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
  return `${n} ${unit === "mph" ? (long ? "miles per hour" : "mph") : long ? "kilometres per hour" : "km/h"}`;
}
/** Road speed choices for a road-legal scooter, in mph: below the 4 mph pavement limit the road isn't worth it; 8 mph is the class 3 legal top speed. */
export const ROAD_MPH_MIN = 4;
export const ROAD_MPH_MAX = 8;

/** Any powered wheelchair, light or heavy duty. Uses the bus wheelchair space. */
export const isPowerchair = (p: Pick<Profile, "preset">) => p.preset === "powerchair" || p.preset === "powerchair-light";
/** Any mobility scooter, pavement or road. */
export const isScooter = (p: Pick<Profile, "preset">) => p.preset === "mobility-scooter" || p.preset === "mobility-scooter-road";
/** Runs on a battery, so a range on one charge means something (D-043). */
export const hasBattery = (p: Pick<Profile, "preset">) => isPowerchair(p) || isScooter(p);

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
 * (DfT Inclusive Mobility, December 2021, OGL: preferred max gradient 5%,
 * absolute 8% over short distances; cross-fall 2.5%; dropped kerb flush,
 * 0 to 6 mm; distance without a rest 50 m for walking stick and cane users,
 * 100 m for people with a mobility impairment and no stick). Gradients stay
 * more permissive than guidance where real users routinely exceed it. The
 * manual wheelchair's kerb and the rest distances follow it (D-013, D-054);
 * the rollator keeps 300 m, as it has a seat. Phase 2 user testing replaces
 * these with research.
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
    // Inclusive Mobility 2021 (DfT, OGL): dropped kerbs flush with the road, 6 mm at most (D-054).
    maxKerbCm: 0.6,
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
  /** Heavy duty or outdoor chair: big batteries, larger wheels, climbs kerbs and copes with setts. */
  powerchair: {
    preset: "powerchair",
    label: "Powerchair, heavy duty",
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
  /**
   * Lightweight or folding powerchair: small castors, low clearance, small
   * batteries. Gets stuck on cobbles and setts (tester feedback, 2026-10), and
   * manages less than a pavement scooter. Starting figures until user testing.
   */
  "powerchair-light": {
    preset: "powerchair-light",
    label: "Powerchair, lightweight",
    speedMps: 1.3,
    maxInclineUpPct: 8,
    maxInclineDownPct: 8,
    comfortInclinePct: 5,
    maxCrossSlopePct: 4,
    maxKerbCm: 3,
    minWidthM: 0.8,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.9, cobblestone: null, compacted: 0.5, fine_gravel: 0.8 },
    wetSurfaceSensitivity: 1.6,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.25,
    companion: false,
  },
  /** Class 2 pavement scooter: 4 mph, pavements only. Small ones can go on buses with a permit. */
  "mobility-scooter": {
    preset: "mobility-scooter",
    label: "Mobility scooter, pavement",
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
  /**
   * Class 3 road scooter: registered, 8 mph on the road, 4 mph on pavements.
   * Bigger and heavier than class 2, so too large for buses, but better on
   * kerbs, hills and rough ground, and fine on a street without a pavement.
   */
  "mobility-scooter-road": {
    preset: "mobility-scooter-road",
    label: "Mobility scooter, road",
    speedMps: 1.8,
    maxInclineUpPct: 12,
    maxInclineDownPct: 10,
    comfortInclinePct: 7,
    maxCrossSlopePct: 6,
    maxKerbCm: 7,
    minWidthM: 1.2,
    maxSteps: 0,
    escalators: false,
    surfaces: { ...SMOOTH, sett: 0.3, cobblestone: 0.6, compacted: 0.2, fine_gravel: 0.4 },
    wetSurfaceSensitivity: 1.3,
    maxRestIntervalM: null,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.3,
    companion: false,
    buses: false,
    roadLegal: true,
    roadSpeedMps: 3.576, // 8 mph
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
  "walking-stick": {
    preset: "walking-stick",
    label: "Walking stick",
    speedMps: 1.0,
    maxInclineUpPct: 14,
    maxInclineDownPct: 12,
    comfortInclinePct: 6,
    maxCrossSlopePct: 8,
    maxKerbCm: 15,
    minWidthM: 0.7,
    maxSteps: 30,
    escalators: true,
    surfaces: { ...ANY, sett: 0.3, cobblestone: 0.5, gravel: 0.4, grass: 0.5 },
    wetSurfaceSensitivity: 1.8,
    // Inclusive Mobility (2021) 3.4: stick and cane users, 50 m without a rest (DATA-10).
    maxRestIntervalM: 50,
    maxToiletIntervalM: null,
    uncertaintyTolerance: 0.6,
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
    // Inclusive Mobility (2021) 3.4: walking-aid users, 50 m without a rest (DATA-10).
    maxRestIntervalM: 50,
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
    // Inclusive Mobility (2021) 3.4: mobility impaired without a stick, 100 m without a rest (DATA-10).
    maxRestIntervalM: 100,
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
    // Cues a cane or guide dog user relies on (RNIB, Guide Dogs guidance on controlled crossings).
    crossingCues: { uncontrolledS: 240, zebraS: 60, silentSignalS: 120, noTactileS: 45 },
    sharedPathPer100mS: 60,
    // Many with low vision see far less at night (RNIB); lit streets also feel safer.
    litAfterDarkPer100mS: 60,
  },
};

export function profileFrom(preset: MobilityPreset, overrides: Partial<Profile> = {}): Profile {
  return { ...PRESETS[preset], ...overrides };
}

/**
 * Blend an observed moving speed into the profile. Early journeys count for
 * more; the figure is bounded so one odd trip (a lift ride, a bus) can't
 * wreck the estimate.
 */
export function learnPace(p: Profile, observedMps: number): Profile {
  if (!Number.isFinite(observedMps) || observedMps < 0.2 || observedMps > 3) return p;
  const n = p.paceSamples ?? 0;
  const w = Math.max(0.2, 1 / (n + 2));
  const speed = Math.min(2.5, Math.max(0.3, p.speedMps * (1 - w) + observedMps * w));
  return { ...p, speedMps: Math.round(speed * 100) / 100, paceSamples: n + 1 };
}

/**
 * A device the user has saved and named ("Lulu", "Cherry"). Each carries its
 * own limits, so switching device switches every threshold at once. Same
 * privacy rules as the profile: on this device only.
 */
export interface SavedDevice {
  id: string;
  /** The user's name for it, or "" if they never named it. A name is also written to profile.label. */
  name: string;
  favourite: boolean;
  profile: Profile;
}

export function savedDevice(id: string, name: string, preset: MobilityPreset, overrides: Partial<Profile> = {}, favourite = false): SavedDevice {
  return { id, name, favourite, profile: profileFrom(preset, name ? { ...overrides, label: name } : overrides) };
}

/** A kerb limit in words: "Flush only", "6 mm", "2 cm". Under a centimetre reads in millimetres, as Inclusive Mobility gives it. */
export function kerbLimitText(cm: number): string {
  if (cm <= 0) return "Flush only";
  if (cm < 1) return `${Math.round(cm * 10)} mm`;
  return `${Math.round(cm * 10) / 10} cm`;
}

/** One click of the kerb limit's plus or minus: to the next whole centimetre, never below flush. */
export function stepKerbCm(cm: number, d: 1 | -1, max = 20): number {
  const v = Math.min(cm, max);
  return Math.min(max, Math.max(0, d > 0 ? Math.floor(v) + 1 : Math.ceil(v) - 1));
}
