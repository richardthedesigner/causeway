"use client";
import { fetchTflArrivals } from "@causeway/live";
import { Bus } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlannedRoute } from "@/lib/plan-types";

const REFRESH_MS = 30_000;

/**
 * The buses on the chosen route: how often they run now (timetable), and in
 * London the next live departures from TfL. Live times are shown as live;
 * timetable frequencies never pretend to be.
 */
export function BusDepartures({ legs, live }: { legs: PlannedRoute["busLegs"]; live: boolean }) {
  const [next, setNext] = useState<Record<string, number[] | "failed">>({});
  const key = legs.map((l) => `${l.stopId}:${l.route}`).join("|");
  useEffect(() => {
    setNext({});
    if (!live || !legs.length) return;
    let stop = false;
    const load = () =>
      legs.forEach((l) =>
        fetchTflArrivals(l.stopId, l.route)
          .then((mins) => !stop && setNext((n) => ({ ...n, [`${l.stopId}:${l.route}`]: mins })))
          .catch(() => !stop && setNext((n) => ({ ...n, [`${l.stopId}:${l.route}`]: "failed" }))),
      );
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [key, live]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!legs.length) return null;
  return (
    <section aria-labelledby="bus-h" className="grid gap-2">
      <h2 id="bus-h" className="m-0 flex items-center gap-2 text-lg font-bold">
        <Bus aria-hidden className="size-5" /> Buses
      </h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {legs.map((l) => {
          const n = next[`${l.stopId}:${l.route}`];
          return (
            <li key={`${l.stopId}:${l.route}`} className="grid gap-0.5">
              <span>
                <span className="font-bold">{l.route}</span> from {l.stopName}
                {l.headsign ? ` towards ${l.headsign}` : ""}
              </span>
              <span className="text-sm text-muted" aria-live="polite">
                {Array.isArray(n)
                  ? n.length
                    ? `Next: ${n.map((m) => (m <= 0 ? "due" : `${m} min`)).join(", ")} (live from TfL)`
                    : "No live departures listed right now (TfL)"
                  : n === "failed"
                    ? "Couldn't get live times from TfL"
                    : live
                      ? "Checking live times…"
                      : null}
                {Array.isArray(n) ? null : n === "failed" || !live ? `${live ? ". " : ""}Usually about ${l.perHour} an hour at this time (timetable)` : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-sm text-muted">Buses have a ramp and one wheelchair space. If the space is taken, the next bus is your fallback.</p>
    </section>
  );
}
