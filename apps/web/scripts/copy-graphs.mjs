// Copy the city graphs (and London's rail network) into public/graph for the app.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/graph", { recursive: true });
for (const n of ["edinburgh-central", "newcastle-gateshead", "london-jubilee"]) copyFileSync(`../../data/snapshots/${n}.graph.json.gz`, `public/graph/${n}.graph.json.gz`);
copyFileSync("../../data/transit/london/network.json", "public/graph/london-network.json");
