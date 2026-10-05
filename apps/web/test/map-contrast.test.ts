import { describe, expect, it } from "vitest";
import { HIGH_CONTRAST, mapContrastOn } from "../src/lib/map-contrast";

/** WCAG relative luminance contrast between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("the high-contrast map (SMALL-05)", () => {
  it("is on for the low-vision device or when the phone asks, unless chosen in the menu", () => {
    expect(mapContrastOn(null, "walking", false)).toBe(false);
    expect(mapContrastOn(null, "visual-impairment", false)).toBe(true);
    expect(mapContrastOn(null, "walking", true)).toBe(true);
    expect(mapContrastOn(false, "visual-impairment", true)).toBe(false);
    expect(mapContrastOn(true, "walking", false)).toBe(true);
  });

  for (const [theme, c] of Object.entries(HIGH_CONTRAST)) {
    it(`${theme}: labels pass AAA, and road edges and buildings stand out from the ground`, () => {
      expect(contrast(c.label, c.labelHalo)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.label, c.ground)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.roadCasing, c.ground)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.building, c.ground)).toBeGreaterThanOrEqual(1.8);
      expect(contrast(c.water, c.ground)).toBeGreaterThanOrEqual(1.8);
    });
  }
});
