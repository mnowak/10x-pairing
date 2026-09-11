import type { MatrixGridData } from "@/lib/matrix";

export type ArmyId = string;

export interface MatchSuggestionProvider {
  suggestDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId;
  suggestAttackerPair(ourAvailable: ArmyId[], theirDefender: ArmyId, matrixGrid: MatrixGridData): [ArmyId, ArmyId];
  suggestAcceptedAttacker(
    ourDefender: ArmyId,
    theirOfferedPair: [ArmyId, ArmyId],
    ourAvailable: ArmyId[],
    matrixGrid: MatrixGridData,
  ): ArmyId;
}

function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick a suggestion from an empty list of available armies");
  }
  return items[Math.floor(Math.random() * items.length)];
}

function pickTwoDistinct(items: readonly ArmyId[]): [ArmyId, ArmyId] {
  if (items.length < 2) {
    throw new Error("Need at least 2 available armies to offer an attacker pair");
  }
  const first = pickRandom(items);
  const second = pickRandom(items.filter((id) => id !== first));
  return [first, second];
}

/**
 * Increment 1's placeholder suggestion logic: picks uniformly at random
 * among the armies it's given, ignoring the matrix entirely. A follow-up
 * change (S-06 on the roadmap) swaps this implementation for one that
 * weighs the immediate matchup against the downstream refused-attacker
 * impact (PRD FR-013), behind this same MatchSuggestionProvider interface.
 */
export const randomSuggestionProvider: MatchSuggestionProvider = {
  suggestDefender: (ourAvailable) => pickRandom(ourAvailable),
  suggestAttackerPair: (ourAvailable) => pickTwoDistinct(ourAvailable),
  suggestAcceptedAttacker: (_ourDefender, theirOfferedPair) => pickRandom(theirOfferedPair),
};
