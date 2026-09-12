<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Solo Pairing Simulation (Random Opponent)

- **Plan**: context/changes/pairing-simulation-session/plan.md
- **Scope**: Full plan (Phases 1-3 of 3)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING (1 finding) |
| Success Criteria | PASS |

## Summary

All three phases match the plan's stated intent, confirmed by two independent sub-agent sweeps plus re-run automated checks (`npm test` 72/72, `npx astro check` 0 errors, `npm run lint` clean). `matchSessionEngine.ts` remained untouched throughout, exactly as planned. The captain's own three decision points (`our-defender`, `our-attacker-pair`, `our-accept`) have zero `mode` branching and always use `minimaxSuggestionProvider`, confirmed line-by-line. `simulate.astro` mirrors `match.astro`'s data-loading/error-redirect structure with only the intended differences (mode value, "Practice mode" copy). `match.astro` is correctly reverted to `mode="live"` after the Phase 2 manual-testing detour. One low-impact pattern-consistency finding on a defensive fallback style; no security, data-safety, or architectural issues found.

## Findings

### F1 — AutoReveal's fallback sentinels diverge from SinglePicker's fallback style

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/match/MatchSession.tsx:354-355, 379
- **Detail**: `AutoReveal`'s `pick` callbacks for `their-pick` and `their-attacker-pair` fall back to string sentinels when working-state fields are (in principle) missing — `state.working.ourOfferedPair ?? ["", ""]` and `state.working.theirDefender ?? ""` / `state.working.ourDefender ?? ""`. `SinglePicker`'s equivalent fallback (`state.working.ourOfferedPair ?? []`, line 366) instead falls back to an empty array, which renders zero buttons — a visible, safe dead end. Because `matchSessionEngine.ts`'s phase-guarded invariants make these fields always defined by the time these phases render, this is dead code today. But if that invariant were ever violated, the `""` sentinel would silently compute a bogus reveal and only fail later, inside `enterTheirPick`/`enterTheirAttackerPair`'s validation when Continue is clicked — an uncaught exception in a click handler, rather than `SinglePicker`'s graceful empty-render.
- **Fix**: Align the fallback style with `SinglePicker`'s — e.g. have `AutoReveal`'s `pick` short-circuit to a `null`-rendering guard when the required working-state field is missing, or simply trust the engine's phase invariant (matching `PairPicker`'s existing documented reliance on remount semantics) and drop the `??` fallbacks entirely, since `matchSessionEngine.ts` already guarantees these fields are set before these phases render.
- **Decision**: FIXED — added a `requireWorking<T>` helper (mirrors `matchSessionEngine.ts`'s own assertion style: throws a descriptive error on a violated invariant) and replaced the `?? ["", ""]` / `?? ""` sentinels with it at both call sites (`their-pick`, `their-attacker-pair`). No `!` non-null assertions introduced, consistent with the codebase's existing avoidance of them.

### F2 — Indexing an empty array returns `undefined` despite the `ArmyId` return type

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/opponentMoves.ts:24-28, 33
- **Detail**: Carried forward from the Phase 1 review (`context/changes/pairing-simulation-session/reviews/impl-review-phase-1.md`, F1) — inherited from the existing `matchSuggestions.ts` pattern, not introduced by this plan.
- **Fix**: No action needed — consistent with existing codebase convention; the invariant is enforced upstream by `matchSessionEngine.ts`.
- **Decision**: DISMISSED (consistent with pre-existing codebase convention; no new risk introduced — carried forward from Phase 1 review)
