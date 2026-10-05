/**
 * Router fuzz test (STAB-04): many random journeys per city, for several
 * people, in dry, wet and icy weather. Whatever the router returns must be
 * a real, usable route: no crashes, no gaps, nothing the person can't use,
 * no route shorter than the straight line, and the same answer twice.
 * Seeded, so a failure names a journey that can be replayed.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCouncilFootways, haversine, loadSnapshot, type CouncilFootways } from "@causeway/graph/node";
import { PRESETS, type MobilityPreset } from "@causeway/profile";
import { DRY, Router, summarise, type Conditions } from "@causeway/router";

const ROOT = join(import.meta.dirname, "../../..");
const CITIES = ["edinburgh-central", "newcastle-gateshead", "london-jubilee"] as const;
const PEOPLE: MobilityPreset[] = ["walking", "manual-wheelchair", "powerchair", "rollator"];
const WEATHER: [string, Conditions][] = [
  ["dry", DRY],
  ["wet", { ...DRY, wet: true }],
  ["icy", { ...DRY, ice: true }],
];
const PAIRS = 15;

/** mulberry32: small, fast, and the same sequence everywhere. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function load(area: string): Router {
  const g = loadSnapshot(join(ROOT, `data/snapshots/${area}.graph.json.gz`));
  // As the app does for Edinburgh (DATA-06).
  if (area === "edinburgh-central") applyCouncilFootways(g, JSON.parse(readFileSync(join(ROOT, "data/council/edinburgh-central.footways.json"), "utf8")) as CouncilFootways);
  return new Router(g);
}

for (const [ci, area] of CITIES.entries()) {
  describe(`router fuzz: ${area}`, () => {
    it(`${PAIRS * PEOPLE.length} random journeys come back whole, usable and repeatable`, () => {
      const router = load(area);
      const nodes = router.graph.nodes;
      const random = rng(4242 + ci);
      let found = 0;
      let tried = 0;
      const problems: string[] = [];
      for (let i = 0; i < PAIRS; i++) {
        const a = nodes[Math.floor(random() * nodes.length)]!;
        const b = nodes[Math.floor(random() * nodes.length)]!;
        const [wName, weather] = WEATHER[i % WEATHER.length]!;
        for (const preset of PEOPLE) {
          const p = PRESETS[preset];
          const where = `${preset}, ${wName}, ${a.lon.toFixed(5)},${a.lat.toFixed(5)} to ${b.lon.toFixed(5)},${b.lat.toFixed(5)}`;
          tried++;
          const from = router.snap(a.lon, a.lat, p, weather);
          const to = router.snap(b.lon, b.lat, p, weather);
          const r = router.route(from, to, p, weather);
          if (!r) continue;
          found++;
          // Whole: each step starts where the last ended, from the start to the end.
          let at = from.id;
          for (const s of r.steps) {
            const start = s.forward ? s.edge.from : s.edge.to;
            const end = s.forward ? s.edge.to : s.edge.from;
            if (start !== at || end !== s.node.id) {
              problems.push(`${where}: a gap at edge ${s.edge.id}`);
              break;
            }
            at = end;
            // Usable: nothing on it is ruled out for this person.
            if (!Number.isFinite(s.eval.cost) || s.eval.passable === "no" || !Number.isFinite(s.nodeEval.cost)) problems.push(`${where}: uses excluded edge ${s.edge.id} (${s.edge.kind})`);
          }
          if (r.steps.length && at !== to.id) problems.push(`${where}: ends at ${at}, not ${to.id}`);
          if (!r.steps.length && from.id !== to.id) problems.push(`${where}: empty route between different places`);
          // Sane numbers: never shorter than the straight line, never negative or infinite.
          const straight = haversine([from.lon, from.lat], [to.lon, to.lat]);
          if (r.lengthM < straight - 1) problems.push(`${where}: ${Math.round(r.lengthM)} m route for ${Math.round(straight)} m apart`);
          if (!(r.seconds >= 0 && Number.isFinite(r.seconds) && Number.isFinite(r.cost) && r.cost >= r.seconds - 1e-6)) problems.push(`${where}: seconds ${r.seconds}, cost ${r.cost}`);
          // No steps for anyone on wheels.
          if (p.maxSteps === 0 && summarise(r).steps > 0) problems.push(`${where}: has steps for someone who can't use them`);
          // Repeatable.
          const again = router.route(from, to, p, weather);
          if (again?.cost !== r.cost) problems.push(`${where}: a second try cost ${again?.cost}, not ${r.cost}`);
        }
      }
      expect(problems).toEqual([]);
      // Most random pairs are reachable: the snap picks usable nodes in the main network.
      expect(found / tried).toBeGreaterThan(0.6);
    }, 120_000);
  });
}
