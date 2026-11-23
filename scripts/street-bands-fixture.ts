/**
 * The Grassmarket fixture for the street bands (design v3, FEAT-66):
 * Warrender Park Road to the Grassmarket on the manual wheelchair preset,
 * routed by the real router on the committed Edinburgh data.
 *
 *   pnpm tsx scripts/street-bands-fixture.ts
 *
 * rewrites apps/web/test/fixtures/street-bands-grassmarket.json. Run it after
 * the Edinburgh snapshot, the bus file, the council footways or the preset
 * change, then read the diff: the bands are what the design review looks at.
 *
 * It plans as the worker does: the city as `loadCity` builds it (graph, buses,
 * council footways; no live data, so the day it runs doesn't matter), a dry
 * Monday lunchtime, and the first of `alternatives`. The start is where the
 * app's search puts "Warrender Park Road": the middle of the longest edge
 * tagged with that name. The end is the app's "Grassmarket" place.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "@causeway/profile";
import { summarise, type Route, type RouteSummary } from "@causeway/router";
import { streetBands, type BandStep, type StreetBand } from "../apps/web/src/lib/street-bands.js";
import { loadCity, PERF_CONDITIONS, ROOT } from "./perf.js";

export const FIXTURE_PATH = join(ROOT, "apps/web/test/fixtures/street-bands-grassmarket.json");
const PRESET = "manual-wheelchair";
const FROM = "Warrender Park Road";
const TO = { name: "Grassmarket", lon: -3.196, lat: 55.9476 };

export interface BandsFixture {
  note: string;
  journey: { from: { name: string; lon: number; lat: number }; to: typeof TO; preset: string; area: string; now: string };
  summary: RouteSummary;
  /** The router's steps, cut down to what `streetBands` reads. */
  steps: BandStep[];
  /** What `streetBands` made of them when the fixture was written. */
  bands: StreetBand[];
}

/** The journey, planned now by the real router. */
export function planGrassmarket(): { route: Route; summary: RouteSummary; from: { name: string; lon: number; lat: number } } {
  const { router, graph } = loadCity("edinburgh-central");
  const c = PERF_CONDITIONS;
  const p = PRESETS[PRESET];
  // As the worker's search index does: tagged names only, the longest edge, its middle point.
  const edge = graph.edges.filter((e) => e.name === FROM && !e.nameInferred && e.kind !== "steps").sort((a, b) => b.lengthM - a.lengthM)[0];
  if (!edge) throw new Error(`${FROM} is not in the Edinburgh graph`);
  const [lon, lat] = edge.geometry[Math.floor(edge.geometry.length / 2)]!;
  const route = router.alternatives(router.snap(lon, lat, p, c), router.snap(TO.lon, TO.lat, p, c), p, c, 3)[0];
  if (!route) throw new Error("No route: the journey no longer fits the manual wheelchair. Use diagnose and rewrite the fixture by hand.");
  return { route, summary: summarise(route, c.now), from: { name: FROM, lon, lat } };
}

const slim = <T>(a: { value: T | null; state: string; source: string; observedAt: string | null }) => ({ value: a.value, state: a.state, source: a.source, observedAt: a.observedAt });

export function buildFixture(): BandsFixture {
  const { route, summary, from } = planGrassmarket();
  const steps = route.steps.map((s) => ({
    edge: {
      id: s.edge.id,
      name: s.edge.name,
      kind: s.edge.kind,
      lengthM: s.edge.lengthM,
      ...(s.edge.service ? { service: { mode: s.edge.service.mode, route: s.edge.service.route, headsign: s.edge.service.headsign, operator: s.edge.service.operator } } : {}),
      attrs: { incline: slim(s.edge.attrs.incline), inclineMax: slim(s.edge.attrs.inclineMax), surface: slim(s.edge.attrs.surface) },
    },
    forward: s.forward,
    eval: { passable: s.eval.passable },
    nodeEval: { passable: s.nodeEval.passable },
  })) as BandStep[];
  return {
    note: "Written by scripts/street-bands-fixture.ts from the real router. Do not edit by hand: run `pnpm tsx scripts/street-bands-fixture.ts`.",
    journey: { from, to: TO, preset: PRESET, area: "edinburgh-central", now: PERF_CONDITIONS.now.toISOString() },
    summary,
    steps,
    bands: streetBands({ steps }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = buildFixture();
  writeFileSync(FIXTURE_PATH, JSON.stringify(f, null, 1) + "\n");
  console.log(`${f.summary.verdict}, unknownM ${f.summary.unknownM}, walkM ${f.summary.walkM}`);
  for (const b of f.bands) console.log(`${b.state.padEnd(8)} ${String(b.m).padStart(5)} m  ${b.name}: ${b.condition}${b.names ? ` (${b.names.join(", ")})` : ""}`);
}
