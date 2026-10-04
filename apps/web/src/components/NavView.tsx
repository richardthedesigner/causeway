"use client";
import { hazardText, Navigator, type Progress } from "@causeway/router";
import { AlertTriangle, ArrowUp, CornerUpLeft, CornerUpRight, Flag, Megaphone, TrainFront, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlannedRoute } from "@/lib/plan-types";


export interface Me {
  lon: number;
  lat: number;
  accuracyM: number;
  heading: number | null;
}

interface Props {
  route: PlannedRoute;
  speedMps: number;
  onEnd: () => void;
  onOffRoute: (me: Me) => void;
  onPosition: (me: Me | null) => void;
  onReport: (me: Me | null) => void;
  /** Add a note about the stretch you're on. */
  onNote: (me: Me | null) => void;
  /** Called at the end of a live journey with the person's moving speed, to calibrate their ETA. */
  onPace: (observedMps: number) => void;
}

const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`);

/**
 * Turn-by-turn. Live location where the device allows it; otherwise (or by
 * choice) a preview that moves along the route. One primary action (End),
 * everything in the bottom third, instructions also in a live region for
 * screen readers. Speech is opt-in so it never talks over a screen reader.
 */
export function NavView({ route, speedMps, onEnd, onOffRoute, onPosition, onReport, onNote, onPace }: Props) {
  const nav = useRef(new Navigator(route.nav));
  const [p, setP] = useState<Progress | null>(null);
  const [mode, setMode] = useState<"locating" | "live" | "preview">("locating");
  const [speak, setSpeak] = useState(false);
  const [said, setSaid] = useState<string>("");
  const me = useRef<Me | null>(null);
  const offSent = useRef(false);
  // Moving time and distance, live fixes only (a preview teaches us nothing about the person).
  const pace = useRef({ lastT: 0, lastAlong: 0, movingS: 0, movedM: 0, reported: false });

  useEffect(() => {
    nav.current = new Navigator(route.nav);
    offSent.current = false;
  }, [route]);

  const feed = (m: Me) => {
    me.current = m;
    onPosition(m);
    const pr = nav.current.update(m.lon, m.lat, m.accuracyM);
    setP(pr);
    if (mode === "live") {
      const now = Date.now(), pc = pace.current;
      const dt = (now - pc.lastT) / 1000, dd = pr.along - pc.lastAlong;
      // Count only intervals where they were actually moving (not waiting at a crossing or for a lift).
      if (pc.lastT && dt > 0 && dt < 30 && dd > 0.5 && dd / dt < 3) {
        pc.movingS += dt;
        pc.movedM += dd;
      }
      pc.lastT = now;
      pc.lastAlong = pr.along;
      if (pr.arrived) reportPace();
    }
    if (pr.announce) {
      setSaid(pr.announce);
      if (speak && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(pr.announce);
        u.lang = "en-GB";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
      navigator.vibrate?.(pr.hazard ? [60, 60, 60] : 80);
    }
    if (pr.offRoute && !offSent.current && mode === "live") {
      offSent.current = true;
      onOffRoute(m);
    }
  };
  const reportPace = () => {
    const pc = pace.current;
    if (!pc.reported && pc.movedM >= 300 && pc.movingS > 0) {
      pc.reported = true;
      onPace(pc.movedM / pc.movingS);
    }
  };
  const feedRef = useRef(feed);
  feedRef.current = feed;

  // Live location.
  useEffect(() => {
    if (mode === "preview") return;
    if (!("geolocation" in navigator)) {
      setMode("preview");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setMode("live");
        feedRef.current({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracyM: pos.coords.accuracy, heading: pos.coords.heading ?? null });
      },
      () => setMode((m) => (m === "locating" ? "preview" : m)),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [mode]);

  // Preview: move along the route at four times the user's speed.
  useEffect(() => {
    if (mode !== "preview") return;
    const { coords, cum, length } = route.nav;
    let d = 0;
    const t = setInterval(() => {
      d = Math.min(length, d + speedMps * 4 * 0.5);
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1]! < d) i++;
      const f = (d - cum[i]!) / Math.max(1e-6, cum[i + 1]! - cum[i]!);
      const a = coords[i]!,
        b = coords[i + 1] ?? a;
      feedRef.current({ lon: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, accuracyM: 5, heading: null });
      if (d >= length) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [mode, route, speedMps]);

  useEffect(() => () => onPosition(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = p?.next ?? route.nav.maneuvers[1] ?? null;
  const remaining = Math.max(0, route.nav.length - (p?.along ?? 0));
  const Icon = !next ? Flag : next.type === "board" || next.type === "alight" || next.type === "change" ? TrainFront : /left/i.test(next.short) ? CornerUpLeft : /right/i.test(next.short) ? CornerUpRight : next.type === "arrive" ? Flag : ArrowUp;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] md:left-4 md:right-auto md:w-[440px] md:px-0">
      <section aria-label="Navigation" className="pointer-events-auto grid w-full max-w-[520px] gap-3 rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[0_-8px_40px_rgb(0_0_0/0.2)]">
        <p className="sr-only" aria-live="assertive">
          {said}
        </p>
        {mode !== "live" ? (
          <p className="m-0 text-sm text-muted">{mode === "locating" ? "Finding your location…" : "Preview: moving along the route for you. Live location isn't available here."}</p>
        ) : null}
        {p?.hazard ? (
          <p className="m-0 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 font-bold text-ink">
            <AlertTriangle aria-hidden className="mt-0.5 size-6 shrink-0 text-caution" />
            <span>
              {p.hazard.inM > 5 ? `In ${fmt(p.hazard.inM)}: ` : ""}
              {hazardText(p.hazard)}
            </span>
          </p>
        ) : null}
        {p?.arrived ? (
          <p className="m-0 flex items-center gap-3 text-2xl font-bold">
            <Flag aria-hidden className="size-8" /> You&apos;ve arrived
          </p>
        ) : p?.offRoute ? (
          <p className="m-0 text-xl font-bold">Off the route. Working out a new one…</p>
        ) : (
          <div className="flex items-center gap-4">
            <Icon aria-hidden className="size-12 shrink-0" />
            <div className="min-w-0">
              <p className="tabular m-0 font-mono text-3xl font-semibold">{fmt(p ? p.distanceToNext : (next?.at ?? 0))}</p>
              <p className="m-0 text-lg leading-snug">{next?.text ?? ""}</p>
            </div>
          </div>
        )}
        <p className="tabular m-0 font-mono text-sm text-muted">
          {Math.max(1, Math.round(remaining / speedMps / 60))} min / {fmt(remaining)} to go
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              reportPace();
              onEnd();
            }}
            className="flex-1"
          >
            <X aria-hidden className="size-5" /> End
          </Button>
          <Button size="lg" aria-pressed={speak} onClick={() => setSpeak((v) => !v)} className={speak ? "border-ink bg-ink text-surface" : ""}>
            <Megaphone aria-hidden className="size-5" /> {speak ? "Speaking" : "Speak"}
          </Button>
          <Button size="lg" onClick={() => onReport(me.current)}>
            Report
          </Button>
          <Button size="lg" onClick={() => onNote(me.current)}>
            Add a note
          </Button>
        </div>
      </section>
    </div>
  );
}
