/**
 * TfL's station data (DATA-03, survey §2 #2): how each station's areas join up
 * by level paths, ramps and lifts, the step and gap from platform to train,
 * and toilets. Read from the detailed zip (TfL open data, no key).
 *   Used by scripts/transit-london.ts; the zip is cached in .data-cache.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { StationAccess, StationLineAccess } from "@causeway/graph";
import { cached, CACHE } from "./sources.js";

const TFL_STATION_DATA_URL = "https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip";
const ZIP = "tfl-stationdata-detailed.zip";

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  const keys = (head ?? []).map((k) => k.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const yes = (v: string | undefined) => /^true$/i.test(v ?? "");
const mm = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const cm = (n: number) => `${Math.round(n / 10) === n / 10 ? n / 10 : (n / 10).toFixed(1)} cm`;

/** The platform-to-train step and gap in words, for the largest across a line's platforms. */
export function trainNote(rows: Record<string, string>[]): string | null {
  const step = Math.max(...rows.map((r) => mm(r.MaxStep) ?? -1));
  const gap = Math.max(...rows.map((r) => mm(r.MaxGap) ?? -1));
  const level = rows.filter((r) => yes(r.DesignatedLevelAccessPoint)).map((r) => r.LocationOfLevelAccess).filter(Boolean);
  const ramp = rows.some((r) => yes(r.LevelAccessByManualRamp));
  const parts: string[] = [];
  if (level.length) parts.push(`Level boarding at ${[...new Set(level)].join("; ").replace(/^./, (c) => c.toLowerCase())}`);
  if (step >= 0 || gap >= 0) parts.push(`${[step >= 0 ? `Step up to ${cm(step)}` : null, gap >= 0 ? `gap up to ${cm(gap)}` : null].filter(Boolean).join(" and ").replace(/^g/, "G")} between platform and train`);
  if (ramp) parts.push("Staff can put out a manual ramp");
  return parts.length ? `${parts.join(". ")}.` : null;
}

/** Access for each of our stations, keyed by our station id (the 940G NaPTAN code). */
export async function stationAccess(ours: { id: string; lines: string[] }[]): Promise<Record<string, StationAccess>> {
  await cached(ZIP, TFL_STATION_DATA_URL);
  const read = (f: string) => parseCsv(execFileSync("unzip", ["-p", join(CACHE, ZIP), f], { maxBuffer: 64 << 20 }).toString("utf8"));
  const feed = read("FeedInfo.csv")[0]?.FeedStartDate?.slice(0, 10) ?? "";
  const source = `TfL station data${feed ? ` (${feed})` : ""}`;
  const services = read("PlatformServices.csv");
  const platforms = new Map(read("Platforms.csv").map((p) => [p.UniqueId!, p]));
  const stations = new Map(read("Stations.csv").map((s) => [s.UniqueId!, s]));
  const level = [...read("SameLevelPaths.csv"), ...read("RampRoutes.csv")];
  const lifts = read("Lifts.csv");
  const toilets = read("Toilets.csv");

  const out: Record<string, StationAccess> = {};
  for (const { id, lines } of ours) {
    const rows = services.filter((r) => r.StopAreaNaptanCode === id);
    const tflId = platforms.get(rows[0]?.PlatformUniqueId ?? "")?.StationUniqueId;
    if (!tflId) continue;
    const mine = (x: string | undefined) => !!x && x.startsWith(tflId);
    const paths: StationAccess["paths"] = [];
    const seen = new Set<string>();
    for (const r of level) {
      if (!mine(r.From) || !mine(r.To)) continue;
      const key = [r.From, r.To].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push([r.From!, r.To!, null]);
    }
    for (const l of lifts) {
      if (l.StationUniqueId !== tflId) continue;
      const stops = [l.FromAreas, l.IntermediateAreas, l.IntermediateAreas2, l.ToAreas].flatMap((a) => (a ?? "").split(/[|;]/)).map((a) => a.trim()).filter(Boolean);
      for (let i = 1; i < stops.length; i++) paths.push([stops[i - 1]!, stops[i]!, l.LiftUniqueId!]);
    }
    const byLine: Record<string, StationLineAccess> = {};
    for (const line of lines) {
      const lr = rows.filter((r) => r.Line === line);
      const plats = [...new Set(lr.map((r) => r.PlatformUniqueId!))];
      if (!plats.length) continue;
      byLine[line] = { platforms: plats, mapped: plats.every((p) => yes(platforms.get(p)?.HasStepFreeRouteInformation)), train: trainNote(lr) };
    }
    out[id] = {
      tflId,
      outside: stations.get(tflId)?.OutsideStationUniqueId || `${tflId}-Outside`,
      paths,
      lines: byLine,
      toilets: toilets
        .filter((t) => t.StationUniqueId === tflId)
        .map((t) => ({ accessible: yes(t.IsAccessible), radar: yes(t.RadarKey), insideGate: yes(t.IsInsideGateLine), location: t.Location || null })),
      source,
    };
  }
  return out;
}
