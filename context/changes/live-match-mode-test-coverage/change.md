---
change_id: live-match-mode-test-coverage
title: Live match-mode test coverage (test-plan Phase 3)
status: implementing
created: 2026-09-12
updated: 2026-09-12
---

## Notes

Roadmap slice S-12 (`context/foundation/roadmap.md`, milestone M-3: mvp-release-preparation) / `context/foundation/test-plan.md` §3 Phase 3. Original scope was "prove the suggestion engine never reuses a committed army, weighs the downstream refused-attacker impact, and gates session start on exactly-5 rosters" (risks #1 and #6).

Planning-time research found this scope was already substantially covered as a side effect of the S-03/S-06 feature work: `src/lib/matchSessionEngine.test.ts` has a dedicated "committed-army exclusion guardrail" block, `src/lib/matchSuggestions.test.ts` has extensive hand-verified dominance/tie-break scenarios plus full 5-vs-5 walkthroughs, and `tests/e2e/live-match-mode-session.spec.ts` already proves both the no-reuse guarantee and the exactly-5 gate end-to-end in a real browser. The scoring formula itself is also fully pinned (`context/archive/2026-09-11-live-match-recommender/plan.md`), contrary to the roadmap's "still-unpinned" framing which predates S-06 shipping.

The one real gap found: no existing test demonstrates the algorithm sacrificing a better *immediate* matchup for a better *downstream* (refused-attacker) outcome — every current "hand-verified" scenario is either a clean dominance case or an exact tie broken by the `reserveStrength` heuristic. This is exactly what FR-013 exists for and exactly what test-plan.md's own Risk Response Guidance for risk #1 names as the thing to challenge. Scope narrowed accordingly: one new hand-verified proof test plus foundation-doc bookkeeping (test-plan.md Phase 3 status, roadmap sync) — not a from-scratch test-writing effort.
