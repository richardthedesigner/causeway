/**
 * Matching Edinburgh's council layers to our pavement edges (D-046, D-047):
 * the pure part, so it is tested without the network. Works in British
 * National Grid metres; the caller projects the graph's edges with OSTN15.
 *
 * Footways (Adopted Roads). For each pavement edge, points every 5 m along it
 * (kept 5 m clear of the junctions at its ends) are matched to the council's
 * footway polygons:
 * - a path or pavement drawn as its own line takes the polygon it lies in,
 *   or the nearest within 3 m (the two were drawn from different maps);
 * - a road standing in for its pavements (street_proxy) takes the nearest
 *   footway polygon within 15 m on each side.
 * Surface: setts when they cover a quarter of the points (so a stretch of
 * them isn't outvoted), otherwise the commonest surface when it covers half.
 * Width: the 20th percentile of the widths found on both sides, so a narrow
 * side or stretch counts. Nothing is written for an edge where under half the
 * points found a footway polygon.
 *
 * Gritting. An edge is on a priority 1 pavement gritting route when at least
 * 60% of its points lie near a route line running the same way (within 30
 * degrees): within 6 m for a street proxy or a pedestrian street (both lines
 * follow the middle of the street), within 12 m for a pavement or path drawn
 * as its own line (it runs beside the road). Steps and crossings never count.
 *
 * Ported from PR #36 (scripts/adopted-roads-lib.ts and gritting-lib.ts) into
 * main's council layer.
 */
import { councilSurface, type GraphEdge, type Surface } from "@causeway/graph";

export type XY = [number, number];

export interface FootwayPolygon {
  id: number;
  /** The council's surface word, e.g. "Setts". */
  surface: string | null;
  /** Metres, or null when the council has none. */
  width: number | null;
  /** Rings in metres (BNG), first outer. */
  rings: XY[][];
}

/** Below this the council's width is a drawing artefact (a sliver at a corner), not a pavement. */
export const MIN_WIDTH_M = 0.6;
/** Above this it is an area-like figure on a large polygon, not a width. */
export const MAX_WIDTH_M = 10;
const STEP_M = 5;
const END_CLEAR_M = 5;
const NEAR_M = 3;
const SIDE_M = 15;
const CELL = 50;

/** Points along a line every 5 m, 5 m clear of the ends; the midpoint alone for a short line. Each with the line's direction there. */
export function samples(line: readonly XY[]): { x: number; y: number; dx: number; dy: number }[] {
  const segs: { a: XY; b: XY; len: number; at: number }[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) segs.push({ a, b, len, at: total });
    total += len;
  }
  if (!segs.length) return [];
  const at = (d: number) => {
    const s = segs.find((x) => d <= x.at + x.len) ?? segs[segs.length - 1]!;
    const t = Math.min(1, Math.max(0, (d - s.at) / s.len));
    return { x: s.a[0] + t * (s.b[0] - s.a[0]), y: s.a[1] + t * (s.b[1] - s.a[1]), dx: (s.b[0] - s.a[0]) / s.len, dy: (s.b[1] - s.a[1]) / s.len };
  };
  if (total < 2 * END_CLEAR_M + STEP_M) return [at(total / 2)];
  const out = [];
  for (let d = END_CLEAR_M; d <= total - END_CLEAR_M + 1e-9; d += STEP_M) out.push(at(d));
  return out;
}

/** Footway polygons in a 50 m grid, by bounding box. */
export class PolygonIndex {
  private cells = new Map<string, FootwayPolygon[]>();
  private boxes = new Map<FootwayPolygon, [number, number, number, number]>();
  constructor(polys: readonly FootwayPolygon[]) {
    for (const p of polys) {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const r of p.rings) for (const [x, y] of r) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      this.boxes.set(p, [x0, y0, x1, y1]);
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = `${cx},${cy}`;
          (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(p);
        }
    }
  }
  /** Polygons whose box comes within r of the point. */
  near(x: number, y: number, r: number): FootwayPolygon[] {
    const out = new Set<FootwayPolygon>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
        for (const p of this.cells.get(`${cx},${cy}`) ?? []) {
          const b = this.boxes.get(p)!;
          if (x >= b[0] - r && x <= b[2] + r && y >= b[1] - r && y <= b[3] + r) out.add(p);
        }
    return [...out];
  }
}

/** Metres from a point to a polygon: 0 inside (even-odd over all rings), else to the nearest ring edge. */
export function distanceToPolygon(x: number, y: number, p: FootwayPolygon): number {
  let inside = false;
  let best = Infinity;
  for (const r of p.rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!;
      const [xj, yj] = r[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi,
        dy = yj - yi;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(xi + t * dx - x, yi + t * dy - y));
    }
  }
  return inside ? 0 : best;
}

/** Left (+1) or right (-1) of the direction of travel, by the polygon's ring vertex nearest the point. */
function sideOf(s: { x: number; y: number; dx: number; dy: number }, p: FootwayPolygon): 1 | -1 {
  let best = Infinity,
    side = 0;
  for (const r of p.rings)
    for (const [x, y] of r) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < best) {
        best = d;
        side = s.dx * (y - s.y) - s.dy * (x - s.x);
      }
    }
  return side >= 0 ? 1 : -1;
}

/** Setts on a quarter of the points; otherwise the commonest surface on half of them. Null when under half the points have a surface. */
export function pickSurface(values: readonly (Surface | null)[]): Surface | null {
  const known = values.filter((v): v is Surface => v !== null);
  if (!known.length || known.length < values.length / 2) return null;
  for (const r of ["cobblestone", "sett"] as Surface[]) if (known.filter((v) => v === r).length >= known.length / 4) return r;
  const counts = new Map<Surface, number>();
  for (const v of known) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return n >= known.length / 2 ? top : null;
}

