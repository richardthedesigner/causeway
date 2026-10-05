/**
 * Normalise TfL Unified API responses (Line/{id}/Route/Sequence/all and
 * StopPoint details, fetched 2026-10-04) into data/transit/london/network.json,
 * with each station's step-free layout from TfL's station data (DATA-03).
 *   tsx scripts/transit-london.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stepFreeLines, type TransitNetwork, type TransitStation } from "@causeway/graph";
import { stationAccess } from "./tfl-station-access.js";

const DIR = join(import.meta.dirname, "../data/transit/london");
const LINES = [
  { id: "jubilee", name: "Jubilee line", mode: "tube" as const },
  { id: "dlr", name: "DLR", mode: "dlr" as const },
];
type Acc = Record<string, string>;
const details = JSON.parse(readFileSync(join(DIR, "stations.json"), "utf8")) as Record<string, { id: string; accessibility: Acc; children?: { id: string; accessibility: Acc }[] }>;
const accessFor = (id: string): Acc | null => {
  if (details[id]?.accessibility && Object.keys(details[id]!.accessibility).length) return details[id]!.accessibility;
  for (const d of Object.values(details)) for (const c of d.children ?? []) if (c.id === id) return c.accessibility;
  return null;
};

const stations: Record<string, TransitStation> = {};
const routes: TransitNetwork["routes"] = [];
for (const line of LINES) {
  const seq = JSON.parse(readFileSync(join(DIR, `${line.id}-sequence.json`), "utf8"));
  for (const sps of seq.stopPointSequences) {
    for (const sp of sps.stopPoint) {
      if (stations[sp.id]) continue;
      const acc = accessFor(sp.id);
      const lift = acc?.["AccessViaLift"];
      let stepFree: TransitStation["stepFree"] = "unknown";
      let source = "TfL StopPoint: no step-free information";
      if (lift === "Yes") {
        stepFree = "yes";
        source = "TfL StopPoint: AccessViaLift = Yes";
      } else if (line.mode === "dlr") {
        // TfL describes the whole DLR as step-free (lifts or ramps); AccessViaLift = No there means ramp access.
        stepFree = "yes";
        source = "TfL: DLR stations are step-free by lift or ramp (network-wide statement; verify per station)";
      }
      stations[sp.id] = {
        id: sp.id,
        name: String(sp.name).replace(/ (Underground|DLR) Station$/, ""),
        lat: sp.lat,
        lon: sp.lon,
        mode: line.mode,
        hub: sp.topMostParentId && String(sp.topMostParentId).startsWith("HUB") ? sp.topMostParentId : null,
        stepFree,
        stepFreeSource: source,
        note: acc?.["AddtionalInformation"]?.replace(/\s+/g, " ").trim() || null,
      };
    }
  }
  for (const r of seq.orderedLineRoutes) routes.push({ line: line.id, lineName: line.name, mode: line.mode, stops: r.naptanIds });
}
// TfL's station data: which areas join up without steps, per line (applied to board edges when the city loads).
const access = await stationAccess(Object.keys(stations).map((id) => ({ id, lines: [...new Set(routes.filter((r) => r.stops.includes(id)).map((r) => r.line))] })));
for (const [id, a] of Object.entries(access)) stations[id]!.access = a;
const net: TransitNetwork = { source: "TfL Unified API (Line Route Sequence, StopPoint)", fetchedAt: "2026-10-04T15:10:00Z", stations, routes };
writeFileSync(join(DIR, "network.json"), JSON.stringify(net, null, 1));
const c = (m: string, v: string) => Object.values(stations).filter((s) => s.mode === m && s.stepFree === v).length;
console.log(`${Object.keys(stations).length} stations, ${routes.length} routes; tube step-free yes/unknown ${c("tube", "yes")}/${c("tube", "unknown")}; dlr yes ${c("dlr", "yes")}`);
const lineStates = Object.values(stations).flatMap((s) => (s.access ? Object.values(stepFreeLines(s.access)) : ["none"]));
console.log(`station data: ${Object.keys(access).length} stations; board edges ${["yes", "part", "no", "unknown", "none"].map((k) => `${k} ${lineStates.filter((v) => v === k).length}`).join(", ")}`);
for (const id of ["940GZZLUWSM", "940GZZLUCYF", "940GZZLUCGT", "940GZZDLCGT", "940GZZDLCAN", "940GZZDLHEQ", "940GZZLUNGW", "940GZZLUCWR"]) console.log(id, stations[id]?.name, stations[id]?.stepFree, stations[id]?.hub);
