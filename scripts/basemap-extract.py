"""
Cut a city basemap out of a Protomaps daily planet build, over HTTP range
requests (no planet download). Output: data/basemap/<name>.pmtiles.

    python3 scripts/basemap-extract.py <name> minlon minlat maxlon maxlat [build YYYYMMDD] [maxzoom]

Protomaps basemap data is © OpenStreetMap contributors (ODbL); the tile
schema and style are Protomaps (BSD-3). See DATA_SOURCES.md and D-007.
"""
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from pmtiles.reader import Reader
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

name = sys.argv[1]
minlon, minlat, maxlon, maxlat = map(float, sys.argv[2:6])
build = sys.argv[6] if len(sys.argv) > 6 else "20261004"
maxz = int(sys.argv[7]) if len(sys.argv) > 7 else 15
url = f"https://build.protomaps.com/{build}.pmtiles"


def get_bytes(offset, length):
    req = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": "Causewayside/0.1"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 4:
                raise


src = Reader(get_bytes)
header = src.header()
meta = src.metadata()


def tile_range(z):
    n = 2 ** z
    x0 = int((minlon + 180) / 360 * n)
    x1 = int((maxlon + 180) / 360 * n)
    lat2y = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x0, x1, lat2y(maxlat), lat2y(minlat)


coords = []
for z in range(0, maxz + 1):
    x0, x1, y0, y1 = tile_range(z)
    coords += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
print(f"{len(coords)} tiles z0-{maxz}", file=sys.stderr)

with ThreadPoolExecutor(8) as ex:
    datas = list(ex.map(lambda c: src.get(*c), coords))

with open(f"data/basemap/{name}.pmtiles", "wb") as f:
    w = Writer(f)
    kept = sorted(((zxy_to_tileid(*c), d) for c, d in zip(coords, datas) if d), key=lambda t: t[0])
    for tid, d in kept:
        w.write_tile(tid, d)
    w.finalize(
        {
            "tile_type": TileType.MVT,
            "tile_compression": header["tile_compression"],
            "min_zoom": 0,
            "max_zoom": maxz,
            "min_lon_e7": int(minlon * 1e7),
            "min_lat_e7": int(minlat * 1e7),
            "max_lon_e7": int(maxlon * 1e7),
            "max_lat_e7": int(maxlat * 1e7),
            "center_zoom": 14,
            "center_lon_e7": int((minlon + maxlon) / 2 * 1e7),
            "center_lat_e7": int((minlat + maxlat) / 2 * 1e7),
        },
        {**meta, "name": f"Causewayside basemap: {name}", "description": f"Cut from Protomaps build {build}", "attribution": "© OpenStreetMap contributors"},
    )
    print(f"wrote {len(kept)} tiles", file=sys.stderr)
