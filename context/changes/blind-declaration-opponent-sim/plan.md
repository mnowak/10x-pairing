# Fix Simultaneous-Declaration Leaks in Practice-Mode Opponent Simulation — Implementation Plan

## Overview

The practice-mode opponent (Mirrored/Similar behaviors) computes 2 of its 3 decision points from game state that has already been mutated by a decision which, under the confirmed real-world blind/simultaneous declaration rule, hasn't logically happened yet. This plan closes both confirmed leak points — the their-defender pick reacting to our exact revealed defender, and the their-attacker-pair offer reading a pool already reduced by an independent, parallel exchange — and adds a compatibility guard so an in-flight persisted practice session doesn't compute from a half-migrated state after this fix ships.

## Current State Analysis

`src/lib/matchSessionEngine.ts`'s 6-phase state machine (`our-defender → their-defender → our-attacker-pair → their-pick → their-attacker-pair → our-accept`) serializes what the original session-mechanics design (`context/archive/2026-09-11-live-match-mode-session/plan.md:45`) called "two parallel defend/attack exchanges simultaneously." That serialization is harmless for live mode (a human just types in what already happened at the table) but becomes a real bug once an algorithm (`src/lib/opponentMoves.ts`'s `mirroredOpponentProvider` / `createSimilarOpponentProvider`, both backed by `src/lib/matchSuggestions.ts`) computes decisions from that same serialized, mutated state.

