# CI Pipeline Correctly Gates Every Merge — Implementation Plan

## Overview

`ci.yml` has never actually run: it triggers on `master`, a branch that has never existed in this repository (the repo has always been `main`). Even if it had triggered, it only ever ran lint and build — never typecheck or the test suite. This plan fixes the trigger, restructures the workflow into 4 independent, parallel jobs (lint, typecheck, build, test — the last running the full suite against a real local Supabase instance spun up inside the CI runner), and then configures GitHub branch protection on `main` so those checks actually block a bad merge instead of just existing.

## Current State Analysis

- `.github/workflows/ci.yml` triggers `on: push/pull_request: branches: [master]`. `git branch -a` and `gh repo view --json defaultBranchRef` both confirm the repo has only ever had `main`. `gh run list` returns zero rows — this workflow has **never executed**, not once, in this repo's history.
- The single `ci` job runs `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`. There is no `astro check` (typecheck) step and no `npm test` step, despite `context/foundation/test-plan.md` §5 stating "unit + integration — required after Phase 1" (Phase 1 shipped weeks ago).
- `gh secret list` returns **zero** configured secrets. The `build` step's `env: SUPABASE_URL: ${{ secrets.SUPABASE_URL }}` / `SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}` therefore always resolves to empty strings.
- Verified directly: `env -u SUPABASE_URL -u SUPABASE_KEY npx astro build` succeeds. Both env vars are `optional: true` in `astro.config.mjs`'s `env.schema`, and `src/lib/supabase.ts`'s `createClient` just returns `null` when unset — the build never fails on this. The `secrets.SUPABASE_URL`/`KEY` references in `ci.yml` are dead config.
- `gh api repos/mnowak/10x-pairing/branches/main/protection` returns `404 Branch not protected`. Nothing today blocks a merge regardless of CI outcome.
- 8 of 11 test files (`colorBands`, `matchSessionEngine`, `matchSessionStorage`, `matchSuggestions`, `opponentMoves`, `teamScore`, `utils`, `deleteGuard`) are pure/no-DB. 3 (`matrix.test.ts`, `opponents.test.ts`, `teams.test.ts`) go through `src/lib/testSupport/twoCaptains.ts`, which signs in as one of 2 seeded local captains (`supabase/seed.sql`).
- `twoCaptains.ts` hardcodes `LOCAL_SUPABASE_URL` and `LOCAL_SUPABASE_ANON_KEY` directly in the file, with its own comment confirming these are "well-known Supabase CLI local-dev demo credentials — identical across every `supabase start` instance." It calls `@supabase/supabase-js`'s `createClient` directly — **not** `src/lib/supabase.ts`, so it never touches `astro:env`. Confirmed via grep: no test file imports `src/lib/supabase.ts`.
- `.dev.vars` and `.env` are both gitignored (`git check-ignore -v` confirms) and untracked — a fresh CI checkout starts with neither, genuinely matching the "zero secrets" state already verified above.
- `lefthook.yml`'s pre-commit hook runs `npx astro check` for typecheck (not `astro sync` alone) — this plan's CI typecheck step should match that same command for consistency with the already-established local convention.

### Key Discoveries:

- **`npm test` needs zero secrets and zero `astro sync`.** It's fully self-contained once a local Supabase instance is running — no environment variables, no astro:env resolution. This eliminates an entire category of CI complexity (no secret injection needed anywhere in this workflow).
- **The build/lint/typecheck jobs need `astro sync` first** (per `CLAUDE.md`: "regenerates `astro:env`/content types; run this if `astro:env/server` imports fail to resolve"). `src/lib/supabase.ts` imports `astro:env/server`, and ESLint's typed rules + `astro check` both need the generated types to resolve it.
- **GitHub's "require status checks to pass" only blocks merges via a pull request** — it does not stop a direct `git push` to a protected branch (that requires a separate "restrict pushes"/"require a pull request" setting, which the user explicitly chose not to enable, to keep direct-push access). Direct pushes will show check results on the commit but won't be blocked by them; only future PRs get true pre-merge blocking. This is an accepted tradeoff, not a plan gap.

## Desired End State

`ci.yml` triggers correctly on `main` (push and pull_request), runs 4 independent parallel jobs — `lint`, `typecheck`, `build`, `test` — each a separately-named GitHub check, with `test` running the full suite (all 11 files, including the 3 DB-dependent ones) against a local Supabase instance stood up inside the runner via the Supabase CLI. GitHub branch protection on `main` requires all 4 checks to pass before a pull request can merge. No GitHub secrets are required anywhere in the pipeline.

Verification: push a commit to `main` and confirm all 4 checks run and pass in the Actions tab; open a throwaway PR and confirm the same 4 checks appear as required, with the merge button blocked until they pass.

