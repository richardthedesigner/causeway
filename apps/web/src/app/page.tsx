"use client";
import { learnPace, type Profile } from "@causeway/profile";
import { conditionsFromOpenMeteo, forecastConditions, getJson, openMeteoUrl, type OpenMeteoResponse } from "@causeway/live";
import { haversine } from "@causeway/graph";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapChrome, type Ground } from "@/components/MapChrome";
import { MapView } from "@/components/MapView";
import { DeviceMenu } from "@/components/DeviceMenu";
import { DeviceEditor } from "@/components/DeviceEditor";
import { DeviceSetup } from "@/components/DeviceSetup";
import { NavView, type Me } from "@/components/NavView";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { NoteSheet, type NoteAbout } from "@/components/NoteSheet";
import { PlaceIcon, PlaceSearch } from "@/components/PlaceSearch";
import { ReportSheet } from "@/components/ReportSheet";
import { RoutePanel } from "@/components/RoutePanel";
import { TripSettings } from "@/components/TripSettings";
import { MyDataSheet } from "@/components/MyDataSheet";
import { NoSignal } from "@/components/NoSignal";
import { useOnline } from "@/lib/use-online";
import { loadMapContrast, mapContrastOn, saveMapContrast } from "@/lib/map-contrast";
import { VerdictPill } from "@/components/RouteStrip";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { CITIES, cityById, type City } from "@/lib/cities";
import type { Place, PlannedRoute } from "@/lib/plan-types";
import { activeDevice, deviceLabel, FIRST_VISIT, loadDeviceState, saveDeviceState, setTip, tipPending, withActive, withActiveName, withActiveProfile, withDeviceProfile, withFavourite, withoutDevice, withSetup, type DeviceState } from "@/lib/devices";
import { addRecent, loadRecents } from "@/lib/recents";
import { useNotes } from "@/lib/use-notes";
import { hoursText, setBankHolidays } from "@/lib/opening-hours";
import { toiletsAlong } from "@/lib/toilets";
import { usePlaces } from "@/lib/use-places";
import { departure, usePlanner, type Conditions } from "@/lib/use-planner";

/** When you'd reach a point this far along the route, at the route's average pace. */
const passingAt = (r: PlannedRoute, leave: Date) => {
  const t0 = leave.getTime(),
    mps = r.summary.distanceM / Math.max(60, r.summary.minutes * 60);
  return (m: number) => new Date(t0 + (m / mps) * 1000);
};

const PRESET_CONDITIONS: Record<Ground, Conditions> = {
  dry: { wet: false, ice: false, summary: "Dry", source: "Set by you" },
  wet: { wet: true, ice: false, summary: "Wet: setts and slabs are slippery", source: "Set by you" },
  ice: { wet: true, ice: true, summary: "Icy: steep and sett sections ruled out", source: "Set by you" },
};

type View = "home" | "from" | "route";

const CITY_KEY = "causewayside.city.v1";
// full: change the 6dvh padding on the drawer body with it.
const SNAP = { peek: 0.24, half: 0.52, full: 0.94 };


/**
 * One question first: can I get there? The map fills the screen; one sheet
 * at the bottom holds search (in thumb reach, with who the routes are for
 * inside it), then the routes, each with its verdict before its time.
 */
