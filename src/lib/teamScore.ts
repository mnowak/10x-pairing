import { cellValue } from "@/lib/matchSuggestions";
import type { SubRoundResult, RefusedAttackerPairing } from "@/lib/matchSessionEngine";
import type { MatrixGridData } from "@/lib/matrix";

// Lives in its own module rather than matchSuggestions.ts or
// matchSessionEngine.ts to avoid a circular import: matchSessionEngine.ts
// already imports from matchSuggestions.ts, and this function needs both
// cellValue (from matchSuggestions.ts) and SubRoundResult/RefusedAttackerPairing
// (from matchSessionEngine.ts).
//
// Pairs each sub-round exactly as MatchSession.tsx's ourPairedWith derivation
// already does — ourDefender <-> ourAccepted and theirPick <-> theirDefender —
// not the naive ourDefender <-> theirDefender.
export function estimatedTeamScore(
  matrixGrid: MatrixGridData,
  history: SubRoundResult[],
  refusedAttacker: RefusedAttackerPairing | null,
): number {
  let total = 0;
  for (const round of history) {
    total += cellValue(matrixGrid, round.ourDefender, round.ourAccepted);
    total += cellValue(matrixGrid, round.theirPick, round.theirDefender);
  }
  if (refusedAttacker) {
    total += cellValue(matrixGrid, refusedAttacker.ours, refusedAttacker.theirs);
  }
  return total;
}
