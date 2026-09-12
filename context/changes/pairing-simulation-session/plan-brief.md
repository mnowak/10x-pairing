# Solo Pairing Simulation (Random Opponent) — Plan Brief

> Full plan: `context/changes/pairing-simulation-session/plan.md`

## What & Why

Let a captain run a solo pairing-simulation session to train, without needing a second human present. The captain still makes their own three decisions manually with the existing suggestion engine's recommendations; the app automatically plays the opponent's side, revealing each opponent move before the captain continues. This is roadmap slice S-07 (milestone M-2, `context/foundation/roadmap.md`) — the smallest end-to-end proof that solo training works, before S-08 (a separate change) upgrades the opponent from random to algorithmic play.

## Starting Point

Live match-mode already implements the full two-sub-round session as a pure state machine (`src/lib/matchSessionEngine.ts`) driven by `src/components/match/MatchSession.tsx`, which currently renders every opponent decision as a clickable human picker. The engine itself doesn't care where an opponent's choice comes from, so it needs no changes. Session storage is a single global `localStorage` slot with no concept of session mode.

## Desired End State

A "Practice solo" link on the opponent page starts a solo session with the same exact-5-roster gate as live match-mode. The captain plays their own three decisions with suggestions as today; at each of the opponent's three decision points, the app reveals a randomly-picked move and the captain clicks Continue. The session ends in the same auto-paired refused-attacker outcome, under a "Practice session complete!" banner, and is visibly marked "Practice" throughout so it's never confused with a real match.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Entry point | New sibling route `/opponents/[id]/simulate` | Keeps live-match code and route untouched; matches the one-route-per-mode convention. |
| Opponent-reveal pacing | Reveal + Continue button | Gives the captain a beat to register the opponent's move before reacting, matching the PRD requirement to show what was picked. |
| Session storage | Separate slots keyed by mode | A live and a practice session for the same opponent must coexist without clobbering each other. |
| Visual distinction | "Practice" badge + distinct completion copy | Prevents a captain from mistaking a practice run for a real match record. |
| Opponent randomness testability | Injectable random source (factory function) | Matches this repo's pure-function unit-test convention; no `Math.random` mocking. |
| Session persistence | Persists like live sessions (survives refresh) | One consistent storage mechanism for both modes; an accidental refresh shouldn't lose a practice run. |
| History scope | No persisted history beyond in-session state | Matches live match-mode today and the product's standing non-goal on post-match history. |
| Roster gate | Reuse the exact-5 gate from live match-mode | Trains for the real 5v5 tournament format; the underlying pick logic already assumes equal, non-empty rosters. |
| Opponent-decision architecture | New `OpponentMoveProvider` interface, random implementation now | Mirrors the `MatchSuggestionProvider` precedent (S-03→S-06): ship a swappable seam now, S-08 swaps in the algorithmic implementation later without touching the engine or UI wiring again. |

## Scope

**In scope:**
- Random opponent-move provider (swappable interface) for the three opponent decision points
- Session storage mode separation (`live` vs `simulation`)
- Reveal-and-continue UI for opponent moves, with a Practice badge and distinct completion copy
- New `/simulate` route with the same roster-readiness gate as live match-mode, and an entry-point link

**Out of scope:**
- Any UI to enter an opponent's own matrix (never built — opponent play is random or, later, mirrored from the captain's own matrix)
- Algorithmic/minimax-based opponent play (S-08, separate change)
- Persisted simulation history or stats
- Multiple opponent-behavior modes (MS-05, parked for a later increment)
- New component-testing tooling (this repo has none today; UI wiring is manually verified)

## Architecture / Approach

`matchSessionEngine.ts` stays untouched — its opponent-entry functions already accept a plain value regardless of its source. A new `OpponentMoveProvider` interface (`src/lib/opponentMoves.ts`) sits alongside the existing `MatchSuggestionProvider`, with a random implementation backing it for this slice. `MatchSession.tsx` gets a `mode` prop that branches the three opponent phases to a new `AutoReveal` component (computes the provider's pick once per phase-entry, shows it, then advances on Continue) instead of the existing interactive pickers. Session storage gains a `mode` dimension so live and practice sessions for the same opponent don't collide.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Opponent-move provider + storage mode separation | Pure, fully unit-tested logic: random provider + mode-tagged storage | Low — no UI surface yet |
| 2. Simulation UI wiring in MatchSession | Reveal-and-continue UI, Practice badge, mode-branched rendering | Medium — needs careful manual verification of the reveal/Continue flow before routing exposes it |
| 3. Route + entry point | New `/simulate` route and "Practice solo" link, full end-to-end feature | Low — thin wiring over Phases 1-2 |

**Prerequisites:** S-02 (opponent matrix), S-03 (live match-mode session engine), F-01 (schema) — all already `done`.
**Estimated effort:** Not sized in calendar terms (per this project's roadmap convention) — 3 phases, each independently verifiable.

## Open Risks & Assumptions

- Assumes the fixed 5-army roster cap continues to guarantee exactly 2 armies are available at every "their-attacker-pair" phase; the random-pair picker is implemented generally (not hardcoded to 2) so this isn't load-bearing, but it's worth knowing why the assumption currently always holds.
- No component-test coverage for the new `AutoReveal`/mode-branching UI logic, consistent with this repo's existing convention of zero React component tests — verified manually instead.

## Success Criteria (Summary)

- A captain can complete a full solo simulation session end-to-end, with suggestions on their own picks and clear reveals of the opponent's random picks.
- A live match-mode session and a simulation session for the same opponent never interfere with each other.
- Nothing about a simulation session is ever mistaken for a real match record (visually distinct throughout).
