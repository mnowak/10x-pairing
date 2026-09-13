# Frontpage Redesign Implementation Plan

## Overview

Replace `src/pages/index.astro`'s unmodified Astro-starter `<Welcome />` content with a purpose-built page that serves two audiences at one URL: an anonymous visitor sees the project name, a one-line summary, a short "how it works" pitch, and Sign In / Sign Up buttons; an authenticated captain sees the same name/summary plus their team-roster editor and their opponents list — there is no separate `/dashboard`. This consolidates `dashboard.astro`, `dashboard/team.astro`, and `dashboard/opponents/index.astro` into `index.astro`; the opponent-detail screen (`dashboard/opponents/[id].astro` + `/match` + `/simulate`) is untouched.

## Current State Analysis

- `src/pages/index.astro` renders `<Welcome />` (`src/components/Welcome.astro`) — generic "10x Astro Starter" hero, feature cards, and Sign In/Sign Up CTAs with no product content. It does not read `Astro.locals.user` at all.
- `src/pages/dashboard.astro` is a small authenticated landing page (email + two nav links: "Manage your team", "Manage opponents" + sign-out) — gated by `PROTECTED_ROUTES = ["/dashboard"]` in `src/middleware.ts`.
- `src/pages/dashboard/team.astro` fetches the captain's team via `getTeamWithArmies`/`getEstimateCountsForTeamArmies` (`@/lib/teams`) and renders `CreateTeamForm` (no team yet) or `TeamView` (team exists), both always-visible — no toggle/gate.
- `src/pages/dashboard/opponents/index.astro` fetches opponents via `getOpponentsWithArmies` (`@/lib/opponents`) and renders `OpponentsList`, which itself shows the opponent list and an "Add opponent" form (auto-open when the list is empty or a server error is present, otherwise behind a small "Add another opponent" toggle it manages internally).
- `src/pages/dashboard/opponents/[id].astro` (+ `/match`, `/simulate`) is the existing per-opponent screen (armies, matrix, live/simulated pairing) — unaffected by this change except its "opponent not found" redirect target.
- Every page above follows the same pattern: `createClient(...)` from `@/lib/supabase` (returns `null` if Supabase env is unset), guard on `supabase && user`, `try/catch` around the data fetch with `logError` + a fallback `error` string, and an `?error=` query param read back after a POST redirect to feed a component's `serverError` prop.
- **Both team and opponent POST redirects currently reuse the same `error` query-param name**, because they've always landed on two different pages. Once both flows redirect to the same `/`, a plain shared `error` name would make a team-flow error also appear to belong to the opponents section (or vice versa) — see Critical Implementation Details.
- `src/components/Topbar.astro` already implements exactly the anon-vs-authenticated CTA split the user asked for (sign in/up links when logged out; email + sign out when logged in) — it also has a "Dashboard" nav link in the authenticated branch that becomes self-referential once it lives on `/`.
- The whole app (auth pages, dashboard, team, opponents, match, simulate) shares one consistent dark "cosmic" visual system (`bg-cosmic`, glass cards, gradient text) — this redesign is a content/composition change, not a new visual system.
- `tests/e2e/seed.spec.ts` and `tests/e2e/live-match-mode-session.spec.ts` both `page.goto("/dashboard/team")` directly to reach the team editor.

## Desired End State

An anonymous visitor to `/` sees the project name, a short summary, a "how it works" explainer, and Sign In / Sign Up buttons. An authenticated captain visiting `/` sees a compact header (name + summary, not the full hero), the same explainer further down the page, an always-visible team-roster editor, and an opponents section (list + add-opponent entry point) — clicking an opponent opens the unchanged `/dashboard/opponents/[id]` screen. `/dashboard`, `/dashboard/team`, and `/dashboard/opponents` all redirect to `/`. No functional flow (team creation, army add/remove, opponent creation, opponent army add/remove) changes behavior — only where its UI lives and where its POST redirects land.

Verify by: `npm run build` succeeds, `npm run test:e2e` passes, and the manual checks under each phase below.

### Key Discoveries:

