"""
Bus stop facts from OpenStreetMap, keyed by NaPTAN ATCO code so they join
the timetable stops: shelter, seat, tactile paving, kerb, wheelchair.

    python3 scripts/osm-bus-stops.py '{"inputs": [...], "out": "..."}'
"""
import json
import sys

import osmium

cfg = json.loads(sys.argv[1])
YES = {"yes", "designated"}
facts = {}


class H(osmium.SimpleHandler):
    def node(self, n):
        t = n.tags
        if t.get("highway") != "bus_stop" and not (t.get("public_transport") == "platform" and t.get("bus") == "yes"):
            return
        atco = t.get("naptan:AtcoCode")
        if not atco:
            return
        f = {}
        for key, tag in (("shelter", "shelter"), ("bench", "bench"), ("tactile", "tactile_paving"), ("lit", "lit")):
            if tag in t:
                f[key] = t[tag] in YES
        for key, tag in (("kerb", "kerb"), ("kerbHeight", "kerb:height"), ("wheelchair", "wheelchair")):
            if tag in t:
                f[key] = t[tag]
        if f:
            f["date"] = n.timestamp.strftime("%Y-%m")
            facts[atco] = f


for path in cfg["inputs"]:
    H().apply_file(path)
json.dump(facts, open(cfg["out"], "w"))
print(f"{len(facts)} stops with OSM facts")
