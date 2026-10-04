"""
Named greenspaces and their access points from OS Open Greenspace (OGL v3),
for British National Grid boxes. Called by scripts/build-greenspace.ts:

    python3 scripts/greenspace-extract.py '{"dir": "...", "tiles": ["NT"], "boxes": {"area": [minE, minN, maxE, maxN]}, "out": "..."}'

Writes, per area: sites with a name, their function, BNG bounding box, and their
pedestrian access points (motor-vehicle-only ones are left out).
"""
import json
import sys

import shapefile

cfg = json.loads(sys.argv[1])
out = {a: [] for a in cfg["boxes"]}
for tile in cfg["tiles"]:
    # The DBFs are Latin-1 with no .cpg ("St Thomas \u00c0 Becket's Church").
    sites = shapefile.Reader(f"{cfg['dir']}/{tile}_GreenspaceSite", encoding="latin-1")
    points = shapefile.Reader(f"{cfg['dir']}/{tile}_AccessPoint", encoding="latin-1")
    gates: dict[str, list] = {}
    for sr in points.iterShapeRecords():
        _, kind, site = sr.record
        if kind == "Motor Vehicle":
            continue
        x, y = sr.shape.points[0]
        gates.setdefault(site, []).append([round(x, 1), round(y, 1), kind])
    for sr in sites.iterShapeRecords():
        sid, function, name1 = sr.record[0], sr.record[1], sr.record[2]
        if not name1 or sid not in gates:
            continue
        x0, y0, x1, y1 = sr.shape.bbox
        for area, b in cfg["boxes"].items():
            if x1 < b[0] or x0 > b[2] or y1 < b[1] or y0 > b[3]:
                continue
            out[area].append({"id": sid, "name": name1, "function": function, "bbox": [round(v, 1) for v in (x0, y0, x1, y1)], "gates": gates[sid]})
json.dump(out, open(cfg["out"], "w"))
print({a: len(v) for a, v in out.items()})
