"""
Pull the rows that can matter on foot out of a Scottish Road Works Register
disruptions export (downloads.srwr.scot/export/disruptions-daily/: a zip
holding CurrentActivities.csv, about 25 MB, OGL v3).

Keeps one road authority's rows whose centroid falls in one of the given
British National Grid boxes and which sit on the footway, close the road,
or are a street café, site occupation or event permission. The adapter in
packages/live/src/works.ts (srwrObservations) makes the final call. The
promoter is not kept: lists use our own words and the street (D-057).
Called by scripts/build-srwr.ts:

    python3 scripts/srwr-extract.py '{"zip": "...", "authority": "City of Edinburgh Council", "boxes": {"area": [minE, minN, maxE, maxN]}, "out": "..."}'
"""
import csv
import io
import json
import sys
import zipfile

# GeometryFull holds whole multilinestrings: far past csv's default 128 KB field limit.
csv.field_size_limit(sys.maxsize)

cfg = json.loads(sys.argv[1])
boxes = cfg["boxes"]
LICENCES = {"Street Café", "Scaffolding", "Hoarding", "Containers/Cabins/Storage", "Skip", "Materials", "General Road Occupation", "Public Event"}
TRAFFIC = {"Works Entirely On The Footway", "Road Closure"}

z = zipfile.ZipFile(cfg["zip"])
rows = csv.DictReader(io.TextIOWrapper(z.open("CurrentActivities.csv"), encoding="utf-8-sig", newline=""))
out: dict[str, list] = {a: [] for a in boxes}
for r in rows:
    if r["RoadAuthorityName"] != cfg["authority"]:
        continue
    if r["TrafficManagement"] not in TRAFFIC and r["LicenceType"] not in LICENCES and r["Category"] != "Event":
        continue
    try:
        e, n = float(r["Easting"]), float(r["Northing"])
    except ValueError:
        continue
    area = next((a for a, b in boxes.items() if b[0] <= e <= b[2] and b[1] <= n <= b[3]), None)
    if not area:
        continue
    out[area].append({
        "ref": f'{r["ActivityReference"]}/{r["PhaseNumber"]}',
        "category": r["Category"],
        "licence": r["LicenceType"],
        "traffic": r["TrafficManagement"],
        "status": r["ActivityStatus"],
        "location": r["Location"],
        "description": r["Description"],
        "street": r["Street"] or None,
        "start": r["StartDateTimeUTC"],
        "end": r["EndDateTimeUTC"],
        "updated": r["LastUpdatedDateTimeUTC"] or None,
        "geom": r["GeometryFull"] or r["GeometryCentroid"],
    })

json.dump(out, open(cfg["out"], "w"))
print(", ".join(f"{a}: {len(v)} rows" for a, v in out.items()))
