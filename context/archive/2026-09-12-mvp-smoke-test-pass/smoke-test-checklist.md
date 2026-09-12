# MVP Smoke-Test Checklist

> Reusable checklist for a full manual smoke-test pass across every shipped MVP capability. Run this after any milestone that touches shared infrastructure (CI, DB posture, error handling) or before a release, not just for S-13. Results of a specific run go in a dated `smoke-test-results.md`, not in this file — this file only changes when the shipped feature set changes.
>
> Items marked **[GAP]** have zero automated test coverage as of 2026-09-12 (see `context/changes/mvp-smoke-test-pass/plan.md` Current State Analysis) — treat these as the highest-priority manual checks, since nothing else verifies them.

## Setup

- [ ] Local Supabase and dev server are stopped/idle before starting (`npx supabase stop` if running).
- [ ] `npx supabase db reset` — provisions a clean local DB, re-applies all migrations, and re-runs `supabase/seed.sql` (seeds `captain-a@example.test` / `captain-b@example.test`, both password `test-password`, each with an empty-roster team already created: "Captain A Team" / "Captain B Team"). **Never run `supabase db reset --linked`.**
- [ ] Open Supabase Studio (`http://localhost:54323`) and delete captain-a's seeded `teams` row ("Captain A Team") only. Cascade-delete is safe — nothing else references it yet. Leave captain-b's seeded team untouched (needed later for the cross-captain-isolation check).
- [ ] `npm run dev` — confirm `astro dev` starts cleanly on `http://localhost:4321` with no startup errors.

## Auth & Onboarding

- [ ] Visit `/` (public) — landing page renders without error, no auth required.
- [ ] Visit `/auth/signup` (public) — sign-up form renders; link to `/auth/signin` works.
- [ ] Visit `/auth/confirm-email` directly (public) — **[GAP]** confirm the page's dev-vs-prod content branch matches the current `import.meta.env.DEV` value (in local dev, expect "Registration successful / go to sign in" copy, not the production "check your email" copy).
- [ ] Visit `/auth/signin` (public) — sign-in form renders; link to `/auth/signup` works; submitting a bad password shows an `?error=` message inline, not a crash.
- [ ] Sign in as captain-a (`captain-a@example.test` / `test-password`) via the real form at `/auth/signin` — redirects to `/` on success.
- [ ] Visit `/dashboard` while signed out (open a private/incognito window) — redirected to `/auth/signin` (middleware gate, `src/middleware.ts:5`).
- [ ] While signed in as captain-a, visit `/dashboard` — welcome panel shows captain-a's email; links to Team and Opponents management are present.
- [ ] **[GAP]** Sign out via the `/dashboard` sign-out form (`POST /api/auth/signout`) — redirected to `/`, and a subsequent visit to `/dashboard` redirects back to sign-in (session actually cleared, not just UI-hidden). Sign back in as captain-a before continuing.

## Team Management

- [ ] Visit `/dashboard/team` as captain-a (seeded team already deleted in Setup) — **[GAP]** `CreateTeamForm` renders (not `TeamView`), since no team exists yet.
- [ ] **[GAP]** Submit `CreateTeamForm` with a team name and 5 army names — team is created, page now shows `TeamView` with all 5 armies listed.
- [ ] From `TeamView`, confirm the "add army" control is disabled/hidden once at 5 armies (`atCap`, `src/components/team/TeamView.tsx:19`) — **[GAP]** this is the UI-layer half of FR-018; the data-layer cap is already unit-tested but this button state is not.
- [ ] Remove one army from the team roster — confirmation dialog names how many pairing-matrix estimates would be lost (0, since none exist yet); army is removed; roster now shows 4.
- [ ] Re-add an army to bring the roster back to 5 (needed for the live-match-mode/practice gates later).

## Opponent & Matrix Preparation

- [ ] Visit `/dashboard/opponents` as captain-a — empty list renders without error (no opponents yet).
- [ ] Create an opponent with a name and 5 army names via `CreateOpponentForm` — **[GAP]** redirects to the new opponent's detail page.
- [ ] On `/dashboard/opponents/[id]`, confirm the "add army" control disables once the opponent roster hits 5 (`OpponentDetail.tsx:22`) — same UI-cap check as team-side, opponent side.
- [ ] **[GAP]** On the same page, use the matrix-editing grid (`MatrixGrid`) to enter a point estimate (0–20) for at least 3 of the 25 our-army × their-army cells — value saves and displays as the correct color band (verify against the documented band palette, not just "it changed color").
- [ ] Enter a "purple" (unpredictable) marker on at least one cell — displays distinctly from both a numeric estimate and a blank/unassessed cell.
- [ ] Edit a previously entered estimate to a different value — updates in place, no duplicate row/cell created.
- [ ] Remove one opponent army that has at least one estimate against it — confirmation names the correct number of estimates that will be lost; after confirming, that count of estimates is actually gone (spot-check by re-opening the grid).
- [ ] Re-add an opponent army to bring the opponent roster back to exactly 5 (needed below).
- [ ] Fill in estimates for all remaining unestimated cells so the matrix is fully prepared (needed for a realistic live-match-mode walkthrough next).

## Live Match-Mode

