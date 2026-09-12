<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Selectable Opponent-Behavior Modes for Pairing Simulation

- **Plan**: context/changes/pairing-simulation-recommender/plan.md
- **Scope**: Phase 1-5 of 5 (full plan)
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (2 findings) |
| Architecture | WARNING (1 finding) |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Summary

Two independent sub-agent sweeps plus this session's own live investigation (using real dev-DB data for team "Expedition 2137" vs. opponent "Wujasy") confirm the implementation matches every phase's literal contract: the Phase-1 search generalization is byte-identical for the existing captain-side algorithm, Phase 2/3's `bestTheir*`/`mirroredValue`/`generateSimilarScoreTable` behave exactly as specified (including tie-breaks), and Phase 4/5's storage/wiring/picker UI match their contracts with no scope-guardrail violations. `npm run lint`, `npm run build`, and `npm test` (102/102) all pass. `match.astro` (live mode) is confirmed untouched.

However, live manual testing against the real dev matrix surfaced a genuine design gap that neither automated tests nor the plan's own contract caught: the Mirrored/Similar opponent's defender pick is computed with knowledge of the captain's already-revealed defender, but the user confirmed the real tournament rule is that both captains declare defenders blind/simultaneously. This is a plan-level design flaw (the Phase 2 contract explicitly specified this parameter), not an implementation drift — flagged per this review's mandate to catch flawed plans, not just drifted implementations. The user has already decided (in this session, before this review ran) to defer the fix to a dedicated follow-up investigation rather than patch it now — see F1's Decision.

A second, newly-discovered reliability gap: `PracticeSetup` doesn't fully account for a `"simulation"`-mode session persisted *before* this feature shipped (no `opponentBehavior` field) — it shows the picker as expected, but `MatchSession` then silently resumes the stale session's mid-round state under a freshly picked (and likely mismatched) behavior label instead of starting fresh.

## Findings

