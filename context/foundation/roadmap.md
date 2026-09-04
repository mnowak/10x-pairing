---
project: "Pairing Assistant"
version: 1
status: draft
created: 2026-09-04
updated: 2026-09-04
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: live-pairing-mvp
milestone_seq: 1
milestone_status: open
---

# Roadmap: Pairing Assistant

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: live-pairing-mvp** — Status: open

- **Intent:** Ship the full must-have MVP — team/roster setup, opponent matrix preparation, and live match-mode with suggestions at all three decision points across both sub-rounds — so a captain can use Pairing Assistant end-to-end at a real tournament before the 2026-09-13 deadline.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** F-01, S-01, S-02, and S-03 below are all `done`.

## Vision recap

During the live pairing process at the start of each round in a Warhammer 40k team tournament, a captain must decide — under a secret-reveal, time-boxed negotiation — which armies to commit as defender and attacker, aiming to maximize the team's summed score. The best pick at each step depends on which armies remain available on both sides, not just the immediate matchup — a multi-step optimization a captain can't reliably eyeball live, and something no existing spreadsheet-based tool walks through in real time.

## North star

**S-02: Captain can prepare a pairing-matrix estimate against an opponent team** — the smallest end-to-end flow that proves captains will actually use the tool ahead of a tournament, independent of whether live match-mode ships on time.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works. This gloss applies for the rest of the document; it isn't repeated below.

## At a glance

