# Cap Roster Size — Plan Brief

> Full plan: `context/changes/cap-roster-size/plan.md`

## What & Why

Cap both a captain's team roster and each opponent's roster at 5 armies, per PRD FR-018. Roadmap slice S-05, raised after S-02 shipped opponent-matrix prep with no upper bound on either roster.

## Starting Point

`createTeamWithArmies`/`addArmyToTeam` and `createOpponentWithArmies`/`addArmyToOpponent` accept any number of armies today. Both create forms have an uncapped "Add army" button; both roster views' single-army add-form has no cap awareness either.

## Desired End State

A captain can never exceed 5 armies on either roster. The "Add army" button in both create forms disappears at 5 fields (with a "(N/5)" counter); once a roster hits 5, its add-army mini-form is replaced by "Roster full (5/5)".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cap value | Hardcoded 5, not captain-configurable | User raised the configurable-size idea (PRD FR-016) mid-planning, then explicitly deferred it — this slice stays FR-018 as written | Plan |
| Create-form UX | Disable/hide "Add army" at 5 fields | Prevents the captain from ever attempting to exceed the cap client-side | Plan |
| Add-one UX | Hide the mini-form, show "Roster full (5/5)" at cap | Immediately clear why adding is blocked, no dead-end submit | Plan |
| DB enforcement | Application-layer only | Matches S-01's "one team per captain" precedent — also app-layer-only | Plan |
| Counter | Show a live "N/5" counter | Proactive feedback before the captain even tries to add a 6th | Plan |
| Error typing | Reuse the existing `TeamsError` "unknown" variant | Zero route changes — the message flows through the existing generic fallback | Plan |
| Cap check placement | Inside the lib layer, re-querying the count | Matches `matrix.ts`'s `upsertEstimate` precedent of re-deriving invariant state rather than trusting caller-supplied data | Plan |

## Scope

**In scope:**
- A hardcoded 5-army cap on both team and opponent rosters
- Client-side prevention (disabled button, "Roster full" message, counter) in both create forms and both roster views
- Server-side enforcement as the source of truth, reusing the existing error type

**Out of scope:**
- Captain-configurable roster size (PRD FR-016, parked)
- Database-level enforcement (CHECK constraint / trigger)
- S-03 (live match-mode) validation — a forward-looking note only, recorded on S-03's roadmap entry

## Architecture / Approach

A shared `MAX_ROSTER_SIZE = 5` constant in a new `src/lib/rosterLimits.ts`, consumed by both `teams.ts`/`opponents.ts` (server-side enforcement, checked before every insert) and the four UI components (client-side prevention + counter display).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | Cap checks in `teams.ts`/`opponents.ts`, both batch-create and incremental-add paths | Low — validation-only, no schema change, reuses existing error type |
| 2. UI | Capped "Add army" buttons + counters in both create forms; "Roster full" state in both roster views | Low — client-side mirror of already-implemented server logic |

**Prerequisites:** S-01 (team roster), S-02 (opponent roster) — both already archived
**Estimated effort:** ~1 session across 2 phases, smaller than S-04

## Open Risks & Assumptions

- Assumes 5 stays the right number for the life of this MVP — if FR-016 (configurable size) ever gets picked up, this hardcoded constant becomes the default rather than the ceiling, requiring `teams.ts`/`opponents.ts`'s checks to read from a per-team value instead. Not a blocker now, just the seam future work would need.

## Success Criteria (Summary)

- Neither roster can exceed 5 armies, client-side or server-side
- The cap is visible before it's hit (counter) and clear when it's hit (Roster full / disabled button)
- Removing an army (S-04) correctly frees a slot on both sides
