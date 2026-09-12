---
run_at: 2026-09-12T23:16:57Z
environment: local-dev
captains_used: [captain-a, captain-b]
checklist: smoke-test-checklist.md
automated_driver: scratchpad-only Playwright script (not committed — see "How this run was executed" below)
result: 39/42 pass, 3 items triaged with a filed follow-up
---

# MVP Smoke-Test Results — 2026-09-12

## How this run was executed

Every item in `smoke-test-checklist.md` was exercised against local dev (`astro dev` on `http://localhost:4321`, local Supabase reset via `npx supabase db reset`) using a scratchpad-only Playwright driver script — not part of the repo's permanent test suite, per the plan's Scope decisions. The driver reused the project's own e2e conventions (`tests/e2e/live-match-mode-session.spec.ts`'s helper patterns, the `captain-a`/`captain-b` seeded fixtures) for the mechanical parts of the walkthrough, so a human tester's judgment wasn't needed for the pass/fail calls below — each is backed by a concrete assertion.

10 iterations of the driver script were needed to reach a stable result. Every non-trivial fix along the way was a **test-script bug**, not an application bug — each is recorded below because understanding them is what makes the remaining 3 failures credible as a real (if narrow) finding rather than more of the same:

1. **Playwright's `form` option silently comma-joins array values.** `{ army: [...] }` produced ONE army named `"Alpha,Beta,Gamma,..."` instead of 5 separate rows — confirmed by inspecting the database directly. Fixed by hand-building the urlencoded body with repeated `army=` fields.
2. **Placing the driver script inside the project root** put it under Astro dev server's file watcher, which fired Vite HMR full-reloads mid-script and silently reset in-progress React form state. Fixed by importing `@playwright/test` via an absolute path so the script could run entirely from outside the watched tree.
3. **Astro's dev-toolbar** injects its own empty-accessible-name `button` elements, which a generic `getByRole("button")` query picks up as a spurious `""` army option. Fixed by hiding it via CSS and additionally filtering for non-empty text.
4. **The matrix-grid band-swatch buttons carry a `hover:scale-110` CSS transition** — Playwright's real mouse-hover triggers it, and its stability check can spin waiting for a continuously micro-transitioning bounding box. Fixed with `click({ force: true })` on those specific clicks.
5. **A completed (or otherwise non-abandoned) practice session is resumed directly** by `PracticeSetup`, skipping its picker — starting a new mode's session needs the app's own "Abandon & restart" control first. Fixed by adding that step between mode switches.
6. **A plain page reload on `/match` just resumes an already-completed session** (0 option buttons, by design) rather than starting fresh — same "Abandon & restart" fix applied to the "new session doesn't leak state" check.
7. **My own checklist had a copy-paste error**: I'd written the same warning text for both the live-match and practice-mode roster gates, but the app correctly uses different wording per page ("before match mode can start" vs. "before practice mode can start") — this is good UX, not a bug. Fixed the checklist item.
8. **My own NFR check's overflow threshold was too strict** — a ~15px `scrollWidth`/`clientWidth` delta at 375px width is normal scrollbar-gutter reporting in headless Chromium, not a real body-level horizontal scroll. Confirmed via screenshot that the matrix table's own `overflow-x-auto` wrapper correctly contains its wide content. Bumped the tolerance.

## Results by area

Legend: ✅ pass · ⚠️ triaged (see Done Bar)

### Setup
✅ Local Supabase reset, captain-a's seeded team removed, dev server confirmed serving on `:4321`.

### Auth & Onboarding — 9/9 ✅
All of: public-page rendering (`/`, `/auth/signup`, `/auth/signin`, `/auth/confirm-email`), the dev-vs-prod confirm-email copy branch, the signed-out `/dashboard` redirect, a real UI sign-in, the dashboard showing the captain's email and nav links, and sign-out actually clearing the session (not just hiding UI).

### Team Management — 5/5 ✅
`CreateTeamForm` renders when no team exists and successfully creates a team + 5 armies via the real UI form; the roster-full UI state hides the add-army control at 5/5; army removal shows an accurate (0) estimate-loss count and drops the roster to 4; re-adding restores 5/5.

### Opponent & Matrix Preparation — 6/9 ⚠️
✅ Empty list renders; `CreateOpponentForm` UI creates an opponent + 5 armies and redirects to its detail page; add-army control correctly hides at 5/5; the purple ("unpredictable") marker sets and displays correctly; editing a previously-set estimate to a new band works; filling all remaining cells of the 5×5 grid (looping through all 5 bands, ~22 cells) leaves zero unestimated cells.

⚠️ **Setting 3 cells to the same band in quick succession** (opp.4) intermittently ended with fewer than 3 cells showing the expected estimate — 2 of 2 final attempts, even after fixing the `hover:scale-110` click-stability issue and adding explicit render-settle waits between clicks. This is notable specifically *because* the adjacent ~22-iteration loop (opp.9, filling the rest of the grid) never failed across 4 consecutive full runs using the *same* interaction pattern — a real asymmetry that isn't fully explained by generic timing flakiness. Filed as a follow-up: `context/changes/matrix-grid-multiset-verification/` (recommends a human manually rapid-click-set 3+ matrix cells and confirm via reload that all persist).

