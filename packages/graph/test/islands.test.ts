import { describe, expect, it } from "vitest";
import { bridgeIslands, unknownAttr, type Graph, type GraphEdge, type GraphNode } from "../src/index.js";

const node = (id: number, lon: number, lat: number, kind: GraphNode["kind"] = "junction"): GraphNode => ({ id, lon, lat, ele: unknownAttr(), level: 0, kind });
const attrs = () => ({ incline: unknownAttr(), inclineMax: unknownAttr(), crossSlope: unknownAttr(), surface: unknownAttr(), smoothness: unknownAttr(), width: unknownAttr(), stepCount: unknownAttr(), handrail: unknownAttr(), lit: unknownAttr(), covered: unknownAttr(), wheelchair: unknownAttr() }) as GraphEdge["attrs"];
const edge = (id: number, from: number, to: number, name: string | null = null, extra: Partial<GraphEdge> = {}): GraphEdge => ({ id, from, to, kind: "footway", geometry: [], lengthM: 10, name, level: 0, layer: 0, bridge: false, bidirectional: true, attrs: attrs(), ...extra });

// Main network along a street; an island 10 m north whose footway ends at a crossing.
const M = 1 / 111_320;
const graph = (): Graph => ({
  meta: { name: "t", bbox: [0, 0, 1, 1], builtAt: "", sources: [] },
  nodes: [node(1, 0, 0), node(2, 0.0005, 0), node(3, 0.001, 0), node(10, 0.0005, 10 * M, "crossing"), node(11, 0.0005, 40 * M)],
  edges: [edge(1, 1, 2), edge(2, 2, 3), edge(3, 10, 11)],
});

describe("bridgeIslands", () => {
  it("joins a small island across a short gap, as a crossing with nothing claimed", () => {
    const g = graph();
    const r = bridgeIslands(g);
    expect(r.bridged).toBe(1);
    const gap = g.edges.find((e) => e.ref?.startsWith("gap:"))!;
    expect(gap.kind).toBe("crossing");
    expect([gap.from, gap.to].sort((a, b) => a - b)).toEqual([2, 10]);
    expect(Object.values(gap.attrs).every((a) => a.state === "unknown")).toBe(true);
  });

  it("leaves railway platforms, bridges and far islands alone", () => {
    const plat = graph();
    plat.edges[2] = edge(3, 10, 11, "Platform 11");
    expect(bridgeIslands(plat).bridged).toBe(0);
    const up = graph();
    up.edges[2] = edge(3, 10, 11, null, { bridge: true, layer: 1 });
    expect(bridgeIslands(up).bridged).toBe(0);
    expect(bridgeIslands(graph(), { maxGapM: 5 }).bridged).toBe(0);
  });
});
