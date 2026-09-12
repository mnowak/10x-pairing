---
change_id: matrix-grid-multiset-verification
title: Verify matrix-grid rapid-succession cell estimates always all persist
status: new
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Filed as a follow-up from the S-13 smoke-test pass (`context/changes/mvp-smoke-test-pass/`).

During automated smoke-testing of the pairing-matrix grid (`src/components/matrix/MatrixGrid.tsx`), a Playwright driver script that opened 3 matrix cells in quick succession and set each to the "green" band intermittently ended with fewer than 3 cells showing the green estimate (2 of 2 final attempts, after force-clicking past a `hover:scale-110` CSS-transition stability issue and adding explicit settle-waits between clicks).

**Why this isn't dismissed as pure test flakiness**: adjacent checks in the same run exercise the *identical* UI pattern (open a "Set estimate" cell → click a band swatch → wait for it to become "Change estimate") successfully every time — one of them (filling the remaining ~22 cells of the same 5×5 grid) cycles through all 5 bands over many more iterations than the failing 3-cell check, with no failures across 4 consecutive full runs. That asymmetry (a 3-iteration loop failing while a ~22-iteration loop of the same interaction never does) is not fully explained by generic timing flakiness alone.

**What to do**: manually open a fresh opponent's pairing matrix in the running app and rapidly click-set 3+ cells to a color band in quick succession (as a human would when prepping a matrix, not one-cell-at-a-time with pauses). Confirm every cell you set actually shows the picked band after a page reload — i.e., no click is silently dropped or overwritten by a subsequent one. If reproduced, the likely cause is a stale-closure/race in `MatrixGrid.tsx`'s `estimates` state update (`pickEstimate` → `setEstimates`) when a new cell is opened before the previous `fetch` to `/api/matrix` has resolved and its `setEstimates` callback has run. If not reproduced after several manual attempts, close this change with a note that it was very likely a test-harness-only artifact (the failing script is not part of the permanent test suite — see `context/changes/mvp-smoke-test-pass/smoke-test-results.md`).

**Out of scope for this follow-up**: `src/lib/matrix.ts`'s `upsertEstimate` (the server-side write) already has integration test coverage (`src/lib/matrix.test.ts`) proving single-write correctness; this is specifically about client-side state when multiple picks happen in rapid succession.
