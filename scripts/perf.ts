/**
 * The speed budget (docs/plans/PERF_BASELINE.md, D-055): what each city costs
 * to download, and how long routing the acceptance journeys takes. Shared by
 * `pnpm perf:baseline` (writes the baseline), scripts/perf-budget.test.ts
 * (fails when a change goes over it) and scripts/preset-outcomes.ts.
 *
 * Route time is measured the way the app plans: `alternatives` (up to three
 * routes) for each journey and preset, on the graph as the router worker
 * loads it. Two measures:
 * - settled nodes: deterministic, the same on any machine;
 * - wall time, divided by a fixed CPU workload timed in the same process, so a
 *   slower CI runner doesn't read as a slower router.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { addBus, applyCouncilFootways, applyStationAccess, loadSnapshot, refRides, type BusNetwork, type CouncilFootways, type Graph, type TransitNetwork } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { Router, tradeoffs, type Conditions } from "@causeway/router";
import { EDINBURGH_CENTRAL_JOURNEYS, LONDON_JOURNEYS, NEWCASTLE_JOURNEYS, type Journey } from "./journeys.js";

export const ROOT = join(import.meta.dirname, "..");
export const BASELINE_PATH = join(ROOT, "scripts/perf-baseline.json");

/** The data a city downloads beside its graph, search index, buses and base map: at most this much, compressed. */
export const EXTRA_BUDGET_BYTES = 400 * 1024;
/** Route time on the acceptance journeys may grow by at most this share. */
export const ROUTE_BUDGET = 0.1;

export interface Area {
  area: string;
  city: string;
  journeys: Journey[];
}

export const AREAS: Area[] = [
  { area: "edinburgh-central", city: "Edinburgh", journeys: EDINBURGH_CENTRAL_JOURNEYS },
  { area: "newcastle-gateshead", city: "Newcastle and Gateshead", journeys: NEWCASTLE_JOURNEYS },
  { area: "london-jubilee", city: "London", journeys: LONDON_JOURNEYS },
];

/** Presets that exercise different parts of the cost model: none, step-free and kerbs, crossings and lighting. */
export const PERF_PRESETS = ["walking", "manual-wheelchair", "visual-impairment"] as const;

/**
 * Presets with a rest interval. Their plans also search for "More benches" (and, for fatigue, "Past more toilets"),
 * which `alternatives` never does, so they get their own measure: route plus trade-offs, as the worker runs
 * before it answers (D-054). Walking stick and crutches use the same search with a shorter interval.
 */
export const REST_PRESETS = ["rollator", "fatigue"] as const;

/** A Monday lunchtime, so buses run, in daylight. */
export const PERF_CONDITIONS: Conditions = { now: new Date("2026-10-05T12:00:00Z"), wet: false, ice: false, dark: false };

/**
 * The city as the router worker loads it (apps/web/src/lib/router.worker.ts): graph, buses, Edinburgh's
 * council footways, London's station data and ride refs. No live data (works, floods, lifts,
 * disruptions), so results don't depend on the day it runs.
 */
export function loadCity(area: string): { router: Router; graph: Graph; loadMs: number } {
  const t0 = performance.now();
  const graph = loadSnapshot(join(ROOT, "data/snapshots", `${area}.graph.json.gz`));
  const bus = join(ROOT, "data/transit", area, "bus.json");
  if (existsSync(bus)) addBus(graph, JSON.parse(readFileSync(bus, "utf8")) as BusNetwork);
  const footways = join(ROOT, "data/council", `${area}.footways.json`);
  if (existsSync(footways)) applyCouncilFootways(graph, JSON.parse(readFileSync(footways, "utf8")) as CouncilFootways);
  if (area === "london-jubilee") {
    applyStationAccess(graph, JSON.parse(readFileSync(join(ROOT, "data/transit/london/network.json"), "utf8")) as TransitNetwork);
    refRides(graph);
  }
  const router = new Router(graph);
  return { router, graph, loadMs: performance.now() - t0 };
}

export interface FileSize {
  what: string;
  path: string;
  /** Bytes on disk. */
  bytes: number;
  /** Bytes over the wire: the file itself when it's already compressed, else gzip -9 of it. */
  wireBytes: number;
}

/**
 * Every file the app downloads for a city, as `apps/web/scripts/copy-graphs.mjs` copies them.
 * `extra` marks the data beside the graph (council layer, park gates, notes, toilets, floods, works):
 * the part the download budget holds.
 */
