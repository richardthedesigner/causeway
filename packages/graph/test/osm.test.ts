import { describe, expect, it } from "vitest";
import { buildGraphFromOsm, classifyWay, parseIncline, parseKerbHeightCm, parseOsmXml } from "@causeway/graph/node";

describe("tag parsing", () => {
  it("reads incline in percent and degrees", () => {
    expect(parseIncline("12%")).toBe(12);
    expect(parseIncline("-5%")).toBe(-5);
    expect(parseIncline("5°")).toBeCloseTo(8.75, 1);
    expect(parseIncline("up")).toBeNull();
  });

  it("reads kerb heights in any unit as centimetres", () => {
    expect(parseKerbHeightCm("0.03")).toBe(3);
    expect(parseKerbHeightCm("3 cm")).toBe(3);
    expect(parseKerbHeightCm("30mm")).toBe(3);
    expect(parseKerbHeightCm("12")).toBe(12);
  });
});

describe("classifyWay", () => {
  it("never routes on a road whose pavements are mapped separately", () => {
    expect(classifyWay({ highway: "primary", "sidewalk:both": "separate" })).toBeNull();
  });
  it("uses an unseparated road as a flagged stand-in", () => {
    expect(classifyWay({ highway: "residential" })).toBe("street_proxy");
  });
  it("recognises the pedestrian network", () => {
    expect(classifyWay({ highway: "footway", footway: "sidewalk" })).toBe("sidewalk");
    expect(classifyWay({ highway: "footway", footway: "crossing" })).toBe("crossing");
    expect(classifyWay({ highway: "steps" })).toBe("steps");
    expect(classifyWay({ highway: "footway", access: "private" })).toBeNull();
  });
});

const XML = `<?xml version="1.0"?>
<osm version="0.6">
  <node id="1" lat="55.95" lon="-3.19" timestamp="2024-01-01T00:00:00Z"/>
  <node id="2" lat="55.9501" lon="-3.19" timestamp="2024-01-01T00:00:00Z">
    <tag k="highway" v="elevator"/>
  </node>
  <node id="3" lat="55.9502" lon="-3.19" timestamp="2024-01-01T00:00:00Z"/>
  <node id="4" lat="55.9501" lon="-3.1898" timestamp="2024-01-01T00:00:00Z">
    <tag k="barrier" v="kerb"/><tag k="kerb" v="lowered"/>
  </node>
  <node id="5" lat="55.9501" lon="-3.1896" timestamp="2024-01-01T00:00:00Z"/>
  <way id="10" timestamp="2024-01-01T00:00:00Z"><nd ref="1"/><nd ref="2"/>
    <tag k="highway" v="footway"/><tag k="level" v="0"/><tag k="surface" v="sett"/></way>
  <way id="11" timestamp="2024-01-01T00:00:00Z"><nd ref="2"/><nd ref="3"/>
    <tag k="highway" v="footway"/><tag k="level" v="1"/><tag k="incline" v="6%"/></way>
  <way id="12" timestamp="2024-01-01T00:00:00Z"><nd ref="1"/><nd ref="4"/><nd ref="5"/>
    <tag k="highway" v="footway"/><tag k="footway" v="crossing"/></way>
</osm>`;

describe("buildGraphFromOsm", () => {
  const g = buildGraphFromOsm(parseOsmXml(XML), { name: "t", bbox: [0, 0, 0, 0], snapshot: "test" });

  it("turns a lift node between levels into an explicit vertical edge", () => {
    const lifts = g.edges.filter((e) => e.kind === "elevator");
    expect(lifts).toHaveLength(1);
    const levels = lifts.map((e) => [g.nodes.find((n) => n.id === e.from)!.level, g.nodes.find((n) => n.id === e.to)!.level]);
    expect(levels[0]!.sort()).toEqual([0, 1]);
  });

  it("splits ways at kerb nodes and keeps the kerb facts with their source", () => {
    const kerb = g.nodes.find((n) => n.osmId === 4)!;
    expect(kerb.kind).toBe("kerb");
    expect(kerb.kerb?.type.value).toBe("lowered");
    expect(kerb.kerb?.type.source).toBe("osm");
    expect(g.edges.filter((e) => e.osmWayId === 12)).toHaveLength(2);
  });

  it("keeps unknowns unknown", () => {
    const e = g.edges.find((x) => x.osmWayId === 10)!;
    expect(e.attrs.surface.value).toBe("sett");
    expect(e.attrs.width.state).toBe("unknown");
    expect(e.attrs.incline.state).toBe("unknown");
  });
});

const CROSSINGS = (crossingTags: string, endTags = "") => `<?xml version="1.0"?>
<osm version="0.6">
  <node id="1" lat="55.95" lon="-3.19" timestamp="2024-01-01T00:00:00Z">${endTags}</node>
  <node id="2" lat="55.9501" lon="-3.19" timestamp="2024-01-01T00:00:00Z"/>
  <node id="3" lat="55.9502" lon="-3.19" timestamp="2024-01-01T00:00:00Z"/>
  <way id="20" timestamp="2024-01-01T00:00:00Z"><nd ref="1"/><nd ref="2"/><nd ref="3"/>
    <tag k="highway" v="footway"/><tag k="footway" v="crossing"/>${crossingTags}</way>
</osm>`;
const endKerb = (xml: string) => {
  const g = buildGraphFromOsm(parseOsmXml(xml), { name: "t", bbox: [0, 0, 0, 0], snapshot: "test" });
  return g.nodes.find((n) => n.osmId === 1)!.kerb;
};

describe("UK crossing kerb inference", () => {
  it("infers a dropped kerb at a signal-controlled crossing, as inferred, never verified", () => {
    const k = endKerb(CROSSINGS('<tag k="crossing" v="traffic_signals"/>'));
    expect(k?.type.value).toBe("lowered");
    expect(k?.type.state).toBe("inferred");
    expect(k?.heightCm.state).toBe("unknown");
  });
  it("infers from a zebra crossing reference", () => {
    expect(endKerb(CROSSINGS('<tag k="crossing" v="marked"/><tag k="crossing_ref" v="zebra"/>'))?.type.value).toBe("lowered");
  });
  it("says nothing about an uncontrolled crossing without tactile paving", () => {
    expect(endKerb(CROSSINGS('<tag k="crossing" v="uncontrolled"/>'))).toBeUndefined();
  });
  it("never overrides a mapped kerb", () => {
    const k = endKerb(CROSSINGS('<tag k="crossing" v="traffic_signals"/>', '<tag k="barrier" v="kerb"/><tag k="kerb" v="raised"/>'));
    expect(k?.type.value).toBe("raised");
    expect(k?.type.state).toBe("reported");
  });
});
