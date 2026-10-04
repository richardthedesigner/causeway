/**
 * Pinned inputs for the Phase 0 Edinburgh spike. Downloads are cached in
 * .data-cache/ (git-ignored); the built graph is committed as a snapshot.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CACHE = join(import.meta.dirname, "..", ".data-cache");

export const EDINBURGH_OLD_TOWN = {
  name: "edinburgh-old-town",
  /** [minLon, minLat, maxLon, maxLat]. Waverley, Old Town, Grassmarket, Princes St west to Lothian Rd. */
  bbox: [-3.209, 55.9455, -3.186, 55.9535] as [number, number, number, number],
  /** OSM API caps a single /map call; split into tiles. */
  osmTiles: [
    [-3.201, 55.9455, -3.186, 55.9535],
    [-3.209, 55.9455, -3.201, 55.9535],
  ] as [number, number, number, number][],
  dtm: {
    // Phase 3 NT27SE stops short of the city centre (checked 2026-10-04); Phase 5 covers it.
    urls: ["NT27SE", "NT27SW"].map(
      (t) => `https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-5/dtm/27700/gridded/${t}_50CM_DTM_PHASE5.tif`,
    ),
    label: "LiDAR for Scotland Phase 5 NT27SE+NT27SW",
    // Publication date (S3 Last-Modified). Flight date not yet confirmed: see DATA_SOURCES.md.
    observedAt: "2022-07-06T00:00:00Z",
  },
  ostn15: {
    url: "https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif",
    file: "uk_os_OSTN15_NTv2_OSGBtoETRS.tif",
  },
};

export async function cached(file: string, url: string): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, file);
  if (!existsSync(p)) {
    process.stderr.write(`fetching ${url}\n`);
    const res = await fetch(url, { headers: { "User-Agent": "Causewayside/0.0 (Phase 0 spike)" } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(p);
}

export const osmTileUrl = ([a, b, c, d]: [number, number, number, number]) =>
  `https://api.openstreetmap.org/api/0.6/map?bbox=${a},${b},${c},${d}`;

export const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
