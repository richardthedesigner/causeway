"use client";
import { useEffect, useState } from "react";
import type { City } from "./cities";
import type { Place } from "./plan-types";
import { buildIndex, type Index, type PlacesFile } from "./search";
import { mergeStationToilets, type NetworkFile } from "./station-toilets";
import { mergeToiletMap, type ToiletMapFile } from "./toiletmap";

/** Load a city's search index (places, addresses, postcodes) and merge in the street names from its graph. */
export function usePlaces(city: City, streets: Place[] | null): Index | null {
  // These downloads wait for the city's graph, so the graph has the line to itself and "Where to?" comes sooner (SPEED-08, D-077).
  const graphIn = streets !== null;
  const [file, setFile] = useState<PlacesFile | null>(null);
  const [failed, setFailed] = useState(false);
  // The Toilet Map (DATA-09): a bonus, so a failure just leaves OSM's toilets.
  const [loos, setLoos] = useState<ToiletMapFile | null>(null);
  useEffect(() => {
    setLoos(null);
    if (!city.toiletMap || !graphIn) return;
    const ctl = new AbortController();
    fetch(new URL(city.toiletMap, document.baseURI), { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ToiletMapFile>) : null))
      .then(setLoos)
      .catch(() => undefined);
    return () => ctl.abort();
  }, [city, graphIn]);
  // TfL station toilets (DATA-23), from the rail network file the router also loads.
  const [network, setNetwork] = useState<NetworkFile | null>(null);
  useEffect(() => {
    setNetwork(null);
    if (!city.network || !graphIn) return;
    const ctl = new AbortController();
    fetch(new URL(city.network, document.baseURI), { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<NetworkFile>) : null))
      .then(setNetwork)
      .catch(() => undefined);
    return () => ctl.abort();
  }, [city, graphIn]);
  useEffect(() => {
    setFile(null);
    setFailed(false);
    if (!graphIn) return;
    const ctl = new AbortController();
    const b64 = !!process.env.NEXT_PUBLIC_GRAPH_B64;
    const url = new URL(b64 ? city.index.replace(".json.gz", ".b64.txt") : city.index, document.baseURI);
    fetch(url, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const gz = b64 ? new Blob([Uint8Array.from(atob((await res.text()).trim()), (c) => c.charCodeAt(0))]).stream() : res.body!;
        return JSON.parse(await new Response(gz.pipeThrough(new DecompressionStream("gzip"))).text()) as PlacesFile;
      })
      .then(setFile)
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctl.abort();
  }, [city, graphIn]);
  const [index, setIndex] = useState<Index | null>(null);
  useEffect(() => {
    if (!streets) return setIndex(null);
    // Without the index file the streets and demo places still search.
    if (file || failed) {
      const index = buildIndex(file, streets);
      mergeToiletMap(index, loos);
      mergeStationToilets(index, network);
      setIndex(index);
    }
  }, [file, failed, streets, loos, network]);
  return index;
}
