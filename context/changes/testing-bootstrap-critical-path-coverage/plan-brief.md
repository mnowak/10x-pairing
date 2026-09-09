# Bootstrap + Critical-Path Coverage — Plan Brief

> Full plan: `context/changes/testing-bootstrap-critical-path-coverage/plan.md`

## What & Why

Stand up this project's first test runner and use it to prove two of the project's top-ranked risks hold: the score↔band mapping (revised twice already per the PRD's FR-004 Socratic history) and cross-captain write protection (a bug class that already recurred once across routes). This is Phase 1 of the test-plan rollout (`context/foundation/test-plan.md` §3).

## Starting Point

No test framework exists yet — `package.json` has no `vitest`, no `test` script, and CI runs lint+build only. The two behaviors under test are already implemented and already correct: `src/lib/colorBands.ts`'s score↔band mapping, and the ownership checks in `src/lib/matrix.ts`'s `upsertEstimate` and `src/lib/opponents.ts`'s `removeArmyFromOpponent`. This phase adds regression protection, not bug fixes.

## Desired End State

`npm test` runs a smoke test, a pure-function unit suite, and two real-database integration tests — all green — inside a Cloudflare Workers Pool runtime matching production. `test-plan.md`'s cookbook (§6.1/§6.2) names these files as the pattern for the next rollout phase, and Phase 1's rollout status reads `complete`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Test layer for risk #3 | Lib-function level, not HTTP-route level | The ownership-check logic lives in `src/lib/matrix.ts`/`opponents.ts`, which already take a Supabase client as a parameter — no Astro/Cloudflare request path needed to exercise it. |
| Test runtime | `@cloudflare/vitest-pool-workers` | User's explicit choice, for runtime parity with production from the start, ahead of strict necessity for this phase's targets. |
| DB fixture strategy | Reuse `seed.sql`'s two captains + per-test cleanup | Matches the existing local-Supabase-test convention; avoids a slow full `db reset` or new service-role secret handling. |
| Route coverage scope | Both `upsertEstimate` (primary) and `removeArmyFromOpponent` (defense-in-depth) | Matches test-plan.md's explicit guidance to enumerate every multi-ID write route — though research showed these two prove different things (see below). |
| Unit test depth | Full boundary + round-trip + error-path coverage | Pure function, zero I/O — this coverage is cheap, and boundary values are exactly where this mapping has broken before. |
| Test file layout | Co-located `*.test.ts` next to source | Vitest's own convention; zero extra config; easiest for a future contributor or agent to find. |
| Test scripts | `test` (run-once) + `test:watch` | `test` matches what CI (Phase 4) and agent workflows will expect by convention; watch mode for local dev. |

**Research correction surfaced during planning**: the `opponents/armies/remove.ts` fix (F1, archived impl-review) actually lives in the *route handler*, not a lib function, and fixed a same-captain/cross-opponent bug — not literally cross-captain. The genuinely cross-captain-protected lib-level behavior is `removeArmyFromOpponent`'s `captain_id`-scoped delete filter, which is what Phase 3 actually tests as the second case.

## Scope

**In scope:**
- Vitest + `@cloudflare/vitest-pool-workers` setup, path alias resolution, `npm test`/`test:watch`
- Unit coverage for `src/lib/colorBands.ts` (risk #2)
- Integration coverage for `upsertEstimate` and `removeArmyFromOpponent` (risk #3)
- `test-plan.md` §6.1/§6.2 cookbook entries + Phase 1 rollout status

**Out of scope:**
- CI wiring (rollout Phase 4)
- Data-integrity / cascade-delete coverage, risks #4/#5 (rollout Phase 2)
- Live match-mode coverage, risks #1/#6 (rollout Phase 3 — feature doesn't exist yet)
- HTTP-route-level tests
- Stryker mutation testing run

## Architecture / Approach

Both test suites call domain-layer functions in `src/lib/*.ts` directly rather than going through Astro API routes — these functions are already dependency-injected with a `SupabaseClient` parameter, so a real local Supabase client (signed in as one of two seeded captains) is enough to exercise them under a real database, with no HTTP layer or Cloudflare binding involved. The Workers Pool runtime is wired via a dedicated, minimal `wrangler.test.jsonc` rather than the app's own `wrangler.jsonc`, since the latter points at the full Astro SSR build

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Environment Setup | Vitest + Workers Pool wired, `npm test` green on a smoke test | Pool-workers config drift from the app's real `wrangler.jsonc` (mitigated by mirroring compatibility date/flags) |
| 2. Unit Tests — Score↔Band Mapping | `colorBands.test.ts`, full boundary/round-trip/error coverage | Accidentally mirroring the implementation instead of the archived oracle |
| 3. Integration Tests — Cross-Captain Write Protection | `matrix.test.ts`, `opponents.test.ts`, shared two-captain fixture | Fixture accidentally pointed at a linked/remote Supabase project |
| 4. Cookbook + Test-Plan Sync | §6.1/§6.2 filled in, Phase 1 status → complete | None significant — mechanical doc update |

**Prerequisites:** Local Supabase running (`npx supabase start`) before Phase 3's tests can pass.
**Estimated effort:** ~1 session across 4 phases — this is a bootstrap phase, not a feature build.

## Open Risks & Assumptions

- Exact `@cloudflare/vitest-pool-workers` version/API surface wasn't verified against upstream docs this session (no docs MCP available, per `test-plan.md` §4's grounding note) — the implementer should confirm current setup steps against the package's own README when installing.
- The local Supabase anon key/URL sourcing method (Phase 3, Critical Implementation Details) is specified as a constraint ("never from `.env`/`.dev.vars`") but the exact mechanism (hardcoded local URL vs. `supabase status -o json` parsing) is left for the implementer to finalize.

## Success Criteria (Summary)

- `npm test` passes locally with local Supabase running, covering risks #2 and #3 with real (not mirrored) oracles
- Disabling either ownership check makes its test fail — proving real signal, not just correct shape
- `test-plan.md`'s cookbook and rollout table reflect what shipped
