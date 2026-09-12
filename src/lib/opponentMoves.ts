import {
  bestTheirAttackerPair,
  bestTheirDefender,
  bestTheirPick,
  cellKey,
  mirroredValue,
  NO_SIGNAL_VALUE,
  type ArmyId,
  type CellScore,
} from "@/lib/matchSuggestions";
import type { MatrixGridData } from "@/lib/matrix";

// Mirrors MatchSuggestionProvider's shape so the providers read as
// siblings. `matrixGrid` and the "our-side" parameters are accepted but
// unused by the random implementation below — they're part of the
// interface so a minimax-based implementation is a drop-in swap, not a
// signature change. Widened from S-07's original shape (which lacked
// ourDefender/ourAvailable/theirAvailable in places) once the Mirrored/
// Similar modes' lookahead search revealed it didn't carry enough context.
// `pickDefender` deliberately does NOT take `ourDefender`: under the
// blind/simultaneous declaration rule the opponent's defender pick must not
// react to which specific army the captain reveals as their own defender —
// no implementation should ever condition on it, so it isn't offered.
export interface OpponentMoveProvider {
  pickDefender(theirAvailable: ArmyId[], ourAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId;
  pickAttackerChoice(
    offeredPair: [ArmyId, ArmyId],
    theirDefender: ArmyId,
    ourAvailable: ArmyId[],
    theirAvailable: ArmyId[],
    ourDefender: ArmyId,
    matrixGrid: MatrixGridData,
  ): ArmyId;
  pickAttackerPair(
    theirAvailable: ArmyId[],
    ourAvailable: ArmyId[],
    ourDefender: ArmyId,
    matrixGrid: MatrixGridData,
  ): [ArmyId, ArmyId];
}

function randomIndex(length: number, random: () => number): number {
  return Math.floor(random() * length);
}

function randomIntInclusive(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Picks 2 distinct random indices from `items` — not hardcoded to "the
// only 2 available" even though today's fixed 5-army roster cap (5→3→1
// per completed sub-round) guarantees exactly 2 remain whenever this is
// called, so it keeps working if the roster-size cap is ever relaxed.
function pickTwoDistinct<T>(items: readonly T[], random: () => number): [T, T] {
  const firstIndex = randomIndex(items.length, random);
  const remaining = items.filter((_, index) => index !== firstIndex);
  const secondIndex = randomIndex(remaining.length, random);
  return [items[firstIndex], remaining[secondIndex]];
}

/** Factory taking an injectable `[0,1)` random source, so tests can supply a fixed sequence instead of mocking `Math.random`. */
export function createRandomOpponentProvider(random: () => number = Math.random): OpponentMoveProvider {
  return {
    pickDefender: (theirAvailable) => theirAvailable[randomIndex(theirAvailable.length, random)],
    pickAttackerChoice: (offeredPair) => offeredPair[randomIndex(offeredPair.length, random)],
    pickAttackerPair: (theirAvailable) => pickTwoDistinct(theirAvailable, random),
  };
}

export const randomOpponentProvider: OpponentMoveProvider = createRandomOpponentProvider();

/**
 * A real minimax lookahead over an inverted view of the captain's own
 * matrix (`mirroredValue`) — the opponent's own decision points maximize
 * that value, the captain's (as modeled by the opponent) minimize it. A
 * plain object, not a factory: fully deterministic given a `matrixGrid`,
 * matching `minimaxSuggestionProvider`'s own plain-object pattern rather
 * than `createRandomOpponentProvider`'s injectable-randomness factory.
 */
export const mirroredOpponentProvider: OpponentMoveProvider = {
  pickDefender: (theirAvailable, ourAvailable, matrixGrid) =>
    bestTheirDefender(theirAvailable, ourAvailable, matrixGrid, mirroredValue),
  pickAttackerChoice: (offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, matrixGrid) =>
    bestTheirPick(offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, matrixGrid, mirroredValue),
  pickAttackerPair: (theirAvailable, ourAvailable, ourDefender, matrixGrid) =>
    bestTheirAttackerPair(theirAvailable, ourAvailable, ourDefender, matrixGrid, mirroredValue),
};

/**
 * Generates Similar mode's per-session-fixed matchup values, covering
 * every (our, their) combination across the FULL initial rosters — armies
 * only ever leave the available pool during a session, never rejoin, so
 * this one-time full cross-product covers every combination the search
 * could later ask for. Non-purple/estimated cells get `mirroredValue ± 4`
 * (clamped to [0,20]); purple/unestimated cells get a fully random integer
 * uniform in [0,20] — deliberately NOT the narrower mirrored±4 band, since
 * "no signal" should stay maximally uncertain, not merely noisy around a
 * placeholder constant.
 */
export function generateSimilarScoreTable(
  matrixGrid: MatrixGridData,
  ourArmyIds: ArmyId[],
  theirArmyIds: ArmyId[],
  random: () => number = Math.random,
): Record<string, number> {
  const table: Record<string, number> = {};
  for (const our of ourArmyIds) {
    for (const their of theirArmyIds) {
      const mirrored = mirroredValue(matrixGrid, our, their);
      table[cellKey(our, their)] =
        mirrored === NO_SIGNAL_VALUE
          ? randomIntInclusive(0, 20, random)
          : clamp(mirrored + randomIntInclusive(-4, 4, random), 0, 20);
    }
  }
  return table;
}

/**
 * Builds a Similar-mode provider backed by a noisy score table — either
 * freshly generated (new session) or restored verbatim via
 * `options.existingTable` (resuming a persisted session), so a resumed
 * session's opponent behaves identically to before the refresh: the table
 * must stay fixed for the whole session, since the minimax lookahead at an
 * early phase evaluates hypothetical FUTURE opponent decisions using the
 * same table that will actually govern them later — regenerating it per
 * decision point would make the search self-contradictory. The returned
 * `provider`'s CellScore ignores the `matrixGrid` argument passed through
 * by `bestTheir*` — the table is already fully materialized, so no further
 * matrix lookups are needed.
 */
export function createSimilarOpponentProvider(
  matrixGrid: MatrixGridData,
  ourArmyIds: ArmyId[],
  theirArmyIds: ArmyId[],
  options?: { random?: () => number; existingTable?: Record<string, number> },
): { provider: OpponentMoveProvider; table: Record<string, number> } {
  const table =
    options?.existingTable ?? generateSimilarScoreTable(matrixGrid, ourArmyIds, theirArmyIds, options?.random);

  const score: CellScore = (_matrixGrid, ourArmyId, theirArmyId) => {
    // Widened to Partial: a genuinely reachable key is always present per
    // the full-cross-product generation above, but this stays defensive
    // (matching cellValue's own Partial-widening pattern) rather than
    // trusting Record<string, number>'s unsound total-map typing.
    const values: Partial<Record<string, number>> = table;
    return values[cellKey(ourArmyId, theirArmyId)] ?? NO_SIGNAL_VALUE;
  };

  const provider: OpponentMoveProvider = {
    pickDefender: (theirAvailable, ourAvailable, mg) => bestTheirDefender(theirAvailable, ourAvailable, mg, score),
    pickAttackerChoice: (offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, mg) =>
      bestTheirPick(offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, mg, score),
    pickAttackerPair: (theirAvailable, ourAvailable, ourDefender, mg) =>
      bestTheirAttackerPair(theirAvailable, ourAvailable, ourDefender, mg, score),
  };

  return { provider, table };
}