### F1 — Mirrored/Similar opponent's defender pick uses information a blind/simultaneous declaration wouldn't have

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: src/lib/matchSuggestions.ts:204-220 (`bestTheirDefender`), threaded through `searchOurAttackerPair`/`searchTheirPick`/`searchOurAccept`
- **Detail**: `bestTheirDefender`'s top-level argmax over candidate defenders is computed via a full lookahead that already knows the specific identity of `ourDefender` (the captain's just-committed defender). Verified live against the real dev-DB matrix (team "Expedition 2137" vs. opponent "Wujasy"): the opponent's first-defender pick for Mirrored mode changes depending on which army the captain picks as their own defender first (e.g. picking CK or Tau as our defender causes the algorithm to pick "WE" as their defender; picking BA, Custo, or Demony causes it to pick "CSM" instead) — reproduced and hand-traced via the actual `bestTheirDefender`/`mirroredOpponentProvider.pickDefender` functions with the real matrix data. The user confirmed the real-world tournament rule is that both captains declare defenders blind/simultaneously, meaning the simulated opponent shouldn't have access to the captain's choice at that specific decision point. Everything *downstream* of both defenders being revealed (their-pick, their-attacker-pair, our-accept) legitimately uses real, by-then-public information and is not affected by this finding. This is a plan-level contract issue (Phase 2's contract explicitly specified `ourDefender` as a `bestTheirDefender` parameter), not an implementation deviation — the code correctly implements what the plan specified; the plan's specification is what needs revisiting.
- **Fix A ⭐ Recommended**: Open a dedicated `/10x-frame` + follow-up plan to redesign the defender-pick step specifically (e.g., evaluate each candidate their-defender against the *range* of what the captain could have picked, rather than the one already-known value; keep everything downstream of both-defenders-revealed as-is since that's genuinely sequential/public information by then).
  - Strength: Matches the user's explicit decision in this session; treats a core-algorithm redesign with the research/planning rigor it deserves rather than a same-session patch to already-shipped, already-tested Phase 2 code.
  - Tradeoff: Mirrored/Similar mode ships today with this known gap; the "first defender" pick in particular may look non-intuitive until the follow-up lands.
  - Confidence: HIGH — this is the path the user already chose.
  - Blind spot: Whether a similar "already-known" leak exists in less obvious spots hasn't been exhaustively re-derived beyond the defender step and the trace above.
- **Fix B**: Patch `bestTheirDefender` now to evaluate candidates without conditioning on `ourDefender`'s specific identity (e.g. via an aggregate over `ourAvailable`), updating Phase 2's tests accordingly.
  - Strength: Closes the gap immediately, in the same session that found it.
  - Tradeoff: No agreed design yet for what "blind evaluation" should aggregate over (expectation? worst-case? something else?) — inventing one now risks a second wrong answer; also reopens already-reviewed, already-committed Phase 2 code and its tests.
  - Confidence: LOW — no validated replacement algorithm exists yet.
  - Blind spot: Whether a cheap, correct approximation exists at all, or whether this truly needs a small game-theoretic equilibrium computation.
- **Decision**: DEFERRED — user explicitly chose "Stop and re-plan" for this exact finding earlier in this session (before this formal review ran), after confirming the real-world rule is blind/simultaneous declaration. Not fixed in this session by user's own direction; route to a new `/10x-frame` + plan.

### F2 — Pre-feature simulation session silently resumes under a mismatched behavior label instead of starting fresh

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability / backward-compat)
- **Location**: src/components/match/PracticeSetup.tsx:44-63; src/components/match/MatchSession.tsx:259-264
- **Detail**: `PracticeSetup` only auto-resumes a session when `initialLoaded?.opponentBehavior` is truthy; a `"simulation"`-mode session saved *before* this feature shipped (when `saveSession` took no 4th argument) has no `opponentBehavior`, so `PracticeSetup` correctly falls through to showing the picker — implying "starting fresh." But `MatchSession` independently calls `loadSession(opponentId, mode)` on mount and resumes `initialLoaded.state` whenever it's present, regardless of whether `PracticeSetup` treated it as stale. Clicking "Start practice session" therefore silently continues the old, possibly mid-round session under whatever behavior the captain just picked in the UI — a label that has nothing to do with how that session's opponent actually played so far. No test covers this exact "pre-feature session, no `opponentBehavior`" path.
- **Fix**: In `PracticeSetup`, when a loaded session exists but lacks `opponentBehavior`, treat it as unusable — call `clearSession("simulation")` before falling through to the picker — so "Start practice session" always begins genuinely fresh instead of quietly inheriting stale mid-round state.
- **Decision**: FIXED — `PracticeSetup`'s lazy `initialLoaded` initializer now clears the stored simulation session via `clearSession("simulation")` when a loaded session lacks `opponentBehavior`, returning `null` instead. Verified: `npm run build` and `npm test` (102/102) still pass.

### F3 — `JSON.parse` result is trusted without runtime shape validation

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/matchSessionStorage.ts:77
- **Detail**: `JSON.parse(raw) as StoredSession` only guards against JSON *syntax* errors (via try/catch), not against a parsed value that's valid JSON but doesn't actually match `StoredSession`'s shape (e.g. a manually edited or partially-written localStorage value). Such a value would flow through as a malformed `MatchSessionState` into the engine rather than being treated as corrupt. Low risk given this is client-only, single-user localStorage data, and the pattern predates this diff (not a regression introduced by this plan) — flagging only because the review scope included localStorage/JSON boundaries.
- **Fix**: Optional — add a minimal runtime shape check (e.g. verify `opponentId` is a string and `state` is an object) before trusting the parsed value, falling back to `null` (same as today's corrupt-JSON path) if it fails.
- **Decision**: FIXED — added `isStoredSession` type guard (checks `opponentId` is a string, `state` is a non-null object) and `loadSession` now returns `null` when the parsed JSON doesn't pass it. Verified: `npm run build` and `npm test` (102/102) still pass.
