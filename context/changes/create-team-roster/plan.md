# Create Team Roster Implementation Plan

## Overview

Let a logged-in captain create their team (name + roster of armies) and view it afterward. This is roadmap item **S-01** — the first user-facing slice built on F-01's schema, and the first feature in the app beyond auth: first typed Supabase queries, first non-auth API routes, first repeatable-list form input.

## Current State Analysis

- Schema exists and is live (F-01, archived): `teams` (id, captain_id, name, timestamps) and `team_armies` (id, team_id, captain_id, name, created_at, `unique(team_id, name)`), both RLS-scoped to `auth.uid() = captain_id`. No application code queries either table yet (`grep -rn "\.from(" src/` returns zero matches).
- `src/lib/supabase.ts`'s `createServerClient(...)` call has no generic — the Supabase client is untyped everywhere today, despite `src/db/database.types.ts` already existing (generated in F-01).
- Every existing API route (`src/pages/api/auth/{signin,signup,signout}.ts`) follows one convention: read `context.request.formData()`, call Supabase, `context.redirect()` on both success and error (error via `?error=` query param) — never a JSON response. No JSON-returning route exists anywhere in the repo.
- `PROTECTED_ROUTES = ["/dashboard"]` in `src/middleware.ts` matches via `startsWith` — any page under `/dashboard/*` is automatically protected, no middleware change needed for a new page there. An API route (e.g. `/api/teams`) is **not** covered by this and needs its own explicit `context.locals.user` check.
- `FormField`, `SubmitButton`, `ServerError` (`src/components/auth/`) are generic form primitives with no auth-specific logic — reusable as-is, just mis-located.
- No validation library exists in the repo (`package.json` has no zod/yup/valibot) — the only precedent is hand-rolled `validate()` functions in `SignUpForm.tsx`/`SignInForm.tsx` (client-side `useState` + manual checks, native `<form method="POST" action="...">` submission, no `fetch`).
- No repeatable/dynamic-list form input exists anywhere in the repo (confirmed via grep for `useFieldArray`, dynamic `.map` field patterns) — this is a new pattern.
- "One team per captain" is **not** enforced at the database level (F-01's deliberate decision) — the application is responsible for the one-team-per-captain behavior.
- `dashboard.astro` is the only protected page today: a bare placeholder (welcome message + sign-out button), no nav to other sections yet.

## Desired End State

A captain visiting `/dashboard/team` for the first time sees a create-team form (name + up to 5 army-name fields, addable/removable, defaulting to 5 empty fields). Submitting creates the team (with any non-empty army names) and redirects back to the same page, which now — because a `teams` row exists for that captain — renders a team view instead: the team name and its roster, plus a small form to add one more army at a time. Visiting `/dashboard/team` again never re-shows the create form once a team exists.

Verification: `npm run lint` passes; manually create a team via the UI, confirm it and its armies appear in Supabase Studio scoped to the correct `captain_id`; confirm a second visit to the page shows the view, not the create form.

### Key Discoveries:

- `src/pages/dashboard.astro:4` reads `Astro.locals.user` directly in the page frontmatter — the new `/dashboard/team.astro` will do the same, plus a server-side team lookup, following the same pattern.
- `signup.astro`/`signin.astro` pass `serverError={Astro.url.searchParams.get("error")}` into the React island — the new forms will use the identical error-surfacing convention for consistency with the rest of the app.
- `components.json` already has shadcn wired (`style: "new-york"`, aliases for `@/components/ui`, `@/lib`) — only `button.tsx` exists there today; `npx shadcn add input label` is available if needed but not required (existing `FormField` already wraps a plain `<input>`).

## What We're NOT Doing

- No multi-team support — a captain can have at most one team through this UI (DB still permits more, per F-01; this slice's UI is the enforcement point).
- No editing the team name or renaming/removing an army after creation — only create-team and add-army-to-existing-team. Removing an army is deferred (FR-001/roadmap don't call for it yet, and F-01's cascade-delete note already flags that deletion needs a confirmation UX when it's eventually built).
- No opponent or matrix functionality — that's S-02.
- No test framework changes — this repo has none configured; verification stays manual + `npm run lint`, matching F-01's precedent.
- No character-limit enforcement in the database — soft `maxLength` in the UI only; `team_armies.name`/`teams.name` stay unconstrained `text` (no new migration).

## Implementation Approach

Three phases, bottom-up: a typed data-access layer first (so the API routes and page can be written against real types instead of `any`), then the two API routes, then the UI. `FormField`/`SubmitButton`/`ServerError` move out of `components/auth/` into a shared location as part of the UI phase, since a team form importing from an `auth/` folder would be a confusing signal for future readers.

## Critical Implementation Details

- **The "already has a team" check happens server-side in the Astro page frontmatter, not via an HTTP redirect.** `/dashboard/team.astro` queries for an existing team on every load and conditionally renders the create form or the team view — there is no separate `/teams/new` route to redirect from/to. This avoids an extra round trip and matches how `dashboard.astro` already reads `Astro.locals.user` directly in frontmatter.
- **Client-side duplicate-name checking is a UX nicety, not the source of truth.** The `unique(team_id, name)` constraint (F-01) is what actually prevents duplicates; the API route must catch that constraint violation (Postgres error code `23505`) and map it to a friendly message, because two browser tabs (or a client bug) can still race past the client-side check.

## Phase 1: Typed Supabase client + data-access layer

### Overview

Type the Supabase client and centralize the app's first table queries in one module, rather than scattering `.from()` calls across pages/routes.

### Changes Required:

#### 1. Typed client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the existing `createServerClient` call with the generated `Database` type so every caller gets typed rows instead of `any`.

**Contract**: Import `Database` from `@/db/database.types` and change `createServerClient(...)` to `createServerClient<Database>(...)`. No signature or behavior change to `createClient()` itself — same `(requestHeaders, cookies) => client | null` shape callers already handle.

#### 2. Team data-access module

**File**: `src/lib/teams.ts` (new)

**Intent**: One place owning every `teams`/`team_armies` query this slice needs, so API routes and the page call named functions instead of writing raw Supabase queries inline.

**Contract**: Three functions, each taking the already-typed client from `createClient()`:
- `getTeamWithArmies(supabase, captainId)` — returns the captain's team (if any) joined with its armies, or `null` if none exists. Powers the page's create-vs-view branch.
- `createTeamWithArmies(supabase, name, armyNames: string[])` — inserts one `teams` row, then any non-empty `armyNames` into `team_armies` (0 or more). Returns the created team or a typed error including whether it was a unique-constraint violation.
- `addArmyToTeam(supabase, teamId, armyName)` — inserts one `team_armies` row for an existing team. Returns the created army or a typed error, same unique-violation distinction as above.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new/changed files

#### Manual Verification:

- None specific to this phase — verified indirectly through Phase 2/3's manual checks, since this phase has no UI of its own

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API routes

### Overview

Two routes, following the app's existing FormData → redirect convention.

### Changes Required:

#### 1. Create-team route

**File**: `src/pages/api/teams/index.ts` (new)

**Intent**: Handle the create-team form submission — auth-check, read the team name and up to N army-name fields, call `createTeamWithArmies`, redirect back to `/dashboard/team` on success or with `?error=` on failure.

**Contract**: `POST` only. Explicit `if (!context.locals.user) return context.redirect("/auth/signin")` at the top (this route is not covered by `PROTECTED_ROUTES`'s page-path matching). Reads the team name via `form.get("name")` and army names via `form.getAll("army")` (repeated `<input name="army">` fields), filters blanks. On a unique-violation from `createTeamWithArmies`, redirect with a message naming which army name was duplicated.

#### 2. Add-army route

**File**: `src/pages/api/teams/armies.ts` (new)

**Intent**: Handle the "add one more army" mini-form in team-view mode.

**Contract**: `POST` only, same explicit auth check. Looks up the captain's team via `getTeamWithArmies` (RLS already scopes this to the caller), reads one `form.get("army")` value, calls `addArmyToTeam`. Redirects to `/dashboard/team` on success, or back with `?error=` (including the friendly unique-violation message) on failure.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- `curl -X POST http://localhost:4321/api/teams` (or the deployed URL) with no session cookie redirects to `/auth/signin`, confirming the explicit auth check works before any UI exists to test it through

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI

### Overview

Move the shared form primitives, then build the page and its two React islands.

### Changes Required:

#### 1. Move shared form primitives

**Files**: `src/components/auth/{FormField,SubmitButton,ServerError}.tsx` → `src/components/forms/{FormField,SubmitButton,ServerError}.tsx`

**Intent**: These three components have no auth-specific logic — relocate them so a team-creation form doesn't import from an `auth/` folder. Update the two existing auth form imports (`SignUpForm.tsx`, `SignInForm.tsx`) to the new path.

**Contract**: Pure file move + import-path update; no behavioral change to the components themselves.

#### 2. Create-team form

**File**: `src/components/team/CreateTeamForm.tsx` (new)

**Intent**: Team name field + 5 default army-name fields (addable/removable), client-side validation (non-empty team name, blank army fields silently dropped, duplicate army names blocked before submit), native form POST to `/api/teams` — same hand-rolled-`validate()`, `useState`, `client:load` island style as `SignUpForm.tsx`.

**Contract**: Army fields render as repeated `<input name="army">` elements inside the native `<form>` so `form.getAll("army")` on the server sees all of them; "add army" appends another field (no fixed max); "remove" only shown past the first field. Reuses `FormField`/`SubmitButton`/`ServerError` from their new location.

#### 3. Team view

**File**: `src/components/team/TeamView.tsx` (new)

**Intent**: Display the team name and its roster (or an empty-roster message), plus a one-field "add army" mini-form posting to `/api/teams/armies`.

**Contract**: Read-only list rendering + one small form; same primitives and error-surfacing convention as the create form.

#### 4. Page

**File**: `src/pages/dashboard/team.astro` (new)

**Intent**: Server-side branch between create and view.

**Contract**: In frontmatter, call `getTeamWithArmies(supabase, Astro.locals.user.id)` (route is under `/dashboard/*`, already protected by existing `PROTECTED_ROUTES` middleware matching). Render `<CreateTeamForm client:load serverError={...} />` if no team, else `<TeamView client:load team={...} serverError={...} />`. Wrapped in `<Layout>`, matching every other page.

#### 5. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Add a link/card to `/dashboard/team` so the new page is reachable from the app's current landing page.

**Contract**: One `<a href="/dashboard/team">` addition to the existing placeholder content — no structural change to the page.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- As a logged-in captain with no team, visiting `/dashboard/team` shows the create form with 5 empty army fields
- Submitting with a name and 2 filled army fields (3 left blank) creates a team with exactly 2 armies, then redirects to a view showing the team name and those 2 armies
- Reloading `/dashboard/team` shows the view, not the create form again
- Adding a 3rd army via the mini-form appends it to the visible roster
- Attempting to add an army name that already exists in the roster shows a friendly error, not a raw DB error
- In Supabase Studio, the created `teams`/`team_armies` rows have `captain_id` matching the logged-in user
- `dashboard.astro` now links to `/dashboard/team`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test framework configured in this repo (consistent with F-01).

### Integration Tests:

- None — manual verification only, per project convention.

### Manual Testing Steps:

1. Sign in, visit `/dashboard/team` with no existing team — confirm create form renders with 5 empty army fields.
2. Submit with a team name and a mix of filled/blank/duplicate army fields — confirm blanks are dropped, duplicates are blocked client-side before submit.
3. Confirm redirect to the view state, roster matches what was submitted.
4. Add one more army via the view's mini-form; confirm it appears.
5. Try adding a duplicate army name via the mini-form; confirm the server-side unique-violation produces a friendly error (this is the one path client-side checking can't cover, since it's a fresh page load).
6. Reload the page; confirm it stays in view mode (never re-shows the create form).

## Performance Considerations

Single-digit rows per captain at this stage (per `prd.md`'s target scale) — no pagination or query optimization needed beyond the indexes F-01 already created on `captain_id` and `team_id`.

## Migration Notes

No schema changes — this slice is pure application code on top of F-01's already-migrated (and already-pushed-to-production) tables.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-01
- PRD: `context/foundation/prd.md` — FR-001
- Schema: `context/archive/2026-09-04-schema-teams-opponents-matrix/plan.md` (F-01, archived)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Typed Supabase client + data-access layer

#### Automated

- [x] 1.1 `npm run lint` passes with the new/changed files — 47b4476

### Phase 2: API routes

#### Automated

- [x] 2.1 `npm run lint` passes

#### Manual

- [x] 2.2 Unauthenticated POST to `/api/teams` redirects to `/auth/signin`

### Phase 3: UI

#### Automated

- [ ] 3.1 `npm run lint` passes

#### Manual

- [ ] 3.2 Create form shows 5 empty army fields for a captain with no team
- [ ] 3.3 Submitting creates a team with only the filled, non-duplicate army names
- [ ] 3.4 Reloading shows the view, not the create form
- [ ] 3.5 Add-army mini-form appends to the visible roster
- [ ] 3.6 Duplicate army name shows a friendly error, not a raw DB error
- [ ] 3.7 Supabase Studio rows have the correct `captain_id`
- [ ] 3.8 `dashboard.astro` links to `/dashboard/team`
