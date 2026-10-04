import { describe, expect, it } from "vitest";
import { os1km, osGridSquare, scotlandQuadrant } from "@causeway/graph";

describe("OS grid naming", () => {
  it("names Edinburgh's 100 km square", () => {
    expect(osGridSquare(325832, 673858)).toBe("NT");
  });
  it("names other squares correctly (skipping I)", () => {
    expect(osGridSquare(424000, 563000)).toBe("NZ"); // Newcastle
    expect(osGridSquare(530000, 180000)).toBe("TQ"); // London
    expect(osGridSquare(150000, 850000)).toBe("NG"); // Skye
  });
  it("gives the LiDAR quadrant tile for Waverley", () => {
    expect(scotlandQuadrant(325832, 673858)).toBe("NT27SE");
    expect(scotlandQuadrant(324800, 673858)).toBe("NT27SW");
  });
  it("gives a 1 km square reference", () => {
    expect(os1km(325832, 673858)).toBe("NT2573");
  });
});
