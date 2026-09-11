# Live Match-Mode Session (Increment 1: Mechanics) Implementation Plan

## Overview

Build the live match-mode session mechanics described in PRD US-01 / FR-007–FR-015: a captain runs the full defender/attacker reveal sequence against a prepared opponent matrix, across two sub-rounds, ending in an auto-paired refused attacker. This is **increment 1 of 2**: the suggestion engine returns a uniform-random pick among currently-valid armies, behind an interface a follow-up change will swap for the real FR-013 scoring algorithm. All other mechanics (committed-army tracking, the guardrail against re-suggesting a used army, the sub-round state machine, the exactly-5-roster gate) are built to their real, final shape in this increment.

## Current State Analysis

Nothing resembling "match," "session," "committed army," or "used army" exists anywhere in the schema, `src/lib/**`, or `src/pages/**` — confirmed by full codebase survey. What does exist and this plan builds on:

- **Data**: `teams`/`team_armies`/`opponents`/`opponent_armies`/`pairing_matrix_estimates`, all `captain_id`-scoped with RLS (`supabase/migrations/20260904185524_create_pairing_domain_schema.sql`, `20260907190708_add_purple_estimate_marker.sql`).
- **Data access**: `src/lib/teams.ts`, `src/lib/opponents.ts` (roster CRUD, `MAX_ROSTER_SIZE` from `src/lib/rosterLimits.ts:1`), `src/lib/matrix.ts` (`getMatrixGrid`, `upsertEstimate`).
- **Color bands**: `src/lib/colorBands.ts` (`scoreToBand`/`bandToScore`).
- **UI**: `src/pages/dashboard/opponents/[id].astro` → `OpponentDetail.tsx` (roster management + `<MatrixGrid client:load />`).
- **cap-roster-size**'s plan (`context/archive/2026-09-08-cap-roster-size/plan.md:167`) explicitly promised, but did not implement, "entering live match-mode should validate that both the team and the selected opponent have exactly 5 armies before starting a session" — this plan delivers that promise.

## Desired End State

A captain on an opponent's detail page can click "Start match mode," and — provided both their team roster and that opponent's roster have exactly 5 armies — is walked through a two-sub-round defender/attacker reveal sequence in the browser, with a random suggestion offered (and overridable) at each of the 3 decision points, ending in an on-screen summary that includes the auto-paired final refused-attacker matchup. No network round-trip happens during the session itself; a page refresh mid-session resumes exactly where the captain left off (same device/browser).

**Verification**: run `npm run dev`, prepare a 5-army team + a 5-army opponent matrix, click "Start match mode," complete a full session, and confirm the final summary lists 2 defender pairings, 2 accepted-attacker pairings, and 1 refused-attacker pairing per side (5 total each).

### Key Discoveries:

- `src/lib/matrix.ts:61-67` establishes this codebase's load-bearing convention: RLS's `WITH CHECK` only validates a new row's own `captain_id`, not that FK-referenced rows belong to the same captain — app code must re-verify. This plan sidesteps the issue entirely for session state (no new writes, client-only), but any future increment-2 change touching new tables must follow this pattern.
- `tech-stack.md:24-26` confirms the stack (Astro + React islands) was chosen specifically for this feature's "client-heavy, low-network-dependency live match-mode" requirement — validating the client-only architecture decision below.
- No wizard/multi-step-flow precedent exists anywhere in the codebase; `MatrixGrid.tsx`'s per-cell `openCell`/`savingCell` local-state pattern is the closest existing analog for an interactive island driving its own local state machine.

## What We're NOT Doing

- **The real FR-013 scoring algorithm** — suggestions are uniform-random for this increment; the weighing of immediate matchup vs. downstream refused-attacker impact is a follow-up change, built behind the `MatchSuggestionProvider` interface this plan introduces.
- **Server-side session persistence** — no new database table, no cross-device/cross-browser session resume. Session state lives in `localStorage`; a different device or a cleared browser loses it.
- **In-session undo / step-back** — a captain who mis-enters a step abandons and restarts the whole session; no history/undo stack.
- **Allowing sessions to start with incomplete rosters** — the exactly-5-per-side gate is a hard block, not a warning.
- **Roster sizes other than 5** — the engine is written N-vs-N generically (no hardcoded "2 sub-rounds"), but only 5-vs-5 is gated, tested, or UI-supported at MVP. Picking up FR-016 later should not require rewriting the engine.
- **Post-match history / score tracking** — matches the PRD non-goal; session state is discarded (not archived anywhere) on completion or abandonment.
- **Multi-tab or multi-device session sync/conflict-resolution** — a single `localStorage` slot; starting a session for a different opponent silently discards whatever was there before.