Two confirmed leak points (verified via direct code trace, not just the frame's investigation):

1. **their-defender** (`src/lib/matchSuggestions.ts:204-220`, `bestTheirDefender`) — takes a concrete `ourDefender: ArmyId` and uses it deep in its search (`searchOurAttackerPair` → ... → `searchOurAccept`'s `score(matrixGrid, ourDefender, accepted)`) to pick among `theirAvailable` candidates. This lets the opponent's blind pick react to a value it shouldn't know yet at decision time. The codebase already has the correct pattern for "unknown opponent identity" on the other side: `bestOurDefender` never sees `theirDefender` — it aggregates over all of `theirAvailable` via `searchTheirDefender`, assuming the opponent's best response. `bestTheirDefender` breaks that symmetry by taking a fixed identity instead of aggregating over `ourAvailable` the same way.
   - **Second, deeper instance of the same leak, found during manual verification of the algorithm fix**: even after `bestTheirDefender` stops taking a concrete `ourDefender`, its `ourAvailable` argument still leaked information if the caller passed the LIVE `state.ourAvailable` — which by the `their-defender` phase has already been reduced by `confirmOurDefender` to exclude whichever army we just committed. The search's aggregation over `ourAvailable` (modeling "which of our armies might be the unknown defender") was therefore silently excluding the one army it most needed to consider, and including it or not depended on which specific army we picked — the exact same class of leak, one level removed. Fix: capture the pool as it stood immediately BEFORE `confirmOurDefender`'s reduction (`working.ourAvailableBeforeOurDefender`) and feed that to `pickDefender` instead.
2. **their-attacker-pair** (`src/components/match/MatchSession.tsx:471-478`) — passes `state.ourAvailable` into `opponentProvider.pickAttackerPair`, but by that point `enterTheirPick` (`matchSessionEngine.ts:158-174`) has already removed the picked attacker from `ourAvailable` — a fact from a parallel, independent exchange under the confirmed blind model. `bestTheirAttackerPair` itself (`matchSuggestions.ts:291-307`) has no defect; the bug is purely which pool the call site hands it.

`bestTheirPick` (accept/refuse) and all of live mode (`match.astro`, `minimaxSuggestionProvider`) are confirmed clean — out of scope, must remain untouched.

A third finding from direct verification (beyond the frame): `MatchSessionState` is persisted to `localStorage` (`src/lib/matchSessionStorage.ts`), loosely typed on load (`isStoredSession`'s shape check is deliberately shallow). A practice session saved before this fix ships and resumed mid-sub-round at exactly the affected phase would compute from a state missing new fields this plan introduces.

### Key Discoveries:

- `bestOurDefender`'s existing `searchTheirDefender` (`matchSuggestions.ts:222-236`) is the exact structural template for the their-defender fix — same aggregation shape, opposite side.
- `WorkingSubRound` (`matchSessionEngine.ts:28-34`) is reset to `{}` at the start of every sub-round (`confirmOurAccept`'s continuation, `matchSessionEngine.ts:239-249`), so a new field added there needs no explicit reset logic.
- No implementation of `OpponentMoveProvider.pickDefender` (`opponentMoves.ts:21-26`) will use `ourDefender` once both leak points are fixed — `randomOpponentProvider` already ignores it, and `mirroredOpponentProvider`/`createSimilarOpponentProvider` will stop forwarding it. Keeping an always-unused parameter in the interface would be dead weight, and worse, actively misleading (it implies conditioning on it is legitimate).
- No `MatchSession.tsx` component test file exists — the wiring changes there are only covered by `matchSuggestions.test.ts`'s full-walkthrough tests (which exercise `mirroredOpponentProvider`/`createSimilarOpponentProvider` against the real engine) and the new engine-level test this plan adds.

## Desired End State

`bestTheirDefender` can no longer accept an `ourDefender` argument — the invariance the frame demands (the opponent's defender pick must not react to which specific army we revealed) becomes a compile-time guarantee, not just a runtime one. `bestTheirAttackerPair`'s call site is fed a pool snapshotted at the moment both defenders are legitimately public, before any attacker-pair offer has touched it. A captain resuming a pre-fix practice session mid-affected-phase gets a fresh session instead of a computation from a half-migrated state. Live mode and `bestTheirPick` are byte-for-byte unchanged.

Verification: `npm test` passes (including new/rewritten cases below); `npm run lint` and `npm run build` pass; manually starting a Mirrored practice session and revealing different defenders across repeat attempts against the same opponent matrix produces the same opponent defender pick each time.

## What We're NOT Doing

- Not touching `bestTheirPick`, `minimaxSuggestionProvider`, or any live-mode (`mode: "live"`) code path — confirmed clean, explicitly out of scope per the frame.
- Not introducing a full Bayesian/mixed-strategy model of blind declarations — the fix stays within the existing exact-minimax search style already used throughout `matchSuggestions.ts`.
- Not adding a persisted-session schema version field or a general migration framework — the one new compatibility check this plan needs is narrow and purpose-built (see Phase 2).
- Not changing `randomOpponentProvider`'s behavior or signature.

## Implementation Approach

Both leak points are fixed at their narrowest legitimate scope: the their-defender fix is algorithmic (inside `matchSuggestions.ts`, mirroring the codebase's own existing pattern for the symmetric case); the their-attacker-pair fix is purely a wiring change (which pool snapshot is passed at the `MatchSession.tsx` call site) with no change to `bestTheirAttackerPair` itself. Both ship together in Phase 1 since the frame is explicit this is one bug class — shipping only one leak point risks re-declaring the class "closed" prematurely, as happened with the original F1 fix.

**Deviation from the original phasing**: during Phase 1's manual verification, live browser testing hit a crash — the practice-mode island (`client:only="react"`) rendered blank because a practice session already sitting in the tester's `localStorage` (from testing across this same implementation session) predated the new snapshot fields and had no error boundary to fall back on. This is exactly the scenario Phase 2's compatibility guard exists to handle, so Phase 2 (`isResumableSessionState` + its wiring) was implemented immediately, alongside Phase 1, rather than deferred — both phases' automated checks are verified together and land in one commit.

## Critical Implementation Details

### State sequencing — the symmetric search shape for `bestTheirDefender`

This is the one genuinely non-obvious piece other parts of this plan (the test rewrites) depend on. The fix adds a new private function symmetric to the existing `searchTheirDefender`, aggregating over `ourAvailable` instead of `theirAvailable`:

```ts
// Mirror of searchTheirDefender (matchSuggestions.ts:222-236), aggregating
// over ourAvailable instead of theirAvailable — "our" node convention
// (agg = oursMaximize ? Math.max : Math.min), since this represents the
// captain's own (unknown-to-them) defender choice from their perspective.
function searchOurDefenderForTheirChoice(
  ourAvailable: ArmyId[],
  theirDefender: ArmyId,
  remainingTheirs: ArmyId[],
  matrixGrid: MatrixGridData,
  config: SearchConfig,
): number {
  const agg = config.oursMaximize ? Math.max : Math.min;
  return agg(
    ...ourAvailable.map((ourDefenderCandidate) => {
      const remainingOurs = withoutArmy(ourAvailable, ourDefenderCandidate);
      return searchOurAttackerPair(remainingOurs, theirDefender, remainingTheirs, ourDefenderCandidate, matrixGrid, config);
    }),
  );
}
```

`bestTheirDefender` then calls this instead of `searchOurAttackerPair` directly, and drops its `ourDefender: ArmyId` parameter entirely. `pickBest`'s own maximize-over-primary-value behavior is unaffected — only what feeds the primary-value function changes.

## Phase 1: Fix both leak points

### Overview

Restructure `bestTheirDefender` to stop taking a concrete `ourDefender`, drop the now-always-unused parameter from `OpponentMoveProvider.pickDefender`, snapshot the correct pool for `bestTheirAttackerPair`'s call site, and rewrite/add the unit tests this changes.

### Changes Required:

#### 1. Symmetric search for the their-defender decision

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Stop `bestTheirDefender` from conditioning its choice among `theirAvailable` on a concrete, externally-revealed `ourDefender` — aggregate over `ourAvailable` the same way the codebase already aggregates over `theirAvailable` for the symmetric `bestOurDefender` case.

**Contract**: Add `searchOurDefenderForTheirChoice` (see Critical Implementation Details above) alongside the existing `search*` helpers. Change `bestTheirDefender`'s exported signature from `(theirAvailable, ourAvailable, ourDefender, matrixGrid, score)` to `(theirAvailable, ourAvailable, matrixGrid, score)`, routing its `pickBest` candidate-value callback through the new function instead of `searchOurAttackerPair` directly. Update the function's doc comment (currently describes it as taking `ourDefender`) to describe the new blind-search behavior. `theirReserveStrength`'s tie-break usage is unaffected.

#### 2. Drop the now-unused parameter from the opponent-provider interface

**File**: `src/lib/opponentMoves.ts`

**Intent**: No `OpponentMoveProvider.pickDefender` implementation uses `ourDefender` once the above lands — keeping it in the interface is dead weight that misleadingly implies conditioning on it is legitimate.

**Contract**: Remove the `ourDefender: ArmyId` parameter from `OpponentMoveProvider.pickDefender`'s signature. Update `randomOpponentProvider.pickDefender` (already ignores it — just drop the unused param from its destructure), `mirroredOpponentProvider.pickDefender` (stop forwarding to `bestTheirDefender`, matching its new signature), and `createSimilarOpponentProvider`'s returned `provider.pickDefender` (same).

#### 3. Wire the interface change through to its call site, and snapshot the pre-commit pool

**File**: `src/lib/matchSessionEngine.ts`, `src/components/match/MatchSession.tsx`

**Intent**: Match the `OpponentMoveProvider.pickDefender` signature change at its one call site — and, per the second leak instance found during manual verification, feed it the pool as it stood BEFORE our own defender was committed, not the live `state.ourAvailable` (which by this phase already excludes it).

**Contract**: Add `ourAvailableBeforeOurDefender?: ArmyId[]` to `WorkingSubRound`. In `confirmOurDefender` (`matchSessionEngine.ts:109-122`), set it to a copy of `state.ourAvailable` before the reduction (`working: { ...state.working, ourDefender: chosen, ourAvailableBeforeOurDefender: [...state.ourAvailable] }`). At the `their-defender` phase's `AutoReveal` (`MatchSession.tsx:404-410`), replace the `state.ourAvailable` argument to `opponentProvider.pickDefender(...)` with `requireWorking(state.working.ourAvailableBeforeOurDefender, "Our available pool before our defender")`.

#### 4. Snapshot the pool for the their-attacker-pair offer

**File**: `src/lib/matchSessionEngine.ts`

**Intent**: Give the `their-attacker-pair` phase a pool snapshot taken at the moment both defenders are legitimately public — before any attacker-pair offer (a later, independent exchange under the parallel model) has touched it.

**Contract**: Add `ourAvailableAtDefenderReveal?: ArmyId[]` to `WorkingSubRound`. In `enterTheirDefender` (`matchSessionEngine.ts:117-142`), set it to a copy of `state.ourAvailable` at that point (it needs no further reduction until the next sub-round, when `working` resets to `{}` per the existing continuation logic).

#### 5. Read the snapshot instead of the live pool

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Feed `bestTheirAttackerPair` the pool as it stood before the independent their-pick exchange mutated it, not the live, further-reduced `state.ourAvailable`.

**Contract**: At the `their-attacker-pair` phase's `AutoReveal` (`MatchSession.tsx:471-478`), replace the `state.ourAvailable` argument to `opponentProvider.pickAttackerPair(...)` with `requireWorking(state.working.ourAvailableAtDefenderReveal, "Our available pool at defender reveal")`.

#### 6. Rewrite and add unit tests

**File**: `src/lib/matchSuggestions.test.ts`

**Intent**: Update every test that calls `bestTheirDefender` with the old signature, replace the invalidated hand-verified tie-break scenario (its premise — that a fixed external `ourDefender` contributes the same constant to every path — no longer applies once `ourDefender` isn't a parameter at all), and add the invariance/live-trace regression coverage this bug class needs.

**Contract**:
- Update the "bounds" test (`matchSuggestions.test.ts:139-143`) and the "wiring" test (`matchSuggestions.test.ts:261-266`) to the new 4-arg signature.
- Replace the "hand-verified scenario (mirror of bestOurDefender's own tie-break test)" describe block (`matchSuggestions.test.ts:160-199`) with a new hand-derived scenario proving the tie-break still falls through to `theirReserveStrength` correctly under the new symmetric search — the transpose of the existing `bestOurDefender` tie-break grid, verified directly (all three candidates tie at primary value 14; reserve strengths 30/22/6 correctly pick the lowest).
- Add a regression test using the REAL "Expedition 2137 vs. Wujasy" pairing matrix (pulled live from the local dev DB during implementation, not synthetic — the frame's own live trace didn't capture the underlying cell values): asserts `mirroredOpponentProvider.pickDefender` returns a single value ("WE") against this real matrix, verified directly against the pre-fix computation shape (which returned different picks — "CSM" for BA/CK/Demony, "WE" for Custo, "TS" for Tau — depending on which army was fixed as `ourDefender`, a real leak against this exact matchup).
- Leave the two full-walkthrough tests (`matchSuggestions.test.ts:436-541`, `543-639`) as-is where they compile after the signature change — their uniform-grid construction means every candidate ties regardless of the algorithm change, so the hand-derived expected outcomes are unaffected; only the `mirroredOpponentProvider.pickDefender(...)` call sites within them need their `ourDefender` argument dropped to match the new interface.

**File**: `src/lib/matchSessionEngine.test.ts`

**Intent**: Prove both new snapshot fields hold the correct pool at the correct moment, independent of later mutations or of which specific army was committed.

**Contract**: Add tests asserting: (1) `working.ourAvailableBeforeOurDefender` still includes the army just committed as our defender (unlike the live `state.ourAvailable`), and is identical regardless of which army was committed; (2) after `enterTheirPick` reduces `state.ourAvailable`, `state.working.ourAvailableAtDefenderReveal` still contains the army `enterTheirPick` just removed — i.e., that snapshot is unaffected by the later, independent mutation it exists to protect against.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npm run lint`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Starting a Mirrored practice session against the same opponent matrix twice, revealing a different first defender each time (e.g. the frame's CK/Tau vs. BA/Custo/Demony split), produces the *same* opponent defender pick both times.
- A full Mirrored practice session still completes end-to-end with no thrown errors or stuck phases.
- A full Similar practice session still completes end-to-end with no thrown errors or stuck phases.
- Live match-mode (`mode: "live"`) is visibly unaffected — same phase sequence, same manual data-entry flow as before.

---

## Phase 2: Persisted-session compatibility guard

### Overview

Ensure a practice session saved to `localStorage` before this fix ships, if resumed mid-sub-round at exactly the affected phase, doesn't compute from a state missing the new `ourAvailableAtDefenderReveal` field — instead, treat it as incompatible and start fresh.

### Changes Required:

#### 1. Compatibility check

**File**: `src/lib/matchSessionEngine.ts`

**Intent**: Detect a loaded `MatchSessionState` that predates this fix — recognizable by having committed `theirDefender` (meaning `enterTheirDefender` already ran) without the snapshot that same function now always sets alongside it.

**Contract**: Add an exported `isResumableSessionState(state: MatchSessionState): boolean`, returning `false` when `state.working.theirDefender !== undefined && state.working.ourAvailableAtDefenderReveal === undefined`, `true` otherwise.

#### 2. Apply the guard at load time

**File**: `src/components/match/MatchSession.tsx`

**Intent**: An incompatible loaded session should behave exactly like no saved session existed — a fresh session starts, and the stale entry is cleared so it isn't re-encountered.

**Contract**: In the lazy initializer that currently computes `initialLoaded` (`MatchSession.tsx:260`), after calling `loadSession`, check `isResumableSessionState` on its `.state` when present; if it returns `false`, call `clearSession(mode)` and treat `initialLoaded` as `null` for the rest of initialization (both the `state` and `activeOpponent`'s `existingTable` restoration paths).

#### 3. Test coverage

**File**: `src/lib/matchSessionEngine.test.ts`

**Intent**: Lock in the exact compatibility boundary — which is intentionally narrow (only the one affected phase-shape), not a general schema-version check.

**Contract**: Add tests for `isResumableSessionState`: `true` for a freshly-created session, `true` for a session mid-flight that has both `theirDefender` and `ourAvailableAtDefenderReveal` set (the new, correct shape), and `false` for a hand-constructed state with `theirDefender` set but `ourAvailableAtDefenderReveal` absent (simulating a pre-fix persisted session).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- Manually write a pre-fix-shaped session object (defender revealed, no snapshot field) into `localStorage` under the simulation key, reload the practice session page, and confirm a fresh session starts rather than the app crashing or silently misbehaving.
- A practice session saved and resumed *after* this fix ships (normal case) resumes correctly at any phase.

---

## Testing Strategy

### Unit Tests:

- `bestTheirDefender`'s new blind-search behavior, including the rewritten tie-break scenario and the live-trace regression case.
- The `their-attacker-pair` snapshot's survival across the independent `enterTheirPick` mutation.
- `isResumableSessionState`'s narrow true/false boundary.

### Integration Tests:

- The existing full-walkthrough tests in `matchSuggestions.test.ts` (`minimaxSuggestionProvider`, `mirroredOpponentProvider`, `createSimilarOpponentProvider` against the real engine) continue to exercise both fixes end-to-end via the real `matchSessionEngine.ts` state machine.

### Manual Testing Steps:

1. Start a Mirrored practice session against a matrix with real variation (not uniform), reveal one army as our defender, note the opponent's pick, abandon, restart, reveal a *different* army as our defender against the same matrix, and confirm the opponent's pick is unchanged.
2. Repeat step 1 for Similar mode.
3. Play a full practice session (either mode) to completion and confirm no thrown errors and a sensible final refused-attacker pairing.
4. Hand-edit `localStorage`'s `pairing-assistant:simulation-session` key to a pre-fix-shaped state and confirm the app recovers gracefully (Phase 2's manual step).

## Performance Considerations

The new `searchOurDefenderForTheirChoice` adds one more nested loop (over `ourAvailable`, ≤5 by `MAX_ROSTER_SIZE`) to `bestTheirDefender`'s existing search tree. The file's own documented cost model (`matchSuggestions.ts:423-434`) is already a product of small bounded factors at this roster cap; one more factor of ≤5 stays trivial and doesn't change the "exact search is fine at this scale" conclusion.

## Migration Notes

No data migration — `MatchSessionState` is ephemeral (localStorage only, one slot per mode). Phase 2's compatibility guard handles the one shape that matters; no schema-version field or general migration path is introduced (see What We're NOT Doing).

## References

- Frame brief: `context/changes/blind-declaration-opponent-sim/frame.md`
- Original design intent (parallel exchanges): `context/archive/2026-09-11-live-match-mode-session/plan.md:45`
- Related prior finding: `context/changes/pairing-simulation-recommender/reviews/impl-review.md` (F1)
- Symmetric-search template: `src/lib/matchSuggestions.ts:222-236` (`searchTheirDefender`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fix both leak points

#### Automated

- [x] 1.1 Type checking passes: `npx astro sync && npm run lint` — 2c4967a
- [x] 1.2 Unit tests pass: `npm test` — 2c4967a
- [x] 1.3 Production build succeeds: `npm run build` — 2c4967a

#### Manual

- [x] 1.4 Same opponent matrix, different first-defender reveal → same opponent defender pick both times — 2c4967a
- [x] 1.5 Full Mirrored practice session completes end-to-end with no thrown errors — 2c4967a
- [x] 1.6 Full Similar practice session completes end-to-end with no thrown errors — 2c4967a
- [x] 1.7 Live match-mode visibly unaffected — 2c4967a

### Phase 2: Persisted-session compatibility guard

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 2c4967a
- [x] 2.2 Type checking passes: `npx astro sync && npm run lint` — 2c4967a

#### Manual

- [x] 2.3 Hand-written pre-fix-shaped localStorage session recovers gracefully (fresh session, no crash) — 2c4967a
- [x] 2.4 A session saved and resumed after this fix ships resumes correctly at any phase — 2c4967a
