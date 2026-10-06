import { describe, expect, it } from "vitest";
import { REPORT_KINDS, reportDetail, whatsThereQuestions } from "../src/lib/reports";

describe("report what's there (FEAT-03)", () => {
  it("asks one question for each thing we don't know, in the router's order", () => {
    const qs = whatsThereQuestions([
      { attr: "surface", detail: "surface not known" },
      { attr: "kerb", detail: "kerb at crossing not mapped" },
      { attr: "surface", detail: "surface not known" },
    ]);
    expect(qs.map((q) => q.attr)).toEqual(["surface", "kerb"]);
    expect(qs[1]).toMatchObject({ detail: "kerb at crossing not mapped", question: "What are the kerbs like?" });
  });

  it("treats unmapped kerbs at side roads as a kerb question, and merges it with a kerb we already ask about", () => {
    expect(whatsThereQuestions([{ attr: "pavement", detail: "kerbs at side roads not mapped" }]).map((q) => q.attr)).toEqual(["kerb"]);
    expect(whatsThereQuestions([{ attr: "pavement", detail: "pavement not mapped" }]).map((q) => q.attr)).toEqual(["pavement"]);
    expect(whatsThereQuestions([{ attr: "kerb", detail: "kerb type not known" }, { attr: "pavement", detail: "kerbs at side roads not mapped" }])).toHaveLength(1);
  });

  it("asks nothing about what a person on the street can't see", () => {
    expect(whatsThereQuestions([{ attr: "live", detail: "no live lift status" }, { attr: "scooter", detail: "check the operator's size rules" }])).toEqual([]);
  });

  it("puts the street and the answers into the line sent for triage", () => {
    expect(reportDetail({ note: "", about: { place: "Jawbone Walk", answers: [{ attr: "surface", question: "What's the surface like?", answer: "Setts or cobbles" }] } })).toBe("On Jawbone Walk. What's the surface like? Setts or cobbles.");
    expect(reportDetail({ note: "Bins on Tuesdays" })).toBe("Bins on Tuesdays");
    expect(reportDetail({ note: "" })).toBeNull();
  });

  it("keeps what's there off the problem list", () => {
    expect(REPORT_KINDS.map((k) => k.kind)).not.toContain("whats-there");
  });
});
