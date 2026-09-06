# Team/Opponent/Pairing-Matrix Schema — Plan Brief

> Full plan: `context/changes/schema-teams-opponents-matrix/plan.md`

## What & Why

Create the first Postgres schema for Pairing Assistant's core domain — a captain's team roster, prepared opponent rosters, and the color-banded pairing-matrix estimates between them. This is roadmap item F-01, the one foundation blocking every other roadmap slice.

## Starting Point

Zero domain schema exists today — only Supabase Auth's built-in `auth.users` table is used. No migrations, no `.from()` calls anywhere in `src/`, no generated DB types. Auth itself is fully wired and already verified live in production.

## Desired End State

`supabase db reset` (local) stands up 5 tables with RLS enabled, a seed script proves cross-captain row isolation by assertion (fails loudly if RLS is broken), and `src/db/database.types.ts` gives the next two slices (S-01, S-02) typed database access from day one.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| "One team per captain" | Not enforced in DB | App-level convention only — keeps FR-002 (future multi-team) a UI change, not a schema migration | Plan |
| Army name uniqueness | `UNIQUE(parent_id, name)` on both rosters | Real Warhammer 40k rule — a team never fields the same army/faction twice | Plan |
| Matrix estimate storage | Raw integer `score` (0-20), not a color band | Reverts FR-004's original color-band decision — the number is strictly more precise and the band is a pure function of it, derived in the app layer, never stored | Plan (session revision, 2026-09-06) |
| Unestimated / "unpredictable" matrix cell | Absent row, not a nullable-score row | `UNIQUE(team_army_id, opponent_army_id)` doubles as the UPSERT target for "edit" (FR-006); "unpredictable" (formerly purple) collapses into the same "no row" state as "not yet entered" | Plan |
| Ownership scoping | Denormalized `captain_id default auth.uid()` on every table | Uniform one-line RLS policy everywhere, no nested joins through parent tables | Plan |
| Verification target (Phases 1-3) | Local Supabase only | Safe iteration; production push is a separate, human-gated phase | Plan |
| RLS verification | `seed.sql` with 2 synthetic captains + `RAISE EXCEPTION` assertions | Repeatable — re-runs automatically on every `supabase db reset`, not a one-off manual check | Plan |
| Type generation | In scope for this change (`npm run db:types`) | S-01/S-02 start with typed DB access instead of `any` | Plan |
| Orphaned matrix rows | `ON DELETE CASCADE` from armies | No dead rows if an army is ever deleted; app UI must communicate the loss (future slice's job) | Plan |
| Production push | In scope as Phase 4, human-gated | Applies the migration to the real Supabase project already wired into the live Cloudflare Worker deploy; not run unattended | Plan (user-requested addition) |

## Scope

**In scope:** 5-table migration, RLS policies, `updated_at` triggers, RLS isolation seed script, TypeScript type generation, and a human-gated push to production Supabase (Phase 4).

**Out of scope:** Any application code (API routes, pages, forms); live-match-mode session schema (S-03's job); UI-adjacent behaviors (rename/delete army).

## Architecture / Approach

One migration creates all 5 interdependent tables (FKs between them) together. `captain_id` is denormalized onto every table via `default auth.uid()` so RLS policies stay a uniform one-liner instead of nested joins. A `seed.sql` proves isolation between two synthetic captains, exploiting Supabase's existing local-reset flow (`config.toml` already points at it). A small script generates `database.types.ts` for downstream slices.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema migration | 5 tables, indexes, triggers, RLS policies | Getting the RLS policy shape right the first time — retrofitting later touches every table |
| 2. Seed + RLS verification | Deterministic proof RLS isolates rows between accounts | Testing as Postgres superuser silently bypasses RLS (`BYPASSRLS`) — must `SET ROLE authenticated` explicitly |
| 3. TypeScript codegen | `src/db/database.types.ts` for S-01/S-02 | Low risk — mechanical, `supabase gen types` already a known command |
| 4. Push to production | Migration applied to the real Supabase project | Irreversible without a hand-written corrective migration; human must run `supabase login`/`link`/`push` and confirm the CLI's own prompt — not automatable in this environment (currently neither logged in nor linked) |

**Prerequisites:** Local Supabase stack running (`supabase start`, Docker required) — README already documents this setup. Phase 4 additionally needs the human's own Supabase login and the production project's ref.
**Estimated effort:** Not estimated (roadmap items carry no time units) — see `plan.md` for phase-level detail.

## Open Risks & Assumptions

- "One team per captain" isn't DB-enforced — if S-01's UI has a bug that lets a second team slip through, nothing in the schema catches it.
- The denormalized `captain_id` columns must always be set via `default auth.uid()` (never overridden by client-supplied values) — any future slice writing raw inserts must not pass an explicit `captain_id`.

## Success Criteria (Summary)

- `supabase db reset` applies cleanly and the RLS seed assertions pass silently (no `RAISE EXCEPTION`).
- `npm run db:types` produces a `database.types.ts` covering all 5 tables.
- S-01 can start immediately after this lands, with no schema questions left open.
