# Solo Pairing Simulation (Random Opponent) Implementation Plan

## Overview

Let a captain run a solo pairing-simulation session against a prepared opponent matrix, without a second human present. The captain still makes their own three decisions manually (defender, attacker pair, accept), receiving the same minimax-derived suggestions as live match-mode. At each of the opponent's three decision points, the app automatically picks the opponent's move — uniformly at random for this increment — and shows the captain what was picked before they continue. This is roadmap slice S-07 (`context/foundation/roadmap.md`, milestone M-2); slice S-08 (separate change) later swaps the random opponent pick for the existing minimax engine's opponent-optimal logic behind the same seam this plan builds.

## Current State Analysis

Live match-mode (`src/components/match/MatchSession.tsx`) already implements the full two-sub-round session mechanics via a pure state machine (`src/lib/matchSessionEngine.ts`). The three opponent-decision transition functions (`enterTheirDefender`, `enterTheirPick`, `enterTheirAttackerPair`) take the opponent's choice as a plain argument — the engine has no idea whether a human clicked it or it was computed. Today, `MatchSession.tsx` is the only place that decides how that value is obtained: it renders `SinglePicker`/`PairPicker` components and waits for a human click (lines 277-319). Session state persists across a page refresh via a single global `localStorage` slot (`src/lib/matchSessionStorage.ts`) with no notion of session mode. The captain's own three decision points already use `minimaxSuggestionProvider` (`src/lib/matchSuggestions.ts`) regardless of anything about the opponent side, and will continue to do so unchanged.

### Key Discoveries:

- `matchSessionEngine.ts`'s opponent-entry functions need **zero changes** — they're already agnostic to where the opponent's choice comes from (`src/lib/matchSessionEngine.ts:117-204`).
- Roster size is fixed at exactly 5 per side to enter match mode (`MAX_ROSTER_SIZE` in `src/lib/rosterLimits.ts:1`, enforced in `src/pages/dashboard/opponents/[id]/match.astro:54-56`), and both sides always lose exactly 2 armies per completed sub-round (5→3→1) — so every "their-attacker-pair" phase always has exactly 2 armies available when reached. A general random-pair picker is still used (not hardcoded to "the only 2 left") so it keeps working if roster size ever changes (parked FR-016).
- `matchSessionStorage.ts`'s `StoredSession` and its single `STORAGE_KEY` assume "only one match-mode session is ever active" (`src/lib/matchSessionStorage.ts:3-6`) — this plan adds a `mode` dimension so a live and a simulation session for the same opponent don't clobber each other.
- No React component tests exist anywhere in this repo (`find src -iname "*.test.tsx"` → none) — only pure-function unit tests via Vitest (`matchSessionEngine.test.ts`, `matchSuggestions.test.ts`, `matchSessionStorage.test.ts`). This plan follows that convention: new pure logic gets unit tests; the UI wiring is manually verified.
- The `MatchSuggestionProvider` interface (`src/lib/matchSuggestions.ts:6-22`) is the established precedent for "ship a swappable interface behind a placeholder implementation, then swap it later" (used for S-03→S-06). This plan applies the same pattern for the opponent side: `OpponentMoveProvider`, backed by a random implementation now, swapped for a minimax-based one in S-08.

## Desired End State

A captain can open a new "Practice solo" entry point from an opponent's page, land on a solo simulation session with the same exact-5-roster gate as live match-mode, make their own three decisions per sub-round with suggestions exactly as today, and watch the app reveal a randomly-chosen opponent move at each of the opponent's three decision points (with a "Continue" step to acknowledge it) — ending in the same auto-paired refused-attacker outcome as a live session. The session is visibly marked as practice and does not interfere with any live match-mode session for the same opponent.

**Verification**: `npm run lint`, `npm run build`, and `npm test` all pass; manually walking a full solo simulation session end-to-end (both sub-rounds) confirms the opponent's moves are revealed with a Continue step, the session completes with the practice-specific completion copy, and a separate live match-mode session for the same opponent (if started) is unaffected.

## What We're NOT Doing

