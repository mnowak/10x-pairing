# Remove Army From Roster Implementation Plan

## Overview

Let a captain remove an army from either their own team roster or an opponent's roster, with an inline confirmation naming exactly how many previously-entered pairing-matrix estimates involving that army would be lost. This is roadmap item **S-04**, backed by PRD FR-017 (team-side) and FR-019 (opponent-side, added this session — S-02's plan had explicitly deferred opponent-side removal as a separate gap, now closed).

## Current State Analysis

- `src/lib/teams.ts` exports `getTeamWithArmies`, `createTeamWithArmies`, `addArmyToTeam` — no delete function exists.
- `src/lib/opponents.ts` exports the mirror set for opponents — same gap.
- F-01's schema gives both `team_armies` and `opponent_armies` their own `captain_id uuid not null default auth.uid()` column with a uniform RLS policy (`for all using (auth.uid() = captain_id) with check (...)`). This means deleting an army row needs no cross-table ownership check (unlike `matrix.ts`'s `upsertEstimate`, which has to verify army IDs against a *different* table) — a direct `.eq("id", armyId).eq("captain_id", captainId)` delete is fully RLS-scoped on its own.
- `pairing_matrix_estimates.team_army_id` and `.opponent_army_id` are both `references ... on delete cascade` — removing an army automatically deletes every matrix estimate that referenced it. This cascade is exactly why FR-017/FR-019's confirmation step is a hard requirement, not a nicety: without it, a captain could silently lose real prepared estimates.
- `TeamView.tsx` and `OpponentDetail.tsx` currently render rosters as plain `<li>` lists with no per-item actions.
- No route in this app uses HTTP `DELETE` — every existing route is `POST` (FormData→redirect for page actions, one JSON route for the matrix auto-save).

## Desired End State

On both `/dashboard/team` and an opponent's detail page, each army in the roster has a small remove (trash-can) icon. Clicking it expands an inline confirm row in place — "Remove `<army>`? This will also delete `<N>` previously-entered estimate(s)." with Confirm/Cancel — using the exact count, pre-fetched with the page load, not a placeholder. Confirming submits a real form POST; the roster page reloads showing the army gone (and, if it had estimates, those rows are gone from Supabase too, via cascade). Cancel collapses the row with no request made.

Verification: `npm run lint` and `npx astro check` pass; manually remove an army with zero estimates (immediate cascade, count shows 0) and one with existing estimates (count matches, confirm in Supabase Studio the `pairing_matrix_estimates` rows are gone after removal), on both the team side and an opponent's side; confirm Cancel leaves everything untouched.

### Key Discoveries:

- `src/lib/teams.ts:20-40`'s `getTeamWithArmies` and `src/lib/opponents.ts`'s equivalents are the direct precedent for how this plan's new count-fetch functions should read data (typed Supabase client, `captain_id`-scoped queries).
- `src/components/team/CreateTeamForm.tsx` and `CreateOpponentForm.tsx` already have a "remove field" icon-button pattern (used during roster creation, not after) — this plan's inline remove button reuses that same visual language, applied post-creation instead.
- `src/pages/dashboard/opponents/[id].astro` already fetches both `opponent` and `matrixGrid` before render (post impl-review fix) — this plan adds one more pre-fetch (estimate counts) to the same page, following the same try/catch-and-redirect-on-error shape.

## What We're NOT Doing

- No removing a team or an opponent entirely — only individual armies from an existing roster (matches FR-017/FR-019 exactly).
- No undo for a removal — PRD's "no loss of previously entered estimates" means never losing a *saved* estimate silently (hence the confirmation), not preserving a removal history.
- No batch/multi-select removal — one army at a time via the inline confirm, matching the roster's typically-small size (≤5 per FR-018).
- No live sync between an open second tab and a removal made elsewhere — standard page-reload staleness is acceptable, matching this app's existing no-websocket architecture.
- No changes related to S-05's roster-size cap (still a separate, unplanned slice).

## Implementation Approach

Three phases, following S-01/S-02's proven shape, doubled for team+opponent symmetry: a data layer (remove + count functions for both `teams.ts` and `opponents.ts`), then two mirrored API routes (FormData→redirect, matching every existing route), then UI (the inline two-step confirm on both roster views, with pre-fetched counts).

## Critical Implementation Details

