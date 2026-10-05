import { describe, expect, it } from "vitest";
import { keepNote } from "./osm-notes-lib.js";

const now = new Date("2026-10-05T00:00:00Z");
const note = (text: string, opened = "2026-01-01 10:00:00 UTC", comments: string[] = []) => ({ text, opened, comments });

describe("which OpenStreetMap notes to keep (D-048)", () => {
  it("keeps a recent note about the ground", () => {
    expect(keepNote(note("The steps here have been removed"), now)).toBe(true);
  });

  it("drops a note over three years old with no comment since, but keeps one commented on lately", () => {
    expect(keepNote(note("Path blocked by a fence", "2022-06-01 10:00:00 UTC"), now)).toBe(false);
    expect(keepNote(note("Path blocked by a fence", "2022-06-01 10:00:00 UTC", ["2025-02-01 09:00:00 UTC"]), now)).toBe(true);
  });

  it("drops StreetComplete's questions about a business, and notes not about the ground", () => {
    expect(keepNote(note("Unable to answer \"What are the opening hours?\" for the gate shop"), now)).toBe(false);
    expect(keepNote(note("Is this place still here? It's beside the steps"), now)).toBe(false);
    expect(keepNote(note("What are the opening hours of the café by the bridge?"), now)).toBe(false);
    expect(keepNote(note("Shop closed down"), now)).toBe(false);
    expect(keepNote(note("onosm.org submitted note from a business: name: Studio by London Bridge"), now)).toBe(false);
  });
});
