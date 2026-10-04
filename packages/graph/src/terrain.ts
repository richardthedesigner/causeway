/**
 * Terrain enrichment: incline and cross-slope from a high-resolution DTM,
 * sampled along the footway line itself (not the road centreline).
 *
 * Bridges, tunnels, indoor and non-ground-level edges never sample the DTM:
 * a bare-earth model under North Bridge gives you Waverley's tracks, not the
 * deck. Those edges interpolate between their endpoint elevations and are
 * marked inferred with a lower-confidence method string.
 */
import { fromArrayBuffer, fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";
import { attr, unknownAttr, type SourceId } from "./attribute.js";
import type { Graph, GraphEdge, GraphNode } from "./schema.js";

export interface Dtm {
  /** Elevation in metres at OSGB easting/northing, or null outside coverage / nodata. */
  sample(e: number, n: number): number | null;
  resolution: number;
  source: SourceId;
  observedAt: string;
  label: string;
}

/**
 * Register EPSG:27700 using the OSTN15 transformation grid. The plain
 * 7-parameter Helmert transform is out by up to ~5 m, which at 0.5 m DTM
 * resolution would sample the wrong side of a retaining wall.
 */
export async function registerOsgb(ostn15Grid: ArrayBuffer): Promise<void> {
  const tiff = await fromArrayBuffer(ostn15Grid);
  // proj4 types predate GeoTIFF grid support, which returns { ready }.
  await (proj4.nadgrid("OSTN15", tiff as never) as unknown as { ready: Promise<unknown> }).ready;
  proj4.defs(
    "EPSG:27700",
    "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +units=m +nadgrids=OSTN15 +no_defs",
  );
}

export const toOsgb = (lon: number, lat: number): [number, number] =>
  proj4("EPSG:4326", "EPSG:27700", [lon, lat]) as [number, number];

/**
 * Load a window of a GeoTIFF DTM covering the given OSGB bounds. Accepts a
 * buffer or a URL; the Scottish LiDAR tiles are tiled GeoTIFFs, so a URL
 * pulls only the blocks we need over HTTP range requests.
 */
export async function loadDtmWindow(
  src: ArrayBuffer | string,
  bounds: { minE: number; minN: number; maxE: number; maxN: number },
  meta: { source: SourceId; observedAt: string; label: string },
): Promise<Dtm> {
  const tiff: GeoTIFF = typeof src === "string" ? await fromUrl(src) : await fromArrayBuffer(src);
  const img: GeoTIFFImage = await tiff.getImage();
  const [ox, oy] = img.getOrigin() as [number, number];
  const [rx, ry] = img.getResolution() as [number, number];
  const W = img.getWidth();
  const H = img.getHeight();
  const nodata = img.getGDALNoData();
  const col = (e: number) => Math.floor((e - ox) / rx);
  const row = (n: number) => Math.floor((n - oy) / ry);
  const x0 = Math.max(0, col(bounds.minE) - 2);
  const x1 = Math.min(W, col(bounds.maxE) + 2);
  const y0 = Math.max(0, row(bounds.maxN) - 2);
  const y1 = Math.min(H, row(bounds.minN) + 2);
  const [band] = (await img.readRasters({ window: [x0, y0, x1, y1] })) as unknown as Float32Array[];
  const w = x1 - x0;
  const h = y1 - y0;
  const px = (cx: number, cy: number): number | null => {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
    const v = band![cy * w + cx]!;
    if (!Number.isFinite(v) || (nodata !== null && v === nodata) || v < -100) return null;
    return v;
  };
  return {
    resolution: Math.abs(rx),
    ...meta,
    // Bilinear interpolation on pixel centres.
    sample(e, n) {
      const fx = (e - ox) / rx - 0.5 - x0;
      const fy = (n - oy) / ry - 0.5 - y0;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      const tx = fx - cx;
      const ty = fy - cy;
      const a = px(cx, cy),
        b = px(cx + 1, cy),
        c = px(cx, cy + 1),
        d = px(cx + 1, cy + 1);
      if (a === null || b === null || c === null || d === null) return a ?? b ?? c ?? d;
      return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    },
  };
}

/** Sample several DTM tiles as one surface (first tile with data wins). */
export function compositeDtm(tiles: Dtm[], label: string): Dtm {
  const first = tiles[0]!;
  return {
    resolution: first.resolution,
    source: first.source,
    observedAt: first.observedAt,
    label,
    sample(e, n) {
      for (const t of tiles) {
        const z = t.sample(e, n);
        if (z !== null) return z;
      }
      return null;
    },
  };
}

/** Edges whose walking surface is not the bare earth. */
export function offGround(e: GraphEdge): boolean {
  return (
    e.bridge ||
    e.layer !== 0 ||
    e.level !== 0 ||
    e.kind === "elevator" ||
    e.kind === "escalator" ||
    e.kind === "corridor" ||
    e.attrs.covered.value === true
  );
}

const STEP_M = 1;
const WINDOW_M = 10;
const CROSS_OFFSET_M = 1;
const SHORT_EDGE_M = 5;
const SHORT_BASELINE_M = 5;
/** Height change between 1 m samples that cannot be a walkable surface (60%). */
const JUMP_M = 0.6;
/** Beyond this the DTM is describing a structure, not a pavement. Ramps to Part M top out near 8%. */
const IMPLAUSIBLE_PCT = 35;
/** A perpendicular sample pair this far apart vertically has hit a wall or a drop. */
const CROSS_WALL_M = 0.5;

type EdgeSample =
  | "no-data"
  | "discontinuity"
  | { mean: number; max: number; cross: number | null; short: boolean };

function sampleEdge(e: GraphEdge, dtm: Dtm): EdgeSample {
  const p = densify(e);
  for (let i = 0; i < p.e.length; i++) p.z[i] = dtm.sample(p.e[i]!, p.n[i]!);
  if (p.z.some((z) => z === null)) return "no-data";
  const z = p.z as number[];
  const total = p.d[p.d.length - 1]!;
  for (let i = 1; i < z.length; i++) {
    const dd = p.d[i]! - p.d[i - 1]!;
    if (dd > 0 && Math.abs(z[i]! - z[i - 1]!) > Math.max(JUMP_M, dd * (JUMP_M / STEP_M))) return "discontinuity";
  }
  let mean: number;
  let max: number;
  const short = total < SHORT_EDGE_M;
  if (short) {
    // Over a metre or two, 5 cm of DTM noise reads as 5%. Measure across a longer baseline centred on the edge.
    const e0 = p.e[0]!, n0 = p.n[0]!, e1 = p.e[p.e.length - 1]!, n1 = p.n[p.n.length - 1]!;
    const L = Math.hypot(e1 - e0, n1 - n0);
    if (L < 0.2) return "no-data";
    const ux = (e1 - e0) / L, uy = (n1 - n0) / L;
    const me = (e0 + e1) / 2, mn = (n0 + n1) / 2;
    const h = SHORT_BASELINE_M / 2;
    const za = dtm.sample(me - ux * h, mn - uy * h);
    const zb = dtm.sample(me + ux * h, mn + uy * h);
    if (za === null || zb === null) return "no-data";
    mean = ((zb - za) / SHORT_BASELINE_M) * 100;
    max = mean;
  } else {
    mean = ((z[z.length - 1]! - z[0]!) / total) * 100;
    max = mean;
    const win = Math.min(WINDOW_M, total);
    for (let i = 0, j = 0; i < z.length; i++) {
      while (j < z.length - 1 && p.d[j]! - p.d[i]! < win) j++;
      if (p.d[j]! - p.d[i]! < win * 0.95) break;
      const g = ((z[j]! - z[i]!) / (p.d[j]! - p.d[i]!)) * 100;
      if (Math.abs(g) > Math.abs(max)) max = g;
    }
  }
  if (Math.abs(max) > IMPLAUSIBLE_PCT || Math.abs(mean) > IMPLAUSIBLE_PCT) return "discontinuity";

  const cross: number[] = [];
  let rejected = 0;
  for (let i = 1; i < z.length - 1; i += 2) {
    const dx = p.e[i + 1]! - p.e[i - 1]!;
    const dy = p.n[i + 1]! - p.n[i - 1]!;
    const L = Math.hypot(dx, dy);
    if (L === 0) continue;
    const nx = -dy / L,
      ny = dx / L;
    const l = dtm.sample(p.e[i]! + nx * CROSS_OFFSET_M, p.n[i]! + ny * CROSS_OFFSET_M);
    const r = dtm.sample(p.e[i]! - nx * CROSS_OFFSET_M, p.n[i]! - ny * CROSS_OFFSET_M);
    if (l === null || r === null) continue;
    if (Math.abs(l - r) > CROSS_WALL_M) {
      rejected++;
      continue;
    }
    cross.push((Math.abs(l - r) / (2 * CROSS_OFFSET_M)) * 100);
  }
  let crossP75: number | null = null;
  if (cross.length && rejected <= cross.length) {
    cross.sort((a, b) => a - b);
    // 75th percentile: sustained camber matters more than one noisy sample.
    crossP75 = cross[Math.floor(cross.length * 0.75)]!;
  }
  return { mean, max, cross: crossP75, short };
}

interface Profile {
  /** distance along edge, metres */
  d: number[];
  z: (number | null)[];
  e: number[];
  n: number[];
}

function densify(e: GraphEdge): Profile {
  const pts = e.geometry.map(([lon, lat]) => toOsgb(lon, lat));
  const out: Profile = { d: [], z: [], e: [], n: [] };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / STEP_M));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.e.push(ax + (bx - ax) * t);
      out.n.push(ay + (by - ay) * t);
      out.d.push(acc + len * t);
      out.z.push(null);
    }
    acc += len;
  }
  const last = pts[pts.length - 1]!;
  out.e.push(last[0]);
  out.n.push(last[1]);
  out.d.push(acc);
  out.z.push(null);
  return out;
}

