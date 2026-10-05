"use client";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type * as GeoJSON from "geojson";
import { useEffect, useRef, useState } from "react";
import { basemapLayers, GLYPHS, loadBasemap, registerProtocols } from "@/lib/basemap";
import type { Place, PlannedRoute } from "@/lib/plan-types";

interface Props {
  network: { coords: [number, number][]; bin: number }[] | null;
  routes: PlannedRoute[];
  selectedId: string | null;
  from: Place | null;
  to: Place | null;
  /** A proposed destination awaiting confirmation. */
  pin: Place | null;
  showSlopes: boolean;
  entrances: { lon: number; lat: number; ok: "yes" | "no" | "unknown" }[];
  /** Accessible toilets along the chosen route. */
  toilets?: { lon: number; lat: number; public: boolean }[];
  onMapClick: (lon: number, lat: number) => void;
  /** Live (or preview) position while navigating; the map follows it. */
  me?: { lon: number; lat: number; accuracyM: number } | null;
  /** City basemap (Protomaps extract) and the bundled glyphs it labels with. */
  basemap?: { url: string; key: string; glyphs: string; center: [number, number] } | null;
  /** What's in the way when nothing fits, marked in red. */
  blockers?: { lon: number; lat: number }[];
  /** A route on offer but not chosen (as close as you can get), drawn faint. */
  preview?: Pick<PlannedRoute, "coords" | "bands" | "rides"> | null;
  /** Centre here (the locate button); `n` changes to re-centre on the same spot. */
  focus?: { lon: number; lat: number; n: number } | null;
  /** The high-contrast map (SMALL-05): plain ground, edged roads, a wider route with an ink edge. */
  highContrast?: boolean;
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (coords: [number, number][], props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "LineString", coordinates: coords },
});
const point = (p: { lon: number; lat: number }, props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Point", coordinates: [p.lon, p.lat] },
});

/**
 * Our own footway graph and routes, drawn over a Protomaps base map (D-024).
 * Colours come from the page's CSS tokens and follow theme changes live.
 * The high-contrast map (SMALL-05) swaps the base map palette and widens the route.
 */
