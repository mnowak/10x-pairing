# Prepare Opponent Matrix Implementation Plan

## Overview

Let a captain add opponent teams (with rosters, mirroring S-01's team pattern) and prepare a pairing-matrix estimate against each one — a grid of our armies × that opponent's armies, each cell a color-banded point estimate (0-20 stored, color derived for display). This is roadmap item **S-02**, the PRD's north star: the smallest complete flow that proves captains will actually use the tool.

## Current State Analysis

- Schema exists and is live (F-01, archived): `opponents` (id, captain_id, name, timestamps), `opponent_armies` (id, opponent_id, captain_id, name, created_at, `unique(opponent_id, name)`), `pairing_matrix_estimates` (id, team_army_id, opponent_army_id, captain_id, `score integer check (score between 0 and 20)`, updated_at, `unique(team_army_id, opponent_army_id)`) — all RLS-scoped to `auth.uid() = captain_id`. No application code queries any of these three tables yet.
- S-01 (archived, `context/archive/2026-09-06-create-team-roster/`) established the local pattern this slice extends: a typed data-access module per entity (`src/lib/teams.ts`), FormData→redirect API routes for page-navigating actions, hand-rolled React form components (`useState` + native `<form>` submission), shared primitives at `src/components/forms/{FormField,SubmitButton,ServerError}.tsx`, and a page that branches server-side on entity existence.
- No grid/table UI component exists anywhere in the repo (`src/components/ui/` has only `button.tsx`) — the matrix grid is a new UI pattern with no local precedent.
- No `fetch()`-based JSON API route exists anywhere in the repo — every existing route (auth + S-01's `/api/teams*`) is FormData-in, `context.redirect()`-out. This slice's auto-save-per-cell requirement (see Critical Implementation Details) cannot use that pattern without a full-page reload per cell click, so this plan introduces the app's first JSON route.
- `src/lib/supabase.ts`'s `createServerClient<Database>` is already typed (S-01) — `Tables<"opponents">`, `Tables<"opponent_armies">`, `Tables<"pairing_matrix_estimates">` are all available from `src/db/database.types.ts` with no further codegen needed.
- The color-band boundaries in the original discovery worksheet (`pairing-process-worksheet.md`) overlap (orange 5-10 / yellow 8-12 overlap at 8-10; yellow 8-12 / green 11-15 overlap at 11-12) and cannot be used verbatim for a deterministic score→color function.

## Desired End State

A captain can: visit `/dashboard/opponents`, add a new opponent (name + up to 5 initial army fields, mirroring team creation), click into that opponent to see a grid of our team's armies (rows) × the opponent's armies (columns), click any cell to pick one of 5 colors, see the pick save immediately (no page reload, no explicit save button), and revisit later to see previously-entered picks and change any of them the same way. This is repeatable for any number of opponents.

Verification: `npm run lint` passes; manually create two opponents with rosters, fill in matrix cells for both, confirm picks persist across reloads and are scoped to the correct `captain_id` in Supabase Studio; confirm editing an existing cell overwrites rather than duplicating.

### Key Discoveries:

- `src/lib/teams.ts` (S-01) already exports `getTeamWithArmies` — this slice's matrix module reuses it directly to get "our armies" for the grid; no new team-side query needed.
- `src/pages/dashboard/team.astro` and `src/components/team/{CreateTeamForm,TeamView}.tsx` are the direct templates for this slice's opponent-equivalent files — same shape, different table/column names.
- Astro's `output: "server"` means dynamic routes (`src/pages/dashboard/opponents/[id].astro`) work without `getStaticPaths` — confirmed by the existing SSR-only setup (no static routes anywhere in `src/pages/`).
- `astro:middleware`'s `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`) matches via `startsWith`, so both new pages and the new `/api/matrix` route... **correction**: only page paths are covered (confirmed during S-01's impl-review) — `/api/matrix`, like `/api/teams*`, needs its own explicit `context.locals.user` check.

## What We're NOT Doing

- No removing an opponent, renaming an opponent, or removing an army from an opponent's roster — mirrors S-01's exact scope boundary (team-side removal is already tracked separately as S-04; opponent-side removal is a new, not-yet-tracked gap, deliberately left alone here rather than silently expanding this slice).
- No opponent-vs-opponent or team-vs-team comparison views — one opponent's matrix at a time, per FR-004/FR-005.
- No live match-mode logic (suggestion engine, sub-round tracking, refused-attacker pairing) — that's S-03.
- No test framework — manual verification only, matching F-01/S-01 precedent.
- No pagination on the opponents list — target scale is small (per `prd.md`), a plain list is sufficient.
- No undo/history on matrix edits — each color pick overwrites the previous one; PRD's "no loss of previously entered estimates" means never losing a *saved* estimate, not preserving edit history.

## Implementation Approach

Three phases, following S-01's proven shape: a data layer (color-band mapping + two new data-access modules), then API routes (two FormData routes mirroring S-01's exactly, plus one new JSON route for the grid), then UI (opponent CRUD components mirroring S-01's, plus the new matrix grid). The opponent-side components are close enough to S-01's team components that they're built by adaptation, not from scratch.

## Critical Implementation Details

- **Color-band mapping is a pure function, defined once, used both directions.** The captain's chosen palette (confirmed this session, does not match the original discovery worksheet's overlapping ranges) is: `red` 0-3, `orange` 4-8, `yellow` 9-11, `green` 12-15, `dark-green` 16-20 — five bands, no gaps, no overlaps, covering the full 0-20 range. Each band maps to one representative stored value (rounded midpoint): `red`→2, `orange`→6, `yellow`→10, `green`→14, `dark-green`→18. Both directions (`scoreToBand(score)` for display of existing estimates, `bandToScore(band)` for writing a new pick) live in one module (`src/lib/colorBands.ts`) so the boundary logic is never duplicated.
- **The matrix endpoint is this app's first JSON API route, not FormData→redirect.** Auto-save-per-cell (confirmed this session) means a full-page reload per color pick is unacceptable UX for a grid that can have 25+ cells. `POST /api/matrix` reads a JSON body (`{ teamArmyId, opponentArmyId, band }`), returns a JSON `{ ok: true }` or `{ ok: false, error: string }`, and the `MatrixGrid` component calls it with `fetch()`, showing an inline per-cell error (not a page-level redirect) on failure. This is a deliberate, documented deviation from the FormData convention — the reason (auto-save UX) is real and specific to this one endpoint; the two opponent-CRUD routes (`/api/opponents`, `/api/opponents/armies`) still use the established FormData→redirect pattern, since they're page-navigating actions like team creation was.
- **RLS on `pairing_matrix_estimates` does not verify that `team_army_id`/`opponent_army_id` belong to the requesting captain — the application must.** RLS's `WITH CHECK (auth.uid() = captain_id)` only checks the new row's own `captain_id` column; it says nothing about whether the *referenced* `team_armies`/`opponent_armies` rows are owned by that same captain. A foreign key only requires the referenced row to exist, not that it's owned by the same user. Without an explicit check, a captain could submit another captain's `team_army_id` or `opponent_army_id` (if guessed/leaked) and have it silently accepted into their own `pairing_matrix_estimates` row. `upsertEstimate` in `src/lib/matrix.ts` must verify both IDs are present in the caller-supplied, already-RLS-scoped `getTeamWithArmies`/`getOpponentWithArmies` results before writing — never trust a client-submitted UUID pair directly against the FK alone.