- [ ] With both rosters at exactly 5 (from above), visit `/dashboard/opponents/[id]/match` — `MatchSession` renders (not the "need exactly 5" warning).
- [ ] Complete sub-round 1: accept or override the defender suggestion, enter the opponent's revealed defender, accept or override the attacker-pair suggestion, enter which attacker the opponent's defender picked.
- [ ] Complete sub-round 2 the same way.
- [ ] Confirm the final remaining army on each side is auto-paired as the "refused attacker" matchup with no manual step required.
- [ ] Across both sub-rounds, confirm no suggestion ever names an army already committed/used earlier in the same session (the core guardrail, FR-014).
- [ ] Start a **new** live match-mode session against the same opponent — previous session's committed-army state does not leak into the new session (fresh session starts with all 5v5 available again).

## Practice Simulation (Random / Mirrored / Similar)

- [ ] Visit `/dashboard/opponents/[id]/simulate` with both rosters at exactly 5 — **[GAP]** `PracticeSetup` mode picker renders (not the "need exactly 5" warning), with "Mirrored" preselected by default.
- [ ] **[GAP]** Select "Random" mode and start a session — complete a full session; opponent's 3 decision points (defender, attacker pair, attacker acceptance) are each visibly random-looking across a couple of runs, not deterministic.
- [ ] Select "Mirrored" mode (default) and start a session — complete a full session; the opponent's picks look like they're using the same minimax-style logic as the captain's own suggestions, not random.
- [ ] Select "Similar" mode and start a session — complete a full session; opponent behavior resembles Mirrored but with visible session-fixed noise (not identical to a Mirrored run against the same matrix).
- [ ] **[GAP]** Mid-session, navigate away from `/dashboard/opponents/[id]/simulate` (e.g. to `/dashboard`) and back — the in-progress session resumes automatically in the same mode, skipping the picker entirely (`PracticeSetup.tsx:44-56`), rather than restarting from the picker.
- [ ] **[GAP]** Use the "abandon session" control — returns to the mode picker, and starting a new session afterward is a genuinely fresh session (no stale committed-army state carried over).

## Roster Cap & Exactly-5 Gate

- [ ] Attempt to add a 6th army to the team roster (via the UI) — rejected with a clear message; roster stays at 5.
- [ ] Attempt to add a 6th army to an opponent's roster — same rejection behavior.
- [ ] Reduce the team roster to 4 armies (remove one) and visit `/dashboard/opponents/[id]/match` — blocked with the amber "need exactly 5" warning (`match.astro:60`), not a crash or silent misbehavior.
- [ ] With the same 4-army team roster, visit `/dashboard/opponents/[id]/simulate` — identical exactly-5 gate blocks entry (`simulate.astro:62`) — confirms the gate applies to **both** entry points, not just live mode.
- [ ] Re-add the 5th army to the team roster before continuing (needed if further checks require a ready session).

## Config-Status Degraded Mode

- [ ] **[GAP]** Temporarily unset `SUPABASE_URL` and `SUPABASE_KEY` in `.env` and `.dev.vars`, restart `npm run dev` — every page (via `Layout.astro`) shows the red "Supabase nie jest skonfigurowany" banner at the top.
- [ ] With Supabase unconfigured, submit the sign-in form — the route returns a clear 400/degraded response instead of throwing an unhandled exception (`signin.ts:10-12`'s `if (!supabase)` guard).
- [ ] Restore `SUPABASE_URL`/`SUPABASE_KEY` in both files and restart `npm run dev` — banner disappears, app behaves normally again.

## NFR Spot-Checks

- [ ] **Phone-width usability** — resize the browser (or use DevTools device emulation) to ~375px width on the live match-mode and matrix-editing pages; confirm all controls remain reachable and usable one-handed (no horizontal scroll, no overlapping controls).
- [ ] **Network resilience** — throttle to "Offline" or "Slow 3G" (DevTools Network tab) mid-live-match-mode-session; confirm the captain doesn't lose access to their already-loaded prepared matrix or in-progress session state due to the network hiccup.
- [ ] **Cross-captain privacy** — while signed in as captain-b, confirm captain-a's team, opponents, matrices, and match/practice sessions are never visible or reachable (e.g. captain-b's `/dashboard/opponents` list never shows captain-a's opponents; a direct URL guess at captain-a's opponent-detail id is rejected, not silently rendered).
- [ ] **Perceived responsiveness** — during a normal live-match-mode walkthrough, confirm each suggestion appears with no noticeable delay after entering the opponent's reveal (no spinner needed, no perceptible lag).

## Hardening Spot-Checks (S-09–S-11 still holding)

- [ ] **CI still gates `main`** — `gh run list --branch main --limit 5` shows recent successful runs across lint/typecheck/build/test; `gh api repos/:owner/:repo/branches/main/protection` still requires all 4 checks.
- [ ] **RLS/GRANT posture unchanged** — `npx supabase db advisors --linked` against the linked production project shows no new SECURITY-category findings beyond what S-10 already reviewed and accepted.
- [ ] **Error logging still fires** — deliberately trigger a handled error (e.g. submit a malformed request to `/api/matrix` while signed out, or temporarily break a query) and confirm the real error (message + stack) appears via `logError()`'s output (Cloudflare Workers Logs locally shown in the `wrangler`/`astro dev` terminal output, or browser console for the one client-side site in `MatrixGrid.tsx`) rather than only the generic user-facing message.

## Cleanup

- [ ] Stop `npm run dev` and `npx supabase stop` if no longer needed for further work.
- [ ] Note in `smoke-test-results.md` whether the local DB state from this run should be reset again before the next development session (it usually should — `npx supabase db reset`).
