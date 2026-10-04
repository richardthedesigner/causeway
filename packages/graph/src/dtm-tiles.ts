/**
 * City-scale DTM access. A city is too big to hold as one raster (central
 * Edinburgh at 0.5 m is ~150 M pixels), so we prefetch only the 500 m chunks
 * the footway network touches, from whichever LiDAR phase covers each one,
 * and keep them as centimetre Int16 offsets. Sampling stays synchronous so
 * the enrichment code is identical for a spike window and a whole city.
 */
import { fromArrayBuffer, fromUrl, type GeoTIFF } from "geotiff";
import type { SourceId } from "./attribute.js";
import type { Dtm } from "./terrain.js";

const CHUNK_M = 500;

/** S3 range reads occasionally drop through the proxy; back off and retry. */
async function retry<T>(f: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}
const NODATA = -32768;

/** Ordnance Survey 100 km square letters for an easting/northing, e.g. "NT". */
export function osGridSquare(e: number, n: number): string {
  const e100 = Math.floor(e / 100_000);
  const n100 = Math.floor(n / 100_000);
  let l1 = 19 - n100 - ((19 - n100) % 5) + Math.floor((e100 + 10) / 5);
  let l2 = (((19 - n100) * 5) % 25) + (e100 % 5);
  if (l1 > 7) l1++;
  if (l2 > 7) l2++;
  return String.fromCharCode(65 + l1) + String.fromCharCode(65 + l2);
}

/** Scottish LiDAR quadrant tile name for a point, e.g. "NT27SE". */
export function scotlandQuadrant(e: number, n: number): string {
  const sq = osGridSquare(e, n);
  const x = Math.floor((e % 100_000) / 10_000);
  const y = Math.floor((n % 100_000) / 10_000);
  const q = (n % 10_000 >= 5_000 ? "N" : "S") + (e % 10_000 >= 5_000 ? "E" : "W");
  return `${sq}${x}${y}${q}`;
}

/** OS 1 km square reference, e.g. "NT2573". Used for coverage reporting. */
export function os1km(e: number, n: number): string {
  return `${osGridSquare(e, n)}${Math.floor((e % 100_000) / 1_000).toString().padStart(2, "0")}${Math.floor((n % 100_000) / 1_000).toString().padStart(2, "0")}`;
}

/** One elevation source that can deliver a CHUNK_M square, north-up, as a raster. */
export interface ChunkSource {
  label: string;
  source: SourceId;
  /** Publication or flight date; see DATA_SOURCES.md. */
  observedAt: string;
  fetchChunk(e0: number, n0: number): Promise<{ data: Float32Array; px: number; nodata: number | null } | null>;
}

/** Scottish LiDAR phase: quadrant GeoTIFFs on the public bucket, read by HTTP range request. */
function scotlandPhase(p: number): ChunkSource {
  const tiffs = new Map<string, Promise<GeoTIFF | null>>();
  const open = (url: string) => {
    // A missing tile (404) is normal: that phase didn't fly there. Anything else is retried.
    if (!tiffs.has(url)) tiffs.set(url, retry(() => fromUrl(url), 3).catch(() => null));
    return tiffs.get(url)!;
  };
  return {
    label: `LiDAR for Scotland Phase ${p}`,
    source: "lidar-scotland",
    observedAt: p === 5 ? "2022-07-06T00:00:00Z" : p === 3 ? "2021-09-08T00:00:00Z" : "2020-01-01T00:00:00Z",
    async fetchChunk(e0, n0) {
      const tile = scotlandQuadrant(e0 + 1, n0 + 1);
      const tiff = await open(`https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-${p}/dtm/27700/gridded/${tile}_50CM_DTM_PHASE${p}.tif`);
      if (!tiff) return null;
      const img = await retry(() => tiff.getImage());
      const [ox, oy] = img.getOrigin() as [number, number];
      const [rx] = img.getResolution() as [number, number];
      const px = Math.round(CHUNK_M / rx);
      const x0 = Math.round((e0 - ox) / rx);
      const y0 = Math.round((oy - (n0 + CHUNK_M)) / rx);
      if (x0 < 0 || y0 < 0 || x0 + px > img.getWidth() || y0 + px > img.getHeight()) return null;
      const [band] = (await retry(() => img.readRasters({ window: [x0, y0, x0 + px, y0 + px] }))) as unknown as Float32Array[];
      return { data: band!, px, nodata: img.getGDALNoData() };
    },
  };
}

export const SCOTLAND_PHASES: ChunkSource[] = [5, 3, 4, 6, 2].map(scotlandPhase);

/**
 * Environment Agency National LiDAR Programme composite DTM, 1 m (England),
 * via its public WCS. Covers Newcastle, Gateshead and London.
 */
