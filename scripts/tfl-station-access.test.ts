import { describe, expect, it } from "vitest";
import { boardingOf, parseCsv, trainNote } from "./tfl-station-access.js";

describe("TfL station data (DATA-03)", () => {
  it("reads CSV with quotes, commas and a byte-order mark", () => {
    expect(parseCsv('﻿A,B\r\n1,"two, ""2"""\n3,\n')).toEqual([
      { A: "1", B: 'two, "2"' },
      { A: "3", B: "" },
    ]);
  });

  it("describes the platform-to-train step and gap, the worst across platforms", () => {
    const rows = [
      { MaxStep: "50", MaxGap: "85", DesignatedLevelAccessPoint: "False", LocationOfLevelAccess: "", LevelAccessByManualRamp: "False" },
      { MaxStep: "30", MaxGap: "120", DesignatedLevelAccessPoint: "True", LocationOfLevelAccess: "Centre doors on car 5", LevelAccessByManualRamp: "TRUE" },
    ];
    expect(trainNote(rows)).toBe("Level boarding at centre doors on car 5. Step up to 5 cm and gap up to 12 cm between platform and train. Staff can put out a manual ramp.");
    expect(trainNote([{ MaxStep: "", MaxGap: "" }])).toBeNull();
  });

  it("keeps each platform's step and gap in figures, missing figures as unknown (D-060)", () => {
    const platforms = new Map([
      ["P1", { FriendlyName: "Northbound Platform 1", PlatformNumber: "1" }],
      ["P2", { FriendlyName: "", PlatformNumber: "2" }],
    ]);
    const rows = [
      { PlatformUniqueId: "P1", DirectionTowards: "Stanmore", MinStep: "0", MaxStep: "50", MinGap: "0", MaxGap: "85", DesignatedLevelAccessPoint: "TRUE", LocationOfLevelAccess: "2 centre doors on cars 5 and 6", LevelAccessByManualRamp: "False" },
      { PlatformUniqueId: "P1", DirectionTowards: "Wembley Park", MinStep: "0", MaxStep: "50", MinGap: "0", MaxGap: "85", DesignatedLevelAccessPoint: "TRUE", LocationOfLevelAccess: "2 centre doors on cars 5 and 6", LevelAccessByManualRamp: "False" },
      { PlatformUniqueId: "P2", DirectionTowards: "", MinStep: "", MaxStep: "", MinGap: "", MaxGap: "", DesignatedLevelAccessPoint: "False", LocationOfLevelAccess: "Middle of the train", LevelAccessByManualRamp: "TRUE" },
    ];
    expect(boardingOf(rows, platforms)).toEqual([
      { platform: "Northbound Platform 1", towards: ["Stanmore", "Wembley Park"], stepMm: [0, 50], gapMm: [0, 85], ramp: false, levelAccessAt: "2 centre doors on cars 5 and 6" },
      // A location that isn't a designated level access point isn't offered.
      { platform: "Platform 2", towards: [], stepMm: null, gapMm: null, ramp: true, levelAccessAt: null },
    ]);
  });
});
