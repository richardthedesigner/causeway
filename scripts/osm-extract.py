"""
Cut a pedestrian-relevant OSM XML extract out of a PBF for a bbox.

Keeps every way with a highway / platform tag inside the bbox, plus all the
nodes those ways reference (with their tags: kerbs, crossings, lifts), plus
stand-alone entrances, doors, benches and toilets inside the bbox. Tag
interpretation stays in TypeScript (packages/graph/src/osm.ts); this is only
a coarse cut so the XML stays a manageable size.

    python3 scripts/osm-extract.py in.osm.pbf out.osm minlon minlat maxlon maxlat
"""
import sys

import osmium

src, dst = sys.argv[1], sys.argv[2]
minlon, minlat, maxlon, maxlat = map(float, sys.argv[3:7])


def inside(lon: float, lat: float) -> bool:
    return minlon <= lon <= maxlon and minlat <= lat <= maxlat


def wanted(tags) -> bool:
    return "highway" in tags or tags.get("railway") == "platform" or tags.get("public_transport") == "platform"


def poi(tags) -> bool:
    """Stand-alone points we need: entrances and doors, benches, toilets."""
    return (
        "entrance" in tags
        or "door" in tags
        or "automatic_door" in tags
        or tags.get("railway") == "subway_entrance"
        or tags.get("amenity") in ("bench", "toilets")
        or tags.get("leisure") == "picnic_table"
    )


# Pass 1: node locations, to keep ways with at least one node inside the bbox,
# plus stand-alone points of interest inside it.
locs: dict[int, tuple[float, float]] = {}
keep_nodes: set[int] = set()
for n in osmium.FileProcessor(src, osmium.osm.NODE):
    if inside(n.location.lon, n.location.lat):
        locs[n.id] = (n.location.lon, n.location.lat)
        if poi(n.tags):
            keep_nodes.add(n.id)

keep_ways = 0
writer = osmium.SimpleWriter(dst, overwrite=True)
ways = []
for w in osmium.FileProcessor(src, osmium.osm.WAY):
    if not wanted(w.tags):
        continue
    refs = [r.ref for r in w.nodes]
    if not any(r in locs for r in refs):
        continue
    keep_nodes.update(refs)
    ways.append(osmium.osm.mutable.Way(id=w.id, version=w.version, timestamp=w.timestamp, nodes=refs, tags={t.k: t.v for t in w.tags}))
    keep_ways += 1

for n in osmium.FileProcessor(src, osmium.osm.NODE):
    if n.id in keep_nodes:
        writer.add_node(n)
for w in ways:
    writer.add_way(w)
writer.close()
print(f"{keep_ways} ways, {len(keep_nodes)} nodes -> {dst}", file=sys.stderr)
