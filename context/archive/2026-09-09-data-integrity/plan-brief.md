# Data-Integrity Coverage — Plan Brief

> Full plan: `context/changes/data-integrity/plan.md`
> Research: `context/changes/data-integrity/research.md`

## What & Why

Prove estimate loss can't happen silently through the two write paths that can currently trigger it — `removeArmyFromTeam` and `removeArmyFromOpponent` — closing test-plan.md's risks #4 and #5. Also add a forward-looking guard against a future team-/opponent-level delete feature reintroducing the same silent-cascade risk, and record one deliberately-unfixed gap so it isn't silently forgotten.

## Starting Point

Research (this change's `research.md`) found the actual write-path surface is much narrower than the risk names suggested: exactly two reachable delete paths, both single-army, both already gated by a working, correctly-scoped UI confirmation. No path deletes estimates directly; no team-/opponent-level (or account-level) delete route exists in production, though the schema fully supports the cascade if one is ever added. The confirmation count's scoping is provably consistent with what the cascade actually deletes, thanks to an upstream ownership guarantee in `upsertEstimate`.

## Desired End State

`npm test` runs new integration tests proving both cascades genuinely delete referencing estimates, proving the shown count matches what deletes under normal conditions, and pinning a known stale-count gap as a clearly-labeled fact rather than a silent pass — plus a lightweight guard that fails loudly if a whole-team/whole-opponent delete route is ever added. `test-plan.md` records the patterns and Phase 2's rollout status as complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gap 1 (no server-side confirmation guard) | Accept and note — no test | A meaningful test needs new Astro-route-level (cookie/session) test infrastructure not yet built anywhere in this project; a lib-level test would be redundant with this phase's own cascade tests. | Research → Plan (corrected mid-session — see below) |
| Gap 2 (stale confirmation count) | Pin with a reproducing test | Fully reproducible at the existing lib-level test layer; matches risk #5's own wording directly. | Research → Plan |
| Route-absence regression guard | Add it | Directly protects against risk #4's own "other future paths could cascade silently too" framing. | Research → Plan |
| Cascade-proof depth | Production paths only (not the deeper test-only-helper chain) | Nothing currently reaches the deeper `teams`/`opponents`-level cascade — testing it has no regression to protect against yet. | Plan |
| Known-limitation test labeling | Separate, explicitly-commented describe block | Cheap, greppable, matches this codebase's existing convention of citing archived design rationale in comments. | Plan |

**Mid-session correction on Gap 1**: the initial question described it as testable via "a direct POST to either remove route," implying route-level testing was cheap. Deeper analysis (reading `src/lib/supabase.ts` and `src/pages/api/auth/signin.ts`) showed the production routes use a cookie-based Supabase session (`@supabase/ssr`'s `createServerClient`) entirely different from the plain anon-key client this project's tests use — a genuinely new, unbuilt piece of test infrastructure, not a cheap addition. The user was asked again with the corrected framing and chose "accept and note."

## Scope

**In scope:**
- Cascade-deletion proof for both removal paths (`src/lib/teams.test.ts` new, `src/lib/opponents.test.ts` extended)
- Confirmation-count-matches-delete proof for both, including zero- and multiple-estimate cases
- A labeled reproduction of the stale-count gap for both
- A route-absence regression guard (`src/pages/api/deleteGuard.test.ts`)
- `test-plan.md` §6.4/§6.5 pattern documentation, §7 Gap-1 note, §3 Phase 2 status

**Out of scope:**
- Fixing Gap 1 or Gap 2 — both are pin/document decisions, not fixes
- Testing the deeper `teams`/`opponents`-level cascade chain (no production caller exists)
- Building Astro-route-level (HTTP/session) test infrastructure
- CI wiring (rollout Phase 4), live match-mode coverage (rollout Phase 3)

## Architecture / Approach

Same test layer as Phase 1: lib-function-level tests against a real local Supabase instance, using the established `src/lib/testSupport/twoCaptains.ts` fixture. New test files reuse Phase 1's post-impl-review `beforeAll` pattern (incremental created-resource tracking + try/catch cleanup) from the start, rather than repeating the weaker pattern that phase had to fix after the fact. The route-absence guard is a plain static-import check, no new infrastructure.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Estimate-Loss Protection Tests | `teams.test.ts` (new), `opponents.test.ts` (extended) — cascade, count-match, stale-count reproduction | Multi-estimate fixtures need distinct armies per estimate, not repeated upserts (unique constraint) — noted in Critical Implementation Details |
| 2. Route-Level Regression Guard | `deleteGuard.test.ts` — no whole-team/opponent delete route exists today | Deliberately narrow scope (two known files only, no filesystem scan) — documented, not hidden |
| 3. Cookbook + Test-Plan Sync | §6.4/§6.5 patterns, §7 Gap-1 note, Phase 2 status → complete | None significant — mechanical doc update |

**Prerequisites:** Local Supabase running (`npx supabase start`); Phase 1 (`testing-bootstrap-critical-path-coverage`) already implemented and providing the test runtime + fixture.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Gap 1 stays unfixed and untested by design — a future decision to close it will need new route-level test infrastructure this plan deliberately doesn't build.
- The route-absence guard only covers the two known "whole resource" route files; a delete route added under a different, unexpected path wouldn't trip it.

## Success Criteria (Summary)

- `npm test` passes locally with local Supabase running, covering risks #4 and #5 with real (not tautological) fixtures
- Removing the stale-count reproduction's concurrent-write step makes that test fail — proving real signal
- `test-plan.md` reflects what shipped and why Gap 1 is a deliberate, documented risk rather than an oversight
