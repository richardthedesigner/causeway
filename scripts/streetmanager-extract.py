"""
Pull the works that touch footways out of a Street Manager monthly archive
(opendata.manage-roadworks.service.gov.uk, permit/YYYY/MM.zip: one JSON
event per file, about a million files and 1 GB a month).

Keeps the latest event per permit whose works location falls in one of the
given British National Grid boxes and which closes or sits on the footway.
Called by scripts/build-works.ts:

    python3 scripts/streetmanager-extract.py '{"zip": "...", "boxes": {"area": [minE, minN, maxE, maxN]}, "out": "..."}'

With "kind": "activity" it reads the activity archive instead (activity/YYYY/MM.zip,
about 13 MB a month): skips, scaffolding, hoardings, cranes, events and other
non-works licences (DATA-05). "zip" may then be a list of monthly archives; the
latest event per activity across all of them wins. A month that isn't a readable
zip, or breaks part way through, is skipped whole with a warning (the June 2026
archive is published truncated). Free text (name, type details, location
description) is kept only so the adapter can read closure words; it is never shown.
"""
import json
import re
import sys
import zipfile
import zlib

cfg = json.loads(sys.argv[1])
boxes = cfg["boxes"]
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def box_of(geom):
    nums = [float(x) for x in NUM.findall(geom or "")]
    if len(nums) < 2:
        return None
    e, n = nums[0], nums[1]
    return next((a for a, b in boxes.items() if b[0] <= e <= b[2] and b[1] <= n <= b[3]), None)


def read_month(path: str) -> dict[str, dict]:
    """The latest event per activity in one monthly archive. Raises if the zip is unreadable or truncated."""
    month: dict[str, dict] = {}
    z = zipfile.ZipFile(path)
    for name in z.namelist():
        ev = json.loads(z.read(name))
        d = ev.get("object_data") or {}
        geom = d.get("activity_coordinates") or ""
        area = box_of(geom)
        if not area:
            continue
        ref = d.get("activity_reference_number") or ev.get("object_reference")
        prev = month.get(ref)
        if prev and prev["event_time"] >= ev["event_time"]:
            continue
        month[ref] = {
            "area": area,
            "event_time": ev["event_time"],
            "event_type": ev["event_type"],
            "ref": ref,
            "geom": geom,
            "street": d.get("street_name"),
            "town": d.get("town"),
            "activity": d.get("activity_type"),
            "details": d.get("activity_type_details"),
            "name": d.get("activity_name"),
            "location_type": d.get("activity_location_type"),
            "location_description": d.get("activity_location_description"),
            "cancelled": d.get("cancelled"),
            "start_date": d.get("start_date"),
            "start_time": d.get("start_time"),
            "end_date": d.get("end_date"),
            "end_time": d.get("end_time"),
        }
    return month


if cfg.get("kind") == "activity":
    latest: dict[str, dict] = {}
    read: list[str] = []
    for path in cfg["zip"] if isinstance(cfg["zip"], list) else [cfg["zip"]]:
        try:
            month = read_month(path)
        except (zipfile.BadZipFile, EOFError, OSError, ValueError, zlib.error) as e:
            print(f"warning: {path} is not a readable archive ({e}); month skipped", file=sys.stderr)
            continue
        read.append(path)
        for ref, ev in month.items():
            prev = latest.get(ref)
            if not prev or prev["event_time"] < ev["event_time"]:
                latest[ref] = ev
    out = list(latest.values())
    json.dump({"read": read, "activities": out}, open(cfg["out"], "w"))
    print(f"{len(out)} activities in the boxes, from {len(read)} archives")
    sys.exit(0)

latest: dict[str, dict] = {}
z = zipfile.ZipFile(cfg["zip"])
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
