import { bandToScore, type Estimate } from "@/lib/colorBands";
import type { MatrixGridData } from "@/lib/matrix";

export type ArmyId = string;

export interface MatchSuggestionProvider {
  suggestDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId;
  suggestAttackerPair(
    ourAvailable: ArmyId[],
    theirDefender: ArmyId,
    theirAvailable: ArmyId[],
    ourDefender: ArmyId,
    matrixGrid: MatrixGridData,
  ): [ArmyId, ArmyId];
  suggestAcceptedAttacker(
    ourDefender: ArmyId,
    theirOfferedPair: [ArmyId, ArmyId],
    ourAvailable: ArmyId[],
    theirAvailable: ArmyId[],
    matrixGrid: MatrixGridData,
  ): ArmyId;
}

// Purple and an unestimated (blank) cell both score as one point above
// orange's representative score — an explicitly arbitrary choice, not
// derived from data: purple is judged worse than yellow, better than
// orange; a blank cell gets the same treatment since the algorithm has
// equally little signal in both cases.
const NO_SIGNAL_VALUE = 7;

function cellKey(ourArmyId: ArmyId, theirArmyId: ArmyId): string {
  return `${ourArmyId}:${theirArmyId}`;
}

// Exported for direct unit testing of the scoring rule in isolation.
export function cellValue(matrixGrid: MatrixGridData, ourArmyId: ArmyId, theirArmyId: ArmyId): number {
  // Widened to Partial: an arbitrary cellKey may have no stored estimate,
  // which MatrixGridData's plain Record type doesn't reflect.
  const estimates: Partial<Record<string, Estimate>> = matrixGrid.estimates;
  const estimate = estimates[cellKey(ourArmyId, theirArmyId)];
  if (estimate === undefined || estimate === "purple") {
    return NO_SIGNAL_VALUE;
  }
  return bandToScore(estimate);
}

function withoutArmy(list: ArmyId[], id: ArmyId): ArmyId[] {
  return list.filter((armyId) => armyId !== id);
}

