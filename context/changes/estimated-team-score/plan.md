# Estimated Team Score Implementation Plan

## Overview

Show a captain, on the pairing-session completion screen, an estimated total team score — the sum of their own pairing-matrix estimates across all 5 final pairings of the round. Applies identically to both live match-mode and solo practice-mode sessions, since both render the same completion screen.

## Current State Analysis

`MatchSession.tsx`'s `"complete"` phase (lines 423-460) already has every piece of data needed to compute this: `state.history` (a `SubRoundResult[]`, one entry per completed sub-round) and `state.refusedAttacker` (the forced final pairing). Neither is currently reduced to a total score — the completion screen only lists which armies were paired, not how good those pairings were. `src/lib/matchSuggestions.ts` already exports `cellValue(matrixGrid, ourArmyId, theirArmyId): number` (line 36), which maps a color-band estimate to its representative score (red=2, orange=6, yellow=10, green=14, dark-green=18; purple/unestimated=7) — this is the exact per-pairing scoring rule the minimax recommender already sums internally as its search objective (see the "value always means sum of final-pairing scores" comment at `matchSuggestions.ts:104`); it has just never been surfaced to the UI as a final number.

### Key Discoveries:

- The actual final pairings per completed sub-round are NOT `ourDefender vs theirDefender` — they're `ourDefender vs ourAccepted` and `theirPick vs theirDefender`, exactly as already derived by `MatchSession.tsx`'s existing `ourPairedWith`/`theirPairedWith` computation (`MatchSession.tsx:245-259`). This plan's scoring function must pair the same way, not naively pair each round's `ourDefender`/`theirDefender`.
- With the roster size fixed at exactly 5 per side (`MAX_ROSTER_SIZE`), a completed session always yields exactly 5 final pairings (2 per sub-round × 2 sub-rounds + 1 refused-attacker), so the total score's possible range is fixed: minimum 10 (5 × red's 2), maximum 90 (5 × dark-green's 18).
- `matchSessionEngine.ts` defines `SubRoundResult`/`RefusedAttackerPairing` and already imports from `matchSuggestions.ts` (for `ArmyId`/`MatchSuggestionProvider`). A new scoring function needs both `cellValue` (from `matchSuggestions.ts`) and these two types (from `matchSessionEngine.ts`) — putting it directly in either existing file would risk a circular import (`matchSuggestions.ts` would need to import from `matchSessionEngine.ts`, which already imports from it). A new small module avoids this, matching this codebase's existing pattern of one narrow-purpose file per concern (`opponentMoves.ts`, `matchSessionStorage.ts`, etc.).
- No React component tests exist anywhere in this repo — consistent with prior plans in this codebase, the new scoring logic goes in a testable pure function; the UI wiring is manually verified.

## Desired End State

After a captain completes a session (live or practice), the completion screen shows "Estimated team score: N" — the sum of `cellValue` across all 5 final pairings, using the captain's own matrix estimates. The number reflects an estimate, not a guaranteed outcome, and is labeled accordingly.

**Verification**: `npm test`, `npm run build`, and `npm run lint` all pass; manually completing a session in both live match-mode and practice mode shows the same total score, and that total is independently verifiable by summing each pairing's color-band score from the matrix.

## What We're NOT Doing

- No per-pairing score breakdown on the completion screen — total only, per the confirmed design choice. A captain can still cross-reference the matrix for individual pairing values.
- No `/90` denominator or other contextualization — a raw total only, per the confirmed design choice.
- No persisted history of past session scores — matches this project's existing non-goal on post-match history (no new schema).
- No change to the scoring rule itself (`cellValue`'s color-band-to-score mapping) — this plan only sums an existing, unchanged function's output.

## Implementation Approach

Add a new pure function `estimatedTeamScore()` in a new `src/lib/teamScore.ts` module, reusing `cellValue` and pairing each sub-round's two matchups exactly as `MatchSession.tsx`'s existing `ourPairedWith` derivation already does. Unit-test it in isolation. Wire a single `useMemo`-computed total into `MatchSession.tsx`'s `"complete"` phase block, rendered identically regardless of `mode`.

## Phase 1: Estimated team score

### Overview

Add the scoring function, its tests, and the completion-screen UI line.

### Changes Required:

#### 1. Team score calculation

**File**: `src/lib/teamScore.ts` (new)

**Intent**: Sum the estimated score of all 5 final pairings in a completed session, reusing the existing per-cell scoring rule.

**Contract**:
```ts
export function estimatedTeamScore(
  matrixGrid: MatrixGridData,
  history: SubRoundResult[],
  refusedAttacker: RefusedAttackerPairing | null,
): number;
```
For each `SubRoundResult` in `history`, sum `cellValue(matrixGrid, round.ourDefender, round.ourAccepted)` and `cellValue(matrixGrid, round.theirPick, round.theirDefender)` — the same two pairings `MatchSession.tsx`'s `ourPairedWith` computation already derives (`ours[round.ourDefender] = round.ourAccepted`; `ours[round.theirPick] = round.theirDefender`). If `refusedAttacker` is non-null, add `cellValue(matrixGrid, refusedAttacker.ours, refusedAttacker.theirs)`. An empty `history` with a null `refusedAttacker` (session not yet complete) returns `0` — the caller is responsible for only rendering the result once the session is actually complete.

#### 2. Completion-screen display

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Show the total on the existing completion screen, identically for both `mode` values.

**Contract**: Import `estimatedTeamScore` from `@/lib/teamScore`. Compute it via `useMemo` keyed on `[state.history, state.refusedAttacker, matrixGrid]`, inside the existing `"complete"` phase block (`MatchSession.tsx:423-460`), rendered as a labeled line reading "Estimated team score: {total}" — placed directly under the existing completion heading, before the per-sub-round history list. No `mode` branching for this line — same wording and placement in both live and practice sessions.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Completing a live match-mode session shows "Estimated team score: N" on the completion screen
- [ ] Completing a practice-mode session shows the identical line, in the same place
- [ ] The displayed total matches an independent manual sum of the 5 final pairings' color-band scores read from the matrix

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/teamScore.test.ts` (new): `estimatedTeamScore` with a hand-built `MatrixGridData`, `SubRoundResult[]`, and `RefusedAttackerPairing` —
  - A single completed sub-round: verify the sum equals the two expected `cellValue` calls (`ourDefender`/`ourAccepted` and `theirPick`/`theirDefender`), not a naive `ourDefender`/`theirDefender` pairing.
  - Two sub-rounds plus a `refusedAttacker`: verify the full 5-pairing sum.
  - A pairing with no stored estimate (falls back to `cellValue`'s `NO_SIGNAL_VALUE`): verify it's included in the sum via the existing fallback, not skipped.
  - Empty `history` and a `null refusedAttacker`: returns `0`.

### Manual Testing Steps:

1. Complete a full live match-mode session against a prepared opponent matrix; note the displayed total.
2. Manually look up each of the 5 final pairings in the matrix and sum their color-band scores; confirm it matches the displayed total.
3. Repeat via a practice-mode session; confirm the same line appears in the same place with the same wording.

## Performance Considerations

None — summing at most 5 `cellValue` lookups, memoized on session-complete state that only changes once per session.

## Migration Notes

None — no schema or persisted-data changes.

## References

- Related change: `context/archive/2026-09-12-pairing-simulation-session/` (introduced the practice-mode completion screen this plan also targets)
- Scoring primitive: `src/lib/matchSuggestions.ts:36` (`cellValue`)
- Pairing derivation precedent: `src/components/match/MatchSession.tsx:245-259` (`ourPairedWith`/`theirPairedWith`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Estimated team score

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking passes as part of build: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 Live match-mode completion screen shows "Estimated team score: N"
- [x] 1.5 Practice-mode completion screen shows the identical line, in the same place
- [x] 1.6 The displayed total matches an independent manual sum of the 5 final pairings' color-band scores
