import { describe, expect, it } from "vitest";
import { bandToScore, scoreToBand, type ColorBand } from "@/lib/colorBands";

// Oracle: the captain-confirmed palette recorded independently of this
// implementation at context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44
// — red 0-3, orange 4-8, yellow 9-11, green 12-15, dark-green 16-20.
// Hardcoded here on purpose so a regression to COLOR_BANDS can't silently
// pass by mirroring the very value under test.
const BOUNDARY_CASES: [score: number, band: ColorBand][] = [
  [0, "red"],
  [3, "red"],
  [4, "orange"],
  [8, "orange"],
  [9, "yellow"],
  [11, "yellow"],
  [12, "green"],
  [15, "green"],
  [16, "dark-green"],
  [20, "dark-green"],
];

const ALL_BANDS: ColorBand[] = ["red", "orange", "yellow", "green", "dark-green"];

describe("scoreToBand", () => {
  it.each(BOUNDARY_CASES)("maps score %i to band %s", (score, band) => {
    expect(scoreToBand(score)).toBe(band);
  });

  it("throws for a score below the 0-20 range", () => {
    expect(() => scoreToBand(-1)).toThrow(/outside the 0-20 range/);
  });

  it("throws for a score above the 0-20 range", () => {
    expect(() => scoreToBand(21)).toThrow(/outside the 0-20 range/);
  });
});

describe("bandToScore", () => {
  it.each(ALL_BANDS)("round-trips through scoreToBand for %s", (band) => {
    expect(scoreToBand(bandToScore(band))).toBe(band);
  });

  it("throws for a band outside the confirmed palette", () => {
    const invalidBand = "mauve" as unknown as ColorBand;
    expect(() => bandToScore(invalidBand)).toThrow(/Unknown color band/);
  });
});
