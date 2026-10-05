"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertInForce, fetchAirNotes, fetchFloodWarnings, fetchHealthAlert, fetchLiftOutages, fetchRiverLevel, fetchTflDisruptions, fetchTflStreetWorks, type AreaNote, type DisruptionsMissing, type RiverLevel } from "@causeway/live";
import type { HealthAlert } from "@causeway/router";
import type { UserNote } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import type { City } from "./cities";
import type { Check, FloodHere, Place, PlanResult, WorkerRequest, WorkerResponse, WorksSummary } from "./plan-types";

export interface Conditions {
  wet: boolean;
  ice: boolean;
  summary: string;
  source: string;
  /** Leaving later: the router's clock (bus waits, after dark, works). Absent or past: now. */
  leaveAt?: Date | null;
  /** The strongest gust now, or at the hour you leave (Open-Meteo, D-066). Stays when you set the ground yourself. */
  gust?: { kmh: number; at: string; source: string };
}

/** UKHSA heat and cold alerts for the city's region (England, D-066): none checked here, checking, an answer, or the feed failed. */
export type LiveHealthAlert = { state: "none" } | { state: "loading" } | { state: "ok"; alert: HealthAlert | null; at: string; region: string } | { state: "failed"; region: string; at: string };

/** Area-wide lines that never change a route (D-066): air quality, pollen and UV when high, and the Water of Leith level. */
export interface LiveArea {
  /** null: not checked yet or the feed failed (`airFailed`). */
  air: AreaNote[] | null;
  airFailed: boolean;
  /** SEPA's latest reading at Murrayfield (Edinburgh). */
  river: RiverLevel | null;
  riverFailed: boolean;
}

/** The time this trip starts: the chosen time if it's still ahead, else now. */
export const departure = (c: Pick<Conditions, "leaveAt">): Date => (c.leaveAt && c.leaveAt.getTime() > Date.now() ? c.leaveAt : new Date());

type Ready = Extract<WorkerResponse, { type: "ready" }>;

export type LiveLifts =
  | { state: "none" }
  | { state: "loading" }
  /** `liftsFailed`: the lift feed didn't answer this time. `missing`: which disruption feeds didn't (D-061). */
  | { state: "ok"; closed: number; limited: number; lines: string[]; at: string; liftsFailed: boolean; missing: DisruptionsMissing }
  | { state: "failed" };

const LIFT_REFRESH_MS = 5 * 60_000;
const FLOOD_REFRESH_MS = 10 * 60_000;
/** UKHSA alerts change a few times a day at most; the air quality forecast and the river by the hour and quarter hour. */
const ALERT_REFRESH_MS = 30 * 60_000;
const AIR_REFRESH_MS = 60 * 60_000;
const RIVER_REFRESH_MS = 15 * 60_000;
const NO_AREA: LiveArea = { air: null, airFailed: false, river: null, riverFailed: false };

/** What the router is told about the ground, the clock, gusts and an alert in force when you leave. */
const routing = (c: Conditions, alert: HealthAlert | null) => {
  const now = departure(c);
  return { wet: c.wet, ice: c.ice, now: now.toISOString(), ...(c.gust ? { gust: c.gust } : {}), ...(alert && alertInForce(alert, now) ? { healthAlert: alert } : {}) };
};

/**
 * Owns the routing worker for one city: loads its graph, keeps live lift
 * status fresh (London), and plans on request (latest request wins).
 */
