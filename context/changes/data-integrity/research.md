---
date: 2026-09-09T18:17:56Z
researcher: Claude Sonnet 5
git_commit: ba2bfddf3239c5569c5bd261a3584ae8b88b5424
branch: main
repository: mnowak/10x-pairing
topic: "Data-integrity coverage — every write path that can delete a pairing-matrix estimate, and whether the removal-confirmation count matches what actually deletes (test-plan.md risks #4, #5)"
tags: [research, codebase, data-integrity, cascade-delete, teams, opponents, matrix, removal-confirmation]
status: complete
last_updated: 2026-09-09
last_updated_by: Claude Sonnet 5
---

# Research: Data-integrity coverage (risks #4, #5)

**Date**: 2026-09-09T18:17:56Z
**Researcher**: Claude Sonnet 5
**Git Commit**: ba2bfddf3239c5569c5bd261a3584ae8b88b5424
**Branch**: main
**Repository**: mnowak/10x-pairing

## Research Question

Enumerate every write path that can delete (directly or via FK cascade) a `pairing_matrix_estimates` row, verify the actual cascade behavior end-to-end, and check whether the removal-confirmation count queries (`getEstimateCountsForTeamArmies` / `getEstimateCountsForOpponentArmies`) are scoped to match exactly what the cascade will delete — surfacing any write path not covered by the existing FR-017/FR-019 confirmation flow. This is test-plan.md's Phase 2 ("Data-integrity coverage"), grounding risks #4 and #5.

## Summary

