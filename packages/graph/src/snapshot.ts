import { gunzipSync, gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import type { Graph } from "./schema.js";

/**
 * Fixed graph snapshots make acceptance journeys reproducible: tests route
 * over a frozen graph, so a change in OSM or a feed never silently changes
 * what "passing" means. Live-data variants run separately.
 */
export function saveSnapshot(path: string, g: Graph): void {
  writeFileSync(path, gzipSync(JSON.stringify(g), { level: 9 }));
}

export function loadSnapshot(path: string): Graph {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Graph;
}
