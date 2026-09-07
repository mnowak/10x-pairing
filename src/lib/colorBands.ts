export type ColorBand = "red" | "orange" | "yellow" | "green" | "dark-green";

interface BandRange {
  band: ColorBand;
  min: number;
  max: number;
  representativeScore: number;
}

// Custom palette (confirmed 2026-09-07) — the original discovery worksheet's
// ranges overlap (orange 5-10 / yellow 8-12, yellow 8-12 / green 11-15) and
// can't be used verbatim for a deterministic score-to-color mapping.
export const COLOR_BANDS: BandRange[] = [
  { band: "red", min: 0, max: 3, representativeScore: 2 },
  { band: "orange", min: 4, max: 8, representativeScore: 6 },
  { band: "yellow", min: 9, max: 11, representativeScore: 10 },
  { band: "green", min: 12, max: 15, representativeScore: 14 },
  { band: "dark-green", min: 16, max: 20, representativeScore: 18 },
];

export function scoreToBand(score: number): ColorBand {
  const match = COLOR_BANDS.find((range) => score >= range.min && score <= range.max);
  if (!match) {
    throw new Error(`Score ${score} is outside the 0-20 range`);
  }
  return match.band;
}

export function bandToScore(band: ColorBand): number {
  const match = COLOR_BANDS.find((range) => range.band === band);
  if (!match) {
    throw new Error(`Unknown color band: ${band}`);
  }
  return match.representativeScore;
}
