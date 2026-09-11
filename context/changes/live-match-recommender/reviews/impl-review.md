<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Live Match Recommender (Increment 2: Real Scoring)

- **Plan**: context/changes/live-match-recommender/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan, both complete)
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Roster-shape invariant (equal, non-zero, odd-safe sizes) is unvalidated in matchSuggestions.ts

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff between a single choke-point guard vs. defense-in-depth; pause to pick
- **Dimension**: Safety & Quality (also a Pattern Consistency gap — see Detail)
- **Location**: src/lib/matchSuggestions.ts (`twoCombinations` L51-59, `searchOurAttackerPair`/`searchTheirAttackerPair` L155-168 & L203-211, `continueOrFinish` L249-255)
- **Detail**: The exhaustive-minimax approach is only tractable and correct because rosters are always exactly 5-per-side, equal, and shrink in lockstep — but that invariant is enforced nowhere in this file. It currently holds only because of an external UI gate (`rosterReady` check in `src/pages/dashboard/opponents/[id]/match.astro`, `MAX_ROSTER_SIZE = 5` in `rosterLimits.ts`). If it's ever violated — unequal sizes, an empty array, or PRD FR-016 ("roster size configurable beyond 5") landing without a matching update here — the failure is silent, not a thrown error: `Math.max(...[])` / `Math.min(...[])` on an empty `twoCombinations()` result returns `-Infinity`/`Infinity` and corrupts the search instead of crashing, and `continueOrFinish`'s forced-pairing fallback reads only `ourAvailable[0]`/`theirAvailable[0]`, silently dropping extra armies if the sides are ever unequal. `matchSessionEngine.ts`'s `createSession` does no such validation either, so the gap is pre-existing/shared, not newly introduced — but the new code's `Math.max/min`-over-array pattern is more fragile to it than the old random provider was. This also breaks with this codebase's established convention: `colorBands.ts` and `matchSessionEngine.ts` (`assertAvailable`, `assertDistinctAvailablePair`) both throw descriptive errors on invalid input; `matchSuggestions.ts` is the one file in this cluster that assumes well-formed input silently instead.
- **Fix A ⭐ Recommended**: Add one assertion at `createSession` in matchSessionEngine.ts (`ourArmies.length === theirArmies.length` and non-zero), matching the existing `assertAvailable`/`assertDistinctAvailablePair` convention in that same file.
  - Strength: Single choke point, matches the codebase's existing defensive-programming convention exactly, and catches the invariant break at the one place all sessions originate.
  - Tradeoff: Doesn't protect `matchSuggestions.ts`'s functions if they're ever called directly outside `matchSessionEngine.ts` (not currently the case).
  - Confidence: HIGH — mirrors two existing guards in the same file.
  - Blind spot: None significant; no other production call site currently exists.
- **Fix B**: Add defensive checks inside `matchSuggestions.ts` itself (e.g. guard `twoCombinations`/`searchOurDefender` entry points).
  - Strength: Protects the algorithm even if called from a future second call site.
  - Tradeoff: Scattered across several functions, more code for a currently-hypothetical caller.
  - Confidence: MEDIUM — more robust but adds surface area for a risk that isn't reachable today.
  - Blind spot: Haven't checked whether FR-016 work would call these functions directly or always go through `createSession`.
- **Decision**: FIXED via Fix A — added `assertValidRosters` in matchSessionEngine.ts, called at the top of `createSession`; 2 new regression tests added in matchSessionEngine.test.ts.

### F2 — Exhaustive-search cost claim will stop being true, silently, if roster size grows

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is a doc note, not a code change
- **Dimension**: Architecture / Performance
- **Location**: src/lib/matchSuggestions.ts (doc comment above `minimaxSuggestionProvider`, and the plan's Performance Considerations section)
- **Detail**: The docstring/plan claim "the remaining decision tree is always small enough... exact, not a heuristic approximation" is correct today (hand-derived: ~130k leaf evaluations for 5v5→3v3→1v1, trivial for client JS) but cost grows roughly with `n²·m²·C(n,2)·C(m,2)` per sub-round — cheap through ~9-11 per side, growing fast past that (tens of millions of evaluations by ~15-a-side). Not a problem at today's hard-coded cap of 5, but if/when PRD FR-016 lifts the roster-size cap, this claim needs re-evaluation rather than being assumed to still hold.
- **Fix**: Add a one-line note to the doc comment above `minimaxSuggestionProvider` (or to the plan's Performance Considerations) flagging that the exhaustive-search approach is bounded specifically by the current 5-per-side cap and should be re-evaluated (memoization/pruning, or a different algorithm) if that cap is ever raised.
- **Decision**: FIXED — added the cost-growth note to the doc comment above `minimaxSuggestionProvider` in matchSuggestions.ts, referencing PRD FR-016.

## Notes from review

- Plan-drift sub-agent: full MATCH across both phases — cell scoring, minimax traversal order, tie-break rule, interface widening, and provider swap all implemented exactly as planned. No unplanned files changed beyond expected housekeeping (roadmap.md, change.md, plan.md, plan-brief.md).
- Automated verification (re-run live): `grep -r randomSuggestionProvider src/` → empty; `npx vitest run` → 61/61 passed; `npx astro check` → 0 errors; `npm run lint` → clean; `npm run build` → success; `npx playwright test` → 4/4 passed.
- Manual verification (Phase 2, item 2.7): investigated live with the user's real dev-DB matrix (Expedition 2137 vs Wujasy). The suggested defender "CK" was traced by hand against the actual minimax recursion and confirmed correct — CK ties Custo for the best full-game value (47 vs Tau/BA/Demony's 46), and the "double orange pin" the user was concerned about is structurally prevented because the opponent's own optimal play spends the second orange threat (TS) as their defender rather than holding it back as an attacker. Confirmed not a bug; user accepted the finding.
