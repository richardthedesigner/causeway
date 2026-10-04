"""
Cut the search index for one area out of OpenStreetMap: named places with
their category and any access tags, street addresses, and postcode centroids.

Called by scripts/build-places.ts with a JSON config:

    python3 scripts/places-extract.py '{"inputs": [...], "zones": [[minlon, minlat, maxlon, maxlat], ...], "out": "..."}'

Access tags are copied as OpenStreetMap states them, with the date the
element was last edited (or its check_date), so the app can say where a fact
came from and how old it is. Nothing here turns them into a verdict.
"""
import json
import sys
from collections import defaultdict

import osmium

cfg = json.loads(sys.argv[1])
zones = cfg["zones"]


def inside(lon: float, lat: float) -> bool:
    return any(z[0] <= lon <= z[2] and z[1] <= lat <= z[3] for z in zones)


# Category key: which tag and value make something worth finding. Order matters (first match wins).
CATEGORY_KEYS = ("amenity", "shop", "tourism", "leisure", "historic", "office", "healthcare", "craft", "railway", "public_transport", "building")
SKIP = {
    "amenity": {"bench", "waste_basket", "bicycle_parking", "parking_space", "vending_machine", "recycling", "post_box", "telephone", "grit_bin", "motorcycle_parking", "parking_entrance", "drinking_water", "clock", "letter_box", "shelter", "hunting_stand", "waste_disposal", "loading_dock"},
    "building": {"yes", "residential", "house", "apartments", "terrace", "garage", "garages", "roof", "shed", "industrial", "commercial", "retail", "construction"},
    "public_transport": {"stop_position", "platform"},
}
# Unnamed things still worth finding by category.
UNNAMED_OK = {("amenity", "toilets"), ("amenity", "atm"), ("amenity", "pharmacy")}

ACCESS_TAGS = ("wheelchair", "toilets:wheelchair", "wheelchair:description", "step_count", "entrance", "automatic_door", "door", "changing_table", "hearing_loop", "toilets", "level")

places = []
addresses = []
postcodes = defaultdict(list)
seen = set()


def category(tags):
    for k in CATEGORY_KEYS:
        v = tags.get(k)
        if k == "railway" and v not in ("station", "halt", "subway_entrance", "tram_stop"):
            continue
        if v and v not in SKIP.get(k, ()):  # noqa: SIM102
            if k == "public_transport" and v == "station":
                return "railway", "station"
            return k, v
    if tags.get("highway") == "bus_stop":
        return "highway", "bus_stop"
    return None


def date_of(o, tags):
    """(date, how): a mapper's check date when there is one, else the element's last edit."""
    for k in ("check_date:wheelchair", "check_date", "survey:date"):
        if tags.get(k):
            return tags[k][:10], "checked"
    try:
        return o.timestamp.strftime("%Y-%m-%d"), "edited"
    except Exception:  # noqa: BLE001
        return None, None


def address(tags):
    hn, st = tags.get("addr:housenumber"), tags.get("addr:street")
    if not st:
        return None
    return f"{hn} {st}" if hn else st


def record(o, tags, lon, lat):
    if not inside(lon, lat):
        return
    pc = tags.get("addr:postcode")
    if pc:
        postcodes[pc.upper().replace("  ", " ").strip()].append((lon, lat))
    name = tags.get("name")
    cat = category(tags)
    addr = address(tags)
    if cat and (name or cat in UNNAMED_OK):
        key = (name, cat, round(lon, 4), round(lat, 4))
        if key in seen:
            return
        seen.add(key)
        p = {"n": name or "", "c": f"{cat[0]}={cat[1]}", "x": round(lon, 6), "y": round(lat, 6)}
        acc = {k: tags[k] for k in ACCESS_TAGS if k in tags}
        if acc:
            p["a"] = acc
        if addr:
            p["ad"] = addr + (f", {pc}" if pc else "")
        p["d"], how = date_of(o, tags)
        if how == "checked":
            p["dk"] = 1
        p["id"] = f"{o.__class__.__name__[0].lower()}{o.id}"
        places.append(p)
    elif addr and tags.get("addr:housenumber"):
        key = (addr, round(lon, 4), round(lat, 4))
        if key in seen:
            return
        seen.add(key)
        addresses.append({"n": addr, "pc": pc, "x": round(lon, 6), "y": round(lat, 6)})


def centroid(nodes):
    xs, ys, n = 0.0, 0.0, 0
    for nd in nodes:
        try:
            xs += nd.lon
            ys += nd.lat
            n += 1
        except osmium.InvalidLocationError:
            continue
    return (xs / n, ys / n) if n else None


class H(osmium.SimpleHandler):
    def node(self, n):
        if len(n.tags) and n.location.valid():
            record(n, dict(n.tags), n.location.lon, n.location.lat)

    def way(self, w):
        if not len(w.tags):
            return
        tags = dict(w.tags)
        if not (category(tags) or "addr:housenumber" in tags):
            return
        c = centroid(w.nodes)
        if c:
            record(w, tags, *c)


for path in cfg["inputs"]:
    H().apply_file(path, locations=True)

pcs = [{"n": pc, "x": round(sum(p[0] for p in pts) / len(pts), 6), "y": round(sum(p[1] for p in pts) / len(pts), 6)} for pc, pts in postcodes.items() if len(pc) >= 5]
out = {"places": places, "addresses": addresses, "postcodes": pcs}
with open(cfg["out"], "w") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
print(f"{len(places)} places, {len(addresses)} addresses, {len(pcs)} postcodes")