- `TeamView`/`CreateTeamForm` and `OpponentsList`/`CreateOpponentForm` require no changes to be embedded on the same page — they're self-contained React islands driven entirely by props and their own `POST` form actions.
- `Topbar.astro` (`src/components/Topbar.astro:1`) already covers the anonymous sign-in/up requirement; only its authenticated-branch "Dashboard" link needs removing.
- `PROTECTED_ROUTES` in `src/middleware.ts:4` only lists `/dashboard` as a prefix — `/` is (and must remain) unprotected so anonymous visitors can land on it, while the three thin redirect stubs left at the old `/dashboard*` paths stay protected for anonymous visitors exactly as they are today (redirected to `/auth/signin` before the stub's own body runs).

## What We're NOT Doing

- Not renaming or moving `/dashboard/opponents/[id]`, `/match`, or `/simulate` — they keep their current paths.
- Not adding a collapse/toggle interaction to the team section — it stays always-visible, matching today's `team.astro`.
- Not changing `PROTECTED_ROUTES` or introducing a new middleware rule — `/` stays intentionally public; the surviving nested `/dashboard/opponents/...` routes and the new thin redirect stubs remain covered by the existing `/dashboard` prefix.
- Not touching `OpponentDetail.tsx`'s internal content, or `match.astro`'s/`simulate.astro`'s pairing logic — only their "opponent not found" redirect target changes.
- Not introducing a new visual system — reusing the existing cosmic theme, glass-card, and gradient-text conventions used everywhere else in the app.

## Implementation Approach

Rewrite `index.astro` first as the new single entry point (Phase 1), then retire the pages and redirects it makes obsolete (Phase 2), then fix the two E2E tests that navigate to a path being removed (Phase 3). This order means the new page exists and is verified before anything old is deleted, and the test suite is fixed in the same change rather than left red — required by the S-09 CI gate this milestone exists to enforce.

## Critical Implementation Details

**State sequencing (query-param contract):** Team-flow and opponent-flow POST handlers currently redirect back to two different pages, each reading its own `?error=` param. Once both redirect to `/`, a shared `error` name would misattribute one flow's error to the other section's UI. Use two distinct names: `teamError` for the redirects in `api/teams/index.ts`, `api/teams/armies.ts`, and `api/teams/armies/remove.ts`; `opponentError` for the *index-level* redirects in `api/opponents/index.ts`, `api/opponents/armies.ts`, and `api/opponents/armies/remove.ts` (the "Supabase not configured" / "missing opponent" / "opponent not found" cases that today target `/dashboard/opponents`). `index.astro` reads both independently and passes each to its own component's `serverError` prop. The opponent-*scoped* redirects (e.g. `/dashboard/opponents/${opponentId}?error=...`, still targeting the unchanged detail page) keep the existing plain `error` name — that page is single-purpose and unaffected.

## Phase 1: Unified `index.astro` page

### Overview

Replace the Welcome-based frontpage with the consolidated landing/dashboard page, branching on `Astro.locals.user`.

### Changes Required:

#### 1. `src/pages/index.astro`

**File**: `src/pages/index.astro`

**Intent**: Rewrite as the single entry point. Always render the project name and a one-line summary (drawn from the product description already written for the README — a live pairing tool for Warhammer 40k team-tournament captains). Always render the "how it works" pitch (the defender/attacker reveal-sequence explainer), placed directly below the hero for anonymous visitors and below the dashboard content for authenticated ones. Branch on `Astro.locals.user`: anonymous → full-size hero + `Topbar` (sign-in/sign-up); authenticated → compact header (smaller type, no large vertical padding) + `Topbar` (email + sign-out) + team section + opponents section.

**Contract**: Fetch team via `getTeamWithArmies`/`getEstimateCountsForTeamArmies` (`@/lib/teams`) and opponents via `getOpponentsWithArmies` (`@/lib/opponents`) in two independent `try/catch` blocks when `supabase && user`, mirroring the existing `logError` + fallback-message pattern from `dashboard/team.astro` and `dashboard/opponents/index.astro`. Read `teamError` and `opponentError` query params (see Critical Implementation Details) and pass each to the matching component's `serverError` prop. Render `CreateTeamForm` (no team) or `TeamView` (team exists) always-visible; render `OpponentsList` for the opponents section.

#### 2. `src/components/Welcome.astro`

**File**: `src/components/Welcome.astro`

**Intent**: No longer referenced once `index.astro` is rewritten — remove the dead starter component.

**Contract**: Delete the file.

#### 3. `src/components/Topbar.astro`

**File**: `src/components/Topbar.astro`

**Intent**: Drop the authenticated branch's "Dashboard" nav link — it's self-referential once `Topbar` renders on `/` itself. Keep the email display, sign-out form, and the anonymous branch's sign-in/sign-up links unchanged.

**Contract**: Remove the `<a href="/dashboard">Dashboard</a>` element from the authenticated (`user` truthy) branch.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Anonymous visit to `/` shows project name, one-line summary, the pitch/explainer section, and Sign In / Sign Up buttons — no team or opponent content.
- Authenticated visit to `/` with no team yet shows the compact header, "Create Your Team" form, and an opponents section with its add-opponent form open (list empty).
- Authenticated visit to `/` with an existing team and opponents shows the compact header, team roster (add/remove army works and persists after reload), the opponents list, and the pitch/explainer section further down the page.
- Adding an opponent from `/` shows it in the list, and clicking it opens the existing `/dashboard/opponents/[id]` screen unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Retire old dashboard pages & fix redirects

### Overview

Remove the three pages whose content moved into `index.astro`, leave thin redirect stubs at their old paths, and repoint every hardcoded redirect that used to target them.

### Changes Required:

#### 1. Thin redirect stubs

**File**: `src/pages/dashboard.astro`, `src/pages/dashboard/team.astro`, `src/pages/dashboard/opponents/index.astro`

**Intent**: Replace each page's content with an unconditional redirect to `/`, so stale bookmarks/links land on the consolidated page instead of duplicating content or 404ing. Anonymous visitors never reach the stub's body — `PROTECTED_ROUTES` in `src/middleware.ts` already redirects them to `/auth/signin` first.

**Contract**: Each file's frontmatter becomes `return Astro.redirect("/");` with no body markup.

#### 2. Team-flow API redirects

**File**: `src/pages/api/teams/index.ts`, `src/pages/api/teams/armies.ts`, `src/pages/api/teams/armies/remove.ts`

**Intent**: Repoint every redirect that targeted the now-removed `/dashboard/team` to `/`, using the `teamError` query-param name (see Critical Implementation Details) in place of the current plain `error` name.

**Contract**: `/dashboard/team` → `/`; `?error=` → `?teamError=` on every redirect in these three files (both the success case with no param and the error cases).

#### 3. Opponent-flow API redirects (index-level only)

**File**: `src/pages/api/opponents/index.ts`, `src/pages/api/opponents/armies.ts`, `src/pages/api/opponents/armies/remove.ts`

**Intent**: Repoint the *index-level* redirects (today's "Supabase not configured" / "missing opponent" / "opponent not found" cases, all currently targeting `/dashboard/opponents`) to `/`, using `opponentError` in place of `error`. The opponent-*scoped* redirects in these same files (e.g. `/dashboard/opponents/${opponentId}?error=...`, `/dashboard/opponents/${result.opponent.id}`) are unchanged — they still target the surviving detail page and keep the plain `error` name.

**Contract**: `/dashboard/opponents?error=...` → `/?opponentError=...`; `/dashboard/opponents/${id}...` unchanged.

#### 4. Opponent-detail "not found" redirects

**File**: `src/pages/dashboard/opponents/[id].astro`, `src/pages/dashboard/opponents/[id]/match.astro`, `src/pages/dashboard/opponents/[id]/simulate.astro`

**Intent**: When an opponent can't be loaded (missing id, not found, or a fetch error), redirect back to the consolidated page instead of the now-removed opponents index.

**Contract**: `Astro.redirect("/dashboard/opponents")` (and the error-query variants) → `Astro.redirect("/")` (preserving whatever `?opponentError=`-equivalent message each call currently attaches, renamed per the Critical Implementation Details contract). `[id].astro`'s "← Back to opponents" link changes to `href="/"` labeled "← Back to dashboard".

### Success Criteria:

#### Automated Verification:

- No stray references remain: `grep -rn "/dashboard/team\|/dashboard/opponents\"" src` matches nothing outside the three redirect-stub files themselves (the opponent-*scoped* `/dashboard/opponents/${...}` template-literal redirects are expected to remain and are excluded by the trailing quote in this grep).
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Visiting `/dashboard`, `/dashboard/team`, or `/dashboard/opponents` while signed in redirects to `/`.
- Visiting `/dashboard` while signed out redirects to `/auth/signin` (existing protected-route behavior preserved).
- A team-flow error (e.g. a duplicate army name) redirects to `/?teamError=...` and the message shows against the team section only.
- An opponent-flow index-level error (e.g. submitting armies for a bogus opponent id) redirects to `/?opponentError=...` and the message shows against the opponents section only.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Update E2E tests

### Overview

Fix the two E2E specs that navigate directly to the now-removed `/dashboard/team`.

### Changes Required:

#### 1. E2E navigation targets

**File**: `tests/e2e/seed.spec.ts`, `tests/e2e/live-match-mode-session.spec.ts`

**Intent**: Both files call `page.goto("/dashboard/team")` to reach the team editor before adding/removing armies; the editor now lives at `/`.

**Contract**: `page.goto("/dashboard/team")` → `page.goto("/")` in both files (one call site in `seed.spec.ts`, one inside `live-match-mode-session.spec.ts`'s `clearTeamRoster` helper). No other assertions in either file reference a changed path — the opponent-id extraction regex (`/\/dashboard\/opponents\/([^/?]+)/`) targets the unchanged detail-page redirect and needs no change.

### Success Criteria:

#### Automated Verification:

- Full E2E suite passes: `npm run test:e2e`

---

## Testing Strategy

### Unit Tests:

- No new unit-testable logic is introduced (page composition + redirects only); existing `src/lib/teams.test.ts`/`src/lib/opponents.test.ts`-style coverage (if present) is unaffected since the underlying data-fetch functions aren't changed.

### Integration Tests:

- Covered by the existing E2E specs once repointed (Phase 3).

### Manual Testing Steps:

1. As an anonymous visitor, load `/` and confirm the pitch content and Sign In / Sign Up buttons, with no team/opponent UI.
2. Sign up a fresh captain, land on `/`, create a team, add an army, confirm it persists after reload.
3. Add an opponent from `/`, confirm it appears in the list, click it, confirm the existing armies/matrix/pairing screen loads unchanged.
4. Visit `/dashboard`, `/dashboard/team`, and `/dashboard/opponents` directly (signed in) and confirm each redirects to `/`.
5. Sign out and visit `/dashboard` directly, confirm redirect to `/auth/signin`.

## Performance Considerations

None — this is a composition/content change with no new data-fetching pattern beyond what `team.astro` and `opponents/index.astro` already did independently; the two fetches on the unified page are no heavier than the sum of the pages they replace.

## Migration Notes

No data migration. The three retired pages become permanent redirect stubs rather than being removed outright, so any external bookmark or link continues to resolve.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-16, milestone M-3, MS-05)
- Similar implementation (being consolidated): `src/pages/dashboard/team.astro`, `src/pages/dashboard/opponents/index.astro`
- Existing anon/authenticated CTA split to reuse: `src/components/Topbar.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unified index.astro page

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — e026786
- [x] 1.2 Linting passes: `npm run lint` — e026786
- [x] 1.3 Build succeeds: `npm run build` — e026786

#### Manual

- [x] 1.4 Anonymous visit to `/` shows project name, summary, pitch, and Sign In / Sign Up buttons — no team or opponent content — e026786
- [x] 1.5 Authenticated visit to `/` with no team yet shows compact header, Create Your Team form, and opponents section with add-form open — e026786
- [x] 1.6 Authenticated visit to `/` with existing team/opponents shows compact header, team roster (add/remove persists after reload), opponents list, and pitch below dashboard content — e026786
- [x] 1.7 Adding an opponent from `/` shows it in the list and clicking it opens `/dashboard/opponents/[id]` unchanged — e026786

### Phase 2: Retire old dashboard pages & fix redirects

#### Automated

- [x] 2.1 No stray `/dashboard/team` or index-level `/dashboard/opponents` references remain outside the redirect stubs (grep) — 19a5a1c
- [x] 2.2 Type checking passes: `npx astro check` — 19a5a1c
- [x] 2.3 Linting passes: `npm run lint` — 19a5a1c
- [x] 2.4 Build succeeds: `npm run build` — 19a5a1c

#### Manual

- [x] 2.5 `/dashboard`, `/dashboard/team`, `/dashboard/opponents` each redirect to `/` when signed in — 19a5a1c
- [x] 2.6 `/dashboard` redirects to `/auth/signin` when signed out — 19a5a1c
- [x] 2.7 A team-flow error redirects to `/?teamError=...` and shows against the team section only — 19a5a1c
- [x] 2.8 An opponent-flow index-level error redirects to `/?opponentError=...` and shows against the opponents section only — 19a5a1c

### Phase 3: Update E2E tests

#### Automated

- [x] 3.1 Full E2E suite passes: `npm run test:e2e`
