/**
 * The acceptance journeys' cities, loaded as the router worker loads them.
 * Used by scripts/preset-outcomes.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addBus, applyCouncilFootways, applyStationAccess, loadSnapshot, refRides, type BusNetwork, type CouncilFootways, type Graph, type TransitNetwork } from "@causeway/graph/node";
import { Router, type Conditions } from "@causeway/router";
import { EDINBURGH_CENTRAL_JOURNEYS, LONDON_JOURNEYS, NEWCASTLE_JOURNEYS, type Journey } from "./journeys.js";

export const ROOT = join(import.meta.dirname, "..");

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