- No UI to enter or edit an opponent's own matrix — the opponent's simulated moves are either random (this slice) or, later (S-08), derived from the captain's own matrix estimates mirrored as the opponent's perspective. Never a separately-entered opponent matrix.
- No algorithmic/minimax-based opponent play — that's S-08, a separate change, swapping the `OpponentMoveProvider` implementation this plan introduces.
- No persisted history of simulation sessions (no new database table/schema) — matches live match-mode's existing behavior and the product's standing non-goal on post-match history.
- No relaxation of the roster-readiness gate — simulation requires exactly 5 armies per side, identical to live match-mode.
- No multiple opponent-behavior mode selector (random vs. same-matrix vs. similar-matrix) — that's MS-05, explicitly parked for a later increment beyond this milestone.
- No new component-testing framework/library — this repo has no React component tests today; this plan doesn't introduce that tooling.

## Implementation Approach

Keep `matchSessionEngine.ts` completely untouched — it already supports this use case. Add a new, independently-testable `OpponentMoveProvider` abstraction (mirroring `MatchSuggestionProvider`) with a random implementation, and extend session storage with a `mode` tag. Then wire `MatchSession.tsx` to branch its three opponent-decision phases: in `"simulation"` mode, a new reveal-and-continue component computes the provider's pick once per phase-entry (via a lazy `useState` initializer, remounted naturally by the existing conditional-render-per-phase pattern — the same trick `PairPicker`'s local `selected` state already relies on) and shows it before advancing, instead of rendering an interactive picker. Finally, add a sibling route and an entry-point link.

## Phase 1: Opponent-move provider + storage mode separation

### Overview

Add the swappable `OpponentMoveProvider` interface and its random implementation, and extend session storage to keep live and simulation sessions separate. Pure logic, no UI changes yet.

### Changes Required:

#### 1. Opponent-move provider

**File**: `src/lib/opponentMoves.ts` (new)

**Intent**: Define the seam S-08 will later swap to a minimax-based implementation, and provide the random implementation this slice uses. Mirrors `MatchSuggestionProvider`'s shape and signature style so the two providers read as siblings.

**Contract**:
```ts
export interface OpponentMoveProvider {
  pickDefender(theirAvailable: ArmyId[], ourAvailable: ArmyId[], matrixGrid: MatrixGridData): ArmyId;
  pickAttackerChoice(offeredPair: [ArmyId, ArmyId], theirDefender: ArmyId, matrixGrid: MatrixGridData): ArmyId;
  pickAttackerPair(theirAvailable: ArmyId[], ourDefender: ArmyId, matrixGrid: MatrixGridData): [ArmyId, ArmyId];
}
```
`matrixGrid` and the "our-side" parameters are accepted but unused by the random implementation — they're part of the interface now so S-08's minimax-based implementation (which needs them) is a drop-in swap, not a signature change.

Export `createRandomOpponentProvider(random: () => number = Math.random): OpponentMoveProvider` (a factory taking an injectable `[0,1)` random source, so tests can supply a fixed sequence instead of mocking `Math.random`) and a ready-to-use `randomOpponentProvider = createRandomOpponentProvider()` for production call sites. `pickAttackerPair` must pick 2 *distinct* indices from `theirAvailable` — don't assume exactly 2 elements are available even though today's fixed roster size (5→3→1) guarantees it (see Key Discoveries).

#### 2. Session storage mode separation

**File**: `src/lib/matchSessionStorage.ts`

**Intent**: Let a live session and a simulation session for the same opponent coexist without clobbering each other, per the confirmed design choice.

**Contract**: Add `mode: "live" | "simulation"` as a required parameter to `saveSession`, `loadSession`, and `clearSession`, and to the persisted `StoredSession` shape. Use two distinct storage key constants (keep the existing `"pairing-assistant:match-session"` key for `"live"` unchanged, so existing live sessions in a captain's browser aren't silently dropped by this change; add a new `"pairing-assistant:simulation-session"` key for `"simulation"`). `loadSession` still returns `null` when the stored session's `opponentId` doesn't match, exactly as today, in addition to selecting by mode.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- N/A — this phase is pure logic with full unit coverage; no user-facing surface yet.

---

## Phase 2: Simulation UI wiring in MatchSession

### Overview

Add a `mode` prop to `MatchSession`, branch the three opponent-decision phases to a new reveal-and-continue UI when in simulation mode, and add practice-specific visual cues.

### Changes Required:

