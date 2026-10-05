/**
 * Measure the speed budget's baseline and write scripts/perf-baseline.json.
 * Prints the tables for docs/plans/PERF_BASELINE.md.
 *
 *   pnpm perf:baseline          measure and print, don't write
 *   pnpm perf:baseline --write  measure, print and write the baseline
 *
 * Only re-baseline on purpose (a faster router, a new journey), never to
 * make a slower change pass.
 */
import { writeFileSync } from "node:fs";
import { AREAS, BASELINE_PATH, REST_PRESETS, citySizes, loadAll, measureAll, measurePlans, type Baseline, type Measurement, type PlanMeasurement } from "./perf.js";

const ROUNDS = 5;
const kb = (b: number) => `${(b / 1024).toFixed(0)} KB`;

const cities = loadAll();
measureAll(cities, 1); // warm-up
const rounds: Measurement[] = [];
for (let i = 0; i < ROUNDS; i++) {
  rounds.push(measureAll(cities));
  process.stderr.write(`round ${i + 1}: ${rounds[i]!.normalised.toFixed(2)}\n`);
}
// The median round, so one lucky or unlucky run doesn't set the bar.
const sorted = [...rounds].sort((a, b) => a.normalised - b.normalised);
const m = sorted[Math.floor(ROUNDS / 2)]!;

// Route plus trade-offs for the rest presets (D-055), measured the same way.
measurePlans(cities, 1);
const planRounds: PlanMeasurement[] = [];
for (let i = 0; i < ROUNDS; i++) {
  planRounds.push(measurePlans(cities));
  process.stderr.write(`plans round ${i + 1}: ${planRounds[i]!.normalised.toFixed(2)}\n`);
}
const pm = [...planRounds].sort((a, b) => a.normalised - b.normalised)[Math.floor(ROUNDS / 2)]!;

console.log("## Download per city\n");
for (const a of AREAS) {
  const files = citySizes(a.area);
  console.log(`### ${a.city} (\`${a.area}\`)\n`);
  console.log("| File | On disk | Over the wire |\n|---|---:|---:|");
  for (const f of files) console.log(`| ${f.what} | ${kb(f.bytes)} | ${kb(f.wireBytes)} |`);
  const total = files.reduce((t, f) => t + f.wireBytes, 0);
  const noMap = files.filter((f) => f.what !== "Base map").reduce((t, f) => t + f.wireBytes, 0);
  const extra = files.filter((f) => f.extra).reduce((t, f) => t + f.wireBytes, 0);
  console.log(`| **Total** | | **${kb(total)}** (${kb(noMap)} without the base map; ${kb(extra)} beside the graph, the budgeted part) |\n`);
}

console.log("## Route time\n");
console.log(`After a warm-up pass, the median of ${ROUNDS} rounds; each timing is the fastest of 3 runs. Calibration workload: ${m.calibrationMs.toFixed(1)} ms. All cities: ${m.totalMs.toFixed(0)} ms, normalised ${m.normalised.toFixed(2)}.\n`);
console.log("| City | Load and index | Route time (all journeys) | Nodes settled |\n|---|---:|---:|---:|");
for (const c of m.cities) console.log(`| ${c.area} | ${c.loadMs.toFixed(0)} ms | ${c.totalMs.toFixed(0)} ms | ${c.totalSettled.toLocaleString("en-GB")} |`);
console.log("\n| Journey | Preset | Routes | Time | Nodes settled |\n|---|---|---:|---:|---:|");
for (const c of m.cities) for (const j of c.journeys) console.log(`| ${j.journey} | ${j.preset} | ${j.routes} | ${j.ms.toFixed(1)} ms | ${j.settled.toLocaleString("en-GB")} |`);

console.log(`\n### Rest presets: route plus trade-offs\n\nMedian of ${ROUNDS} rounds. Calibration workload: ${pm.calibrationMs.toFixed(1)} ms. All cities: ${pm.totalMs.toFixed(0)} ms, normalised ${pm.normalised.toFixed(2)}.\n`);
console.log("| City | Journey | Preset | Routes and options | Time |\n|---|---|---|---:|---:|");
for (const j of pm.journeys) console.log(`| ${j.area} | ${j.journey} | ${j.preset} | ${j.routes} | ${j.ms.toFixed(1)} ms |`);

if (process.argv.includes("--write")) {
  const b: Baseline = {
    measuredAt: m.measuredAt,
    note: "Written by pnpm perf:baseline --write. Read by scripts/perf-budget.test.ts. Re-baseline only on purpose.",
    normalised: Number(m.normalised.toFixed(3)),
    calibrationMs: Number(m.calibrationMs.toFixed(2)),
    totalMs: Number(m.totalMs.toFixed(1)),
    cities: m.cities.map((c) => ({
      area: c.area,
      totalSettled: c.totalSettled,
      totalMs: Number(c.totalMs.toFixed(1)),
      settled: Object.fromEntries(c.journeys.map((j) => [`${j.journey}/${j.preset}`, j.settled])),
    })),
    plans: {
      presets: [...REST_PRESETS],
      measuredAt: pm.measuredAt,
      note: "Route plus trade-offs for the rest presets (measurePlans).",
      normalised: Number(pm.normalised.toFixed(3)),
      calibrationMs: Number(pm.calibrationMs.toFixed(2)),
      totalMs: Number(pm.totalMs.toFixed(1)),
    },
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(b, null, 2)}\n`);
  process.stderr.write(`wrote ${BASELINE_PATH}\n`);
}