- **Count fetching must be a single batched query per page load, not N+1.** `getEstimateCountsForTeamArmies`/`getEstimateCountsForOpponentArmies` take the full list of army IDs already on the page and return one `Record<armyId, count>` from a single `.in(...)` query, grouped in application code (small roster sizes make in-memory grouping fine at this project's scale — consistent with `getMatrixGrid`'s existing approach).
- **Deleting an army that doesn't belong to the caller (stale form, tampered ID) is a silent no-op, not an error.** RLS's `captain_id` scoping means the delete just affects 0 rows; the route still redirects as if it succeeded. This matches this app's existing tolerance for idempotent-ish delete semantics and avoids a special-case error path for an edge case that can't happen through the normal UI.

## Phase 1: Data layer

### Overview

Add remove-army and batch-count-estimates functions to both `teams.ts` and `opponents.ts`, following their existing shape.

### Changes Required:

#### 1. Team-side removal + counts

**File**: `src/lib/teams.ts` (modified)

**Intent**: Let a captain delete one of their own team armies, and fetch estimate counts for a set of team armies in one query (for the pre-fetched confirm text).

**Contract**: Two new functions:
- `removeArmyFromTeam(supabase, captainId, teamArmyId)` — deletes from `team_armies` filtered by `id` and `captain_id`. Returns `{ ok: true }` or `{ ok: false, error: string }`.
- `getEstimateCountsForTeamArmies(supabase, captainId, teamArmyIds: string[])` — one `captain_id`-scoped, `.in("team_army_id", teamArmyIds)` select against `pairing_matrix_estimates`, grouped into `Record<string, number>` keyed by `team_army_id`. Returns `{}` immediately for an empty input array (no query).

#### 2. Opponent-side removal + counts

**File**: `src/lib/opponents.ts` (modified)

**Intent**: Mirrors the team-side functions exactly, for `opponent_armies`.

**Contract**: Two new functions, same shapes as above: `removeArmyFromOpponent(supabase, captainId, opponentArmyId)` and `getEstimateCountsForOpponentArmies(supabase, captainId, opponentArmyIds: string[])` (grouped by `opponent_army_id`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new/changed files

#### Manual Verification:

- None specific to this phase — verified indirectly through Phase 3's manual checks, since this phase has no UI or routes of its own

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API routes

### Overview

Two new FormData→redirect routes, one per side, matching every existing route's shape in this app.

### Changes Required:

#### 1. Remove team army route

**File**: `src/pages/api/teams/armies/remove.ts` (new)

**Intent**: The remove action for a team army.

**Contract**: `POST` only, explicit `context.locals.user` check, reads `form.get("team_army_id")`, calls `removeArmyFromTeam`, redirects to `/dashboard/team` on success or `/dashboard/team?error=` on a real DB error (not on the silent-no-op case described in Critical Implementation Details, which redirects the same as success).

#### 2. Remove opponent army route

**File**: `src/pages/api/opponents/armies/remove.ts` (new)

**Intent**: The remove action for an opponent army.

**Contract**: `POST` only, same auth-check pattern, reads `form.get("opponent_id")` + `form.get("opponent_army_id")`, calls `removeArmyFromOpponent`, redirects to `/dashboard/opponents/<opponent_id>` on success or with `?error=` on a real DB error.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- None specific to this phase — verified indirectly through Phase 3's manual checks (these are page-navigating FormData routes with no independent JSON contract to curl-test, matching S-01's Phase 2 precedent)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI

### Overview

Inline two-step remove confirmation on both `TeamView.tsx` and `OpponentDetail.tsx`, with counts pre-fetched server-side.

### Changes Required:

#### 1. Team roster remove UI

**File**: `src/components/team/TeamView.tsx` (modified)

**Intent**: Add a remove affordance to each army row, following the existing per-field remove-icon visual language from `CreateTeamForm.tsx`.

**Contract**: New `estimateCounts: Record<string, number>` prop. Each army row gets a trash-can icon button. Clicking it sets local state (`confirmingArmyId`) to that army's ID, which swaps the row's content for "Remove `<name>`? This will also delete `<estimateCounts[army.id] ?? 0>` previously-entered estimate(s). [Confirm] [Cancel]" — Confirm is a real `<form method="POST" action="/api/teams/armies/remove">` with a hidden `team_army_id` field; Cancel just resets `confirmingArmyId` to `null`, no request.

#### 2. Opponent roster remove UI