#### 1. Reveal-and-continue component

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Add a local `AutoReveal` component (sibling to the existing `SinglePicker`/`PairPicker`) that computes the opponent provider's pick once when it mounts, displays it, and lets the captain click Continue to advance — instead of an interactive picker.

**Contract**: `AutoReveal<T>({ pick: () => T; renderLabel: (value: T) => string; onContinue: (value: T) => void })`. Compute the pick via a lazy `useState(pick)` initializer (never recomputed on re-render) — relies on the same conditional-render-per-phase remount behavior `PairPicker`'s local `selected` state already depends on (see the existing comment at `MatchSession.tsx:110-113`), so no new reset logic is needed. Render the computed value's label plus a "Continue" button calling `onContinue` with the stored value.

#### 2. Mode-branched phase rendering

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Add a required `mode: "live" | "simulation"` prop. In `"simulation"` mode, render `AutoReveal` instead of `SinglePicker`/`PairPicker` for the three opponent phases (`their-defender`, `their-pick`, `their-attacker-pair`), using `randomOpponentProvider` from `opponentMoves.ts` for the computed pick; in `"live"` mode, behavior is unchanged. Thread `mode` through to `loadSession`/`saveSession`/`clearSession` (now requiring it per Phase 1). The captain's own three decision points (`our-defender`, `our-attacker-pair`, `our-accept`) are unaffected by `mode` — they always use `minimaxSuggestionProvider`, per the confirmed requirement that the captain still gets suggestions in simulation.

#### 3. Practice visual cues

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Make a simulation session visually distinct from a live one so a captain never mistakes practice output for a real match record.

**Contract**: When `mode === "simulation"`, render a small "Practice" badge near the existing sub-round/phase status line, and change the `"complete"` phase's heading text from `"Session complete!"` to `"Practice session complete!"`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes as part of build: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] With `mode="simulation"` wired to a temporary/dev entry point, the three opponent phases show a reveal-and-continue UI (not clickable army buttons), and clicking Continue advances the session correctly
- [ ] The captain's own three decision points still show suggestions exactly as in live mode
- [ ] The "Practice" badge is visible throughout, and the completion screen reads "Practice session complete!"

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3 — Phase 3 is what actually exposes this to a captain via routing, so verify the component behavior directly first (e.g., via a temporary hardcoded `mode="simulation"` prop value, reverted before Phase 3 lands the real route).

---

## Phase 3: Route + entry point

### Overview

Expose the simulation mode to captains via a new route and a link from the opponent page, wiring Phase 1 and 2's work into an end-to-end usable feature.

### Changes Required:

#### 1. Simulation route

**File**: `src/pages/dashboard/opponents/[id]/simulate.astro` (new)

**Intent**: Mirror `match.astro`'s data loading and exact-5 roster-readiness gate, rendering `MatchSession` with `mode="simulation"` and practice-appropriate page copy ("Practice mode" instead of "Match mode").

**Contract**: Same server-side data loading (`getOpponentWithArmies`, `getTeamWithArmies`, `getMatrixGrid`) and the same `rosterReady = ourCount === MAX_ROSTER_SIZE && theirCount === MAX_ROSTER_SIZE` gate as `match.astro:54-56`, reusing the identical redirect-on-missing-data behavior. The only differences: page title/heading say "Practice mode", and `<MatchSession mode="simulation" ... />`.

#### 2. Entry-point link

**File**: `src/components/opponent/OpponentDetail.tsx`

**Intent**: Give captains a way to discover solo simulation from the opponent page, alongside the existing live match-mode link.

**Contract**: Add a second link next to the existing "Start match mode" link (`OpponentDetail.tsx:33-38`), pointing to `/dashboard/opponents/${opponent.id}/simulate`, labeled "Practice solo".

### Success Criteria:

#### Automated Verification:

