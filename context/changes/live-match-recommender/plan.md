# Live Match Recommender (Increment 2: Real Scoring) Implementation Plan

## Overview

Replace `src/lib/matchSuggestions.ts`'s `randomSuggestionProvider` (increment 1's deliberate placeholder) with a real `MatchSuggestionProvider` implementation that weighs the immediate matchup against the full downstream consequences of each choice, per PRD FR-013 and Business Logic. This is increment 2 of 2 for live match-mode — everything else (the session state machine, persistence, and UI) was built in increment 1 (`live-match-mode-session`) specifically so this change is a provider swap behind an already-stable interface, not a rebuild.

## Current State Analysis

- `src/lib/matchSuggestions.ts` exports `MatchSuggestionProvider` (3 methods: `suggestDefender`, `suggestAttackerPair`, `suggestAcceptedAttacker`) and `randomSuggestionProvider`, a uniform-random implementation that ignores `matrixGrid` entirely — built explicitly as this change's future swap point (see its own doc comment).
- `src/lib/matchSessionEngine.ts` is the already-correct, already-tested state machine implementing the confirmed sub-round mechanics (each sub-round: both sides reveal a defender; each offers 2 attackers against the other's defender; each accepts one). It takes a `MatchSuggestionProvider` as a parameter and never imports `randomSuggestionProvider` directly — the seam this change plugs into.
- `src/components/match/MatchSession.tsx` is the only production call site that imports `randomSuggestionProvider` (4 call sites: initial session creation, `their-defender` entry, `their-attacker-pair` entry, and `restart()`).
- `src/lib/colorBands.ts`: `Estimate = ColorBand | "purple"`; `bandToScore(band: ColorBand): number` only accepts a real color band — it throws on `"purple"` and has no defined behavior for a missing (unestimated) cell. Neither case is handled anywhere today because nothing has needed a numeric value for them until now.
- `src/lib/matrix.ts`'s `MatrixGridData.estimates: Record<string, Estimate>` is keyed `` `${teamArmyId}:${opponentArmyId}` ``; a pair with no entry means "not yet assessed."

## Desired End State

Every one of the 3 suggestion types weighs the immediate matchup against the full downstream consequences of each choice (all the way to the forced final refused-attacker pairing), assuming the opponent plays adversarially against us at every point they control. `randomSuggestionProvider` no longer exists in production code; `MatchSession.tsx` is wired to the new provider. The engine, storage, UI, and existing E2E suite are untouched apart from one call-site update (see Key Discoveries) and still pass unmodified.

**Verification**: run `npm run dev`, play a full 5-vs-5 session, and confirm each of the 3 suggestion points highlights an army that is at least as good as any alternative by its own matrix estimate against the currently-known opponent reveal — not visibly arbitrary the way increment 1's random suggestions were.

### Key Discoveries:

- `src/lib/matchSessionEngine.ts`'s "Sub-round mechanics" Critical Implementation Detail (already validated and tested in increment 1) is the authoritative mechanics spec this change's search must mirror exactly — re-derived independently here would risk drifting from the tested implementation.
- The remaining decision tree at any point in a session is tiny: at most 2 sub-rounds, single-digit branching per level, depth ≤ 12 alternating our/their decision levels for a full-session search. A brute-force exhaustive search is fully tractable — no heuristic approximation, pruning, or memoization is needed to meet the "no perceptible delay" NFR.
- `MatchSession.tsx`'s `nameById` map and picker components read army names only for display — none of this needs to change; the provider's return values are still just `ArmyId`s.
- **Discovered during implementation (2026-09-11) — a full audit of what each `MatchSuggestionProvider` call site has already fixed vs. what it actually receives:**
  - `suggestAcceptedAttacker`'s shipped signature `(ourDefender, theirOfferedPair, ourAvailable, matrixGrid)` doesn't receive `theirAvailable`, so it can't look past the current sub-round.
  - `suggestAttackerPair`'s shipped signature `(ourAvailable, theirDefender, matrixGrid)` is missing **two** things: `theirAvailable` (its call site, `enterTheirDefender`, computes the post-removal set right there but doesn't pass it) and `ourDefender` (already fixed via `state.working.ourDefender` at that same call site, also not passed) — without `ourDefender`, the search can't score the eventual accept step several levels down this same sub-round's lookahead.
  - `suggestDefender` has no gap — both its params were already sufficient.
  - Resolved (user decision, 2026-09-11, on the first-found instance — its own stated rationale, "restores full lookahead symmetry across all 3 methods," covers the rest): widen `suggestAttackerPair` to `(ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid)` and `suggestAcceptedAttacker` to `(ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid)`, threading the missing values through from `matchSessionEngine.ts`'s two call sites, which already have all of them in scope.