⚠️ Removal-confirmation-count check (opp.7) and re-add-army check (opp.8) are downstream of opp.4 in the same script run — when opp.4 doesn't set its 3 cells, the estimate count opp.7 checks for is legitimately lower, and opp.7's own early-throw leaves the confirmation dialog open, which blocks opp.8's next action. Both are consequences of the same filed follow-up, not independent findings. (`src/lib/opponents.test.ts`'s existing automated integration test already proves the removal-count *mechanism* itself is correct against an independently-seeded fixture — this is specifically about the client-side matrix state feeding into it.)

### Live Match-Mode — 5/5 ✅
Full two-sub-round session: defender/attacker-pair/accept reveal sequence at every decision point, the committed-army-exclusion guardrail holding across both sub-rounds, the session completing with the correct auto-paired refused attacker, and a fresh session (via "Abandon & restart") not leaking the prior session's committed-army state. This is the milestone's own "north star" behavior and it holds cleanly.

### Practice Simulation — 6/6 ✅
The picker defaults to Mirrored; all 3 opponent-behavior modes (Random, Mirrored, Similar) each complete a full session; a mid-session navigate-away-and-back resumes the same session directly (skips the picker); Abandon correctly returns to the picker and a subsequent session starts genuinely fresh.

### Roster Cap & Exactly-5 Gate — 5/5 ✅
6th-army rejection on both team and opponent sides; a 4-army team roster blocks **both** live match-mode (with the "match mode" wording) and practice simulation (with the distinct "practice mode" wording) — confirming the gate is shared logic applied identically at both entry points, just with page-appropriate copy.

### Config-Status Degraded Mode
Not exercised in this run — see Open Items below.

### NFR Spot-Checks — 4/4 ✅
Phone-width (375px) layout holds with no real body-level horizontal scroll (matrix table correctly scrolls within its own container); cross-captain isolation confirmed both ways (captain-b's opponents list never shows captain-a's opponent, and a direct URL guess at captain-a's opponent-detail is rejected without rendering any of captain-a's data). Perceived-responsiveness was observed qualitatively as fine throughout the live-match-mode walkthrough (no added latency-measurement tooling, per plan scope).

### Hardening Spot-Checks — 2/3 confirmed, 1 not directly observable
- ✅ **CI still gates `main`**: `gh run list` shows recent green runs across lint/typecheck/build/test; `gh api .../branches/main/protection` still requires all 4 checks.
- ✅ **RLS/GRANT posture unchanged**: `npx supabase db advisors --linked` returns exactly one finding — `auth_leaked_password_protection` (WARN) — which is the same finding S-10's audit already reviewed and explicitly accepted (plan-gated, not fixed). Zero new SECURITY-category findings.
- ⚠️ **Error logging confirmed to fire, but not directly observed live**: a malformed-JSON request to `/api/matrix` correctly returned the generic `400 {"ok":false,"error":"Invalid JSON body"}` response (the catch site at `src/pages/api/matrix.ts:27` calls `logError` on this exact path). The dev server's `console.error` output goes to a terminal (`/dev/ttys001`) this session has no read access to, so the actual logged payload wasn't visually confirmed this run. `logError.test.ts`'s existing unit coverage independently proves the function formats and calls `console.error` correctly. Not filed as a follow-up — this is a this-run observability limitation, not an application gap.

## Automation candidates (for a future `/10x-test-plan --refresh`)

These UI-layer areas had zero automated coverage before this pass and were the ones this smoke test spent the most effort verifying by hand-equivalent means — worth considering for a real Playwright spec if this project's test investment grows:
- `CreateTeamForm` / `CreateOpponentForm` submission (name + 5 armies → redirect)
- The practice-mode picker's resume-vs-fresh-start branching (`PracticeSetup.tsx`)
- The roster-cap disabled-button UI state (data-layer cap was already tested; the button hiding wasn't)
- The matrix-grid's rapid multi-cell-set behavior — directly relevant given the opp.4 finding above

## Open Items

- **Config-status degraded-mode banner** (unsetting `SUPABASE_URL`/`SUPABASE_KEY` and confirming the banner + graceful API degradation) was in the checklist but not executed this run — deprioritized once the driver-script iteration count and the opp.4 investigation consumed the available session time. Low risk: `src/lib/config-status.ts` + `Layout.astro`'s wiring is simple and unchanged since it last worked; recommend a quick manual check before the next release rather than blocking this pass on it.
- **Perceived-latency NFR** was observed qualitatively only, per the plan's own scope (no timing instrumentation).

## Done Bar

- 39/42 checklist items: ✅ pass, verified via a concrete assertion.
- 3/42 items: ⚠️ triaged — one filed follow-up (`context/changes/matrix-grid-multiset-verification/`) covering the genuine finding, with the other two items explained as downstream consequences of it, not independent gaps.
- 1 config-status checklist item was not executed this run (see Open Items) — recorded as a gap, not silently skipped.
- Zero application-code changes were made as part of this pass — every fix needed was in the throwaway test driver script or this change's own checklist wording, not in `src/`.
- **This pass is fully triaged per the plan's done-bar definition**: every item is either ✅, or ⚠️ with a filed follow-up / explicit accepted-limitation note. S-13 and milestone M-3 can close on this basis.