const usableWidth = (w: number | null) => (w !== null && w >= MIN_WIDTH_M && w <= MAX_WIDTH_M ? w : null);

/** What the council's footways say about one edge, from its line in metres (BNG). Null when under half the points found a footway. */
export function footwayFor(kind: GraphEdge["kind"], line: readonly XY[], index: PolygonIndex): { surface: Surface | null; width: number | null } | null {
  const pts = samples(line);
  if (!pts.length) return null;
  const hits: FootwayPolygon[] = [];
  let found = 0;
  for (const s of pts) {
    if (kind === "street_proxy") {
      // The nearest footway on each side of the road.
      let left: [number, FootwayPolygon] | null = null,
        right: [number, FootwayPolygon] | null = null;
      for (const p of index.near(s.x, s.y, SIDE_M)) {
        const d = distanceToPolygon(s.x, s.y, p);
        if (d > SIDE_M) continue;
        if (sideOf(s, p) > 0) {
          if (!left || d < left[0]) left = [d, p];
        } else if (!right || d < right[0]) right = [d, p];
      }
      if (left || right) found++;
      if (left) hits.push(left[1]);
      if (right) hits.push(right[1]);
    } else {
      let best: [number, FootwayPolygon] | null = null;
      for (const p of index.near(s.x, s.y, NEAR_M)) {
        const d = distanceToPolygon(s.x, s.y, p);
        if (d <= NEAR_M && (!best || d < best[0])) best = [d, p];
      }
      if (best) {
        found++;
        hits.push(best[1]);
      }
    }
  }
  if (found < pts.length / 2) return null;
  const surface = pickSurface(hits.map((h) => councilSurface(h.surface)));
  const widths = hits
    .map((h) => usableWidth(h.width))
    .filter((w): w is number => w !== null)
    .sort((a, b) => a - b);
  const width = widths.length && widths.length >= hits.length / 2 ? Math.round(widths[Math.floor((widths.length - 1) * 0.2)]! * 10) / 10 : null;
  return surface || width !== null ? { surface, width } : null;
}

// --- Gritting -------------------------------------------------------------

/** Edge kinds that can be on a pavement gritting route. Steps are rarely gritted and crossings are the road, so neither is. */
export const GRIT_KINDS = new Set<GraphEdge["kind"]>(["footway", "sidewalk", "pedestrian", "ramp", "street_proxy"]);

const CENTRE_M = 6;
const BESIDE_M = 12;
const SHARE = 0.6;
/** cos 30 degrees. */
const PARALLEL = Math.cos(Math.PI / 6);

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ux: number;
  uy: number;
  len: number;
}

/** Segments of the priority 1 gritting lines in a 50 m grid. */
export class LineIndex {
  private cells = new Map<string, Seg[]>();
  constructor(lines: readonly XY[][]) {
    for (const path of lines)
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = path[i - 1]!;
        const [bx, by] = path[i]!;
        const len = Math.hypot(bx - ax, by - ay);
        if (!len) continue;
        const s: Seg = { ax, ay, bx, by, ux: (bx - ax) / len, uy: (by - ay) / len, len };
        for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++)
          for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
            const k = `${cx},${cy}`;
            (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(s);
          }
      }
  }
  /** Is there a segment within r of the point, running within 30 degrees of (dx, dy) either way? */
  near(x: number, y: number, dx: number, dy: number, r: number): boolean {
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
        for (const s of this.cells.get(`${cx},${cy}`) ?? []) {
          if (Math.abs(s.ux * dx + s.uy * dy) < PARALLEL) continue;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * s.ux + (y - s.ay) * s.uy) / s.len));
          if (Math.hypot(s.ax + t * (s.bx - s.ax) - x, s.ay + t * (s.by - s.ay) - y) <= r) return true;
        }
    return false;
  }
}

/** Is this edge, its line in metres (BNG), on a priority 1 pavement gritting route? */
export function onGrittingRoute(kind: GraphEdge["kind"], line: readonly XY[], index: LineIndex): boolean {
  if (!GRIT_KINDS.has(kind)) return false;
  const pts = samples(line);
  if (!pts.length) return false;
  const r = kind === "street_proxy" || kind === "pedestrian" ? CENTRE_M : BESIDE_M;
  return pts.filter((s) => index.near(s.x, s.y, s.dx, s.dy, r)).length >= pts.length * SHARE;
}

/**
 * The council's licence and published date for a layer, from its DCAT feed.
 * Throws when the layer isn't listed as Open Government Licence v3 or has no
 * date: no layer is better than one we may not use, or one dated today.
 */
export function dcatEntry(feed: { dataset: { title?: string; modified?: string; license?: string; distribution?: { accessURL?: string }[] }[] }, service: string): { title: string; publishedAt: string } {
  const ds = feed.dataset.find((d) => d.distribution?.some((x) => x.accessURL === service));
  if (!ds) throw new Error(`${service} is not in the council's DCAT feed: refusing to build`);
  if (!/Open Government Licen[cs]e v(ersion )?3/i.test(ds.license ?? "")) throw new Error(`${service} is not listed as Open Government Licence v3 in the council's DCAT feed: refusing to build`);
  const t = ds.modified ? new Date(ds.modified) : null;
  if (!t || Number.isNaN(t.getTime())) throw new Error(`${service} has no published date in the council's DCAT feed: refusing to build`);
  return { title: ds.title ?? service, publishedAt: t.toISOString().slice(0, 10) };
}