## Phase 1: Data layer

### Overview

Color-band mapping, plus data-access modules for opponents and the matrix, following `src/lib/teams.ts`'s established shape.

### Changes Required:

#### 1. Color-band module

**File**: `src/lib/colorBands.ts` (new)

**Intent**: Single source of truth for the score↔color mapping described in Critical Implementation Details.

**Contract**: Exports a typed `ColorBand = "red" | "orange" | "yellow" | "green" | "dark-green"`, a `COLOR_BANDS` ordered array of `{ band, min, max, representativeScore }` (the five ranges and their midpoint values above), `scoreToBand(score: number): ColorBand` (range lookup), and `bandToScore(band: ColorBand): number` (representative-value lookup).

#### 2. Opponent data-access module

**File**: `src/lib/opponents.ts` (new)

**Intent**: Mirrors `src/lib/teams.ts` for the `opponents`/`opponent_armies` tables, plus a list function S-01 didn't need (a captain has many opponents, not one).

**Contract**: Four functions:
- `getOpponentsWithArmies(supabase, captainId)` — all of the captain's opponents with their armies, for the list page.
- `getOpponentWithArmies(supabase, captainId, opponentId)` — one opponent with its armies, or `null` if not found/not owned (RLS-scoped query, not a separate ownership check).
- `createOpponentWithArmies(supabase, name, armyNames: string[])` — same shape as `createTeamWithArmies`: inserts one `opponents` row, then 0+ `opponent_armies` rows, returns `{ opponent }` or `{ error: TeamsError }`-equivalent typed error (reuse or mirror the existing `TeamsError` shape from `teams.ts` for the same `23505` duplicate-army distinction).
- `addArmyToOpponent(supabase, opponentId, armyName)` — same shape as `addArmyToTeam`.

