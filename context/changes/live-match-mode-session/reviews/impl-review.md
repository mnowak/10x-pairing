<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Live Match-Mode Session (Increment 1: Mechanics)

- **Plan**: context/changes/live-match-mode-session/plan.md
- **Scope**: Phase 1 of 4 (full plan — all phases complete)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All automated Success Criteria independently re-run and confirmed passing: unit tests (19/19 across `matchSessionEngine.test.ts`, `matchSuggestions.test.ts`, `matchSessionStorage.test.ts`), `astro check` (0 errors), `npm run lint` (clean), `npm run build` (succeeds), and `npx playwright test` (4/4, including the two Phase 4 risk-tied tests). All Manual Verification checkboxes are checked with corresponding commit evidence (`8efc709`, `f64041c`, `11657a2`).

## Findings

### F1 — Storage writes lack the defensive try/catch `loadSession` already has

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/matchSessionStorage.ts:19-22 (`saveSession`), :43-45 (`clearSession`)
- **Detail**: `loadSession` wraps its `localStorage` calls in try/catch and degrades to `null`. `saveSession` and `clearSession` don't — if `localStorage` throws (quota exceeded, disabled site data, a restrictive private-browsing context), the exception propagates uncaught. `saveSession` runs from an unconditional `useEffect` on every state change in `MatchSession.tsx`, and there's no `ErrorBoundary` anywhere in the codebase — a storage failure would crash the whole `client:only` island to a blank panel mid-session, losing the captain's in-progress reveal sequence.
- **Fix**: Wrap both bodies in the same try/catch pattern `loadSession` already uses, so a storage failure degrades to "not persisted this step" instead of crashing the UI.
- **Decision**: FIXED

### F2 — `matchSessionStorage.ts`'s signature adds an `opponentId` param not in the plan's literal Contract text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/matchSessionStorage.ts:19,25 vs. plan.md:103 (`saveSession(state): void`, `loadSession(): MatchSessionState | null`)
- **Detail**: The plan's Phase 2 Contract line doesn't mention an `opponentId` parameter, but Phase 2's own Overview requires "discard silently when starting a session for a different opponent" — genuinely untestable without an opponent-scoping key. The implementation is correct and the drift is required by the plan's own stated behavior; the Contract text is just under-specified, not wrong-as-implemented.
- **Fix**: Update plan.md's Phase 2 Contract line to match the shipped signature, so the plan stays an accurate record.
- **Decision**: FIXED

### F3 — `match.astro` uses `client:only="react"` instead of the plan's stated `client:load`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard/opponents/[id]/match.astro vs. plan.md:132 ("Otherwise render `<MatchSession ... client:load />`")
- **Detail**: `client:load` would server-render the island once before hydration — but `MatchSession.tsx`'s first render must be the client render, since its lazy `useState` initializer calls `loadSession()` (`globalThis.localStorage`), which doesn't exist during SSR. `client:only` is the correct choice for this specific island and is explained in a code comment at the call site; it just isn't what the plan's Contract text says.
- **Fix**: Update plan.md's Phase 3 Contract line to say `client:only="react"`, with the one-line SSR/localStorage rationale.
- **Decision**: FIXED

### F4 — `MatchMatrix.tsx` (+ `colorBands.ts`/`MatrixGrid.tsx` edits) aren't in the plan's Changes Required

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/match/MatchMatrix.tsx (new), src/lib/colorBands.ts, src/components/matrix/MatrixGrid.tsx
- **Detail**: Added during manual-verification feedback (you asked mid-implementation for a visual pairing-matrix aid, then two rounds of refinement — phase-aware column/row focus, then full-hide for already-committed armies' irrelevant cells). The implementation itself checked out clean in review: `focus` prop correctly narrows emphasis per phase, `ourPairedWith`/`theirPairedWith` are derived correctly from session history, the `BAND_SWATCH_CLASSES` factor-out into `colorBands.ts` is a clean single-source-of-truth refactor with no behavior change to the existing matrix-prep grid. This finding is purely about the plan document under-describing final shipped scope, not about the code being wrong.
- **Fix**: Add a short addendum to plan.md's Phase 3 Changes Required section documenting `MatchMatrix.tsx` and its two supporting-file edits, so the plan reflects what actually shipped.
- **Decision**: FIXED

## Notes for the record

- No CRITICAL findings. No functional bugs identified in the session-mechanics, persistence, or E2E coverage — the core guardrail (committed armies never re-offered) and the exactly-5 gate were both independently deliberate-break-verified during Phase 4 (temporarily broke `withoutArmy()` and the roster-ready gate; confirmed the corresponding tests correctly went red; reverted).
- Files bundled into these commits at your explicit request for unrelated prior work this session (hooks setup, `/10x-e2e` skill install, a stale `@ts-expect-error` fix, the roadmap S-03/S-06 split) were excluded from this review's scope — not part of this plan, not re-reviewed here.