export function citySizes(area: string): (FileSize & { extra: boolean })[] {
  const files: [string, string, boolean][] = [
    ["Street graph", `data/snapshots/${area}.graph.json.gz`, false],
    ["Search index", `data/places/${area}.json.gz`, false],
    ["Buses, trams and Metro", `data/transit/${area}/bus.json`, false],
    ["Base map", `data/basemap/${area}.pmtiles`, false],
    ["Council footways", `data/council/${area}.footways.json`, true],
    ["Park gates", `data/places/${area}.greenspace.json`, true],
    ["OpenStreetMap notes", `data/places/${area}.osm-notes.json`, true],
    ["Toilet Map", `data/places/${area}.toiletmap.json`, true],
    ["Flood areas", `data/live/${area}.flood-areas.json`, true],
    ["Pavement works", `data/live/${area}.works.json`, true],
  ];
  if (area === "london-jubilee") files.push(["Rail network (lifts, station data)", "data/transit/london/network.json", false]);
  return files
    .filter(([, p]) => existsSync(join(ROOT, p)))
    .map(([what, p, extra]) => {
      const full = join(ROOT, p);
      const bytes = statSync(full).size;
      const compressed = p.endsWith(".gz") || p.endsWith(".pmtiles");
      return { what, path: p, bytes, wireBytes: compressed ? bytes : gzipSync(readFileSync(full), { level: 9 }).length, extra };
    });
}

/** Total compressed size of the data a city downloads beside its graph, search index, buses and base map. */
export function extraBytes(area: string): number {
  return citySizes(area)
    .filter((f) => f.extra)
    .reduce((t, f) => t + f.wireBytes, 0);
}

/** The fastest of several runs: the least disturbed by whatever else the machine is doing. */
const fastest = (xs: number[]) => Math.min(...xs);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/**
 * A fixed workload shaped like routing but sharing no code with it:
 * Dijkstra with a binary heap and Map lookups over a seeded 250 x 250 grid.
 * Its fastest time is the yardstick wall times are divided by, so a slower
 * machine doesn't read as a slower router.
 */
export function calibrate(runs = 9): number {
  const N = 250;
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const adj = new Map<number, { to: number; w: number }[]>();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const id = y * N + x;
      const out: { to: number; w: number }[] = [];
      if (x + 1 < N) out.push({ to: id + 1, w: 1 + rnd() });
      if (y + 1 < N) out.push({ to: id + N, w: 1 + rnd() });
      if (x > 0) out.push({ to: id - 1, w: 1 + rnd() });
      if (y > 0) out.push({ to: id - N, w: 1 + rnd() });
      adj.set(id, out);
    }
  const one = () => {
    const t0 = performance.now();
    const dist = new Map<number, number>([[0, 0]]);
    const done = new Set<number>();
    const ids: number[] = [0];
    const keys: number[] = [0];
    while (ids.length) {
      // Pop the minimum.
      const u = ids[0]!;
      const lastId = ids.pop()!;
      const lastKey = keys.pop()!;
      if (ids.length) {
        ids[0] = lastId;
        keys[0] = lastKey;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          let m = i;
          if (l < ids.length && keys[l]! < keys[m]!) m = l;
          if (l + 1 < ids.length && keys[l + 1]! < keys[m]!) m = l + 1;
          if (m === i) break;
          [ids[i], ids[m]] = [ids[m]!, ids[i]!];
          [keys[i], keys[m]] = [keys[m]!, keys[i]!];
          i = m;
        }
      }
      if (done.has(u)) continue;
      done.add(u);
      const du = dist.get(u)!;
      for (const a of adj.get(u)!) {
        const nd = du + a.w;
        if (nd >= (dist.get(a.to) ?? Infinity)) continue;
        dist.set(a.to, nd);
        // Push.
        ids.push(a.to);
        keys.push(nd);
        for (let i = ids.length - 1; i > 0; ) {
          const p = (i - 1) >> 1;
          if (keys[p]! <= nd) break;
          [ids[i], ids[p]] = [ids[p]!, ids[i]!];
          [keys[i], keys[p]] = [keys[p]!, keys[i]!];
          i = p;
        }
      }
    }
    if (done.size !== N * N) throw new Error("calibration graph not connected");
    return performance.now() - t0;
  };
  one();
  return fastest(Array.from({ length: runs }, one));
}

export interface JourneyTiming {
  journey: string;
  preset: string;
  /** Fastest wall time of `alternatives` over the runs, milliseconds. */
  ms: number;
  /** Nodes settled by one `alternatives` call. */
  settled: number;
  routes: number;
}

export interface CityTiming {
  area: string;
  /** Load and index: parse, buses, router, milliseconds (one run). */
  loadMs: number;
  journeys: JourneyTiming[];
  totalMs: number;
  totalSettled: number;
}