#### 3. Matrix data-access module

**File**: `src/lib/matrix.ts` (new)

**Intent**: Build the grid data for one opponent, and upsert one cell with the ownership check described in Critical Implementation Details.

**Contract**: Two functions:
- `getMatrixGrid(supabase, captainId, opponentId)` — calls `getTeamWithArmies` (from `teams.ts`) and `getOpponentWithArmies` for the row/column army lists, plus a query for existing `pairing_matrix_estimates` rows scoped to those army IDs; returns a structure the `MatrixGrid` component can render directly (our armies, their armies, and a lookup of existing `(teamArmyId, opponentArmyId) → score`).
- `upsertEstimate(supabase, captainId, teamArmyId, opponentArmyId, band: ColorBand)` — verifies `teamArmyId` is in the captain's own team armies and `opponentArmyId` is in the target opponent's armies (both derived from RLS-scoped reads, not trusted from the caller), converts `band` to a score via `bandToScore`, and upserts via `.upsert({ team_army_id, opponent_army_id, score }, { onConflict: "team_army_id,opponent_army_id" })`, relying on the existing `unique(team_army_id, opponent_army_id)` constraint (F-01). Returns `{ ok: true }` or `{ ok: false, error: string }`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new/changed files

#### Manual Verification:

- None specific to this phase — verified indirectly through Phase 2/3's manual checks, since this phase has no UI or routes of its own

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API routes

### Overview

Two FormData routes mirroring S-01's exactly, plus the app's first JSON route for the grid.

### Changes Required:

#### 1. Create-opponent route

**File**: `src/pages/api/opponents/index.ts` (new)

**Intent**: Mirrors `src/pages/api/teams/index.ts` exactly, for opponents. Unlike team creation, there is no "already has one" check — a captain can have many opponents.

**Contract**: `POST` only, explicit `context.locals.user` check, reads `form.get("name")` + `form.getAll("army")`, calls `createOpponentWithArmies`, redirects to the new opponent's detail page (`/dashboard/opponents/<id>`) on success, `/dashboard/opponents?error=` (naming the duplicated army) on unique-violation.

#### 2. Add-army-to-opponent route

**File**: `src/pages/api/opponents/armies.ts` (new)

**Intent**: Mirrors `src/pages/api/teams/armies.ts`, adding one army to a specific opponent (identified by a hidden `opponent_id` form field, since a captain has many opponents, unlike the single-team case).

**Contract**: `POST` only, same auth-check pattern, reads `form.get("opponent_id")` + `form.get("army")`, calls `addArmyToOpponent`, redirects to `/dashboard/opponents/<opponent_id>` on success or with `?error=` on failure.

#### 3. Matrix upsert route

**File**: `src/pages/api/matrix.ts` (new)

**Intent**: The auto-save endpoint for one grid cell — see Critical Implementation Details for why this is JSON, not FormData.

**Contract**: `POST` only, explicit `context.locals.user` check returning a `401` JSON body (not a redirect — this route is called by `fetch()`, not form navigation) if unauthenticated. Reads a JSON body `{ teamArmyId: string, opponentArmyId: string, band: ColorBand }`, calls `upsertEstimate`, returns `Response.json({ ok: true })` or `Response.json({ ok: false, error: string }, { status: 400 })`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- `curl -X POST http://localhost:4321/api/matrix` (no session cookie) returns `401` with a JSON body, not an HTML redirect — confirming the JSON route's auth check works differently from the FormData routes' redirect-based check, as designed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI

### Overview

Opponent CRUD components adapted from S-01's team components, plus the new matrix grid.

### Changes Required:

#### 1. Create-opponent form

**File**: `src/components/opponent/CreateOpponentForm.tsx` (new)

**Intent**: Adapted from `src/components/team/CreateTeamForm.tsx` — same 5-default-fields/add/remove/client-side-dedupe shape, posting to `/api/opponents` instead of `/api/teams`.

**Contract**: Same as `CreateTeamForm`'s Contract, with the form `action` and field semantics changed to opponent/army-name terms.

#### 2. Opponents list

