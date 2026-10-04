"use client";
import { hazardText, Navigator, type Progress } from "@causeway/router";
import { Accessibility, AlertTriangle, ArrowUp, CornerUpLeft, CornerUpRight, Flag, MessageSquarePlus, TrainFront, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RouteStrip } from "@/components/RouteStrip";
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
  /** Who this route is for, and the other saved devices. Switching mid-journey asks first (D-036 step 7). */
  device?: { label: string; others: { id: string; label: string }[]; onSwitch: (id: string) => void };
}

const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`);

/** How far ahead the "coming up" card looks: far enough to choose to stop or turn back. */
const AHEAD_M = 300;

/**
 * Turn-by-turn. The next instruction on top, what's coming up under it
 * (before you reach it, not at it), and the route strip with you on it at
 * the bottom. Live location where the device allows it; otherwise a preview
 * that moves along the route. Instructions are also in a live region for
 * screen readers; speech is opt-in so it never talks over one.
 */
export function NavView({ route, speedMps, onEnd, onOffRoute, onPosition, onReport, onNote, onPace, device }: Props) {
  const [asking, setAsking] = useState(false);
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
  const along = p?.along ?? 0;
  const remaining = Math.max(0, route.nav.length - along);
  const minutes = Math.max(1, Math.round(remaining / speedMps / 60));
  const eta = new Date(Date.now() + minutes * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ahead = route.nav.hazards.find((h) => h.at + h.length > along && h.at - along <= AHEAD_M) ?? null;
  const aheadIn = ahead ? Math.max(0, Math.round((ahead.at - along) / 10) * 10) : 0;
  const Icon = !next ? Flag : next.type === "board" || next.type === "alight" || next.type === "change" ? TrainFront : /left/i.test(next.short) ? CornerUpLeft : /right/i.test(next.short) ? CornerUpRight : next.type === "arrive" ? Flag : ArrowUp;

  return (
    <>
      <p className="sr-only" aria-live="assertive">
        {said}
      </p>
      <section aria-label="Next instruction" className="absolute inset-x-2 top-[calc(0.5rem+env(safe-area-inset-top,0px))] z-30 grid gap-2 md:left-4 md:w-[440px]">
        <div className="flex items-center gap-4 rounded-[var(--radius)] bg-nav p-4 text-nav-ink shadow-[0_8px_30px_rgb(0_0_0/0.3)]">
          {p?.arrived ? (
            <p className="m-0 flex items-center gap-3 text-2xl font-bold">
              <Flag aria-hidden className="size-10" /> You&apos;ve arrived
            </p>
          ) : p?.offRoute ? (
            <p className="m-0 text-xl font-bold">Off the route. Working out a new one…</p>
          ) : (
            <>
              <Icon aria-hidden className="size-12 shrink-0" strokeWidth={2.4} />
              <div className="min-w-0">
                <p className="tabular m-0 text-[32px] leading-none font-bold">{fmt(p ? p.distanceToNext : (next?.at ?? 0))}</p>
                <p className="m-0 mt-1 text-lg leading-snug">{next?.text ?? ""}</p>
              </div>
            </>
          )}
        </div>
        {ahead && !p?.arrived ? (
          <div className={`flex items-start gap-3 rounded-2xl border-2 border-caution p-3 shadow-md ${p?.hazard ? "bg-caution text-surface" : "bg-caution-soft text-ink"}`}>
            <TriangleAlert aria-hidden className={`mt-0.5 size-6 shrink-0 ${p?.hazard ? "" : "text-caution"}`} />
            <p className="m-0">
              <span className="block font-bold">{hazardText(ahead)}</span>
              <span className="text-sm">{aheadIn > 5 ? `In ${fmt(aheadIn)}` : "Here now"}</span>
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Journey progress" className="absolute inset-x-0 bottom-0 z-30 grid gap-3 rounded-t-[var(--radius)] border-t border-line bg-surface px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_40px_rgb(0_0_0/0.18)] md:bottom-4 md:left-4 md:w-[440px] md:rounded-[var(--radius)] md:border">
        <RouteStrip strip={route.strip} along={along} />
        {mode !== "live" ? (
          <p className="m-0 text-sm text-muted">{mode === "locating" ? "Finding your location…" : "Preview: moving along the route for you. Live location isn't available here."}</p>
        ) : null}
        {asking && device ? (
          <div role="group" aria-labelledby="switch-h" className="grid gap-2 rounded-2xl border-2 border-ink p-3">
            <p id="switch-h" className="m-0 font-bold">
              Switch device mid-journey?
            </p>
            <p className="m-0 text-sm text-muted">The rest of the route will be re-planned from here for the device you pick.</p>
            {device.others.map((o) => (
              <Button
                key={o.id}
                variant="primary"
                className="rounded-2xl"
                onClick={() => {
                  setAsking(false);
                  device.onSwitch(o.id);
                }}
              >
                Switch to {o.label}
              </Button>
            ))}
            <Button className="rounded-2xl" onClick={() => setAsking(false)} autoFocus>
              Keep {device.label}
            </Button>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {device && device.others.length ? (
            <Button
              size="icon"
              aria-label={`Routes are for ${device.label}. Switch device`}
              aria-expanded={asking}
              onClick={() => setAsking((v) => !v)}
              className="size-14 shrink-0 rounded-2xl"
            >
              <Accessibility aria-hidden className="size-6" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="tabular m-0 text-[28px] leading-none font-bold">
              <span className="sr-only">Arrive at </span>
              {eta}
            </p>
            <p className="tabular m-0 mt-1 text-sm text-muted">
              {minutes} min · {fmt(remaining)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => {
              reportPace();
              onEnd();
            }}
            className="rounded-2xl border-stop bg-stop px-8 text-stop-ink hover:brightness-110"
          >
            End
          </Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
          <Button aria-pressed={speak} onClick={() => setSpeak((v) => !v)} className={speak ? "rounded-2xl border-ink bg-ink px-2 text-surface" : "rounded-2xl px-2"}>
            {speak ? <Volume2 aria-hidden className="size-5 shrink-0" /> : <VolumeX aria-hidden className="size-5 shrink-0" />} Speak
          </Button>
          <Button onClick={() => onNote(me.current)} aria-label="Add a note about where you are" className="rounded-2xl px-2">
            <MessageSquarePlus aria-hidden className="size-5 shrink-0" /> Note
          </Button>
          <Button onClick={() => onReport(me.current)} aria-label="Report a problem here" className="rounded-2xl px-2">
            <AlertTriangle aria-hidden className="size-5 shrink-0" /> Report
          </Button>
        </div>
      </section>
    </>
  );
}