export function usePlanner(city: City) {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [lifts, setLifts] = useState<LiveLifts>({ state: "none" });
  const [works, setWorks] = useState<WorksSummary | null>(null);
  /** Flood warnings over this city's paths (DATA-07). null: none checked here. */
  const [floods, setFloods] = useState<{ here: FloodHere[]; at: string } | null>(null);
  const checkSeq = useRef(0);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const fitsSeq = useRef(0);
  /** Other saved devices' minutes for the current journey, keyed by device id; null where it can't get there. */
  const [fitsResult, setFits] = useState<Record<string, number | null> | null>(null);
  const [healthAlert, setHealthAlert] = useState<LiveHealthAlert>({ state: "none" });
  const [area, setArea] = useState<LiveArea>(NO_AREA);
  // The latest of each, for plan requests made between renders.
  const alertNow = useRef<HealthAlert | null>(null);
  const riverNow = useRef<RiverLevel | null>(null);

  useEffect(() => {
    setReady(null);
    setResult(null);
    setError(null);
    setLifts({ state: city.liveLifts ? "loading" : "none" });
    setWorks(null);
    setFloods(null);
    setChecks({});
    setHealthAlert({ state: city.ukhsaRegion ? "loading" : "none" });
    setArea(NO_AREA);
    alertNow.current = null;
    riverNow.current = null;
    const w = new Worker(new URL("./router.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Lifts, plus line closures and station disruptions (DATA-04), each feed on its own (D-061): one failing leaves the others,
    // and the worker holds a failed feed's last answer for 15 minutes. The route card says which couldn't be checked.
    const refreshLifts = () =>
      Promise.all([fetchLiftOutages().catch(() => null), fetchTflDisruptions()])
        .then(([outages, disruptions]) => w.postMessage({ type: "live", outages, disruptions } satisfies WorkerRequest))
        .catch(() => setLifts({ state: "failed" }));
    // TfL street disruptions top up the Street Manager file in London; a failure leaves the file's works in place.
    const refreshWorks = () =>
      fetchTflStreetWorks()
        .then((works) => w.postMessage({ type: "works-live", works, fetchedAt: new Date().toISOString() } satisfies WorkerRequest))
        .catch(() => undefined);
    let floodTimer: ReturnType<typeof setInterval> | undefined;
    // Environment Agency warnings, every 10 minutes. A failure leaves the last ones until they expire.
    const refreshFloods = () =>
      fetchFloodWarnings()
        .then((warnings) => w.postMessage({ type: "floods", warnings, fetchedAt: new Date().toISOString() } satisfies WorkerRequest))
        .catch(() => undefined);
    // UKHSA, the air and the river (D-066): each on its own time limit (D-052), in parallel, never holding up a route.
    // A failure is said quietly in "Where this comes from" and changes nothing else.
    let live = true;
    const region = city.ukhsaRegion;
    const refreshAlert = () =>
      region &&
      fetchHealthAlert(region.code)
        .then((alert) => {
          if (!live) return;
          alertNow.current = alert;
          setHealthAlert({ state: "ok", alert, at: new Date().toISOString(), region: region.name });
        })
        .catch(() => {
          if (!live) return;
          alertNow.current = null;
          setHealthAlert({ state: "failed", region: region.name, at: new Date().toISOString() });
        });
    const refreshAir = () =>
      fetchAirNotes(...city.weatherAt)
        .then((air) => live && setArea((a) => ({ ...a, air, airFailed: false })))
        .catch(() => live && setArea((a) => ({ ...a, air: null, airFailed: true })));
    const refreshRiver = () =>
      city.riverLevel &&
      fetchRiverLevel()
        .then((river) => {
          if (!live) return;
          riverNow.current = river;
          setArea((a) => ({ ...a, river, riverFailed: false }));
        })
        .catch(() => {
          if (!live) return;
          riverNow.current = null;
          setArea((a) => ({ ...a, river: null, riverFailed: true }));
        });
    refreshAlert();
    refreshAir();
    refreshRiver();
    const areaTimers = [setInterval(refreshAir, AIR_REFRESH_MS), ...(region ? [setInterval(refreshAlert, ALERT_REFRESH_MS)] : []), ...(city.riverLevel ? [setInterval(refreshRiver, RIVER_REFRESH_MS)] : [])];
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === "ready") {
        setReady(m);
        if (city.floods) {
          refreshFloods();
          floodTimer = setInterval(refreshFloods, FLOOD_REFRESH_MS);
        }
        if (city.liveLifts) {
          refreshLifts();
          refreshWorks();
          timer = setInterval(() => {
            refreshLifts();
            refreshWorks();
          }, LIFT_REFRESH_MS);
        }
      } else if (m.type === "works") setWorks(m.summary);
      else if (m.type === "floods") setFloods({ here: m.here, at: m.fetchedAt });
      else if (m.type === "live") setLifts(m.liftsFailed && m.missing === "both" ? { state: "failed" } : { state: "ok", closed: m.applied, limited: m.limited, lines: m.lines, at: m.fetchedAt, liftsFailed: m.liftsFailed, missing: m.missing });
      else if (m.type === "error") {
        setError(m.message);
        setPlanning(false);
      } else if (m.type === "check" && m.id === checkSeq.current) {
        setChecks(Object.fromEntries(m.checks.map((x) => [x.placeId, x])));
      } else if (m.type === "fits" && m.id === fitsSeq.current) {
        setFits(Object.fromEntries(m.fits.map((f) => [f.key, f.minutes])));
      } else if (m.type === "plan" && m.id === seq.current) {
        setResult(m.result);
        setPlanning(false);
      }
    };
    const url = (f: string) => new URL(process.env.NEXT_PUBLIC_GRAPH_B64 && f.endsWith(".gz") ? f.replace(".json.gz", ".b64.txt") : f, document.baseURI).toString();
    w.postMessage({ type: "init", graphUrl: url(city.graph), networkUrl: city.network ? url(city.network) : undefined, worksUrl: city.works ? url(city.works) : undefined, busUrl: city.bus ? url(city.bus) : undefined, footwaysUrl: city.footways ? url(city.footways) : undefined, floodsUrl: city.floods ? url(city.floods) : undefined, greenspaceUrl: city.greenspace ? url(city.greenspace) : undefined, osmNotesUrl: city.osmNotes ? url(city.osmNotes) : undefined, places: city.places } satisfies WorkerRequest);
    return () => {
      clearInterval(timer);
      clearInterval(floodTimer);
      areaTimers.forEach(clearInterval);
      live = false;
      w.terminate();
    };
  }, [city]);

  /** Hand the worker the venue toilets from the search index (once per city). */
  const sendToilets = useCallback((points: { lon: number; lat: number; name: string }[], disputed: { lon: number; lat: number }[] = []) => {
    worker.current?.postMessage({ type: "toilets", points, disputed } satisfies WorkerRequest);
  }, []);

  const plan = useCallback((from: Place, to: Place, profile: Profile, c: Conditions, notes: UserNote[] = []) => {
    if (!worker.current) return;
    setPlanning(true);
    setError(null);
    const id = ++seq.current;
    worker.current.postMessage({ type: "plan", id, from, to, profile, conditions: routing(c, alertNow.current), notes: notes.map((n) => ({ ...n, photo: null })), river: riverNow.current } satisfies WorkerRequest);
  }, []);

  /** Verdicts for a short list of places (recents), from one start. */
  const check = useCallback((from: Place, to: Place[], profile: Profile, c: Conditions) => {
    if (!worker.current || !to.length) return;
    const id = ++checkSeq.current;
    worker.current.postMessage({ type: "check", id, from, to, profile, conditions: routing(c, alertNow.current) } satisfies WorkerRequest);
  }, []);

  /** Ask whether each of these devices could make the journey (latest request wins). */
  const fits = useCallback((from: Place, to: Place, profiles: { key: string; profile: Profile }[], c: Conditions) => {
    const id = ++fitsSeq.current;
    setFits(null);
    if (!worker.current || !profiles.length) return;
    worker.current.postMessage({ type: "fits", id, from, to, profiles, conditions: routing(c, alertNow.current) } satisfies WorkerRequest);
  }, []);

  return { ready, error, result, planning, plan, lifts, works, floods, healthAlert, area, checks, check, fits, fitsResult, sendToilets, clear: () => setResult(null) };
}
