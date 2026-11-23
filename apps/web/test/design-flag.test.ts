import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_V3_KEY, readDesignV3 } from "../src/lib/design-flag";

/** An in-memory stand-in for localStorage. */
function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const broken = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
};

describe("design v3 flag (FEAT-65)", () => {
  it("is off by default", () => {
    const s = memory();
    expect(readDesignV3({ search: "", store: s })).toBe(false);
    expect(readDesignV3({})).toBe(false);
    expect(s.m.size).toBe(0);
  });

  it("turns on with ?v3 and remembers it", () => {
    const s = memory();
    expect(readDesignV3({ search: "?v3", store: s })).toBe(true);
    expect(s.m.get(DESIGN_V3_KEY)).toBe("1");
    expect(readDesignV3({ search: "", store: s })).toBe(true);
  });

  it("reads ?v3 beside other parameters, and ?v3=1", () => {
    expect(readDesignV3({ search: "?to=grassmarket&v3", store: memory() })).toBe(true);
    expect(readDesignV3({ search: "v3=1", store: memory() })).toBe(true);
  });

  it("isn't fooled by a parameter that only looks like it", () => {
    const s = memory();
    expect(readDesignV3({ search: "?v30&xv3=1&q=v3", store: s })).toBe(false);
    expect(s.m.size).toBe(0);
  });

  it("forgets with ?v3=0", () => {
    const s = memory({ [DESIGN_V3_KEY]: "1" });
    expect(readDesignV3({ search: "?v3=0", store: s })).toBe(false);
    expect(readDesignV3({ search: "", store: s })).toBe(false);
  });

  it("is on when the build says so, whatever is stored or asked", () => {
    expect(readDesignV3({ env: "1" })).toBe(true);
    expect(readDesignV3({ env: "1", search: "?v3=0", store: memory() })).toBe(true);
    expect(readDesignV3({ env: "0", store: memory() })).toBe(false);
    expect(readDesignV3({ env: "true", store: memory() })).toBe(false);
  });

  it('only counts a stored "1"', () => {
    expect(readDesignV3({ store: memory({ [DESIGN_V3_KEY]: "0" }) })).toBe(false);
    expect(readDesignV3({ store: memory({ [DESIGN_V3_KEY]: "yes" }) })).toBe(false);
  });

  it("survives storage that throws", () => {
    expect(readDesignV3({ search: "?v3", store: broken })).toBe(true);
    expect(readDesignV3({ search: "", store: broken })).toBe(false);
    expect(readDesignV3({ search: "?v3=0", store: broken })).toBe(false);
  });
});

describe("designV3(), the read-once wrapper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off during the export, where there is no window, and on if the build says so", async () => {
    const { designV3 } = await import("../src/lib/design-flag");
    expect(designV3()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DESIGN_V3", "1");
    expect(designV3()).toBe(true);
  });

  it("reads the address and storage once", async () => {
    vi.resetModules();
    const s = memory();
    const location = { search: "?v3" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("localStorage", s);
    const { designV3 } = await import("../src/lib/design-flag");
    expect(designV3()).toBe(true);
    expect(s.m.get(DESIGN_V3_KEY)).toBe("1");
    location.search = "?v3=0";
    expect(designV3()).toBe(true);
    expect(s.m.get(DESIGN_V3_KEY)).toBe("1");
  });

  it("is off when reaching localStorage throws", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { location: { search: "" } });
    const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    try {
      const { designV3 } = await import("../src/lib/design-flag");
      expect(designV3()).toBe(false);
    } finally {
      if (had) Object.defineProperty(globalThis, "localStorage", had);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
