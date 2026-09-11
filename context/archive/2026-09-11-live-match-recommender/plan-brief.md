# Live Match Recommender (Increment 2: Real Scoring) — Plan Brief

> Full plan: `context/changes/live-match-recommender/plan.md`

## What & Why

Replace `randomSuggestionProvider` — increment 1's deliberate placeholder — with a real algorithm that weighs the immediate matchup against the full downstream consequences of each choice, per PRD FR-013 and Business Logic ("the choice that protects the team's total score"). This closes out live match-mode: increment 1 (`live-match-mode-session`) built the session mechanics specifically so this change could be a clean provider swap.

## Starting Point

`src/lib/matchSuggestions.ts` exports a `MatchSuggestionProvider` interface (3 methods) and `randomSuggestionProvider`, which ignores the matrix entirely and picks uniformly at random. `matchSessionEngine.ts`, `matchSessionStorage.ts`, and `MatchSession.tsx` are all already built, tested, and provider-agnostic — none of them change.

## Desired End State

Every one of the 3 suggestion points (defender, attacker-pair offer, accept) highlights a genuinely strong choice — one that accounts for what it leaves behind, all the way to the forced final refused-attacker pairing — instead of a random one. `randomSuggestionProvider` no longer exists.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Opponent modeling | Full minimax (assume worst case for us) | Matches PRD's "protects the team's total score" framing; the ≤5-army search space makes exact minimax fully tractable, not just a heuristic | User |
| Lookahead depth | Full remaining match, not just the current sub-round | Business Logic generalizes FR-013's "downstream refused-attacker impact" language to all 3 decision types; a narrower lookahead would under-serve that | Plan |
| Purple-cell scoring | Orange's score + 1 = 7 (worse than yellow, better than orange) — explicitly arbitrary | User's own domain judgment, logged as a deliberate constant, not derived | User |
| Unestimated-cell scoring | Same as purple (7) | One rule instead of two — the algorithm has equally little signal in both cases | User |
| Tie-break | Keep the highest aggregate-vs-opponent-roster army in reserve | User's own refinement — a more meaningful secondary objective than an arbitrary order | User |
| Old provider | Deleted, not kept | No dead code; the engine's tests already use a purpose-built fake, not this one | User |
| File organization | Everything in `matchSuggestions.ts`, no new file | Keeps the change to one production file + its test file, matching the seam's original design intent | Plan |

## Scope

**In scope:**
- Cell-scoring function (bands + purple + unestimated)
- Recursive minimax search mirroring the engine's sub-round mechanics
- Tie-break rule
- Removing `randomSuggestionProvider` and wiring `MatchSession.tsx` to the new provider

**Out of scope:**
- Probabilistic/difficulty-based opponent modeling
- A new E2E test (existing suite already covers the flow generically)
- Any change to the `MatchSuggestionProvider` interface, the engine, storage, or UI structure
- Explaining suggestions to the captain

## Architecture / Approach

One recursive minimax function, entered at three different starting points by the three provider methods (each already knows some facts as fixed parameters — e.g. `suggestAttackerPair` already knows the opponent's defender). Maximizes at our decision nodes, minimizes at the opponent's. Pure, in-memory, no I/O — same as everything else in this file.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Algorithm | Scoring + minimax + new provider, unit-tested in isolation | Getting the search's alternation/lookahead exactly right — mitigated by mirroring the engine's already-tested mechanics precisely |
| 2. Wiring | `MatchSession.tsx` swap, old provider removed, full regression | Low — interface is unchanged, existing E2E suite is the regression net |

**Prerequisites:** `live-match-mode-session` (S-03) — done, archived.
**Estimated effort:** ~1-2 focused sessions across the 2 phases.

## Open Risks & Assumptions

- Purple/unestimated = 7 is an explicitly arbitrary constant, not derived from any data — if it later feels wrong in practice, it's a one-line change with no structural impact.
- No new E2E coverage means a regression in *suggestion quality* specifically (as opposed to session mechanics) wouldn't be caught by CI — only by the Phase 2 manual walkthrough and the unit tests' hand-verified scenarios.

## Success Criteria (Summary)

- All 3 suggestion types weigh immediate + full downstream consequences, verified against hand-computable scenarios.
- `randomSuggestionProvider` is gone; nothing references it.
- The full existing test suite (unit + E2E) still passes unmodified.
