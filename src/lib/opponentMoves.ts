import type { ArmyId } from "@/lib/matchSuggestions";
import type { MatrixGridData } from "@/lib/matrix";

// Mirrors MatchSuggestionProvider's shape so the two providers read as
// siblings. `matrixGrid` and the "our-side" parameters are accepted but
// unused by the random implementation below — they're part of the
// interface now so a future minimax-based implementation (S-08) is a
// drop-in swap, not a signature change.
export interface OpponentMoveProvider {
  pickDefender(theirAvailable: ArmyId[], ourAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId;
  pickAttackerChoice(offeredPair: [ArmyId, ArmyId], theirDefender: ArmyId, matrixGrid: MatrixGridData): ArmyId;
  pickAttackerPair(theirAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData): [ArmyId, ArmyId];
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
