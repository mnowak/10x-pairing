<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Prepare Opponent Matrix Implementation Plan

- **Plan**: context/changes/prepare-opponent-matrix/plan.md
- **Scope**: Phase 1-3 (full plan) + purple-estimate addendum
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `upsertEstimate`'s throwing call isn't caught in the JSON route

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matrix.ts:45 (call site) / src/lib/matrix.ts:71 (throwing call)
- **Detail**: `upsertEstimate` calls `getTeamWithArmies(supabase, captainId)` (matrix.ts:71), which throws on any unexpected Supabase error per its documented contract in `teams.ts`. Neither `upsertEstimate` nor its caller in `api/matrix.ts:45` wraps this in try/catch. Every other call site of a throwing data-access function in this slice (`teams/armies.ts`, `opponents/armies.ts`, and `[id].astro`'s `getOpponentWithArmies` call) does catch it. Here, a transient DB error would surface as an unhandled rejection instead of the route's own `{ok:false, error}` JSON contract.
- **Fix**: Wrap the `upsertEstimate` body's `getTeamWithArmies` call in try/catch, returning `{ ok: false, error: "Something went wrong loading your team" }` on failure, matching the pattern already used elsewhere in this slice.
- **Decision**: FIXED

### F2 — `getMatrixGrid` call in `[id].astro` isn't caught, unlike the fetch right above it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/opponents/[id].astro:29
- **Detail**: `getOpponentWithArmies` two lines above (line 19) is wrapped in try/catch with a redirect-with-error fallback. `getMatrixGrid` (line 29) is not, despite internally calling three throwing operations (`getTeamWithArmies`, `getOpponentWithArmies`, a raw `pairing_matrix_estimates` select). An unexpected DB error here crashes the whole opponent-detail page with an unstyled 500 instead of the established redirect UX.
- **Fix**: Wrap the `getMatrixGrid` call in the same try/catch + redirect-with-error pattern used for the opponent fetch immediately above it.
- **Decision**: FIXED

### F3 — Opponent (with armies) is fetched twice per detail-page load

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/opponents/[id].astro:19 and :29 / src/lib/matrix.ts:22
- **Detail**: `[id].astro` fetches the opponent via `getOpponentWithArmies` (line 19) for the not-found/ownership check, then `getMatrixGrid` (line 29) calls `getOpponentWithArmies` again internally with identical arguments — a redundant Supabase round-trip on every single opponent-detail page view. `matrixGrid.theirArmies` already duplicates `opponent.armies`.
- **Fix A ⭐ Recommended**: Have `getMatrixGrid` accept the already-fetched `team`/`opponent` objects as parameters instead of re-querying.
  - Strength: Removes the redundant query entirely; `getMatrixGrid`'s signature becomes explicit about what it needs instead of hiding two more DB round-trips inside it.
  - Tradeoff: Touches `getMatrixGrid`'s public contract (already used by `[id].astro`, would need care if any other call site is added later).
  - Confidence: HIGH — the page already has both objects in hand at the call site.
  - Blind spot: None significant.
- **Fix B**: Drop the page-level opponent fetch and derive `opponent`'s identity/roster from `matrixGrid.theirArmies` + a stored name.
  - Strength: No `getMatrixGrid` signature change.
  - Tradeoff: `getMatrixGrid`'s return shape doesn't currently carry the opponent's `name`, so the not-found redirect and page title would need `getMatrixGrid` to expose more than it does today.
  - Confidence: MEDIUM — feasible but reshapes `MatrixGridData` more than Fix A does.
  - Blind spot: Haven't checked every place `MatrixGridData` is typed/consumed for how disruptive this would be.
- **Decision**: FIXED via Fix A

### F4 — `scoreToBand` can throw inside `getMatrixGrid`'s loop with page-wide blast radius

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/matrix.ts:49
- **Detail**: `scoreToBand` throws if `score` falls outside 0-20. The DB `CHECK` constraint should make this impossible, but if it ever happened (manual data fix, future migration bug), it crashes the whole opponent-detail page for that captain rather than degrading a single cell.
- **Fix**: Guard the `scoreToBand` call with a fallback (e.g. skip the malformed row, or default to an "unknown" display state) instead of letting it propagate.
- **Decision**: FIXED

### F5 — `TeamsError` is reused as the generic roster-error type

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/opponents.ts:3
- **Detail**: `opponents.ts` imports and reuses `TeamsError` (defined in `teams.ts`) for opponent-roster errors. Works structurally, but a reader has to know "TeamsError" is really the generic roster-error shape shared by both domains.
- **Fix**: Rename to something domain-neutral (e.g. `RosterError`) next time this area is touched — not worth a migration on its own.
- **Decision**: SKIPPED

### F6 — New CHECK constraints added without `NOT VALID` (production-migration hygiene)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260907190708_add_purple_estimate_marker.sql:16-25
- **Detail**: The migration's logic is correct and safe against existing data (every pre-existing row has a non-null `score`, satisfying the new XOR check). But both new `CHECK` constraints are added without `NOT VALID`, so Postgres will validate them against every existing row under an `ACCESS EXCLUSIVE` lock at migration time. Harmless at this project's scale, but worth noting since this migration is explicitly still pending its production push.
- **Fix**: When pushing to production, consider `ADD CONSTRAINT ... NOT VALID` followed by a separate `VALIDATE CONSTRAINT` for a lighter lock — optional given the table's expected size, but cheap insurance.
- **Decision**: SKIPPED
