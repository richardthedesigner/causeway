import { formatDistance } from "@causeway/profile";
import { describe, expect, it } from "vitest";

// SMALL-18: the distance beside a search result goes through the one formatter (D-074).
describe("search result distances", () => {
  it("reads metres and kilometres in km mode", () => {
    expect(formatDistance(4, "kmh")).toBe("10 m");
    expect(formatDistance(240, "kmh")).toBe("240 m");
    expect(formatDistance(1380, "kmh")).toBe("1.4 km");
  });

  it("reads yards and miles in miles mode, never metres", () => {
    expect(formatDistance(100, "mph")).toBe("110 yd");
    expect(formatDistance(1380, "mph")).toBe("0.9 miles");
    expect(formatDistance(6900, "mph")).toBe("4.3 miles");
    for (const m of [4, 240, 950, 1380, 12000]) expect(formatDistance(m, "mph")).not.toMatch(/\d (m|km)$/);
  });
});
