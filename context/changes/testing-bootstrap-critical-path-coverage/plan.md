# Bootstrap + Critical-Path Coverage Implementation Plan

## Overview

Stand up this project's first test runner (Vitest on `@cloudflare/vitest-pool-workers`) and use it to prove two of the project's top-ranked risks hold: the score↔band mapping (risk #2) and cross-captain write protection (risk #3), per `context/foundation/test-plan.md` §2–§3, Phase 1.

## Current State Analysis

- No test framework exists yet (`package.json` has no `vitest`, no `test` script; `CLAUDE.md` states this explicitly).
- CI (`.github/workflows/ci.yml`) runs `npm ci` → `npx astro sync` → `npm run lint` → `npm run build` only — no test step. Wiring CI is test-plan Phase 4's job, out of scope here.
- The score↔band mapping (`src/lib/colorBands.ts`) is a pure function with no I/O — `scoreToBand`/`bandToScore` over a fixed `COLOR_BANDS` table.
- The cross-captain write-protection logic already exists and is already fixed:
  - `upsertEstimate` (`src/lib/matrix.ts:68-114`) explicitly re-verifies both `teamArmyId` and `opponentArmyId` belong to the calling captain before writing, with a comment explaining that RLS's `WITH CHECK` only validates the new row's own `captain_id`, not that FK-referenced rows are owned by the same captain.
  - `removeArmyFromOpponent`/`removeArmyFromTeam` (`src/lib/opponents.ts:125-141`, `src/lib/teams.ts:118-130`) scope their `delete` to `.eq("captain_id", captainId)` explicitly, independent of RLS.
- A related but distinct bug (F1, `context/archive/2026-09-07-remove-team-army/reviews/impl-review.md`) was found and fixed in `src/pages/api/opponents/armies/remove.ts` — the route now checks `opponentArmyId` is present in the given `opponentId`'s own army list before calling `removeArmyFromOpponent`. That check lives in the route handler, not a lib function, and the bug it fixed was same-captain/cross-opponent, not cross-captain — it is *not* the same test target as risk #3, though it is the same bug class recurring, which is why test-plan.md names it as risk #3's evidence.
- All domain logic under test (`colorBands.ts`, `matrix.ts`, `teams.ts`, `opponents.ts`) takes a `SupabaseClient` as a parameter rather than importing `astro:env` or a Cloudflare binding — so these functions can be exercised directly with a real `@supabase/supabase-js` client, without going through an Astro route or the Cloudflare adapter.
- `supabase/seed.sql` already establishes a two-captain local fixture convention (`captain-a@example.test` / `captain-b@example.test`, password `test-password`) for RLS isolation checks — reused here rather than inventing a new fixture pattern.
- The confirmed score↔band palette (independent of the implementation) is recorded at `context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44`: `red 0-3, orange 4-8, yellow 9-11, green 12-15, dark-green 16-20`, representative scores `2/6/10/14/18`.

### Key Discoveries:

- `src/lib/matrix.ts:61-67` — the doc comment on `upsertEstimate` is itself evidence the ownership check is a deliberate fix, not an accident: "RLS's WITH CHECK only validates the new row's own captain_id, not that the *referenced* army rows are owned by the same captain."
- `context/archive/2026-09-08-cap-roster-size/plan.md:23` — cites `upsertEstimate` as this codebase's established precedent for re-deriving invariant-critical state server-side, reinforcing it's the right canonical example for risk #3.
- All five domain tables cascade-delete (`on delete cascade`) from `teams`/`opponents` down through their armies and estimates (`supabase/migrations/20260904185524_create_pairing_domain_schema.sql`) — test cleanup only needs to delete the top-level row.
- `wrangler.jsonc`'s `main` points at `@astrojs/cloudflare/entrypoints/server` — the full Astro SSR worker. The Cloudflare Workers Pool test runtime does not need this for the lib-level tests in this plan and should use its own minimal wrangler config instead.

## Desired End State

Running `npm test` locally (with `npx supabase start` already running) executes three suites — one smoke test, one unit suite, two integration test files — all green, inside a Cloudflare Workers Pool runtime. `context/foundation/test-plan.md` §6.1/§6.2 name real files as the pattern to copy for the next rollout phase, and §3's Phase 1 row reads `complete`.

### Verification
- `npm test` exits 0.
- `npm run lint` and `npx astro sync && npm run build` still pass (new tooling doesn't regress existing gates).
- Temporarily commenting out the ownership check in `upsertEstimate` (or the `captain_id` filter in `removeArmyFromOpponent`) makes the corresponding attack-path test fail — confirms the tests have real signal, not just correct shape.

## What We're NOT Doing

- CI wiring (test-plan.md §3 Phase 4's job).
- Data-integrity / cascade-delete coverage for risks #4 and #5 (test-plan.md §3 Phase 2's job).
- Live match-mode / suggestion-engine coverage for risks #1 and #6 (test-plan.md §3 Phase 3's job — the feature doesn't exist yet).
- HTTP-route-level tests (e.g. via a running Astro server or Astro `APIContext` mocks) — this phase tests the lib functions the ownership/mapping logic actually lives in, per the questioning round's Test Layer decision.
- Fixing the F1-class same-captain/cross-opponent gap in `opponents/armies/remove.ts`'s route handler — already fixed, and out of this risk's scope (it's a route-handler-level, not lib-level, concern).
- Running Stryker mutation testing — test-plan.md §5 scopes that to a later, selective pass, not this bootstrap phase.

## Implementation Approach

Four phases, each building on the last: stand up the runtime first (nothing else can run without it), then the cheap pure-function suite (risk #2, zero infra dependency), then the real-DB suite (risk #3, depends on local Supabase), then close the loop by writing the cookbook entries these two suites establish as patterns and flipping the rollout status. Both test suites call domain-layer functions directly (`src/lib/*.ts`), not HTTP routes — matching the dependency-injected design already in place and avoiding any need to simulate the full Astro/Cloudflare request path for this phase's risks.

## Critical Implementation Details

**Never point integration tests at a linked/remote Supabase project.** `supabase/seed.sql` already carries a warning that `supabase db reset --linked` would seed fake users into production; this plan's integration tests write and delete real rows under the two seeded captain accounts. The test fixture helper (Phase 3) must source its Supabase URL/anon key from the local Supabase CLI's own local-only output (e.g. `supabase status -o json`, or a value hardcoded to `http://127.0.0.1:54321` matching `supabase/config.toml`'s `[api] port = 54321`) — **not** from `.env`/`.dev.vars`, since `CLAUDE.md` notes those files may legitimately point elsewhere depending on a developer's local setup.

**The Workers Pool test config must not reuse the root `wrangler.jsonc`.** That file's `main` points at the full Astro SSR entrypoint (`@astrojs/cloudflare/entrypoints/server`) and an `assets` binding pointing at `./dist`, neither of which exists or is needed before these lib-level tests run. Phase 1 creates a dedicated, minimal wrangler config for the test pool, mirroring only `compatibility_date` (`2026-05-08`) and `compatibility_flags` (`["nodejs_compat"]`) from the root config so the simulated runtime still matches production.

## Phase 1: Environment Setup

### Overview

Install and wire Vitest on `@cloudflare/vitest-pool-workers`, resolve the `@/*` path alias, add `npm test`/`npm run test:watch`, and prove it all works with one smoke test before any real coverage is written.

### Changes Required:

#### 1. Test runner dependencies and scripts

**File**: `package.json`

**Intent**: Give the project a test runner and the two commands (run-once, watch) every later phase and future contributor will use.

**Contract**: Adds `vitest` and `@cloudflare/vitest-pool-workers` to `devDependencies` at current versions compatible with the project's pinned `wrangler` (`^4.90.0`) and `vite` (`^7.3.2` via the existing `overrides` entry). Adds `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`.

#### 2. Workers Pool test configuration

**File**: `vitest.config.ts` (new, project root)

**Intent**: Run tests inside a workerd-simulated runtime matching production, with the `@/*` alias resolved the same way `tsconfig.json` resolves it.

**Contract**: Uses `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config`. Points its wrangler config path at the new dedicated test config (next item), not `wrangler.jsonc`. Configures `resolve.alias` (or an equivalent tsconfig-paths mechanism) so `@/*` maps to `./src/*`.

#### 3. Dedicated test wrangler config

**File**: `wrangler.test.jsonc` (new, project root)

**Intent**: Give the Workers Pool a compatibility date/flags matching production without depending on the Astro SSR build (`main`) or a built `./dist` (`assets`) existing.

**Contract**: Carries `compatibility_date: "2026-05-08"` and `compatibility_flags: ["nodejs_compat"]`, copied from `wrangler.jsonc`. Omits `main` and `assets` — not needed for lib-level tests that never invoke the Astro worker.

#### 4. Smoke test

**File**: `src/lib/utils.test.ts` (new)

**Intent**: Prove the pool-workers runtime boots, TypeScript compiles under it, and the `@/*` alias resolves — before Phase 2/3 depend on any of that being true.

**Contract**: Imports `cn` from `@/lib/utils` and asserts a real (if trivial) outcome, e.g. that `cn("a", "b")` merges to `"a b"` and that a later conflicting Tailwind class wins via `twMerge`'s own rule — not a placeholder `1 + 1` assertion.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and the smoke test passes
- `npm run lint` still passes
- `npx astro sync && npm run build` still passes (new devDependencies/config don't regress the existing build)

#### Manual Verification:

- `npm run test:watch` starts and re-runs the smoke test on save

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit Tests — Score↔Band Mapping (Risk #2)

### Overview

Lock in the confirmed color-band palette with boundary, round-trip, and error-path coverage — this FR's boundaries were revised twice already (see `prd.md` FR-004's Socratic history), so boundary values are exactly where a regression would hide.

### Changes Required:

#### 1. Score↔band unit tests

**File**: `src/lib/colorBands.test.ts` (new)

**Intent**: Prove `scoreToBand`/`bandToScore` match the independently-confirmed palette, not just whatever `COLOR_BANDS` currently says — the oracle here is `context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44`, read and hardcoded into the test's expected values, not copied from `src/lib/colorBands.ts` itself.

**Contract**: A parametrized (`it.each`) suite covering:
- Every band's min and max boundary score — `0, 3` (red), `4, 8` (orange), `9, 11` (yellow), `12, 15` (green), `16, 20` (dark-green) — asserting `scoreToBand` returns exactly the band named in the archived palette for each.
- Round-trip consistency: for each band, `scoreToBand(bandToScore(band)) === band`.
- Error paths: `scoreToBand(-1)` and `scoreToBand(21)` throw; `bandToScore` called with a runtime value outside `ColorBand` (e.g. cast from a string) throws.

### Success Criteria:

#### Automated Verification:

- `npm test -- colorBands` passes
- `npm run lint` passes

#### Manual Verification:

- Diff the test's hardcoded expected boundary/band pairs against `context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44` by eye — confirming they were transcribed from the archived oracle, not read back off `COLOR_BANDS`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Integration Tests — Cross-Captain Write Protection (Risk #3)

### Overview

Prove, against a real local Supabase instance, that a write referencing another captain's data is rejected — the primary case (`upsertEstimate`'s explicit two-sided ownership check) and a defense-in-depth case (`removeArmyFromOpponent`'s `captain_id`-scoped delete).

### Changes Required:

#### 1. Two-captain fixture helper

**File**: `src/lib/testSupport/twoCaptains.ts` (new)

**Intent**: Give every integration test in this and future rollout phases one consistent, safe way to sign in as the two seeded local captains and clean up whatever rows a test created, without requiring a full `supabase db reset` between test files.

**Contract**: Exports `signInCaptain(which: "a" | "b"): Promise<SupabaseClient<Database>>`, authenticating against the local Supabase instance only (per Critical Implementation Details — sourced from `supabase status`/the known local port, never from `.env`/`.dev.vars`) using the credentials seeded in `supabase/seed.sql` (`captain-a@example.test` / `captain-b@example.test`, password `test-password`). Exports `cleanupTeam(client, teamId)` and `cleanupOpponent(client, opponentId)`, each deleting only the top-level row — cascade handles the rest per the schema's `on delete cascade` chain.

#### 2. `upsertEstimate` cross-captain regression test

**File**: `src/lib/matrix.test.ts` (new)

**Intent**: Prove the primary risk #3 case — a write naming another captain's `opponentArmyId` is rejected and never persisted, while a legitimate same-captain write still succeeds (both directions needed: an attack-path-only test can't distinguish "correctly rejects" from "rejects everything").

**Contract**: Using `signInCaptain`, captain A creates a team army and an opponent army; `upsertEstimate` called as A against A's own army pair returns `{ok: true}` and a follow-up read shows the stored score/band. Captain B creates an opponent army under B's own account; `upsertEstimate` called with A's `captainId`/`teamArmyId` but B's `opponentArmyId` returns `{ok: false}`, and a follow-up read (as B) confirms no `pairing_matrix_estimates` row was created referencing B's army. Cleans up both captains' created rows via the fixture helper.

#### 3. `removeArmyFromOpponent` cross-captain regression test

**File**: `src/lib/opponents.test.ts` (new)

**Intent**: Prove the defense-in-depth case — a captain cannot delete another captain's opponent army via `removeArmyFromOpponent`, independent of RLS. Distinct from the F1 fix (`context/archive/2026-09-07-remove-team-army/reviews/impl-review.md`), which lives in the route handler and covers a same-captain/cross-opponent case, not this one.

**Contract**: Captain B creates an opponent army; `removeArmyFromOpponent` is called as captain A (A's `captainId`, B's `opponentArmyId`). Asserts the row still exists afterward (read as B) — the delete must not report success against a row it didn't touch.

### Success Criteria:

#### Automated Verification:

- `npx supabase start` succeeds locally (prerequisite, not itself part of `npm test`)
- `npm test -- matrix` passes against the running local instance
- `npm test -- opponents` passes against the running local instance
- `npm run lint` passes

#### Manual Verification:

- With local Supabase running, temporarily comment out the ownership check in `upsertEstimate` (or the `.eq("captain_id", captainId)` filter in `removeArmyFromOpponent`) and confirm the corresponding attack-path assertion fails — then restore the check. Confirms the tests have real signal rather than passing regardless of the protection.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Cookbook + Test-Plan Sync

### Overview

Close the loop: record the patterns Phases 2 and 3 established in `test-plan.md`'s cookbook, and flip the rollout's Phase 1 status.

### Changes Required:

#### 1. Cookbook entries and rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Let the next rollout phase (data-integrity coverage, risks #4/#5) copy a real pattern instead of re-deriving one, and make the rollout table reflect that Phase 1 shipped.

**Contract**: §6.1 "Adding a unit test" gets a short paragraph naming `src/lib/colorBands.test.ts` as the pattern — pure function, `it.each` over every band boundary, oracle sourced from an archived plan doc rather than the implementation under test. §6.2 "Adding an integration test" gets a paragraph naming `src/lib/matrix.test.ts` / `src/lib/opponents.test.ts` and the `src/lib/testSupport/twoCaptains.ts` helper as the pattern — real local Supabase, two seeded captains, no mocking, cleanup via top-level-row delete relying on cascade. §3's Phased Rollout table changes Phase 1's `Status` cell from `change opened` to `complete`. §1–§5 and §8 are otherwise left untouched (the file's own header reserves those sections as frozen except for the specific cells named above).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (no source changes, but keeps the gate uniform)

#### Manual Verification:

- Read the new §6.1/§6.2 entries and confirm a future contributor could add a similar unit or integration test from them alone, without re-reading this plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Score↔band boundary, round-trip, and error-path coverage (Phase 2) — see Phase 2 Contract for the full case list.

### Integration Tests:

- Cross-captain write rejection for `upsertEstimate` and `removeArmyFromOpponent`, each paired with a legitimate same-captain write/delete to avoid a vacuously-passing attack-path-only test (Phase 3).

### Manual Testing Steps:

1. `npx supabase start`, then `npm test` — confirm all suites pass end-to-end locally.
2. Temporarily disable each ownership check in turn and confirm the matching test fails (Phase 3's manual criterion) — a lightweight mutation smoke check without running Stryker.
3. Skim the Phase 2 test's hardcoded palette values against the archived oracle to confirm no accidental mirroring of the implementation.

## Performance Considerations

Not applicable at this project's scale — test-plan.md §4 records no performance-layer tooling as in scope for this or any rollout phase.

## Migration Notes

Not applicable — this phase adds tests and test tooling only; no schema or data changes.

## References

- Test-plan rollout entry: `context/foundation/test-plan.md` §2 (Risk Map, rows #2/#3), §3 (Phase 1 row)
- Confirmed color-band oracle: `context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44`
- Cross-captain ownership-check precedent: `src/lib/matrix.ts:61-114`
- Related same-bug-class fix (route-handler level, not this plan's target): `context/archive/2026-09-07-remove-team-army/reviews/impl-review.md` (finding F1)
- Two-captain local fixture convention: `supabase/seed.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment Setup

#### Automated

- [x] 1.1 `npm test` runs and the smoke test passes — 507d94f
- [x] 1.2 `npm run lint` still passes — 507d94f
- [x] 1.3 `npx astro sync && npm run build` still passes — 507d94f

#### Manual

- [x] 1.4 `npm run test:watch` starts and re-runs the smoke test on save — 507d94f

### Phase 2: Unit Tests — Score↔Band Mapping (Risk #2)

#### Automated

- [x] 2.1 `npm test -- colorBands` passes — f6d945c
- [x] 2.2 `npm run lint` passes — f6d945c

#### Manual

- [x] 2.3 Hardcoded boundary/band pairs verified against the archived oracle, not `COLOR_BANDS` — f6d945c

### Phase 3: Integration Tests — Cross-Captain Write Protection (Risk #3)

#### Automated

- [x] 3.1 `npx supabase start` succeeds locally — 2345f8e
- [x] 3.2 `npm test -- matrix` passes against the running local instance — 2345f8e
- [x] 3.3 `npm test -- opponents` passes against the running local instance — 2345f8e
- [x] 3.4 `npm run lint` passes — 2345f8e

#### Manual

- [x] 3.5 Disabling each ownership check in turn makes the matching test fail, then restored — 2345f8e

### Phase 4: Cookbook + Test-Plan Sync

#### Automated

- [x] 4.1 `npm run lint` passes

#### Manual

- [ ] 4.2 §6.1/§6.2 entries read as sufficient for a future contributor to follow unaided
