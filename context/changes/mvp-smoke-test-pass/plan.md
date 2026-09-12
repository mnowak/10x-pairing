# Final MVP Smoke-Test Pass Implementation Plan

## Overview

Roadmap slice S-13 closes milestone M-3's north-star intent (MS-01: release-readiness): confirm every shipped MVP capability still works end-to-end, verified fresh after S-09–S-12's hardening work (CI gating, RLS/GRANT audit, error-visibility, live-match-mode test coverage). This is the first smoke-test pass in this project's history — no prior checklist artifact exists, so this plan both authors the reusable checklist and executes the first run against it.

## Current State Analysis

The MVP ships 10 page routes and 10 API routes across 4 feature areas (auth/onboarding, team/opponent/matrix management, live match-mode, solo practice simulation with 3 opponent-behavior modes), all auth-gated behind `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:5`). Automated test coverage (12 Vitest files, 3 Playwright specs) is strong on domain logic — score↔band conversion, cross-captain write protection, cascade-delete data integrity, the suggestion engine, and the live-match-mode committed-army/exactly-5 guardrails — but has **zero coverage at the UI/flow layer**: signup→confirm-email→signout, the team/opponent creation forms, the matrix-editing grid, the practice-mode picker's resume-vs-fresh-start branching, the roster-cap disabled-button UI, and the config-status degraded-mode banner.

S-09–S-12 (all `done`) already independently verified: CI now runs lint+typecheck+build+test on `main` with branch protection; production RLS/GRANT posture was audited and 3 gaps closed (mutable `search_path`, leftover `anon` grants, RLS policy performance); all 17 silent-catch sites now log via `logError()`; and the suggestion engine's immediate-vs-downstream trade-off is proven by a new unit test. This plan does not re-audit that work from scratch — it spot-checks that each holds, per the "audit, not assume" principle this milestone exists to enforce, without duplicating the prior slices' own verification effort.

## Desired End State

A reusable `smoke-test-checklist.md` exists in this change folder, covering every shipped capability with concrete step + expected-result items, prioritized toward the identified UI-layer coverage gaps. A dated `smoke-test-results.md` records this run's outcome: every item is either ✅ pass or ⚠️ documented-and-deferred with a follow-up change filed. Any trivial issue found (copy, a one-line bug) is fixed inline in this same change; anything larger is filed as its own `/10x-new` change and referenced by id. Roadmap S-13 and milestone M-3 can close once `smoke-test-results.md` shows a clean or fully-triaged run.

### Key Discoveries:
- `src/pages/dashboard/opponents/[id]/match.astro:60` and `.../simulate.astro:62` share the identical `rosterReady` (exactly-5) gate — the exactly-5 precondition applies to both live and practice entry points, not just live mode as the roadmap's S-12 naming might suggest.
- `supabase/seed.sql` seeds captain-a and captain-b each with an already-existing empty-roster team ("Captain A Team" / "Captain B Team") on every `npx supabase db reset` — the team-creation UI (`CreateTeamForm`) will NOT render for either seeded captain until that seeded team row is removed first.
- `src/lib/testSupport/twoCaptains.ts` documents the local demo credentials (`captain-a@example.test` / `captain-b@example.test`, password `test-password`) and warns `supabase db reset --linked` must never be run (it would seed fake users into the linked production project) — only local `npx supabase db reset` is safe.
- `src/lib/config-status.ts` + `src/layouts/Layout.astro:22-37` surface a repo-wide red banner on every page when Supabase env vars are unset — checkable by temporarily unsetting `SUPABASE_URL`/`SUPABASE_KEY` in `.env`/`.dev.vars` and restarting `astro dev`.
- `context/changes/production-security-audit/plan.md` (archived) used `npx supabase db advisors --linked` as its verification tool — reusable as-is for this pass's hardening spot-check.

## What We're NOT Doing

- Not re-running the full RLS/GRANT audit or CI-wiring verification from scratch — S-09/S-10 already did that work; this pass only spot-checks it still holds.
- Not testing S-14 (Similar-mode copy update), S-15 (README), or S-16 (frontpage redesign) — those roadmap slices are `ready`, not `done`, and are out of this slice's scope entirely.
- Not creating a fresh signup account to exercise the cold-start signup flow — this pass reuses the existing seeded captain-a/captain-b fixtures, consistent with the project's established test-fixture convention. Signup itself is smoke-tested by direct route inspection, not a full account creation.
- Not doing formal NFR testing (real device lab, network-throttling tooling, timing instrumentation) — lightweight targeted checks only (phone-width resize, brief offline check, eyeballed cross-captain isolation), matching `test-plan.md §7`'s existing exclusion of formal UI/perf tooling for this solo-captain-scale MVP.
- Not fixing every issue found no matter its size — only trivial (copy/one-line) fixes land in this change; anything touching logic, schema, or multiple files is filed as a follow-up change instead.
- Not editing `context/foundation/test-plan.md` directly — automation candidates surfaced by this pass are recorded in `smoke-test-results.md` only, as input for a future `/10x-test-plan --refresh`.