**File**: `src/components/opponent/OpponentsList.tsx` (new)

**Intent**: List all of the captain's opponents (name + army count) with links to each detail page, and an entry point to `CreateOpponentForm`.

**Contract**: Renders `getOpponentsWithArmies`'s result as a linked list; renders `CreateOpponentForm` inline or via a toggle when the captain has no opponents yet or wants to add another (unlike S-01's single-team branch, this page always shows the list AND the ability to add more, since multiple opponents are expected).

#### 3. Opponent detail + roster view

**File**: `src/components/opponent/OpponentDetail.tsx` (new)

**Intent**: Adapted from `src/components/team/TeamView.tsx` — opponent name + roster + one-field add-army mini-form posting to `/api/opponents/armies` (including the hidden `opponent_id` field) — plus renders `MatrixGrid` below the roster.

**Contract**: Same roster-list/add-army shape as `TeamView`, with `MatrixGrid` composed in as a child, passed the opponent's ID and the grid data from `getMatrixGrid`.

#### 4. Matrix grid

**File**: `src/components/matrix/MatrixGrid.tsx` (new)

**Intent**: The core new UI — our armies (rows) × opponent's armies (columns), each cell a 5-color swatch picker, legend showing what each color means, auto-save via `fetch("/api/matrix")` on pick.

**Contract**: Renders a `<table>` (horizontally scrollable container on narrow viewports), row headers = our army names, column headers = opponent's army names, each cell showing either 5 small color-swatch buttons (unestimated cell — matches the confirmed "empty placeholder + click to pick" decision) or the currently-picked color as a single swatch that re-opens the picker on click (estimated cell, supporting FR-006 edit via the same `POST /api/matrix` call). A legend row/panel above the table lists all 5 bands with their point ranges (per the confirmed decision to show it). Each pick triggers `fetch("/api/matrix", { method: "POST", body: JSON.stringify({...}) })`; on non-`ok` response, show a brief inline error near that cell (not a page-level banner) and leave the cell in its prior state.

#### 5. Pages

**File**: `src/pages/dashboard/opponents/index.astro` (new)

**Intent**: List page — server-side calls `getOpponentsWithArmies`, renders `OpponentsList`.

**Contract**: Same page-wiring shape as `team.astro` (Layout, `error` query param, `client:load`), but always renders the list component rather than branching between two different components.

**File**: `src/pages/dashboard/opponents/[id].astro` (new)

**Intent**: Detail page — server-side calls `getOpponentWithArmies` and `getMatrixGrid`, renders `OpponentDetail`.

**Contract**: Dynamic route (no `getStaticPaths` needed, per Key Discoveries); if the opponent isn't found or isn't owned by the current captain (RLS-scoped query returns null), redirect to `/dashboard/opponents`.

#### 6. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Add a second link alongside the existing "Manage your team" one.

**Contract**: One more `<a href="/dashboard/opponents">` addition, no structural change.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- As a logged-in captain with a team already created (from S-01), visiting `/dashboard/opponents` shows an empty list plus the create-opponent form
- Creating an opponent with a name and 3 filled army fields lands on that opponent's detail page showing its roster and the matrix grid (our armies × their 3 armies)
- Clicking an empty grid cell shows the 5-color legend/picker; picking a color saves immediately (no page reload) and the cell shows that color
- Reloading the page shows the same picks still present
- Clicking an already-picked cell and choosing a different color updates it (no duplicate row — confirm in Supabase Studio that `pairing_matrix_estimates` has exactly one row per army pair, not two)
- Creating a second opponent and visiting its detail page shows an independent, empty grid (no cross-contamination between opponents)
- Adding a new army to an existing opponent via the mini-form adds a new column to that opponent's grid
- In Supabase Studio, all created `opponents`/`opponent_armies`/`pairing_matrix_estimates` rows have `captain_id` matching the logged-in user
- `dashboard.astro` now links to `/dashboard/opponents`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test framework configured in this repo (consistent with F-01/S-01).

### Integration Tests:

- None — manual verification only, per project convention.

### Manual Testing Steps:

1. Sign in (captain already has a team from S-01 testing), visit `/dashboard/opponents` — confirm empty list + create form.
2. Create an opponent with a name and 2-3 armies; confirm redirect to its detail page with the correct roster and an empty grid sized to (our armies) × (their armies).
3. Pick colors for several cells; confirm each saves without a page reload and persists across a manual reload.
4. Change an already-picked cell to a different color; confirm it updates in place (single row per pair in Supabase Studio).
5. Create a second opponent; confirm its grid is independent and empty.
6. Add a new army to the first opponent via its mini-form; confirm the grid gains a column.
7. Confirm the color legend is visible and matches the confirmed palette (red 0-3 / orange 4-8 / yellow 9-11 / green 12-15 / dark-green 16-20).

