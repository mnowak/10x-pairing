<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Live Match-Mode Test Coverage (test-plan Phase 3)

- **Plan**: context/changes/live-match-mode-test-coverage/plan.md
- **Scope**: Full plan (Phases 1-2)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

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

### F1 — test-plan.md §4 stack table still reads "e2e ... none yet" after Phase 3 closed

- **Severity**: WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:88`
- **Detail**: §4's stack table still has `e2e | Playwright | none yet — see Phase 3`, but this same change rewrote §6.3 to describe a fully-built, in-use Playwright e2e pattern, and Phase 3 now reads `complete`. Minor internal contradiction a few dozen lines apart in the same doc.
- **Fix**: Update the §4 e2e row to reflect the tool is in place (e.g. version + "in use since S-06/Phase 3", pointing at `tests/e2e/live-match-mode-session.spec.ts`) instead of "none yet."
- **Decision**: FIXED — §4 e2e row now reads "^1.63.0 — in place since Phase 3" pointing at the spec file and §6.3.

### F2 — CI e2e gate marked "required after Phase 3" but not actually wired into CI

- **Severity**: OBSERVATION
- **Dimension**: Scope Discipline
- **Location**: `context/foundation/test-plan.md:108`
- **Detail**: `.github/workflows/ci.yml` has no `test:e2e` job. This is explicitly Phase 4 (S-09/quality-gates-wiring)'s job, not this change's — confirmed out of scope by the plan's "What We're NOT Doing." No action needed here.
- **Decision**: DISMISSED (correctly out of scope for this change; Phase 4's job)

### F3 — roadmap S-12 status is `in-progress`, not `done`, despite the change being fully implemented

- **Severity**: OBSERVATION
- **Dimension**: Scope Discipline
- **Location**: `context/foundation/roadmap.md` (S-12 row + detail block)
- **Detail**: Sub-agent flagged this as an inconsistency since S-09–S-11 all read `done`. However, this project's convention (confirmed directly in this session for S-09/S-11) is forward-only status progression where `done` is set only by `/10x-archive`, not by `/10x-implement` completing. S-12 correctly sits at `in-progress` until archived — same lifecycle S-09–S-11 went through before their own archive commits flipped them to `done`.
- **Decision**: DISMISSED (expected — `done` is `/10x-archive`'s job, not yet run for this change)

### F4 — Minor cosmetic: army-ID casing and a new FR-citation convention in the test title

- **Severity**: OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/matchSuggestions.test.ts` (new test, ~line 399)
- **Detail**: New test uses uppercase army IDs (`D`, `X`, `Y`, `R`) where sibling scenarios in the same `describe` block use lowercase; the test title also cites `(FR-013 ...)`, a first for this file's test titles. Zero functional effect (`ArmyId` is a plain string type).
- **Decision**: DISMISSED (cosmetic only, no fix warranted)

## Verification run

- `git diff --stat 23b7b16^..HEAD -- src/lib/matchSuggestions.ts src/lib/matchSessionEngine.ts`: empty — confirmed zero production code changed.
- `npx vitest run src/lib/matchSuggestions.test.ts`: 33/33 passed, including the new test.
- Hand-derivation arithmetic independently re-verified against `bestOurAccept`/`continueOrFinish` (`src/lib/matchSuggestions.ts:407-457`) and `colorBands.ts` representative scores: correct (16 vs 28, "Y" wins).

## Notes

- Plan-drift sub-agent: full MATCH across all 4 planned changes plus the "not doing" guardrails (no production files touched, no new e2e file, `matchSessionEngine.test.ts`/e2e spec confirmed unmodified by this change's commits).
- Safety/pattern sub-agent: no security, reliability, or correctness issues. Test is a pure synchronous call, no flakiness risk, structurally consistent with the file's conventions.
