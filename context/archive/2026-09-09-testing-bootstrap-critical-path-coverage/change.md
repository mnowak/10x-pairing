---
change_id: testing-bootstrap-critical-path-coverage
title: Bootstrap test runner + critical-path coverage (risks #2, #3)
status: archived
created: 2026-09-09
updated: 2026-09-12
archived_at: 2026-09-12T09:41:13Z
---

## Notes

Test-plan rollout Phase 1 (`context/foundation/test-plan.md` §3). Stands up
Vitest (with `@cloudflare/vitest-pool-workers`, per user choice — the app's
domain logic itself needs no Cloudflare bindings, so this is deliberately
ahead of strict necessity, chosen for runtime parity with production from
the start) and proves two risks hold:

- **Risk #2** — score↔band mapping (`src/lib/colorBands.ts`). Oracle
  independently confirmed via `context/archive/2026-09-07-prepare-opponent-matrix/plan.md:44`
  (not derived from reading the implementation).
- **Risk #3** — cross-captain write protection. Primary case is
  `upsertEstimate` (`src/lib/matrix.ts`) — a genuine 2-FK ownership check
  found already in place. Secondary case is `removeArmyFromOpponent`'s
  `captain_id`-scoped delete (`src/lib/opponents.ts`) — a defense-in-depth
  regression guard, not the same bug as the F1 finding in
  `context/archive/2026-09-07-remove-team-army/reviews/impl-review.md`
  (that fix lives in the route handler and was same-captain/cross-opponent,
  not cross-captain).

No `/10x-research` doc was produced for this phase — `test-plan.md` §2's
Risk Response Guidance already served as the oracle/scope source, confirmed
against the live codebase during `/10x-plan`.
