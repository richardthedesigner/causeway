/**
 * One Markdown table of what's in the committed data, for data-refresh pull requests:
 *   pnpm tsx scripts/data-summary.ts [--compare <git-ref>]
 * With --compare, each count is shown against the same file at that ref.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { AREAS } from "./areas.js";

const ROOT = join(import.meta.dirname, "..");
const ref = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : null;

const read = (path: string, at: string | null): unknown | null => {
  try {
    const buf = at ? execFileSync("git", ["show", `${at}:${path}`], { cwd: ROOT, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] }) : existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path)) : null;
    if (!buf) return null;
    return JSON.parse((path.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8"));
  } catch {
    return null;
  }
};

type Row = [string, (d: any) => number, string];
const ROWS: Row[] = [
  ["Places (OSM and Overture)", (d) => d.places.length, "data/places/{a}.json.gz"],
  ["Places with an access tag", (d) => d.places.filter((p: any) => p.a).length, "data/places/{a}.json.gz"],
  ["Addresses", (d) => d.addresses.length, "data/places/{a}.json.gz"],
  ["Bus, tram and Metro stops", (d) => Object.keys(d.stops).length, "data/transit/{a}/bus.json"],
  ["Route directions", (d) => d.lines.length, "data/transit/{a}/bus.json"],
  ["Pavement works", (d) => d.works.length, "data/live/{a}.works.json"],
  ["Street graph edges", (d) => d.edges.length, "data/snapshots/{a}.graph.json.gz"],
  ["Edges with a known gradient", (d) => d.edges.filter((e: any) => e.attrs?.incline?.state !== "unknown").length, "data/snapshots/{a}.graph.json.gz"],
  ["Council footway matches", (d) => Object.keys(d.edges).length, "data/council/{a}.footways.json"],
  ["Paths in flood areas", (d) => Object.values(d.areas).reduce((n: number, x: any) => n + x.keys.length, 0), "data/live/{a}.flood-areas.json"],
  ["Park gates", (d) => d.sites.reduce((n: number, s: any) => n + s.gates.length, 0), "data/places/{a}.greenspace.json"],
  ["OSM notes about the ground", (d) => d.notes.length, "data/places/{a}.osm-notes.json"],
  ["Toilet Map toilets", (d) => d.toilets.length, "data/places/{a}.toiletmap.json"],
];

const cell = (now: number | null, before: number | null) => {
  if (now === null) return "none";
  if (before === null || before === now) return String(now);
  const d = now - before;
  return `${now} (${d > 0 ? "+" : ""}${d})`;
};

const areas = Object.keys(AREAS);
const lines = [`| | ${areas.join(" | ")} |`, `|---|${areas.map(() => "---").join("|")}|`];
for (const [label, count, pattern] of ROWS) {
  const cells = areas.map((a) => {
    const path = pattern.replace("{a}", a);
    const now = read(path, null),
      before = ref ? read(path, ref) : null;
    const n = now ? count(now) : null,
      b = before ? count(before) : null;
    return cell(n, b);
  });
  lines.push(`| ${label} | ${cells.join(" | ")} |`);
}
console.log(lines.join("\n"));
