<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create Team Roster Implementation Plan

- **Plan**: context/changes/create-team-roster/plan.md
- **Scope**: Phase 3 of 3 (full plan review, all phases)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Create-team route doesn't check for an existing team before inserting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/teams/index.ts (whole file)
- **Detail**: The plan's "What We're NOT Doing" says "DB still permits more [teams], per F-01; this slice's UI is the enforcement point." In practice the only enforcement is that `team.astro`'s frontmatter branch doesn't *render* the create form once a team exists (`src/pages/dashboard/team.astro:24-28`) — the `POST /api/teams` endpoint itself has no such check. A stale form resubmission (browser back-button + re-POST), a second open tab on the create form, or a direct authenticated request can create a second `teams` row for the same captain (no DB constraint blocks it, per F-01's deliberate decision). Once that happens, `getTeamWithArmies`'s `.limit(1)` always resolves to the *oldest* team, silently and permanently hiding the newer one.
- **Fix**: At the top of `index.ts`'s handler, add `if (await getTeamWithArmies(supabase, context.locals.user.id)) return context.redirect("/dashboard/team");` — turning the documented "UI is the enforcement point" into an actual route-level gate, matching what the page itself already does.
- **Decision**: FIXED

### F2 — `getTeamWithArmies` throws instead of returning the typed error shape its siblings use

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/teams.ts:31-33 (throw site); src/pages/api/teams/armies.ts:23 and src/pages/dashboard/team.astro:12 (unguarded call sites)
- **Detail**: `createTeamWithArmies` and `addArmyToTeam` both return a typed `{ error: TeamsError }` on failure, which callers turn into a friendly `?error=` redirect. `getTeamWithArmies` instead throws the raw Postgrest error on any query failure, and neither call site wraps it in try/catch. A transient Supabase error on this read path (network blip, policy hiccup) would surface as an unhandled exception → Astro's generic 500 page, breaking this app's own established convention that every failure path redirects with a friendly message. Fixing F1 adds a third call site to `index.ts`, which would inherit the same gap unless this is fixed too.
- **Fix A ⭐ Recommended**: Wrap each call site in try/catch, redirecting with a friendly `?error=` message on failure (matches the existing convention with the smallest change).
  - Strength: No API change to `src/lib/teams.ts`; each of the 3 call sites (including F1's new one) gets a one-block try/catch matching how `createTeamWithArmies`/`addArmyToTeam` errors are already handled at their call sites.
  - Tradeoff: The try/catch boilerplate is duplicated 3 times instead of centralized.
  - Confidence: HIGH — minimal, localized change, no risk of touching working code paths.
  - Blind spot: None significant.
- **Fix B**: Change `getTeamWithArmies` itself to return `{ team: TeamWithArmies | null } | { error: TeamsError }`, matching its siblings' shape exactly.
  - Strength: One consistent error-handling shape across all of `src/lib/teams.ts` — no thrown exceptions from this module at all.
  - Tradeoff: Touches the function's public contract and all 3 call sites' destructuring, more invasive for a change this late in the slice.
  - Confidence: MEDIUM — more consistent long-term, but larger surface to get right now.
  - Blind spot: Haven't checked whether a future S-02/S-03 data-access function would want the same "throw" shape for a different reason.
- **Decision**: FIXED (via Fix A — verified: `npm run lint` exit 0, app still boots correctly)

### F3 — `FormField`'s `maxLength` prop is an undocumented addition to the plan's Contract

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — informational only
- **Dimension**: Scope Discipline
- **Location**: src/components/forms/FormField.tsx:16,31,53; plan.md Phase 3 item #1
- **Detail**: The plan's Contract for moving `FormField`/`SubmitButton`/`ServerError` says "no behavioral change to the components themselves." `FormField` gained an optional `maxLength` prop, which `CreateTeamForm.tsx`'s team-name field relies on to implement the plan's own "soft `maxLength` in the UI only" decision. Small, additive, non-breaking, and load-bearing for a decision the plan itself made — just never called out in the plan text. (This is also the prop that a `lint-staged` pre-commit artifact silently dropped from commit 142af1c, restored in 82a1915 — already self-documented in git history.)
- **Fix**: None needed. Optionally add a one-line addendum to plan.md's Phase 3 item #1 Contract noting the `maxLength` addition, for future readers.
- **Decision**: SKIPPED

### F4 — A duplicate army name within the initial batch discards the whole batch

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — informational only
- **Dimension**: Safety & Quality
- **Location**: src/lib/teams.ts createTeamWithArmies (team_armies batch insert)
- **Detail**: If the team_armies batch insert fails on a `23505` (only possible within the same submitted batch, since the team is brand-new), the single SQL statement fails atomically — the team persists with zero armies, and the captain must re-add every intended army one at a time via `TeamView`'s add-army form. Acceptable given the app explicitly supports 0-army teams, but a real papercut worth knowing about.
- **Fix**: None needed for this change. Worth revisiting only if users report it as friction.
- **Decision**: SKIPPED

### F5 — Duplicate-name detection is case-sensitive, both client and DB

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — informational only
- **Dimension**: Safety & Quality
- **Location**: src/components/team/CreateTeamForm.tsx validate(); supabase/migrations/20260904185524_create_pairing_domain_schema.sql:19 (`unique(team_id, name)`, plain `text`, default collation)
- **Detail**: "Ultramarines" and "ultramarines" are treated as distinct armies on both the client check and the DB constraint — consistent behavior (client and server agree), not a bug introduced by this change, but plausibly surprising to a user.
- **Fix**: None needed.
- **Decision**: SKIPPED
