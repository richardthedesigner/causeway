"use client";
import { useEffect, useState } from "react";
import type { City } from "./cities";
import type { Place } from "./plan-types";
import { buildIndex, type Index, type PlacesFile } from "./search";

/** Load a city's search index (places, addresses, postcodes) and merge in the street names from its graph. */
export function usePlaces(city: City, streets: Place[] | null): Index | null {
  const [file, setFile] = useState<PlacesFile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFile(null);
    setFailed(false);
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
  }, [city]);
  const [index, setIndex] = useState<Index | null>(null);
  useEffect(() => {
    if (!streets) return setIndex(null);
    // Without the index file the streets and demo places still search.
    if (file || failed) setIndex(buildIndex(file, streets));
  }, [file, failed, streets]);
  return index;
}
