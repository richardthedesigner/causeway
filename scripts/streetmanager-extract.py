"""
Pull the works that touch footways out of a Street Manager monthly archive
(opendata.manage-roadworks.service.gov.uk, permit/YYYY/MM.zip: one JSON
event per file, about a million files and 1 GB a month).

Keeps the latest event per permit whose works location falls in one of the
given British National Grid boxes and which closes or sits on the footway.
Called by scripts/build-works.ts:

    python3 scripts/streetmanager-extract.py '{"zip": "...", "boxes": {"area": [minE, minN, maxE, maxN]}, "out": "..."}'

With "kind": "activity" it reads the activity archive (activity/YYYY/MM.zip,
about 12 MB a month) instead: skips, scaffolding, hoardings, cranes, events
and other non-works licences (DATA-05). The latest event per activity is kept.
"""
import json
import re
import sys
import zipfile

cfg = json.loads(sys.argv[1])
boxes = cfg["boxes"]
NUM = re.compile(r"-?\d+(?:\.\d+)?")

latest: dict[str, dict] = {}
z = zipfile.ZipFile(cfg["zip"])


def box_of(geom):
    nums = [float(x) for x in NUM.findall(geom or "")]
    if len(nums) < 2:
        return None
    e, n = nums[0], nums[1]
    return next((a for a, b in boxes.items() if b[0] <= e <= b[2] and b[1] <= n <= b[3]), None)


if cfg.get("kind") == "activity":
    for name in z.namelist():
        ev = json.loads(z.read(name))
        d = ev.get("object_data") or {}
        geom = d.get("activity_coordinates") or ""
        area = box_of(geom)
        if not area:
            continue
        ref = d.get("activity_reference_number") or ev.get("object_reference")
        prev = latest.get(ref)
        if prev and prev["event_time"] >= ev["event_time"]:
            continue
        latest[ref] = {
            "area": area,
            "event_time": ev["event_time"],
            "event_type": ev["event_type"],
            "ref": ref,
            "geom": geom,
            "street": d.get("street_name"),
            "town": d.get("town"),
            "activity": d.get("activity_type"),
            "details": d.get("activity_type_details"),
            "location_type": d.get("activity_location_type"),
            "cancelled": d.get("cancelled"),
            "start_date": d.get("start_date"),
            "start_time": d.get("start_time"),
            "end_date": d.get("end_date"),
            "end_time": d.get("end_time"),
        }
    out = list(latest.values())
    json.dump(out, open(cfg["out"], "w"))
    print(f"{len(out)} activities in the boxes")
    sys.exit(0)

for name in z.namelist():
    raw = z.read(name)
    if b'"works_location_coordinates"' not in raw:
        continue
    ev = json.loads(raw)
    d = ev.get("object_data") or {}
    geom = d.get("works_location_coordinates") or ""
    nums = [float(x) for x in NUM.findall(geom)]
    if len(nums) < 2:
        continue
    e, n = nums[0], nums[1]
    area = next((a for a, b in boxes.items() if b[0] <= e <= b[2] and b[1] <= n <= b[3]), None)
    if not area:
        continue
    ref = d.get("permit_reference_number") or ev.get("object_reference")
    prev = latest.get(ref)
    if prev and prev["event_time"] >= ev["event_time"]:
        continue
    latest[ref] = {
        "area": area,
        "event_time": ev["event_time"],
        "event_type": ev["event_type"],
        "ref": ref,
        "geom": geom,
        "street": d.get("street_name"),
        "town": d.get("town"),
        "authority": d.get("highway_authority"),
        "promoter": d.get("promoter_organisation"),
        "activity": d.get("activity_type"),
        "location_type": d.get("works_location_type"),
        "close_footway": d.get("close_footway_ref") or d.get("close_footway"),
        "status": d.get("work_status_ref"),
        "permit_status": d.get("permit_status"),
        "start": d.get("actual_start_date_time") or d.get("proposed_start_date"),
        "end": d.get("actual_end_date_time") or d.get("proposed_end_date"),
        "proposed_end": d.get("proposed_end_date"),
    }

out = list(latest.values())
json.dump(out, open(cfg["out"], "w"))
print(f"{len(out)} permits in the boxes")
