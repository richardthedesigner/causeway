"use client";
import { learnPace, type Profile } from "@causeway/profile";
import { conditionsFromOpenMeteo, openMeteoUrl } from "@causeway/live";
import { haversine } from "@causeway/graph";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapChrome, type Ground } from "@/components/MapChrome";
import { MapView } from "@/components/MapView";
import { DeviceMenu } from "@/components/DeviceMenu";
import { DeviceEditor } from "@/components/DeviceEditor";
import { NavView, type Me } from "@/components/NavView";
import { NoteSheet, type NoteAbout } from "@/components/NoteSheet";
import { PlaceIcon, PlaceSearch } from "@/components/PlaceSearch";
import { ReportSheet } from "@/components/ReportSheet";
import { RoutePanel } from "@/components/RoutePanel";
import { VerdictPill } from "@/components/RouteStrip";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { CITIES, cityById, type City } from "@/lib/cities";
import type { Place } from "@/lib/plan-types";
import { activeDevice, loadDeviceState, saveDeviceState, SEED_DEVICES, withActive, withActiveName, withActiveProfile, withFavourite, withNewDevice, withoutDevice, type DeviceState } from "@/lib/devices";
import { addRecent, loadRecents } from "@/lib/recents";
import { useNotes } from "@/lib/use-notes";
import { toiletsAlong } from "@/lib/toilets";
import { usePlaces } from "@/lib/use-places";
import { usePlanner, type Conditions } from "@/lib/use-planner";

const PRESET_CONDITIONS: Record<Ground, Conditions> = {
  dry: { wet: false, ice: false, summary: "Dry", source: "Set by you" },
  wet: { wet: true, ice: false, summary: "Wet: setts and slabs are slippery", source: "Set by you" },
  ice: { wet: true, ice: true, summary: "Icy: steep and sett sections ruled out", source: "Set by you" },
};

type View = "home" | "from" | "route";

const CITY_KEY = "causewayside.city.v1";
const SNAP = { peek: 0.24, half: 0.52, full: 0.94 };


