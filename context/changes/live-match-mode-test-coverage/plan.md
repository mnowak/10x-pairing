# Live Match-Mode Test Coverage (test-plan Phase 3) Implementation Plan

## Overview

Close the one real remaining gap in test-plan.md §3 Phase 3 (risks #1 and #6: the suggestion engine never reuses a committed army, and a session gates on exactly-5 rosters), then update the foundation docs (test-plan.md, already-synced roadmap) to reflect that Phase 3 is complete.

## Current State Analysis

Planning-time research (this session) found that risks #1 and #6 already have substantial, real coverage — not the "not started" state test-plan.md's own table still shows:

- **Risk #6 (exactly-5 gate)** is implemented (`src/pages/dashboard/opponents/[id]/match.astro:60`, `src/pages/dashboard/opponents/[id]/simulate.astro:62`, both `ourCount === MAX_ROSTER_SIZE && theirCount === MAX_ROSTER_SIZE`) and already has a dedicated e2e test: `tests/e2e/live-match-mode-session.spec.ts:173-188` ("match mode is blocked when the opponent roster has fewer than 5 armies").
- **Risk #1 (never reuse a committed army)** has three independent layers of proof already:
  - `src/lib/matchSessionEngine.test.ts:141-184` — a dedicated "committed-army exclusion guardrail" `describe` block: `confirmOurDefender`/`confirmOurAttackerPair`/`enterTheirPick`/`confirmOurAccept` all throw on a re-committed or out-of-pool army, plus a full 5-vs-5 walkthrough (`:67-99`) asserting the committed set equals the full roster.
  - `src/lib/matchSuggestions.test.ts` (770 lines) — extensive hand-verified dominance/tie-break scenarios for every decision type (`suggestDefender`, `suggestAttackerPair`, `suggestAcceptedAttacker`, and their opponent-side mirrors), plus two full 5-vs-5/3-vs-3 walkthroughs proving structural correctness (every army committed exactly once).
  - `tests/e2e/live-match-mode-session.spec.ts:117-171` — a real browser test driving a full two-sub-round session, asserting via `assertOptionNamesExclude` that no previously-committed army is ever re-offered as an option.
- The suggestion engine's scoring formula (immediate matchup + downstream refused-attacker impact via exhaustive minimax, `purple`/unestimated = 7, `reserveStrength` tie-break) is **fully pinned**, documented in the archived `context/archive/2026-09-11-live-match-recommender/plan.md:46-58`. The roadmap's "still-unpinned formula" framing (`context/foundation/roadmap.md:120`) predates S-06 shipping and is stale.

### Key Discoveries:

- **The actual gap**: every existing "hand-verified" scenario in `matchSuggestions.test.ts` is either a clean dominance case (one candidate wins on every criterion) or an exact primary-value tie broken by the `reserveStrength` heuristic. None demonstrates the algorithm choosing a candidate with a **strictly worse immediate matchup** because it yields a **strictly better total** once the downstream forced refused-attacker pairing is accounted for. That is precisely the behavior FR-013 exists for (PRD: "this isn't a trivial 'pick the higher estimate' lookup") and precisely what test-plan.md's own Risk Response Guidance for risk #1 names as the thing to challenge ("Only the immediate matchup matters").
- A concrete, hand-verified scenario closing this gap was derived during planning (see Phase 1, Contract) — a `suggestAcceptedAttacker` case with one reserve army remaining, where accepting the immediately-worse offered attacker protects a much better forced-refusal pairing. Verified by hand: accept-worse totals 28, accept-better totals 16.
- `src/lib/colorBands.ts:19-25` confirms the representative scores used in the scenario: red=2, orange=6, yellow=10, green=14, dark-green=18.
- `context/foundation/test-plan.md` §3's status vocabulary is `not started → change opened → researched → planned → implementing → complete`; the row was flipped to `planned` and the change-folder column filled in as part of writing this plan (mirroring the roadmap-sync convention). Phase 2 below flips it to `complete`.

## Desired End State

`matchSuggestions.test.ts` contains a new hand-verified scenario proving the suggestion engine trades off a worse immediate matchup for a better downstream (refused-attacker) outcome — closing the one gap risk #1 had left. `test-plan.md` §3 Phase 3 reads `complete`, and §6.3's "TBD" e2e cookbook placeholder is filled in pointing at the existing `live-match-mode-session.spec.ts` pattern.

**Verification:** `npm test` passes including the new test; the new test is confirmed to have real signal by temporarily inverting the algorithm's downstream weighting and observing the new test (and only the new test, ideally) go red, then reverting; `npx astro check` and `npm run lint` pass.

### Key Discoveries:

(see Current State Analysis above — the gap, the derived scenario, and the pinned formula reference)

## What We're NOT Doing

- Not adding a new e2e test — `tests/e2e/live-match-mode-session.spec.ts` already covers both target risks at the browser level; the gap closed here is a suggestion-*quality* proof, cheapest at the unit layer per test-plan.md's own cost×signal principle.
- Not re-testing the exactly-5 gate — it already has dedicated e2e coverage (`live-match-mode-session.spec.ts:173-188`); Phase 1's confirmation pass re-reads it to verify this stays true, but doesn't add new coverage for it.
- Not touching `matchSessionEngine.ts`, `matchSuggestions.ts`, `match.astro`, or `simulate.astro` — this is a test-coverage-only change; no production code changes.
- Not re-deriving or changing the scoring formula, tie-break rule, or purple/unestimated=7 constant — all already pinned and out of scope for a test-coverage phase.
- Not adding a full multi-sub-round hand-traced session for the trade-off proof — the isolated-function scenario (Phase 1) gives the same signal at the cheapest layer, per this session's own scoping decision.

## Implementation Approach

One phase closes the actual test gap and re-confirms (fresh read, guarding against research/implementation drift) that no other blind spot exists for risks #1/#6. A second phase updates `test-plan.md` to reflect the now-`complete` state — docs-only, no code.

## Phase 1: Close the downstream-trade-off coverage gap

### Overview

Add one hand-verified unit test proving `minimaxSuggestionProvider.suggestAcceptedAttacker` sacrifices a better immediate matchup for a better downstream (forced refused-attacker) outcome. Re-confirm, via a fresh read, that `matchSessionEngine.test.ts` and `tests/e2e/live-match-mode-session.spec.ts` still fully cover risks #1 and #6 with no other gap.

### Changes Required:

#### 1. Downstream trade-off proof test

**File**: `src/lib/matchSuggestions.test.ts`

**Intent**: Prove the suggestion engine weighs the downstream refused-attacker impact, not just the immediate matchup — the one identified gap. Add alongside the existing `describe("minimaxSuggestionProvider — hand-verified scenarios", ...)` block (after the existing `suggestAcceptedAttacker` dominance test, around line 397), following that block's existing comment style (explain the hand-derivation inline, as every other scenario in this file does).

**Contract**: New `it` block calling `minimaxSuggestionProvider.suggestAcceptedAttacker(ourDefender, theirOfferedPair, ourAvailable, theirAvailable, grid)` with:

- `ourDefender = "D"`, `theirOfferedPair = ["X", "Y"]`, `ourAvailable = ["R"]` (single reserve army — the eventual forced refused-attacker), `theirAvailable = ["X", "Y"]`.
- Grid: `"D:X": "green"` (14), `"D:Y": "yellow"` (10), `"R:X": "dark-green"` (18), `"R:Y": "red"` (2).
- Hand-derivation (include in the test comment, matching the file's existing style): accepting X gives `cellValue(D,X) + cellValue(R,Y) = 14 + 2 = 16` (R is forced against the unaccepted Y). Accepting Y gives `cellValue(D,Y) + cellValue(R,X) = 10 + 18 = 28` (R is forced against the unaccepted X). 28 > 16, so the correct accept is Y — the *immediately worse* option (yellow, 10) — because it protects R's much stronger matchup against X for the forced final pairing.
- Assert `result` equals `"Y"`.

#### 2. Fresh-read confirmation pass

**Intent**: Guard against drift between this session's research (summarized above) and the actual files at implementation time — cheap insurance given how much this session's own assumptions already shifted once during research.

**Contract**: Re-read `src/lib/matchSessionEngine.test.ts` and `tests/e2e/live-match-mode-session.spec.ts` in full. Confirm: (a) the "committed-army exclusion guardrail" `describe` block and its full 5-vs-5 walkthrough are still present and unchanged in substance; (b) the e2e spec's two tests (no-reuse across a full session, and the exactly-5 block) are still present and unchanged in substance. This is a read-only verification step — no file changes expected. If drift is found (a test was removed, weakened, or no longer covers what this plan assumes), STOP and re-plan per the mismatch-handling protocol rather than proceeding.

### Success Criteria:

#### Automated Verification:

- New test passes: `npx vitest run src/lib/matchSuggestions.test.ts`
- Full test suite passes: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Fresh-read confirmation pass (above) completed with no drift found — or any drift found was surfaced and resolved before proceeding.
- Deliberate-break check: temporarily change `searchOurAccept`'s aggregation in `src/lib/matchSuggestions.ts` to ignore the recursive continuation (e.g., score by `immediate` value alone, not `immediate + continueOrFinish(...)`), confirm the new test goes red (and ideally that it's the only test newly failing), then revert the change before committing.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Update test-plan.md to reflect Phase 3 complete

### Overview

Docs-only phase: flip `context/foundation/test-plan.md` §3 Phase 3's status from `planned` to `complete` now that the gap is closed, and fill in §6.3's "TBD" e2e cookbook placeholder.

### Changes Required:

#### 1. Phase 3 status

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Phase 3 (risks #1, #6) is now fully covered.

**Contract**: In the §3 Phased Rollout table, change the Phase 3 row's Status cell from `planned` to `complete` (Change folder column already reads `context/changes/live-match-mode-test-coverage/` from planning time). Bump the "Last updated" line at the top of the file to today's date.

#### 2. E2E cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in §6.3's placeholder now that a concrete e2e pattern exists for this project (it already did, pre-dating this change — the placeholder was simply never filled in).

**Contract**: Replace the `### 6.3 Adding an e2e test` body (currently `- TBD — see §3 Phase 3 (live match-mode two-sub-round sequence pattern lands here).`) with a short description of the actual pattern used in `tests/e2e/live-match-mode-session.spec.ts`: role-based locators via helper functions (`armyOptionButtons`, `pickFirstOption`, `pickPairOfOptions`), `Date.now()`-stamped army names for uniqueness, `assertOptionNamesExclude` to prove exclusion invariants, and roster cleanup (`clearTeamRoster`) as the test's own setup/teardown — consistent with `tests/e2e/README.md`'s documented rules.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint` (markdown/docs changes don't break lint config)

#### Manual Verification:

- `test-plan.md` §3 Phase 3 row reads `complete` with the correct change-folder path.
- §6.3 no longer reads "TBD" and accurately describes the existing e2e pattern.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- The one new hand-verified `suggestAcceptedAttacker` trade-off scenario (Phase 1) — see Contract above for the exact grid and expected result.

### Integration Tests:

- None added — `matchSessionEngine.test.ts`'s existing guardrail coverage and `matchSuggestions.test.ts`'s existing walkthroughs already exercise the engine end-to-end at the integration level; Phase 1's confirmation pass verifies this remains true.

### Manual Testing Steps:

1. Run the new test in isolation and confirm it passes with the exact hand-derived values (16 vs 28).
2. Deliberately break the downstream-weighting logic, confirm the new test (and ideally only it) fails, then revert.
3. Re-read `matchSessionEngine.test.ts` and `tests/e2e/live-match-mode-session.spec.ts` in full, confirming no drift from this plan's assumptions.
4. Confirm `test-plan.md` §3 Phase 3 and §6.3 read correctly after Phase 2's edits.

## Performance Considerations

None — one additional pure-function unit test with no I/O.

## Migration Notes

Not applicable — test-only change, no data model or schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` § S-12
- Test plan: `context/foundation/test-plan.md` §2 (risks #1, #6), §3 Phase 3
- Change identity: `context/changes/live-match-mode-test-coverage/change.md`
- Scoring formula source: `context/archive/2026-09-11-live-match-recommender/plan.md:46-58`
- Existing coverage: `src/lib/matchSessionEngine.test.ts:141-184`, `src/lib/matchSuggestions.test.ts`, `tests/e2e/live-match-mode-session.spec.ts`
- Representative scores: `src/lib/colorBands.ts:19-25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Close the downstream-trade-off coverage gap

#### Automated

- [x] 1.1 New test passes: `npx vitest run src/lib/matchSuggestions.test.ts` — 23b7b16
- [x] 1.2 Full test suite passes: `npm test` — 23b7b16
- [x] 1.3 Type checking passes: `npx astro check` — 23b7b16
- [x] 1.4 Linting passes: `npm run lint` — 23b7b16

#### Manual

- [x] 1.5 Fresh-read confirmation pass completed, no drift found — 23b7b16
- [x] 1.6 Deliberate-break check confirms the new test has real signal — 23b7b16

### Phase 2: Update test-plan.md to reflect Phase 3 complete

#### Automated

- [x] 2.1 Linting passes: `npm run lint`

#### Manual

- [x] 2.2 test-plan.md §3 Phase 3 row reads complete with correct change-folder path
- [x] 2.3 §6.3 accurately describes the existing e2e pattern, no longer TBD
