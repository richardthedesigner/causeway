import { loadSnapshot } from "@causeway/graph/node";
const g = loadSnapshot("data/snapshots/newcastle-gateshead.graph.json.gz");
for (const e of g.edges.filter((e) => e.movable)) console.log(e.osmWayId, e.kind, e.name, e.movable, e.lengthM.toFixed(0));
