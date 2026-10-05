"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFloodWarnings, fetchLiftOutages, fetchRailDisruptions, fetchTflStreetWorks } from "@causeway/live";
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
}

/** The time this trip starts: the chosen time if it's still ahead, else now. */
export const departure = (c: Pick<Conditions, "leaveAt">): Date => (c.leaveAt && c.leaveAt.getTime() > Date.now() ? c.leaveAt : new Date());

type Ready = Extract<WorkerResponse, { type: "ready" }>;

export type LiveLifts =
  | { state: "none" }
  | { state: "loading" }
  | { state: "ok"; closed: number; lines: string[]; at: string }
  | { state: "failed" };

const LIFT_REFRESH_MS = 5 * 60_000;
const FLOOD_REFRESH_MS = 10 * 60_000;

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

  useEffect(() => {
    setReady(null);
    setResult(null);
    setError(null);
    setLifts({ state: city.liveLifts ? "loading" : "none" });
    setWorks(null);
    setFloods(null);
    setChecks({});
    const w = new Worker(new URL("./router.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Lifts, plus line closures and station disruptions (DATA-04). Disruptions failing leaves the lifts working.
    const refreshLifts = () =>
      Promise.all([fetchLiftOutages(), fetchRailDisruptions().catch(() => undefined)])
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
      else if (m.type === "live") setLifts({ state: "ok", closed: m.applied, lines: m.lines, at: m.fetchedAt });
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
      w.terminate();
    };
  }, [city]);

  /** Hand the worker the venue toilets from the search index (once per city). */
  const sendToilets = useCallback((points: { lon: number; lat: number; name: string }[]) => {
    worker.current?.postMessage({ type: "toilets", points } satisfies WorkerRequest);
  }, []);

  const plan = useCallback((from: Place, to: Place, profile: Profile, c: Conditions, notes: UserNote[] = []) => {
    if (!worker.current) return;
    setPlanning(true);
    setError(null);
    const id = ++seq.current;
    worker.current.postMessage({ type: "plan", id, from, to, profile, conditions: { wet: c.wet, ice: c.ice, now: departure(c).toISOString() }, notes: notes.map((n) => ({ ...n, photo: null })) } satisfies WorkerRequest);
  }, []);

  /** Verdicts for a short list of places (recents), from one start. */
  const check = useCallback((from: Place, to: Place[], profile: Profile, c: Conditions) => {
    if (!worker.current || !to.length) return;
    const id = ++checkSeq.current;
    worker.current.postMessage({ type: "check", id, from, to, profile, conditions: { wet: c.wet, ice: c.ice, now: departure(c).toISOString() } } satisfies WorkerRequest);
  }, []);

  /** Ask whether each of these devices could make the journey (latest request wins). */
  const fits = useCallback((from: Place, to: Place, profiles: { key: string; profile: Profile }[], c: Conditions) => {
    const id = ++fitsSeq.current;
    setFits(null);
    if (!worker.current || !profiles.length) return;
    worker.current.postMessage({ type: "fits", id, from, to, profiles, conditions: { wet: c.wet, ice: c.ice, now: departure(c).toISOString() } } satisfies WorkerRequest);
  }, []);

  return { ready, error, result, planning, plan, lifts, works, floods, checks, check, fits, fitsResult, sendToilets, clear: () => setResult(null) };
}
