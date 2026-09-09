<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap + Critical-Path Coverage

- **Plan**: context/changes/testing-bootstrap-critical-path-coverage/plan.md
- **Scope**: Phase 4 of 4 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes on Plan Adherence / Scope Discipline: two deviations from the plan's literal text occurred during implementation, both surfaced live via the mismatch protocol and explicitly approved before proceeding — not silent drift:
1. `vitest.config.ts` uses the `cloudflareTest` plugin (package root export) instead of the plan's named `defineWorkersConfig` from `/config` — the installed `@cloudflare/vitest-pool-workers@0.22.0` (targeting Vitest 4) doesn't ship that export; confirmed via the package's own `vitest-v3-to-v4` codemod. Same intent achieved.
2. `supabase/seed.sql` required an unplanned fix (NULL `confirmation_token`/`recovery_token`/`email_change_token_new`/`email_change` broke real GoTrue password sign-in) — presented via `AskUserQuestion` mid-Phase-3, approved as "Adapt and continue."
3. `matrix.test.ts` adds an army to captain A's existing seeded team via `addArmyToTeam` rather than creating a fresh team via `createTeamWithArmies` — discovered because `getTeamWithArmies` always resolves to a captain's oldest team, so a second team would never be the one `upsertEstimate` actually checks against. Documented inline.

Also bundled into the Phase 1 commit (user's explicit "Stage all" choice on the dirty-path prompt, unrelated to this plan): `.claude/skills/{10x-frame,10x-research,10x-tdd,10x-test-plan}/`, `.claude/prompts/m3l2-ad-hoc-testing.md`, `.claude/.10x-cli-manifest.json`, `CLAUDE.md` — pre-existing dirty state from before this change, not scope creep from this plan.

## Findings

### F1 — matrix.test.ts's beforeAll has no partial-failure cleanup guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/matrix.test.ts:29-79
- **Detail**: `beforeAll` creates five resources (team army, two opponents with armies) sequentially with no try/catch; `afterAll` unconditionally calls `cleanupTeamArmy`/`cleanupOpponent` on all five regardless of which actually got created. If setup throws partway (e.g. the second `createOpponentWithArmies` call fails), the suite correctly fails loudly, but `afterAll`'s blind cleanup of not-yet-assigned ids is untested — it currently relies on Supabase silently no-op'ing an `.eq("id", undefined)` filter rather than a deliberate guard. `opponents.test.ts` already uses a safer per-test `try/finally` pattern for the same class of setup.
- **Fix**: Mirror `opponents.test.ts`'s try/finally pattern — track which resources were actually created and clean up only those in a catch block, or restructure setup to fail fast without leaving `afterAll` guessing.
  - Strength: Matches the safer pattern already established in the sibling file in this same phase; removes reliance on an unverified Supabase no-op behavior.
  - Tradeoff: A few extra lines of bookkeeping in `beforeAll`.
  - Confidence: HIGH — `opponents.test.ts`'s pattern is right there as a template.
  - Blind spot: None significant — this is a bootstrap-phase test file with low traffic, so the practical risk is low even unfixed.
- **Decision**: FIXED — wrapped beforeAll setup in try/catch, cleaning up only resources recorded in `created` (a shared `cleanupCreated()` helper used by both the catch block and afterAll). Verified: `npm run lint` clean, `npm test -- matrix` 2/2 passing, full suite 24/24.

### F2 — Opponent-army-id lookup duplicated across matrix.test.ts and opponents.test.ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/matrix.test.ts:49-57,64-72 vs src/lib/opponents.test.ts:7-13
- **Detail**: The same `.from("opponent_armies").select("id").eq("opponent_id", ...).single()` lookup appears three times across two files — once already factored into a local `getOpponentArmyId` helper in `opponents.test.ts`, twice inlined with slightly different error messages in `matrix.test.ts`.
- **Fix**: Move `getOpponentArmyId` into `src/lib/testSupport/twoCaptains.ts` and import it from both test files.
- **Decision**: FIXED — `getOpponentArmyId` moved into `twoCaptains.ts`; `opponents.test.ts` now imports it instead of defining locally; `matrix.test.ts`'s two inline lookups replaced with calls to it. Verified: `npm run lint` clean, full suite 24/24 passing.

## Success Criteria Verification (re-run at review time)

- `npm test` — 24/24 passing (4 test files)
- `npm run lint` — clean
- `npx astro sync && npm run build` — clean
- All Manual Progress items across all 4 phases: `[x]`, each with observable evidence in the diff/commits (no rubber-stamping detected)