## What We're NOT Doing

- **Modeling opponent behavior probabilistically** — the algorithm assumes worst-case (minimax), not a distribution over likely opponent choices. No opponent-skill setting, no difficulty levels.
- **Keeping `randomSuggestionProvider` around** — it's deleted, along with its tests. It served its purpose as increment 1's placeholder and as the seam-defining implementation; the engine's own tests already use a purpose-built deterministic fake, not this one.
- **A new E2E test** — the existing `tests/e2e/live-match-mode-session.spec.ts` drives the UI generically (clicks whichever option is offered) and asserts exclusion/completion behavior that holds regardless of which provider is wired in. Re-running it is regression coverage for this change, not a reason to write a new one.
- **Restructuring the `MatchSuggestionProvider` interface** — still the same 3 methods, same purpose; `suggestAttackerPair` gains `theirAvailable` + `ourDefender`, `suggestAcceptedAttacker` gains `theirAvailable` (see Key Discoveries) to fix real lookahead gaps discovered during implementation.
- **Explaining the suggestion to the captain** (e.g., "why this army") — out of scope; the UI still just highlights the suggested option, unchanged from increment 1.

## Implementation Approach

Two self-contained pieces, both landing in `src/lib/matchSuggestions.ts`: (1) a pure cell-scoring function handling all three `Estimate` cases plus the unestimated case, and (2) a recursive minimax search that mirrors `matchSessionEngine.ts`'s sub-round mechanics to explore the full remaining game from whichever point each `MatchSuggestionProvider` method is called. Both are pure and fully unit-testable without the engine, storage, or UI. Once verified in isolation, `MatchSession.tsx` gets a one-line import swap.

## Critical Implementation Details

**Scoring rule for purple and unestimated cells** (explicitly arbitrary, per user decision 2026-09-11): both `"purple"` and a missing estimate score as `7` — one point above orange's representative score (6), reflecting that purple is judged worse than yellow but better than orange. This applies uniformly everywhere a cell value is needed; there is no case where purple and unestimated are scored differently.

**Objective function**: the total score of a (hypothetically) completed session is the sum of the cell value (as above) over all 5 final our-vs-their pairings — the 2 pairings each sub-round commits (our defender vs. our accepted attacker; their defender vs. their picked attacker) plus the 1 forced refused-attacker pairing. Every final pairing consists of exactly one of our armies and one of theirs, so every pairing has a well-defined cell in `matrixGrid.estimates` (real, purple, or unestimated) regardless of which side "initiated" the commitment.

**Minimax structure**: the search alternates decision types exactly as `matchSessionEngine.ts` sequences them — our-defender (maximize) → their-defender (minimize) → our-attacker-pair-offer (maximize) → their-pick (minimize) → their-attacker-pair-offer (minimize) → our-accept (maximize) → next sub-round or terminal auto-pair. At a **maximizing** (our) node, try every candidate and keep the best achievable total. At a **minimizing** (their) node, try every candidate the opponent could pick from their available set at that point and keep the worst-for-us achievable total — this models the opponent as always choosing whatever is worst for our total score, including choices (their defender pick, their attacker-pair offer) that haven't actually happened yet in the real session at the time a given `MatchSuggestionProvider` method is called. The search explores these hypothetically to decide the current best move, exactly as minimax always does — it does not need the opponent's real future choice to already be known.

