/**
 * Acceptance journeys, as data. Each is reproducible against the committed
 * snapshot; the live variant (Phase 3) re-runs the same journeys against a
 * freshly built graph with live overlays.
 *
 * Coordinates are public places, not private addresses.
 */
export interface Journey {
  id: string;
  title: string;
  from: { label: string; lon: number; lat: number };
  to: { label: string; lon: number; lat: number };
}

export const EDINBURGH_JOURNEYS: Journey[] = [
  {
    id: "waverley-grassmarket",
    title: "Waverley Station to the Grassmarket",
    from: { label: "Edinburgh Waverley concourse", lon: -3.1893, lat: 55.952 },
    to: { label: "Grassmarket", lon: -3.196, lat: 55.9476 },
  },
  {
    id: "royal-mile-victoria-street",
    title: "Royal Mile (High Street) to Victoria Street",
    from: { label: "High Street by St Giles'", lon: -3.1907, lat: 55.9496 },
    to: { label: "Victoria Street", lon: -3.1937, lat: 55.9484 },
  },
  {
    id: "market-street-high-street",
    title: "Market Street to the High Street (the Cockburn Street climb)",
    from: { label: "Waverley Market Street entrance", lon: -3.1905, lat: 55.9513 },
    to: { label: "High Street at Cockburn Street", lon: -3.1883, lat: 55.9502 },
  },
];

/** Phase 1 area journeys (central Edinburgh graph). Causewayside is the demo address. */
export const EDINBURGH_CENTRAL_JOURNEYS: Journey[] = [
  ...EDINBURGH_JOURNEYS,
  {
    id: "causewayside-museum",
    title: "Causewayside to the National Museum of Scotland",
    from: { label: "Causewayside", lon: -3.1812, lat: 55.9385 },
    to: { label: "National Museum of Scotland, Chambers Street", lon: -3.1897, lat: 55.9469 },
  },
  {
    id: "causewayside-waverley",
    title: "Causewayside to Waverley Station",
    from: { label: "Causewayside", lon: -3.1812, lat: 55.9385 },
    to: { label: "Edinburgh Waverley concourse", lon: -3.1893, lat: 55.952 },
  },
];

/**
 * The origin journey: a city-centre hotel to BALTIC (which is in Gateshead).
 * "If Causewayside cannot do this one well, nothing else matters."
 */
export const NEWCASTLE_JOURNEYS: Journey[] = [
  {
    id: "grey-street-baltic",
    title: "Grey Street to BALTIC Centre for Contemporary Art",
    from: { label: "Grey Street (city-centre hotels)", lon: -1.6123, lat: 54.9722 },
    to: { label: "BALTIC Centre for Contemporary Art, Gateshead", lon: -1.5977, lat: 54.969 },
  },
];

/** London: wheeling plus step-free Underground, where a live lift outage at an interchange forces a reroute. */
export const LONDON_JOURNEYS: Journey[] = [
  {
    id: "parliament-square-canada-square",
    title: "Parliament Square to Canada Square, Canary Wharf",
    from: { label: "Parliament Square", lon: -0.1263, lat: 51.5007 },
    to: { label: "Canada Square, Canary Wharf", lon: -0.0195, lat: 51.5049 },
  },
];
