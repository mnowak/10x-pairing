<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Remove Army From Roster Implementation Plan

- **Plan**: context/changes/remove-team-army/plan.md
- **Scope**: Phase 1-3 (full plan)
- **Date**: 2026-09-08
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

## Findings

### F1 — Opponent-army removal doesn't verify the army belongs to the given opponent

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/opponents/armies/remove.ts:28
- **Detail**: `opponentArmyId` is deleted by `id` + `captain_id` only — the route never checks that it actually belongs to the `opponentId` also submitted in the form. Through the normal UI this can't happen (`OpponentDetail.tsx` sources both hidden fields from the same `opponent` object), and RLS still scopes the delete to the caller's own data, so this isn't exploitable across captains. But a tampered form could delete an army from a *different one of the same captain's own opponents* while the response redirects to the submitted `opponentId`'s page as if nothing happened there — a slightly different case than the plan's documented "stale/foreign ID → silent no-op," since here the delete *does* succeed, just against an army the redirect target didn't ask about.
- **Fix**: Before calling `removeArmyFromOpponent`, verify `opponentArmyId` is present in `opponent.armies` for the given `opponentId` (mirroring the ownership-style check pattern already used in `matrix.ts`'s `upsertEstimate`), or simplify by just dropping `opponentId` from the required contract and deriving the redirect target from the deleted row instead.
- **Decision**: FIXED
