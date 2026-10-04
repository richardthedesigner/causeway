import { describe, expect, it } from "vitest";
import { leaveLabel, nextAt } from "../src/lib/leave";

const now = new Date("2026-10-04T17:10:00+01:00");

describe("leaving later", () => {
  it("finds the next time the clock reads hh:mm", () => {
    expect(nextAt("18:30", now)!.toISOString()).toBe("2026-10-04T17:30:00.000Z");
    expect(nextAt("08:30", now)!.toISOString()).toBe("2026-10-05T07:30:00.000Z");
    expect(nextAt("nonsense", now)).toBeNull();
  });
  it("labels today, tomorrow and now", () => {
    expect(leaveLabel(null, now)).toBe("now");
    expect(leaveLabel(nextAt("18:30", now), now)).toBe("18:30");
    expect(leaveLabel(nextAt("08:30", now), now)).toBe("tomorrow 08:30");
  });
});
