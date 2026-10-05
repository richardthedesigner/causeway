/**
 * Small geometry for matching graph edges to outside layers (council footways,
 * gritting routes, flood areas). Lon/lat in, metres out, on a flat-earth
 * approximation at the area's latitude: good to well under a metre at city scale.
 */
export type Pt = [number, number];

/** Is a point inside these rings (even-odd, so holes work)? */
export function inside(pt: Pt, rings: Pt[][]): boolean {
  let n = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!,
        [xj, yj] = r[j]!;
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) n = !n;
    }
  return n;
}

/** Distance helpers in metres for an area around `lat`. */
export function metresAt(lat: number) {
  const COS = Math.cos((lat * Math.PI) / 180);
  const toM = (dx: number, dy: number) => Math.hypot(dx * COS * 111_320, dy * 111_320);
  /** Metres from a point to the nearest segment of a line. */
  const lineDistance = (pt: Pt, r: Pt[]) => {
    let best = Infinity;
    for (let i = 1; i < r.length; i++) {
      const [ax, ay] = r[i - 1]!,
        [bx, by] = r[i]!;
      const [vx, vy] = [(bx - ax) * COS, by - ay];
      const t = Math.max(0, Math.min(1, ((pt[0] - ax) * COS * vx + (pt[1] - ay) * vy) / (vx * vx + vy * vy || 1)));
      best = Math.min(best, toM(pt[0] - (ax + t * (bx - ax)), pt[1] - (ay + t * (by - ay))));
    }
    return best;
  };
  /** 0 inside the rings, else metres to the nearest edge. */
  const distance = (pt: Pt, rings: Pt[][]) => (inside(pt, rings) ? 0 : Math.min(...rings.map((r) => lineDistance(pt, r))));
  /** The point halfway along a line. */
  const middle = (geom: Pt[]): Pt => {
    const seg = geom.slice(1).map((p, i) => toM(p[0] - geom[i]![0], p[1] - geom[i]![1]));
    let left = seg.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < seg.length; i++) {
      if (left <= seg[i]!) {
        const t = seg[i] ? left / seg[i]! : 0;
        return [geom[i]![0] + t * (geom[i + 1]![0] - geom[i]![0]), geom[i]![1] + t * (geom[i + 1]![1] - geom[i]![1])];
      }
      left -= seg[i]!;
    }
    return geom[0]!;
  };
  return { toM, lineDistance, distance, middle };
}
