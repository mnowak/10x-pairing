# Selectable Opponent-Behavior Modes — Plan Brief

> Full plan: `context/changes/pairing-simulation-recommender/plan.md`

## What & Why

Let a captain pick one of three opponent-behavior modes for a solo practice session — Random (already shipped), Mirrored (a real minimax opponent using an inverted view of the captain's own matrix), or Similar (Mirrored plus fixed-per-session noise). This is roadmap slice S-08, whose scope was expanded mid-planning from a single hardcoded algorithmic swap to the full 3-mode selector, at the user's request, pulling the previously-parked MS-05 forward into this milestone.

## Starting Point

S-07 shipped one opponent-behavior implementation (`randomOpponentProvider`) hardcoded into every practice session. The captain's own suggestions already run a full minimax search (`minimaxSuggestionProvider`) — but that search only ever returns *values*, never an actual choice, for the opponent's side, since nothing needed it before.

## Desired End State

"Practice solo" shows a picker (Random / Mirrored pre-selected / Similar) before a session starts. The chosen mode governs the opponent's picks for that session's duration, survives a refresh, and "Abandon & restart" returns to the picker rather than immediately restarting in the same mode. Live match-mode is untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | Full 3-mode selector, not a single swap | User explicitly asked to pull MS-05 forward mid-planning, redefining S-08. |
| Mirrored formula | `20 - estimate`, purple pinned flat at 7 | User-specified; purple/blank never naturally produces 7 from a real color band, so the exception is unambiguous to detect. |
| Similar formula | Non-purple: mirrored ± 4 (int, clamped 0-20). Purple: uniform random integer in [0,20] | User-specified, refined mid-planning (purple gets the full range, not a narrow band around 7). |
| Engine architecture | Generalize the existing minimax search (score function + maximizing-side flag), not a duplicate tree | Avoids ~150 lines of near-duplicated recursive logic; verified by the full existing test suite passing unchanged. |
| Tie-breaks | Reserve-strength-aware for Defender/AttackerPair picks (own-army-committing decisions); trivial first-candidate for Pick (offered-pair decision) | Mirrors the existing codebase's own precedent exactly: `bestOurDefender`/`bestOurAttackerPair` already use reserve-strength; `bestOurAccept` already uses a trivial tie-break for the same structural reason (choosing from an offered pair, not committing your own army). |
| Selector UX | Pre-session picker screen, roster-gate first | Scales to 3 options with room for a description each; matches the existing gate-then-content pattern. |
| Default mode | Mirrored | Best default training value — the realistic, no-randomness opponent. |
| Restart behavior | Returns to the picker | Lets a captain try multiple modes back-to-back without fully exiting practice mode. |
| Similar-mode persistence | Generated table persists with the session | Required for correctness — the noisy matrix must stay fixed for the whole session's lookahead to be internally consistent; consistent with S-07's existing refresh-survives guarantee. |
| Testing depth | Unit + one integration test per new mode | This is this codebase's single most reversal-prone logic area per its own risk history; 3 algorithms at once raises that further. |

## Scope

**In scope:**
- Generalized minimax engine (Phase 1), zero behavior change to existing suggestions
- Mirrored and Similar `OpponentMoveProvider` implementations
- Widened provider interface, extended session persistence
- Pre-session mode picker, abandon-returns-to-picker flow

**Out of scope:**
- Any UI to view the generated Similar-mode matrix — stays internal
- Any change to live match-mode or the captain's own suggestion logic
- Persisted history of which mode was used across sessions
- Mid-session mode switching without Abandon & restart

## Architecture / Approach

`matchSuggestions.ts`'s private search is generalized to take a `CellScore` function and an `oursMaximize` flag, so the exact same recursive shape runs from either side. Mirrored and Similar are each just a different `CellScore` plugged into that one engine via new `bestTheir*` exports. `opponentMoves.ts` wraps these into two new `OpponentMoveProvider`s alongside the existing random one. `matchSessionStorage.ts` gains an `opponentBehavior` field (and, for Similar, the generated table) so a session's chosen mode survives a refresh. A new `PracticeSetup.tsx` wrapper owns the picker-vs-resume decision and intercepts "Abandon & restart" for simulation sessions only — `match.astro`'s live-mode path never touches any of this.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Generalize the minimax engine | Config-driven search, zero behavior change | Regression risk in the highest-value existing logic — mitigated by requiring the full existing suite to pass unchanged |
| 2. Mirrored opponent | Inversion value function + argmax picks + provider | Medium — new argmax logic, tie-break correctness |
| 3. Similar opponent | Noisy table generation + restore-from-persisted provider | Medium — clamping/purple-range correctness, restore-consistency |
| 4. Session persistence + wiring | Storage extension, provider wired into MatchSession | Medium — a widened `loadSession` return shape touches the one existing call site |
| 5. Mode-picker UI + routing | Picker screen, abandon-to-picker, route wiring | Low-medium — mostly composition of Phases 1-4's pieces |

**Prerequisites:** S-07 (`pairing-simulation-session`) — done.
**Estimated effort:** 5 phases, likely spanning multiple `/10x-implement` sessions given the scope.

## Open Risks & Assumptions

- Assumes armies only ever leave the available pool during a session (never rejoin) — `generateSimilarScoreTable`'s one-time full-roster cross-product relies on this to cover every combination the search could later query.
- No component-test coverage for the picker UI itself (consistent with this repo's zero-React-component-test convention) — verified manually per the Phase 5 checklist.

## Success Criteria (Summary)

- A captain can pick and complete a full session in each of the 3 modes, with mode-appropriate opponent behavior.
- A Similar-mode session's opponent behavior survives a mid-session refresh unchanged.
- Live match-mode is provably unaffected by any of this work.
