import type { Place } from "./plan-types";

export interface City {
  id: string;
  name: string;
  /** Short coverage line shown under the search box. */
  coverage: string;
  graph: string;
  /** Protomaps extract for the base map. */
  basemap: string;
  /** Rail network for live lift outages (London only for now). */
  network?: string;
  liveLifts: boolean;
  weatherAt: [number, number];
  start: Place;
  places: Place[];
  credit: string;
}

const OSM = "Map data © OpenStreetMap contributors (ODbL). Base map: Protomaps.";

export const CITIES: City[] = [
  {
    id: "edinburgh",
    name: "Edinburgh",
    coverage: "Central Edinburgh: Old and New Town, Southside, Stockbridge, Bruntsfield.",
    graph: "graph/edinburgh-central.graph.json.gz",
    basemap: "basemap/edinburgh-central.pmtiles",
    liveLifts: false,
    weatherAt: [55.9486, -3.1999],
    start: { id: "causewayside", name: "Causewayside", kind: "Southside / demo address", lon: -3.1812, lat: 55.9385 },
    places: [
      { id: "waverley", name: "Edinburgh Waverley", kind: "Railway station", lon: -3.1893, lat: 55.952, venue: true },
      { id: "grassmarket", name: "Grassmarket", kind: "Old Town", lon: -3.196, lat: 55.9476 },
      { id: "nms", name: "National Museum of Scotland", kind: "Chambers Street", lon: -3.1897, lat: 55.9469, venue: true },
      { id: "victoria-street", name: "Victoria Street", kind: "Old Town", lon: -3.1937, lat: 55.9484 },
      { id: "st-giles", name: "High Street by St Giles'", kind: "Royal Mile", lon: -3.1907, lat: 55.9496 },
      { id: "meadows", name: "The Meadows", kind: "Park", lon: -3.1925, lat: 55.9405 },
    ],
    credit: `${OSM} Terrain: LiDAR for Scotland, Open Government Licence v3.0.`,
  },
  {
    id: "newcastle",
    name: "Newcastle and Gateshead",
    coverage: "Grey Street and the Monument down to the Quayside, across to Gateshead and BALTIC.",
    graph: "graph/newcastle-gateshead.graph.json.gz",
    basemap: "basemap/newcastle-gateshead.pmtiles",
    liveLifts: false,
    weatherAt: [54.97, -1.607],
    start: { id: "grey-street", name: "Grey Street", kind: "City centre", lon: -1.6123, lat: 54.9722 },
    places: [
      { id: "baltic", name: "BALTIC Centre for Contemporary Art", kind: "Gateshead Quays", lon: -1.5977, lat: 54.969, venue: true },
      { id: "monument", name: "Grey's Monument", kind: "City centre", lon: -1.6127, lat: 54.9738 },
      { id: "quayside", name: "Quayside", kind: "Newcastle riverside", lon: -1.6036, lat: 54.9696 },
      { id: "millennium-bridge", name: "Gateshead Millennium Bridge", kind: "Tilting footbridge", lon: -1.5995, lat: 54.9697 },
    ],
    credit: `${OSM} Terrain: © Environment Agency, Open Government Licence v3.0.`,
  },
  {
    id: "london",
    name: "London",
    coverage: "Westminster and Canary Wharf, joined by the Jubilee line and DLR. More of London later.",
    graph: "graph/london-jubilee.graph.json.gz",
    basemap: "basemap/london-jubilee.pmtiles",
    network: "graph/london-network.json",
    liveLifts: true,
    weatherAt: [51.502, -0.07],
    start: { id: "parliament-square", name: "Parliament Square", kind: "Westminster", lon: -0.1263, lat: 51.5007 },
    places: [
      { id: "canada-square", name: "Canada Square", kind: "Canary Wharf", lon: -0.0195, lat: 51.5049 },
      { id: "westminster-abbey", name: "Westminster Abbey", kind: "Westminster", lon: -0.1275, lat: 51.4994, venue: true },
      { id: "museum-docklands", name: "Museum of London Docklands", kind: "West India Quay", lon: -0.0235, lat: 51.5075, venue: true },
    ],
    credit: `${OSM} Terrain: © Environment Agency, Open Government Licence v3.0. Lines, stations and lift status: Powered by TfL Open Data.`,
  },
];

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0]!;