## Implementation Approach

Two phases: first author the checklist as a standalone, reusable artifact (so a future release can re-run it without re-deriving scope), then execute it once against local dev with a clean, deterministic seeded-captain state, recording results and closing out any trivial findings inline.

## Critical Implementation Details

**State sequencing**: Because `supabase/seed.sql` seeds both captains with an existing empty team, the checklist's setup section must sequence team-creation testing *before* everything else: reset the local DB, delete the seeded team row for captain-a only (via Supabase Studio at `http://localhost:54323` or a direct SQL delete — cascade-deletes are safe, nothing else exists yet), then walk `CreateTeamForm` for captain-a to create the real working team the rest of the pass uses. Captain-b's seeded team is left untouched and used only for the cross-captain-isolation NFR check.

## Phase 1: Build the Smoke-Test Checklist

### Overview

Author a standalone, reusable checklist enumerating every shipped capability as a concrete step + expected result, so this pass (and future release passes) has a fixed reference instead of ad-hoc exploration.

### Changes Required:

#### 1. Smoke-test checklist document

**File**: `context/changes/mvp-smoke-test-pass/smoke-test-checklist.md`

**Intent**: A new, reusable checklist covering every page route, API route, and practice mode from the shipped-feature inventory, organized by feature area, with each item phrased as an actionable step and its expected result. Items corresponding to the identified automated-coverage gaps (matrix-editing grid, practice-picker resume logic, roster-cap UI buttons, signup→confirm-email→signout, config-status banner) are called out explicitly as the pass's highest-priority manual checks, since nothing else verifies them. Includes: an environment setup/cleanup section (local dev + `npx supabase db reset` + the captain-a seeded-team removal from Critical Implementation Details), a section of lightweight NFR spot-checks (one-handed/phone-width layout, brief offline/slow-network check on match-mode, cross-captain isolation via captain-a/captain-b, response latency observed during normal use), and a section of hardening spot-checks (CI status on `main`, `npx supabase db advisors --linked` showing no new SECURITY findings, one deliberately-triggered error confirmed to appear via `logError`).

**Contract**: Markdown checklist, one `- [ ]` item per check, grouped under headings: Setup, Auth & Onboarding, Team Management, Opponent & Matrix Preparation, Live Match-Mode, Practice Simulation (Random / Mirrored / Similar, including the resume-vs-fresh-start branch), Roster Cap & Exactly-5 Gate, Config-Status Degraded Mode, NFR Spot-Checks, Hardening Spot-Checks, Cleanup. No code changes — this file is the only artifact.

### Success Criteria:

#### Automated Verification:
- File exists: `test -f context/changes/mvp-smoke-test-pass/smoke-test-checklist.md`
- Every one of the 10 page routes and all 3 practice modes identified in this plan's Current State Analysis is named at least once in the checklist (spot-checkable via `grep`)

#### Manual Verification:
- A reviewer confirms every checklist item is concrete and independently actionable (a step plus an expected result, not a vague reminder)
- The identified UI-layer coverage gaps are visibly prioritized/flagged, not buried among already-automated-covered items

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Execute the Pass and Record Results

### Overview

Run the checklist once, end-to-end, against local dev with the seeded captains; fix trivial issues inline; file follow-up changes for anything non-trivial; write the dated results log.

### Changes Required:

#### 1. Execute the checklist against local dev