function twoCombinations(items: readonly ArmyId[]): [ArmyId, ArmyId][] {
  const pairs: [ArmyId, ArmyId][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

// Both exported for direct unit testing of the tie-break rule in isolation.

/** Sum of `army`'s estimated value against every army in `theirAvailable` — a proxy for how broadly useful it is to keep in reserve. */
export function reserveStrength(matrixGrid: MatrixGridData, army: ArmyId, theirAvailable: ArmyId[]): number {
  return theirAvailable.reduce((sum, theirArmy) => sum + cellValue(matrixGrid, army, theirArmy), 0);
}

/** Picks the candidate with the highest primaryValue; ties broken by the lowest tieBreakValue (a constant tieBreakValue means the first candidate wins every tie). */
export function pickBest<T>(
  candidates: readonly T[],
  primaryValue: (c: T) => number,
  tieBreakValue: (c: T) => number,
): T {
  let best = candidates[0];
  let bestPrimary = primaryValue(best);
  let bestTieBreak = tieBreakValue(best);
  for (const candidate of candidates.slice(1)) {
    const primary = primaryValue(candidate);
    if (primary > bestPrimary) {
      best = candidate;
      bestPrimary = primary;
      bestTieBreak = tieBreakValue(candidate);
    } else if (primary === bestPrimary) {
      const tieBreak = tieBreakValue(candidate);
      if (tieBreak < bestTieBreak) {
        best = candidate;
        bestTieBreak = tieBreak;
      }
    }
  }
  return best;
}

// --- Minimax search ---------------------------------------------------
//
// Mirrors matchSessionEngine.ts's sub-round mechanics exactly: our-defender
// (max) -> their-defender (min) -> our-attacker-pair-offer (max) ->
// their-pick (min) -> their-attacker-pair-offer (min) -> our-accept (max)
// -> next sub-round or terminal auto-pair. Every "our" node tries each
// candidate and keeps the best achievable total; every "their" node tries
// each candidate the opponent could pick and keeps the worst-for-us
// achievable total (minimax: assume the opponent always plays against us).
// "value" always means "sum of final-pairing scores from this point to the
// end of the game" — never anything already committed before this level.

function scoreOurDefenderCandidate(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  const remainingOurs = withoutArmy(ourAvailable, ourDefender);
  return searchTheirDefender(remainingOurs, theirAvailable, ourDefender, matrixGrid);
}

function searchOurDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): number {
  return Math.max(
    ...ourAvailable.map((candidate) => scoreOurDefenderCandidate(ourAvailable, theirAvailable, candidate, matrixGrid)),
  );
}

function bestOurDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId {
  return pickBest(
    ourAvailable,
    (candidate) => scoreOurDefenderCandidate(ourAvailable, theirAvailable, candidate, matrixGrid),
    (candidate) => reserveStrength(matrixGrid, candidate, theirAvailable),
  );
}

function searchTheirDefender(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  return Math.min(
    ...theirAvailable.map((theirDefender) => {
      const remainingTheirs = withoutArmy(theirAvailable, theirDefender);
      return searchOurAttackerPair(ourAvailable, theirDefender, remainingTheirs, ourDefender, matrixGrid);
    }),
  );
}

function scoreOurAttackerPairCandidate(
  ourAvailable: ArmyId[],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  pair: [ArmyId, ArmyId],
  matrixGrid: MatrixGridData,
): number {
  return searchTheirPick(ourAvailable, pair, theirDefender, theirAvailable, ourDefender, matrixGrid);
}

function searchOurAttackerPair(
  ourAvailable: ArmyId[],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  const pairs = twoCombinations(ourAvailable);
  return Math.max(
    ...pairs.map((pair) =>
      scoreOurAttackerPairCandidate(ourAvailable, theirDefender, theirAvailable, ourDefender, pair, matrixGrid),
    ),
  );
}

function bestOurAttackerPair(
  ourAvailable: ArmyId[],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): [ArmyId, ArmyId] {
  const pairs = twoCombinations(ourAvailable);
  return pickBest(
    pairs,
    (pair) => scoreOurAttackerPairCandidate(ourAvailable, theirDefender, theirAvailable, ourDefender, pair, matrixGrid),
    (pair) =>
      reserveStrength(matrixGrid, pair[0], theirAvailable) + reserveStrength(matrixGrid, pair[1], theirAvailable),
  );
}

function searchTheirPick(
  ourAvailable: ArmyId[],
  offeredPair: [ArmyId, ArmyId],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  return Math.min(
    ...offeredPair.map((picked) => {
      const immediate = cellValue(matrixGrid, picked, theirDefender);
      const remainingOurs = withoutArmy(ourAvailable, picked);
      return immediate + searchTheirAttackerPair(remainingOurs, theirAvailable, ourDefender, matrixGrid);
    }),
  );
}

function searchTheirAttackerPair(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  const pairs = twoCombinations(theirAvailable);
  return Math.min(...pairs.map((pair) => searchOurAccept(ourAvailable, pair, theirAvailable, ourDefender, matrixGrid)));
}

function searchOurAccept(
  ourAvailable: ArmyId[],
  theirOfferedPair: [ArmyId, ArmyId],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
): number {
  return Math.max(
    ...theirOfferedPair.map((accepted) => {
      const immediate = cellValue(matrixGrid, ourDefender, accepted);
      const remainingTheirs = withoutArmy(theirAvailable, accepted);
      return immediate + continueOrFinish(ourAvailable, remainingTheirs, matrixGrid);
    }),
  );
}

function bestOurAccept(
  ourDefender: ArmyId,
  theirOfferedPair: [ArmyId, ArmyId],
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  matrixGrid: MatrixGridData,
): ArmyId {
  return pickBest(
    theirOfferedPair,
    (accepted) => {
      const immediate = cellValue(matrixGrid, ourDefender, accepted);
      const remainingTheirs = withoutArmy(theirAvailable, accepted);
      return immediate + continueOrFinish(ourAvailable, remainingTheirs, matrixGrid);
    },
    // No richer tie-break applies to this decision type (nothing of ours
    // stays "in reserve" from an accept choice) — first candidate wins ties.
    () => 0,
  );
}

function continueOrFinish(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): number {
  if (ourAvailable.length > 1 && theirAvailable.length > 1) {
    return searchOurDefender(ourAvailable, theirAvailable, matrixGrid);
  }
  // Forced refused-attacker pairing: exactly one army left on each side.
  return cellValue(matrixGrid, ourAvailable[0], theirAvailable[0]);
}

/**
 * Weighs the immediate matchup against the full downstream consequences of
 * each choice, all the way to the forced final refused-attacker pairing
 * (PRD FR-013, Business Logic), via exhaustive minimax: maximize at our own
 * decision points, assume worst-case (minimize) at every point the opponent
 * controls. The remaining decision tree is always small enough (at most 5
 * armies per side) for this to be exact, not a heuristic approximation.
 */
export const minimaxSuggestionProvider: MatchSuggestionProvider = {
  suggestDefender: (ourAvailable, theirAvailable, matrixGrid) =>
    bestOurDefender(ourAvailable, theirAvailable, matrixGrid),
  suggestAttackerPair: (ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid) =>
    bestOurAttackerPair(ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid),
  suggestAcceptedAttacker: (ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid) =>
    bestOurAccept(ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid),
};