export function MapView({ network, routes, selectedId, from, to, pin, showSlopes, entrances, onMapClick, me, basemap, toilets = [], blockers = [], preview = null, focus = null, highContrast = false }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  /** Draws our layers from the latest props; called again once the map loads and on a theme change. */
  const redraw = useRef<() => void>(() => undefined);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    registerProtocols(basemap?.glyphs ?? "fonts/glyphs.json");
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, glyphs: GLYPHS, sources: {}, layers: [{ id: "ground", type: "background", paint: { "background-color": css("--ground") } }] },
      center: [-3.1885, 55.9455],
      zoom: 14,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false,
    });
    map.current = m;
    m.on("load", () => {
      const empty = fc([]);
      for (const id of ["network", "route-alt", "route", "bands", "unknown", "rides", "ride-labels", "toilets", "markers", "entrances", "blockers", "me"]) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({ id: "network", type: "line", source: "network", paint: { "line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 17, 3.5], "line-opacity": 0.9 }, layout: { "line-cap": "round" } });
      m.addLayer({ id: "network-steps", type: "line", source: "network", filter: ["==", ["get", "bin"], 5], paint: { "line-color": css("--muted"), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 6], "line-dasharray": [0.25, 0.5], "line-opacity": 0.8 } });
      m.addLayer({ id: "route-alt", type: "line", source: "route-alt", paint: { "line-color": css("--route-alt"), "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": css("--surface"), "line-width": 12 }, layout: { "line-cap": "round", "line-join": "round" } });
      // The chosen route coloured by slope, the same bands as the route strip. Not-known ground is dashed, steps dotted.
      m.addLayer({ id: "route", type: "line", source: "bands", filter: ["!", ["in", ["get", "bin"], ["literal", [-1, 5]]]], paint: { "line-color": ["get", "c"], "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route-unknown", type: "line", source: "bands", filter: ["==", ["get", "bin"], -1], paint: { "line-color": css("--unknown"), "line-width": 7, "line-dasharray": [0.6, 0.8] } });
      m.addLayer({ id: "route-steps", type: "line", source: "bands", filter: ["==", ["get", "bin"], 5], paint: { "line-color": css("--stop"), "line-width": 7, "line-dasharray": [0.3, 0.5] } });
      // Unknown stretches: same colour, broken line, so it reads without colour.
      m.addLayer({ id: "unknown", type: "line", source: "unknown", paint: { "line-color": css("--surface"), "line-width": 3, "line-dasharray": [1, 1.5] } });
      // Rides: a dotted line over the route (you're carried, not walking), with the route number where you board.
      m.addLayer({ id: "ride-casing", type: "line", source: "rides", paint: { "line-color": css("--surface"), "line-width": 9 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "ride", type: "line", source: "rides", paint: { "line-color": css("--route"), "line-width": 5, "line-dasharray": [0.1, 1.8] }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({
        id: "ride-labels",
        type: "symbol",
        source: "ride-labels",
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 14, "text-offset": [0, -1.4], "text-allow-overlap": true },
        paint: { "text-color": css("--surface"), "text-halo-color": css("--route"), "text-halo-width": 6 },
      });
      // Accessible toilets near the route: a labelled dot, so it reads without colour.
      m.addLayer({
        id: "toilets",
        type: "symbol",
        source: "toilets",
        layout: { "text-field": "WC", "text-font": ["Noto Sans Medium"], "text-size": 11, "text-allow-overlap": true },
        paint: { "text-color": css("--surface"), "text-halo-color": css("--ink"), "text-halo-width": 5 },
      });
      m.addLayer({ id: "entrances", type: "circle", source: "entrances", paint: { "circle-radius": 7, "circle-color": ["get", "c"], "circle-stroke-color": css("--surface"), "circle-stroke-width": 2 } });
      m.addLayer({ id: "blockers", type: "circle", source: "blockers", paint: { "circle-radius": 11, "circle-color": css("--stop"), "circle-stroke-color": css("--surface"), "circle-stroke-width": 3 } });
      m.addLayer({ id: "markers", type: "circle", source: "markers", paint: { "circle-radius": ["match", ["get", "end"], 1, 11, 2, 10, 8], "circle-color": ["match", ["get", "end"], 1, css("--stop"), 2, css("--surface"), css("--ink")], "circle-stroke-color": ["match", ["get", "end"], 2, css("--accent"), css("--surface")], "circle-stroke-width": ["match", ["get", "end"], 2, 4, 3] } });
      // Location: accuracy halo (metres to pixels at this latitude) and a dot.
      m.addLayer({ id: "me-halo", type: "circle", source: "me", paint: { "circle-color": css("--accent"), "circle-opacity": 0.15, "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", "acc"], 150], 20, ["*", ["get", "acc"], 6.6]] } });
      m.addLayer({ id: "me", type: "circle", source: "me", paint: { "circle-radius": 9, "circle-color": css("--accent"), "circle-stroke-color": css("--surface"), "circle-stroke-width": 3 } });
      ready.current = true;
      setMapReady(true);
      redraw.current();
    });
    m.on("click", (e) => clickRef.current(e.lngLat.lng, e.lngLat.lat));
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      if (!ready.current) return;
      const neutral = css("--muted");
      const ramp = ["--g0", "--g1", "--g2", "--g3", "--g4"].map(css);
      (m.getSource("network") as GeoJSONSource).setData(
        fc((network ?? []).map((n) => line(n.coords, { bin: n.bin, c: showSlopes && n.bin >= 0 && n.bin < 5 ? ramp[n.bin] : n.bin === -1 && showSlopes ? css("--unknown") : neutral }))),
      );
      m.setPaintProperty("network", "line-opacity", showSlopes ? 0.9 : highContrast ? 0.5 : 0.22);
      const sel = routes.find((r) => r.id === selectedId) ?? routes[0];
      (m.getSource("route") as GeoJSONSource).setData(fc(sel ? [line(sel.coords)] : preview ? [line(preview.coords)] : []));
      const bandColour = (bin: number) => (bin >= 0 && bin < 5 ? ramp[bin]! : bin === 6 ? css("--accent") : css("--unknown"));
      (m.getSource("bands") as GeoJSONSource).setData(fc((sel ?? preview)?.bands.map((b) => line(b.coords, { bin: b.bin, c: bandColour(b.bin) })) ?? []));
      (m.getSource("route-alt") as GeoJSONSource).setData(fc(routes.filter((r) => r !== sel).map((r) => line(r.coords))));
      (m.getSource("blockers") as GeoJSONSource).setData(fc(blockers.map((b) => point(b))));
      (m.getSource("unknown") as GeoJSONSource).setData(fc(sel ? sel.unknownCoords.map((c) => line(c)) : []));
      (m.getSource("toilets") as GeoJSONSource).setData(fc(toilets.map((t) => point(t))));
      (m.getSource("rides") as GeoJSONSource).setData(fc((sel ?? preview)?.rides.map((r) => line(r.coords)) ?? []));
      (m.getSource("ride-labels") as GeoJSONSource).setData(fc((sel ?? preview)?.rides.map((r) => point({ lon: r.coords[0]![0], lat: r.coords[0]![1] }, { label: r.label })) ?? []));
      (m.getSource("markers") as GeoJSONSource).setData(fc([...(from ? [point(from, { end: 0 })] : []), ...(to ? [point(to, { end: 1 })] : []), ...(pin ? [point(pin, { end: 2 })] : [])]));
      const ec = { yes: css("--ok"), unknown: css("--unknown"), no: css("--stop") };
      (m.getSource("entrances") as GeoJSONSource).setData(fc(entrances.map((e) => point(e, { c: ec[e.ok] }))));
    };
    draw();
    redraw.current = draw;
  }, [network, routes, selectedId, from, to, pin, showSlopes, entrances, toilets, blockers, preview, highContrast]);

  const [mapReady, setMapReady] = useState(false);
  const dark = useDark();

  // Theme change while open: our own layers take their colours from CSS tokens, so read them again.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    m.setPaintProperty("ground", "background-color", highContrast ? (dark ? "#000000" : "#ffffff") : css("--ground"));
    m.setPaintProperty("network-steps", "line-color", css("--muted"));
    m.setPaintProperty("route-alt", "line-color", css("--route-alt"));
    m.setPaintProperty("route-casing", "line-color", css(highContrast ? "--ink" : "--surface"));
    m.setPaintProperty("route-casing", "line-width", highContrast ? 15 : 12);
    for (const id of ["route", "route-unknown", "route-steps"]) m.setPaintProperty(id, "line-width", highContrast ? 9 : 7);
    m.setPaintProperty("route-unknown", "line-color", css("--unknown"));
    m.setPaintProperty("route-steps", "line-color", css("--stop"));
    m.setPaintProperty("blockers", "circle-color", css("--stop"));
    m.setPaintProperty("blockers", "circle-stroke-color", css("--surface"));
    m.setPaintProperty("ride-casing", "line-color", css("--surface"));
    m.setPaintProperty("ride", "line-color", css("--route"));
    m.setPaintProperty("ride-labels", "text-color", css("--surface"));
    m.setPaintProperty("toilets", "text-color", css("--surface"));
    m.setPaintProperty("toilets", "text-halo-color", css("--ink"));
    m.setPaintProperty("ride-labels", "text-halo-color", css("--route"));
    m.setPaintProperty("unknown", "line-color", css("--surface"));
    m.setPaintProperty("entrances", "circle-stroke-color", css("--surface"));
    m.setPaintProperty("markers", "circle-color", ["match", ["get", "end"], 1, css("--stop"), 2, css("--surface"), css("--ink")]);
    m.setPaintProperty("markers", "circle-stroke-color", ["match", ["get", "end"], 2, css("--accent"), css("--surface")]);
    m.setPaintProperty("me-halo", "circle-color", css("--accent"));
    m.setPaintProperty("me", "circle-color", css("--accent"));
    m.setPaintProperty("me", "circle-stroke-color", css("--surface"));
    redraw.current();
  }, [dark, mapReady, highContrast]);

  // Base map: swap in the city's extract under our own layers (and restyle it when the theme changes).
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !basemap) return;
    let cancelled = false;
    loadBasemap(basemap.url, basemap.key)
      .then((url) => {
        if (cancelled) return;
        for (const l of m.getStyle().layers ?? []) if ((l as { source?: string }).source === "basemap") m.removeLayer(l.id);
        if (m.getSource("basemap")) m.removeSource("basemap");
        m.addSource("basemap", { type: "vector", url, attribution: "© OpenStreetMap contributors, Protomaps" });
        for (const l of basemapLayers(dark, highContrast)) if (l.type !== "background") m.addLayer(l, "network");
        if (shownKey.current !== basemap.key) m.jumpTo({ center: basemap.center, zoom: 14 });
        shownKey.current = basemap.key;
      })
      .catch(() => {
        /* No basemap: the footway network still draws the map. */
      });
    return () => {
      cancelled = true;
    };
  }, [basemap, mapReady, dark, highContrast]);

  // Position and follow mode.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("me") as GeoJSONSource | undefined)?.setData(fc(me ? [point(me, { acc: me.accuracyM })] : []));
    if (me) m.easeTo({ center: [me.lon, me.lat], zoom: Math.max(m.getZoom(), 17), padding: { top: 0, bottom: Math.round(window.innerHeight * 0.35), left: 0, right: 0 }, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400 });
  }, [me]);

  // The locate button: centre on you, above the sheet.
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.easeTo({ center: [focus.lon, focus.lat], zoom: Math.max(m.getZoom(), 16), padding: window.innerWidth >= 768 ? { top: 0, bottom: 0, left: 450, right: 0 } : { top: 0, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 }, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500 });
  }, [focus]);

  // Frame the selected route above the sheet.
  useEffect(() => {
    const m = map.current;
    const sel = routes.find((r) => r.id === selectedId) ?? routes[0];
    // Nothing fits: frame what's on offer and what's in the way.
    const coords: [number, number][] = sel ? sel.coords : [...(preview?.coords ?? []), ...blockers.map((x): [number, number] => [x.lon, x.lat]), ...(to ? [[to.lon, to.lat] as [number, number]] : [])];
    if (!m || coords.length < 2) return;
    const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    const wide = window.innerWidth >= 768;
    m.fitBounds(b, { padding: wide ? { top: 80, bottom: 60, left: 470, right: 80 } : { top: 80, bottom: Math.round(window.innerHeight * 0.52), left: 30, right: 70 }, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600, maxZoom: 17 });
  }, [routes, selectedId, preview, blockers]); // eslint-disable-line react-hooks/exhaustive-deps

  // MapLibre sets position: relative on its container, so the sizing lives on a wrapper.
  return (
    <div className="absolute inset-0" role="region" aria-label="Map. The route is also listed step by step in the panel.">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}

/** Dark mode as the page shows it: the system setting unless the page forces a theme. */
function useDark(): boolean {
  const read = () => {
    if (typeof document === "undefined") return false;
    const forced = document.documentElement.dataset.theme;
    return forced ? forced === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const update = () => setDark(read());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    update();
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return dark;
}