- [ ] Full build passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm test`

#### Manual Verification:

- [ ] From an opponent's page with both rosters at exactly 5 armies, "Practice solo" navigates to the new route and starts a solo simulation session
- [ ] A full solo session (both sub-rounds) completes end-to-end: captain's own three picks per sub-round show suggestions; each opponent phase shows a reveal-and-continue step; session ends with the same auto-paired refused-attacker outcome as live match-mode, under "Practice session complete!"
- [ ] Refreshing mid-session resumes the simulation session correctly (persisted via the `"simulation"`-mode storage key)
- [ ] Starting a live match-mode session for the same opponent (via "Start match mode") does not lose or get confused with an in-progress simulation session for that same opponent, and vice versa
- [ ] With a roster below 5 on either side, "Practice solo" shows the same not-ready messaging as live match-mode (adapted for the practice route)

---

## Testing Strategy

### Unit Tests:

- `src/lib/opponentMoves.test.ts` (new): `createRandomOpponentProvider` with an injected deterministic random source — `pickDefender` and `pickAttackerChoice` return the expected element for boundary random values (e.g. `0` and just-under-`1`); `pickAttackerPair` returns 2 distinct elements from the available list across several injected sequences, including a boundary case with more than 2 available armies to prove it isn't hardcoded to "the only 2 left" (see Key Discoveries).
- `src/lib/matchSessionStorage.test.ts` (extend existing): round-trips a saved session per mode; a `"live"` session and a `"simulation"` session for the same `opponentId` don't overwrite each other; `loadSession` still returns `null` for a mismatched `opponentId` within the same mode.

### Integration Tests:

- None new for this slice — `matchSessionEngine.ts` is unchanged and already has full engine-level coverage in `matchSessionEngine.test.ts`; this slice adds no new state-machine transitions, only a new caller of existing ones.

### Manual Testing Steps:

1. Build a team and an opponent, each with exactly 5 armies, with pairing-matrix estimates entered.
2. From the opponent's page, click "Practice solo" and confirm the simulation session starts.
3. Play through sub-round 1: pick a defender (suggestion shown), see the opponent's revealed defender with a Continue step, offer an attacker pair (suggestion shown), see the opponent's pick with a Continue step, see the opponent's offered attacker pair with a Continue step, accept one (suggestion shown).
4. Repeat for sub-round 2, then confirm the forced refused-attacker pairing appears and the completion screen reads "Practice session complete!".
5. Refresh mid-session and confirm it resumes correctly.
6. Start a live match-mode session for the same opponent and confirm it doesn't disturb a still-in-progress simulation session (and vice versa, starting a simulation doesn't disturb an in-progress live session).
7. Try "Practice solo" with an incomplete roster (< 5 on either side) and confirm the not-ready message shows instead of starting a session.

## Performance Considerations

None — all new logic is O(1) random selection over at most 5 elements; no new network or database calls.

## Migration Notes

None — no schema or persisted-data changes; `matchSessionStorage.ts`'s existing live-session storage key is preserved unchanged, so no migration of previously-stored live sessions is needed.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-07, milestone M-2)
- Related implementation: `src/lib/matchSessionEngine.ts`, `src/lib/matchSuggestions.ts`, `src/components/match/MatchSession.tsx`, `src/lib/matchSessionStorage.ts`, `src/pages/dashboard/opponents/[id]/match.astro`, `src/components/opponent/OpponentDetail.tsx`
- Precedent for a swappable provider seam: `context/archive/2026-09-11-live-match-mode-session/plan.md`, `context/archive/2026-09-11-live-match-recommender/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Opponent-move provider + storage mode separation

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking passes as part of build: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

### Phase 2: Simulation UI wiring in MatchSession

#### Automated

- [ ] 2.1 Type checking passes as part of build: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Opponent phases show reveal-and-continue UI in simulation mode, and Continue advances the session correctly
- [ ] 2.4 Captain's own three decision points still show suggestions exactly as in live mode
- [ ] 2.5 "Practice" badge visible throughout; completion screen reads "Practice session complete!"

### Phase 3: Route + entry point

#### Automated

- [ ] 3.1 Full build passes: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Unit tests pass: `npm test`

#### Manual

- [ ] 3.4 "Practice solo" navigates to the new route and starts a solo simulation session (rosters at exactly 5)
- [ ] 3.5 A full solo session completes end-to-end with correct suggestions, reveals, and refused-attacker outcome
- [ ] 3.6 Refreshing mid-session resumes the simulation session correctly
- [ ] 3.7 Live and simulation sessions for the same opponent don't interfere with each other
- [ ] 3.8 Incomplete roster (< 5) shows not-ready messaging instead of starting a session
