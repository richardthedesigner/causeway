import { EtagMismatch, type RangeResponse, type Source } from "pmtiles";

/** A strong ETag, or nothing: a weak one can't tell two versions of the bytes apart. */
const strongEtag = (res: Response) => {
  const e = res.headers.get("etag");
  return e && !e.startsWith("W/") ? e : undefined;
};

/**
 * Reads a .pmtiles archive in byte ranges (D-079), so the map can draw once the header,
 * the directories and the tiles in view have arrived, not the whole file. `fill()` then
 * fetches the whole file: the service worker caches it for offline (D-023), and later
 * reads come from memory. A host that ignores Range (a 200 with the whole file), or a
 * range read that fails, falls back to the whole file, which is how it loaded before.
 */
export class RangeSource implements Source {
  private buf: { data: ArrayBuffer; etag?: string } | null = null;
  private whole: Promise<void> | null = null;

  constructor(private readonly url: string, private readonly key: string, preloaded?: ArrayBuffer) {
    if (preloaded) this.buf = { data: preloaded };
  }

  getKey() {
    return this.key;
  }

  /** Fetch the whole file once (again only if it failed). Resolves when it is in memory. */
  fill(): Promise<void> {
    this.whole ??= fetch(this.url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`basemap: HTTP ${res.status}`);
        this.buf = { data: await res.arrayBuffer(), etag: strongEtag(res) };
      })
      .catch((e: unknown) => {
        this.whole = null;
        throw e;
      });
    return this.whole;
  }

  private slice(offset: number, length: number, etag?: string): RangeResponse {
    const b = this.buf!;
    // The file changed under the archive's header (a data refresh): PMTiles reads the header again.
    if (etag && b.etag && etag !== b.etag) throw new EtagMismatch("basemap changed");
    return { data: b.data.slice(offset, offset + length), etag: b.etag };
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    if (this.buf) return this.slice(offset, length, etag);
    let res: Response;
    try {
      res = await fetch(this.url, { headers: { range: `bytes=${offset}-${offset + length - 1}` }, signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      await this.fill();
      return this.slice(offset, length, etag);
    }
    if (res.status === 206) {
      const got = strongEtag(res);
      if (etag && got && got !== etag) throw new EtagMismatch("basemap changed");
      return { data: await res.arrayBuffer(), etag: got };
    }
    if (res.status === 200) {
      // No byte serving here: this response is the whole file, so keep it.
      this.buf = { data: await res.arrayBuffer(), etag: strongEtag(res) };
      this.whole ??= Promise.resolve();
      return this.slice(offset, length, etag);
    }
    // Anything else (a 416 past the end, an old service worker's error): try the whole file.
    await this.fill();
    return this.slice(offset, length, etag);
  }
}
