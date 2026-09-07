# Create Team Roster — Plan Brief

> Full plan: `context/changes/create-team-roster/plan.md`

## What & Why

Let a logged-in captain create their team (name + roster of armies) and view it afterward. Roadmap item S-01 — the first user-facing slice on top of F-01's schema, and the first feature in the app beyond auth.

## Starting Point

`teams`/`team_armies` tables exist and are RLS-protected (F-01, archived), but zero application code queries them yet. Every existing convention in the app is auth-specific: untyped Supabase client, FormData→redirect API routes, hand-rolled form validation, no repeatable-list input pattern anywhere.

## Desired End State

A captain visits `/dashboard/team`: no team yet → create form (name + up to 5 army fields, addable/removable, defaults to 5 empty). Submit → redirected to the same URL, which now shows a team view (name, roster, "add one more army" mini-form) instead of the create form, permanently.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Create + view in one slice | A create-only flow with no way to see the result is incomplete UX | Plan |
| Already-has-a-team | Conditional render, not HTTP redirect | Same page branches server-side on team existence — no extra round trip, enforces PRD's "one team per captain" at the UI layer since the DB doesn't | Plan |
| Roster minimum | 0 armies allowed at creation | User's explicit call — armies can be added later via the view's mini-form | Plan (user override) |
| Where it lives | New page `/dashboard/team` | Keeps `dashboard.astro` a simple hub as S-02/S-03 add their own sections; already covered by `PROTECTED_ROUTES`'s `/dashboard` prefix match | Plan |
| Validation | Hand-rolled, matching `SignUpForm.tsx` | Consistency with the only existing precedent; no new dependency on a 2-week MVP | Plan |
| Duplicate army name | Client-side block before submit, server-side UNIQUE-violation catch as fallback | Fast feedback for the common case; DB constraint is still the real source of truth for races | Plan |
| Default army fields | 5 empty fields shown on load | Visibly matches FR-001's "default 5, extensible" | Plan |
| Name length | Soft UI `maxLength`, no DB CHECK | No new migration needed; F-01's schema stays untouched | Plan |

## Scope

**In scope:** typed Supabase client, `teams.ts` data-access module, 2 API routes (create team, add army), create-team form, team view, moving 3 shared form primitives out of `components/auth/`, one dashboard link.

**Out of scope:** multi-team support, editing/renaming/removing an army or team, opponent/matrix functionality (S-02), any test framework, DB-level name-length limits.

## Architecture / Approach

Bottom-up: typed data-access layer (Phase 1) → API routes built on it (Phase 2) → UI built on those (Phase 3). One page (`/dashboard/team.astro`) branches server-side between two React islands (`CreateTeamForm`, `TeamView`) based on a single `getTeamWithArmies` query.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | Typed client + `teams.ts` (get/create/add-army) | Low — no UI, straightforward |
| 2. API routes | `/api/teams`, `/api/teams/armies`, FormData→redirect | Explicit auth check needed — `/api/*` isn't covered by `PROTECTED_ROUTES` |
| 3. UI | Form-primitive move, create form, team view, page, dashboard link | First repeatable-list input pattern in the app — no precedent to follow |

**Prerequisites:** F-01 (done, archived) — schema and RLS already live locally and in production.
**Estimated effort:** Not estimated (roadmap items carry no time units) — see `plan.md` for phase-level detail.

## Open Risks & Assumptions

- Client-side duplicate-name checking can't cover the cross-tab/cross-session race — the server-side UNIQUE-violation catch in `createTeamWithArmies`/`addArmyToTeam` is the actual guarantee.
- "One team per captain" is enforced only by this UI's conditional render, not the database — a direct API call could still theoretically create a second team if this page's check is ever bypassed.

## Success Criteria (Summary)

- A captain can create a team (0–5+ armies) and see it rendered back immediately.
- A captain can add armies one at a time after creation.
- Reloading never re-shows the create form once a team exists.
- Duplicate army names are rejected with a friendly message, not a raw DB error.
