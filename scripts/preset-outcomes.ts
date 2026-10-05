/**
 * Route every acceptance journey with every preset and print what came out:
 * verdict, time, distance, unknown metres, the longest stretch without a
 * bench, the "More benches" option, and a short fingerprint of the edges
 * taken. Run before and after a preset change and diff the two (D-053).
 *
 *   pnpm tsx scripts/preset-outcomes.ts > before.json
 */
import { createHash } from "node:crypto";
import { PRESETS, type MobilityPreset } from "@causeway/profile";
import { restStats, summarise, tradeoffs } from "@causeway/router";
import { AREAS, PERF_CONDITIONS, loadCity } from "./perf.js";

export interface Outcome {
  area: string;
  journey: string;
  preset: MobilityPreset;
  verdict: string;
  minutes: number | null;
  distanceM: number | null;
  unknownM: number | null;
  longestWithoutBenchM: number | null;
  moreBenches: string | null;
  /** First 8 hex characters of a hash of the edge ids, in order. Same route, same fingerprint. */
  route: string | null;
  /** Wall time for route plus trade-offs, milliseconds. */
  ms: number;
}

const c = PERF_CONDITIONS;
const out: Outcome[] = [];
for (const a of AREAS) {
  const { router } = loadCity(a.area);
  for (const j of a.journeys) {
    for (const key of Object.keys(PRESETS) as MobilityPreset[]) {
      const p = PRESETS[key];
      const t0 = performance.now();
      const from = router.snap(j.from.lon, j.from.lat, p, c);
      const to = router.snap(j.to.lon, j.to.lat, p, c);
      const r = router.route(from, to, p, c);
      const more = r ? tradeoffs(router, r, from, to, p, c).find((t) => t.id === "more-benches") : undefined;
      const ms = performance.now() - t0;
      const s = r ? summarise(r, c.now) : null;
      out.push({
        area: a.area,
        journey: j.id,
        preset: key,
        verdict: s?.verdict ?? "no route",
        minutes: s ? Math.round(s.minutes * 10) / 10 : null,
        distanceM: s ? Math.round(s.distanceM) : null,
        unknownM: s ? Math.round(s.unknownM) : null,
        longestWithoutBenchM: r ? Math.round(restStats(router.graph, r).longestWithoutBenchM) : null,
        moreBenches: more ? more.message : null,
        route: r ? createHash("sha1").update(r.steps.map((x) => x.edge.id).join(",")).digest("hex").slice(0, 8) : null,
        ms: Math.round(ms),
      });
    }
  }
}
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
