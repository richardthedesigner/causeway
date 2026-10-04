"""
Cut the bus network for one area out of a Bus Open Data Service GTFS file
(data.bus-data.dft.gov.uk/timetable/download/gtfs-file/<region>/, no key).

For each route and direction it keeps the stops inside the area's zones,
the typical ride time between consecutive stops (median over the day's
trips) and how many buses leave each stop in each hour on a typical
weekday, Saturday and Sunday. That is enough for frequency-based routing
("about every 8 minutes"); exact departures come from live feeds.

Called by scripts/build-bus.ts:

    python3 scripts/gtfs-bus.py '{"zip": "...", "zones": [[minlon, minlat, maxlon, maxlat], ...], "days": {"wd": "20261006", "sa": "20261010", "su": "20261011"}, "extraModes": {"1": "metro"}, "out": "..."}'

Buses and trams always; "extraModes" adds other GTFS route types for an area (the Tyne and Wear Metro).
"""
import csv
import io
import json
import statistics
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date

cfg = json.loads(sys.argv[1])
zones = cfg["zones"]
days = cfg["days"]
z = zipfile.ZipFile(cfg["zip"])


def rows(name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), "utf-8-sig"))


def inside(lon, lat):
    return any(a <= lon <= c and b <= lat <= d for a, b, c, d in zones)


# Stops in the area.
stops = {}
for s in rows("stops.txt"):
    if s.get("location_type") not in (None, "", "0"):
        continue
    lon, lat = float(s["stop_lon"]), float(s["stop_lat"])
    if inside(lon, lat):
        stops[s["stop_id"]] = {"n": s["stop_name"], "code": s.get("stop_code") or None, "x": round(lon, 6), "y": round(lat, 6)}

# Services running on each sample day.
WEEKDAY = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
active = {k: set() for k in days}
for c in rows("calendar.txt"):
    for k, d in days.items():
        dow = WEEKDAY[date(int(d[:4]), int(d[4:6]), int(d[6:])).weekday()]
        if c["start_date"] <= d <= c["end_date"] and c[dow] == "1":
            active[k].add(c["service_id"])
for c in rows("calendar_dates.txt"):
    for k, d in days.items():
        if c["date"] == d:
            (active[k].add if c["exception_type"] == "1" else active[k].discard)(c["service_id"])

routes = {r["route_id"]: r for r in rows("routes.txt")}
# GTFS route_type to our mode. Rail (2) and London's Underground (1) come from TfL instead (transit.ts).
MODES = {"3": "bus", "700": "bus", "702": "bus", "704": "bus", "711": "bus", "712": "bus", "713": "bus", "715": "bus", "0": "tram", "900": "tram"}
for m in cfg.get("extraModes", {}).items():
    MODES[m[0]] = m[1]
agencies = {a["agency_id"]: a["agency_name"] for a in rows("agency.txt")}
trips = {}
for t in rows("trips.txt"):
    on = [k for k in days if t["service_id"] in active[k]]
    if on and MODES.get(routes.get(t["route_id"], {}).get("route_type", "3")):
        trips[t["trip_id"]] = (t["route_id"], t.get("direction_id") or "0", t.get("trip_headsign") or "", on)


def secs(hms):
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


# Calls at in-area stops, per trip, in order.
calls = defaultdict(list)
for st in rows("stop_times.txt"):
    tid = st["trip_id"]
    if tid in trips and st["stop_id"] in stops:
        t = st["departure_time"] or st["arrival_time"]
        if t:
            calls[tid].append((int(st["stop_sequence"]), st["stop_id"], secs(t)))

lines = {}
for tid, cs in calls.items():
    cs.sort()
    route_id, direction, headsign, on = trips[tid]
    key = f"{route_id}:{direction}"
    ln = lines.setdefault(key, {"route_id": route_id, "dir": direction, "headsigns": Counter(), "perHour": defaultdict(lambda: {k: [0] * 24 for k in days}), "runs": defaultdict(list), "trips": 0})
    ln["headsigns"][headsign] += 1
    ln["trips"] += 1
    for _, sid, t in cs[:-1]:  # nobody boards at the last call
        for k in on:
            ln["perHour"][sid][k][(t // 3600) % 24] += 1
    for (_, a, ta), (_, b, tb) in zip(cs, cs[1:]):
        if a != b and tb >= ta:
            ln["runs"][(a, b)].append(tb - ta)

out_lines = []
for key, ln in lines.items():
    r = routes[ln["route_id"]]
    rides = [[a, b, max(30, int(statistics.median(v))), len(v)] for (a, b), v in ln["runs"].items() if len(v) >= 2]
    if not rides:
        continue
    out_lines.append(
        {
            "id": key,
            "route": r.get("route_short_name") or r.get("route_long_name") or ln["route_id"],
            "mode": MODES.get(r.get("route_type", "3"), "bus"),
            "operator": agencies.get(r.get("agency_id", ""), None),
            "headsign": ln["headsigns"].most_common(1)[0][0] or None,
            "calls": {sid: ph for sid, ph in ln["perHour"].items()},
            "rides": rides,
        }
    )
used = {s for ln in out_lines for r in ln["rides"] for s in r[:2]}
json.dump({"stops": {k: v for k, v in stops.items() if k in used}, "lines": out_lines}, open(cfg["out"], "w"), separators=(",", ":"))
print(f"{len(used)} stops, {len(out_lines)} route directions")
