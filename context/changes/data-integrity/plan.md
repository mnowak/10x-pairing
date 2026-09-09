# Data-Integrity Coverage Implementation Plan

## Overview

Prove estimate loss can't happen silently through the two write paths that can currently trigger it (`removeArmyFromTeam`, `removeArmyFromOpponent`), per `context/foundation/test-plan.md` §2–§3, Phase 2 (risks #4, #5). Also add a forward-looking guard against a future team-/opponent-level delete feature silently reintroducing the same risk, and record one deliberately-unfixed gap so it isn't silently forgotten.

## Current State Analysis

- Full grounding for this phase already exists in `context/changes/data-integrity/research.md` — this plan does not re-derive it, only cites it.
- Exactly two production write paths can delete a `pairing_matrix_estimates` row, both single-army removal, both cascade-only: `removeArmyFromTeam` ([src/lib/teams.ts:118-130](src/lib/teams.ts#L118-L130)) and `removeArmyFromOpponent` ([src/lib/opponents.ts:125-141](src/lib/opponents.ts#L125-L141)). No path deletes `pairing_matrix_estimates` directly.
- No team-level or opponent-level delete route exists in production today — confirmed against the full 10-route listing under `src/pages/api/**`.
- The removal-confirmation counts (`getEstimateCountsForTeamArmies` at [src/lib/teams.ts:137-161](src/lib/teams.ts#L137-L161), `getEstimateCountsForOpponentArmies` at [src/lib/opponents.ts:147-171](src/lib/opponents.ts#L147-L171)) are provably scoped consistently with what the FK cascade deletes, because `upsertEstimate` ([src/lib/matrix.ts:85-97](src/lib/matrix.ts#L85-L97)) guarantees every estimate's `captain_id` always matches its referenced armies' owner.
- Research surfaced two real gaps beyond test-plan.md's original risk wording, both resolved during this planning session:
  - **Gap 1 — no server-side confirmation guard.** Decided: accept and note only, no test. A meaningful test requires new Astro-route-level test infrastructure (mock `AstroCookies` + `context.locals.user` — the production routes use `@supabase/ssr`'s cookie-based `createServerClient` via `src/lib/supabase.ts`, a different session mechanism from the plain anon-key client this project's integration tests use) that doesn't exist anywhere in this project yet, and a lib-level test would be redundant with this phase's own cascade-proof tests (`removeArmyFromTeam`/`removeArmyFromOpponent` have no confirmation parameter at all — that's already implied by calling them directly).
  - **Gap 2 — stale confirmation count.** Decided: pin with a reproducing test. The count is a page-load-time snapshot never refetched before delete; fully reproducible at the lib level (fetch count, add another estimate to simulate "meanwhile in another tab," delete, assert the cascade removed more rows than the count showed).
- Phase 1 (`context/changes/testing-bootstrap-critical-path-coverage/`) already established every convention this phase reuses: co-located `*.test.ts` files, the `src/lib/testSupport/twoCaptains.ts` two-captain fixture (`signInCaptain`, `getCaptainId`, `cleanupTeam`/`cleanupTeamArmy`/`cleanupOpponent`, `describeSetupError`, `getOpponentArmyId`), the Workers Pool test runtime, and — from that phase's own impl-review triage — a safer `beforeAll` pattern (track created-resource ids incrementally, clean up only what was actually created, `try`/`catch` around setup) that this phase's new test files should use from the start rather than repeat the weaker pattern that had to be fixed after the fact.

### Key Discoveries:

- `src/lib/opponents.test.ts` already exists (Phase 1) with a cross-captain-protection describe block — this phase adds a second describe block to that same file, not a new file.
- `src/lib/teams.ts` has no existing test file — this phase creates `src/lib/teams.test.ts`.
- `pairing_matrix_estimates` has a `unique (team_army_id, opponent_army_id)` constraint ([supabase/migrations/20260904185524_create_pairing_domain_schema.sql:41-42](supabase/migrations/20260904185524_create_pairing_domain_schema.sql#L41-L42)) — to seed N estimate rows referencing one team army (or one opponent army), the fixture needs N *distinct* opponent armies (or team armies), not N calls against the same pair.
- `src/pages/api/teams/index.ts` and `src/pages/api/opponents/index.ts` are the only two files at a "whole resource" route level today, both `POST`-only (create) with no `DELETE` export — the natural place a future whole-team/whole-opponent delete route would most likely land.

## Desired End State

`npm test` (with `npx supabase start` running) executes two new/extended integration test files proving: (a) both removal paths' cascades actually delete the referencing estimates, (b) the shown confirmation count exactly matches what deletes under normal conditions, (c) the confirmation count can go stale under concurrent modification — a documented, labeled fact, not a passing-by-accident test — and (d) no team-/opponent-level delete route exists today. `test-plan.md` records the pattern, the labeling convention, Gap 1 as an accepted risk, and Phase 2's rollout status as `complete`.

### Verification
- `npm test` exits 0, `npm run lint` clean.
- Deleting a team/opponent army with 0, 1, and multiple existing estimates each behaves correctly (0 or N rows deleted, matching what was counted beforehand under non-concurrent conditions).
- The stale-count test fails if the "meanwhile in another tab" estimate write is removed from it (i.e. it has real signal, not a vacuous assertion) — verified manually, same spirit as Phase 1's mutation smoke check.

## What We're NOT Doing

- Fixing Gap 1 (server-side confirmation guard) — decided: accept and note, not this phase's job.
- Fixing Gap 2 (stale count) — decided: pin current behavior with a test, not fix it; the archived `remove-team-army` plan already accepted this trade-off.
- Testing the deeper `teams`/`opponents`-level cascade chain that only `src/lib/testSupport/twoCaptains.ts`'s test-only cleanup helpers exercise — decided: production paths only, since nothing currently reaches that code.
- Building Astro-route-level (HTTP/session) test infrastructure — out of scope for this phase; noted as a real cost if Gap 1 is ever revisited.
- CI wiring — test-plan.md §3 Phase 4's job.
- Live match-mode coverage (risks #1, #6) — test-plan.md §3 Phase 3's job, feature doesn't exist yet.

## Implementation Approach

Two phases of test-writing followed by a documentation phase, mirroring Phase 1's shape. Phase 1 covers both removal paths together (team-side and opponent-side are structurally identical, same as Phase 1's `matrix.test.ts`/`opponents.test.ts` pairing). Phase 2 adds the small, independent route-guard test. Phase 3 closes the loop in `test-plan.md`. All tests are lib-function-level against real local Supabase, consistent with Phase 1's established test layer.

## Critical Implementation Details

**Reuse the safer `beforeAll` pattern from the start.** Phase 1's `matrix.test.ts` originally used a `beforeAll` that cleaned up all created resources unconditionally, regardless of which had actually been created — its own impl-review flagged this and it was fixed to track created-resource ids incrementally with a `try`/`catch` around setup (see `src/lib/matrix.test.ts`'s `created` object and `cleanupCreated()` helper, current code). This phase's new test files should use that same pattern from the outset, not the earlier, already-superseded one.

**Multi-estimate fixtures need distinct armies, not distinct calls.** Because `(team_army_id, opponent_army_id)` is unique, a fixture that wants N `pairing_matrix_estimates` rows referencing one team army under test needs N distinct opponent armies (create one opponent with N armies, or N single-army opponents — either works); the mirror applies for opponent-side tests needing N distinct team armies. A naive fixture that calls `upsertEstimate` N times against the same pair will just overwrite one row, not create N.

## Phase 1: Estimate-Loss Protection Tests (Risks #4, #5)

### Overview

Prove both removal paths' cascades actually delete referencing estimates, prove the shown confirmation count matches what deletes under normal conditions, and pin the known stale-count gap as a clearly-labeled, deliberately-accepted fact rather than a silent pass.

### Changes Required:

#### 1. Team-side data-integrity tests

**File**: `src/lib/teams.test.ts` (new)

**Intent**: Prove `removeArmyFromTeam`'s cascade genuinely deletes every `pairing_matrix_estimates` row referencing the removed army, prove `getEstimateCountsForTeamArmies` predicts that exactly under normal conditions, and pin the stale-count gap as a labeled known limitation.

**Contract**: Three cases against a real local Supabase instance, using the `twoCaptains.ts` fixture and the seeded-team pattern established in Phase 1 (`getTeamWithArmies` + `addArmyToTeam` against the captain's existing seeded team, not a freshly-created second team):
- Cascade + count-match, zero estimates: a freshly-added team army with no estimates reports a count of 0 and removal succeeds cleanly.
- Cascade + count-match, multiple estimates: a team army with estimates against 2+ distinct opponent armies reports a count matching the actual row count, and after removal a follow-up read confirms zero `pairing_matrix_estimates` rows remain referencing that team army id.
- A separate, explicitly-labeled describe block (per the labeling convention below) reproducing Gap 2: fetch the count, then add one more estimate for the same team army against a new opponent army (simulating a concurrent write), then remove the army, then assert the actual number of deleted rows exceeds the count that was fetched before the concurrent write — with a comment citing `context/archive/2026-09-07-remove-team-army/plan.md:33`'s accepted trade-off.

#### 2. Opponent-side data-integrity tests

**File**: `src/lib/opponents.test.ts` (extend existing)

**Intent**: Mirror the team-side coverage for `removeArmyFromOpponent`/`getEstimateCountsForOpponentArmies`, added as a new describe block alongside the existing Phase 1 cross-captain-protection block in the same file.

**Contract**: Same three cases as the team-side file, opponent-scoped: cascade + count-match with zero estimates, cascade + count-match with multiple estimates (requiring 2+ distinct team armies referencing the one opponent army under test), and the same labeled stale-count reproduction.

#### 3. Known-limitations labeling convention

**Intent**: Make it structurally obvious, at a glance, which tests prove real protection and which document an accepted, unfixed gap — so neither this phase's own reviewer nor a future `/10x-impl-review` mistakes "this gap exists" for "this is covered."

**Contract**: In both `teams.test.ts` and `opponents.test.ts`, the stale-count reproduction lives in its own `describe("known limitations (accepted, not a regression)", ...)` block (exact wording may vary slightly, intent must not), with a comment linking to the archived plan's trade-off note. This convention applies to this phase only where relevant — the cascade/count-match tests are genuine protection tests and stay in their normal describe blocks.

### Success Criteria:

#### Automated Verification:

- `npx supabase start` succeeds locally (prerequisite, not itself part of `npm test`)
- `npm test -- teams` passes against the running local instance
- `npm test -- opponents` passes against the running local instance
- `npm run lint` passes

#### Manual Verification:

- Temporarily remove the "concurrent write" step from each stale-count reproduction test and confirm it then fails (proves real signal, not a vacuous pass) — then restore it, same spirit as Phase 1's mutation smoke check

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Route-Level Regression Guard

### Overview

Add a lightweight, forward-looking test asserting no team-/opponent-level delete route exists today, so one can't be added later without a deliberate, conscious decision (and, implicitly, its own confirmation flow).

### Changes Required:

#### 1. Delete-route absence guard

**File**: `src/pages/api/deleteGuard.test.ts` (new)

**Intent**: Fail loudly the day a whole-team or whole-opponent delete route is added without anyone having consciously revisited the silent-cascade risk that FR-017/FR-019 already had to be retrofitted once to cover.

**Contract**: Statically imports `src/pages/api/teams/index.ts` and `src/pages/api/opponents/index.ts` (the two "whole resource" route files today) and asserts neither exports a `DELETE` handler. Scope is deliberately narrow — it does not filesystem-scan for a hypothetical new route file elsewhere; a comment states this limitation explicitly so it isn't mistaken for a comprehensive guard.

### Success Criteria:

#### Automated Verification:

- `npm test -- deleteGuard` passes
- `npm run lint` passes

#### Manual Verification:

- Confirm the test's comment accurately describes its scope limitation (statically-imported files only, not a full route scan)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cookbook + Test-Plan Sync

### Overview

Record this phase's test pattern and labeling convention in `test-plan.md`, note Gap 1 as an accepted, documented risk, and flip Phase 2's rollout status.

### Changes Required:

#### 1. Cookbook entries, accepted-risk note, and rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Let the next rollout phase copy a real pattern, make Gap 1 visible to future readers instead of silently forgotten, and reflect that Phase 2 shipped.

**Contract**: §6.4 "Adding a test for a new API endpoint" gets a paragraph naming `src/lib/teams.test.ts`/`opponents.test.ts` as the write-path/cascade-delete integration pattern — real local Supabase, independently-seeded fixtures (distinct armies per estimate, not repeated upserts), zero/multiple-estimate cases. §6.5 "Per-rollout-phase notes" gets an entry naming the "known limitations (accepted, not a regression)" describe-block convention and the `deleteGuard.test.ts` route-absence pattern. §7 "What We Deliberately Don't Test" gets a new bullet recording Gap 1 (no server-side confirmation guard on either removal route) as a deliberate, accepted risk — low severity (self-inflicted only, RLS still prevents cross-captain damage), with a note that closing it would require new Astro-route-level test infrastructure not yet built. §3's Phased Rollout table changes Phase 2's `Status` cell from `not started` to `complete` and fills in the `Change folder` cell with `context/changes/data-integrity/`. §1–§5 (aside from the one named §3 cell) and §8 are otherwise left untouched.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (no source changes, but keeps the gate uniform)

#### Manual Verification:

- Read the new §6.4/§6.5 entries and the new §7 bullet; confirm a future contributor could both add a similar test and understand why Gap 1 is unfixed, from the doc alone

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None new — this phase is entirely integration-level (both risks require a real database to mean anything, per test-plan.md §4's "Likely cheapest layer" guidance for risks #4/#5).

### Integration Tests:

- Cascade-deletion correctness for both removal paths, count-scoping correctness for both, stale-count reproduction for both (Phase 1), delete-route absence guard (Phase 2). See each phase's Contract for the full case list.

### Manual Testing Steps:

1. `npx supabase start`, then `npm test` — confirm all suites pass end-to-end locally.
2. Temporarily remove the concurrent-write step from each stale-count test and confirm it fails, then restore — lightweight mutation smoke check, same pattern as Phase 1.
3. Read the final `test-plan.md` diff and confirm the Gap 1 note reads as a deliberate decision, not an oversight.

## Performance Considerations

Not applicable at this project's scale — test-plan.md §4 records no performance-layer tooling as in scope for this or any rollout phase.

## Migration Notes

Not applicable — this phase adds tests and documentation only; no schema or data changes.

## References

- Research: `context/changes/data-integrity/research.md` (full grounding for every claim in this plan)
- Test-plan rollout entry: `context/foundation/test-plan.md` §2 (Risk Map, rows #4/#5), §3 (Phase 2 row)
- Phase 1 precedent for test layer, fixture, and the safer `beforeAll` pattern: `context/changes/testing-bootstrap-critical-path-coverage/plan.md`, `src/lib/matrix.test.ts`
- Accepted stale-count trade-off: `context/archive/2026-09-07-remove-team-army/plan.md:33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Estimate-Loss Protection Tests (Risks #4, #5)

#### Automated

- [x] 1.1 `npx supabase start` succeeds locally — c75a670
- [x] 1.2 `npm test -- teams` passes against the running local instance — c75a670
- [x] 1.3 `npm test -- opponents` passes against the running local instance — c75a670
- [x] 1.4 `npm run lint` passes — c75a670

#### Manual

- [x] 1.5 Removing the concurrent-write step from each stale-count test makes it fail, then restored — c75a670

### Phase 2: Route-Level Regression Guard

#### Automated

- [x] 2.1 `npm test -- deleteGuard` passes — b6b4453
- [x] 2.2 `npm run lint` passes — b6b4453

#### Manual

- [x] 2.3 Test's scope-limitation comment confirmed accurate — b6b4453

### Phase 3: Cookbook + Test-Plan Sync

#### Automated

- [x] 3.1 `npm run lint` passes

#### Manual

- [ ] 3.2 §6.4/§6.5 entries and the §7 Gap 1 bullet read as sufficient for a future contributor to follow unaided