## Performance Considerations

At this project's target scale (small user count, low QPS per `prd.md`), a full grid fetched in one query per page load is appropriate — no pagination, no lazy-loading, no virtualization needed even for a roster larger than 5 per side (FR-016, parked, would only matter at a scale this app doesn't target).

## Migration Notes

No schema changes — this slice is pure application code on top of F-01's already-migrated, already-in-production tables.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-02
- PRD: `context/foundation/prd.md` — FR-003, FR-004, FR-005, FR-006
- Prior slice (pattern source): `context/archive/2026-09-06-create-team-roster/plan.md` (S-01, archived)
- Schema: `context/archive/2026-09-04-schema-teams-opponents-matrix/plan.md` (F-01, archived)
- Domain source (superseded boundaries): `pairing-process-worksheet.md` §4

## Addendum: purple estimate marker (2026-09-07, mid-Phase-3)

Confirmed with the user during Phase 3 manual verification: a matrix cell needs a 6th pick, "purple," for a matchup deliberately judged too unpredictable to call — distinct from a blank/unestimated cell ("not yet assessed"). This reinstates and supersedes part of FR-004's 2026-09-06 reversal, which had folded "unpredictable" into "leave the pair unestimated" (see updated `prd.md` FR-004 Socratic note and `shape-notes.md`).

This is a genuine, if small, schema change on top of F-01's already-production-migrated tables (the "No schema changes" line under Migration Notes above no longer holds):

- New migration `supabase/migrations/20260907190708_add_purple_estimate_marker.sql`: `pairing_matrix_estimates.score` becomes nullable, adds `is_purple boolean not null default false`, plus a CHECK enforcing exactly one of `{score set, is_purple true}`. Applied and verified locally via `supabase db reset`; **not yet pushed to production** — that push needs the same explicit human-gated step F-01's Phase 4 used, not an automated one.
- `src/lib/colorBands.ts` gains `Estimate = ColorBand | "purple"`, used in place of `ColorBand` by `src/lib/matrix.ts` (`getMatrixGrid`, `upsertEstimate`), `src/pages/api/matrix.ts`'s body validation, and `MatrixGrid.tsx`'s picker/legend (purple placed last, visually separated by a divider, per user confirmation).
- Regenerated `src/db/database.types.ts` via `npm run db:types` to pick up the new column/nullability.

Also: to get past an `astro-eslint-parser` + `@typescript-eslint/no-misused-promises` crash on any top-level `return <expr>;` in `.astro` frontmatter (reproduces even on `return 5;` — not specific to `Astro.redirect`), that rule is now disabled for `.astro` files in `eslint.config.js`, with a comment explaining why.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 `npm run lint` passes with the new/changed files — 2ba250c

### Phase 2: API routes

#### Automated

- [x] 2.1 `npm run lint` passes — 3142457

#### Manual

- [x] 2.2 Unauthenticated POST to `/api/matrix` returns 401 JSON, not a redirect — 3142457

### Phase 3: UI

#### Automated

- [x] 3.1 `npm run lint` passes — 367081c

#### Manual

- [x] 3.2 Opponents list + create form shown for a captain with no opponents yet — 367081c
- [x] 3.3 Creating an opponent lands on its detail page with correct roster and sized-correctly empty grid — 367081c
- [x] 3.4 Picking a cell color saves without page reload and persists across reload — 367081c
- [x] 3.5 Changing an already-picked cell updates in place (single row, not duplicated) — 367081c
- [x] 3.6 Second opponent has an independent, empty grid — 367081c
- [x] 3.7 Adding an army to an existing opponent adds a grid column — 367081c
- [x] 3.8 Supabase Studio rows have the correct `captain_id` — 367081c
- [x] 3.9 `dashboard.astro` links to `/dashboard/opponents` — 367081c
- [x] 3.10 Picking purple on a cell saves and persists across reload, visually distinct from both a scored cell and a blank/unestimated cell — 367081c
- [x] 3.11 In Supabase Studio, a purple pick has `score = null`, `is_purple = true`; a scored pick has `is_purple = false` and a non-null score — 367081c
