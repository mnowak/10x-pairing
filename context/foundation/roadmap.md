---
project: "Pairing Assistant"
version: 3
status: draft
created: 2026-09-04
updated: 2026-09-13
prd_version: "—"
main_goal: quality
top_blocker: decisions
milestone_id: mvp-release-preparation
milestone_seq: 3
milestone_status: open
---

# Roadmap: Pairing Assistant

> Derived from a user-described milestone charter (MS-01…MS-05).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-3: mvp-release-preparation** — Status: open

- **Intent:** Harden and prepare the shipped MVP for real release. Two real production incidents surfaced during M-2's tail (a database missing base privilege grants, and a schema migration that was never applied) — both were configuration gaps a systematic audit would have caught before they reached production, not product bugs. M-3 closes that gap: the app's operational safety net (CI gates, security posture, observability, test coverage) is hardened to match what's already been built, the project's own test plan is finished, and the app's public-facing presentation (frontpage, README) catches up to the product's actual maturity.
- **Source materials:** user description (anchors below)
- **Done when:** S-09 through S-16 below are all `done`.
- **Scope anchors:**
  - MS-01: Full release-readiness pass — audit and fix CI/deploy configuration gaps (confirmed: `ci.yml` triggers on `master`, not the repository's actual `main` branch, and never runs the test suite), review security/RLS+GRANT posture across every table, review error-handling/observability, and run a final smoke-test pass across every shipped feature before calling the MVP release-ready.
  - MS-02: Complete the remaining phases of the project's test plan (`context/foundation/test-plan.md`) — Phase 3 (live match-mode coverage: suggestion-engine correctness and exactly-5-roster gating) and Phase 4 (quality-gates wiring: the suite becomes a required CI gate).
  - MS-03: Update the "Similar" practice-mode description shown to captains to "Like Mirrored but opponents estimations may be different than ours".
  - MS-04: Write/refresh the project README — a brief description of the pairing process, the product roadmap, and anything else important for a reader landing on the repo.
  - MS-05: Redesign the app's frontpage away from the Astro-starter default to something purpose-built for this product — Claude to propose a direction.

## Vision recap

M-1 and M-2 shipped and validated the full captain-facing MVP: team/roster setup, opponent pairing-matrix preparation, live match-mode negotiation, and solo practice simulation against three opponent-behavior styles. But two real production incidents during M-2's tail exposed that the project had no systematic release-readiness checks in place — the product works, but nothing was verifying that the *infrastructure underneath it* (CI, database privileges, error visibility) stays correct as it changes. M-3 is a hardening milestone, not a feature milestone: its job is to make sure what's already been built keeps working, is safe, and reads well to a new visitor or contributor.

## North star

**S-09: CI pipeline correctly gates every merge** — the single change most representative of why this milestone exists: `ci.yml` currently triggers on `master` (the repo's real branch is `main`) and never runs the test suite at all, so today's two incidents could have shipped again tomorrow with zero automated warning. Fixing this first means every other slice in this milestone lands under real CI coverage from that point on.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — for a hardening milestone like this one, the closest equivalent is the single change that most directly prevents the class of incident the milestone exists to close. This gloss applies for the rest of the document; it isn't repeated below.

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                                                                                                      | Prerequisites            | PRD refs | Status   |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------- | -------- |
| S-09 | ci-quality-gates-wiring         | (project can) trust that every merge to `main` is gated by lint, typecheck, and the full test suite — not just lint and build                | —                          | MS-01, MS-02 | done |
| S-10 | production-security-audit       | (captain can) trust that every table's data is protected by both RLS *and* the base privilege grants RLS depends on — audited, not assumed   | —                          | MS-01    | done |
| S-11 | error-visibility-pass           | (project can) see a real error's actual cause in the next incident instead of a swallowed generic message                                    | —                          | MS-01    | done |
| S-12 | live-match-mode-test-coverage   | (project can) trust that the suggestion engine never reuses a committed army and that a session can't start without exactly 5 armies per side | —                          | MS-02    | done    |
| S-13 | mvp-smoke-test-pass             | captain can rely on every shipped MVP capability working end-to-end, verified fresh after this milestone's hardening work                     | S-09, S-10, S-11, S-12     | MS-01    | done |
| S-14 | similar-mode-copy-update        | captain sees an accurate one-line description of Similar mode when picking a practice opponent                                               | —                          | MS-03    | done |
| S-15 | project-readme                  | a new reader (contributor or future-you) understands the pairing process and the product roadmap from the README alone                       | —                          | MS-04    | done |
| S-16 | frontpage-redesign              | a first-time visitor sees a purpose-built landing page instead of the Astro-starter default                                                  | —                          | MS-05    | ready    |

## Baseline

What's already in place in the codebase as of `2026-09-12`, based on this session's own direct work (no re-probe needed — the gaps below were found live, not inferred).

- **Frontend:** present — full MVP shipped (team/roster, opponent/matrix prep, live match-mode, solo practice simulation with 3 opponent modes). The frontpage (`src/pages/index.astro`) is still the Astro-starter default, unchanged since bootstrap — targeted by S-16.
- **Backend / API:** present — Astro server routes under `src/pages/api/**`, all MVP flows wired and working.
- **Data:** present, with a confirmed gap — Supabase Postgres, RLS enabled on all 5 tables. This session found the production project was missing base `GRANT` privileges for the `authenticated` role (RLS alone isn't sufficient — Postgres checks GRANTs first) and had one migration that was never applied to production; both are now fixed, but no systematic audit beyond the two tables that surfaced errors has been done — targeted by S-10.
- **Auth:** present — Supabase SSR client + auth middleware (`src/middleware.ts`), protected-route prefix array.
- **Deploy / infra:** present, with a confirmed gap — Cloudflare Workers deployment is live and working, but `.github/workflows/ci.yml` triggers on `push`/`pull_request` to `master` while the repository's actual working branch is `main`, and even when it does run, it only lints and builds — it never runs `npm test` — targeted by S-09.
- **Observability:** partial — Cloudflare's built-in `observability: enabled` is on (`wrangler.jsonc`), but several code paths swallow the real error into a generic message via a bare `catch {}` (e.g. `src/pages/dashboard/team.astro:24`, the opponent/match/simulate `.astro` pages) — exactly why today's incident took extra digging to diagnose — targeted by S-11.

## Foundations

None for this milestone. Every item is either independent hardening work or a terminal deliverable (copy update, README, frontpage) — nothing here is a cross-cutting enabler that unlocks a later slice in a way that justifies its own Foundation entry; S-13's dependency on S-09–S-12 is a natural "verify after hardening" sequencing, not a Foundation relationship.

## Slices

### S-09: CI pipeline correctly gates every merge

- **Outcome:** (project can) trust that every merge to `main` is gated by lint, typecheck, and the full test suite — not just lint and build.
- **Change ID:** ci-quality-gates-wiring
- **PRD refs:** MS-01, MS-02
- **Prerequisites:** —
- **Parallel with:** S-10, S-11, S-12, S-14, S-15, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — the single fix that would have caught today's two incidents earlier, and the one every other hardening slice in this milestone benefits from landing under. Low risk: the fix is a config change (branch trigger + add a test step to the existing workflow), not new infrastructure.
- **Status:** done

### S-10: Security/RLS + GRANT audit across all tables

- **Outcome:** (captain can) trust that every table's data is protected by both RLS *and* the base privilege grants RLS depends on — audited, not assumed.
- **Change ID:** production-security-audit
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** S-09, S-11, S-12, S-14, S-15, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Today's actual production incident was exactly this class of gap on 2 of 5 tables (RLS present, GRANT missing). The remaining 3 tables were fixed by the same corrective migration, but this slice should independently verify all 5 plus check for any other class of RLS/grant mismatch (e.g. `anon` role exposure, missing `WITH CHECK` clauses) rather than assuming the fix generalized correctly.
- **Status:** done

### S-11: Error-handling/observability pass

- **Outcome:** (project can) see a real error's actual cause in the next incident instead of a swallowed generic message.
- **Change ID:** error-visibility-pass
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** S-09, S-10, S-12, S-14, S-15, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Several `.astro` pages catch a real error and discard it in favor of a generic "Something went wrong" message with no logging — this is precisely why today's incident needed live database queries to diagnose instead of a log line. Low risk to fix (add logging at the catch site); the open design question is how much observability infrastructure is worth adding beyond that for a solo-captain-scale MVP.
- **Status:** done

### S-12: Live match-mode test coverage (test-plan Phase 3)

- **Outcome:** (project can) trust that the suggestion engine never reuses a committed army and that a session can't start without exactly 5 armies per side.
- **Change ID:** live-match-mode-test-coverage
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-09, S-10, S-11, S-14, S-15, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is `test-plan.md` §3 Phase 3 (risks #1 and #6), the last "not started" test-coverage phase before Phase 4 (quality gates) can mean anything. Sequenced independent of S-09 (CI wiring) — the tests are valuable whether or not CI enforces them yet — but finishing it is what gives S-09's gate real teeth for this area.
- **Status:** done

### S-13: Final smoke-test pass across all shipped MVP features

- **Outcome:** captain can rely on every shipped MVP capability working end-to-end, verified fresh after this milestone's hardening work.
- **Change ID:** mvp-smoke-test-pass
- **PRD refs:** MS-01
- **Prerequisites:** S-09, S-10, S-11, S-12 (this is the wrap-up validation — it should exercise the app *after* the hardening work lands, not before)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Manual, checklist-driven pass across team setup, opponent/matrix prep, live match-mode, and all three practice-simulation opponent modes. Low risk, but only meaningful as the last slice — running it before S-09–S-12 land would just re-verify what's already known to work today.
- **Status:** done

### S-14: Update "Similar" mode description copy

- **Outcome:** captain sees an accurate one-line description of Similar mode when picking a practice opponent.
- **Change ID:** similar-mode-copy-update
- **PRD refs:** MS-03
- **Prerequisites:** —
- **Parallel with:** S-09, S-10, S-11, S-12, S-15, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Trivial, single-string copy change to: "Like Mirrored but opponents estimations may be different than ours." No design decision involved.
- **Status:** done

### S-15: Write/refresh the project README

- **Outcome:** a new reader (contributor or future-you) understands the pairing process and the product roadmap from the README alone.
- **Change ID:** project-readme
- **PRD refs:** MS-04
- **Prerequisites:** —
- **Parallel with:** S-09, S-10, S-11, S-12, S-14, S-16
- **Blockers:** —
- **Unknowns:**
  - How much depth should the pairing-process description go into (a one-paragraph summary vs. a full walkthrough of the reveal sequence)? Owner: user. Block: no — will draft a reasonable version and the user can adjust.
- **Risk:** Low — this is a documentation task with no code dependency. The main judgment call is what else (beyond process + roadmap) is "important" enough to include, per the user's own open-ended ask.
- **Status:** done

### S-16: Redesign the frontpage

- **Outcome:** a first-time visitor sees a purpose-built landing page instead of the Astro-starter default.
- **Change ID:** frontpage-redesign
- **PRD refs:** MS-05
- **Prerequisites:** —
- **Parallel with:** S-09, S-10, S-11, S-12, S-14, S-15
- **Blockers:** —
- **Unknowns:**
  - What visual direction/tone should the new frontpage take? Owner: user. Block: no — will propose a concrete direction per the user's own request, for the user to accept or redirect.
- **Risk:** Low technical risk (a static/SSR page, no data dependency); the real risk is proposing a direction the user doesn't like — mitigated by presenting the proposal before building it out fully.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                              | Ready for `/10x-plan` | Notes |
| ---------- | -------------------------- | ---------------------------------------------------------------------- | ---------------------- | ----- |
| S-09       | ci-quality-gates-wiring     | Fix CI branch trigger and wire the test suite as a required gate       | yes                     | North star |
| S-10       | production-security-audit  | Audit RLS + GRANT coverage across all tables                           | yes                     | — |
| S-11       | error-visibility-pass      | Replace silent generic error catches with real visibility              | yes                     | — |
| S-12       | live-match-mode-test-coverage | Live match-mode test coverage (test-plan Phase 3)                   | yes                     | — |
| S-13       | mvp-smoke-test-pass        | Final smoke-test pass across all shipped MVP features                  | no                      | Waiting on S-09, S-10, S-11, S-12 |
| S-14       | similar-mode-copy-update   | Update Similar mode's description copy                                 | yes                     | — |
| S-15       | project-readme             | Write/refresh the project README                                       | yes                     | — |
| S-16       | frontpage-redesign         | Redesign the frontpage away from the Astro-starter default             | yes                     | — |

## Open Roadmap Questions

None cross-cutting. This milestone's two per-slice Unknowns (S-15's README depth, S-16's frontpage direction) are both non-blocking — Claude will draft/propose a version for the user to accept or redirect, per the user's own request.

## Parked

- **Managing multiple of our own teams (FR-002)** — Why parked: PRD Non-Goals — demoted to nice-to-have to protect the original 2-week MVP budget; still not in scope.
- **Team-vs-team round pairing (Swiss system between teams)** — Why parked: PRD Non-Goals — the organizer's job, determined externally.
- **Post-match score tracking / historical stats** — Why parked: PRD Non-Goals — out of scope for live pairing decisions.
- **A teammate/viewer role for non-captain team members** — Why parked: PRD Non-Goals — deferred per Access Control.
- **Roster size configurable beyond 5 players (FR-016)** — Why parked: nice-to-have; not sequenced in this milestone either.

## Milestone History

- **M-1: live-pairing-mvp** (`live-pairing-mvp`) — closed 2026-09-12. Full must-have MVP shipped: team/roster setup, opponent pairing-matrix preparation, and live match-mode with real (non-random) suggestions at all three decision points across both sub-rounds.
- **M-2: pairing-simulation** (`pairing-simulation`) — closed 2026-09-12. Solo pairing-simulation training shipped end-to-end: a captain can run a session without a second human present (S-07), and pick among three opponent-behavior modes — Random, Mirrored (minimax-derived, default), or Similar (Mirrored plus session-fixed noise) — via a pre-session picker (S-08). A blind-declaration leak in the Mirrored/Similar opponent's decision logic (found during S-08's own impl-review) was fixed as a follow-up change (`blind-declaration-opponent-sim`, archived separately) and a production database misconfiguration (missing GRANTs + a never-applied migration) was also fixed during this milestone's tail.

## Done

- **F-01: (foundation) Team/opponent/pairing-matrix schema with RLS landed** — Archived 2026-09-06 → `context/archive/2026-09-04-schema-teams-opponents-matrix/`. Lesson: —.
- **S-01: create a team with a name and a roster of armies** — Archived 2026-09-07 → `context/archive/2026-09-06-create-team-roster/`. Lesson: —.
- **S-02: captain can add an opponent team's roster and enter/edit a point estimate (integer, 0-20) against them — displayed as a derived color band, not stored as one — repeated for multiple different opponents ahead of a tournament.** — Archived 2026-09-07 → `context/archive/2026-09-07-prepare-opponent-matrix/`. Lesson: —.
- **S-04: remove an army from their team roster or an opponent's roster, with a confirmation naming how many previously-entered pairing-matrix estimates involving that army would be lost.** — Archived 2026-09-08 → `context/archive/2026-09-07-remove-team-army/`. Lesson: —.
- **S-05: captain is blocked (with a clear message) from adding a 6th army to our team roster or to any opponent's roster.** — Archived 2026-09-08 → `context/archive/2026-09-08-cap-roster-size/`. Lesson: —.
- **S-03: captain can run a full live match-mode session against a prepared opponent matrix — pick defender, enter opponent's defender, get an attacker-pair suggestion, enter opponent's pick, repeat for sub-round 2, and get the final refused-attacker auto-paired — using only currently-available (uncommitted) armies at every step. Increment 1 of 2: this slice delivers the full session mechanics with a random pick at each suggestion point, behind an interface S-06 later swaps for the real algorithm.** — Archived 2026-09-11 → `context/archive/2026-09-11-live-match-mode-session/`. Lesson: —.
- **S-06: captain's live match-mode suggestions (defender, attacker pair, accepted attacker) weigh the immediate matchup estimate together with the downstream refused-attacker impact, replacing the random pick S-03 uses for increment 1.** — Archived 2026-09-11 → `context/archive/2026-09-11-live-match-recommender/`. Lesson: —.
- **S-07: captain can start and complete a solo pairing-simulation session against a prepared opponent matrix without a second human present — making their own defender / attacker-pair / accept choices manually, with the same suggestion-engine recommendations as live match-mode — while the app automatically picks the opponent's move at each of the opponent's three decision points (uniformly at random among the opponent's still-available armies) and shows the captain what was picked, ending in the same auto-paired refused-attacker outcome as a live session.** — Archived 2026-09-12 → `context/archive/2026-09-12-pairing-simulation-session/`. Lesson: —.
- **S-08: pick one of three opponent-behavior modes (Random / Mirrored / Similar) for a solo pairing-simulation session via a pre-session picker** — Archived 2026-09-12 → `context/archive/2026-09-12-pairing-simulation-recommender/`. Lesson: —.
- **S-09: (project can) trust that every merge to `main` is gated by lint, typecheck, and the full test suite — not just lint and build** — Archived 2026-09-12 → `context/archive/2026-09-12-ci-quality-gates-wiring/`. Lesson: —.
- **S-11: (project can) see a real error's actual cause in the next incident instead of a swallowed generic message** — Archived 2026-09-12 → `context/archive/2026-09-12-error-visibility-pass/`. Lesson: —.
- **S-10: (captain can) trust that every table's data is protected by both RLS *and* the base privilege grants RLS depends on — audited, not assumed** — Archived 2026-09-12 → `context/archive/2026-09-12-production-security-audit/`. Lesson: —.
- **S-12: (project can) trust that the suggestion engine never reuses a committed army and that a session can't start without exactly 5 armies per side** — Archived 2026-09-12 → `context/archive/2026-09-12-live-match-mode-test-coverage/`. Lesson: —.
- **S-13: captain can rely on every shipped MVP capability working end-to-end, verified fresh after this milestone's hardening work** — Archived 2026-09-12 → `context/archive/2026-09-12-mvp-smoke-test-pass/`. Lesson: —.
- **S-14: captain sees an accurate one-line description of Similar mode when picking a practice opponent** — Archived 2026-09-13 → `context/archive/2026-09-13-similar-mode-copy-update/`. Lesson: —.
- **S-15: a new reader (contributor or future-you) understands the pairing process and the product roadmap from the README alone** — Archived 2026-09-13 → `context/archive/2026-09-13-project-readme/`. Lesson: —.
