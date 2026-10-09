"use client";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type * as GeoJSON from "geojson";
import { useEffect, useRef, useState } from "react";
import { basemapLayers, fillBasemap, GLYPHS, loadBasemap, registerProtocols } from "@/lib/basemap";
import type { MapKerb, MapLayers } from "@/lib/map-layers";
import type { NetworkLine, Place, PlannedRoute } from "@/lib/plan-types";

interface Props {
  network: NetworkLine[] | null;
  routes: PlannedRoute[];
  selectedId: string | null;
  from: Place | null;
  to: Place | null;
  /** A proposed destination awaiting confirmation. */
  pin: Place | null;
  /** What the layers menu has switched on (FEAT-49). */
  layers: MapLayers;
  /** Kerbs mapped at crossings, for the kerbs layer. */
  kerbs?: MapKerb[];
  /** Accessible toilets across the city and benches, for their layers. */
  cityToilets?: { lon: number; lat: number }[];
  benches?: [number, number][];
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
  /** Saved places (FEAT-04) drawn as labelled buttons (SMALL-13): reachable by keyboard and screen reader, unlike a canvas layer. */
  saved?: { id: string; label: string; lon: number; lat: number }[];
  onSavedPick?: (id: string) => void;
  /** Community reports (FEAT-35) shown as buttons, like saved places: reachable by keyboard and screen reader. */
  community?: { id: string; label: string; polarity: "good" | "bad"; level: string; lon: number; lat: number }[];
  onCommunityPick?: (id: string) => void;
  /** A new report's pin while it's being placed: drag it, tap the map, or move it with the arrow keys. */
  draft?: { lon: number; lat: number } | null;
  onDraftMove?: (lon: number, lat: number) => void;
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

/** The bench icon, drawn in the theme's colours: a square with a seat and legs. Redrawn when the theme changes. */
function addBenchIcon(m: MLMap) {
  const px = 2;
  const size = 18 * px;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = css("--surface");
  g.strokeStyle = css("--ink");
  g.lineWidth = 2 * px;
  g.beginPath();
  g.roundRect(px, px, size - 2 * px, size - 2 * px, 3 * px);
  g.fill();
  g.stroke();
  g.fillStyle = css("--ink");
  g.fillRect(4 * px, 7 * px, 10 * px, 2.5 * px);
  g.fillRect(5 * px, 9 * px, 1.8 * px, 4 * px);
  g.fillRect(11.2 * px, 9 * px, 1.8 * px, 4 * px);
  const img = g.getImageData(0, 0, size, size);
  if (m.hasImage("bench")) m.updateImage("bench", img);
  else m.addImage("bench", img, { pixelRatio: px });
}

/**
 * Our own footway graph and routes, drawn over a Protomaps base map (D-024).
 * Colours come from the page's CSS tokens and follow theme changes live.
 * The high-contrast map (SMALL-05) swaps the base map palette and widens the route.
 */
export function MapView({ network, routes, selectedId, from, to, pin, layers, kerbs = [], cityToilets = [], benches = [], entrances, onMapClick, me, basemap, toilets = [], blockers = [], preview = null, focus = null, highContrast = false, saved = [], onSavedPick, community = [], onCommunityPick, draft = null, onDraftMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  /**
   * Draw our layers from the latest props; called again once the map loads and on a theme change. The city's
   * network is drawn on its own: it is large, and sending it to MapLibre again on every route took seconds on a
   * slow phone (SPEED-10).
   */
  const drawNetwork = useRef<() => void>(() => undefined);
  const drawRoutes = useRef<() => void>(() => undefined);
  const redraw = useRef(() => {
    drawNetwork.current();
    drawRoutes.current();
  });
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const savedPickRef = useRef(onSavedPick);
  savedPickRef.current = onSavedPick;
  const communityPickRef = useRef(onCommunityPick);
  communityPickRef.current = onCommunityPick;
  const draftMoveRef = useRef(onDraftMove);
  draftMoveRef.current = onDraftMove;
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  // SMALL-20: true while nothing else has framed the map, so saved places may.
  const homeRef = useRef(true);
  homeRef.current = !routes.length && !to && !pin && !me && !focus;
  const fitSaved = useRef<() => void>(() => {});

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
      for (const id of ["network", "route-alt", "route", "bands", "unknown", "rides", "ride-labels", "toilets", "markers", "entrances", "blockers", "me", "kerbs", "city-toilets", "benches"]) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({ id: "network", type: "line", source: "network", paint: { "line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 17, 3.5], "line-opacity": 0.9 }, layout: { "line-cap": "round" } });
      // FEAT-49: each layer has its own shape, so none relies on colour. Rough ground is a wide dash, a narrow path a pair of close lines, steps dots.
      const z = (lo: number, hi: number) => ["interpolate", ["linear"], ["zoom"], 12, lo, 17, hi] as maplibregl.ExpressionSpecification;
      m.addLayer({ id: "network-rough", type: "line", source: "network", filter: ["==", ["get", "r"], true], paint: { "line-color": css("--ink"), "line-width": z(2, 9), "line-dasharray": [1.2, 0.8], "line-opacity": 0.3 } });
      m.addLayer({ id: "network-narrow", type: "line", source: "network", minzoom: 15, filter: ["==", ["get", "n"], true], paint: { "line-color": css("--ink"), "line-width": ["interpolate", ["linear"], ["zoom"], 15, 1.2, 17, 1.8], "line-gap-width": ["interpolate", ["linear"], ["zoom"], 15, 3, 17, 6], "line-opacity": 0.85 } });
      m.addLayer({ id: "network-steps", type: "line", source: "network", filter: ["==", ["get", "bin"], 5], paint: { "line-color": css("--muted"), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 6], "line-dasharray": [0.25, 0.5], "line-opacity": 0.8 } });
      // Kerbs only from street level: across the city they'd be a rash of dots. Dropped is a small filled dot, raised a ring.
      m.addLayer({ id: "kerbs-dropped", type: "circle", source: "kerbs", minzoom: 15, filter: ["!", ["get", "raised"]], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 19, 5], "circle-color": css("--ok"), "circle-stroke-color": css("--surface"), "circle-stroke-width": 1.5 } });
      m.addLayer({ id: "kerbs-raised", type: "circle", source: "kerbs", minzoom: 15, filter: ["get", "raised"], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 4, 19, 7], "circle-color": css("--surface"), "circle-stroke-color": css("--stop"), "circle-stroke-width": 3 } });
      // Benches: a square seat, so they don't read as kerbs. Accessible toilets: "WC", as on a route, but not piled on each other; on a route only the route's own show.
      addBenchIcon(m);
      m.addLayer({ id: "benches", type: "symbol", source: "benches", minzoom: 15, layout: { "icon-image": "bench", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.7, 19, 1.1] } });
      m.addLayer({ id: "city-toilets", type: "symbol", source: "city-toilets", minzoom: 13, layout: { "text-field": "WC", "text-font": ["Noto Sans Medium"], "text-size": 11 }, paint: { "text-color": css("--surface"), "text-halo-color": css("--ink"), "text-halo-width": 5 } });
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
        fc((network ?? []).map((n) => line(n.coords, { bin: n.bin, r: n.r, n: n.n, c: layers.slopes && n.bin >= 0 && n.bin < 5 ? ramp[n.bin] : n.bin === -1 && layers.slopes ? css("--unknown") : neutral }))),
      );
      (m.getSource("kerbs") as GeoJSONSource).setData(fc(kerbs.map((k) => point(k, { raised: k.raised }))));
      (m.getSource("benches") as GeoJSONSource).setData(fc(benches.map(([lon, lat]) => point({ lon, lat }))));
      (m.getSource("city-toilets") as GeoJSONSource).setData(fc(cityToilets.map((t) => point(t))));
      m.setPaintProperty("network", "line-opacity", layers.slopes ? 0.9 : highContrast ? 0.5 : 0.22);
      const show = (on: boolean) => (on ? "visible" : "none");
      m.setLayoutProperty("network-steps", "visibility", show(layers.steps));
      m.setLayoutProperty("network-rough", "visibility", show(layers.rough));
      m.setLayoutProperty("network-narrow", "visibility", show(layers.narrow));
      for (const id of ["kerbs-dropped", "kerbs-raised"]) m.setLayoutProperty(id, "visibility", show(layers.kerbs));
      m.setLayoutProperty("benches", "visibility", show(layers.benches));
      m.setLayoutProperty("city-toilets", "visibility", show(layers.toilets));
    };
    draw();
    drawNetwork.current = draw;
  }, [network, kerbs, benches, cityToilets, layers, highContrast]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      if (!ready.current) return;
      const ramp = ["--g0", "--g1", "--g2", "--g3", "--g4"].map(css);
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
    drawRoutes.current = draw;
  }, [routes, selectedId, from, to, pin, entrances, toilets, blockers, preview, highContrast]);

  const [mapReady, setMapReady] = useState(false);
  const dark = useDark();

  // Saved places (SMALL-13): real buttons, so Tab reaches them and a screen reader reads "Home, saved place".
  // The label is always shown and edged in ink on the surface colour, so it reads in light, dark and high contrast without colour.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    const markers = saved.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = `saved-marker-${s.id}`;
      b.setAttribute("aria-label", `${s.label}, saved place`);
      b.setAttribute("aria-haspopup", "dialog");
      b.className = "saved-marker";
      const pill = document.createElement("span");
      pill.className = "saved-marker-pill";
      pill.setAttribute("aria-hidden", "true");
      pill.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6.2 6.6.7-4.9 4.5 1.4 6.6L12 17.2 6 20.5l1.4-6.6L2.5 9.4l6.6-.7z"/></svg>';
      const text = document.createElement("span");
      text.className = "saved-marker-text";
      text.textContent = s.label;
      pill.append(text);
      const stem = document.createElement("span");
      stem.className = "saved-marker-stem";
      stem.setAttribute("aria-hidden", "true");
      b.append(pill, stem);
      // A tap on a marker is not a tap on the map: no pin is dropped.
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        savedPickRef.current?.(s.id);
      });
      return new maplibregl.Marker({ element: b, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(m);
    });
    // SMALL-20: on a phone the half-open sheet covers the lower half, so a marker under it can't be tapped.
    // Bring them all above it. Zoom out at most two steps, never in, and no animation if motion is reduced.
    fitSaved.current = () => {
      if (!saved.length || !homeRef.current || window.innerWidth >= 768) return;
      const room = Math.round(window.innerHeight * 0.52);
      const hidden = saved.some((s) => {
        const p = m.project([s.lon, s.lat]);
        return p.x < 20 || p.x > window.innerWidth - 20 || p.y < 60 || p.y > window.innerHeight - room;
      });
      if (!hidden) return;
      const b = saved.reduce((bb, s) => bb.extend([s.lon, s.lat]), new maplibregl.LngLatBounds([saved[0].lon, saved[0].lat], [saved[0].lon, saved[0].lat]));
      const cam = m.cameraForBounds(b, { padding: { top: 80, bottom: room + 20, left: 40, right: 40 }, maxZoom: m.getZoom() });
      if (cam?.center) m.easeTo({ center: cam.center, zoom: Math.max(cam.zoom ?? m.getZoom(), m.getZoom() - 2), duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500 });
    };
    fitSaved.current();
    return () => markers.forEach((mk) => mk.remove());
  }, [saved, mapReady]);

  // Community reports (FEAT-35): a triangle with "!" for a problem, a circle with a tick for something good, so the shape
  // says it without colour. Unconfirmed ones are drawn dashed. Each is a real button that opens the report.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    const markers = community.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = `community-marker-${c.id}`;
      b.setAttribute("aria-label", `${c.label}, ${c.polarity === "bad" ? "a problem" : "good for access"}, ${c.level.toLowerCase()}. Community report`);
      b.setAttribute("aria-haspopup", "dialog");
      b.dataset.polarity = c.polarity;
      b.dataset.level = c.level === "Confirmed" ? "confirmed" : "other";
      b.className = "community-marker";
      b.innerHTML =
        c.polarity === "bad"
          ? '<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26"><path d="M12 2.5 22.5 21h-21z" fill="var(--stop)" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" stroke="var(--stop-ink, #fff)" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.4" fill="var(--stop-ink, #fff)"/></svg>'
          : '<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10" fill="var(--ok)" stroke="var(--surface)" stroke-width="2"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="var(--surface)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        communityPickRef.current?.(c.id);
      });
      return new maplibregl.Marker({ element: b }).setLngLat([c.lon, c.lat]).addTo(m);
    });
    return () => markers.forEach((mk) => mk.remove());
  }, [community, mapReady]);

  // The new report's pin: draggable with a finger or mouse, and with the arrow keys (about 2 m a press, 10 m with Shift).
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    if (!draft) {
      draftMarker.current?.remove();
      draftMarker.current = null;
      return;
    }
    if (!draftMarker.current) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "community-draft-pin";
      b.className = "draft-pin";
      b.setAttribute("aria-label", "Report pin. Drag it, or use the arrow keys to move it");
      b.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 32" width="36" height="48"><path d="M12 31s10-11.6 10-19a10 10 0 0 0-20 0c0 7.4 10 19 10 19z" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="var(--surface)"/></svg>';
      const mk = new maplibregl.Marker({ element: b, anchor: "bottom", draggable: true }).setLngLat([draft.lon, draft.lat]).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLngLat();
        draftMoveRef.current?.(p.lng, p.lat);
      });
      b.addEventListener("click", (e) => e.stopPropagation());
      b.addEventListener("keydown", (e) => {
        const step = (e.shiftKey ? 10 : 2) / 111_320;
        const p = mk.getLngLat();
        const k = Math.cos((p.lat * Math.PI) / 180);
        const d = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step / k, 0], ArrowRight: [step / k, 0] }[e.key];
        if (!d) return;
        e.preventDefault();
        draftMoveRef.current?.(p.lng + d[0]!, p.lat + d[1]!);
      });
      draftMarker.current = mk;
    } else draftMarker.current.setLngLat([draft.lon, draft.lat]);
    // Keep the pin in view as it moves.
    if (!m.getBounds().contains([draft.lon, draft.lat])) m.easeTo({ center: [draft.lon, draft.lat], duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  }, [draft, mapReady]);

  // Theme change while open: our own layers take their colours from CSS tokens, so read them again.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    m.setPaintProperty("ground", "background-color", highContrast ? (dark ? "#000000" : "#ffffff") : css("--ground"));
    m.setPaintProperty("network-steps", "line-color", css("--muted"));
    for (const id of ["network-rough", "network-narrow"]) m.setPaintProperty(id, "line-color", css("--ink"));
    m.setPaintProperty("kerbs-dropped", "circle-color", css("--ok"));
    m.setPaintProperty("kerbs-dropped", "circle-stroke-color", css("--surface"));
    m.setPaintProperty("kerbs-raised", "circle-color", css("--surface"));
    m.setPaintProperty("kerbs-raised", "circle-stroke-color", css("--stop"));
    m.setPaintProperty("city-toilets", "text-color", css("--surface"));
    m.setPaintProperty("city-toilets", "text-halo-color", css("--ink"));
    addBenchIcon(m);
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
        if (shownKey.current !== basemap.key) {
          m.jumpTo({ center: basemap.center, zoom: 14 });
          fitSaved.current();
        }
        shownKey.current = basemap.key;
        // Once the tiles in view have drawn, fetch the rest of the file for offline (D-079).
        m.once("idle", () => fillBasemap(basemap.key));
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
