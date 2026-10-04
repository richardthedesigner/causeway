"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "@causeway/profile";
import type { Place, PlanResult, WorkerRequest, WorkerResponse } from "./plan-types";

export interface Conditions {
  wet: boolean;
  ice: boolean;
  summary: string;
  source: string;
}

type Ready = Extract<WorkerResponse, { type: "ready" }>;

/** Owns the routing worker: loads the graph once, then plans on request (latest request wins). */
export function usePlanner() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    const w = new Worker(new URL("./router.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === "ready") setReady(m);
      else if (m.type === "error") {
        setError(m.message);
        setPlanning(false);
      } else if (m.type === "plan" && m.id === seq.current) {
        setResult(m.result);
        setPlanning(false);
      }
    };
    const file = process.env.NEXT_PUBLIC_GRAPH_B64 ? "graph/edinburgh-central.graph.b64.txt" : "graph/edinburgh-central.graph.json.gz";
    const graphUrl = new URL(file, document.baseURI).toString();
    w.postMessage({ type: "init", graphUrl } satisfies WorkerRequest);
    return () => w.terminate();
  }, []);

  const plan = useCallback((from: Place, to: Place, profile: Profile, c: Conditions) => {
    if (!worker.current) return;
    setPlanning(true);
    setError(null);
    const id = ++seq.current;
    worker.current.postMessage({ type: "plan", id, from, to, profile, conditions: { wet: c.wet, ice: c.ice, now: new Date().toISOString() } } satisfies WorkerRequest);
  }, []);

  return { ready, error, result, planning, plan, clear: () => setResult(null) };
}
