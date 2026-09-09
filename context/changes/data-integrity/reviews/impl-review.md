<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Data-Integrity Coverage

- **Plan**: context/changes/data-integrity/plan.md
- **Scope**: Phase 3 of 3 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Both sub-agents confirmed no undisclosed drift: every planned file matches its Contract, and the one real deviation (`deleteGuard.test.ts`'s mechanism — `?raw` source-text check instead of the plan's literal "statically import and check `.DELETE`") was disclosed in-file, in `test-plan.md` §6.5, and in the Phase 2 commit message, after a genuine `astro:env/server`-resolution mismatch found and flagged live during implementation.

Note: I downgraded F1 from the reviewing sub-agent's CRITICAL rating to WARNING — the leak only manifests on test *failure* (not the happy path), is confined to local/test-only Supabase data recoverable via `supabase db reset`, and has zero production blast radius. Still a real, worth-fixing bug in test infrastructure, just not "reject the implementation" severity for a testing-bootstrap change.

## Findings

### F1 — try/finally opens after multiple resources are already created, in 4 locations

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/teams.test.ts:43-58` ("count matches..."), `:94-113` ("known limitations"); `src/lib/opponents.test.ts:98-110` ("reports zero estimates", data-integrity block), `:121-153` ("count matches...", inner try at L153 starts after *both* team armies exist), `:196-224` ("known limitations")
- **Detail**: In each location, 2+ resources are created via separate awaited calls before the `try` block opens. If a later creation throws — e.g. `addArmyToTeam`'s `MAX_ROSTER_SIZE` cap rejecting the second team army in `opponents.test.ts:146-151` — the earlier resource is never cleaned up, since no `finally` covers it yet. This is the same class of bug Phase 1's own impl-review (`context/changes/testing-bootstrap-critical-path-coverage/reviews/impl-review.md`, F1) already found and fixed once in `matrix.test.ts`, whose `created`-tracking + try/catch-from-first-creation pattern this phase's new tests should have reused from the start (the plan's own Critical Implementation Details said as much) but didn't consistently apply. Worst case: a leaked `team_armies` row on captain A's shared, cap-5 seeded team permanently consumes a roster slot, increasing the odds of a *later* test run's `addArmyToTeam` call hitting the cap and leaking again — a self-reinforcing failure mode confined to local test data.
- **Fix**: Move each `try` to wrap immediately after the first creation call (or adopt `matrix.test.ts`'s incremental `created`-object + outer try/catch pattern) at all 4 locations, so a failure at any creation step cleans up everything created before it.
  - Strength: Directly reuses a pattern already established, reviewed, and proven in this same test-plan rollout — no new design surface.
  - Tradeoff: Touches 4 call sites; slightly more verbose setup code in each.
  - Confidence: HIGH — the fix is mechanical and the target pattern already exists in the codebase.
  - Blind spot: None significant.
- **Decision**: FIXED — restructured all 4 locations so `try` wraps from the first creation call (either via `let x: string | undefined` for a single resource, or an incrementally-pushed `teamArmyIds: string[]` array for the multi-army cases), so any setup failure cleans up only — and exactly — what was actually created. Verified: `npm run lint` clean, `npm test -- teams` 3/3, `npm test -- opponents` 5/5, full suite 32/32.

### F2 — Uncoordinated roster-cap (5) headroom across parallel test files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/matrix.test.ts` (holds 1 slot on the shared seeded team for its whole file), `src/lib/opponents.test.ts` (transiently holds up to 2), `src/lib/teams.test.ts` (transiently holds up to 1) — all against the same captain-A seeded team, capped at 5 armies
- **Detail**: Vitest parallelizes across test files by default; worst-case concurrent usage across these three files approaches the cap with no headroom, and F1's leaks would push it over permanently. This is speculative (all 32 tests have passed cleanly on every run so far in this session) rather than an observed failure — flagging as a watch item, not a confirmed bug.
- **Fix**: If this ever manifests as flaky `MAX_ROSTER_SIZE` failures, serialize these three files (Vitest's `fileParallelism: false`, or a narrower per-file constraint) rather than raising the cap or restructuring the fixture.
- **Decision**: FIXED — set `fileParallelism: false` in `vitest.config.ts` (applies suite-wide, not just these 3 files, so future tests against the shared seeded team are protected too). Verified: `npm run lint` clean, full suite 32/32 passing.

### F3 — deleteGuard.test.ts's regex has a narrow false-negative surface

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/deleteGuard.test.ts:19`
- **Detail**: `/export\s+(const|function)\s+DELETE\b/` would miss a `DELETE` handler written as `export { h as DELETE }` or via a default-export object. Given this codebase's consistently-enforced `export const METHOD: APIRoute = ...` convention across every existing route file, the practical risk is low, but the guard's protective claim is technically broader than what it verifies.
- **Fix**: Note the syntax-coverage limitation in the file's existing scope-limitation comment.
- **Decision**: FIXED — added a note to the comment above `DELETE_EXPORT_PATTERN` in `src/pages/api/deleteGuard.test.ts`. Verified: `npm run lint` clean, full suite 32/32 passing.

## Success Criteria Verification (re-run at review time)

- `npm test` — 32/32 passing (6 test files)
- `npm run lint` — clean
- All Manual Progress items across all 3 phases: `[x]`, each with observable evidence in the diff/commits (no rubber-stamping detected)
- Git scope check: diff for this change touches exactly the 8 files named across the plan's 3 phases — no unplanned files
