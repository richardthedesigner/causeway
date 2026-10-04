"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLiftOutages, fetchTflStreetWorks } from "@causeway/live";
import type { UserNote } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import type { City } from "./cities";
import type { Check, Place, PlanResult, WorkerRequest, WorkerResponse, WorksSummary } from "./plan-types";

export interface Conditions {
  wet: boolean;
  ice: boolean;
  summary: string;
  source: string;
}

type Ready = Extract<WorkerResponse, { type: "ready" }>;

export type LiveLifts =
  | { state: "none" }
  | { state: "loading" }
  | { state: "ok"; closed: number; at: string }
  | { state: "failed" };

const LIFT_REFRESH_MS = 5 * 60_000;

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
    setChecks({});
    const w = new Worker(new URL("./router.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshLifts = () =>
      fetchLiftOutages()
        .then((outages) => w.postMessage({ type: "live", outages } satisfies WorkerRequest))
        .catch(() => setLifts({ state: "failed" }));
    // TfL street disruptions top up the Street Manager file in London; a failure leaves the file's works in place.
    const refreshWorks = () =>
      fetchTflStreetWorks()
        .then((works) => w.postMessage({ type: "works-live", works, fetchedAt: new Date().toISOString() } satisfies WorkerRequest))
        .catch(() => undefined);
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === "ready") {
        setReady(m);
        if (city.liveLifts) {
          refreshLifts();
          refreshWorks();
          timer = setInterval(() => {
            refreshLifts();
            refreshWorks();
          }, LIFT_REFRESH_MS);
        }
      } else if (m.type === "works") setWorks(m.summary);
      else if (m.type === "live") setLifts({ state: "ok", closed: m.applied, at: m.fetchedAt });
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
    w.postMessage({ type: "init", graphUrl: url(city.graph), networkUrl: city.network ? url(city.network) : undefined, worksUrl: city.works ? url(city.works) : undefined, busUrl: city.bus ? url(city.bus) : undefined, places: city.places } satisfies WorkerRequest);
    return () => {
      clearInterval(timer);
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
    worker.current.postMessage({ type: "plan", id, from, to, profile, conditions: { wet: c.wet, ice: c.ice, now: new Date().toISOString() }, notes: notes.map((n) => ({ ...n, photo: null })) } satisfies WorkerRequest);
  }, []);

  /** Verdicts for a short list of places (recents), from one start. */
  const check = useCallback((from: Place, to: Place[], profile: Profile, c: Conditions) => {
    if (!worker.current || !to.length) return;
    const id = ++checkSeq.current;
    worker.current.postMessage({ type: "check", id, from, to, profile, conditions: { wet: c.wet, ice: c.ice, now: new Date().toISOString() } } satisfies WorkerRequest);
  }, []);

  /** Ask whether each of these devices could make the journey (latest request wins). */
  const fits = useCallback((from: Place, to: Place, profiles: { key: string; profile: Profile }[], c: Conditions) => {
    const id = ++fitsSeq.current;
    setFits(null);
    if (!worker.current || !profiles.length) return;
    worker.current.postMessage({ type: "fits", id, from, to, profiles, conditions: { wet: c.wet, ice: c.ice, now: new Date().toISOString() } } satisfies WorkerRequest);
  }, []);

  return { ready, error, result, planning, plan, lifts, works, checks, check, fits, fitsResult, sendToilets, clear: () => setResult(null) };
}