/**
 * One question first: can I get there? The map fills the screen; one sheet
 * at the bottom holds search (in thumb reach, with who the routes are for
 * inside it), then the routes, each with its verdict before its time.
 */
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
  // Venues with an accessible toilet go to the router, so "Past more toilets" can use them (public ones are in the graph).
  useEffect(() => {
    if (!index) return;
    planner.sendToilets(index.entries.filter((e) => e.cat !== "amenity=toilets" && e.access?.["toilets:wheelchair"] === "yes").map((e) => ({ lon: e.place.lon, lat: e.place.lat, name: e.place.name })));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  // Server render and first paint use the seed; the saved devices load on mount.
  const [devices, setDevices] = useState<DeviceState>({ devices: SEED_DEVICES, activeId: SEED_DEVICES[0]!.id });
  const device = activeDevice(devices);
  const profile = device.profile;
  const [modeOpen, setModeOpen] = useState(false);
  const [from, setFrom] = useState<Place>(CITIES[0]!.start);
  const [to, setTo] = useState<Place | null>(null);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Conditions>({ ...PRESET_CONDITIONS.dry, summary: "Checking the weather", source: "Open-Meteo" });
  const [showSlopes, setShowSlopes] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(SNAP.half);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<{ lon: number; lat: number; n: number } | null>(null);
  const [pin, setPin] = useState<Place | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [reportAt, setReportAt] = useState<{ lon: number; lat: number; accuracyM: number | null; label: string } | null>(null);
  const [noteChoices, setNoteChoices] = useState<NoteAbout[] | null>(null);
  /** A limit stretched for this journey only. Never saved; cleared when the journey changes. */
  const [once, setOnce] = useState<{ patch: Partial<Profile>; what: string[] } | null>(null);
  const [recents, setRecents] = useState<Place[]>([]);
  const wide = useWide();

  useEffect(() => setDevices(loadDeviceState()), []);
  useEffect(() => setRecents(loadRecents(city.id)), [city]);
  const shared = useNotes(city.id);
  const cityNotes = shared.notes;
  // Large text leaves little room at half height: open the sheet fully instead.
  const [bigText, setBigText] = useState(false);
  useEffect(() => setBigText(parseFloat(getComputedStyle(document.documentElement).fontSize) >= 20), []);
  const open = (s: number) => setSnap(bigText ? SNAP.full : s);

  const ground: Ground = conditions.ice ? "ice" : conditions.wet ? "wet" : "dry";
  const routeProfile = useMemo(() => (once ? { ...profile, ...once.patch } : profile), [profile, once]);

  const switchCity = (c: City) => {
    setCity(c);
    setFrom(c.start);
    setTo(null);
    setPin(null);
    setOnce(null);
    setView("home");
    try {
      localStorage.setItem(CITY_KEY, c.id);
    } catch {
      /* not remembered; fine */
    }
  };

  // Live weather sets the ground; the user can override it from the chip.
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

  const changeDevices = useCallback((f: (s: DeviceState) => DeviceState) => {
    setDevices((s) => {
      const next = f(s);
      saveDeviceState(next);
      return next;
    });
  }, []);
  const updateProfile = useCallback((p: Profile) => changeDevices((s) => withActiveProfile(s, p)), [changeDevices]);

  // Re-plan whenever the journey, the person or the ground changes.
  useEffect(() => {
    if (!planner.ready || !to) return;
    planner.plan(from, to, routeProfile, conditions, cityNotes);
    setSelected(null);
  }, [planner.ready, from, to, routeProfile, conditions, planner.lifts, cityNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recent places answer "can I get there?" before you search: a verdict for each from where you start.
  useEffect(() => {
    if (!planner.ready || view !== "home" || !recents.length) return;
    planner.check(from, recents, profile, conditions);
  }, [planner.ready, view, recents, from, profile, conditions]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (p: Place) => {
    setTo(p);
    setOnce(null);
    setRecents(addRecent(city.id, p));
    setView("route");
    open(SNAP.half);
  };

  const pick = (p: Place) => {
    if (view === "from") {
      setFrom(p);
      setOnce(null);
      setView(to ? "route" : "home");
      open(SNAP.half);
    } else goTo(p);
  };

  const inArea = (lon: number, lat: number) => {
    if (!planner.ready) return false;
    const [x0, y0, x1, y1] = planner.ready.bbox;
    return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoError("This browser can't share your location. Type where you're starting from instead.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { longitude: lon, latitude: lat } = pos.coords;
        if (!inArea(lon, lat)) {
          setGeoError(`You're outside the part of ${city.name} we have routes for. Type where you're starting from instead.`);
          return;
        }
        setFrom({ id: "me", name: "Your location", kind: "Current location", lon, lat });
        setFocus({ lon, lat, n: Date.now() });
        if (view === "from") setView(to ? "route" : "home");
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location. Type where you're starting from instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  // A stray tap must never wipe a route: a tap proposes a pin, and the user confirms it.
  const onMapClick = (lon: number, lat: number) => {
    if (!inArea(lon, lat)) return;
    setPin({ id: `pin:${lon.toFixed(5)},${lat.toFixed(5)}`, name: "Dropped pin", kind: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat });
    open(SNAP.half);
  };

  const result = view === "route" ? planner.result : null;
  const routes = useMemo(() => {
    if (result?.status !== "ok") return [];
    const extra = result.tradeoffs.flatMap((t) => (t.route && t.route.id === selected ? [t.route] : []));
    return [...result.routes, ...extra];
  }, [result, selected]);
  const blockers = useMemo(() => (result?.status === "none" ? result.blockers : []), [result]);
  const preview = useMemo(() => (result?.status === "none" ? (result.closest ?? null) : null), [result]);
  const basemap = useMemo(() => {
    const b64 = !!process.env.NEXT_PUBLIC_GRAPH_B64;
    const u = (f: string) => new URL(b64 ? f.replace(/\.pmtiles$/, ".b64.txt") : f, document.baseURI).toString();
    return typeof document === "undefined" ? null : { url: u(city.basemap), key: city.id, glyphs: u("fonts/glyphs.json"), center: [city.start.lon, city.start.lat] as [number, number] };
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedRoute = routes.find((r) => r.id === selected) ?? routes[0] ?? null;
  const toilets = useMemo(() => (index && selectedRoute && view === "route" ? toiletsAlong(index, selectedRoute.coords) : null), [index, selectedRoute, view]);
  const entrances = useMemo(() => (result?.status === "ok" ? result.entrances.map((e) => ({ lon: e.lon, lat: e.lat, ok: e.verdict.passable })) : []), [result]);

  const profileChip = (
    <DeviceMenu
      devices={devices.devices}
      activeId={devices.activeId}
      onPick={(id) => {
        setOnce(null);
        changeDevices((s) => withActive(s, id));
      }}
      onEdit={() => setModeOpen(true)}
      onAdd={() => {
        setOnce(null);
        changeDevices((s) => withNewDevice(s, `device-${Date.now().toString(36)}`));
        setModeOpen(true);
      }}
    />
  );

  const recentItems = (
    <>
      {recents.length ? (
        <CommandGroup heading={<span className="block px-3 pt-2 pb-1 font-mono text-xs tracking-[0.08em] text-muted uppercase">Recent</span>}>
          {recents.map((p) => {
            const c = planner.checks[p.id];
            return (
              <CommandItem key={p.id} value={`recent:${p.id}`} onSelect={() => goTo(p)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                  <PlaceIcon p={p} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.name}</span>
                  <span className="block truncate text-sm text-muted">{p.kind}</span>
                </span>
                {c ? (
                  <span className="grid shrink-0 justify-items-end gap-0.5">
                    <VerdictPill v={c.verdict} />
                    {c.minutes !== null ? <span className="tabular text-sm text-muted">{c.minutes} min</span> : null}
                  </span>
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}
      {planner.ready ? (
        <CommandGroup heading={<span className="block px-3 pt-2 pb-1 font-mono text-xs tracking-[0.08em] text-muted uppercase">Places in {city.name}</span>}>
          {planner.ready.places
            .filter((p) => p.kind !== "Street" && !recents.some((r) => r.id === p.id))
            .slice(0, recents.length ? 4 : 8)
            .map((p) => (
              <CommandItem key={p.id} value={p.id} onSelect={() => goTo(p)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                  <PlaceIcon p={p} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  <span className="block truncate text-sm text-muted">{p.kind}</span>
                </span>
              </CommandItem>
            ))}
        </CommandGroup>
      ) : null}
    </>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {pin ? (
        <section aria-live="polite" aria-label="Dropped pin" className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-accent p-3">
          <p className="m-0 min-w-0 flex-1">
            <span className="font-bold">Dropped pin</span>
            <span className="block text-sm text-muted">{pin.kind}</span>
          </p>
          <Button
            variant="primary"
            onClick={() => {
              goTo(pin);
              setPin(null);
            }}
          >
            Directions here
          </Button>
          <Button onClick={() => setPin(null)}>Cancel</Button>
        </section>
      ) : null}
      {geoError ? (
        <p role="alert" className="m-0 mb-3 rounded-2xl bg-caution-soft p-3 text-sm">
          {geoError}
        </p>
      ) : null}
      {planner.error && !planner.ready ? (
        <p role="alert" className="m-0 py-4">
          The map data didn&apos;t load ({planner.error}). Check your connection and reload.
        </p>
      ) : !planner.ready ? (
        <p className="m-0 py-4 text-muted" aria-live="polite">
          Loading {city.name}…
        </p>
      ) : view === "home" ? (
        <div className="grid gap-3 [&>*]:min-w-0">
          <PlaceSearch
            key={`${city.id}-to`}
            label="Where to?"
            index={index}
            suggestions={[]}
            near={from}
            bbox={planner.ready.bbox}
            cityName={city.name}
            excludeId={from.id}
            onPick={pick}
            trailing={profileChip}
            emptyState={recentItems}
            onFocus={() => open(SNAP.full)}
          />
          <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>
              From <span className="font-bold text-ink">{from.name}</span>
            </span>
            <button type="button" onClick={() => setView("from")} className="min-h-10 font-bold text-accent">
              Change
            </button>
          </p>
          <p className="m-0 -mt-2 text-sm text-muted">Or tap the map to drop a pin.</p>
        </div>
      ) : view === "from" ? (
        <div className="grid gap-3 [&>*]:min-w-0">
          <Button variant="ghost" onClick={() => setView(to ? "route" : "home")} className="justify-self-start px-2">
            <ChevronLeft aria-hidden className="size-5" /> Back
          </Button>
          <PlaceSearch
            key={`${city.id}-from`}
            label="Starting from?"
            index={index}
            suggestions={planner.ready.places.filter((p) => p.kind !== "Street").slice(0, 8)}
            near={to ?? from}
            bbox={planner.ready.bbox}
            cityName={city.name}
            excludeId={to?.id}
            onPick={pick}
            onUseLocation={locate}
            autoFocus
            onFocus={() => open(SNAP.full)}
          />
        </div>
      ) : to ? (
        <RoutePanel
          toilets={toilets}
          from={from}
          to={to}
          profile={routeProfile}
          conditions={conditions}
          result={planner.result}
          planning={planner.planning}
          selectedId={selected}
          onSelect={setSelected}
          onChangeFrom={() => setView("from")}
          onChangeTo={() => {
            setView("home");
            open(SNAP.full);
          }}
          onSwap={() => {
            setFrom(to);
            setTo(from);
          }}
          onOpenMode={() => setModeOpen(true)}
          device={profileChip}
          lifts={planner.lifts}
          works={planner.works}
          worksCovered={!!city.works}
          liveBuses={city.liveLifts}
          onStart={() => setNavigating(true)}
          notes={cityNotes}
          author={shared.author}
          onFlagNote={shared.sharing === "off" ? undefined : shared.flag}
          builtAt={planner.ready.builtAt}
          onAddNote={setNoteChoices}
          onDeleteNote={(id) => void shared.remove(id)}
          once={once}
          onAllowOnce={(patch, what) => setOnce({ patch, what })}
          onUndoOnce={() => setOnce(null)}
          pinActions={!wide && !navigating}
          onGoClosest={(p) => {
            setTo(p);
            setOnce(null);
          }}
        />
      ) : null}
      <p className={`m-0 mt-6 text-xs text-muted ${view === "route" && !wide ? "pb-24" : ""}`}>© OpenStreetMap contributors. More in the map layers menu.</p>
    </div>
  );

  return (
    <main className="fixed inset-0">
      <MapView
        network={planner.ready?.network ?? null}
        routes={navigating && selectedRoute ? [selectedRoute] : routes}
        selectedId={selected}
        from={from}
        to={view === "route" ? to : null}
        pin={pin}
        showSlopes={showSlopes}
        entrances={view === "route" ? entrances : []}
        toilets={toilets?.toilets ?? []}
        onMapClick={navigating ? () => {} : onMapClick}
        me={me}
        basemap={basemap}
        blockers={blockers}
        preview={preview}
        focus={focus}
      />
      <MapChrome
        city={city}
        cities={CITIES}
        onCity={switchCity}
        ground={ground}
        conditions={conditions}
        onGround={(g) => setConditions(PRESET_CONDITIONS[g])}
        showSlopes={showSlopes}
        onSlopes={setShowSlopes}
        onLocate={locate}
        locating={locating}
        credit={`${city.credit} Pavement data built ${planner.ready?.builtAt.slice(0, 10) ?? ""}.`}
        minimal={navigating}
      />
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
              setNoteChoices([
                {
                  target: { kind: "way", name: near.st.name, osmWayIds: near.st.osmWayIds, edgeIds: near.st.edgeIds, graphBuiltAt: planner.ready!.builtAt },
                  lon: near.pt[0],
                  lat: near.pt[1],
                },
              ]);
          }}
          onReport={(m) => setReportAt(m ? { lon: m.lon, lat: m.lat, accuracyM: m.accuracyM, label: "your location" } : to ? { lon: to.lon, lat: to.lat, accuracyM: null, label: to.name } : null)}
        />
      ) : wide ? (
        <aside aria-label={view === "route" ? "Directions" : "Search"} className="absolute top-4 bottom-4 left-4 z-10 flex w-[420px] flex-col rounded-[var(--radius)] border border-line bg-surface pt-4 shadow-[0_8px_40px_rgb(0_0_0/0.16)]">
          <h1 className="sr-only">Causewayside: can I get there?</h1>
          {body}
        </aside>
      ) : (
        <Drawer open modal={false} dismissible={false} snapPoints={[SNAP.peek, SNAP.half, SNAP.full]} activeSnapPoint={snap} setActiveSnapPoint={setSnap}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle className="sr-only">{view === "route" ? "Directions" : "Causewayside: can I get there?"}</DrawerTitle>
            {body}
          </DrawerContent>
        </Drawer>
      )}
      <DeviceEditor
        open={modeOpen}
        onOpenChange={setModeOpen}
        device={device}
        onChange={updateProfile}
        onRename={(name) => changeDevices((s) => withActiveName(s, name))}
        onFavourite={(on) => changeDevices((s) => withFavourite(s, s.activeId, on))}
        onRemove={
          devices.devices.length > 1
            ? () => {
                setModeOpen(false);
                setOnce(null);
                changeDevices((s) => withoutDevice(s, s.activeId));
              }
            : undefined
        }
      />
      <NoteSheet choices={noteChoices} onOpenChange={(v) => !v && setNoteChoices(null)} city={city.id} preset={profile.preset} sharing={shared.sharing !== "off"} onSaved={shared.saved} />
      <ReportSheet open={reportAt !== null} onOpenChange={(v) => !v && setReportAt(null)} where={reportAt} city={city.id} sharing={shared.sharing !== "off"} onSaved={shared.saved} />
    </main>
  );
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
