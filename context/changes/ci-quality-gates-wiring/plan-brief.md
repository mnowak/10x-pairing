# CI Pipeline Correctly Gates Every Merge — Plan Brief

> Full plan: `context/changes/ci-quality-gates-wiring/plan.md`

## What & Why

`ci.yml` has never actually run — it triggers on `master`, a branch that has never existed in this repo (always `main`). Even when triggered, it only ever ran lint and build, never typecheck or the test suite. This is the north star of milestone M-3 (mvp-release-preparation): the single fix that would have caught today's two production incidents (missing DB grants, an unapplied migration) automatically instead of live in prod.

## Starting Point

`gh run list` shows zero workflow runs, ever. `gh secret list` shows zero configured secrets. `gh api .../branches/main/protection` returns 404 — nothing blocks a bad merge today regardless of what CI would say. 8 of 11 test files are pure/no-DB; 3 need a live local Supabase instance via the existing `twoCaptains.ts` fixture.

## Desired End State

`ci.yml` triggers correctly on `main`, running 4 independent parallel jobs (lint, typecheck, build, test) — test spins up a real local Supabase instance via the Supabase CLI and runs the full 111+-test suite. GitHub branch protection requires all 4 to pass before a PR can merge. Zero secrets required anywhere.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| DB-in-CI approach | Full local Supabase stack via CLI (`supabase start`) | Real integration coverage, zero test-code changes — the existing `twoCaptains.ts` fixture already hardcodes matching local demo credentials |
| Branch protection | Add required status checks now, on `main` | "Gates every merge" isn't true without it — without protection, CI can be red and still not block anything |
| Required check set | lint + typecheck + build + test, all required | Matches `test-plan.md` §5's own stated gate; a single flaky test blocking merge is acceptable at this project's scale |
| E2E in CI | Out of scope for this slice | No specs exist yet (test-plan Phase 3 hasn't started) — S-12 adds its own CI step when it lands |
| Trigger scope | Both push-to-main and PRs | Preserves the direct-push workflow used all session; PRs get true pre-merge blocking, direct pushes get informational check results only |
| Fallback if DB-in-CI is flaky | Ship lint+typecheck+build+unit-only test now, file a follow-up for the 3 DB-dependent files | Guarantees the north star ships even if Supabase-in-Actions needs more iteration — time-boxed, not silent |
| Coverage tracking | None — pass/fail only | `test-plan.md` §1 is explicitly risk-based, not coverage-based; no threshold requested anywhere |
| Secrets | None required anywhere | Verified: `npm test` bypasses `astro:env` via hardcoded local demo credentials; `astro build` succeeds with `SUPABASE_URL`/`KEY` unset (both `optional: true`) |

## Scope

**In scope:**
- Fix `ci.yml`'s branch trigger and restructure into 4 parallel jobs
- Wire Supabase CLI + `supabase start` into the test job
- Remove the dead `secrets.SUPABASE_URL`/`KEY` reference from the build job
- Correct `CLAUDE.md`'s CI description
- Configure GitHub branch protection requiring all 4 checks on `main`

**Out of scope:**
- E2E/Playwright in CI (no specs exist yet — separate roadmap slice S-12)
- PR review requirements or restricting direct pushes (solo-dev project)
- Test coverage tracking/thresholds
- Any application code or database schema changes

## Architecture / Approach

Split the single monolithic `ci` job into 4 independent parallel jobs (lint, typecheck, build, test) so each becomes its own separately-named, individually-requirable GitHub check. Only `test` needs infrastructure beyond `npm ci`: the official `supabase/setup-cli` action installs the CLI, `supabase start` provisions Postgres/Auth locally (Docker, preinstalled on `ubuntu-latest`), auto-applying migrations and seed data — after which `npm test` runs exactly as it does locally, no configuration needed. Branch protection is applied as a separate phase since it's a live GitHub repo-settings change, not a file in this repo.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fix and restructure the CI workflow | 4 parallel jobs actually running on `main`, including full test suite via Supabase-in-CI | Supabase-in-Actions could prove flakier than expected — documented fallback if so |
| 2. Configure branch protection on `main` | The 4 checks become required before a PR can merge | None significant — a straightforward `gh api` call, verified against the live repo |

**Prerequisites:** None — builds directly on the shipped MVP and its existing test suite.
**Estimated effort:** ~1 session across 2 phases — no application code, pure CI/config.

## Open Risks & Assumptions

- `supabase/setup-cli` + `supabase start` working cleanly in GitHub Actions is a well-established, officially-supported pattern, but hasn't been tested in *this* repo's runner yet — the documented fallback (ship unit-only test job, file a follow-up) covers the case where it doesn't.
- Branch protection's "required status checks" only blocks PR merges, not direct pushes — an accepted tradeoff from planning, not a gap.

## Success Criteria (Summary)

- A push to `main` triggers CI for the first time ever, and all 4 jobs (lint, typecheck, build, test) pass, including the full suite against a live local Supabase instance.
- A throwaway PR shows all 4 checks as required, with the merge button blocked until they pass — while a direct push to `main` still succeeds.
