import {
  bestTheirAttackerPair,
  bestTheirDefender,
  bestTheirPick,
  mirroredValue,
  type ArmyId,
} from "@/lib/matchSuggestions";
import type { MatrixGridData } from "@/lib/matrix";

// Mirrors MatchSuggestionProvider's shape so the providers read as
// siblings. `matrixGrid` and the "our-side" parameters are accepted but
// unused by the random implementation below — they're part of the
// interface so a minimax-based implementation is a drop-in swap, not a
// signature change. Widened from S-07's original shape (which lacked
// ourDefender/ourAvailable/theirAvailable in places) once the Mirrored/
// Similar modes' lookahead search revealed it didn't carry enough context.
export interface OpponentMoveProvider {
  pickDefender(
    theirAvailable: ArmyId[],
    ourAvailable: ArmyId[],
    ourDefender: ArmyId,
    matrixGrid: MatrixGridData,
  ): ArmyId;
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
  pickDefender: (theirAvailable, ourAvailable, ourDefender, matrixGrid) =>
    bestTheirDefender(ourAvailable, theirAvailable, ourDefender, matrixGrid, mirroredValue),
  pickAttackerChoice: (offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, matrixGrid) =>
    bestTheirPick(offeredPair, theirDefender, ourAvailable, theirAvailable, ourDefender, matrixGrid, mirroredValue),
  pickAttackerPair: (theirAvailable, ourAvailable, ourDefender, matrixGrid) =>
    bestTheirAttackerPair(theirAvailable, ourAvailable, ourDefender, matrixGrid, mirroredValue),
};