**File**: `src/components/opponent/OpponentDetail.tsx` (modified)

**Intent**: Mirrors `TeamView.tsx`'s new remove UI exactly, for the opponent's roster.

**Contract**: Same shape as above, with a new `estimateCounts: Record<string, number>` prop, form posting to `/api/opponents/armies/remove` with hidden `opponent_id` + `opponent_army_id` fields.

#### 3. Pages: pre-fetch counts

**File**: `src/pages/dashboard/team.astro` (modified)

**Intent**: Fetch estimate counts alongside the roster so `TeamView` renders with real numbers from the first paint.

**Contract**: After `getTeamWithArmies` succeeds, call `getEstimateCountsForTeamArmies(supabase, user.id, team.armies.map(a => a.id))` and pass the result as `TeamView`'s new `estimateCounts` prop.

**File**: `src/pages/dashboard/opponents/[id].astro` (modified)

**Intent**: Mirrors the team page's change, for the opponent's roster.

**Contract**: After the existing `opponent` fetch succeeds, call `getEstimateCountsForOpponentArmies(supabase, user.id, opponent.armies.map(a => a.id))` and pass the result as `OpponentDetail`'s new `estimateCounts` prop. Wrap in the same try/catch-and-redirect-to-list pattern already used for this page's other data fetches.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- On `/dashboard/team`, an army with zero associated estimates shows "This will also delete 0 previously-entered estimate(s)" (or equivalent zero-count phrasing) in the confirm row
- Removing an army that has existing pairing-matrix estimates (create some via an opponent's matrix first) shows the correct non-zero count, and after confirming, those `pairing_matrix_estimates` rows are gone in Supabase Studio
- Clicking Cancel on the inline confirm leaves the roster and all estimates untouched — no request sent
- The same three checks pass on an opponent's detail page (`/dashboard/opponents/<id>`) for opponent-side removal
- Removing the last remaining army (team or opponent side) succeeds, leaving an empty roster (no minimum-size floor enforced, per confirmed scope)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test framework configured in this repo (consistent with F-01/S-01/S-02).

### Integration Tests:

- None — manual verification only, per project convention.

### Manual Testing Steps:

1. On `/dashboard/team`, click remove on an army with no matrix estimates; confirm the inline row shows a 0 count, confirm removal, army disappears.
2. Add an army, use it in an opponent's matrix (pick a color for at least one cell), then remove it from the team; confirm the inline count matches the number of matrix cells picked, confirm removal, and check Supabase Studio that the corresponding `pairing_matrix_estimates` rows are gone.
3. Repeat both checks on an opponent's roster via its detail page, using `/api/opponents/armies/remove`.
4. Click remove then Cancel on either side; confirm nothing changes and no network request fires.
5. Remove every army from a team (or an opponent) down to zero; confirm the app doesn't block this and the roster just shows empty.

## Performance Considerations

At this project's target scale, one batched count query per page load (rather than one per army) is sufficient — no need for pagination or caching.

## Migration Notes

No schema changes — this slice is pure application code on top of F-01's already-migrated tables and their existing `on delete cascade` foreign keys.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-04
- PRD: `context/foundation/prd.md` — FR-017, FR-019
- Prior slices (pattern source): `context/archive/2026-09-06-create-team-roster/plan.md` (S-01), `context/archive/2026-09-07-prepare-opponent-matrix/plan.md` (S-02)
- Schema: `context/archive/2026-09-04-schema-teams-opponents-matrix/plan.md` (F-01)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 `npm run lint` passes with the new/changed files — a2d95fe

### Phase 2: API routes

#### Automated

- [x] 2.1 `npm run lint` passes — 92cebcc

### Phase 3: UI

#### Automated

- [x] 3.1 `npm run lint` passes — 84065b2
- [x] 3.2 `npx astro check` passes — 84065b2

#### Manual

- [x] 3.3 Zero-estimate army shows a 0 count in the confirm row on the team side — 84065b2
- [x] 3.4 Non-zero-estimate army shows the correct count on the team side, and removal cascades in Supabase Studio — 84065b2
- [x] 3.5 Cancel leaves everything untouched, no request sent — 84065b2
- [x] 3.6 The same three checks (3.3-3.5) pass on an opponent's roster — 84065b2
- [x] 3.7 Removing the last remaining army on either side succeeds, leaving an empty roster — 84065b2