Each of the 3 exported methods roots this same recursive search at a different starting point, using only the facts already fixed at that call (its own parameters), and does not persist or share state across separate calls:
- `suggestDefender(ourAvailable, theirAvailable, matrixGrid)` — root at our-defender, full 6-step-per-subround sequence ahead.
- `suggestAttackerPair(ourAvailable, theirDefender, theirAvailable, ourDefender, matrixGrid)` — root at our-attacker-pair-offer; their defender is already fixed (already excluded from `theirAvailable`); `ourDefender` is threaded through purely for the downstream accept step this sub-round (widened signature, see Key Discoveries).
- `suggestAcceptedAttacker(ourDefender, theirOfferedPair, ourAvailable, theirAvailable, matrixGrid)` — root at our-accept; our defender and their offered pair are already fixed. `theirAvailable` (widened signature, see Key Discoveries) still includes both members of `theirOfferedPair` at this point — the search removes whichever is accepted before continuing.

**Tie-break rule** (per user decision 2026-09-11): when 2+ candidates for an our-decision tie exactly on the primary minimax value, prefer keeping in reserve whichever army has the best aggregate estimated score against the opponent's currently-available roster — i.e., define `reserveStrength(army, theirAvailable) = sum of cellValue over theirAvailable` for that army, and among tied candidates for `suggestDefender` and `suggestAttackerPair`, commit/offer the option(s) whose own `reserveStrength` is **lowest** (keeping the strongest all-arounder available for later). `suggestAcceptedAttacker` has no "which of ours stays reserved" analogue — a tie there breaks deterministically by roster order (first candidate), per the same fallback used when no richer tie-break applies.

## Phase 1: Scoring primitives, minimax search, and the new provider

### Overview

The complete algorithm, fully self-contained in `src/lib/matchSuggestions.ts` — not yet wired to production. The riskiest logic (the search correctness) is isolated and verifiable through unit tests alone.

### Changes Required:

#### 1. Cell scoring and minimax search

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Add `minimaxSuggestionProvider`, implementing the objective function, minimax search, and tie-break rule described in Critical Implementation Details. **`randomSuggestionProvider` (and `pickRandom`/`pickTwoDistinct`) stay in this file for now** — `MatchSession.tsx` still imports it until Phase 2's wiring swap, and removing it here would break the whole project's typecheck/lint in between phases for no benefit. Phase 2 removes all three as part of the same commit that swaps the import, so the project is fully green after every phase, never mid-broken. (Adjustment discovered during implementation, 2026-09-11 — the plan originally called for removing it in this phase.)

**Contract**: `MatchSuggestionProvider`'s `suggestAttackerPair` gains `theirAvailable: ArmyId[]` and `ourDefender: ArmyId` (both inserted before `matrixGrid`, after `theirDefender`); `suggestAcceptedAttacker` gains `theirAvailable: ArmyId[]` (inserted before `matrixGrid`, after `ourAvailable`) — `suggestDefender`'s signature is unchanged (already had everything it needs). New export `minimaxSuggestionProvider: MatchSuggestionProvider`. Internal helpers (cell-value function, the recursive search, the tie-break comparator) are implementation details of this file — not required to be individually exported, though may be if it helps the unit tests target them directly.

#### 2. Thread the missing values through the two widened call sites

**File**: `src/lib/matchSessionEngine.ts`

**Intent**: `enterTheirDefender` and `enterTheirAttackerPair` already have every value the widened signatures need in scope (computed or destructured from `state` for other purposes just above each call) — pass them through.

**Contract**: `enterTheirDefender`'s `provider.suggestAttackerPair(...)` call gains 2 arguments (the already-computed `theirAvailable`, and `state.working.ourDefender`); `enterTheirAttackerPair`'s `provider.suggestAcceptedAttacker(...)` call gains 1 (`state.theirAvailable`). No other change to this file — the deterministic fake provider in `matchSessionEngine.test.ts` needs no update (TypeScript allows a function with fewer declared parameters to satisfy a wider signature — the fake already omits trailing unused parameters), and the engine's phase/commit logic is untouched.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/lib/matchSuggestions.test.ts src/lib/matchSessionEngine.test.ts`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Hand-verify at least 2 of the unit tests' scenarios against the plan's Critical Implementation Details description, confirming the algorithm's actual behavior matches the documented rule before wiring it into production.

---

## Phase 2: Production wiring and cleanup

### Overview

Swap `MatchSession.tsx` from `randomSuggestionProvider` to `minimaxSuggestionProvider`, and confirm nothing else in the codebase still references the removed provider.

### Changes Required:

#### 1. Wire the new provider

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Replace all 4 `randomSuggestionProvider` references with `minimaxSuggestionProvider`.

