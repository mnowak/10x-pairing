# Frontpage Redesign — Plan Brief

> Full plan: `context/changes/frontpage-redesign/plan.md`

## What & Why

Replace `src/pages/index.astro`'s unmodified Astro-starter content with a purpose-built page for Pairing Assistant. Per direct user direction, there is no separate `/dashboard` — the frontpage *is* the dashboard: anonymous visitors get the pitch + sign-in/sign-up, authenticated captains get their team editor and opponents list, all at `/`.

## Starting Point

`index.astro` renders `<Welcome />` — generic starter copy, no product content, no auth branching. Team editing and opponent-list/add live on three separate pages (`dashboard.astro`, `dashboard/team.astro`, `dashboard/opponents/index.astro`), each independently protected by `PROTECTED_ROUTES = ["/dashboard"]`. The opponent-detail screen (armies/matrix/pairing) lives at `/dashboard/opponents/[id]` and stays untouched.

## Desired End State

One URL (`/`) serves both audiences. Anonymous: project name, one-line summary, "how it works" pitch, Sign In/Sign Up. Authenticated: compact header, always-visible team-roster editor, opponents list + add-opponent entry point (clicking an opponent opens the existing detail screen), pitch shown further down the page. The three old pages become permanent redirect stubs to `/`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Frontpage vs. dashboard | Single page, no separate `/dashboard` | Direct user instruction | User (pre-plan) |
| Anonymous CTA | Sign In / Sign Up buttons on `/` itself | Direct user instruction; already implemented by `Topbar` | User (pre-plan) |
| Authenticated content | Team edit + opponent add + opponent list (linking to existing detail screen) | Direct user instruction | User (pre-plan) |
| Always-shown content | Project name + short summary, both auth states | Direct user instruction | User (pre-plan) |
| Old route handling | Delete pages, add thin redirects to `/` | Stale bookmarks/links still resolve without keeping duplicate content | Plan |
| Opponent-detail URL | Keep `/dashboard/opponents/[id]` as-is | Minimal blast radius — no rename touching middleware/tests/links | Plan |
| Team section UX | Always-visible (no toggle) | Reuses `TeamView`/`CreateTeamForm` exactly as `team.astro` does today | Plan |
| Pitch visibility | Shown to everyone (auth and anon) | One page structure to design/test; doubles as a refresher | Plan |
| Hero sizing | Compact header once authenticated | Prioritizes the frequent-use case — content near the top for returning captains | Plan |
| Account controls | Reuse `Topbar` (drop its now-redundant "Dashboard" link) | Already implements the exact anon/authed CTA split needed | Plan |
| Test/redirect scope | Same change, not a fast-follow | Keeps CI green throughout — the exact discipline S-09 exists to enforce | Plan |
| Error query params | Split into `teamError` / `opponentError` | Both flows now redirect to the same `/`; a shared `error` name would misattribute one section's error to the other | Plan |

## Scope

**In scope:** `index.astro` rewrite, `Welcome.astro` removal, `Topbar.astro`'s dashboard-link removal, retiring `dashboard.astro`/`dashboard/team.astro`/`dashboard/opponents/index.astro` into redirect stubs, repointing ~10 hardcoded redirects across `api/teams/*` and `api/opponents/*`, updating 2 E2E test navigation calls.

**Out of scope:** Renaming `/dashboard/opponents/[id]` (+ `/match`, `/simulate`); any change to `PROTECTED_ROUTES`/middleware; a new visual system (reusing the existing cosmic theme); any change to `OpponentDetail.tsx`'s or the match/simulate pages' internal logic.

## Architecture / Approach

`index.astro` branches once on `Astro.locals.user`, fetching team + opponents server-side (two independent try/catch blocks, matching the app's existing null-Supabase/error-logging convention) only when a user is present. Anonymous and authenticated branches share one template — same hero/pitch structure, different sizing and different content below it — rather than two separate page components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Unified `index.astro` page | New page live, both auth branches working, old components reused as-is | Query-param collision between team/opponent error flows (resolved via `teamError`/`opponentError` split) |
| 2. Retire old pages & fix redirects | 3 pages become redirect stubs, ~10 redirect targets repointed | Missing a stray hardcoded `/dashboard/team` or `/dashboard/opponents` reference |
| 3. Update E2E tests | `seed.spec.ts` and `live-match-mode-session.spec.ts` navigate to `/` instead | None — mechanical one-line change per file |

**Prerequisites:** None — no dependency on other in-flight roadmap slices.
**Estimated effort:** Single session, ~3 phases; no new data model or infrastructure.

## Open Risks & Assumptions

- Exact hero/pitch copy is drafted by the implementer from the README's existing product description, not dictated here — reasonable per the roadmap's own note that Claude proposes a direction for the user to accept or redirect.
- Assumes no other file outside `src/` and `tests/e2e/` hardcodes a `/dashboard/team` or index-level `/dashboard/opponents` path (verified via `grep -rn` during research; re-verified as Phase 2's automated check).

## Success Criteria (Summary)

- A first-time visitor to `/` sees a purpose-built pitch and can sign up, with no trace of the Astro-starter default.
- A returning captain lands on `/` and can manage their team roster and opponents without visiting any other URL.
- `npm run build` and `npm run test:e2e` both pass with zero remaining references to the retired dashboard paths.
