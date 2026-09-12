<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Fix Simultaneous-Declaration Leaks in Practice-Mode Opponent Simulation

- **Plan**: context/changes/blind-declaration-opponent-sim/plan.md
- **Scope**: Phase 1 and Phase 2 of 2 (full plan)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Plan drift sub-agent**: all 7 planned change groups verified MATCH against actual code (`bestTheirDefender`'s new symmetric search, `OpponentMoveProvider.pickDefender`'s dropped parameter, both new `WorkingSubRound` snapshots and their call-site wiring, the test rewrites, and `isResumableSessionState`). No unplanned changes (EXTRA) found in the 7 changed files. Explicitly confirmed `isResumableSessionState` checks **both** snapshot fields (`ourAvailableBeforeOurDefender` and `ourAvailableAtDefenderReveal`), not just the one the original plan text mentioned before the second leak instance was found mid-implementation.
- **Safety/pattern sub-agent**: `searchOurDefenderForTheirChoice` verified structurally correct against its sibling `searchTheirDefender` (parameter order, aggregation direction). New code follows existing naming/JSDoc/reset conventions. No leftover debug code, no TODO/FIXME. `MatchSession.tsx`'s lazy initializers are SSR-safe (`client:only` island, no hydration mismatch risk).
- **Automated verification** (re-run directly): `npx astro sync && npm run lint` clean, `npx astro check` 0 errors, `npm test` 110/110 passing, `npm run build` succeeds.
- **Manual verification**: confirmed directly by the user in the browser (Mirrored/Similar sessions stable across different defender reveals against the real "Expedition 2137 vs. Wujasy" matrix; the persisted-session crash that surfaced mid-implementation is resolved; live match-mode unaffected).

## Findings

### F1 — `assertValidRosters` doesn't enforce the exact invariant its own comment claims

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/matchSessionEngine.ts:91-97`
- **Detail**: The comment above `assertValidRosters` states this "is an invariant this engine must guarantee" because the minimax search assumes non-empty candidate sets at every level (`Math.max(...[])`/`Math.min(...[])` silently return `-Infinity`/`Infinity` instead of throwing). The actual check only verifies non-empty and equal-sized rosters — not that the size is odd, or exactly `MAX_ROSTER_SIZE` (5). This is **pre-existing** (not introduced by this plan) and currently masked only by the UI-level `rosterReady` gate in `match.astro`/`simulate.astro`, which requires exactly 5-vs-5 before either session type can start. The new `searchOurDefenderForTheirChoice` added by this plan inherits the same latent dependency: if a caller ever created a session with an even-sized roster (e.g. 4-vs-4), the their-defender search would silently produce a degenerate `-Infinity`/`Infinity` result instead of a clear error, one level earlier in the call chain than before.
- **Fix**: Tighten `assertValidRosters` to require `ourArmies.length === MAX_ROSTER_SIZE` (or at least assert odd length), matching what the comment already claims it guarantees.
- **Decision**: FIXED — implemented as "equal, non-empty, odd-length" (not hardcoded to `MAX_ROSTER_SIZE`), since the codebase's own tests deliberately exercise smaller odd rosters (3v3) for tractable hand-verified scenarios, and PRD FR-016 flags roster size as a future-configurable cap. A first attempt hardcoded exactly `MAX_ROSTER_SIZE` and would have broken those 3v3 tests — caught before running the suite. Added a regression test for the even-roster rejection case. All 111 tests pass, lint/astro-check/build clean.

### F2 — Plan's Phase blocks use `- [ ]` checkboxes instead of plain `- ` bullets

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (documentation, not code)
- **Location**: `context/changes/blind-declaration-opponent-sim/plan.md:147-156`, `196-202`
- **Detail**: Per this project's plan template, Phase blocks' Success Criteria should use plain `- ` bullets — only the `## Progress` section at the bottom should carry `- [ ]`/`- [x]` checkboxes. The Phase 1 and Phase 2 blocks in this plan use `- [ ]` directly, a template inconsistency from when the plan was authored. The actual Progress section (the real source of truth) is correctly formatted and fully `[x]` with commit SHAs, so this has no functional effect on tracking.
- **Fix**: Cosmetic only — optionally reformat the Phase blocks' Success Criteria to plain `- ` bullets to match the template convention.
- **Decision**: FIXED — reformatted both Phase blocks' Success Criteria to plain `- ` bullets; the `## Progress` section (the real tracking source of truth) was already correct and untouched.
