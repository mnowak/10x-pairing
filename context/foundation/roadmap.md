---
project: "Pairing Assistant"
version: 2
status: draft
created: 2026-09-04
updated: 2026-09-12
prd_version: "—"
main_goal: low-complexity
top_blocker: decisions
milestone_id: pairing-simulation
milestone_seq: 2
milestone_status: open
---

# Roadmap: Pairing Assistant

> Derived from a user-described milestone charter (MS-01…MS-05) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: pairing-simulation** — Status: open

- **Intent:** Let a captain run a solo pairing-simulation session — training without a second human present — where they still make their own choices manually (using the existing suggestion-engine recommendations) while the app automatically plays the opponent's side and shows what it picked at each step. Ships in two increments: opponent plays randomly first, then opponent plays using the existing minimax-derived optimal-for-them logic.
- **Source materials:** user description (anchors below)
- **Done when:** S-07 and S-08 below are both `done`.
- **Scope anchors:**
  - MS-01: Captain can start a solo pairing-simulation session against a prepared opponent matrix, without needing a second human present.
  - MS-02: In simulation, the captain still makes their own choices manually at each of their three decision points, receiving the same suggestion-engine recommendations as live match-mode today.
  - MS-03: The app automatically picks the opponent's move at each of the opponent's three decision points (uniformly at random, increment 1), instead of requiring a human to enter it.
  - MS-04: The app's automated opponent picks are upgraded (increment 2) to use the existing minimax engine's opponent-optimal-for-them search instead of random, reusing the captain's own pairing-matrix estimates mirrored as the opponent's assumed perspective.
  - MS-05 (parked — user explicitly deferred to a later increment beyond this milestone): captain can choose among multiple opponent-behavior modes for simulation — random, opponent uses the same matrix as the captain's own, or a "similar" (independently varied) matrix.

## Vision recap

M-1 shipped the live, two-human pairing flow: a captain negotiating defender/attacker reveals against a real opponent under time pressure. M-2 lets a captain rehearse that same decision-making alone — the app plays the opponent's side so the captain can practice reading a prepared matrix and reacting to reveals without needing a second person in the room.

## North star

**S-07: Captain can run a full solo pairing-simulation session (opponent plays randomly)** — the smallest end-to-end slice that proves solo training works as a mode, independent of whether the opponent's automated play is realistic yet.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works. This gloss applies for the rest of the document; it isn't repeated below.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                                                                                                              | Prerequisites  | PRD refs           | Status   |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------- | -------- |
| S-07 | pairing-simulation-session    | run a solo pairing-simulation session against a prepared opponent matrix, making their own choices manually while the app auto-picks the opponent's moves at random and shows what was picked | S-02, S-03, F-01 | MS-01, MS-02, MS-03 | in-progress |
| S-08 | pairing-simulation-recommender | have their solo pairing-simulation opponent play using the existing minimax engine's opponent-optimal-for-them logic instead of a random pick                    | S-07           | MS-04               | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-12` (auto-researched via targeted probe of the live-match-mode session architecture).
Foundations/slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — `src/components/match/MatchSession.tsx` already renders all three opponent-entry decision points (their-defender, their-pick, their-attacker-pair) as human `onPick`/`onConfirm` callbacks (lines 277-319), reached via `src/pages/dashboard/opponents/[id]/match.astro`.
- **Backend / API:** present — `src/lib/matchSessionEngine.ts` defines the full session state machine (`MatchSessionPhase`: `our-defender → their-defender → our-attacker-pair → their-pick → their-attacker-pair → our-accept → complete`) and the captain's own confirm functions (`confirmOurDefender`, `confirmOurAttackerPair`, `confirmOurAccept`).
- **Data:** present — schema landed in M-1 (`teams`, `team_armies`, `opponents`, `opponent_armies`, `pairing_matrix_estimates`, all RLS-scoped to `auth.uid()`).
- **Auth:** present — unchanged since M-1.
- **Deploy / infra:** present — unchanged since M-1.
- **Observability:** partial — unchanged since M-1; not required by any stated NFR for this milestone.
- **Opponent-decision automation:** absent — the three opponent-entry points (`enterTheirDefender`, `enterTheirPick`, `enterTheirAttackerPair` in `matchSessionEngine.ts`) currently require a human to type in what the opponent did; there is no automated-pick path.
- **Opponent-optimal suggestion logic:** partial — `src/lib/matchSuggestions.ts`'s `minimaxSuggestionProvider` already computes the opponent's worst-case-for-us (i.e. best-for-them) play internally during its search (`searchTheirDefender`, `searchTheirPick`, `searchTheirAttackerPair`), but the public `MatchSuggestionProvider` interface only exposes suggestions for the captain's own side — nothing exposes an opponent-facing pick today.
- **Session-mode discriminator:** absent — `MatchSessionState` and `matchSessionStorage.ts`'s `StoredSession` carry no `mode`/`type` field; storage assumes "only one match-mode session is ever active" in a single global slot, with no notion of a solo/simulation session distinct from a live one.