**Intent**: Follow `smoke-test-checklist.md` in order, starting with the setup section (`npx supabase db reset`, delete captain-a's seeded team, start `npm run dev`). Work through every feature area as captain-a, using captain-b only for the cross-captain-isolation NFR check and the config-status/hardening spot-checks as needed.

**Contract**: No file changes from this step alone — it produces the observations recorded in the results file below.

#### 2. Smoke-test results log

**File**: `context/changes/mvp-smoke-test-pass/smoke-test-results.md`

**Intent**: A dated, signed record of this run's outcome, mirroring the `bootstrap-verification/verification.md` precedent already in this repo. Every checklist item gets a ✅ pass, or a ⚠️ with a one-line finding and either an inline-fix reference (file:line + what changed) or a filed follow-up change-id (via `/10x-new`). A closing section lists any UI-layer items worth automating in a future `/10x-test-plan --refresh`, and the 3 hardening spot-check outcomes (CI status, advisor output, logged-error confirmation).

**Contract**: Frontmatter with `run_at` (ISO timestamp), `environment: local-dev`, `captains_used: [captain-a, captain-b]`. Body sections mirror the checklist's headings, each item's result inline. A final `## Done Bar` section states whether every item is ✅ or ⚠️-with-follow-up (the done bar from this plan's scoping decisions), and lists any filed follow-up change-ids.

#### 3. Inline trivial fixes (if any)

**Intent**: Any copy-level or one-line bug found during execution is fixed directly in its source file as part of this change, referenced from `smoke-test-results.md`. Scope is bounded by definition — anything larger gets filed as a follow-up instead of fixed here.

**Contract**: Ordinary source edit(s); no interface change implied by this plan since the actual finding (if any) is unknown until execution.

### Success Criteria:

#### Automated Verification:
- `npm run lint` passes
- `npx astro check` (typecheck) passes
- `npm test` passes (full suite, including any code touched by inline fixes)
- `npm run build` succeeds
- `test -f context/changes/mvp-smoke-test-pass/smoke-test-results.md`

#### Manual Verification:
- Every item in `smoke-test-checklist.md` has a corresponding recorded result in `smoke-test-results.md` — no silent skips
- Every ⚠️ finding is either fixed inline (with a file:line reference in the results log) or has a filed follow-up change-id
- The 3 hardening spot-checks are recorded: CI is green on `main` (`gh run list` / branch-protection check), `npx supabase db advisors --linked` shows no new SECURITY-category findings beyond what S-10 already accepted, and one deliberately-triggered error is confirmed visible via `logError()`'s output
- The NFR spot-checks are recorded: phone-width layout holds up (browser resize), match-mode remains usable through a brief offline/slow-network check, and cross-captain isolation is confirmed by eye (captain-b cannot see captain-a's team/matrix/session)
- `smoke-test-results.md`'s `## Done Bar` section shows the pass is fully triaged (every item ✅ or ⚠️-with-filed-follow-up)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- No new unit tests are authored by this plan itself; any inline trivial fix that touches tested logic must keep `npm test` green.

### Integration Tests:
- None new — this plan is manual-verification-first by design (see Scope decisions). Existing integration suite must stay green through Phase 2's automated verification.

### Manual Testing Steps:
1. Reset local Supabase (`npx supabase db reset`), delete captain-a's seeded team, start `npm run dev`.
2. Walk every checklist item in order, recording results as you go.
3. For each ⚠️ finding, decide inline-fix vs. follow-up-change per the bounded-scope rule, and record the decision.
4. Run the 3 hardening spot-checks and 4 NFR spot-checks.
5. Fill in `## Done Bar` and confirm every item is accounted for before considering S-13 closeable.

## Performance Considerations

None — no production code path is added or changed by this plan itself beyond possible trivial inline fixes, which are bounded to be small by definition.

## Migration Notes

Not applicable — no schema or data migration involved.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-13, milestone M-3)
- PRD: `context/foundation/prd.md` (Success Criteria, Non-Functional Requirements, Functional Requirements FR-001–FR-019)
- Test strategy precedent: `context/foundation/test-plan.md` (§7 exclusions, cost×signal principle)
- Manual-verification-log precedent: `context/changes/bootstrap-verification/verification.md`
- Security-audit spot-check tool precedent: `context/archive/2026-09-12-production-security-audit/plan.md`
- Seeded-captain fixture: `src/lib/testSupport/twoCaptains.ts`, `supabase/seed.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Build the Smoke-Test Checklist

#### Automated

- [x] 1.1 File exists: `test -f context/changes/mvp-smoke-test-pass/smoke-test-checklist.md` — 858e40a
- [x] 1.2 Every page route and all 3 practice modes are named in the checklist — 858e40a

#### Manual

- [x] 1.3 Every checklist item is concrete and independently actionable — 858e40a
- [x] 1.4 UI-layer coverage gaps are visibly prioritized/flagged — 858e40a

### Phase 2: Execute the Pass and Record Results

#### Automated

- [x] 2.1 `npm run lint` passes — 27d8e99
- [x] 2.2 `npx astro check` (typecheck) passes — 27d8e99
- [x] 2.3 `npm test` passes — 27d8e99
- [x] 2.4 `npm run build` succeeds — 27d8e99
- [x] 2.5 File exists: `test -f context/changes/mvp-smoke-test-pass/smoke-test-results.md` — 27d8e99

#### Manual

- [x] 2.6 Every checklist item has a recorded result — no silent skips — 27d8e99
- [x] 2.7 Every ⚠️ finding is inline-fixed (with file:line) or has a filed follow-up change-id — 27d8e99
- [x] 2.8 3 hardening spot-checks recorded (CI green, advisors clean, logged-error confirmed) — 27d8e99
- [x] 2.9 4 NFR spot-checks recorded (phone-width, offline/slow-network, cross-captain isolation, latency) — 27d8e99
- [x] 2.10 `## Done Bar` shows the pass fully triaged — 27d8e99
