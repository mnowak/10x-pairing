# Final MVP Smoke-Test Pass — Plan Brief

> Full plan: `context/changes/mvp-smoke-test-pass/plan.md`

## What & Why

Roadmap slice S-13, milestone M-3's wrap-up validation: confirm every shipped MVP capability still works end-to-end, verified fresh after S-09–S-12's hardening work (CI gating, RLS/GRANT audit, error-visibility, live-match-mode test coverage — all `done`). Two real production incidents during M-2's tail showed nothing was systematically checking that the app's infrastructure stays correct — this pass is the final release-readiness gate before MS-01 closes.

## Starting Point

10 page routes and 10 API routes ship across 4 feature areas (auth, team/opponent/matrix management, live match-mode, 3-mode practice simulation), all covered by 12 Vitest files and 3 Playwright specs at the domain-logic level — but with zero automated coverage at the UI/flow layer (matrix-editing grid, practice-picker resume logic, roster-cap buttons, signup→confirm-email→signout, config-status banner). No smoke-test checklist has ever existed in this project.

## Desired End State

A reusable `smoke-test-checklist.md` exists for this and future release passes. A signed `smoke-test-results.md` shows every item passed or was triaged (fixed inline or filed as a follow-up change), plus 3 hardening spot-checks and 4 lightweight NFR checks recorded. S-13 and milestone M-3 can close once the results log shows a fully triaged run.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | Feature walkthrough + light hardening spot-check (CI green, RLS advisor clean, one logged error) | Catches product regressions AND hardening regressions without re-doing S-09–S-11's own verification work |
| Environment | Local dev (`astro dev` + local Supabase) | Matches every prior manual/e2e convention in this project; production RLS was already directly audited in S-10 |
| Bug handling | Fix trivial issues inline; file real bugs as follow-up `/10x-new` changes | Keeps this change's diff small and focused on verification, matching how prior hardening slices scoped themselves |
| NFR verification depth | Lightweight targeted checks (phone-width resize, brief offline check, eyeballed cross-captain isolation) | Proportionate to a solo-captain MVP; matches `test-plan.md §7`'s existing exclusion of formal UI/perf tooling |
| Deliverable | Checklist doc + a dated signed results log (2 files) | Reusable for the *next* release pass too, mirrors the `bootstrap-verification/verification.md` precedent |
| Coverage-gap handling | Manually verify UI-layer gaps now; flag as automation candidates in the results log | Focuses scarce manual-testing time where automated tests provide zero signal today |
| Done bar | Every item ✅ pass, or ⚠️ with a filed follow-up / accepted-risk note — zero silent skips | Matches this milestone's "audit, not assume" purpose |
| Test accounts | Existing seeded local captains (captain-a / captain-b) | Zero new setup, matches the existing `twoCaptains.ts` fixture convention |

## Scope

**In scope:**
- Authoring a reusable smoke-test checklist covering every shipped page/API route and all 3 practice modes
- Executing the checklist once against local dev with captain-a/captain-b
- 3 hardening spot-checks (CI status, `supabase db advisors --linked`, one triggered-and-logged error) and 4 NFR spot-checks
- Trivial inline fixes; follow-up change filing for anything larger
- A dated, signed results log

**Out of scope:**
- Re-auditing S-09/S-10's CI/RLS work from scratch
- S-14/S-15/S-16 (not yet `done`, separate roadmap slices)
- A fresh-signup cold-start walkthrough (reuses seeded fixtures instead)
- Formal NFR testing (device lab, network-throttling tools, timing instrumentation)
- Unbounded bug-fixing — non-trivial findings become separate changes, not scope creep on this one

## Architecture / Approach

Two phases: author the checklist as a standalone artifact first (so it outlives this one run), then execute it once against a clean, deterministic local-dev state. Because `supabase/seed.sql` pre-seeds both captains with an empty team, the checklist's setup sequence deletes captain-a's seeded team first so the untested `CreateTeamForm` UI flow gets genuinely exercised before anything else.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Build the smoke-test checklist | Reusable `smoke-test-checklist.md`, prioritized toward UI-layer coverage gaps | Missing a shipped capability from the checklist — mitigated by grounding it directly in this plan's route/mode inventory |
| 2. Execute the pass and record results | Signed `smoke-test-results.md`, trivial fixes landed, follow-ups filed | A non-trivial bug is found mid-pass — bounded by the fix-inline-vs-file-follow-up rule so this change doesn't balloon |

**Prerequisites:** S-09, S-10, S-11, S-12 (all `done`).
**Estimated effort:** ~1 session across 2 phases — checklist authoring is quick; execution time scales with how many findings surface.

## Open Risks & Assumptions

- Assumes local dev + local Supabase faithfully represents production behavior for everything except what S-10 already audited directly against the linked production project.
- A non-trivial bug found mid-pass delays S-13's own closure until its follow-up change is at least filed (not necessarily fixed) — acceptable per the done-bar decision, but worth flagging since it could surface unplanned follow-up work this late in the milestone.

## Success Criteria (Summary)

- Every shipped MVP capability (10 page routes, 10 API routes, 3 practice modes) has a recorded pass/fail result from a real local-dev walkthrough
- The 3 hardening spot-checks confirm S-09–S-11's fixes still hold
- Zero silent skips — every finding is either fixed or has a filed follow-up before S-13 is considered closeable
