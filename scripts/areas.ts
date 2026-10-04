/**
 * Build areas. Each pilot city starts with a core area; whole-city builds
 * move to the worker (D-010, D-014).
 */
import { ENGLAND_LIDAR, SCOTLAND_PHASES, type ChunkSource } from "@causeway/graph/node";

export interface Area {
  name: string;
  title: string;
  bbox: [number, number, number, number];
  /** Either a pre-cut OSM XML in .data-cache, or OSM API /map tiles for small areas (D-012). */
  osm: { file: string; note: string } | { apiTiles: [number, number, number, number][]; note: string };
  dtm: ChunkSource[];
  terrainCredit: string;
}

/** Split a bbox into API-sized tiles. */
const tiles = (b: [number, number, number, number], nx: number, ny: number) => {
  const out: [number, number, number, number][] = [];
  const dx = (b[2] - b[0]) / nx,
    dy = (b[3] - b[1]) / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([b[0] + i * dx, b[1] + j * dy, b[0] + (i + 1) * dx, b[1] + (j + 1) * dy].map((v) => Math.round(v * 1e5) / 1e5) as [number, number, number, number]);
  return out;
};

const NEWCASTLE_BBOX: [number, number, number, number] = [-1.627, 54.961, -1.59, 54.979];

export const AREAS: Record<string, Area> = {
  "edinburgh-central": {
    name: "edinburgh-central",
    title: "Central Edinburgh",
    bbox: [-3.25, 55.92, -3.15, 55.975],
    osm: { file: "edinburgh-central.osm", note: "BBBike Edinburgh extract (download.bbbike.org/osm/bbbike/Edinburgh), OSM data to 2026-10-02T23:00Z" },
    dtm: SCOTLAND_PHASES,
    terrainCredit: "Contains public sector information licensed under the Open Government Licence v3.0 (Scottish Government, LiDAR for Scotland)",
  },
  "newcastle-gateshead": {
    name: "newcastle-gateshead",
    title: "Newcastle Quayside and Gateshead",
    // Grey Street and the Monument down to the Quayside, across the river to BALTIC and Gateshead's bank top.
    bbox: NEWCASTLE_BBOX,
    osm: { apiTiles: tiles(NEWCASTLE_BBOX, 3, 2), note: "OSM API /map" },
    dtm: [ENGLAND_LIDAR],
    terrainCredit: "© Environment Agency copyright and/or database right. Contains public sector information licensed under the Open Government Licence v3.0",
  },
};