export interface Measurement {
  measuredAt: string;
  /** Calibration workload, fastest of the runs before and after, milliseconds. */
  calibrationMs: number;
  cities: CityTiming[];
  /** All cities' route time. */
  totalMs: number;
  /** totalMs / calibrationMs: comparable across machines, roughly. */
  normalised: number;
}

/** Route every journey with every perf preset; fastest of `runs` timings each, plus one counted run. */
export function timeRoutes(router: Router, journeys: Journey[], runs = 3): JourneyTiming[] {
  const c = PERF_CONDITIONS;
  const out: JourneyTiming[] = [];
  for (const j of journeys) {
    for (const key of PERF_PRESETS) {
      const p = PRESETS[key];
      const from = router.snap(j.from.lon, j.from.lat, p, c);
      const to = router.snap(j.to.lon, j.to.lat, p, c);
      const before = router.settled;
      const routes = router.alternatives(from, to, p, c, 3).length;
      const settled = router.settled - before;
      const ms = fastest(
        Array.from({ length: runs }, () => {
          const s = performance.now();
          router.alternatives(from, to, p, c, 3);
          return performance.now() - s;
        }),
      );
      out.push({ journey: j.id, preset: key, ms, settled, routes });
    }
  }
  return out;
}

/** Route plus trade-offs for every journey with every rest preset; fastest of `runs` timings each. */
export function timePlans(router: Router, journeys: Journey[], runs = 3): JourneyTiming[] {
  const c = PERF_CONDITIONS;
  const out: JourneyTiming[] = [];
  for (const j of journeys) {
    for (const key of REST_PRESETS) {
      const p = PRESETS[key];
      const from = router.snap(j.from.lon, j.from.lat, p, c);
      const to = router.snap(j.to.lon, j.to.lat, p, c);
      let routes = 0;
      const ms = fastest(
        Array.from({ length: runs }, () => {
          const s = performance.now();
          const r = router.route(from, to, p, c);
          routes = r ? 1 + tradeoffs(router, r, from, to, p, c).filter((t) => t.route).length : 0;
          return performance.now() - s;
        }),
      );
      out.push({ journey: j.id, preset: key, ms, settled: 0, routes });
    }
  }
  return out;
}

export interface PlanMeasurement {
  measuredAt: string;
  calibrationMs: number;
  /** Route plus trade-offs, all cities, rest presets, milliseconds. */
  totalMs: number;
  normalised: number;
  journeys: (JourneyTiming & { area: string })[];
}

/** One timed pass of `timePlans` over every city, with the yardstick timed before and after. */
export function measurePlans(cities: LoadedCity[], runs = 3): PlanMeasurement {
  const c0 = calibrate();
  const journeys = cities.flatMap((c) => timePlans(c.router, c.area.journeys, runs).map((j) => ({ ...j, area: c.area.area })));
  const calibrationMs = Math.min(c0, calibrate());
  const totalMs = journeys.reduce((t, x) => t + x.ms, 0);
  return { measuredAt: new Date().toISOString(), calibrationMs, totalMs, normalised: totalMs / calibrationMs, journeys };
}

export type LoadedCity = ReturnType<typeof loadCity> & { area: Area };

/** Load every city once, as the worker would. */
export const loadAll = (): LoadedCity[] => AREAS.map((a) => ({ ...loadCity(a.area), area: a }));

/**
 * One timed pass over every city, with the yardstick timed before and after.
 * Call it on cities that have already routed once (the first pass warms the JIT).
 */
export function measureAll(cities: LoadedCity[], runs = 3): Measurement {
  const c0 = calibrate();
  const timed = cities.map((c): CityTiming => {
    const journeys = timeRoutes(c.router, c.area.journeys, runs);
    return { area: c.area.area, loadMs: c.loadMs, journeys, totalMs: journeys.reduce((t, x) => t + x.ms, 0), totalSettled: journeys.reduce((t, x) => t + x.settled, 0) };
  });
  const calibrationMs = Math.min(c0, calibrate());
  const totalMs = timed.reduce((t, x) => t + x.totalMs, 0);
  return { measuredAt: new Date().toISOString(), calibrationMs, cities: timed, totalMs, normalised: totalMs / calibrationMs };
}

export interface Baseline {
  measuredAt: string;
  note: string;
  /** All cities' route time over the calibration workload. */
  normalised: number;
  calibrationMs: number;
  totalMs: number;
  cities: { area: string; totalSettled: number; totalMs: number; settled: Record<string, number> }[];
  /** Route plus trade-offs for the rest presets (measurePlans), over the same yardstick. */
  plans?: { presets: string[]; measuredAt: string; note: string; normalised: number; calibrationMs: number; totalMs: number };
}

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}