**Contract**: Import-and-usage swap only — no other change to this file. Component behavior (rendering, storage, phase handling) is unaffected since the interface is identical.

#### 2. Remove the now-dead placeholder

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Delete `randomSuggestionProvider`, `pickRandom`, and `pickTwoDistinct` — kept through Phase 1 only so the project stayed green while `MatchSession.tsx` still referenced them (see Phase 1's Key Discoveries). Nothing references them once step 1 above lands.

**Contract**: Deletion only — `minimaxSuggestionProvider` and every other Phase 1 export is untouched.

### Success Criteria:

#### Automated Verification:

- No remaining references: `grep -r randomSuggestionProvider src/` returns nothing
- Full unit suite passes: `npx vitest run`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Existing E2E suite passes unmodified: `npx playwright test`

#### Manual Verification:

- Full 5-vs-5 session walkthrough via `npm run dev`: at each of the 3 decision points, confirm the highlighted suggestion is a defensible choice given the prepared matrix (not visibly arbitrary), and that the session still completes correctly with a final refused-attacker pairing.

---

## Testing Strategy

### Unit Tests:

- `matchSuggestions.test.ts` (rewritten for `minimaxSuggestionProvider`, replacing the increment-1 random-provider tests):
  - Cell-value function: real bands map via `bandToScore`; `"purple"` and an absent estimate both score `7`.
  - Hand-verifiable small scenarios (e.g., a single sub-round remaining, or a 3-army-per-side endgame) where the objectively correct choice is derivable by inspection and asserted exactly.
  - A full 5-vs-5 walkthrough proving the search terminates, every army is committed exactly once per side, and the total achieved score is internally consistent with the matrix used.
  - Tie-break scenario: two candidates with identical primary value, asserting the one preserving the higher-`reserveStrength` army in reserve is chosen.
  - `suggestAttackerPair` still returns 2 distinct ids; no method ever returns an army outside its given available set (mirrors increment 1's existing bounds tests, now against real logic instead of random).

### Integration Tests:

- None planned — `matchSessionEngine.ts` is provider-agnostic and its own tests (a deterministic fake provider) are unaffected by this change.

### Manual Testing Steps:

1. Full 5-vs-5 session walkthrough (see Phase 2 Manual Verification).
2. Spot-check one hand-computable scenario live in the browser against the same scenario's unit test.

## Performance Considerations

The search space is bounded by ≤5 armies per side (single-digit branching, depth ≤12 alternating levels for a full-session search) — a brute-force exhaustive search runs in microseconds, well within the PRD's "no perceptible delay" NFR. No memoization or pruning is needed at this scale.

## Migration Notes

None — no database schema changes, no data migration. This change only replaces an in-memory algorithm.

## References

- PRD: `context/foundation/prd.md` (FR-008, FR-010, FR-013, Business Logic)
- Roadmap: `context/foundation/roadmap.md` (S-06: Real scoring for live match-mode suggestions)
- GitHub issue: #7
- Prior increment: `context/archive/2026-09-11-live-match-mode-session/plan.md` (the `MatchSuggestionProvider` seam this change fills)
- Sub-round mechanics spec: `src/lib/matchSessionEngine.ts`'s own Critical Implementation Details / inline logic

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scoring primitives, minimax search, and the new provider

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/lib/matchSuggestions.test.ts src/lib/matchSessionEngine.test.ts` — 488a134
- [x] 1.2 Type checking passes: `npx astro check` — 488a134
- [x] 1.3 Linting passes: `npm run lint` — 488a134

#### Manual

- [x] 1.4 Hand-verified at least 2 unit-test scenarios against the algorithm description — 488a134

### Phase 2: Production wiring and cleanup

#### Automated

- [x] 2.1 No remaining references: `grep -r randomSuggestionProvider src/` returns nothing
- [x] 2.2 Full unit suite passes: `npx vitest run`
- [x] 2.3 Type checking passes: `npx astro check`
- [x] 2.4 Linting passes: `npm run lint`
- [x] 2.5 Build succeeds: `npm run build`
- [x] 2.6 Existing E2E suite passes unmodified: `npx playwright test`

#### Manual

- [x] 2.7 Full 5-vs-5 walkthrough — suggestions are defensible at all 3 decision points, session completes correctly
