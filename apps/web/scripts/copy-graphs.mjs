// Copy the city graphs (and London's rail network), base maps and search indexes into public/ for the app.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/graph", { recursive: true });
for (const n of ["edinburgh-central", "newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/snapshots/${n}.graph.json.gz`, `public/graph/${n}.graph.json.gz`);
copyFileSync("../../data/transit/london/network.json", "public/graph/london-network.json");
mkdirSync("public/basemap", { recursive: true });
mkdirSync("public/fonts", { recursive: true });
for (const n of ["edinburgh-central", "newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/basemap/${n}.pmtiles`, `public/basemap/${n}.pmtiles`);
copyFileSync("../../data/basemap/fonts/glyphs.json", "public/fonts/glyphs.json");
mkdirSync("public/places", { recursive: true });
for (const n of ["edinburgh-central", "newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/places/${n}.json.gz`, `public/places/${n}.json.gz`);
mkdirSync("public/live", { recursive: true });
for (const n of ["newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/live/${n}.works.json`, `public/live/${n}.works.json`);
for (const n of ["edinburgh-central", "newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/transit/${n}/bus.json`, `public/graph/${n}-bus.json`);
copyFileSync("../../data/council/edinburgh-central.footways.json", "public/graph/edinburgh-central-footways.json");
for (const n of ["newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/live/${n}.flood-areas.json`, `public/live/${n}.flood-areas.json`);
