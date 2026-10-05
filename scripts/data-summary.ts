/**
 * One Markdown table of what's in the committed data, for data-refresh pull requests:
 *   pnpm tsx scripts/data-summary.ts [--compare <git-ref>]
 * With --compare, each count is shown against the same file at that ref.
 * With --guard as well, it prints only the counts that fell by more than their
 * row's limit (or vanished), and exits 1 if any did (STAB-06). A feed outage or
 * a broken build then can't slip into main as a quiet drop.
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

/** Label, count, file, and the largest fall allowed before the guard fails (null: counts that come and go week to week). */
type Row = [string, (d: any) => number, string, number | null];
const ROWS: Row[] = [
  ["Places (OSM and Overture)", (d) => d.places.length, "data/places/{a}.json.gz", 0.1],
  ["Places with an access tag", (d) => d.places.filter((p: any) => p.a).length, "data/places/{a}.json.gz", 0.1],
  ["Addresses", (d) => d.addresses.length, "data/places/{a}.json.gz", 0.1],
  ["Bus, tram and Metro stops", (d) => Object.keys(d.stops).length, "data/transit/{a}/bus.json", 0.2],
  ["Route directions", (d) => d.lines.length, "data/transit/{a}/bus.json", 0.2],
  ["Pavement works", (d) => d.works.length, "data/live/{a}.works.json", null],
  ["Street graph edges", (d) => d.edges.length, "data/snapshots/{a}.graph.json.gz", 0.05],
  ["Edges with a known gradient", (d) => d.edges.filter((e: any) => e.attrs?.incline?.state !== "unknown").length, "data/snapshots/{a}.graph.json.gz", 0.1],
  ["Council footway matches", (d) => Object.keys(d.edges).length, "data/council/{a}.footways.json", 0.2],
  ["Paths in flood areas", (d) => Object.values(d.areas).reduce((n: number, x: any) => n + x.keys.length, 0), "data/live/{a}.flood-areas.json", 0.3],
  ["Park gates", (d) => d.sites.reduce((n: number, s: any) => n + s.gates.length, 0), "data/places/{a}.greenspace.json", 0.2],
  ["OSM notes about the ground", (d) => d.notes.length, "data/places/{a}.osm-notes.json", null],
  ["Toilet Map toilets", (d) => d.toilets.length, "data/places/{a}.toiletmap.json", 0.3],
];

const cell = (now: number | null, before: number | null) => {
  if (now === null) return "none";
  if (before === null || before === now) return String(now);
  const d = now - before;
  return `${now} (${d > 0 ? "+" : ""}${d})`;
};

const guard = process.argv.includes("--guard");
if (guard && !ref) throw new Error("--guard needs --compare <git-ref>");
const areas = Object.keys(AREAS);
const lines = [`| | ${areas.join(" | ")} |`, `|---|${areas.map(() => "---").join("|")}|`];
const drops: string[] = [];
for (const [label, count, pattern, limit] of ROWS) {
  const cells = areas.map((a) => {
    const path = pattern.replace("{a}", a);
    const now = read(path, null),
      before = ref ? read(path, ref) : null;
    const n = now ? count(now) : null,
      b = before ? count(before) : null;
    if (b) {
      if (n === null) drops.push(`${label}, ${a}: ${b} before, now missing`);
      else if (limit !== null && n < b * (1 - limit)) drops.push(`${label}, ${a}: ${b} to ${n} (${Math.round((1 - n / b) * 100)}% fewer; the limit is ${Math.round(limit * 100)}%)`);
    }
    return cell(n, b);
  });
  lines.push(`| ${label} | ${cells.join(" | ")} |`);
}
if (guard) {
  for (const d of drops) console.log(`- ${d}`);
  process.exit(drops.length ? 1 : 0);
}
console.log(lines.join("\n"));