## What We're NOT Doing

- Not adding e2e (Playwright) to CI — `test-plan.md` Phase 3 (live match-mode e2e coverage) hasn't started; there are no specs to run yet. That roadmap slice (S-12) will add its own CI step when it lands.
- Not requiring pull-request reviews or restricting direct pushes to `main` — this is a solo-developer project; requiring a review would make merging impossible.
- Not adding test coverage tracking or a coverage threshold — `test-plan.md` §1 is explicit that this project is risk-based ("the cheapest test that gives a real signal... wins"), not coverage-percentage-based. Pass/fail on the existing suite is the gate.
- Not touching `test-plan.md` itself, `S-12`'s test content, or any application code — this slice is purely CI/repo-governance configuration.
- Not requiring the PR branch to be up to date with `main` before merging (`strict: false` equivalent) — unnecessary friction for a low-PR-volume solo project.

## Implementation Approach

Split the current single monolithic `ci` job into 4 independent parallel jobs so each becomes its own separately-named GitHub status check — this is what lets branch protection require "lint + typecheck + test" (and build) individually, matches the granularity the roadmap outcome calls for, and gives faster feedback than one long sequential job. The `test` job is the only one that needs infrastructure beyond `npm ci`: the official `supabase/setup-cli` GitHub Action installs the CLI, then `supabase start` (Docker-based, and GitHub-hosted `ubuntu-latest` runners have Docker preinstalled) stands up local Postgres/Auth/etc., auto-applying both migrations and `supabase/seed.sql` — after which `npm test` runs exactly as it does locally, no configuration needed since `twoCaptains.ts` already hardcodes the matching local demo credentials.

Branch protection is a separate phase from the workflow-file change: it's a live GitHub repo-settings change (via `gh api`), not a file in this repo, and its own verification (does the merge button actually block?) is meaningfully different in kind from "does the workflow file run correctly."

## Critical Implementation Details

### Fallback if Supabase-in-CI proves flaky

If `supabase start` doesn't work cleanly in the GitHub Actions runner after a reasonable troubleshooting attempt (e.g. a Docker networking quirk specific to the runner image), the agreed fallback is: ship the `lint` + `typecheck` + `build` jobs plus a `test` job scoped to only the 8 DB-free files (`vitest run --exclude` or a separate `vitest.config.ts` project split), and open a follow-up roadmap item for the 3 DB-dependent files rather than blocking this entire slice. Do not silently drop the 3 files without opening that follow-up — the whole point of this milestone is not letting a known gap go undocumented again.

## Phase 1: Fix and restructure the CI workflow

### Overview

Fix the branch trigger, split into 4 parallel jobs, add the missing typecheck and test steps, wire Supabase CLI into the test job, remove the dead secrets reference, and correct `CLAUDE.md`'s CI description to match.

### Changes Required:

#### 1. Rewrite the CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Trigger on the repo's real branch, and turn lint/typecheck/build/test into 4 independent jobs so each is its own named, individually-requirable GitHub check.

**Contract**: `on.push.branches` and `on.pull_request.branches` both become `[main]`. Replace the single `ci` job with 4 jobs — `lint`, `typecheck`, `build`, `test` — each with no `needs:` on the others (they run in parallel). `lint`, `typecheck`, and `build` each run `actions/checkout@v4` → `actions/setup-node@v4` (node 22, `cache: npm`) → `npm ci` → `npx astro sync`, then their respective command (`npm run lint`; `npx astro check`; `npm run build`). Drop the `env:` block under `build` entirely — it referenced secrets that don't exist and were never needed (verified in Current State Analysis). `test` runs `actions/checkout@v4` → `actions/setup-node@v4` → `npm ci` → the `supabase/setup-cli` action → `supabase start` → `npm test` (no `astro sync`, no env vars — `npm test` is self-contained per Key Discoveries).

#### 2. Correct CLAUDE.md's CI description

**File**: `CLAUDE.md`

**Intent**: The current line ("CI ... with `SUPABASE_URL`/`SUPABASE_KEY` from repo secrets") is now inaccurate and would mislead a future reader (human or agent) into thinking secrets are required.

**Contract**: Update the `## Commands` section's CI line to describe the new 4-job structure (lint, typecheck, build, test) and state plainly that no GitHub secrets are required — the test job provisions its own local Supabase instance via the Supabase CLI.

### Success Criteria:

#### Automated Verification:

- `.github/workflows/ci.yml` is valid YAML and passes GitHub's own workflow syntax validation (a push triggers a run rather than being rejected at parse time)
- Local equivalents of each new job's commands still pass: `npm run lint`, `npx astro check`, `npm run build`, `npm test`

#### Manual Verification:

