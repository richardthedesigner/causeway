import { describe, expect, it } from "vitest";
import { liveFailedLine } from "../src/lib/live-status";

describe("the route card when a TfL feed couldn't be checked (D-061)", () => {
  it("names which feed, and says to check", () => {
    expect(liveFailedLine(false, "stations")).toBe("Couldn't get live station disruptions from TfL. Check before you travel.");
    expect(liveFailedLine(false, "lines")).toBe("Couldn't get live line status from TfL. Check before you travel.");
    expect(liveFailedLine(false, "both")).toBe("Couldn't get live station and line disruptions from TfL. Check before you travel.");
    expect(liveFailedLine(true, null)).toBe("Couldn't get live lift status from TfL. Check before you travel.");
    expect(liveFailedLine(true, "both")).toBe("Couldn't get live lift status or station and line disruptions from TfL. Check before you travel.");
  });

  it("says nothing when every feed answered", () => {
    expect(liveFailedLine(false, null)).toBeNull();
  });
});
