<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Solo Pairing Simulation (Random Opponent)

- **Plan**: context/changes/pairing-simulation-session/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Summary

Both `src/lib/opponentMoves.ts` (new `OpponentMoveProvider` interface + `createRandomOpponentProvider` factory + `randomOpponentProvider` default) and `src/lib/matchSessionStorage.ts` (mode-keyed storage, live key unchanged) match the plan's intent exactly, including the generalized (not hardcoded-to-2) `pickAttackerPair`. The one out-of-plan change — `src/components/match/MatchSession.tsx`'s 3 call sites now passing `"live"` explicitly — was a disclosed, minimal adaptation to keep the repo compiling ahead of Phase 2's real UI wiring (per the mismatch protocol during implementation); verified to touch only those 3 argument lists, no behavior change. Test coverage matches the plan's Testing Strategy: boundary random values, pair distinctness, generalization beyond 2 available armies, live/simulation coexistence, and opponentId-mismatch nulling. `npm test` (72/72), `npm run build`, `npm run lint`, and `npx astro check` all pass.

## Findings

### F1 — Indexing an empty array returns `undefined` despite the `ArmyId` return type

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/opponentMoves.ts:24-28, 33
- **Detail**: `pickTwoDistinct`, `pickDefender`, and `pickAttackerChoice` all index into the input array without a length guard, so an empty input would silently return `undefined` at runtime despite the `ArmyId`/`[ArmyId, ArmyId]` return types. This mirrors an existing pattern already in `matchSuggestions.ts` (`pickBest`'s `candidates[0]`, `Math.max()` over an empty array) and relies on the same "≥2 armies remain" game invariant the comment above `pickTwoDistinct` documents. Not introduced by this phase — inherited from the codebase's existing convention of trusting the engine's roster invariants rather than re-validating them in leaf functions.
- **Fix**: No action needed — consistent with existing codebase convention (`matchSuggestions.ts`); the invariant is enforced upstream by `matchSessionEngine.ts`'s `assertValidRosters`/`assertAvailable`.
- **Decision**: DISMISSED (consistent with pre-existing codebase convention; no new risk introduced)
