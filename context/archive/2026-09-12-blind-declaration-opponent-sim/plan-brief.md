# Fix Simultaneous-Declaration Leaks in Practice-Mode Opponent Simulation — Plan Brief

> Full plan: `context/changes/blind-declaration-opponent-sim/plan.md`
> Frame brief: `context/changes/blind-declaration-opponent-sim/frame.md`

## What & Why

> The actual problem to plan around is: the practice-mode opponent simulation computes 2 of its 3 decision points (their-defender, their-attacker-pair) from game state that has already been mutated by a decision which, under the confirmed real-world parallel/blind declaration model, hasn't logically happened yet — not a single value-function bug in `bestTheirDefender`, but a class of timing leak rooted in the engine serializing what its own original design called "two parallel exchanges simultaneously" into one alternating chain.

Surfaced during a prior plan's impl-review: the Mirrored/Similar practice opponent's defender pick visibly changed depending on which army the captain revealed as their own defender — confirmed live against real matrix data.

## Starting Point

`src/lib/matchSessionEngine.ts`'s 6-phase state machine serializes two exchanges the original session design called parallel. Live mode (a human typing in what already happened) never noticed; practice mode's algorithmic opponent (`mirroredOpponentProvider` / `createSimilarOpponentProvider`, both backed by `matchSuggestions.ts`) does, because it *computes* from that same serialized, mutated state instead of just recording it. Two leak points were confirmed by direct code trace: `bestTheirDefender` takes a concrete `ourDefender` it shouldn't know yet, and `MatchSession.tsx`'s call site for the their-attacker-pair offer passes a pool already reduced by an unrelated, independent exchange.

## Desired End State

The opponent's defender pick is provably independent of which specific army the captain reveals as their own defender — provable at the type level, since the parameter is removed rather than merely ignored. The their-attacker-pair offer is computed from the pool as it stood right after both defenders became public, not after a later, independent exchange mutated it further. A captain resuming an old, pre-fix practice session mid-affected-phase gets a clean restart instead of a silently wrong computation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Algorithm for the their-defender fix | Exact symmetric minimax (drop `ourDefender` param, search over `ourAvailable`) | Mirrors the codebase's own existing pattern for the reverse case (`bestOurDefender`/`searchTheirDefender`) and preserves the file's stated "exact search, not heuristic" design | Plan |
| Test rigor | Rewrite broken tests + add explicit invariance tests + reproduce the literal live-trace matrix scenario | Directly encodes the bug class so it can't silently regress, and closes the loop on the original report with real data | Plan |
| Phasing | Both leak points fixed together in Phase 1; persistence guard split into Phase 2 | Frame is explicit this is one bug class — shipping only one leak point risks re-declaring it "closed" prematurely, as happened before; the persistence guard is a separable, additive concern | Plan |
| Persisted-session compatibility | Treat an old-shaped resumed session as incompatible — clear and restart | Simple, avoids ever computing from a half-correct state; practice sessions are low-stakes and easy to restart | Plan |
| `OpponentMoveProvider.pickDefender` interface | Drop the now-always-unused `ourDefender` parameter entirely (not just ignore it) | Once no provider implementation uses it, keeping it is dead weight that misleadingly implies conditioning on it is legitimate | Plan |
| `bestTheirAttackerPair` itself | Untouched — fix is purely which pool `MatchSession.tsx` passes it | The bug is a call-site wiring issue, not a defect in the function's own search logic | Plan |

## Scope

**In scope:**
- `bestTheirDefender`'s algorithm (drop `ourDefender`, symmetric search over `ourAvailable`)
- `OpponentMoveProvider.pickDefender` interface + its 3 implementations + its 1 call site
- A new `working.ourAvailableAtDefenderReveal` snapshot feeding `bestTheirAttackerPair`'s call site
- A persisted-session compatibility guard (`isResumableSessionState`) for the one affected shape
- Rewriting/adding unit tests across `matchSuggestions.test.ts` and `matchSessionEngine.test.ts`

**Out of scope:**
- `bestTheirPick` (accept/refuse) — confirmed clean
- Live match-mode (`match.astro`, `minimaxSuggestionProvider`) — confirmed clean, deliberately adversarial by design
- A general persisted-session schema-version/migration framework
- Any Bayesian/mixed-strategy modeling of blind declarations beyond the existing exact-minimax style

## Architecture / Approach

Both fixes stay inside the existing suggestion-engine architecture — no new modules, no new state machine phases. The harder fix (their-defender) adds one function to `matchSuggestions.ts` that's structurally a mirror of an existing one; the simpler fix (their-attacker-pair) is a one-field addition to `WorkingSubRound` plus swapping which value a single call site reads. Because both Mirrored and Similar opponent behaviors delegate to the same `bestTheirDefender`/`bestTheirAttackerPair` functions, fixing `matchSuggestions.ts` once closes the bug for both practice modes simultaneously.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fix both leak points | Symmetric their-defender search, snapshot-fed their-attacker-pair offer, rewritten/added tests | The tie-break test rewrite requires a fresh hand-derivation under the new algorithm — the old scenario's premise no longer applies |
| 2. Persisted-session compatibility guard | `isResumableSessionState` check + wiring in `MatchSession.tsx`'s load path | Scope creep toward a general migration framework — stay narrow to the one affected shape |

**Prerequisites:** None — builds directly on the shipped `pairing-simulation-recommender` slice (S-08).
**Estimated effort:** ~1 session across 2 phases — contained to 4 files plus 2 test files.

## Open Risks & Assumptions

- The rewritten `bestTheirDefender` tie-break test needs a fresh hand-derivation (the old scenario's premise — a fixed external `ourDefender` contributing a uniform constant — no longer applies once that parameter is removed); this is design work deferred to implementation, not resolved in this plan.
- Assumes practice sessions are genuinely low-stakes enough that clearing an incompatible resumed session (Phase 2) is an acceptable UX tradeoff — confirmed via the planning questions, not independently user-tested.

## Success Criteria (Summary)

- The opponent's defender pick in Mirrored/Similar practice mode is identical across repeated attempts against the same matrix, regardless of which army the captain reveals as their own defender first.
- Both practice modes still complete full sessions end-to-end with no thrown errors.
- Live match-mode behavior is unchanged.
