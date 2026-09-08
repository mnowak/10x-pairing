<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cap Roster Size Implementation Plan

- **Plan**: context/changes/cap-roster-size/plan.md
- **Scope**: Phase 1-2 (full plan)
- **Date**: 2026-09-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

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

### F1 — `DEFAULT_ARMY_FIELDS` not derived from `MAX_ROSTER_SIZE`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/team/CreateTeamForm.tsx:8, src/components/opponent/CreateOpponentForm.tsx:8
- **Detail**: `DEFAULT_ARMY_FIELDS = 5` is a separate literal that happens to equal the imported `MAX_ROSTER_SIZE`, rather than being derived from it. Currently harmless (both are 5, and `addArmyField`/`validate` never let the client state exceed `MAX_ROSTER_SIZE` today), but a latent coupling: if `MAX_ROSTER_SIZE` is ever lowered, these forms would still start with 5 empty fields — above the new cap — with no client-side re-check.
- **Fix**: Change `const DEFAULT_ARMY_FIELDS = 5` to `const DEFAULT_ARMY_FIELDS = MAX_ROSTER_SIZE` in both files.
- **Decision**: FIXED

### F2 — Error message wording drifts between team-side and opponent-side

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/teams.ts:58,98 vs src/lib/opponents.ts:65,105
- **Detail**: `teams.ts` says "A team can have at most 5 armies" / "Your roster already has..."; `opponents.ts` says "A roster can have at most 5 armies" / "That roster already has...". Both are functionally correct `{type:"unknown", message}` errors that surface fine — purely a wording inconsistency, not a bug.
- **Fix**: Not required — the differing phrasing ("your" vs "that") is arguably correct given the ownership difference (your own team vs. an opponent you manage). Leaving as-is is a reasonable call; only worth touching if a future pass wants byte-identical messages.
- **Decision**: SKIPPED