- Push this phase's commit to `main` and confirm in the GitHub Actions tab that a workflow run starts (first time ever) and all 4 jobs (`lint`, `typecheck`, `build`, `test`) appear and complete
- Confirm the `test` job's log shows `supabase start` succeeding and all 111+ tests passing against the freshly-provisioned local instance
- Confirm the `build` job succeeds with no secrets configured (already true, but re-confirm in the actual CI environment, not just local `env -u`)

---

## Phase 2: Configure branch protection on `main`

### Overview

Make the 4 checks from Phase 1 actually required before a pull request can merge.

### Changes Required:

#### 1. Enable required status checks

**File**: N/A — live GitHub repository setting, not a file in this repo

**Intent**: Once Phase 1's checks have run successfully at least once (GitHub requires a check to have appeared before it can be marked required), require all 4 to pass before merge — without requiring PR reviews or blocking direct pushes, per the solo-dev scope decided during planning.

**Contract**: Via `gh api repos/mnowak/10x-pairing/branches/main/protection` (PUT), set `required_status_checks` to reference the 4 job names from Phase 1 (`lint`, `typecheck`, `build`, `test`) with `strict: false` (don't require the branch to be up to date first — avoids unnecessary friction at this PR volume). Leave `required_pull_request_reviews` unset/null and `enforce_admins` and `restrictions` unset/null — this only governs the PR merge button, not direct pushes, matching the "Both push-to-main and PRs targeting main" trigger decision.

### Success Criteria:

#### Automated Verification:

- `gh api repos/mnowak/10x-pairing/branches/main/protection` returns a 200 (no longer 404) with `required_status_checks.contexts` (or `.checks`) listing all 4 job names

#### Manual Verification:

- Open a throwaway PR (a trivial, revertable change) and confirm in the GitHub UI that all 4 checks show as required, and the merge button is disabled/blocked until they report success
- Confirm a direct push to `main` still succeeds (checks run and report, but don't block the push) — matching the accepted tradeoff from planning
- Delete/close the throwaway PR and its branch after verification

---

## Testing Strategy

### Unit Tests:

- No new test code — this plan only changes CI/repo configuration. The existing 111+ tests are the payload this plan finally gets running in CI.

### Integration Tests:

- The 3 DB-dependent test files (`matrix.test.ts`, `opponents.test.ts`, `teams.test.ts`) running successfully inside the CI `test` job's freshly-provisioned Supabase instance IS the integration test for this plan itself.

### Manual Testing Steps:

1. Push Phase 1 to `main`, watch the Actions tab, confirm all 4 jobs pass on the first real run this repo has ever had.
2. Apply Phase 2's branch protection, open a throwaway PR, confirm the 4 checks are listed as required and the merge button is gated on them.
3. Confirm a direct push to `main` after Phase 2 still succeeds (not blocked), only PR merges are gated.

## Performance Considerations

`supabase start` typically adds well under a minute to the `test` job (Docker images are commonly cached by the `supabase/setup-cli` action and GitHub's runner). Since `lint`/`typecheck`/`build`/`test` run as independent parallel jobs rather than one sequential job, total wall-clock CI time should be close to the slowest single job, not the sum of all four.

## Migration Notes

No data migration. This is a CI/repo-configuration change only; no application code or database schema is touched.

## References

- Roadmap: `context/foundation/roadmap.md` (S-09, milestone M-3)
- Test plan: `context/foundation/test-plan.md` §3 (Phased Rollout), §5 (Quality Gates)
- Local-credential precedent: `src/lib/testSupport/twoCaptains.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fix and restructure the CI workflow

#### Automated

- [x] 1.1 `.github/workflows/ci.yml` is valid YAML and passes GitHub's workflow syntax validation — 65da410
- [x] 1.2 Local equivalents of each job's commands pass: `npm run lint`, `npx astro check`, `npm run build`, `npm test` — 65da410

#### Manual

- [x] 1.3 First-ever CI run triggers on push to `main`; all 4 jobs appear and complete — 65da410
- [x] 1.4 `test` job's log shows `supabase start` succeeding and all tests passing — 65da410
- [x] 1.5 `build` job succeeds with no secrets configured, confirmed in real CI — 65da410

### Phase 2: Configure branch protection on `main`

#### Automated

- [x] 2.1 `gh api .../branches/main/protection` returns 200 listing all 4 job names as required checks — ddce4a3

#### Manual

- [x] 2.2 Throwaway PR shows all 4 checks as required; merge button blocked until they pass — ddce4a3
- [x] 2.3 Direct push to `main` still succeeds (not blocked) after branch protection is applied — ddce4a3
- [x] 2.4 Throwaway PR and its branch deleted after verification — ddce4a3
