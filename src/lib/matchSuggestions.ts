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

/** A per-matchup scorer, always called with the captain's army first and the opponent's army second — matches cellValue's own argument order regardless of which side's search is using it. */
export type CellScore = (matrixGrid: MatrixGridData, ourArmyId: ArmyId, theirArmyId: ArmyId) => number;

// Purple and an unestimated (blank) cell both score as one point above
// orange's representative score — an explicitly arbitrary choice, not
// derived from data: purple is judged worse than yellow, better than
// orange; a blank cell gets the same treatment since the algorithm has
// equally little signal in both cases.
//
// Exported: 7 never occurs as a real color-band representative score
// (COLOR_BANDS' scores are {2,6,10,14,18}), so `=== NO_SIGNAL_VALUE` is a
// safe, unambiguous way for other modules to detect "no real estimate"
// without inspecting the raw Estimate value.
export const NO_SIGNAL_VALUE = 7;

// Exported so other modules building their own per-cell score tables (e.g.
// opponentMoves.ts's Similar-mode noise table) key their data identically
// to how cellValue looks estimates up here.
export function cellKey(ourArmyId: ArmyId, theirArmyId: ArmyId): string {
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

/**
 * Scores a matchup from the opponent's inverted point of view, for the
 * Mirrored practice-mode opponent: `20 - cellValue(...)`, except a
 * no-signal cell (purple or blank) stays at `NO_SIGNAL_VALUE` unchanged
 * rather than inverting to 13 — the opponent has exactly as little
 * information about an unestimated matchup as the captain does.
 */
export function mirroredValue(matrixGrid: MatrixGridData, ourArmyId: ArmyId, theirArmyId: ArmyId): number {
  const raw = cellValue(matrixGrid, ourArmyId, theirArmyId);
  return raw === NO_SIGNAL_VALUE ? NO_SIGNAL_VALUE : 20 - raw;
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

/** Sum of `army`'s value (via `score`, default `cellValue`) against every army in `theirAvailable` — a proxy for how broadly useful it is to keep in reserve. */
export function reserveStrength(
  matrixGrid: MatrixGridData,
  army: ArmyId,
  theirAvailable: ArmyId[],
  score: CellScore = cellValue,
): number {
  return theirAvailable.reduce((sum, theirArmy) => sum + score(matrixGrid, army, theirArmy), 0);
}

/**
 * Mirror of `reserveStrength` for a candidate on the *other* side: sums
 * `score(matrixGrid, ourArmy, theirArmy)` over `ourAvailable` for the fixed
 * `theirArmy` — varying the first argument instead of the second, since
 * cellValue's key order always expects "our army" first regardless of
 * whose decision is being scored.
 */
export function theirReserveStrength(
  matrixGrid: MatrixGridData,
  theirArmy: ArmyId,
  ourAvailable: ArmyId[],
  score: CellScore,
): number {
  return ourAvailable.reduce((sum, ourArmy) => sum + score(matrixGrid, ourArmy, theirArmy), 0);
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
// -> their-defender -> our-attacker-pair-offer -> their-pick ->
// their-attacker-pair-offer -> our-accept -> next sub-round or terminal
// auto-pair. Generalized over a SearchConfig so the exact same tree shape
// can run from either perspective:
//
//   { score: cellValue, oursMaximize: true }  — the real engine used by
//     minimaxSuggestionProvider below: our nodes maximize, their nodes
//     minimize, assuming the opponent always plays against us. This is the
//     only config used in this file today — the opposite config (their
//     nodes maximize their own value, our nodes minimize it, from the
//     opponent's point of view) is introduced by a later change alongside
//     the functions that actually expose the opponent's picks.
//
// "value" always means "sum of final-pairing scores from this point to the
// end of the game" (per whichever score function config carries) — never
// anything already committed before this level.

export interface SearchConfig {
  score: CellScore;
  oursMaximize: boolean;
}

function scoreOurDefenderCandidate(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const remainingOurs = withoutArmy(ourAvailable, ourDefender);
  return searchTheirDefender(remainingOurs, theirAvailable, ourDefender, matrixGrid, config);
}

function searchOurDefender(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const agg = config.oursMaximize ? Math.max : Math.min;
  return agg(
    ...ourAvailable.map((candidate) =>
      scoreOurDefenderCandidate(ourAvailable, theirAvailable, candidate, matrixGrid, config),
    ),
  );
}

function bestOurDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId {
  const config: SearchConfig = { score: cellValue, oursMaximize: true };
  return pickBest(
    ourAvailable,
    (candidate) => scoreOurDefenderCandidate(ourAvailable, theirAvailable, candidate, matrixGrid, config),
    (candidate) => reserveStrength(matrixGrid, candidate, theirAvailable),
  );
}

/**
 * The opponent's actual best defender choice, via the same search run from
 * their point of view (`oursMaximize: false` — their nodes maximize
 * `score`, ours minimize it). Commits one of the opponent's own armies, so
 * — mirroring `bestOurDefender`'s own tie-break — ties are broken by
 * `theirReserveStrength`.
 */
export function bestTheirDefender(
  theirAvailable: ArmyId[],
  ourAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  score: CellScore,
): ArmyId {
  const config: SearchConfig = { score, oursMaximize: false };
  return pickBest(
    theirAvailable,
    (candidate) => {
      const remainingTheirs = withoutArmy(theirAvailable, candidate);
      return searchOurAttackerPair(ourAvailable, candidate, remainingTheirs, ourDefender, matrixGrid, config);
    },
    (candidate) => theirReserveStrength(matrixGrid, candidate, ourAvailable, score),
  );
}

function searchTheirDefender(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const agg = config.oursMaximize ? Math.min : Math.max;
  return agg(
    ...theirAvailable.map((theirDefender) => {
      const remainingTheirs = withoutArmy(theirAvailable, theirDefender);
      return searchOurAttackerPair(ourAvailable, theirDefender, remainingTheirs, ourDefender, matrixGrid, config);
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
  config: SearchConfig,
): number {
  return searchTheirPick(ourAvailable, pair, theirDefender, theirAvailable, ourDefender, matrixGrid, config);
}

function searchOurAttackerPair(
  ourAvailable: ArmyId[],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const pairs = twoCombinations(ourAvailable);
  const agg = config.oursMaximize ? Math.max : Math.min;
  return agg(
    ...pairs.map((pair) =>
      scoreOurAttackerPairCandidate(ourAvailable, theirDefender, theirAvailable, ourDefender, pair, matrixGrid, config),
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
  const config: SearchConfig = { score: cellValue, oursMaximize: true };
  const pairs = twoCombinations(ourAvailable);
  return pickBest(
    pairs,
    (pair) =>
      scoreOurAttackerPairCandidate(ourAvailable, theirDefender, theirAvailable, ourDefender, pair, matrixGrid, config),
    (pair) =>
      reserveStrength(matrixGrid, pair[0], theirAvailable) + reserveStrength(matrixGrid, pair[1], theirAvailable),
  );
}

/**
 * The opponent's actual best attacker pair to offer, via the same search
 * run from their point of view. Commits two of the opponent's own armies,
 * so — mirroring `bestOurAttackerPair`'s own tie-break — ties are broken
 * by summed `theirReserveStrength`.
 */
export function bestTheirAttackerPair(
  theirAvailable: ArmyId[],
  ourAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  score: CellScore,
): [ArmyId, ArmyId] {
  const config: SearchConfig = { score, oursMaximize: false };
  const pairs = twoCombinations(theirAvailable);
  return pickBest(
    pairs,
    (pair) => searchOurAccept(ourAvailable, pair, theirAvailable, ourDefender, matrixGrid, config),
    (pair) =>
      theirReserveStrength(matrixGrid, pair[0], ourAvailable, score) +
      theirReserveStrength(matrixGrid, pair[1], ourAvailable, score),
  );
}

function searchTheirPick(
  ourAvailable: ArmyId[],
  offeredPair: [ArmyId, ArmyId],
  theirDefender: ArmyId,
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const agg = config.oursMaximize ? Math.min : Math.max;
  return agg(
    ...offeredPair.map((picked) => {
      const immediate = config.score(matrixGrid, picked, theirDefender);
      const remainingOurs = withoutArmy(ourAvailable, picked);
      return immediate + searchTheirAttackerPair(remainingOurs, theirAvailable, ourDefender, matrixGrid, config);
    }),
  );
}

/**
 * The opponent's actual best pick from our offered attacker pair, via the
 * same search run from their point of view. Chooses among an *offered*
 * pair rather than committing one of the opponent's own armies, so —
 * mirroring `bestOurAccept`'s own tie-break exactly, for the same
 * structural reason — no reserve-strength consideration applies; first
 * candidate wins ties.
 */
export function bestTheirPick(
  offeredPair: [ArmyId, ArmyId],
  theirDefender: ArmyId,
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  score: CellScore,
): ArmyId {
  const config: SearchConfig = { score, oursMaximize: false };
  return pickBest(
    offeredPair,
    (picked) => {
      const immediate = score(matrixGrid, picked, theirDefender);
      const remainingOurs = withoutArmy(ourAvailable, picked);
      return immediate + searchTheirAttackerPair(remainingOurs, theirAvailable, ourDefender, matrixGrid, config);
    },
    () => 0,
  );
}

function searchTheirAttackerPair(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const pairs = twoCombinations(theirAvailable);
  const agg = config.oursMaximize ? Math.min : Math.max;
  return agg(
    ...pairs.map((pair) => searchOurAccept(ourAvailable, pair, theirAvailable, ourDefender, matrixGrid, config)),
  );
}

function searchOurAccept(
  ourAvailable: ArmyId[],
  theirOfferedPair: [ArmyId, ArmyId],
  theirAvailable: ArmyId[],
  ourDefender: ArmyId,
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const agg = config.oursMaximize ? Math.max : Math.min;
  return agg(
    ...theirOfferedPair.map((accepted) => {
      const immediate = config.score(matrixGrid, ourDefender, accepted);
      const remainingTheirs = withoutArmy(theirAvailable, accepted);
      return immediate + continueOrFinish(ourAvailable, remainingTheirs, matrixGrid, config);
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
  const config: SearchConfig = { score: cellValue, oursMaximize: true };
  return pickBest(
    theirOfferedPair,
    (accepted) => {
      const immediate = cellValue(matrixGrid, ourDefender, accepted);
      const remainingTheirs = withoutArmy(theirAvailable, accepted);
      return immediate + continueOrFinish(ourAvailable, remainingTheirs, matrixGrid, config);
    },
    // No richer tie-break applies to this decision type (nothing of ours
    // stays "in reserve" from an accept choice) — first candidate wins ties.
    () => 0,
  );
}

function continueOrFinish(
  ourAvailable: ArmyId[],
  theirAvailable: ArmyId[],
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  if (ourAvailable.length > 1 && theirAvailable.length > 1) {
    return searchOurDefender(ourAvailable, theirAvailable, matrixGrid, config);
  }
  // Forced refused-attacker pairing: exactly one army left on each side.
  return config.score(matrixGrid, ourAvailable[0], theirAvailable[0]);
}

/**
 * Weighs the immediate matchup against the full downstream consequences of
 * each choice, all the way to the forced final refused-attacker pairing
 * (PRD FR-013, Business Logic), via exhaustive minimax: maximize at our own
 * decision points, assume worst-case (minimize) at every point the opponent
 * controls. The remaining decision tree is always small enough (at most 5
 * armies per side) for this to be exact, not a heuristic approximation.
 *
 * Cost grows with n²·m²·C(n,2)·C(m,2) per sub-round — trivial at today's
 * 5-per-side cap (`MAX_ROSTER_SIZE` in rosterLimits.ts), but not exact-search
 * friendly indefinitely; revisit (memoization, pruning, or a different
 * algorithm) if that cap is ever raised (see PRD FR-016).
 */
export const minimaxSuggestionProvider: MatchSuggestionProvider = {
  suggestDefender: (ourAvailable, theirAvailable, matrixGrid) =>
    bestOurDefender(ourAvailable, theirAvailable, matrixGrid),
  suggestAttackerPair: (ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid) =>
    bestOurAttackerPair(ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid),
  suggestAcceptedAttacker: (ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid) =>
    bestOurAccept(ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid),
};
