# Live Match-Mode Test Coverage — Plan Brief

> Full plan: `context/changes/live-match-mode-test-coverage/plan.md`

## What & Why

Close test-plan.md §3 Phase 3 (roadmap slice S-12): prove the live match-mode suggestion engine never reuses a committed army and correctly weighs the downstream refused-attacker impact, not just the immediate matchup (risks #1 and #6). This was scoped as a from-scratch test-writing phase, but planning-time research found nearly all of it already done as a side effect of the S-03/S-06 feature work.

## Starting Point

`src/lib/matchSessionEngine.test.ts` has a dedicated "committed-army exclusion guardrail" block, `src/lib/matchSuggestions.test.ts` (770 lines) has extensive hand-verified dominance/tie-break scenarios, and `tests/e2e/live-match-mode-session.spec.ts` already proves both the no-reuse guarantee and the exactly-5 roster gate in a real browser session. The scoring formula (minimax + `reserveStrength` tie-break + purple/unestimated=7) is fully pinned in the archived S-06 plan — the roadmap's "still-unpinned" note is stale. The one thing missing: no test proves the algorithm ever *sacrifices* a better immediate matchup for a better downstream outcome — every existing scenario is either a clean dominance case or an exact tie.

## Desired End State

`matchSuggestions.test.ts` has one new hand-verified test closing that gap, `test-plan.md` §3 Phase 3 reads `complete`, and its §6.3 e2e cookbook placeholder (previously "TBD") describes the pattern already in use.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | One new unit test + docs bookkeeping, not a from-scratch test-writing effort | Research found risks #1/#6 already substantially covered; only the immediate-vs-downstream trade-off proof was missing | Plan |
| Test depth | Isolated `suggestAcceptedAttacker` hand-verified scenario, not a full multi-sub-round hand-traced session | Cheapest layer with direct signal, matches test-plan.md's own cost×signal principle | Plan |
| Confirmation pass | Fresh re-read of `matchSessionEngine.test.ts` and the e2e spec before declaring done | Cheap insurance given how much this session's own assumptions already shifted once during research | Plan |
| Bookkeeping | Update test-plan.md status + change folder, and fill in the stale "TBD" e2e cookbook section | Keeps the source-of-truth docs from staying stale the way they already had | Plan |

## Scope

**In scope:**
- One new hand-verified unit test in `matchSuggestions.test.ts` proving the immediate-vs-downstream trade-off.
- A fresh-read confirmation pass over existing engine/e2e tests.
- `test-plan.md` §3 Phase 3 status flip to `complete` and §6.3 fill-in.

**Out of scope:**
- Any new e2e test (existing `live-match-mode-session.spec.ts` already covers both target risks at the browser level).
- Any change to `matchSessionEngine.ts`, `matchSuggestions.ts`, `match.astro`, or `simulate.astro`.
- Re-deriving or changing the scoring formula, tie-break rule, or purple/unestimated=7 constant.
- A full multi-sub-round hand-traced session for the trade-off proof.

## Architecture / Approach

Add one pure-function unit test (no I/O) alongside the existing hand-verified scenarios in `matchSuggestions.test.ts`, verify it has real signal via a temporary deliberate-break check, then update `test-plan.md` to close out the phase. No production code changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Close the downstream-trade-off coverage gap | New hand-verified test + confirmation that no other gap exists | The hand-derived scenario must be genuinely non-vacuous (deliberate-break check exists specifically to catch this) |
| 2. Update test-plan.md to reflect Phase 3 complete | Docs-only: status flip + §6.3 fill-in | Low — no code touched |

**Prerequisites:** None — all target code already exists and is stable.
**Estimated effort:** ~1 short session, 2 small phases.

## Open Risks & Assumptions

- The hand-derived scenario (accept X → 16, accept Y → 28) was verified by hand during planning, not by running the code — Phase 1's own test execution is the real check.
- Assumes no drift has occurred in `matchSessionEngine.test.ts` or the e2e spec since this session's research; Phase 1's confirmation pass step exists specifically to catch that.

## Success Criteria (Summary)

- `npm test` passes including the new test, and the test is confirmed non-vacuous via a deliberate-break check.
- `test-plan.md` §3 Phase 3 reads `complete` with an accurate §6.3 entry.
