/**
 * Apply island bridging (packages/graph/src/islands.ts) to committed snapshots without a full rebuild.
 *   pnpm tsx scripts/bridge-islands.ts [area...]
 * Idempotent: a snapshot that already has gap connectors is left alone.
 */
import { join } from "node:path";
import { bridgeIslands, loadSnapshot, saveSnapshot } from "@causeway/graph/node";
import { AREAS } from "./areas.js";

const ROOT = join(import.meta.dirname, "..");
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(AREAS)) {
  const path = join(ROOT, "data/snapshots", `${name}.graph.json.gz`);
  const g = loadSnapshot(path);
  if (g.edges.some((e) => e.ref?.startsWith("gap:"))) {
    console.log(`${name}: already bridged`);
    continue;
  }
  const r = bridgeIslands(g);
  saveSnapshot(path, g);
  console.log(`${name}: ${r.islands} islands, ${r.bridged} bridged`);
}
