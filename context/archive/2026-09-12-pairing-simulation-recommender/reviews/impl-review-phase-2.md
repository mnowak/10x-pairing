<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Selectable Opponent-Behavior Modes for Pairing Simulation

- **Plan**: context/changes/pairing-simulation-recommender/plan.md
- **Scope**: Phase 2 of 5
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING (1 finding) |
| Success Criteria | WARNING (1 finding) |

## Summary

Implementation code (`matchSuggestions.ts`, `opponentMoves.ts`, `MatchSession.tsx`'s minimal call-site fix) matches the plan's stated contract exactly, verified by two independent sub-agent sweeps plus 90/90 tests passing. Tie-break rationale is documented and correctly mirrors the existing "our-side" precedent. Two real findings: the integration test is a bounds/smoke test rather than the hand-verified, theoretically-correct scenario the plan's Testing Strategy called for, and one new function has an inconsistent parameter order relative to its siblings.

## Findings

### F1 — Integration test doesn't verify a theoretically-correct outcome, only that it completes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/lib/matchSuggestions.test.ts:424-521 ("mirroredOpponentProvider — full 5-vs-5 walkthrough")
- **Detail**: The plan's Testing Strategy calls for an integration test that "verif[ies] the resulting pairing matches the theoretically correct outcome for a hand-constructed scenario," mirroring `matchSessionEngine.test.ts`'s `runSubRound` pattern. The actual test drives real engine transitions with `mirroredOpponentProvider` across a full 5v5 double sub-round, but only asserts "no thrown errors, every army committed exactly once" (copying Phase 1's bounds-test pattern) — it never asserts what the opponent's picks *should* be. Function-level correctness is otherwise well covered by the `bestTheir*` unit tests (which do independently verify expected picks, including tie-breaks), so this isn't a correctness gap in the algorithm itself — it's a gap in proving the *wiring* produces the theoretically expected end-to-end result, not just "didn't crash."
- **Fix A ⭐ Recommended**: Add a small, fully hand-provable integration test using a uniform grid (every cell the same color band) over a minimal 3v3 single-sub-round scenario. With every value tied, every decision point's tie-break degenerates to "first candidate in the current available list wins" — already proven correct by the Phase 2 unit tests — making the entire session's outcome exactly predictable by hand: defender "o1", their-defender "t1", forced pair ["o2","o3"], their-pick "o2", forced pair ["t2","t3"], our-accept "t2", forced refusal o3 vs t3. This drives the real `matchSessionEngine.ts` transitions with both `minimaxSuggestionProvider` (ours) and `mirroredOpponentProvider` (theirs) and asserts the exact final `history`/`refusedAttacker`, satisfying the plan's stated intent without the tedium of hand-tracing a full 5v5 double-sub-round.
  - Strength: Genuinely provable by hand (verified), proves real end-to-end wiring with a known-correct answer, reuses the existing `matchSessionEngine.test.ts` assertion style.
  - Tradeoff: One more test to write and keep in sync if the engine's phase sequence ever changes.
  - Confidence: HIGH — already hand-traced and verified against the codebase's actual tie-break implementations before writing this report.
  - Blind spot: None significant.
- **Fix B**: Accept the current smoke test as sufficient, given the `bestTheir*` unit tests already independently verify decision correctness in isolation.
  - Strength: No additional work; the smoke test does still prove the provider integrates with the real engine without error across a full session.
  - Tradeoff: A subtle wiring bug that happens to still traverse every phase without erroring (e.g., a swapped provider reference) wouldn't be caught by this test alone, only by chance via the unit tests catching the underlying function's behavior in isolation.
  - Confidence: MEDIUM — the unit tests reduce this risk substantially but don't fully eliminate it for the *wiring* specifically.
  - Blind spot: Haven't verified whether a plausible wiring mistake exists that unit tests wouldn't also catch.
- **Decision**: FIXED via Fix A — added `matchSuggestions.test.ts`'s "a uniform grid produces the exact, hand-provable outcome via the real engine" test, driving the real engine end-to-end and asserting the exact predicted `history`/`refusedAttacker` (traced and verified: all 91 tests pass).

### F2 — bestTheirDefender's parameter order is inconsistent with its siblings

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/matchSuggestions.ts:204-220 (vs. bestTheirAttackerPair:291-307, bestTheirPick:336-355)
- **Detail**: `bestTheirDefender`'s parameter order is `(ourAvailable, theirAvailable, ourDefender, matrixGrid, score)`, while its siblings `bestTheirAttackerPair`/`bestTheirPick` (and `OpponentMoveProvider`'s own method order) put `theirAvailable` first. This forces `mirroredOpponentProvider.pickDefender` (opponentMoves.ts:75-76) to swap the two arrays to compensate when calling it — correct today (verified by the wiring test), but an avoidable inconsistency for future readers and future callers (e.g., Phase 3's Similar-mode provider will hit the same swap).
- **Fix**: Reorder `bestTheirDefender`'s parameters to `(theirAvailable, ourAvailable, ourDefender, matrixGrid, score)` to match its siblings, and update its call site in `mirroredOpponentProvider.pickDefender` to drop the now-unnecessary swap.
- **Decision**: FIXED — reordered `bestTheirDefender`'s signature; updated its one production call site and 3 test call sites accordingly. All tests pass.

### F3 — Tie-break test lacks a written trace for a future reader

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/matchSuggestions.test.ts:160-187
- **Detail**: The `bestTheirDefender` tie-break test's comment justifies the expected result via "structural mirror of bestOurDefender's own tie-break test" rather than showing the trace inline — the recursion shape actually differs slightly (bestTheirDefender skips straight to `searchOurAttackerPair` since `ourDefender` is already fixed, unlike `bestOurDefender`'s own recursion through `searchTheirDefender`). The mirror claim holds (independently re-traced during this review), but a future reader can't verify it from the comment alone without redoing that work.
- **Fix**: Optional — expand the comment to note the one structural difference (no `searchTheirDefender` hop) and why the mirror claim still holds despite it, for a future reader's benefit.
- **Decision**: FIXED — expanded the comment in `matchSuggestions.test.ts` to note the recursion-shape difference and why the neutral `ourDefender="d"` construction still guarantees the mirror claim holds.
