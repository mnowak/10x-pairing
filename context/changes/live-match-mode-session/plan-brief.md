# Live Match-Mode Session (Increment 1: Mechanics) — Plan Brief

> Full plan: `context/changes/live-match-mode-session/plan.md`

## What & Why

Build the live match-mode reveal sequence (PRD US-01, FR-007–FR-015) that lets a captain run a full defender/attacker negotiation against a prepared opponent matrix, in real time, at a tournament table. This is **increment 1 of 2**, split deliberately: this change builds the session mechanics (state machine, committed-army tracking, the two-sub-round + refused-attacker sequence) with a **random** suggestion at each decision point; a follow-up change later swaps in the real FR-013 scoring algorithm behind the same interface. It's the last piece needed to close the `live-pairing-mvp` roadmap milestone.

## Starting Point

Team rosters, opponent rosters, and pairing-matrix estimates (0–20 score or "purple") are fully built and working (`src/lib/teams.ts`, `opponents.ts`, `matrix.ts`). Nothing resembling a "match," "session," or "committed army" exists anywhere yet — this is genuinely new ground, though it reuses the existing roster/matrix data as read-only input.

## Desired End State

From an opponent's detail page, a captain clicks "Start match mode" and is walked through both sub-rounds of the reveal sequence — pick/confirm a suggested defender, enter the opponent's reveal, pick/confirm a suggested attacker offer, enter the opponent's pick, and so on — ending in an on-screen summary that includes the automatically-paired final "refused attacker" matchup. The whole thing runs with no server round-trips once the page has loaded, so it keeps working if the venue's network drops.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Split from the real algorithm | Increment 1 = mechanics + random suggestions; increment 2 = real FR-013 algorithm | Removes the one genuinely unresolved unknown (the scoring formula) from this change entirely | User |
| Session persistence | Client-side React state + `localStorage` snapshot | Satisfies the "usable without reliable network" NFR with zero new server infra; survives a refresh on the same device | User |
| Roster size in the engine | N-vs-N generic loop, gated to exactly 5 for MVP | Matches this codebase's precedent of not hard-coding roster size, without any extra MVP cost | User |
| Concurrent sessions | One active session; starting a new one silently discards the old | Matches how a captain actually works — one live round, one table | User |
| Mistake recovery | Abandon & restart only, no in-session undo | Keeps increment 1's scope to mechanics only; a live reveal sequence is fast to redo | User |
| Incomplete-roster handling | Hard block with a clear message, no session starts | The reveal sequence and refused-attacker auto-pairing both assume matched N-vs-N | User |
| Suggestion presentation | Full picker with the suggestion highlighted, never pre-selected | Matches the PRD's "accept or override" business rule exactly, with equal effort either way | User |
| Sub-round mechanics | Two parallel defend/attack exchanges per sub-round; non-picked offered attacker returns to the pool | Confirmed domain rule — the only interpretation consistent with 5 armies = 2 sub-rounds × 2 commits + 1 auto-pair | User (confirmed) |
| Suggestion engine boundary | `MatchSuggestionProvider` interface, engine takes it as a parameter | Makes increment 2's real-algorithm swap a drop-in replacement, not a rewrite | Plan |

## Scope

**In scope:**
- Full two-sub-round defender/attacker reveal state machine, with committed-army exclusion enforced at every step
- Random suggestion at each of the 3 decision points, behind a stable interface
- `localStorage`-based session persistence (single device, single active session)
- Exactly-5-roster gate before a session can start
- Abandon & restart
- Unit tests for the state machine and suggestion logic; e2e test for the full walkthrough (via `/10x-e2e`)

**Out of scope:**
- The real FR-013 scoring algorithm (follow-up change)
- Server-side/cross-device session persistence
- In-session undo/step-back
- Non-5 roster sizes (engine is ready for it; nothing else is)
- Post-match history/score tracking

## Architecture / Approach

Three new pure `src/lib/**` modules (suggestion provider, session engine, storage wrapper) carry all the logic and are fully unit-testable without a browser. One new React island (`MatchSession.tsx`) and one new Astro route (`.../[id]/match.astro`) wire it to the UI, reusing the existing team/opponent/matrix loaders. No new database schema, no new API routes — every session action stays client-side.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session engine & suggestion logic | Pure state machine + random suggestions, unit-tested | Getting the sub-round/commit math wrong — mitigated by confirming mechanics before writing code |
| 2. Persistence layer | `localStorage` save/load/resume/discard | Testing a browser API under a workerd-based test runner |
| 3. UI | Match-mode page + island + entry point + gate + abandon | The only phase with no automated coverage beyond build/lint/typecheck — leans on manual verification |
| 4. End-to-end verification | Full-sequence browser test via `/10x-e2e` | Depends on Phases 1–3 being manually verified first |

**Prerequisites:** S-02 (prepare-opponent-matrix) — done.
**Estimated effort:** ~3-4 focused sessions across the 4 phases, ahead of the 2026-09-13 deadline.

## Open Risks & Assumptions

- The exactly-5 gate reuses `MAX_ROSTER_SIZE` (the existing "at most 5" cap) as the "exactly 5" threshold — correct today only because the cap and the match-mode requirement happen to be the same number; if the cap is ever loosened this coupling needs revisiting.
- No automated coverage for `MatchSession.tsx` itself (no jsdom/component-testing setup exists in this project) — Phase 3 relies on manual verification plus Phase 4's e2e test for real UI coverage.

## Success Criteria (Summary)

- A captain can complete a full 5-vs-5 two-sub-round session end-to-end from the UI, ending in a correct refused-attacker auto-pair.
- No suggestion or manual entry ever allows an already-committed army to be reused.
- The session keeps working with no network connectivity after the page has loaded.