## Foundations

None for this milestone. The two absent capabilities identified in Baseline (session-mode discriminator; opponent-decision automation) are each consumed by exactly one slice (S-07) and are introduced there directly, per the progressive-disclosure rule, rather than pre-built as a standalone cross-cutting foundation.

## Slices

### S-07: Run a solo pairing-simulation session (opponent plays randomly)

- **Outcome:** captain can start and complete a solo pairing-simulation session against a prepared opponent matrix without a second human present — making their own defender / attacker-pair / accept choices manually, with the same suggestion-engine recommendations as live match-mode — while the app automatically picks the opponent's move at each of the opponent's three decision points (uniformly at random among the opponent's still-available armies) and shows the captain what was picked, ending in the same auto-paired refused-attacker outcome as a live session.
- **Change ID:** pairing-simulation-session
- **PRD refs:** MS-01, MS-02, MS-03
- **Prerequisites:** S-02, S-03, F-01 (all `done` — reuses the opponent matrix, the live-match session engine/state machine, and the underlying schema)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Session storage currently assumes only one live match-mode session is ever active in a single global slot (`matchSessionStorage.ts`) with no mode discriminator — this slice needs to design how a simulation session coexists with / is distinguished from a live one without breaking the existing live flow. Owner: team. Block: no — a small state-shape addition `/10x-plan` can design.
  - How should the random opponent pick sample among the opponent's still-available armies — pure uniform random at each decision point, or weighted some other way? Owner: user/team. Block: no — uniform random is a safe default to proceed with.
- **Risk:** This is the north star for M-2 — the smallest end-to-end slice that proves solo training works as a mode. Mirrors the M-1 `S-03` precedent (ship full session mechanics behind a swappable opponent-decision interface) rather than building the harder algorithmic-opponent logic first.
- **Status:** in-progress

### S-08: Opponent plays algorithmically in solo pairing simulation

- **Outcome:** captain's solo pairing-simulation opponent moves are no longer random — the app picks the opponent's move at each decision point using the existing minimax engine's opponent-optimal-for-them search (already computed internally by `minimaxSuggestionProvider` but not yet exposed), replacing S-07's random pick with a more realistic training opponent.
- **Change ID:** pairing-simulation-recommender
- **PRD refs:** MS-04
- **Prerequisites:** S-07 (specifically its swappable opponent-decision interface)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Should the algorithmic opponent's search reuse the captain's own pairing-matrix estimates, mirrored as the opponent's assumed perspective (since no independent opponent-side estimate data exists in the schema), or does this need a genuinely separate opponent estimate model? Owner: user/team. Block: no — `/10x-plan` can proceed with the mirrored-estimates default, flagged for revisit if simulation feels unrealistic once built.
- **Risk:** Carries the domain decision flagged during roadmap framing (top blocker: decisions) — the mirrored-estimate assumption is the only plausible default given the current schema, but is named explicitly here so a future reader doesn't mistake it for an independently modeled opponent.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                                  | Ready for `/10x-plan` | Notes                |
| ---------- | -------------------------------- | ------------------------------------------------------------------------ | ---------------------- | -------------------- |
| S-07       | pairing-simulation-session        | Captain can run a solo pairing-simulation session (random opponent)      | yes                     | —                     |
| S-08       | pairing-simulation-recommender    | Solo pairing-simulation opponent plays algorithmically, not randomly     | no                      | Waiting on S-07       |

## Open Roadmap Questions

None new — the two open domain decisions (opponent random-sampling rule; mirrored-matrix assumption for the algorithmic opponent) are non-blocking per-slice Unknowns; see S-07 and S-08 above.

## Parked

- **Multiple opponent-behavior modes for simulation (MS-05)** — Why parked: user explicitly deferred to a later increment beyond this milestone ("in some next increment") — random / same-matrix-as-captain's / "similar" (varied) matrix modes, selectable per session.
- **Managing multiple of our own teams (FR-002)** — Why parked: PRD Non-Goals — demoted to nice-to-have to protect the original 2-week MVP budget; still not in scope.
- **Team-vs-team round pairing (Swiss system between teams)** — Why parked: PRD Non-Goals — the organizer's job, determined externally.
- **Post-match score tracking / historical stats** — Why parked: PRD Non-Goals — out of scope for live pairing decisions.
- **A teammate/viewer role for non-captain team members** — Why parked: PRD Non-Goals — deferred per Access Control.
- **Roster size configurable beyond 5 players (FR-016)** — Why parked: nice-to-have; not sequenced in this milestone either.

## Milestone History

- **M-1: live-pairing-mvp** (`live-pairing-mvp`) — closed 2026-09-12. Full must-have MVP shipped: team/roster setup, opponent pairing-matrix preparation, and live match-mode with real (non-random) suggestions at all three decision points across both sub-rounds.

## Done

- **F-01: (foundation) Team/opponent/pairing-matrix schema with RLS landed** — Archived 2026-09-06 → `context/archive/2026-09-04-schema-teams-opponents-matrix/`. Lesson: —.
- **S-01: create a team with a name and a roster of armies** — Archived 2026-09-07 → `context/archive/2026-09-06-create-team-roster/`. Lesson: —.
- **S-02: captain can add an opponent team's roster and enter/edit a point estimate (integer, 0-20) against them — displayed as a derived color band, not stored as one — repeated for multiple different opponents ahead of a tournament.** — Archived 2026-09-07 → `context/archive/2026-09-07-prepare-opponent-matrix/`. Lesson: —.
- **S-04: remove an army from their team roster or an opponent's roster, with a confirmation naming how many previously-entered pairing-matrix estimates involving that army would be lost.** — Archived 2026-09-08 → `context/archive/2026-09-07-remove-team-army/`. Lesson: —.
- **S-05: captain is blocked (with a clear message) from adding a 6th army to our team roster or to any opponent's roster.** — Archived 2026-09-08 → `context/archive/2026-09-08-cap-roster-size/`. Lesson: —.
- **S-03: captain can run a full live match-mode session against a prepared opponent matrix — pick defender, enter opponent's defender, get an attacker-pair suggestion, enter opponent's pick, repeat for sub-round 2, and get the final refused-attacker auto-paired — using only currently-available (uncommitted) armies at every step. Increment 1 of 2: this slice delivers the full session mechanics with a random pick at each suggestion point, behind an interface S-06 later swaps for the real algorithm.** — Archived 2026-09-11 → `context/archive/2026-09-11-live-match-mode-session/`. Lesson: —.
- **S-06: captain's live match-mode suggestions (defender, attacker pair, accepted attacker) weigh the immediate matchup estimate together with the downstream refused-attacker impact, replacing the random pick S-03 uses for increment 1.** — Archived 2026-09-11 → `context/archive/2026-09-11-live-match-recommender/`. Lesson: —.
