# Cap Roster Size Implementation Plan

## Overview

Cap both a captain's team roster and each opponent's roster at 5 armies (PRD FR-018), enforced at the application layer with client-side prevention. This is roadmap item **S-05**.

## Current State Analysis

- `createTeamWithArmies`/`addArmyToTeam` (`src/lib/teams.ts`) and `createOpponentWithArmies`/`addArmyToOpponent` (`src/lib/opponents.ts`) have no upper bound today — a captain can add unlimited armies to either roster.
- `CreateTeamForm.tsx`/`CreateOpponentForm.tsx` both have an uncapped "Add army" button (`DEFAULT_ARMY_FIELDS = 5` is only the *starting* count, not a ceiling).
- `TeamView.tsx`/`OpponentDetail.tsx`'s existing single-army "add" mini-form has no awareness of roster size either.
- The existing `TeamsError` type (`{type:"duplicate_army", name}` or `{type:"unknown", message}`) already has a generic fallback message path in both `teams/armies.ts` and `opponents/armies.ts` — a roster-full rejection can reuse the `"unknown"` variant with zero route changes.
- Both `teams/armies.ts` and `opponents/armies.ts` already fetch the full roster (`team`/`opponent` with `.armies`) before calling the add function, but the cap check lives in the lib layer (not the route), matching this app's established precedent of re-deriving invariant-critical state internally (`matrix.ts`'s `upsertEstimate` re-verifies ownership rather than trusting caller-supplied state) rather than trusting a count the caller happens to already have.

## Desired End State

A captain can never end up with more than 5 armies on their team or on any one opponent's roster. In the create-team/create-opponent forms, the "Add army" button disappears once 5 fields are showing, with a "(N/5)" counter next to the "Armies" label. On the team page or an opponent's detail page, once the roster already has 5 armies, the single-army "add" mini-form is replaced by a "Roster full (5/5)" message.

Verification: `npm run lint` and `npx astro check` pass; manually confirm the "Add army" button in both create forms disappears at 5 fields; manually confirm both roster views show "Roster full (5/5)" instead of the add-form once at 5 armies, and that removing an army (S-04) brings the add-form back.

### Key Discoveries:

- `src/lib/matrix.ts:64-88`'s `upsertEstimate` is this codebase's precedent for re-deriving invariant-critical state server-side rather than trusting a value the caller already has in hand — the same principle applies here: the cap check queries the current count itself rather than accepting a count parameter from the route.
- `src/components/team/CreateTeamForm.tsx:27-29`'s `addArmyField` and `src/components/opponent/CreateOpponentForm.tsx:27-29` are the exact functions that need the cap guard.
- `src/components/team/TeamView.tsx` and `src/components/opponent/OpponentDetail.tsx` both already know their roster's current army count (`team.armies.length` / `opponent.armies.length`) with no new query needed for the "Roster full" swap or the counter.

## What We're NOT Doing

- No captain-configurable roster size — that's PRD FR-016 (parked, nice-to-have), explicitly raised and deferred during planning. The cap stays a hardcoded `5` for this slice.
- No database-level enforcement (CHECK constraint or trigger) — application-layer only, matching S-01's "one team per captain" precedent (also app-layer-only, no DB constraint).
- No changes to S-03 (live match-mode) — it doesn't exist yet. A forward-looking note (both sides must have exactly 5 armies before a live session starts) is recorded on S-03's roadmap entry as documentation, not implemented here.
- No changes to the removal flow (S-04) — removing an army naturally frees a slot; no special-casing needed since the cap check just re-reads the current count each time.

## Implementation Approach

Two phases: a data layer (shared constant + cap checks in both lib modules, on both the batch-create and incremental-add paths), then UI (both create forms cap their "Add army" button and show a counter; both roster views swap the add-mini-form for a "Roster full" message at cap).

## Phase 1: Data layer

### Overview

A shared `MAX_ROSTER_SIZE` constant, plus cap checks on all four army-adding functions across `teams.ts` and `opponents.ts`.

### Changes Required:

#### 1. Shared roster-size constant

**File**: `src/lib/rosterLimits.ts` (new)

**Intent**: Single source of truth for the cap, used by both lib modules and the UI (button-disable threshold, counter display).

**Contract**: Exports `MAX_ROSTER_SIZE = 5`.

#### 2. Team-side cap checks

**File**: `src/lib/teams.ts` (modified)

**Intent**: Enforce the cap on both team-creation (batch) and single-army-add (incremental) paths.

**Contract**:
- `createTeamWithArmies` — before inserting the team row, if `armyNames.length > MAX_ROSTER_SIZE`, return `{ error: { type: "unknown", message: "A team can have at most 5 armies" } }` without creating anything (no orphaned team row on rejection).
- `addArmyToTeam` — before inserting, query the current count of `team_armies` rows for `teamId`; if already `>= MAX_ROSTER_SIZE`, return `{ error: { type: "unknown", message: "Your roster already has 5 armies — the maximum" } }` without inserting.

