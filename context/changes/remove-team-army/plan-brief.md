# Remove Army From Roster — Plan Brief

> Full plan: `context/changes/remove-team-army/plan.md`

## What & Why

Let a captain remove an army from their team roster or from an opponent's roster, with an inline confirmation naming exactly how many previously-entered pairing-matrix estimates would be lost. Roadmap slice S-04, backed by PRD FR-017 (team-side) and the newly-added FR-019 (opponent-side).

## Starting Point

`teams.ts`/`opponents.ts` can create and list rosters but have no delete function. `pairing_matrix_estimates` rows already cascade-delete when their army is removed (F-01 schema) — which is exactly why removal without warning would silently violate the PRD's "no loss of previously entered estimates" guardrail.

## Desired End State

Each army row on `/dashboard/team` and an opponent's detail page gets a trash-can icon. Clicking it expands an inline "Remove `<army>`? This will also delete `<N>` estimate(s). [Confirm] [Cancel]" row, with the real count pre-fetched — no loading flicker. Confirm removes it (and its estimates, via cascade); Cancel does nothing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Confirmation UX | Inline two-step (click → confirm/cancel in place) | Fully styled, no native-dialog inconsistency, no new modal infrastructure needed | Plan |
| Route design | `POST` FormData→redirect, two routes (one per side) | Matches every existing route in this app — zero new pattern | Plan |
| Minimum roster size | No floor — can remove down to 0 | Matches the app's existing stance of not hard-coding roster-size assumptions | Plan |
| Confirmation detail | Exact total count across all opponents | Directly satisfies FR-017/FR-019's wording, one query | Plan |
| Count data source | Pre-fetched server-side with the roster | No new endpoint; confirm text appears instantly | Plan |
| Zero-count behavior | Always show the confirm step, even at count 0 | One consistent code path; removal is destructive regardless of count | Plan |
| Remove-button placement | Inline icon per army row | Matches the existing remove-field pattern from `CreateTeamForm`/`CreateOpponentForm` | Plan |
| Scope | Both team-side AND opponent-side (widened from roadmap's team-only) | User explicitly asked to close the gap S-02 had deferred, in this same slice | Plan |

## Scope

**In scope:**
- Removing one army at a time from a team roster or an opponent's roster
- Inline confirm showing the real estimate count before removal
- New PRD FR-019 + roadmap update to cover the widened opponent-side scope

**Out of scope:**
- Removing an entire team or opponent (only individual armies)
- Undo / removal history
- Batch/multi-select removal
- Any change related to S-05's roster-size cap

## Architecture / Approach

Three phases mirroring S-01/S-02's proven shape, doubled for team+opponent symmetry: data layer (remove + batched-count functions on both `teams.ts` and `opponents.ts`), API routes (two FormData→redirect routes), UI (inline two-step confirm on both roster components, counts pre-fetched at the page level).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `removeArmyFromTeam`/`removeArmyFromOpponent` + batched count functions | Low — both tables carry `captain_id` directly, so no cross-table ownership check needed (unlike `matrix.ts`) |
| 2. API routes | Two new FormData→redirect routes | Low — exact mirror of existing route shape |
| 3. UI | Inline confirm on both roster views + pre-fetched counts | Medium — the only genuinely new interaction pattern in this slice; needs careful manual verification of the cascade-delete count matching reality |

**Prerequisites:** S-01 (team roster), S-02 (opponent roster + matrix estimates to actually have something to lose)
**Estimated effort:** ~1 session across 3 phases, similar size to S-01

## Open Risks & Assumptions

- Assumes roster sizes stay small (≤5 per FR-018) — the in-memory count-grouping approach wouldn't scale past that, but nothing in this app's scope needs it to.
- The "silent no-op on a stale/tampered army ID" behavior (Critical Implementation Details in the full plan) is a deliberate simplification, not an oversight — flagged here so it isn't mistaken for a missed error case during review.

## Success Criteria (Summary)

- A captain can remove an army from either roster and see the correct estimate-loss count before confirming
- Cascade-deleted estimates are verifiably gone from Supabase after removal
- Cancel is a true no-op — no request, no data change