## Implementation Approach

The session state machine and suggestion logic are pure, framework-free TypeScript (`src/lib/**`) so the riskiest logic — the committed-army exclusion guardrail and the sub-round math — is fully unit-testable without a browser. A thin `localStorage` wrapper handles persistence. A single new React island (`MatchSession.tsx`) wires engine + suggestions + storage to the UI. No new database schema or API routes are needed since nothing is written server-side during a session.

## Critical Implementation Details

**Sub-round mechanics** (confirmed, not otherwise derivable from any file): each sub-round runs two parallel defend/attack exchanges simultaneously. Both captains reveal a defender. We offer 2 attackers against their defender (suggested) and they pick one; symmetrically, they offer 2 attackers against our defender and we pick one (suggested) — the two attackers offered but not picked return to their side's available pool. Only the defender + the one accepted attacker per side get committed per sub-round. The engine should therefore loop `while (ourAvailable.length > 1 && theirAvailable.length > 1)`, not hardcode "2 sub-rounds" — for a 5-army roster this naturally produces exactly 2 sub-rounds before the loop condition fails and the single remaining army on each side is auto-paired as the refused attacker.

**Suggestion provider seam**: `matchSuggestions.ts` exports a `MatchSuggestionProvider` shape — `suggestDefender(ourAvailable, theirAvailable, matrixGrid): ArmyId`, `suggestAttackerPair(ourAvailable, theirDefender, matrixGrid): [ArmyId, ArmyId]`, `suggestAcceptedAttacker(ourDefender, theirOfferedPair, ourAvailable, matrixGrid): ArmyId`. `matchSessionEngine.ts` takes a provider as a parameter (dependency injection) rather than importing the random implementation directly — production wiring passes `randomSuggestionProvider`; unit tests pass a deterministic fake; the future increment-2 change passes the real algorithm. `matrixGrid` is threaded through every signature even though the random provider ignores it, so the interface doesn't change shape when increment 2 lands.

**Storage access via `globalThis.localStorage`, not `window.localStorage`**: keeps `matchSessionStorage.ts` trivially testable under the project's `@cloudflare/vitest-pool-workers` runtime (which has no `window`/DOM) by assigning a small in-memory fake to `globalThis.localStorage` in the test file, rather than requiring a jsdom environment change.

## Phase 1: Session engine & suggestion logic

### Overview

The core state machine and suggestion logic, as pure TypeScript with no UI or storage dependency — the highest-risk logic (committed-army exclusion, correct sub-round/auto-pair math), isolated and fully unit-testable.

### Changes Required:

#### 1. Suggestion provider

**File**: `src/lib/matchSuggestions.ts`

**Intent**: Define the `MatchSuggestionProvider` interface and a `randomSuggestionProvider` implementation that picks uniformly at random among the armies it's given, never returning an army outside the provided available set.

**Contract**: Exports `MatchSuggestionProvider` (the 3-method shape in Critical Implementation Details) and `randomSuggestionProvider: MatchSuggestionProvider`. `suggestAttackerPair` must return 2 distinct army IDs.

#### 2. Session engine

**File**: `src/lib/matchSessionEngine.ts`

**Intent**: Pure state machine implementing the confirmed sub-round mechanics. Exposes functions to create a fresh session from two army rosters, advance it through each phase (our defender → their defender → our attacker-pair offer → their pick → their attacker-pair offer → our accept → sub-round complete → next sub-round or refused-attacker auto-pair → complete), and query whether it's finished.