export const ENGLAND_LIDAR: ChunkSource = {
  label: "Environment Agency LiDAR composite DTM 1 m",
  source: "lidar-england",
  // The composite is refreshed annually; the WCS doesn't expose survey dates per pixel. See DATA_SOURCES.md.
  observedAt: "2022-01-01T00:00:00Z",
  async fetchChunk(e0, n0) {
    const cov = "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m";
    const url =
      "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1&request=GetCoverage" +
      `&CoverageId=${cov}&format=image/tiff&subset=E(${e0},${e0 + CHUNK_M})&subset=N(${n0},${n0 + CHUNK_M})`;
    const buf = await retry(async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`EA WCS ${res.status}`);
      return res.arrayBuffer();
    });
    const img = await (await fromArrayBuffer(buf)).getImage();
    const [band] = (await img.readRasters()) as unknown as Float32Array[];
    const px = img.getWidth();
    if (px !== img.getHeight()) return null;
    return { data: band!, px, nodata: img.getGDALNoData() };
  },
};

interface Chunk {
  base: number;
  data: Int16Array;
  px: number;
}

export interface ChunkedDtm extends Dtm {
  stats: { chunks: number; missing: number; byPhase: Record<string, number> };
}

/**
 * Prefetch every 500 m chunk touched by `points` (OSGB), plus a 10 m margin.
 * Chunks with no data in the first source fall through to the next.
 */
export async function loadChunkedDtm(
  points: Iterable<[number, number]>,
  sources: ChunkSource[] = SCOTLAND_PHASES,
  opts: { concurrency?: number; log?: (s: string) => void } = {},
): Promise<ChunkedDtm> {
  const keys = new Set<string>();
  const key = (cx: number, cy: number) => `${cx}:${cy}`;
  for (const [e, n] of points) {
    for (const dx of [-10, 10]) for (const dy of [-10, 10]) keys.add(key(Math.floor((e + dx) / CHUNK_M), Math.floor((n + dy) / CHUNK_M)));
  }
  const chunks = new Map<string, Chunk | null>();
  const byPhase: Record<string, number> = {};
  const queue = [...keys];
  let done = 0;

  const loadOne = async (k: string) => {
    const [cx, cy] = k.split(":").map(Number) as [number, number];
    for (const src of sources) {
      const r = await src.fetchChunk(cx * CHUNK_M, cy * CHUNK_M).catch(() => null);
      if (!r) continue;
      const { data: band, px, nodata } = r;
      const ok = (v: number) => v > -100 && v !== nodata && Number.isFinite(v);
      let min = Infinity,
        valid = 0;
      for (const v of band) if (ok(v)) (min = Math.min(min, v)), valid++;
      if (valid === 0) continue;
      const data = new Int16Array(band.length);
      for (let i = 0; i < band.length; i++) data[i] = ok(band[i]!) ? Math.round((band[i]! - min) * 100) : NODATA;
      chunks.set(k, { base: min, data, px });
      byPhase[src.label] = (byPhase[src.label] ?? 0) + 1;
      return;
    }
    chunks.set(k, null);
  };

  const workers = Array.from({ length: opts.concurrency ?? 6 }, async () => {
    for (let k = queue.pop(); k !== undefined; k = queue.pop()) {
      await loadOne(k);
      if (++done % 25 === 0) opts.log?.(`dtm chunks ${done}/${keys.size}`);
    }
  });
  await Promise.all(workers);

  // Chunks can differ in resolution (Scotland 0.5 m, England 1 m); sample at the finest.
  const at = (e: number, n: number): number | null => {
    const cx = Math.floor(e / CHUNK_M),
      cy = Math.floor(n / CHUNK_M);
    const c = chunks.get(key(cx, cy));
    if (!c) return null;
    const res = CHUNK_M / c.px;
    const ix = Math.floor((e - cx * CHUNK_M) / res);
    const iy = Math.floor(((cy + 1) * CHUNK_M - n) / res);
    if (ix < 0 || iy < 0 || ix >= c.px || iy >= c.px) return null;
    const v = c.data[iy * c.px + ix]!;
    return v === NODATA ? null : c.base + v / 100;
  };
  const RES = Math.min(...[...chunks.values()].filter((c): c is Chunk => !!c).map((c) => CHUNK_M / c.px), 1);
  const first = sources[0]!;
  return {
    resolution: RES,
    source: first.source,
    observedAt: first.observedAt,
    label: sources.length > 1 ? `${first.label} (gaps filled from ${sources.slice(1).map((x) => x.label).join(", ")})` : first.label,
    // Bilinear on pixel centres, falling back to nearest where a neighbour is missing.
    sample(e, n) {
      const fx = e / RES - 0.5,
        fy = n / RES - 0.5;
      const x = Math.floor(fx) * RES + RES / 2,
        y = Math.floor(fy) * RES + RES / 2;
      const tx = fx - Math.floor(fx),
        ty = fy - Math.floor(fy);
      const a = at(x, y),
        b = at(x + RES, y),
        c = at(x, y + RES),
        d = at(x + RES, y + RES);
      if (a === null || b === null || c === null || d === null) return at(e, n);
      return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    },
    stats: { chunks: keys.size, missing: [...chunks.values()].filter((c) => !c).length, byPhase },
  };
}
