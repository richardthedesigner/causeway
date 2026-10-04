"""
Cut Overture Maps places for a set of bounding boxes, reading the public
GeoParquet release over HTTPS range requests (row-group bbox statistics mean
only a few MB per city are fetched, not the 10 GB theme).

    python3 scripts/overture-places.py '{"release": "2026-09-23.1", "zones": [[minlon, minlat, maxlon, maxlat], ...], "out": "..."}'

Writes JSON rows: id, name, basic category, lon, lat, address, confidence, sources and their licences.
Closed places (operating_status) are left out.
"""
import json
import re
import sys
import urllib.request

import duckdb

cfg = json.loads(sys.argv[1])
base = "https://overturemaps-us-west-2.s3.amazonaws.com"
prefix = f"release/{cfg['release']}/theme=places/type=place/"
listing = urllib.request.urlopen(f"{base}/?prefix={prefix}").read().decode()
files = [f"{base}/{k}" for k in re.findall(r"<Key>([^<]+\.parquet)</Key>", listing)]

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs;")
# One box in SQL so parquet row-group statistics can prune; the zones are applied after.
zones = cfg["zones"]
u = [min(z[0] for z in zones), min(z[1] for z in zones), max(z[2] for z in zones), max(z[3] for z in zones)]
where = f"bbox.xmin BETWEEN {u[0]} AND {u[2]} AND bbox.ymin BETWEEN {u[1]} AND {u[3]}"
rows = con.sql(
    f"""
    SELECT id, names.primary AS name, coalesce(taxonomy.primary, basic_category) AS category,
           (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat,
           addresses[1].freeform AS street, addresses[1].postcode AS postcode,
           confidence, list_transform(sources, s -> s.dataset) AS sources, list_transform(sources, s -> s.license) AS licences, taxonomy.hierarchy AS hierarchy
    FROM read_parquet({files!r})
    WHERE ({where}) AND names.primary IS NOT NULL AND coalesce(operating_status, 'open') = 'open'
    """
).fetchall()
out = [
    {"id": r[0], "n": r[1], "c": r[2], "x": round(r[3], 6), "y": round(r[4], 6), "ad": ", ".join(p for p in (r[5], r[6]) if p) or None, "conf": round(r[7], 2) if r[7] is not None else None, "src": sorted(set(r[8] or [])), "lic": sorted(set(x for x in (r[9] or []) if x)), "h": list(r[10] or [])}
    for r in rows
    if any(z[0] <= r[3] <= z[2] and z[1] <= r[4] <= z[3] for z in zones)
]
json.dump(out, open(cfg["out"], "w"), ensure_ascii=False)
print(f"{len(out)} Overture places")
