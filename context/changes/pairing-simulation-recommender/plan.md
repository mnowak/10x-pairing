# Selectable Opponent-Behavior Modes for Pairing Simulation Implementation Plan

## Overview

Let a captain pick one of three opponent-behavior modes for a solo pairing-simulation session, via a pre-session picker: **Random** (S-07's existing uniform pick, unchanged), **Mirrored** (default — a real minimax lookahead over an inverted view of the captain's own matrix), or **Similar** (Mirrored's matrix plus a random perturbation, fixed once per session). This is roadmap slice S-08, whose scope was expanded during planning from a single hardcoded algorithmic swap to the full 3-mode selector — pulling the previously-parked MS-05 forward at the user's explicit request.

## Current State Analysis

S-07 shipped `OpponentMoveProvider` (`src/lib/opponentMoves.ts`) with one implementation, `randomOpponentProvider`, wired unconditionally into `MatchSession.tsx`'s three opponent-decision phases whenever `mode === "simulation"`. The captain's own three decision points always use `minimaxSuggestionProvider` (`src/lib/matchSuggestions.ts`), an exhaustive minimax search that maximizes at the captain's own nodes and minimizes at the opponent's nodes — but that search only ever returns *values*, never the opponent's actual *choice*, because nothing has ever needed to expose it before.

### Key Discoveries:

- **The roadmap's flagged Unknown was smaller than it looked.** `matchSuggestions.ts`'s existing minimax already models the opponent as an adversary minimizing the captain's score using the shared `matrixGrid` — there's no separate "opponent mirrors the captain's matrix" mechanism to build; it's already implicit in the existing search (`searchTheirDefender`/`searchTheirPick`/`searchTheirAttackerPair`'s `Math.min(...)` branches, `matchSuggestions.ts:130-142` and around).
- **The real gap: argmin/argmax picks don't exist for the opponent's side.** `bestOurDefender`/`bestOurAttackerPair`/`bestOurAccept` use the exported `pickBest` helper to return an actual choice; the opponent-facing branches only ever compute `Math.min(...)` over values, discarding *which* candidate produced it.
- **For Mirrored/Similar to make any meaningful decision — not just at the final pairing, but when revealing a defender or offering an attacker pair (decisions with no value of their own, only downstream consequences) — the opponent needs a real lookahead**, structured as the mirror image of today's search: the opponent's own decision nodes maximize a per-cell value function; the captain's decision nodes (as modeled *by* the opponent) minimize that same function. Duplicating the ~150-line recursive search for this would be a lot of near-identical code — instead, Phase 1 generalizes the existing search to run from either perspective, verified by the full existing test suite passing unchanged.
- **The pick found is always via `pickBest`'s existing semantics in both directions.** The asymmetry between "our" and "their" picks lives entirely in which side's downstream continuation is maximizing vs. minimizing (a single `oursMaximize` flag threaded through the generalized search) — not in the top-level pick's own comparison direction. Both `bestOur*` and the new `bestTheir*` functions pick the argmax of their own respective best-achievable continuation.
- **Reserve-strength tie-breaks mirror structurally, not uniformly.** `bestOurDefender`/`bestOurAttackerPair` commit one of the captain's *own* armies, so their tie-break (`reserveStrength`) meaningfully applies; `bestOurAccept` (choosing among the *opponent's* offered pair) has no such tie-break today (`() => 0`, "first candidate wins," per its own comment) because it isn't committing one of the captain's own armies. The new `bestTheirDefender`/`bestTheirAttackerPair` (committing one/two of the opponent's own armies) get a mirrored `theirReserveStrength` tie-break; `bestTheirPick` (choosing among the captain's *offered* pair) mirrors `bestOurAccept` exactly — `() => 0`, no reserve tie-break, for the same structural reason.
- **`OpponentMoveProvider`'s current signatures (from S-07) don't carry enough context for a lookahead.** `pickDefender` is missing `ourDefender`; `pickAttackerChoice` is missing `ourAvailable`/`theirAvailable`/`ourDefender`; `pickAttackerPair` is missing `ourAvailable`. Widening these is expected here — the roadmap describes S-07's interface as "swappable" specifically for this slice, and all the missing values are already present in `MatchSession.tsx`'s existing state at each call site (`state.working.*`, `state.ourAvailable`, `state.theirAvailable`), reachable via the `requireWorking` helper already added during S-07's impl-review.
- **Similar mode's noisy matrix must be generated exactly once per session and held fixed for its whole duration**, including across a page refresh. If regenerated per decision point, the minimax lookahead at an early phase (which internally evaluates hypothetical *future* opponent decisions) would reason against a different noise draw than what actually governs those future decisions when they're reached — a self-contradictory search. This requires persisting the generated table alongside session state in `matchSessionStorage.ts`.
- **`matchSessionStorage.ts` already uses the term `mode` for `"live" | "simulation"`** — the new opponent-behavior selection needs a different name (`OpponentBehavior`) to avoid confusion.
- **7 is never a real color-band score.** `COLOR_BANDS`' representative scores are `{2, 6, 10, 14, 18}` — `NO_SIGNAL_VALUE = 7` (purple or blank) is the only way `cellValue` ever returns 7. This makes `=== NO_SIGNAL_VALUE` a safe, unambiguous way to detect "no real estimate" without inspecting the raw `Estimate` value.