#### 3. Opponent-side cap checks

**File**: `src/lib/opponents.ts` (modified)

**Intent**: Mirrors the team-side checks exactly.

**Contract**: Same two checks on `createOpponentWithArmies` and `addArmyToOpponent`, same error messages (adjusted for "roster"/"that roster" phrasing already used by the existing duplicate-army messages in this file).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new/changed files

#### Manual Verification:

- None specific to this phase — verified indirectly through Phase 2's manual checks, since this phase has no UI of its own

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: UI

### Overview

Client-side cap prevention and a "(N/5)" counter across both create forms and both roster views.

### Changes Required:

#### 1. Create-team form cap

**File**: `src/components/team/CreateTeamForm.tsx` (modified)

**Intent**: Prevent adding a 6th field; show progress toward the cap.

**Contract**: `addArmyField` only appends a new field when `armies.length < MAX_ROSTER_SIZE`; the "Add army" button is not rendered once `armies.length >= MAX_ROSTER_SIZE`; the "Armies" label shows the current count, e.g. "Armies (3/5)".

#### 2. Create-opponent form cap

**File**: `src/components/opponent/CreateOpponentForm.tsx` (modified)

**Intent**: Mirrors `CreateTeamForm.tsx`'s change exactly.

**Contract**: Same as above.

#### 3. Team roster-full state

**File**: `src/components/team/TeamView.tsx` (modified)

**Intent**: Replace the add-one mini-form with a clear "at cap" message once the team already has 5 armies; show the same counter.

**Contract**: Near the roster heading, show "(N/5) armies". If `team.armies.length >= MAX_ROSTER_SIZE`, render a "Roster full (5/5)" message in place of the existing add-army form; otherwise render the form unchanged.

#### 4. Opponent roster-full state

**File**: `src/components/opponent/OpponentDetail.tsx` (modified)

**Intent**: Mirrors `TeamView.tsx`'s change exactly.

**Contract**: Same as above, keyed off `opponent.armies.length`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- In `CreateTeamForm`, adding fields up to 5 hides the "Add army" button; the counter reads "(5/5)"
- Submitting a team with 5 armies succeeds; the roster page then shows "Roster full (5/5)" instead of the add-army mini-form
- Attempting to add a 6th army via the (now-hidden, but reachable via a direct POST) route still gets rejected server-side with a clear message
- The same three checks pass for `CreateOpponentForm`/`OpponentDetail`
- Removing an army (via S-04's remove flow) down to 4 brings back the add-army mini-form and updates the counter to "(4/5)", on both team and opponent sides

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test framework configured in this repo (consistent with F-01/S-01/S-02/S-04).

### Integration Tests:

- None — manual verification only, per project convention.

### Manual Testing Steps:

1. Create a team with 5 filled army fields; confirm the "Add army" button disappeared once the 5th field was added.
2. On the team page, confirm the add-army mini-form is replaced by "Roster full (5/5)".
3. Remove one army (S-04); confirm the mini-form reappears and the counter reads "(4/5)".
4. Add an army back via the mini-form; confirm it's rejected once the roster is back at 5.
5. Repeat steps 1-4 for an opponent's roster via `CreateOpponentForm`/`OpponentDetail`.

## Migration Notes

No schema changes — application-layer validation only, on top of F-01's existing tables.

**Forward-looking note (not implemented here):** once S-03 (live match-mode) exists, entering live match-mode should validate that both the team and the selected opponent have exactly 5 armies before starting a session — recorded as a new Unknown on S-03's roadmap entry during this plan.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-05
- PRD: `context/foundation/prd.md` — FR-018 (this slice); FR-016 (parked, explicitly not folded in here)
- Pattern source (invariant re-derivation): `context/archive/2026-09-07-prepare-opponent-matrix/plan.md` (S-02, `matrix.ts`'s `upsertEstimate`)
- Prior slices (roster CRUD pattern source): `context/archive/2026-09-06-create-team-roster/plan.md` (S-01), `context/archive/2026-09-07-remove-team-army/plan.md` (S-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 `npm run lint` passes with the new/changed files — 0309c22

### Phase 2: UI

#### Automated

- [x] 2.1 `npm run lint` passes — dc50f25
- [x] 2.2 `npx astro check` passes — dc50f25

#### Manual

- [x] 2.3 Create-team form hides "Add army" at 5 fields, counter reads "(5/5)" — dc50f25
- [x] 2.4 Team roster page shows "Roster full (5/5)" instead of the add-army mini-form at 5 armies — dc50f25
- [x] 2.5 A direct POST attempting a 6th army is rejected server-side with a clear message — dc50f25
- [x] 2.6 The same three checks (2.3-2.5) pass for an opponent's roster — dc50f25
- [x] 2.7 Removing an army down to 4 (via S-04) brings back the mini-form and updates the counter on both team and opponent sides — dc50f25
