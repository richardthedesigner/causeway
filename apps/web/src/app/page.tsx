"use client";
import { learnPace, PRESETS, type Profile } from "@causeway/profile";
import { conditionsFromOpenMeteo, openMeteoUrl } from "@causeway/live";
import { Mountain, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { ModeSheet } from "@/components/ModeSheet";
import { NavView, type Me } from "@/components/NavView";
import { NoteSheet, type NoteAbout } from "@/components/NoteSheet";
import { ReportSheet } from "@/components/ReportSheet";
import { haversine, type UserNote } from "@causeway/graph";
import { PlaceSearch } from "@/components/PlaceSearch";
import { RoutePanel } from "@/components/RoutePanel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import type { Place } from "@/lib/plan-types";
import { loadProfile, saveProfile } from "@/lib/profile-store";
import { deleteNote, deviceAuthor, loadNotes } from "@/lib/notes-store";
import { CITIES, cityById, type City } from "@/lib/cities";
import { usePlaces } from "@/lib/use-places";
import { usePlanner, type Conditions } from "@/lib/use-planner";

const PRESET_CONDITIONS: Record<"dry" | "wet" | "ice", Conditions> = {
  dry: { wet: false, ice: false, summary: "Dry", source: "Set by you" },
  wet: { wet: true, ice: false, summary: "Wet: setts and slabs are slippery", source: "Set by you" },
  ice: { wet: true, ice: true, summary: "Icy: steep and sett sections ruled out", source: "Set by you" },
};

type View = { kind: "search"; target: "from" | "to" } | { kind: "route" };

const CITY_KEY = "causewayside.city.v1";

export default function Home() {
  const [city, setCity] = useState<City>(CITIES[0]!);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (saved) setCity(cityById(saved));
    } catch {
      /* no storage: default city */
    }
  }, []);
  const planner = usePlanner(city);
  const index = usePlaces(city, planner.ready?.places ?? null);
  const [profile, setProfile] = useState<Profile>(PRESETS["manual-wheelchair"]);
  const [modeOpen, setModeOpen] = useState(false);
  const [from, setFrom] = useState<Place>(CITIES[0]!.start);
  const [to, setTo] = useState<Place | null>(null);
  const [view, setView] = useState<View>({ kind: "search", target: "to" });
  const [selected, setSelected] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Conditions>({ ...PRESET_CONDITIONS.dry, summary: "Checking the weather", source: "Open-Meteo" });
  const [showSlopes, setShowSlopes] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(0.5);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pin, setPin] = useState<Place | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [reportAt, setReportAt] = useState<{ lon: number; lat: number; accuracyM: number | null; label: string } | null>(null);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [author, setAuthor] = useState("");
  const [noteAbout, setNoteAbout] = useState<NoteAbout | null>(null);
  const wide = useWide();

  useEffect(() => setProfile(loadProfile()), []);
  useEffect(() => {
    setNotes(loadNotes());
    setAuthor(deviceAuthor());
  }, []);
  const cityNotes = useMemo(() => notes.filter((n) => n.city === city.id), [notes, city.id]);
  // Large text leaves little room at half height: open the sheet fully instead.
  useEffect(() => {
    if (parseFloat(getComputedStyle(document.documentElement).fontSize) >= 20) setSnap(0.94);
  }, []);

  const switchCity = (c: City) => {
    setCity(c);
    setFrom(c.start);
    setTo(null);
    setPin(null);
    setView({ kind: "search", target: "to" });
    try {
      localStorage.setItem(CITY_KEY, c.id);
    } catch {
      /* not remembered; fine */
    }
  };

  // Live weather sets the default conditions; the user can override.
  useEffect(() => {
    const ctl = new AbortController();
    fetch(openMeteoUrl(...city.weatherAt), { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        const c = conditionsFromOpenMeteo(j);
        setConditions({ wet: c.wet, ice: c.ice, summary: c.summary, source: `From Open-Meteo at ${c.observedAt.slice(11, 16)} UTC` });
      })
      .catch(() => setConditions({ ...PRESET_CONDITIONS.dry, summary: "Couldn't check the weather, so we're assuming dry", source: "Change it if the ground is wet or icy" }));
    return () => ctl.abort();
  }, [city]);

  const updateProfile = useCallback((p: Profile) => {
    setProfile(p);
    saveProfile(p);
  }, []);

  // Re-plan whenever the journey, the person or the ground changes.
  useEffect(() => {
    if (!planner.ready || !to) return;
    planner.plan(from, to, profile, conditions, cityNotes);
    setSelected(null);
  }, [planner.ready, from, to, profile, conditions, planner.lifts, cityNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: Place) => {
    if (view.kind === "search" && view.target === "from") setFrom(p);
    else setTo(p);
    setView({ kind: "route" });
    setSnap(0.5);
  };

  const useLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => pick({ id: "me", name: "Your location", kind: "Current location", lon: pos.coords.longitude, lat: pos.coords.latitude }),
      () => setGeoError("Couldn't get your location. Type where you're starting from instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  // A stray tap must never wipe a route: a tap proposes a pin, and the user confirms it.
  const onMapClick = (lon: number, lat: number) => {
    if (!planner.ready) return;
    const [x0, y0, x1, y1] = planner.ready.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) return;
    setPin({ id: `pin:${lon.toFixed(5)},${lat.toFixed(5)}`, name: "Dropped pin", kind: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat });
    setSnap(0.5);
  };

  const routes = useMemo(() => {
    const r = planner.result;
    if (r?.status !== "ok") return [];
    const extra = r.tradeoffs.flatMap((t) => (t.route && t.route.id === selected ? [t.route] : []));
    return [...r.routes, ...extra];
  }, [planner.result, selected]);
  const basemap = useMemo(() => {
    const b64 = !!process.env.NEXT_PUBLIC_GRAPH_B64;
    const u = (f: string) => new URL(b64 ? f.replace(/\.pmtiles$/, ".b64.txt") : f, document.baseURI).toString();
    return typeof document === "undefined" ? null : { url: u(city.basemap), key: city.id, glyphs: u("fonts/glyphs.json"), center: [city.start.lon, city.start.lat] as [number, number] };
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedRoute = routes.find((r) => r.id === selected) ?? routes[0] ?? null;
  const entrances =
    planner.result?.status === "ok" ? planner.result.entrances.map((e) => ({ lon: e.lon, lat: e.lat, ok: e.verdict.passable })) : [];

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {pin ? (
        <section aria-live="polite" aria-label="Dropped pin" className="mb-4 grid gap-3 rounded-2xl border-2 border-accent p-4">
          <p className="m-0">
            <span className="font-bold">Dropped pin</span>
            <span className="block text-sm text-muted">{pin.kind}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setTo(pin);
                setPin(null);
                setView({ kind: "route" });
              }}
            >
              Directions here
            </Button>
            <Button onClick={() => setPin(null)}>Cancel</Button>
          </div>
        </section>
      ) : null}
      {planner.error && !planner.ready ? (
        <p role="alert" className="m-0 py-4">
          The map data didn&apos;t load ({planner.error}). Check your connection and reload.
        </p>
      ) : !planner.ready ? (
        <p className="m-0 py-4 text-muted" aria-live="polite">
          Loading {city.name}…
        </p>
      ) : view.kind === "search" ? (
        <div className="grid gap-4 pt-1">
          <div role="radiogroup" aria-label="City" className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === city.id}
                onClick={() => c.id !== city.id && switchCity(c)}
                className={c.id === city.id ? "min-h-12 rounded-full border border-ink bg-ink px-4 text-surface" : "min-h-12 rounded-full border border-line px-4"}
              >
                {c.name}
              </button>
            ))}
          </div>
          <PlaceSearch
            key={`${city.id}-${view.target}`}
            label={view.target === "to" ? "Where to?" : "Starting from?"}
            index={index}
            suggestions={planner.ready.places.filter((p) => p.kind !== "Street").slice(0, 8)}
            near={view.target === "to" ? from : (to ?? from)}
            bbox={planner.ready.bbox}
            cityName={city.name}
            excludeId={view.target === "to" ? from.id : to?.id}
            onPick={pick}
            onUseLocation={view.target === "from" ? useLocation : undefined}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={() => setModeOpen(true)} aria-label={`Getting around as ${profile.label}. Change`}>
              <SlidersHorizontal aria-hidden className="size-5" /> {profile.label}
            </Button>
            {to ? (
              <Button variant="ghost" onClick={() => setView({ kind: "route" })}>
                Back to route
              </Button>
            ) : null}
          </div>
          {geoError ? (
            <p role="alert" className="m-0">
              {geoError}
            </p>
          ) : null}
          <p className="m-0 text-sm text-muted">{view.target === "to" ? `Or tap the map to drop a pin. Starting from ${from.name}.` : "Or pick a street or place."}</p>
          <p className="m-0 text-sm text-muted">{city.coverage}</p>
        </div>
      ) : to ? (
        <RoutePanel
          from={from}
          to={to}
          profile={profile}
          conditions={conditions}
          result={planner.result}
          planning={planner.planning}
          selectedId={selected}
          onSelect={setSelected}
          onChangeFrom={() => setView({ kind: "search", target: "from" })}
          onChangeTo={() => setView({ kind: "search", target: "to" })}
          onSwap={() => {
            setFrom(to);
            setTo(from);
          }}
          onOpenMode={() => setModeOpen(true)}
          onConditions={(k) => setConditions(PRESET_CONDITIONS[k])}
          lifts={planner.lifts}
          onStart={() => setNavigating(true)}
          notes={cityNotes}
          author={author}
          builtAt={planner.ready.builtAt}
          onAddNote={setNoteAbout}
          onDeleteNote={(id) => {
            deleteNote(id);
            setNotes(loadNotes());
          }}
        />
      ) : null}
      <footer className="mt-8 grid gap-2 border-t border-line pt-4 text-sm text-muted">
        <p className="m-0">
          {city.credit} Pavement data built {planner.ready?.builtAt.slice(0, 10) ?? ""}.
        </p>
      </footer>
    </div>
  );

  // The name earns its space on the first screen only; on a route, the route is the content.
  const header =
    view.kind === "search" ? (
      <header className="px-4 pt-1 pb-3">
        <DrawerOrH1 wide={wide}>Causewayside</DrawerOrH1>
        <SubOrDesc wide={wide}>Routes worked out for how you get around.</SubOrDesc>
      </header>
    ) : (
      <header className="px-4 pt-1 pb-2">
        <DrawerOrH1 wide={wide} small>
          Directions
        </DrawerOrH1>
      </header>
    );

  return (
    <main className="fixed inset-0">
      <MapView
        network={planner.ready?.network ?? null}
        routes={view.kind === "route" ? routes : []}
        selectedId={selected}
        from={from}
        to={view.kind === "route" ? to : null}
        pin={pin}
        showSlopes={showSlopes}
        entrances={view.kind === "route" ? entrances : []}
        onMapClick={navigating ? () => {} : onMapClick}
        me={me}
        basemap={basemap}
      />
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 z-10 flex flex-col gap-2">
        <Button
          aria-pressed={showSlopes}
          onClick={() => setShowSlopes((v) => !v)}
          className={showSlopes ? "border-ink bg-ink text-surface shadow-md" : "bg-surface shadow-md"}
        >
          <Mountain aria-hidden className="size-5" /> Slopes
        </Button>
        {showSlopes ? (
          <ul aria-label="Slope key" className="m-0 grid list-none gap-1 rounded-2xl border border-line bg-surface p-3 text-sm shadow-md">
            {[["--g0", "0 to 3%"], ["--g1", "3 to 5%"], ["--g2", "5 to 8%"], ["--g3", "8 to 12%"], ["--g4", "Over 12%"]].map(([c, l]) => (
              <li key={l} className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-1.5 w-6 rounded-full" style={{ background: `var(${c})` }} />
                {l}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-0 w-6 border-t-2 border-dotted border-unknown" />
              Not known
            </li>
          </ul>
        ) : null}
      </div>
      {navigating && selectedRoute ? (
        <NavView
          route={selectedRoute}
          speedMps={profile.speedMps}
          onEnd={() => {
            setNavigating(false);
            setMe(null);
          }}
          onPosition={setMe}
          onPace={(mps) => updateProfile(learnPace(profile, mps))}
          onOffRoute={(m) => setFrom({ id: `me:${Date.now()}`, name: "Your location", kind: "Current location", lon: m.lon, lat: m.lat })}
          onNote={(m) => {
            // The stretch of this route nearest to you (or to the destination, in a preview).
            const at: [number, number] = m ? [m.lon, m.lat] : to ? [to.lon, to.lat] : [from.lon, from.lat];
            const near = selectedRoute.stretches
              .flatMap((st) => st.points.map((pt) => ({ st, pt, d: haversine(pt, at) })))
              .sort((x, y) => x.d - y.d)[0];
            if (near)
              setNoteAbout({
                target: { kind: "way", name: near.st.name, osmWayIds: near.st.osmWayIds, edgeIds: near.st.edgeIds, graphBuiltAt: planner.ready!.builtAt },
                lon: near.pt[0],
                lat: near.pt[1],
              });
          }}
          onReport={(m) => setReportAt(m ? { lon: m.lon, lat: m.lat, accuracyM: m.accuracyM, label: "your location" } : to ? { lon: to.lon, lat: to.lat, accuracyM: null, label: to.name } : null)}
        />
      ) : wide ? (
        <aside aria-label="Directions" className="absolute top-4 bottom-4 left-4 z-10 flex w-[420px] flex-col rounded-[var(--radius)] border border-line bg-surface shadow-[0_8px_40px_rgb(0_0_0/0.16)]">
          <div className="pt-4">{header}</div>
          {body}
        </aside>
      ) : (
        <Drawer open modal={false} dismissible={false} snapPoints={[0.22, 0.5, 0.94]} activeSnapPoint={snap} setActiveSnapPoint={setSnap}>
          <DrawerContent aria-describedby={undefined}>
            {header}
            {body}
          </DrawerContent>
        </Drawer>
      )}
      <ModeSheet open={modeOpen} onOpenChange={setModeOpen} profile={profile} onChange={updateProfile} />
      <NoteSheet about={noteAbout} onOpenChange={(v) => !v && setNoteAbout(null)} city={city.id} preset={profile.preset} onSaved={() => setNotes(loadNotes())} />
      <ReportSheet open={reportAt !== null} onOpenChange={(v) => !v && setReportAt(null)} where={reportAt} city={city.id} />
    </main>
  );
}

function DrawerOrH1({ wide, small, children }: { wide: boolean; small?: boolean; children: React.ReactNode }) {
  const cls = small ? "m-0 text-base font-bold text-muted" : "m-0 text-2xl font-bold";
  return wide ? <h1 className={cls}>{children}</h1> : <DrawerTitle className={cls}>{children}</DrawerTitle>;
}
function SubOrDesc({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return wide ? <p className="m-0 text-muted">{children}</p> : <DrawerDescription className="m-0 text-muted">{children}</DrawerDescription>;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