There are exactly **two reachable production write paths** that can delete a `pairing_matrix_estimates` row — `removeArmyFromTeam` and `removeArmyFromOpponent` — both single-army removals that cascade via foreign key, both already gated by a client-rendered confirmation showing an accurate estimate count. **No path deletes `pairing_matrix_estimates` directly**, and **no production feature deletes a whole `teams` or `opponents` row** (so no way exists today to cascade-wipe a captain's entire matrix in one action) — though the schema and cascade chain fully support it if such a feature is ever added, and nothing would automatically re-apply the same confirmation the current army-level removal already had to be retrofitted with (FR-017 was added after S-01 shipped without it).

The count-query scoping and the cascade's actual delete scoping are **provably consistent** in the current codebase: every `pairing_matrix_estimates` row can only ever carry a `captain_id` equal to its referenced armies' owner, because `upsertEstimate` enforces that ownership check before every write (`src/lib/matrix.ts:88`). So risk #5's "tautological count vs. count" anti-pattern is avoidable — an independently-seeded fixture can genuinely prove count-matches-delete, not just restate the same query twice.

Two real gaps were found, both worth surfacing to whoever plans Phase 2 (not just testing, but a design question):

1. **The removal confirmation is UI-only** — no server-side re-verification of "did the user confirm" exists in either `POST /api/teams/armies/remove` or `POST /api/opponents/armies/remove`. A direct POST bypasses the warning entirely (RLS still prevents cross-captain deletion, so this isn't a security hole — just a silently-skippable warning).
2. **The shown count is a page-load-time snapshot, never refetched before delete** — confirmed and explicitly accepted as a known limitation in the original `remove-team-army` plan, but genuinely reproducible: if more estimates are added for an army after the page loads (e.g. a second tab), clicking "Confirm" deletes more than what was shown.

## Detailed Findings

### Write paths that can delete `pairing_matrix_estimates`

Two production paths, both single-army removal, both cascading via FK — no direct delete of `pairing_matrix_estimates` exists anywhere in the codebase.

**A. `removeArmyFromTeam`** ([src/lib/teams.ts:118-130](src/lib/teams.ts#L118-L130))
```
supabase.from("team_armies").delete().eq("id", teamArmyId).eq("captain_id", captainId)
```
- Triggered by `POST /api/teams/armies/remove` ([src/pages/api/teams/armies/remove.ts:23](src/pages/api/teams/armies/remove.ts#L23))
- Cascades via `pairing_matrix_estimates.team_army_id references team_armies(id) on delete cascade` ([supabase/migrations/20260904185524_create_pairing_domain_schema.sql:46](supabase/migrations/20260904185524_create_pairing_domain_schema.sql#L46))
- Confirmation: UI-only, `src/components/team/TeamView.tsx:18-42`

**B. `removeArmyFromOpponent`** ([src/lib/opponents.ts:125-141](src/lib/opponents.ts#L125-L141))
```
supabase.from("opponent_armies").delete().eq("id", opponentArmyId).eq("captain_id", captainId)
```
- Triggered by `POST /api/opponents/armies/remove` ([src/pages/api/opponents/armies/remove.ts:40](src/pages/api/opponents/armies/remove.ts#L40)), after an ownership check at line 36 (the F1 fix — see Historical Context)
- Cascades via `pairing_matrix_estimates.opponent_army_id references opponent_armies(id) on delete cascade` ([supabase/migrations/20260904185524_create_pairing_domain_schema.sql:47](supabase/migrations/20260904185524_create_pairing_domain_schema.sql#L47))
- Confirmation: UI-only, `src/components/opponent/OpponentDetail.tsx:21-45`

**No team-level or opponent-level deletion feature exists in production.** Confirmed by a full listing of `src/pages/api/**` (10 routes total): `auth/{signin,signout,signup}.ts`, `matrix.ts`, `opponents/{armies,index}.ts`, `opponents/armies/remove.ts`, `teams/{armies,index}.ts`, `teams/armies/remove.ts`. `teams/index.ts` and `opponents/index.ts` are `POST`-only creation endpoints with no delete handler. No account/settings deletion feature exists either — no `auth.admin`/`deleteUser` reference anywhere in `src/`.

The full theoretical cascade chain (`teams`/`opponents` → armies → estimates, and `auth.users` → `teams`/`opponents` → armies → estimates via `captain_id references auth.users(id) on delete cascade`) is only exercised today by **test-only helpers** in `src/lib/testSupport/twoCaptains.ts` (`cleanupTeam:63`, `cleanupOpponent:81`), which are not imported by any production route — they exist purely to clean up integration-test fixtures.

**`pairing_matrix_estimates` is never deleted directly.** Every reference to the table outside a cascade is either a `.select()` (read) or `upsertEstimate`'s upsert ([src/lib/matrix.ts:68-106](src/lib/matrix.ts#L68-L106), used by `POST /api/matrix`) — never a `.delete()`.

### Removal-confirmation count → UI wiring

Both sides mirror each other exactly:

- **Team**: `getEstimateCountsForTeamArmies` ([src/lib/teams.ts:137-161](src/lib/teams.ts#L137-L161)) — one batched query, `.eq("captain_id", captainId).in("team_army_id", teamArmyIds)`, grouped into a `Record<team_army_id, count>` in app code. Called SSR by [src/pages/dashboard/team.astro:18](src/pages/dashboard/team.astro#L18), passed as a prop to `<TeamView estimateCounts={...} />` ([team.astro:40](src/pages/dashboard/team.astro#L40)), rendered at [TeamView.tsx:38-40](src/components/team/TeamView.tsx#L38-L40).
- **Opponent**: `getEstimateCountsForOpponentArmies` ([src/lib/opponents.ts:147-171](src/lib/opponents.ts#L147-L171)), same shape on `opponent_army_id`. Called SSR by [src/pages/dashboard/opponents/[id].astro:41](src/pages/dashboard/opponents/[id].astro#L41), rendered at [OpponentDetail.tsx:41-42](src/components/opponent/OpponentDetail.tsx#L41-L42).

**Confirmation mechanism**: not a native `confirm()` — a custom inline two-step UI. Clicking a trash-icon button sets `confirmingArmyId` React state ([TeamView.tsx:18](src/components/team/TeamView.tsx#L18), [OpponentDetail.tsx:21](src/components/opponent/OpponentDetail.tsx#L21)); the row then swaps to show the count text plus a real `<form method="POST">` with a **Confirm** submit button and a no-op **Cancel** button. The user must click a real submit button, not just see informational text.

### Does the count-query scope match what the cascade actually deletes? — Yes, provably

The count query filters by `captain_id` in addition to the army-id `.in(...)` list; the FK cascade itself is **not** captain-aware (Postgres cascades don't consult RLS). This could in principle diverge — except `pairing_matrix_estimates` rows are only ever created via `upsertEstimate`, which pre-verifies `.eq("captain_id", captainId)` on **both** referenced armies before writing ([src/lib/matrix.ts:85-97](src/lib/matrix.ts#L85-L97), the same ownership check research covered for risk #3 in Phase 1). So no estimate row can exist whose `captain_id` differs from the army it references — the count query's extra `captain_id` filter is provably redundant-but-correct, not a source of mismatch. The count is also correctly batched (one query per page) and correctly indexed per-army in the UI, so no batching-related mismatch exists either.

### Two real gaps found

**1. No server-side confirmation guard.** Neither `POST /api/teams/armies/remove` nor `POST /api/opponents/armies/remove` checks for any "the user confirmed" signal — the confirmation exists only as client React state gating which form is rendered. A direct POST (e.g. via curl, or a stale/forged form) executes the delete with no count ever having been shown. RLS and the explicit `.eq("captain_id", captainId)` filters still make this impossible to use against another captain's data — it's a "skip your own warning" gap, not a security hole. This mirrors risk #3's finding that RLS alone was sufficient for `removeArmyFromOpponent`'s delete-scoping (defense-in-depth question), but here the missing layer isn't ownership — it's the warning itself.

**2. Confirmation count is a stale, page-load-time snapshot.** The count is computed exactly once during SSR (see above) and never refetched — clicking the trash icon or "Confirm" does not re-query. If estimates are added for that same army after the page loaded (a second tab open, or a `bfcache` return without a fresh navigation — the app has no `<ViewTransitions />` in `src/layouts/Layout.astro`, so ordinary in-app navigation is a full reload and not affected), the shown count under-promises the actual impact: the cascade still deletes **every** current estimate for that army, not just the ones counted at page-load time.

This second gap is **explicitly accepted** in the original design, not an oversight: `context/archive/2026-09-07-remove-team-army/plan.md:33` — *"No live sync between an open second tab and a removal made elsewhere — standard page-reload staleness is acceptable, matching this app's existing no-websocket architecture."* The same reasoning was written for a different staleness scenario (a removal made in another tab), but applies identically to new-estimates-added-elsewhere.

## Code References

- `src/lib/teams.ts:118-130` — `removeArmyFromTeam`, the delete call for path A
- `src/lib/teams.ts:137-161` — `getEstimateCountsForTeamArmies`, the count query for path A's confirmation
- `src/lib/opponents.ts:125-141` — `removeArmyFromOpponent`, the delete call for path B
- `src/lib/opponents.ts:147-171` — `getEstimateCountsForOpponentArmies`, the count query for path B's confirmation
- `src/lib/matrix.ts:68-106` — `upsertEstimate`; lines 85-97 are why every estimate's `captain_id` is guaranteed consistent with its referenced armies
- `src/pages/api/teams/armies/remove.ts:23` — route triggering path A, no server-side confirmation guard
- `src/pages/api/opponents/armies/remove.ts:30-40` — route triggering path B; line 36 is the F1 ownership-check fix, line 40 has no server-side confirmation guard either
- `src/pages/dashboard/team.astro:16-23` — SSR count fetch for path A
- `src/pages/dashboard/opponents/[id].astro:39-50` — SSR count fetch for path B
- `src/components/team/TeamView.tsx:18-49` — confirmation UI for path A
- `src/components/opponent/OpponentDetail.tsx:21-45` — confirmation UI for path B
- `src/lib/testSupport/twoCaptains.ts:57-81` — test-only helpers that exercise the *full* cascade chain (`teams`/`opponents` down to estimates), unreachable from any production route
- `supabase/migrations/20260904185524_create_pairing_domain_schema.sql:12-49` — all `on delete cascade` FK definitions

## Architecture Insights

- **Cascade-first data-loss design was known and accepted at schema time**, then partially retrofitted with UI guardrails once a real removal feature shipped without them (F-01 → FR-017 sequence). This is a recurring pattern in this codebase worth naming for Phase 2's plan: *any future feature that deletes a `teams` or `opponents` row (not just an army) inherits the exact same silent-cascade risk FR-017/FR-019 exists to cover, and nothing in the schema or code would force that future feature to add its own confirmation.* If Phase 2's tests pin today's two paths, they should be written so a reviewer immediately notices the pattern needs repeating for any new delete path (this is exactly what test-plan.md's risk #4 "must challenge" column already anticipates: *"Estimates only get lost through the one known removal flow — other future paths could cascade silently too"*).
- **Ownership consistency is enforced once, upstream, and everything downstream can rely on it.** `upsertEstimate`'s pre-write ownership check is the single place that guarantees `pairing_matrix_estimates.captain_id` always matches its referenced armies' captain — this is why the count-query/cascade-scoping question (risk #5) resolves cleanly instead of needing its own defensive filter.
- **Confirmation-as-client-state is this codebase's established pattern** for destructive actions (`confirmingArmyId` in both `TeamView.tsx` and `OpponentDetail.tsx`) — consistent between the two sibling components, but structurally unable to prevent a bypass via direct POST. Whether that's acceptable for Phase 2's test design (test the count/cascade correctness only) or worth flagging as its own finding (add a server-side confirmation token) is a decision for `/10x-plan`, not something this research resolves.

## Historical Context (from prior changes)

- `context/archive/2026-09-04-schema-teams-opponents-matrix/plan.md` — original schema design chose `on delete cascade` for all four FK relationships; explicitly reasoned the PRD guardrail was satisfied because *"no UI-adjacent concerns... deleting a team — not exposed by any FR yet. The schema's cascade behavior supports them if/when a future slice adds that UI"* — i.e., cascade-caused data loss was a known, deferred risk from day one.
- `context/foundation/prd.md` FR-017 (added 2026-09-07, after S-01 shipped without any removal path) — explicitly names the cascade as the reason the confirmation step is a **hard requirement of the FR**, not optional, to avoid violating the guardrail *"No loss of previously entered pairing-matrix estimates once saved."* FR-019 mirrors this for opponent-side removal, added later during `/10x-plan` for S-04 to close a gap S-02 deliberately deferred.
- `context/archive/2026-09-07-remove-team-army/plan.md:12` — states the rationale directly: *"removing an army automatically deletes every matrix estimate that referenced it. This cascade is exactly why FR-017/FR-019's confirmation step is a hard requirement, not a nicety."*
- `context/archive/2026-09-07-remove-team-army/plan.md:33` — the explicit, accepted staleness trade-off cited above.
- `context/archive/2026-09-07-remove-team-army/plan.md:42-43` — batched-count-query is deliberate ("not N+1"); a caller with no ownership of the army being removed is a documented silent RLS no-op, not an error path.
- `context/archive/2026-09-07-remove-team-army/reviews/impl-review.md` — Finding F1 (OBSERVATION, FIXED): opponent-army removal originally didn't verify the army belonged to the given `opponentId`, allowing a tampered form to delete an army from a *different* one of the same captain's own opponents. Confirmed fixed in current code (`src/pages/api/opponents/armies/remove.ts:36`). Not itself a data-integrity/cascade-count issue, but evidence this exact feature's ID-scoping has already been scrutinized once and one real gap found and closed — the count/cascade-scoping question in this research is a different, previously-unexamined angle.
- `context/foundation/roadmap.md` — S-04 entry reiterates the same cascade rationale; archived 2026-09-08 with no lesson captured.

## Related Research

- None yet under `context/changes/**/research.md` — this is the first `/10x-research` document for this test-plan rollout (Phase 1 proceeded directly from `test-plan.md`'s own Risk Response Guidance without a separate research doc; see `context/changes/testing-bootstrap-critical-path-coverage/change.md`'s Notes).

## Open Questions

- **Scope decision for `/10x-plan`**: should Phase 2 test *only* today's two removal paths (pinning current, accepted behavior — including the two gaps below as known limitations), or should either gap be raised as a design question first?
  - The missing server-side confirmation guard (gap 1) — worth a deliberate "accept" or "fix" decision, not silent test-only coverage, since it's a real (if low-severity) behavior gap risk #4's "must challenge" column anticipated in spirit.
  - The stale-count window (gap 2) — already an accepted, documented trade-off upstream; Phase 2 likely just needs a test that pins *today's* behavior (count-at-load vs. actual-delete can diverge under concurrent modification) rather than treating it as a bug to fix.
- Should a future test (this phase or a later one) assert that the *absence* of a team-/opponent-level delete route is itself a property worth pinning — i.e. a regression test that fails loudly if someone adds a `DELETE /api/teams` route without an accompanying confirmation, rather than relying on manual review to catch it? This isn't named in test-plan.md's current risk map and would be a new addition, not required scope.