## Desired End State

Clicking "Practice solo" (when the roster gate passes, unchanged) shows a picker with three opponent-behavior options — Random, Mirrored (pre-selected), Similar — each with a one-line description. Starting a session commits to that mode for the session's duration; refreshing mid-session resumes with the same mode (and, for Similar, the identical generated matrix) intact; clicking "Abandon & restart" returns to the picker rather than immediately restarting in the same mode. Live match-mode is completely unaffected — no opponent-behavior concept applies there.

**Verification**: `npm run lint`, `npm run build`, and `npm test` all pass, including the full pre-existing test suite unchanged (regression gate for Phase 1's refactor); manually completing a full session in each of the 3 modes confirms correct, mode-appropriate opponent behavior; a mid-session refresh in Similar mode confirms the opponent's picks stay consistent with the pairing already shown before the refresh.

## What We're NOT Doing

- No UI to view or inspect the generated Similar-mode noisy matrix — it stays fully internal, matching the standing constraint that a captain never sees an "opponent's own matrix" in any form.
- No change to live match-mode — `mode="live"` sessions are untouched; the opponent-behavior concept only exists for `mode="simulation"`.
- No change to the captain's own suggestion logic — always `minimaxSuggestionProvider`/`cellValue`, regardless of the chosen opponent behavior.
- No persisted history of which mode was used across sessions — each new session's picker starts fresh, defaulting to Mirrored.
- No mid-session mode switching — changing mode requires Abandon & restart, which returns to the picker.

## Implementation Approach

Generalize `matchSuggestions.ts`'s private search into a config-driven engine (a per-cell `CellScore` function plus an `oursMaximize` flag), reusable from either perspective with zero behavior change to the existing `minimaxSuggestionProvider`. Layer Mirrored's inversion rule and Similar's fixed-per-session noise table on top as two new `CellScore` implementations, each wired into a new `OpponentMoveProvider` via the generalized engine's new `bestTheir*` exports. Extend session persistence to carry the chosen mode (and Similar's generated table). Finally, introduce a small wrapper component that owns the picker-vs-session decision and the abandon-returns-to-picker flow, without touching `match.astro`'s live-mode path at all.

## Phase 1: Generalize the minimax engine (zero behavior change)

### Overview

Parameterize the existing private search by a per-cell value function and which side maximizes, without changing any existing exported signature's external behavior.

### Changes Required:

#### 1. Search generalization

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Let the same recursive search run from either the captain's or the opponent's perspective, avoiding a ~150-line duplicate tree.

**Contract**:
```ts
export type CellScore = (matrixGrid: MatrixGridData, ourArmyId: ArmyId, theirArmyId: ArmyId) => number;
interface SearchConfig { score: CellScore; oursMaximize: boolean }
```
Thread a `SearchConfig` through every private search function (`scoreOurDefenderCandidate`, `searchOurDefender`, `searchTheirDefender`, `scoreOurAttackerPairCandidate`, `searchOurAttackerPair`, `searchTheirPick`, `searchTheirAttackerPair`, `searchOurAccept`, `continueOrFinish`), replacing every hardcoded `cellValue(...)` call with `config.score(...)`. At each structural aggregation point, pick `Math.max`/`Math.min` based on `config.oursMaximize` (our-structural-nodes use `Math.max` when `oursMaximize` is true, `Math.min` when false; their-structural-nodes use the opposite) — today's `minimaxSuggestionProvider` behavior is exactly `{ score: cellValue, oursMaximize: true }` and must remain byte-for-byte identical.

#### 2. Reserve-strength generalization

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Let the tie-break helper work with an injectable score function, and add its mirror shape for opponent-side candidates.

**Contract**: Widen `reserveStrength(matrixGrid, army, theirAvailable, score: CellScore = cellValue)` with a defaulted 4th param (no call-site changes required for existing callers). Add `export function theirReserveStrength(matrixGrid: MatrixGridData, theirArmy: ArmyId, ourAvailable: ArmyId[], score: CellScore): number` — sums `score(matrixGrid, ourArmy, theirArmy)` over `ourAvailable` for the fixed `theirArmy` (the mirror shape: varying the *first* argument for a fixed second, instead of `reserveStrength`'s varying-second-for-fixed-first).

#### 3. Export what later phases need

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Make `NO_SIGNAL_VALUE` and the matrix key format available to the new Mirrored/Similar modules without duplicating them.

**Contract**: Export `NO_SIGNAL_VALUE` and `cellKey` (both currently private). No behavior change — purely widening the module's public surface.

### Success Criteria:

#### Automated Verification:

- [ ] Full existing test suite passes unchanged: `npm test` (no test file edits in this phase — this is the regression gate)
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- N/A — this phase is a pure internal refactor with no user-facing surface; the existing test suite is the verification.

---

## Phase 2: Mirrored opponent

### Overview

Add the inversion-with-purple-exception value function, the three opponent-facing argmax picks, and a new `OpponentMoveProvider` implementation using them. Widen the provider interface.

### Changes Required:

#### 1. Mirrored value function

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Score a matchup from the opponent's inverted point of view.

**Contract**: `export function mirroredValue(matrixGrid: MatrixGridData, ourArmyId: ArmyId, theirArmyId: ArmyId): number` — returns `NO_SIGNAL_VALUE` unchanged when `cellValue(...) === NO_SIGNAL_VALUE`; otherwise returns `20 - cellValue(matrixGrid, ourArmyId, theirArmyId)`.

#### 2. Opponent-facing argmax picks

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Expose the opponent's actual best choice at each of their three decision points, using the Phase 1 engine with `oursMaximize: false`.

**Contract**:
```ts
export function bestTheirDefender(ourAvailable: ArmyId[], theirAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData, score: CellScore): ArmyId;
export function bestTheirPick(offeredPair: [ArmyId, ArmyId], theirDefender: ArmyId, ourAvailable: ArmyId[], theirAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData, score: CellScore): ArmyId;
export function bestTheirAttackerPair(theirAvailable: ArmyId[], ourAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData, score: CellScore): [ArmyId, ArmyId];
```
`bestTheirDefender` and `bestTheirAttackerPair` use `pickBest` with a `theirReserveStrength`-based tie-break (mirroring `bestOurDefender`/`bestOurAttackerPair`'s own-side tie-break, since both commit one/two of the opponent's own armies). `bestTheirPick` uses `pickBest` with the trivial `() => 0` tie-break — mirroring `bestOurAccept` exactly, since both choose among an *offered* pair rather than committing the decision-maker's own army.

#### 3. Widen `OpponentMoveProvider` and add the Mirrored implementation

**File**: `src/lib/opponentMoves.ts`

**Intent**: Give both providers enough context for a real lookahead, and add the Mirrored implementation.

**Contract**: Widen the interface:
```ts
export interface OpponentMoveProvider {
  pickDefender(theirAvailable: ArmyId[], ourAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData): ArmyId;
  pickAttackerChoice(offeredPair: [ArmyId, ArmyId], theirDefender: ArmyId, ourAvailable: ArmyId[], theirAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData): ArmyId;
  pickAttackerPair(theirAvailable: ArmyId[], ourAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData): [ArmyId, ArmyId];
}
```
Update `createRandomOpponentProvider`'s implementation to match the new signatures (ignoring the newly-added params, same as it already ignores `matrixGrid`). Add `export const mirroredOpponentProvider: OpponentMoveProvider` calling `bestTheirDefender`/`bestTheirPick`/`bestTheirAttackerPair` with `score: mirroredValue` — a plain object, not a factory, since it's fully deterministic given a `matrixGrid` (matching `minimaxSuggestionProvider`'s own plain-object pattern, not `randomOpponentProvider`'s factory pattern).

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- N/A — covered by unit + integration tests below; no wiring into the UI yet (that's Phase 4/5).

---

## Phase 3: Similar opponent

### Overview

Add the fixed-per-session noisy score table and its provider, restorable from a previously-generated table for session resume.

### Changes Required:

#### 1. Noisy score table generation

**File**: `src/lib/opponentMoves.ts`

**Intent**: Generate Similar mode's per-session-fixed matchup values once, covering every combination the session could ever query.

**Contract**: `export function generateSimilarScoreTable(matrixGrid: MatrixGridData, ourArmyIds: ArmyId[], theirArmyIds: ArmyId[], random: () => number = Math.random): Record<string, number>` — for every `(our, their)` combination across the full initial rosters (armies only ever leave the available pool during a session, never rejoin, so the initial full cross-product covers every combination the search could later ask for), keyed via `cellKey` (imported from `matchSuggestions.ts`): if `mirroredValue(matrixGrid, our, their) === NO_SIGNAL_VALUE`, the table value is a uniformly random integer in `[0, 20]`; otherwise it's `mirroredValue(...) + <uniform random integer in [-4, +4]>`, clamped to `[0, 20]`.

#### 2. Similar provider, generate-or-restore

**File**: `src/lib/opponentMoves.ts`

**Intent**: Build a provider backed by the noisy table — either freshly generated (new session) or restored verbatim (resuming a persisted session), so a resumed session's opponent behaves identically to before the refresh.

**Contract**: `export function createSimilarOpponentProvider(matrixGrid: MatrixGridData, ourArmyIds: ArmyId[], theirArmyIds: ArmyId[], options?: { random?: () => number; existingTable?: Record<string, number> }): { provider: OpponentMoveProvider; table: Record<string, number> }`. When `options.existingTable` is supplied, use it directly (no new randomness drawn — resume path). Otherwise generate via `generateSimilarScoreTable` using `options.random` (default `Math.random`). The returned `provider`'s three methods look up `table[cellKey(ourArmyId, theirArmyId)]` as the `CellScore` passed to `bestTheirDefender`/`bestTheirPick`/`bestTheirAttackerPair` — ignoring the `matrixGrid` argument those functions pass through, since the table is already fully materialized.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- N/A — covered by unit + integration tests below; no wiring into the UI yet (that's Phase 4/5).

---

## Phase 4: Session persistence + wiring

### Overview

Persist the chosen opponent behavior (and, for Similar, its generated table) alongside session state, and wire `MatchSession.tsx`'s three opponent-decision phases to the active provider instead of the hardcoded random one.

### Changes Required:

#### 1. Extend session storage

**File**: `src/lib/matchSessionStorage.ts`

**Intent**: Carry the chosen opponent behavior (and Similar's table) through save/load/resume, without affecting live-mode sessions.

**Contract**: Add `export type OpponentBehavior = "random" | "mirrored" | "similar";`. Extend `StoredSession` with optional `opponentBehavior?: OpponentBehavior` and `similarScoreTable?: Record<string, number>` (both `undefined` for `mode: "live"`). Widen `saveSession(opponentId, state, mode, opponentContext?: { behavior: OpponentBehavior; similarScoreTable?: Record<string, number> })` — the 4th param is omitted entirely for live-mode calls. Widen `loadSession`'s return type to `{ state: MatchSessionState; opponentBehavior?: OpponentBehavior; similarScoreTable?: Record<string, number> } | null` (still `null` on no match/corrupt data, exactly as today) — the sole existing call site (`MatchSession.tsx`) updates accordingly.

#### 2. Wire the active provider into MatchSession

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Replace the hardcoded `randomOpponentProvider` reference with whichever provider matches the session's chosen `opponentBehavior`, constructed once and reused for the session's lifetime; extend the Practice badge to name the active mode.

**Contract**: Add a required-when-simulation `opponentBehavior: OpponentBehavior` prop (model `Props` as a discriminated union on `mode` so `opponentBehavior` — and Phase 5's `onAbandon` — are absent/disallowed for `mode: "live"` and required for `mode: "simulation"`). Construct the active `OpponentMoveProvider` once via `useMemo` keyed on `[opponentBehavior, matrixGrid]` (for `"similar"`, using `createSimilarOpponentProvider` with `existingTable` from the loaded session if present, otherwise generating fresh and persisting the result on creation) — this constructed provider, not `randomOpponentProvider`, feeds the three opponent-phase `AutoReveal` `pick` callbacks. Extend the "Practice" badge text to include the mode name (e.g., "Practice · Mirrored").

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- N/A — covered by Phase 5's end-to-end manual verification, once the picker actually supplies `opponentBehavior`.

---

## Phase 5: Mode-picker UI + routing

### Overview

Introduce the pre-session picker, the abandon-returns-to-picker flow, and wire the `/simulate` route through it — without touching `match.astro`'s live-mode path.

### Changes Required:

#### 1. Picker + session wrapper

**File**: `src/components/match/PracticeSetup.tsx` (new)

**Intent**: Decide whether to show the picker or resume/start a session, and own the abandon-returns-to-picker flow.

**Contract**: `PracticeSetup({ opponentId, ourArmies, theirArmies, matrixGrid }: Props)`. On mount, check for an existing resumable simulation session for `opponentId` (via the widened `loadSession`); if found, skip the picker and render `MatchSession` directly with the restored `opponentBehavior` (and, for Similar, the restored table wired through Phase 4's provider construction). If not found, render a 3-option picker (Random / Mirrored pre-selected / Similar, each with a one-line description) and a Start button; on Start, render `MatchSession` with the chosen `opponentBehavior` and an `onAbandon` callback that clears the stored session and resets local state back to showing the picker.

#### 2. Abandon routes back to the picker

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Let the wrapper intercept "Abandon & restart" for simulation sessions, without changing live mode's behavior at all.

**Contract**: Add an optional `onAbandon?: () => void` prop (present only via `PracticeSetup`, per Phase 4's discriminated Props). When present, the restart button calls `onAbandon()` instead of its existing internal `clearSession` + `createSession` logic; when absent (every `mode: "live"` call site, i.e. `match.astro`, unchanged), today's exact restart behavior is preserved.

#### 3. Route wiring

**File**: `src/pages/dashboard/opponents/[id]/simulate.astro`

**Intent**: Hand off to the picker instead of jumping straight into a session, once the roster gate passes.

**Contract**: Same roster-readiness gate as today, unchanged (checked *before* anything mode-related, per the confirmed gate-first ordering). Replace the ready-branch's `<MatchSession mode="simulation" ... />` with `<PracticeSetup ... />`, passing through the same `opponentId`/`ourArmies`/`theirArmies`/`matrixGrid` props.

### Success Criteria:

#### Automated Verification:

- [ ] Full build passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm test`

#### Manual Verification:

- [ ] From an opponent's page with both rosters at exactly 5 armies, "Practice solo" shows the 3-option picker with Mirrored pre-selected
- [ ] Starting a Random-mode session behaves identically to S-07's shipped behavior
- [ ] Starting a Mirrored-mode session: the opponent's picks are consistent with a hand-verifiable inverted-matrix scenario (an obviously-best defender/pair/pick given rigged estimates)
- [ ] Starting a Similar-mode session: the opponent's picks stay internally consistent across sub-rounds (no contradictory lookahead), and refreshing mid-session shows the same opponent choices as before the refresh
- [ ] The "Practice" badge names the active mode throughout a session
- [ ] "Abandon & restart" during any simulation-mode session returns to the picker, not directly into a new same-mode session
- [ ] Live match-mode ("Start match mode") is completely unaffected — no picker, no badge change, no behavior difference from before this change
- [ ] With a roster below 5 on either side, "Practice solo" shows the not-ready message before any picker appears

---

## Testing Strategy

### Unit Tests:

- `src/lib/matchSuggestions.test.ts`: no new tests required for Phase 1 itself (the existing suite is the regression gate) — extend with tests for `theirReserveStrength` and the widened `reserveStrength` default-param behavior.
- New tests for `mirroredValue` (independent oracle: hand-picked non-purple values invert correctly; purple/blank stays exactly `NO_SIGNAL_VALUE`).
- New tests for `bestTheirDefender`/`bestTheirPick`/`bestTheirAttackerPair` using hand-constructed grids with an independently-verified expected pick (mirroring `matchSuggestions.test.ts`'s existing pattern) — including a tie case verifying the `theirReserveStrength` tie-break for the two defender/attacker-pair functions, and a tie case verifying `bestTheirPick`'s trivial first-candidate tie-break.
- `src/lib/opponentMoves.test.ts`: tests for `generateSimilarScoreTable` with injected deterministic random sequences — boundary clamping at 0 and 20, purple/blank producing the full `[0,20]` range (not the narrower mirrored-±4 band), and a restore-from-`existingTable` test proving identical picks to the original generation.
- `src/lib/matchSessionStorage.test.ts`: extend for the new `opponentBehavior`/`similarScoreTable` fields — round-trip, and confirm `mode: "live"` sessions are unaffected by the new optional fields.

### Integration Tests:

- One per new mode (Mirrored, Similar), mirroring `matchSessionEngine.test.ts`'s `runSubRound` pattern: drive a full simulated sub-round through the real `matchSessionEngine.ts` transition functions with the new provider supplying the opponent's picks, and verify the resulting pairing matches the theoretically correct outcome for a hand-constructed scenario.

### Manual Testing Steps:

1. Build a team and an opponent, each with exactly 5 armies, with pairing-matrix estimates entered (including at least one purple cell).
2. From the opponent's page, click "Practice solo"; confirm the picker shows with Mirrored pre-selected.
3. Play a full Random-mode session; confirm it behaves exactly as it did before this change.
4. Play a full Mirrored-mode session against a matrix where the theoretically-optimal opponent picks are obvious by inspection; confirm the opponent's reveals match.
5. Play a full Similar-mode session; refresh mid-session and confirm the opponent's subsequent picks stay consistent with what was already shown.
6. Click "Abandon & restart" during any simulation session; confirm it returns to the picker, not directly into a new session.
7. Confirm the "Practice" badge names the active mode throughout.
8. Start a live match-mode session and confirm it's entirely unaffected (no picker, no badge change).
9. Try "Practice solo" with an incomplete roster; confirm the not-ready message appears before any picker.

## Performance Considerations

The generalized search has the exact same asymptotic cost as today's `minimaxSuggestionProvider` (documented in its own comment: trivial at the 5-per-side cap) — Mirrored/Similar just run the same shape of search from the other side, not an additional multiplier. `generateSimilarScoreTable` is a one-time O(25) computation per session (5×5 initial roster cross-product).

## Migration Notes

None — no schema changes. `matchSessionStorage.ts`'s existing `"live"`-mode key and shape are unaffected; the new fields are optional additions to the `"simulation"`-mode payload only.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-08, milestone M-2 — scope expanded during this plan)
- Related implementation: `src/lib/matchSuggestions.ts`, `src/lib/opponentMoves.ts`, `src/lib/matchSessionStorage.ts`, `src/components/match/MatchSession.tsx`, `src/pages/dashboard/opponents/[id]/simulate.astro`
- Precedent for a swappable provider seam: `context/archive/2026-09-11-live-match-mode-session/plan.md`, `context/archive/2026-09-11-live-match-recommender/plan.md`, `context/archive/2026-09-12-pairing-simulation-session/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Generalize the minimax engine (zero behavior change)

#### Automated

- [x] 1.1 Full existing test suite passes unchanged: `npm test` — 8915564
- [x] 1.2 Type checking passes as part of build: `npm run build` — 8915564
- [x] 1.3 Linting passes: `npm run lint` — 8915564

### Phase 2: Mirrored opponent

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 64fd86b
- [x] 2.2 Type checking passes as part of build: `npm run build` — 64fd86b
- [x] 2.3 Linting passes: `npm run lint` — 64fd86b

### Phase 3: Similar opponent

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Type checking passes as part of build: `npm run build`
- [ ] 3.3 Linting passes: `npm run lint`

### Phase 4: Session persistence + wiring

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Type checking passes as part of build: `npm run build`
- [ ] 4.3 Linting passes: `npm run lint`

### Phase 5: Mode-picker UI + routing

#### Automated

- [ ] 5.1 Full build passes: `npm run build`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Unit tests pass: `npm test`

#### Manual

- [ ] 5.4 Picker shows with Mirrored pre-selected
- [ ] 5.5 Random-mode session behaves identically to S-07's shipped behavior
- [ ] 5.6 Mirrored-mode session's opponent picks match a hand-verifiable scenario
- [ ] 5.7 Similar-mode session stays internally consistent, including across a mid-session refresh
- [ ] 5.8 "Practice" badge names the active mode throughout
- [ ] 5.9 "Abandon & restart" returns to the picker
- [ ] 5.10 Live match-mode is completely unaffected
- [ ] 5.11 Incomplete roster shows not-ready messaging before any picker