**Contract**: `createSession(ourArmies, theirArmies, provider, matrixGrid): MatchSessionState`. A discriminated-union `phase` field drives which action is expected next. Every phase transition that commits an army asserts it is currently in the relevant available set (defensive check backing the "never suggest/accept an already-committed army" guardrail — FR-014). The engine takes the `MatchSuggestionProvider` as a parameter, never importing `randomSuggestionProvider` directly, per the seam described above.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/lib/matchSessionEngine.test.ts src/lib/matchSuggestions.test.ts`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Walk through `matchSessionEngine.ts`'s phase transitions side-by-side with the "Sub-round mechanics" description in this plan to confirm no mismatch before building UI on top of it.

---

## Phase 2: Persistence layer

### Overview

A thin `localStorage` wrapper and the session lifecycle rules: resume when re-entering the same opponent's match page, discard silently when starting a session for a different opponent.

### Changes Required:

#### 1. Storage wrapper

**File**: `src/lib/matchSessionStorage.ts`

**Intent**: Serialize/deserialize `MatchSessionState` to a single `localStorage` key, scoped by nothing but its own presence (one active session at a time, app-wide). Reads via `globalThis.localStorage` (see Critical Implementation Details).

**Contract**: `saveSession(state): void`, `loadSession(): MatchSessionState | null`, `clearSession(): void`. `loadSession` returns `null` (not a throw) on missing/corrupt data.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/lib/matchSessionStorage.test.ts`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- In a real browser session (once Phase 3's UI exists), start a session, commit a couple of steps, refresh the page, and confirm state resumes exactly where it left off.
- Start a session for opponent A, then start one for opponent B without finishing A's; confirm A's session no longer resumes afterward.

---

## Phase 3: UI

### Overview

Wire the engine, suggestion provider, and storage into a React island and a new route, with the exactly-5-roster gate, suggestion-highlighted pickers, and an abandon/restart action.

### Changes Required:

#### 1. Match-mode page

**File**: `src/pages/dashboard/opponents/[id]/match.astro`

**Intent**: SSR-load the team, opponent, and matrix (reusing `getTeamWithArmies`/`getOpponentWithArmies`/`getMatrixGrid`). If either roster doesn't have exactly `MAX_ROSTER_SIZE` (5) armies, render a blocking message naming which side is short and by how many — no session island is mounted. Otherwise render `<MatchSession ... client:load />`.

**Contract**: Route `/dashboard/opponents/:id/match`; already covered by `PROTECTED_ROUTES` (`/dashboard` prefix). No new query-param/redirect wiring — the gate message renders inline on this page.

#### 2. Match-mode island

**File**: `src/components/match/MatchSession.tsx`

**Intent**: Own the session's React state, seeded from `matchSessionStorage.loadSession()` if present for this session, else `matchSessionEngine.createSession(...)`. Renders the current phase's picker (defender / opponent-defender-entry / attacker-pair / opponent-pick-entry / opponent-attacker-pair-entry / accept), with the engine-suggested option visually highlighted among the full list of currently-available armies (captain can tap any to confirm). Saves to storage after every committed step. Includes an "Abandon & restart" action that clears storage and re-creates a fresh session. Renders a final summary (all 5 pairings per side, refused attacker called out) when `phase === "complete"`.

**Contract**: Props `{ ourArmies, theirArmies, matrixGrid }`. Suggestion pickers follow the "full picker, suggestion highlighted" UX decision — never a pre-selected default.

#### 3. Entry point

**File**: `src/components/opponent/OpponentDetail.tsx`

**Intent**: Add a "Start match mode" link to the new route, alongside the existing roster-management UI.

**Contract**: Plain link (`<a href="/dashboard/opponents/{id}/match">`) — no form submission, since starting a session creates no server-side record.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Full walkthrough via `npm run dev`: from an opponent's detail page, click "Start match mode," complete a full 5-vs-5 two-sub-round session, and confirm the final summary shows 2 defender pairings + 2 accepted-attacker pairings + 1 refused-attacker pairing per side.
- Trim either roster below 5 armies, navigate to the match page, and confirm the blocking message appears with no session UI.
- Confirm the suggested army is visually highlighted at each of the 3 decision points, and that tapping a different available army overrides it.
- Confirm "Abandon & restart" clears the in-progress session and returns to the first defender-suggestion step.
- With the match page already loaded, disable the network (devtools offline mode) and confirm the session continues to work through to completion with no perceptible delay.

---

## Phase 4: End-to-end verification

### Overview

A full-sequence browser test of the mechanics built in Phases 1–3. This phase is executed via `/10x-e2e` (this project's established E2E workflow, per `CLAUDE.md`'s Module 3 Lesson 4), not `/10x-implement` — it shares this plan's Progress tracking but is driven separately once Phases 1–3 are implemented and manually verified.

### Changes Required:

#### 1. Full-session E2E test

**File**: (created by `/10x-e2e`, path TBD by that skill's convention)

**Intent**: Drive the full two-sub-round session end-to-end in a real browser — start, both sub-rounds' defender/attacker/accept steps, and the refused-attacker summary — asserting no committed army is ever offered again, matching PRD US-01's acceptance criteria.

**Contract**: Covers test-plan.md §2 risk #1 (committed-army exclusion half) and risk #6 (exactly-5 gate) at the e2e layer, per `test-plan.md` §3 Phase 3.

### Success Criteria:

#### Automated Verification:

- E2E test passes (command TBD by `/10x-e2e`'s tooling choice)

#### Manual Verification:

- N/A — this phase's verification is the e2e test itself.

---

## Testing Strategy

### Unit Tests:

- `matchSessionEngine.test.ts`: full 5-vs-5 walkthrough (2 sub-rounds + refused-attacker auto-pair) using a deterministic fake `MatchSuggestionProvider`; every phase transition asserts committed armies are never re-offered; verifies a not-picked offered attacker returns to its side's available pool.
- `matchSuggestions.test.ts`: `randomSuggestionProvider` never returns an army outside the given available set; `suggestAttackerPair` always returns 2 distinct armies.
- `matchSessionStorage.test.ts`: save/load/clear round-trip against an in-memory `globalThis.localStorage` fake; `loadSession()` returns `null` on missing/corrupt data rather than throwing.

### Integration Tests:

- None planned — no new database writes or API routes exist in this increment (all state is client-side).

### Manual Testing Steps:

1. Full 5-vs-5 session walkthrough via the running dev app (see Phase 3 Manual Verification).
2. Exactly-5 gate with an incomplete roster.
3. Refresh-mid-session resume; new-opponent session discards a stale one.
4. Suggestion override at each of the 3 decision points.
5. Offline continuation after initial page load.

## Performance Considerations

All suggestion computation is a synchronous in-memory random pick over at most 5 elements — no network calls occur during a session, trivially satisfying the PRD's "no perceptible delay" NFR.

## Migration Notes

None — no database schema changes in this increment.

## References

- PRD: `context/foundation/prd.md` (US-01, FR-007–FR-015, Business Logic, NFRs)
- Roadmap: `context/foundation/roadmap.md` (S-03: Run a live match-mode session)
- Test plan: `context/foundation/test-plan.md` (§2 risks #1, #6; §3 Phase 3)
- Ownership-check precedent: `src/lib/matrix.ts:61-67` (`upsertEstimate`)
- Roster cap: `src/lib/rosterLimits.ts:1` (`MAX_ROSTER_SIZE`)
- Deferred gate promise: `context/archive/2026-09-08-cap-roster-size/plan.md:167`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session engine & suggestion logic

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/lib/matchSessionEngine.test.ts src/lib/matchSuggestions.test.ts` — 8efc709
- [x] 1.2 Type checking passes: `npx astro check` — 8efc709
- [x] 1.3 Linting passes: `npm run lint` — 8efc709

#### Manual

- [x] 1.4 Phase transitions cross-checked against the Sub-round mechanics description — 8efc709

### Phase 2: Persistence layer

#### Automated

- [x] 2.1 Unit tests pass: `npx vitest run src/lib/matchSessionStorage.test.ts` — f64041c
- [x] 2.2 Type checking passes: `npx astro check` — f64041c
- [x] 2.3 Linting passes: `npm run lint` — f64041c

#### Manual

- [x] 2.4 Refresh mid-session resumes correctly — f64041c
- [x] 2.5 Starting a session for a new opponent discards a stale one — f64041c

### Phase 3: UI

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — f64041c
- [x] 3.2 Linting passes: `npm run lint` — f64041c
- [x] 3.3 Build succeeds: `npm run build` — f64041c

#### Manual

- [x] 3.4 Full 5-vs-5 two-sub-round walkthrough produces a correct final summary — f64041c
- [x] 3.5 Exactly-5 gate blocks with a clear message on an incomplete roster — f64041c
- [x] 3.6 Suggestion highlighted and overridable at each of the 3 decision points — f64041c
- [x] 3.7 Abandon & restart clears the session — f64041c
- [x] 3.8 Session continues to work with network disabled after initial load — f64041c

### Phase 4: End-to-end verification

#### Automated

- [x] 4.1 E2E test passes (via `/10x-e2e`) — 11657a2