/**
 * Enrich every node with a DTM elevation and every ground-level edge with
 * incline, steepest-window incline and cross-slope. OSM incline tags, where
 * present, are kept alongside: the router prefers the higher-confidence one,
 * and Phase 1 uses disagreements as a validation signal.
 */
export interface InclineCheck {
  edgeId: number;
  name: string | null;
  osm: number;
  lidarMean: number;
  lidarMax: number;
  lengthM: number;
}

export interface TerrainStats {
  sampledEdges: number;
  offGroundEdges: number;
  discontinuities: number;
  /** Edges that carried an OSM incline tag, against what the DTM says. Phase 1 validation signal. */
  inclineChecks: InclineCheck[];
}

export function enrichWithTerrain(g: Graph, dtm: Dtm): TerrainStats {
  const observedAt = dtm.observedAt;
  const method = `${dtm.label}, ${dtm.resolution} m DTM, ${STEP_M} m spacing`;
  const nodeById = new Map<number, GraphNode>(g.nodes.map((n) => [n.id, n]));

  // Nodes: ground-level nodes take the DTM directly.
  const groundNodes = new Set<number>();
  for (const e of g.edges) {
    // Steps are excluded: the top of a stair down from a bridge deck is not on the ground.
    if (!offGround(e) && e.kind !== "steps") {
      groundNodes.add(e.from);
      groundNodes.add(e.to);
    }
  }
  for (const n of g.nodes) {
    if (!groundNodes.has(n.id)) continue;
    const [E, N] = toOsgb(n.lon, n.lat);
    const z = dtm.sample(E, N);
    if (z !== null) n.ele = attr(round(z, 2), "inferred", dtm.source, observedAt, method);
  }

  let sampledEdges = 0;
  let offGroundEdges = 0;
  let discontinuities = 0;
  const inclineChecks: InclineCheck[] = [];
  for (const e of g.edges) {
    if (e.lengthM < 0.5) continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (offGround(e)) {
      offGroundEdges++;
      if (e.kind === "elevator" || e.kind === "steps" || e.kind === "escalator") continue;
      // Interpolate between abutments when both ends are known.
      if (from?.ele.value != null && to?.ele.value != null && e.lengthM > 2) {
        const g = ((to.ele.value - from.ele.value) / e.lengthM) * 100;
        if (e.attrs.incline.state === "unknown" && Math.abs(g) <= IMPLAUSIBLE_PCT) {
          e.attrs.incline = attr(round(g, 1), "inferred", "derived", observedAt, "interpolated between endpoint elevations (off-ground edge)");
          e.attrs.inclineMax = attr(round(g, 1), "inferred", "derived", observedAt, "interpolated; true maximum unknown");
        }
      }
      continue;
    }
    if (e.kind === "steps") continue;
    const r = sampleEdge(e, dtm);
    if (r === "no-data") continue;
    if (r === "discontinuity") {
      // A wall, cutting or unmapped structure under the line. Saying "unknown" is the honest answer.
      const why = `${method}: DTM discontinuity (wall, structure or unmapped bridge); needs survey`;
      e.attrs.incline = { ...unknownAttr(), method: why };
      e.attrs.inclineMax = { ...unknownAttr(), method: why };
      e.attrs.crossSlope = { ...unknownAttr(), method: why };
      discontinuities++;
      continue;
    }
    if (e.attrs.incline.source === "osm" && e.attrs.incline.value !== null && !r.short) {
      inclineChecks.push({ edgeId: e.id, name: e.name, osm: e.attrs.incline.value, lidarMean: round(r.mean, 1), lidarMax: round(r.max, 1), lengthM: round(e.lengthM, 1) });
    }
    e.attrs.incline = attr(round(r.mean, 1), "inferred", dtm.source, observedAt, r.short ? `${method}, short edge: ${SHORT_BASELINE_M} m centred baseline` : method);
    e.attrs.inclineMax = attr(round(r.max, 1), "inferred", dtm.source, observedAt, `${method}, ${WINDOW_M} m window`);
    e.attrs.crossSlope =
      r.cross === null
        ? { ...unknownAttr(), method: `${method}: cross-slope samples hit walls or kerbs` }
        : attr(round(r.cross, 1), "inferred", dtm.source, observedAt, `${method}, ±${CROSS_OFFSET_M} m perpendicular, p75`);
    sampledEdges++;
  }
  return { sampledEdges, offGroundEdges, discontinuities, inclineChecks };
}

/** Elevation profile along an edge (used by the route elevation chart). */
export function edgeElevationProfile(e: GraphEdge, dtm: Dtm): { d: number; z: number | null }[] {
  if (offGround(e)) return [];
  const p = densify(e);
  return p.d.map((d, i) => ({ d, z: dtm.sample(p.e[i]!, p.n[i]!) }));
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

