import { describe, expect, it } from "vitest";
import { parseCsv, trainNote } from "./tfl-station-access.js";

describe("TfL station data (DATA-03)", () => {
  it("reads CSV with quotes, commas and a byte-order mark", () => {
    expect(parseCsv('﻿A,B\r\n1,"two, ""2"""\n3,\n')).toEqual([
      { A: "1", B: 'two, "2"' },
      { A: "3", B: "" },
    ]);
  });

  it("describes the platform-to-train step and gap, the worst across platforms", () => {
    const rows = [
      { MaxStep: "50", MaxGap: "85", DesignatedLevelAccessPoint: "False", LevelAccessByManualRamp: "False" },
      { MaxStep: "30", MaxGap: "120", DesignatedLevelAccessPoint: "True", LocationOfLevelAccess: "Centre doors on car 5", LevelAccessByManualRamp: "TRUE" },
    ];
    expect(trainNote(rows)).toBe("Level boarding at centre doors on car 5. Step up to 5 cm and gap up to 12 cm between platform and train. Staff can put out a manual ramp.");
    expect(trainNote([{ MaxStep: "", MaxGap: "" }])).toBeNull();
  });
});
