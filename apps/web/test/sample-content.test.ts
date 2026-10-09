import { categoryInfo, evidence, reportLevel, REVIEW_MAX_CHARS } from "@causeway/graph";
import { afterEach, describe, expect, it } from "vitest";
import { CITIES } from "../src/lib/cities";
import { isSample, loadShowSamples, realOnly, sampleReports, saveShowSamples, SAMPLE_PREFIX } from "../src/lib/sample-content";

describe("sample content (FEAT-49)", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const samples = sampleReports("edinburgh", now);

  it("has sample reports in the default area, each marked as a sample", () => {
    expect(samples.length).toBeGreaterThanOrEqual(8);
    for (const r of samples) {
      expect(r.sample).toBe(true);
      expect(r.id.startsWith(SAMPLE_PREFIX)).toBe(true);
      expect(r.shared).toBe(false);
      expect(r.own).toBeUndefined();
      expect(isSample(r)).toBe(true);
    }
    expect(new Set(samples.map((r) => r.id)).size).toBe(samples.length);
  });

  it("sits inside central Edinburgh, near the default start", () => {
    const start = CITIES.find((c) => c.id === "edinburgh")!.start;
    for (const r of samples) {
      expect(Math.abs(r.lon - start.lon)).toBeLessThan(0.03);
      expect(Math.abs(r.lat - start.lat)).toBeLessThan(0.02);
    }
  });

  it("says its words are an example, and keeps to the review limit", () => {
    for (const r of samples) if (r.text) expect(r.text.startsWith("Example review:")).toBe(true), expect(r.text.length).toBeLessThanOrEqual(REVIEW_MAX_CHARS);
  });

  it("covers good and bad, and stays fresh: nothing has faded", () => {
    expect(new Set(samples.map((r) => categoryInfo(r.category).polarity))).toEqual(new Set(["good", "bad"]));
    for (const r of samples) expect(reportLevel(evidence(r, now))).not.toBe("faded");
  });

  it("has none for the other cities yet", () => {
    expect(sampleReports("newcastle")).toEqual([]);
  });

  it("realOnly drops samples, for routes and counts", () => {
    const real = { id: "0e2e0000-0000-4000-8000-000000000001", sample: undefined };
    expect(realOnly([real, ...samples])).toEqual([real]);
    // By id too, should a sample ever lose its flag.
    expect(realOnly([{ id: `${SAMPLE_PREFIX}x` }])).toEqual([]);
  });

  describe("Show sample content", () => {
    const store = new Map<string, string>();
    const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    afterEach(() => {
      store.clear();
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it("is on by default and remembers off", () => {
      (globalThis as { localStorage?: unknown }).localStorage = local;
      expect(loadShowSamples()).toBe(true);
      saveShowSamples(false);
      expect(loadShowSamples()).toBe(false);
      saveShowSamples(true);
      expect(loadShowSamples()).toBe(true);
    });

    it("falls back to on when storage is blocked", () => {
      expect(loadShowSamples()).toBe(true);
      expect(() => saveShowSamples(false)).not.toThrow();
    });
  });
});
