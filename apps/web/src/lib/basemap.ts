/**
 * Base map: a Protomaps vector extract per city (scripts/basemap-extract.py),
 * read in byte ranges so the map draws before the whole file has arrived, then
 * filled in whole in the background so it works offline (D-079). Styled with
 * Causewayside's own palette. Fonts are bundled glyphs.
 * Map data © OpenStreetMap contributors; schema and layer logic Protomaps (BSD-3).
 */
import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import * as maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { RangeSource } from "./basemap-source";
import { HIGH_CONTRAST } from "./map-contrast";

/** Recolour a Protomaps flavour to our tokens: warm-neutral ground, soft water, quiet roads, ink labels. */
function causewaysideFlavor(dark: boolean, highContrast: boolean): Flavor {
  const base = namedFlavor(dark ? "dark" : "light");
  const c = highContrast
    ? HIGH_CONTRAST[dark ? "dark" : "light"]
    : dark
    ? { ground: "#141816", earth: "#181c1a", park: "#1d2a22", water: "#16222c", building: "#222825", road: "#2b322e", roadCasing: "#141816", label: "#c9cfc8", labelHalo: "#141816", minor: "#262c29", rail: "#3a423d" }
    : { ground: "#e8ebe5", earth: "#eceee8", park: "#d7e3d2", water: "#c8d8e2", building: "#dcdfd8", road: "#fbfbf8", roadCasing: "#d2d8d0", label: "#3d4540", labelHalo: "#f4f5f1", minor: "#f4f5f1", rail: "#b9c0ba" };
  return {
    ...base,
    background: c.ground,
    earth: c.earth,
    park_a: c.park,
    park_b: c.park,
    wood_a: c.park,
    wood_b: c.park,
    scrub_a: c.park,
    scrub_b: c.park,
    zoo: c.park,
    water: c.water,
    buildings: c.building,
    pedestrian: c.earth,
    minor_a: c.minor,
    minor_b: c.minor,
    minor_service: c.minor,
    other: c.minor,
    link: c.road,
    major: c.road,
    highway: c.road,
    minor_casing: c.roadCasing,
    minor_service_casing: c.roadCasing,
    link_casing: c.roadCasing,
    major_casing_early: c.roadCasing,
    major_casing_late: c.roadCasing,
    highway_casing_early: c.roadCasing,
    highway_casing_late: c.roadCasing,
    railway: c.rail,
    roads_label_minor: c.label,
    roads_label_minor_halo: c.labelHalo,
    roads_label_major: c.label,
    roads_label_major_halo: c.labelHalo,
    subplace_label: c.label,
    subplace_label_halo: c.labelHalo,
    city_label: c.label,
    city_label_halo: c.labelHalo,
    ocean_label: c.label,
    address_label: c.label,
    address_label_halo: c.labelHalo,
  };
}

/** Basemap layers (no POI icons: we draw our own access layers instead). */
export function basemapLayers(dark: boolean, highContrast = false): LayerSpecification[] {
  return (layers("basemap", causewaysideFlavor(dark, highContrast), { lang: "en" }) as LayerSpecification[]).filter((l) => l.id !== "pois");
}

const protocol = new Protocol();
let registered = false;
let glyphs: Promise<Record<string, string>> | null = null;

const b64ToBuf = (b64: string) => Uint8Array.from(atob(b64.trim()), (ch) => ch.charCodeAt(0)).buffer;

/** Point MapLibre at its worker, and register the pmtiles:// and glyphs:// protocols, once. */
export function registerProtocols(glyphsUrl: string) {
  if (registered) return;
  registered = true;
  // MapLibre 6's worker is a module file copied into public/ by scripts/copy-graphs.mjs (SEC-04).
  maplibregl.setWorkerUrl(new URL(`maplibre/${maplibregl.getVersion()}/maplibre-gl-worker.mjs`, document.baseURI).href);
  maplibregl.addProtocol("pmtiles", protocol.tile);
  maplibregl.addProtocol("causeway-glyphs", async (params) => {
    glyphs ??= fetch(glyphsUrl).then((r) => r.json());
    const key = decodeURIComponent(params.url.replace("causeway-glyphs://", "")).replace(/\.pbf$/, "");
    const b64 = (await glyphs)[key];
    // A missing range (rare scripts) renders those characters blank rather than failing the map.
    return { data: b64 ? b64ToBuf(b64) : new ArrayBuffer(0) };
  });
}

const sources = new Map<string, RangeSource>();

/**
 * Make a city's basemap available as pmtiles://<key>, reading it in ranges (D-079). Resolves
 * once its header has arrived, so a missing file still fails here. On hosts that won't serve
 * binary the file is base64 text, which can only be fetched whole.
 */
export async function loadBasemap(url: string, key: string): Promise<string> {
  let source = sources.get(key);
  if (!source) {
    if (url.endsWith(".b64.txt")) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`basemap: HTTP ${res.status}`);
      source = new RangeSource(url, key, b64ToBuf(await res.text()));
    } else source = new RangeSource(url, key);
    const pm = new PMTiles(source);
    await pm.getHeader();
    sources.set(key, source);
    protocol.add(pm);
  }
  return `pmtiles://${key}`;
}

/** Fetch the rest of a city's basemap in the background, once the map in view has drawn, so it works offline. */
export function fillBasemap(key: string) {
  sources.get(key)?.fill().catch(() => {
    /* Tried again next time the map settles; the ranges already read keep working. */
  });
}

export const GLYPHS = "causeway-glyphs://{fontstack}/{range}.pbf";
