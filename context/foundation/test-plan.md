# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-09

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   area Y" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`
(19 commits/30d — sufficient signal).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Live match-mode (not yet built) suggests an already-committed army, or picks the wrong choice by ignoring the downstream refused-attacker impact | High | High | PRD Primary Success Criterion + guardrail "suggestion engine never recommends an already-used army"; roadmap S-03 (next slice, "most at risk of not landing in time," scoring formula an open Unknown) |
| 2 | Score↔color-band mapping regresses (wrong band shown to the captain, or storage regresses to a color enum) | High | High | interview Q3 (named directly as least-confident area); PRD FR-004 Socratic history — reversed twice already; hot-spot: matrix/estimate-mapping files among the most-changed in the last 30 days |
| 3 | A write route accepting two or more foreign-key IDs skips verifying that BOTH referenced rows belong to the caller (cross-captain write) | High | Medium | interview Q2 ("a refactor silently broke a live flow"); archived slice design note (ownership check as a deliberate addition); an equivalent gap was found and fixed in a different route during a later slice's implementation review — same bug class recurred once already |
| 4 | A write path (roster edit, removal, a future feature) silently loses a previously-entered pairing-matrix estimate | High | Medium | PRD guardrail "No loss of previously entered pairing-matrix estimates once saved"; interview Q1 ("silent data loss"); hot-spot dir `src/lib` (16 commits/30d) |
| 5 | The estimate count shown in a removal confirmation doesn't match what actually gets deleted | Medium | Low-Medium | PRD guardrail + confirmation requirement on army-removal FRs; archived schema/removal slice design notes (cascade-delete via foreign key) |
| 6 | The existing roster cap (at most 5) is mistaken for live match-mode's real precondition (exactly 5) when a session starts | Medium | Low | roadmap S-03 Unknown, added during a later slice's planning: "entering live match-mode should validate both sides have exactly 5 armies... not yet designed" |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Suggestions only draw from currently-uncommitted armies at every decision point; the final refused-attacker pairing matches the PRD's Given/When/Then, not the algorithm's own output | "Only the immediate matchup matters" — the PRD requires weighing the downstream refused-attacker impact too | The still-unpinned exact scoring formula; the committed/available-army state machine across both sub-rounds | Unit tests once the formula is pinned, plus one integration/e2e test for the full two-sub-round sequence | Writing tests against the algorithm's own output instead of an independently worked-through pairing scenario |
| #2 | The score↔band conversion stays inverse across the full 0–20 domain, matching the captain's confirmed palette | "Current boundary values are correct because that's what's in the code" | The confirmed band palette recorded in project foundation docs | Unit test, pure function, zero I/O | Hardcoding current constants as the expected values instead of the documented palette |
| #3 | A crafted request cannot cause a write referencing another captain's row, on any route accepting 2+ foreign IDs | "Row-level security's write check is enough" (it isn't, for cross-table references); "every route already has this check" (one didn't) | Enumerate every multi-ID write route; confirm each verifies ownership of ALL referenced rows, not just the row being written | Integration test per route, seeded with 2 distinct captains | Testing only the happy path — the point is the attacker path |
| #4 | No write path deletes an estimate the captain didn't ask to lose; every app-caused deletion is the one shown in a confirmation first | "Estimates only get lost through the one known removal flow" — other future paths could cascade silently too | Full foreign-key cascade behavior end-to-end; every write path that can trigger a delete | Integration test against a real/local database | Asserting the count against the same code path twice instead of an independently-seeded fixture |
| #5 | The confirmation-shown count exactly equals what deletes, verified against an independent fixture | "The count query and the actual cascade always stay in sync" | Foreign-key definitions vs. the count-query's scoping | Integration test against a real/local database | Tautological count-vs-count assertion |
| #6 | Live match-mode blocks session start unless both rosters have exactly 5 armies, with a clear message otherwise | "The existing ≤5 cap already guarantees exactly 5" — it doesn't; a 3-army roster still passes that check | Where in the live-match-mode entry flow the exactly-5 gate belongs | Unit/integration test, written alongside the live-match-mode rollout phase — cannot land before it exists | Assuming the existing roster-cap tests already cover this — they test a different invariant |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap + critical-path coverage | Stand up the test runner; prove the score↔band mapping and cross-captain write protection hold | #2, #3 | unit + integration | planned | `context/changes/testing-bootstrap-critical-path-coverage/` |
| 2 | Data-integrity coverage | Prove estimate loss can't happen silently through any current write path | #4, #5 | integration | not started | — |
| 3 | Live match-mode coverage | Prove the suggestion engine never reuses a committed army, weighs the downstream refused-attacker impact, and gates session start on exactly-5 rosters | #1, #6 | unit + integration/e2e | not started | — |
| 4 | Quality-gates wiring | Lock the floor: wire the suite into CI; evaluate one AI-native layer only if it adds signal beyond Phases 1-3 | cross-cutting | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section are grounded in local manifests/configs —
no docs/search MCP was available in the current session to cross-check
against upstream documentation (see grounding note below).

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see Phase 1 | Vite-native (project already runs Vite 7.3.2 under Astro), zero extra config layer, first-class TS support |
| API mocking | none planned | n/a | The only external dependency with meaningful failure modes is Supabase; integration tests hit a local Supabase instance directly (matches the existing `seed.sql` RLS-isolation-test convention), not a mocked HTTP edge |
| e2e | Playwright | none yet — see Phase 3 | Needed for the live match-mode two-sub-round sequence, which the PRD's acceptance criteria treat as one indivisible flow |
| accessibility | none yet | n/a | No dedicated PRD/NFR requirement beyond general one-handed-phone usability; not scheduled by any phase — revisit if that changes |
| (optional) AI-native | none yet — see Phase 4 | n/a | Only added if Phase 4's signal check justifies it (e.g. a post-edit hook re-running matrix/estimate-mapping tests, given that area's documented instability) |

**Stack grounding tools (current session):**
- Docs: none available (no Context7/framework-docs MCP exposed this session); checked: 2026-09-09
- Search: WebSearch (generic, host-provided) available; no Exa.ai; not queried — recommendations rest on local manifest evidence; checked: 2026-09-09
- Runtime/browser: none available (no Playwright/browser MCP exposed this session); checked: 2026-09-09
- Provider/platform: Cloudflare MCP installed but unauthenticated this session; `gh` CLI available via Bash, relevant to future CI/quality-gate wiring; checked: 2026-09-09

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit + integration | local + CI | required after Phase 1 | logic regressions |
| e2e on critical flows | CI on PR | required after Phase 3 | broken critical user paths (live match-mode sequence) |
| post-edit hook | local (agent loop) | recommended after Phase 4, contingent on the signal check | regressions at edit time in historically unstable areas |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (score↔band mapping pattern lands here).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 (cross-captain ownership-check pattern lands here).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 3 (live match-mode two-sub-round sequence pattern lands here).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 2 (write-path / cascade-delete integration pattern lands here).

### 6.5 Per-rollout-phase notes

(Filled in as each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI polish / styling (Tailwind classes, layout tweaks)** — visual only, not behavioral, low blast radius for a solo-captain MVP. Re-evaluate if the app grows a multi-person team or a design system that needs regression protection. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-09
- Stack versions last verified: 2026-09-09
- AI-native tool references last verified: 2026-09-09

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