export default function Home() {
  const [city, setCity] = useState<City>(CITIES[0]!);
  const [dataOpen, setDataOpen] = useState(false);
  const online = useOnline();
  // Opening hours everywhere follow this city's bank holidays; set before anything below reads them (idempotent).
  setBankHolidays(city.holidays);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (saved) {
        const c = cityById(saved);
        setCity(c);
        // Start in the saved city too, not at the first city's default start.
        setFrom(c.start);
      }
    } catch {
      /* no storage: default city */
    }
  }, []);
  const planner = usePlanner(city);
  const index = usePlaces(city, planner.ready?.places ?? null);
  // Venues with an accessible toilet go to the router, so "Past more toilets" can use them (public ones are in the graph).
  useEffect(() => {
    if (!index) return;
    // Venues with an accessible toilet, and Toilet Map and TfL station toilets OSM hasn't mapped (OSM's public toilets are in the graph already). Toilets inside the ticket gates need a ticket, so they stay out.
    const extra = (e: (typeof index.entries)[number]) => (e.cat !== "amenity=toilets" ? e.access?.["toilets:wheelchair"] === "yes" : /^(toiletmap|tfl-toilet):/.test(e.place.id) && e.access?.wheelchair === "yes" && e.access.access !== "customers");
    planner.sendToilets(index.entries.filter((e) => extra(e) && hoursText(e.access?.opening_hours, new Date())?.open !== false).map((e) => ({ lon: e.place.lon, lat: e.place.lat, name: e.place.name })));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  // Server render and first paint use the first-visit default; the saved devices load on mount.
  const [devices, setDevices] = useState<DeviceState>(FIRST_VISIT);
  const [setup, setSetup] = useState<"first" | "add" | null>(null);
  const [tip, setTipShown] = useState(false);
  const device = activeDevice(devices);
  const profile = device.profile;
  const [modeOpen, setModeOpen] = useState(false);
  const [from, setFrom] = useState<Place>(CITIES[0]!.start);
  const [to, setTo] = useState<Place | null>(null);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<string | null>(null);
  const [ground0, setConditions] = useState<Conditions>({ ...PRESET_CONDITIONS.dry, summary: "Checking the weather", source: "Open-Meteo" });
  // Leaving later: everything time-dependent follows it (D-040).
  const [leaveAt, setLeaveAt] = useState<Date | null>(null);
  const conditions = useMemo(() => ({ ...ground0, leaveAt }), [ground0, leaveAt]);
  const [showSlopes, setShowSlopes] = useState(false);
  // High-contrast map (SMALL-05): on for the low-vision device or when the phone asks, unless changed in the layers menu.
  const [contrastChoice, setContrastChoice] = useState<boolean | null>(null);
  const phoneAsksContrast = useMediaQuery("(prefers-contrast: more)");
  useEffect(() => setContrastChoice(loadMapContrast()), []);
  const highContrast = mapContrastOn(contrastChoice, profile.preset, phoneAsksContrast);
  const chooseContrast = (v: boolean) => {
    setContrastChoice(v);
    saveMapContrast(v);
  };
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

  useEffect(() => {
    setDevices(loadDeviceState(undefined, { demo: new URLSearchParams(location.search).get("demo") === "devices" }));
    setTipShown(tipPending());
  }, []);
  useEffect(() => setRecents(loadRecents(city.id)), [city]);
  const shared = useNotes(city.id);
  const cityNotes = shared.notes;
  // Large text leaves little room at half height: open the sheet fully instead.
  const [bigText, setBigText] = useState(false);
  useEffect(() => setBigText(parseFloat(getComputedStyle(document.documentElement).fontSize) >= 20), []);
  const open = (s: number) => setSnap(bigText ? SNAP.full : s);

  const ground: Ground = conditions.ice ? "ice" : conditions.wet ? "wet" : "dry";
  /** A saved device used for this journey only ("Use Lulu for this trip"); never saved. */
  const [trip, setTrip] = useState<string | null>(null);
  /** The previous device's best time for this journey, kept when switching so the route can say what changed. */
  const [compare, setCompare] = useState<{ label: string; minutes: number | null } | null>(null);
  const routeDevice = devices.devices.find((d) => d.id === trip) ?? device;
  const routeProfile = useMemo(() => (once ? { ...routeDevice.profile, ...once.patch } : routeDevice.profile), [routeDevice, once]);
  // A new journey starts with your own device and nothing to compare.
  useEffect(() => {
    setTrip(null);
    setCompare(null);
  }, [from.id, to?.id, city.id]);

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
    // Ten seconds, then the dry fallback below, rather than waiting on a feed that never answers (STAB-05).
    getJson<OpenMeteoResponse>(openMeteoUrl(...city.weatherAt), "Open-Meteo", { signal: ctl.signal })
      .then((j) => {
        const later = leaveAt && leaveAt.getTime() > Date.now() + 45 * 60_000;
        const c = later ? forecastConditions(j, leaveAt) : conditionsFromOpenMeteo(j);
        setConditions({ wet: c.wet, ice: c.ice, summary: c.summary, source: later ? "From the Open-Meteo forecast" : `From Open-Meteo at ${c.observedAt.slice(11, 16)} UTC` });
      })
      // A cancelled check (the city or leaving time changed) isn't a failure: the next one is already on its way.
      .catch(() => ctl.signal.aborted || setConditions({ ...PRESET_CONDITIONS.dry, summary: "Couldn't check the weather, so we're assuming dry", source: "Change it if the ground is wet or icy" }));
    return () => ctl.abort();
  }, [city, leaveAt]);

  const changeDevices = useCallback((f: (s: DeviceState) => DeviceState) => {
    setDevices((s) => {
      // Any saved change ends the first visit.
      const next = { ...f(s), fresh: false };
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

  // Nothing fits for this device: would another saved device get there?
  const others = devices.devices.filter((d) => d.id !== routeDevice.id);
  useEffect(() => {
    if (!planner.ready || !to || planner.result?.status !== "none" || once || !others.length) return planner.fits(from, from, [], conditions);
    planner.fits(from, to, others.map((d) => ({ key: d.id, profile: d.profile })), conditions);
  }, [planner.result]); // eslint-disable-line react-hooks/exhaustive-deps
  const alternatives = planner.result?.status === "none" && planner.fitsResult ? others.flatMap((d) => (planner.fitsResult![d.id] != null ? [{ id: d.id, label: deviceLabel(d), minutes: planner.fitsResult![d.id]! }] : [])) : [];

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
  const toilets = useMemo(() => (index && selectedRoute && view === "route" ? toiletsAlong(index, selectedRoute.coords, 80, passingAt(selectedRoute, departure(conditions))) : null), [index, selectedRoute, view, conditions]);
  const entrances = useMemo(() => (result?.status === "ok" ? result.entrances.map((e) => ({ lon: e.lon, lat: e.lat, ok: e.verdict.passable })) : []), [result]);

  const profileChip = (
    <DeviceMenu
      devices={devices.devices}
      activeId={devices.activeId}
      onPick={(id) => {
        // With a route on screen, remember its time so the new route can say what changed.
        const r = planner.result;
        if (to && r) setCompare({ label: deviceLabel(routeDevice), minutes: r.status === "ok" && r.routes[0] ? Math.round(r.routes[0].summary.minutes) : null });
        setOnce(null);
        setTrip(null);
        changeDevices((s) => withActive(s, id));
      }}
      tripLabel={trip ? deviceLabel(routeDevice) : undefined}
      onEdit={() => setModeOpen(true)}
      onAdd={() => setSetup("add")}
      onSetup={devices.fresh ? () => setSetup("first") : undefined}
      tip={tip}
      onTipSeen={() => {
        setTipShown(false);
        setTip("seen");
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

  // Fully open, the drawer still sits (1 - SNAP.full) of the screen below the bottom edge. Pad by that much, or the last
  // things in the list (the trip settings, the end of a route) can never scroll into view (STAB-10). Scroll padding does the
  // same for anything scrolled to by keyboard focus.
  // Keyboard focus moving into the list opens the drawer fully, so what's focused is never under the screen's edge
  // (WCAG 2.4.11). A tap doesn't: it would jump the sheet under the finger.
  const body = (
    <div
      onFocusCapture={(e) => {
        if (snap !== SNAP.full && (e.target as HTMLElement).matches?.(":focus-visible")) setSnap(SNAP.full);
      }}
      className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+6dvh+env(safe-area-inset-bottom,0px))] [scroll-padding-bottom:calc(1rem+6dvh)] md:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:[scroll-padding-bottom:1rem]">
      {!online ? <NoSignal city={city.name} /> : null}
      {planner.restarted === "restarting" || planner.restarted === "restarted" ? (
        <p role="status" className="mb-3 rounded-2xl border-2 border-caution bg-caution-soft p-3">
          {planner.restarted === "restarting" ? "Routing hit a problem on this phone. Starting it again…" : "Routing hit a problem and was started again. Anything you'd asked for has been worked out again."}
        </p>
      ) : planner.restarted === "gave-up" ? (
        <div role="alert" className="mb-3 grid gap-2 rounded-2xl border-2 border-stop p-3">
          <p className="m-0">Routing stopped working on this phone, and starting it again didn&apos;t help.</p>
          <Button variant="secondary" onClick={() => location.reload()} className="justify-self-start">
            Reload
          </Button>
        </div>
      ) : null}
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
          {devices.fresh ? <p className="m-0 rounded-2xl bg-surface-2 px-4 py-3 text-sm">Tell us how you get around and we&apos;ll plan routes you can actually do.</p> : null}
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
          <TripSettings
            deviceLabel={deviceLabel(routeDevice)}
            onDevice={() => setModeOpen(true)}
            ground={ground}
            groundNote={`${conditions.summary}. ${conditions.source}.`}
            onGround={(g) => setConditions(PRESET_CONDITIONS[g])}
            buses={profile.buses !== false}
            onBuses={(v) => updateProfile({ ...profile, buses: v })}
            toiletEvery={profile.maxToiletIntervalM}
            onToilets={() => setModeOpen(true)}
            leaveAt={leaveAt}
            onLeave={setLeaveAt}
          />
          <button type="button" onClick={() => setDataOpen(true)} className="min-h-11 justify-self-start px-1 text-sm font-bold text-accent underline underline-offset-4">
            Your data
          </button>
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
          forLabel={devices.devices.length > 1 || routeDevice.name ? deviceLabel(routeDevice) : undefined}
          compare={compare}
          onGround={(g) => setConditions(PRESET_CONDITIONS[g])}
          alternatives={alternatives}
          onUseForTrip={(id) => {
            const r = planner.result;
            setCompare(r ? { label: deviceLabel(routeDevice), minutes: null } : null);
            setOnce(null);
            setTrip(id);
          }}
          lifts={planner.lifts}
          works={planner.works}
          floods={planner.floods}
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
        highContrast={highContrast}
      />
      <MapChrome
        city={city}
        cities={CITIES}
        onCity={switchCity}
        showSlopes={showSlopes}
        onSlopes={setShowSlopes}
        highContrast={highContrast}
        onHighContrast={chooseContrast}
        onLocate={locate}
        locating={locating}
        credit={`${city.credit} Pavement data built ${planner.ready?.builtAt.slice(0, 10) ?? ""}.`}
        minimal={navigating}
      />
      <UpdatePrompt navigating={navigating} />
      {navigating && selectedRoute ? (
        <NavView
          route={selectedRoute}
          speedMps={routeProfile.speedMps}
          roadSpeedMps={routeProfile.roadLegal ? routeProfile.roadSpeedMps : undefined}
          device={
            devices.devices.length > 1
              ? {
                  label: deviceLabel(routeDevice),
                  others: others.map((d) => ({ id: d.id, label: deviceLabel(d) })),
                  onSwitch: (id) => {
                    // Re-plan the rest of the journey from where you are, for the device picked.
                    setOnce(null);
                    setTrip(null);
                    changeDevices((s) => withActive(s, id));
                    if (me) setFrom({ id: `me:${Date.now()}`, name: "Your location", kind: "Current location", lon: me.lon, lat: me.lat });
                  },
                }
              : undefined
          }
          onEnd={() => {
            setNavigating(false);
            // A device borrowed for this trip goes back when the journey ends.
            setTrip(null);
            setMe(null);
          }}
          onPosition={setMe}
          onPace={(mps) => changeDevices((s) => withDeviceProfile(s, routeDevice.id, learnPace(routeDevice.profile, mps)))}
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
      <DeviceSetup
        open={setup !== null}
        mode={setup ?? "first"}
        onDone={(choice) => {
          const first = !!devices.fresh;
          setSetup(null);
          setOnce(null);
          changeDevices((s) => withSetup(s, choice, `device-${Date.now().toString(36)}`));
          if (first) {
            setTip("pending");
            setTipShown(true);
          }
        }}
        onSkip={() => {
          // Skipping a first visit keeps today's default and stops asking.
          if (setup === "first") changeDevices((s) => s);
          setSetup(null);
        }}
      />
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
      <MyDataSheet open={dataOpen} onOpenChange={setDataOpen} />
      <ReportSheet open={reportAt !== null} onOpenChange={(v) => !v && setReportAt(null)} where={reportAt} city={city.id} sharing={shared.sharing !== "off"} onSaved={shared.saved} />
    </main>
  );
}

function useWide() {
  return useMediaQuery("(min-width: 768px)");
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
