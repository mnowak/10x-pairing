<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Error-Handling/Observability Pass

- **Plan**: context/changes/error-visibility-pass/plan.md
- **Scope**: Full plan (Phases 1-3)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Catch-variable naming differs between `.astro` pages and API/lib/client sites

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/dashboard/**/*.astro` (uses `err`) vs. `src/pages/api/**`, `src/lib/matrix.ts`, `src/components/matrix/MatrixGrid.tsx` (use `error`)
- **Detail**: `.astro` pages bind the caught value as `err` (to avoid shadowing the page-level `let error` variable in `team.astro`/`opponents/index.astro`/`opponents/[id].astro`), and that naming was carried through consistently into `match.astro`/`simulate.astro` even though no collision exists there. API routes, `matrix.ts`, and `MatrixGrid.tsx` use `error`. This matches what the plan itself specified per file — purely cosmetic, no functional effect.
- **Fix**: None needed — intentional per plan, left as-is.
- **Decision**: DISMISSED (matches plan intent, no action)

### F2 — `logError.test.ts` non-Error coverage narrower than plan wording

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/lib/logError.test.ts`
- **Detail**: The plan's Phase 1 contract describes testing non-`Error` inputs as "string, plain object," but the test only exercises a string. Since the implementation uses `String(error)` uniformly regardless of input shape, there's no functional gap — just a slightly narrower test than the plan described.
- **Fix**: Optionally add a second non-Error case (e.g. a plain object) to `logError.test.ts` for literal plan-wording coverage.
- **Decision**: FIXED — added a plain-object test case; `npm test` 114/114 pass.

## Verification run

- `npx astro check`: 0 errors, 0 warnings (4 unrelated pre-existing hints)
- `npm run lint`: clean
- `npm run build`: succeeded
- `npm test`: 113/113 passed

## Notes

- Plan-drift sub-agent: all 17 target catch sites MATCH the plan exactly (correct `logError` calls, distinct context labels, error binding used, `@/lib/logError` imported, fallback behavior byte-identical). All 4 out-of-scope silent catches (`matrix.ts:~50`, `matchSessionStorage.ts` x3) confirmed untouched.
- Safety/pattern sub-agent: no security, reliability, or architectural issues. `logError` cannot throw and never alters existing control flow. Errors logged (`PostgrestError`, `SyntaxError`) carry no auth tokens/PII. Import style and test structure match repo conventions.