| ID   | Change ID                        | Outcome (user can …)                                                                | Prerequisites | PRD refs                                                              | Status   |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- | -------- |
| F-01 | schema-teams-opponents-matrix     | (foundation) Team/opponent/pairing-matrix schema with RLS landed                      | —              | FR-001, FR-003, FR-004, FR-006, Access Control, NFR (privacy)          | ready    |
| S-01 | create-team-roster                | create a team with a name and a roster of armies                                      | F-01           | FR-001                                                                 | proposed |
| S-02 | prepare-opponent-matrix           | add an opponent team and enter/edit a color-banded pairing-matrix estimate against them, repeated for multiple opponents | S-01, F-01     | FR-003, FR-004, FR-005, FR-006                                          | proposed |
| S-03 | live-match-mode-session           | run a full live match-mode session against a prepared matrix, both sub-rounds, ending in an auto-paired refused attacker | S-02           | US-01, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015 | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-04` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per `tech-stack.md`: Astro 6 + React 19 islands + TypeScript; `src/pages/*.astro`, `src/components/**`.
- **Backend / API:** present — per `tech-stack.md`: Astro server-output on Cloudflare Workers; `src/pages/api/auth/{signin,signup,signout}.ts`.
- **Data:** partial — Supabase (Postgres) provider wired (`src/lib/supabase.ts`), but zero domain schema exists yet (`README.md`: "No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only"). No tables for teams, armies, opponent rosters, or pairing-matrix estimates. Estimate data must be durably persisted server-side — directly required by the PRD guardrail "No loss of previously entered pairing-matrix estimates once saved, including mid-tournament" (user-confirmed during baseline review).
- **Auth:** present — full flow verified live in production: `src/middleware.ts` sets `context.locals.user`, `PROTECTED_ROUTES` guards `/dashboard`, sign-in/up/out routes confirmed working against real Supabase credentials during the Cloudflare Workers deploy (`context/deployment/deploy-plan.md`).
- **Deploy / infra:** present — deployed and verified on Cloudflare Workers: `https://pairing-assistant.michal-nowak-7b3.workers.dev` (`context/deployment/deploy-plan.md`). CI (`.github/workflows/ci.yml`) runs lint + build only, no deploy automation yet.
- **Observability:** partial — `wrangler.jsonc`: `observability.enabled: true` (basic Cloudflare Workers logs, confirmed working via `wrangler tail`). No dedicated app-level error tracking; not required by any PRD NFR at MVP scale.

## Foundations

### F-01: Team/opponent/pairing-matrix schema with RLS

- **Outcome:** (foundation) Postgres schema landed for `teams`, `team_armies` (roster), `opponents`, `opponent_armies`, and `pairing_matrix_estimates` (color-band per our-army/opponent-army pair) — every table scoped to `auth.uid()` via Row Level Security so a captain's data is never visible to another account.
- **Change ID:** schema-teams-opponents-matrix
- **PRD refs:** FR-001, FR-003, FR-004, FR-006, Access Control, NFR ("A captain's pairing-matrix estimates are never visible to anyone outside their own account")
- **Unlocks:** S-01, S-02
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema decisions here (roster-size flexibility, color-band representation) ripple into every downstream slice — worth getting right once, but scope stays to exactly the 5 tables S-01/S-02 need, not a speculative generalized schema. Live-match-session state (committed armies, current sub-round) is deliberately NOT part of this foundation — it's introduced in S-03, the only slice that needs it.
- **Status:** ready

## Slices

### S-01: Create a team roster

- **Outcome:** captain can create a team with a name and a roster of armies (default 5).
- **Change ID:** create-team-roster
- **PRD refs:** FR-001
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Smallest possible vertical slice and the entry point every other slice depends on. Keep the roster-size field flexible (not hardcoded to exactly 5) so FR-016 (parked, see below) stays cheap to pick up later without a schema rewrite.
- **Status:** proposed

### S-02: Prepare an opponent pairing-matrix

- **Outcome:** captain can add an opponent team's roster and enter/edit a color-banded pairing-matrix estimate against them, repeated for multiple different opponents ahead of a tournament.
- **Change ID:** prepare-opponent-matrix
- **PRD refs:** FR-003, FR-004, FR-005, FR-006
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — the smallest complete flow that proves captains will actually use the tool to prepare matrices, independent of whether live match-mode ships on time. Color-band input (not raw 0–20 scores) is a confirmed domain decision (`shape-notes.md`) — don't let this regress to numeric input under time pressure.
- **Status:** proposed

### S-03: Run a live match-mode session

- **Outcome:** captain can run a full live match-mode session against a prepared opponent matrix — pick defender, enter opponent's defender, get an attacker-pair suggestion, enter opponent's pick, repeat for sub-round 2, and get the final refused-attacker auto-paired — using only currently-available (uncommitted) armies at every step.
- **Change ID:** live-match-mode-session
- **PRD refs:** US-01, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - FR-013's exact scoring function (weighing the immediate matchup against the downstream refused-attacker impact) is described as a domain rule in PRD's Business Logic but not as a precise formula — `/10x-plan` will need to pin down the exact algorithm. Owner: user/team. Block: no.
- **Risk:** Intentionally the largest slice — PRD's US-01 acceptance criteria treat the full two-sub-round sequence as one indivisible round-completion test (all 3 suggestion types plus the auto-paired refused attacker, in one Given/When/Then). Splitting by sub-round or by suggestion-type would produce a slice with no standalone captain-usable value and would be a horizontal, not vertical, cut. Given the 2-week after-hours budget and the 2026-09-13 deadline, this is also the slice most at risk of not landing in time — since it's the PRD's Primary Success Criterion, prefer descoping polish elsewhere before touching this.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                              | Ready for `/10x-plan` | Notes                    |
| ---------- | -------------------------------- | ---------------------------------------------------------------------- | ---------------------- | ------------------------ |
| F-01       | schema-teams-opponents-matrix    | Design team/opponent/pairing-matrix schema with RLS                    | yes                     | —                         |
| S-01       | create-team-roster               | Captain can create a team with a roster of armies                      | no                      | Waiting on F-01           |
| S-02       | prepare-opponent-matrix          | Captain can prepare a pairing-matrix estimate against an opponent      | no                      | Waiting on S-01            |
| S-03       | live-match-mode-session          | Captain can run a full live match-mode session                         | no                      | Waiting on S-02            |

## Open Roadmap Questions

None — PRD had 0 Open Questions, and no cross-cutting questions surfaced during roadmap framing. (S-03 carries one slice-local, non-blocking Unknown — see above.)

## Parked

- **Managing multiple of our own teams (FR-002)** — Why parked: PRD Non-Goals — demoted to nice-to-have to protect the 2-week budget; MVP is scoped to one team per captain.
- **Team-vs-team round pairing (Swiss system between teams)** — Why parked: PRD Non-Goals — the organizer's job, determined externally.
- **Post-match score tracking / historical stats** — Why parked: PRD Non-Goals — out of scope for live pairing decisions.
- **A teammate/viewer role for non-captain team members** — Why parked: PRD Non-Goals — deferred per Access Control; MVP is captain-only access.
- **Roster size configurable beyond 5 players (FR-016)** — Why parked: nice-to-have; `main_goal: speed` + `top_blocker: time` bias toward the strict must-have path. S-01's schema stays flexible enough to pick this up later without a rewrite (see S-01 Risk), but the feature itself isn't sequenced in this milestone.

## Milestone History

(empty — first milestone)

## Done

(empty — no changes archived yet)
