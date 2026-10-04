/**
 * Build the Edinburgh Old Town graph snapshot: OSM footways + LiDAR terrain.
 *   pnpm build:snapshot
 */
import { join } from "node:path";
import { saveSnapshot } from "@causeway/graph/node";
import { buildEdinburgh } from "./build-edinburgh.js";

const { graph: g, stats } = await buildEdinburgh();
const out = join(import.meta.dirname, "..", "data", "snapshots", `${g.meta.name}.graph.json.gz`);
saveSnapshot(out, g);
const byKind = g.edges.reduce<Record<string, number>>((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
const { inclineChecks, ...counts } = stats;
console.log(JSON.stringify({ nodes: g.nodes.length, edges: g.edges.length, ...counts, inclineChecks: inclineChecks.length, byKind }, null, 2));
console.log(`wrote ${out}`);
