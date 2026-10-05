import type { Place } from "./plan-types";

export interface City {
  id: string;
  name: string;
  /** Short coverage line shown under the search box. */
  coverage: string;
  graph: string;
  /** Protomaps extract for the base map. */
  basemap: string;
  /** Search index: places with access tags, addresses, postcodes (scripts/build-places.ts). */
  index: string;
  /** Bus network from BODS GTFS (scripts/build-bus.ts). */
  bus?: string;
  /** Street works on pavements: Street Manager in England (scripts/build-works.ts), the Scottish Road Works Register in Edinburgh (scripts/build-srwr.ts). */
  works?: string;
  /** Rail network for live lift outages (London only for now). */
  network?: string;
  /** Council footway surfaces and widths, a separate layer joined at load (DATA-06, D-008). Edinburgh only. */
  footways?: string;
  /** Environment Agency flood areas over our paths, for live flood warnings (DATA-07). England only. */
  floods?: string;
  /** Park gates from OS Open Greenspace (DATA-08). */
  greenspace?: string;
  /** Open OpenStreetMap notes about the ground, from the build (DATA-08). */
  osmNotes?: string;
  /** The Great British Public Toilet Map, cut to this city (DATA-09). */
  toiletMap?: string;
  liveLifts: boolean;
  weatherAt: [number, number];
  start: Place;
  places: Place[];
  credit: string;
}

const OSM = "Map data © OpenStreetMap contributors (ODbL). Base map: Protomaps. Extra places: Overture Maps Foundation (CDLA Permissive 2.0). Bus timetables: Bus Open Data Service, Open Government Licence v3.0. Toilets: Great British Public Toilet Map, Public Convenience Ltd (CC BY 4.0). Starting limits for kerbs and rest stops: Inclusive Mobility (Department for Transport, 2021), Open Government Licence v3.0.";

export const CITIES: City[] = [
  {
    id: "edinburgh",
    name: "Edinburgh",
    coverage: "Central Edinburgh: Old and New Town, Southside, Stockbridge, Bruntsfield.",
    graph: "graph/edinburgh-central.graph.json.gz",
    basemap: "basemap/edinburgh-central.pmtiles",
    index: "places/edinburgh-central.json.gz",
    bus: "graph/edinburgh-central-bus.json",
    works: "live/edinburgh-central.works.json",
    footways: "graph/edinburgh-central-footways.json",
    greenspace: "places/edinburgh-central.greenspace.json",
    osmNotes: "places/edinburgh-central.osm-notes.json",
    toiletMap: "places/edinburgh-central.toiletmap.json",
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
    credit: `${OSM} Terrain: LiDAR for Scotland, Open Government Licence v3.0. Pavement surfaces, widths and gritting routes: Copyright City of Edinburgh Council, contains Ordnance Survey data © Crown copyright and database right 2021 and 2026, Open Government Licence v3.0. Road works, street cafés and events: Scottish Road Works Register, Open Government Licence v3.0. Park gates: contains OS data © Crown copyright and database right.`,
  },
  {
    id: "newcastle",
    name: "Newcastle and Gateshead",
    coverage: "Grey Street and the Monument down to the Quayside, across to Gateshead and BALTIC.",
    graph: "graph/newcastle-gateshead.graph.json.gz",
    basemap: "basemap/newcastle-gateshead.pmtiles",
    index: "places/newcastle-gateshead.json.gz",
    bus: "graph/newcastle-gateshead-bus.json",
    works: "live/newcastle-gateshead.works.json",
    floods: "live/newcastle-gateshead.flood-areas.json",
    greenspace: "places/newcastle-gateshead.greenspace.json",
    osmNotes: "places/newcastle-gateshead.osm-notes.json",
    toiletMap: "places/newcastle-gateshead.toiletmap.json",
    liveLifts: false,
    weatherAt: [54.97, -1.607],
    start: { id: "grey-street", name: "Grey Street", kind: "City centre", lon: -1.6123, lat: 54.9722 },
    places: [
      { id: "baltic", name: "BALTIC Centre for Contemporary Art", kind: "Gateshead Quays", lon: -1.5977, lat: 54.969, venue: true },
      { id: "monument", name: "Grey's Monument", kind: "City centre", lon: -1.6127, lat: 54.9738 },
      { id: "quayside", name: "Quayside", kind: "Newcastle riverside", lon: -1.6036, lat: 54.9696 },
      { id: "millennium-bridge", name: "Gateshead Millennium Bridge", kind: "Tilting footbridge", lon: -1.5995, lat: 54.9697 },
    ],
    credit: `${OSM} Terrain: © Environment Agency, Open Government Licence v3.0. Flood warnings: Environment Agency, Open Government Licence v3.0. Park gates: contains OS data © Crown copyright and database right.`,
  },
  {
    id: "london",
    name: "London",
    coverage: "Westminster and Canary Wharf, joined by the Jubilee line and DLR. More of London later.",
    graph: "graph/london-jubilee.graph.json.gz",
    basemap: "basemap/london-jubilee.pmtiles",
    index: "places/london-jubilee.json.gz",
    bus: "graph/london-jubilee-bus.json",
    works: "live/london-jubilee.works.json",
    floods: "live/london-jubilee.flood-areas.json",
    greenspace: "places/london-jubilee.greenspace.json",
    osmNotes: "places/london-jubilee.osm-notes.json",
    toiletMap: "places/london-jubilee.toiletmap.json",
    network: "graph/london-network.json",
    liveLifts: true,
    weatherAt: [51.502, -0.07],
    start: { id: "parliament-square", name: "Parliament Square", kind: "Westminster", lon: -0.1263, lat: 51.5007 },
    places: [
      { id: "canada-square", name: "Canada Square", kind: "Canary Wharf", lon: -0.0195, lat: 51.5049 },
      { id: "westminster-abbey", name: "Westminster Abbey", kind: "Westminster", lon: -0.1275, lat: 51.4994, venue: true },
      { id: "museum-docklands", name: "Museum of London Docklands", kind: "West India Quay", lon: -0.0235, lat: 51.5075, venue: true },
    ],
    credit: `${OSM} Terrain: © Environment Agency, Open Government Licence v3.0. Lines, stations, station toilets and lift status: Powered by TfL Open Data. Flood warnings: Environment Agency, Open Government Licence v3.0. Park gates: contains OS data © Crown copyright and database right.`,
  },
];

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0]!;
