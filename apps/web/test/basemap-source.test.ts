import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PMTiles } from "pmtiles";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RangeSource } from "../src/lib/basemap-source";

const FILE = readFileSync(join(import.meta.dirname, "../../../data/basemap/newcastle-gateshead.pmtiles"));
const WHOLE = FILE.buffer.slice(FILE.byteOffset, FILE.byteOffset + FILE.byteLength) as ArrayBuffer;
const URL_ = "https://example.test/basemap/newcastle-gateshead.pmtiles";

type Mode = "ranges" | "no-ranges" | "offline-ranges";

/** A host serving the file: in ranges (like Vercel), whole whatever is asked, or whole only. Records what was asked. */
function host(mode: Mode, etag = '"v1"') {
  const asked: { range: string | null; bytes: number }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    if (range && mode === "offline-ranges") throw new TypeError("Failed to fetch");
    if (range && mode === "ranges") {
      const [a, b] = range.replace("bytes=", "").split("-").map(Number);
      const body = WHOLE.slice(a, Math.min(b, WHOLE.byteLength - 1) + 1);
      asked.push({ range, bytes: body.byteLength });
      return new Response(body, { status: 206, headers: { etag } });
    }
    asked.push({ range, bytes: WHOLE.byteLength });
    return new Response(WHOLE.slice(0), { status: 200, headers: { etag } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

const tileAt = async (pm: PMTiles) => {
  const h = await pm.getHeader();
  // A tile in the middle of the city at the zoom the map opens on.
  const z = 14;
  const lon = (h.minLon + h.maxLon) / 2;
  const lat = (h.minLat + h.maxLat) / 2;
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  return pm.getZxy(z, x, y);
};

describe("base map in byte ranges (D-079)", () => {
  it("draws a tile from a few small ranges, not the whole file, and the bytes match the file", async () => {
    const asked = host("ranges");
    const tile = await tileAt(new PMTiles(new RangeSource(URL_, "t1")));
    expect(tile?.data.byteLength).toBeGreaterThan(0);
    expect(asked.every((a) => a.range !== null)).toBe(true);
    const read = asked.reduce((s, a) => s + a.bytes, 0);
    expect(read).toBeLessThan(WHOLE.byteLength / 10);
    // Same tile as reading the whole file.
    host("no-ranges");
    const whole = await tileAt(new PMTiles(new RangeSource(URL_, "t1b")));
    expect(new Uint8Array(tile!.data)).toEqual(new Uint8Array(whole!.data));
  });

  it("fills in the whole file once, then reads from memory with no more requests", async () => {
    const asked = host("ranges");
    const source = new RangeSource(URL_, "t2");
    const pm = new PMTiles(source);
    await pm.getHeader();
    await Promise.all([source.fill(), source.fill()]);
    expect(asked.filter((a) => a.range === null)).toHaveLength(1);
    const before = asked.length;
    expect(await tileAt(pm)).toBeTruthy();
    expect(asked.length).toBe(before);
  });

  it("uses the whole file when the host ignores Range", async () => {
    const asked = host("no-ranges");
    const source = new RangeSource(URL_, "t3");
    expect(await tileAt(new PMTiles(source))).toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("falls back to the whole file when a range read fails", async () => {
    const asked = host("offline-ranges");
    expect(await tileAt(new PMTiles(new RangeSource(URL_, "t4")))).toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("reads the header again when the file changes under it (a data refresh)", async () => {
    host("ranges", '"v1"');
    const source = new RangeSource(URL_, "t5");
    const pm = new PMTiles(source);
    await pm.getHeader();
    host("ranges", '"v2"');
    expect(await tileAt(pm)).toBeTruthy();
    expect((await pm.getHeader()).etag).toBe('"v2"');
  });

  it("starts from a preloaded file (the base64 preview host) without fetching", async () => {
    const asked = host("ranges");
    expect(await tileAt(new PMTiles(new RangeSource(URL_, "t6", WHOLE.slice(0))))).toBeTruthy();
    expect(asked).toHaveLength(0);
  });
});
