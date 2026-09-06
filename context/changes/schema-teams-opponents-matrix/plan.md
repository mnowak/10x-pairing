# Team/Opponent/Pairing-Matrix Schema Implementation Plan

## Overview

Create the first Postgres schema (5 tables, RLS, indexes) for Pairing Assistant's core domain: a captain's team roster, prepared opponent rosters, and the color-banded pairing-matrix estimates between them. This is roadmap item **F-01** — a pure data-layer foundation that unlocks S-01 (create team roster) and S-02 (prepare opponent matrix). No application code (API routes, pages, forms) is written in this change.

## Current State Analysis

- No domain schema exists yet. `supabase/` contains only `config.toml` and `.gitignore` — no `migrations/` directory, no `.sql` files (confirmed via repo search: `grep -rn "\.from(" src/` returns zero matches, meaning no code queries any table today). *(origin: code — verified this session)*
- Auth is fully wired and already verified in production: `src/middleware.ts` sets `context.locals.user` from Supabase; `src/lib/supabase.ts` returns `null` when unconfigured. This change does not touch either file. *(origin: code)*
- `supabase/config.toml` references `sql_paths = ["./seed.sql"]` under `[db.seed]` (already `enabled = true`), but `seed.sql` does not exist on disk yet — this plan creates it. *(origin: code)*
- Roster size must stay flexible (no hardcoded cap of 5) per `context/foundation/roadmap.md`'s S-01 Risk note, tracing to PRD FR-016 (parked but schema shouldn't foreclose it). *(origin: product)*
- PRD guardrail: "No loss of previously entered pairing-matrix estimates once saved, including mid-tournament" — plain durable UPDATE semantics satisfy this; no audit/history table is implied anywhere in the PRD. *(origin: product)*

## Definitions

| Term | Decided meaning | Origin | On degenerate data | Verified by |
| --- | --- | --- | --- | --- |
| Team (per captain) | A captain may have zero or more `teams` rows. No DB-level cap — "one team per captain" (PRD Non-Goals) is an app/UI convention only, not enforced here. | user | If two `teams` rows ever exist for one captain (bug or future multi-team feature), the schema permits it; picking "the" team is a downstream (S-01) concern, out of scope here. | N/A — schema permits, not exercised by this change |
| Army name uniqueness | Within one roster (`team_armies` for our team, `opponent_armies` for an opponent), no two armies may share the same `name` — a real Warhammer 40k rule: a team roster does not field the same army/faction twice. | user (domain rule confirmed this session) | Inserting a second army named identically to an existing one in the same roster fails the UNIQUE constraint. | `unique(team_id, name)` / `unique(opponent_id, name)` — Phase 1 |
| Pairing-matrix estimate value | Stored as a raw integer `score` (0–20 — the share of the 20 match points our army is expected to score). Color-band display (red/orange/.../purple) is a pure function of the number, computed in the application layer, never stored. **Revised 2026-09-06**, reverting FR-004's original color-band-storage decision — see PRD FR-004's Socratic note. | user (this session's reversal, superseding the original PRD decision) | An integer outside 0–20 is rejected by the `CHECK` constraint at the DB level | `score integer check (score between 0 and 20)` — Phase 1 |
| Pairing-matrix estimate, "not yet entered" / "unpredictable" | Absence of a row for a given `(team_army_id, opponent_army_id)` pair means both "not yet estimated" AND "too unpredictable to estimate" (formerly the separate purple band) — both collapse to the same "no row" state. No sentinel row is pre-created for every possible pair. | user | Querying an unestimated (or declared-unpredictable) pair returns zero rows; app code (S-02) must treat "no row" as one undifferentiated "no estimate" state — it cannot distinguish "haven't gotten to it yet" from "captain looked and declared it unpredictable." | `unique(team_army_id, opponent_army_id)` enables UPSERT-as-edit for FR-006 — Phase 1 |
| Roster size | No fixed cap in schema; `team_armies` / `opponent_armies` are 1-to-many child tables, not fixed columns on the parent. | product (roadmap.md S-01 Risk note ← PRD FR-016) | A roster with 3 or 12 armies is equally valid at the schema level. | Schema shape itself — no row-count CHECK — Phase 1 |
| Ownership scoping | Every table carries a denormalized `captain_id default auth.uid()`, enabling one uniform RLS policy shape (`auth.uid() = captain_id`) instead of nested joins through parent tables. | code (this session's architecture decision, not a domain rule) | N/A | Phase 2 RLS verification script |

## Desired End State

After this change: `supabase db reset` (local) creates 5 tables (`teams`, `team_armies`, `opponents`, `opponent_armies`, `pairing_matrix_estimates`) with RLS enabled and a captain-scoped policy on each; a seed script proves cross-captain row isolation by assertion (fails loudly via `RAISE EXCEPTION` if RLS is broken); and `src/db/database.types.ts` gives S-01/S-02 typed access to every table from day one.

Verification: `supabase db reset` exits 0, the RLS seed assertions pass silently, and `npm run db:types` produces a file containing all 5 table names.

### Key Discoveries:

- `package.json` already has `"supabase": "^2.23.4"` as a devDependency — no new dependency needed for migrations or `gen types`.
- `supabase/config.toml`'s `[db.seed]` is already `enabled = true` with `sql_paths = ["./seed.sql"]` — the seed script in Phase 2 will run automatically on every `supabase db reset` with zero config changes.
- Local Postgres role `postgres` (what `psql`/seed scripts run as by default) has `BYPASSRLS` — RLS assertions in the seed script must explicitly `SET ROLE authenticated;` around each check, or the "test" would silently pass by bypassing RLS entirely rather than exercising it. See Critical Implementation Details.

## What We're NOT Doing

- No application code — no API routes, pages, or forms reading/writing these tables. That's S-01 (team roster CRUD) and S-02 (opponent + matrix CRUD).
- No live-match-mode session/state schema (committed armies, sub-round tracking). Deferred to S-03 per the roadmap's progressive-disclosure decision — it's the only slice that needs it.
- No database-level enforcement of "one team per captain" — app-level only, per this session's decision.
- No UI-adjacent concerns (renaming an army, deleting a team) — not exposed by any FR yet. The schema's cascade behavior supports them if/when a future slice adds that UI.
- No pgTAP or a formal test framework — RLS verification uses a plain, deterministic SQL script with `RAISE EXCEPTION` assertions, proportional to MVP scope and the 2-week timeline.

## Implementation Approach

One Supabase migration creates all 5 tables, their indexes, `updated_at` triggers, and RLS policies together — they're too interdependent (FKs between them) to usefully split into separate migrations. A second file (`seed.sql`) proves RLS actually isolates rows between accounts, wired into Supabase's existing local-reset flow. A third, small step generates TypeScript types so downstream slices start with type safety instead of `any`.

## Critical Implementation Details

- **RLS testing requires dropping superuser privileges mid-script.** `seed.sql` runs as the `postgres` role by default, which has `BYPASSRLS` — setting `request.jwt.claims` alone does *not* exercise RLS. Each assertion block must `SET ROLE authenticated;` before querying and `RESET ROLE;` before switching to the next simulated captain's claims, or the isolation check would falsely pass.
- **`captain_id` is denormalized onto every table via `default auth.uid()`**, not derived by joining up to `teams`/`opponents`. This is a deliberate RLS-simplicity choice (uniform one-line policy on every table, no nested `EXISTS` subqueries) — a future reviewer should not "normalize this away" without re-deriving the RLS policies for the nested-join case.
- **Migrations must be created via `supabase migration new <name>`**, not a hand-picked filename. The CLI's timestamp prefix is how `supabase db reset` / `db push` order migrations; a hand-named file risks ordering bugs against future migrations.
- **`supabase db push` (Phase 4) is irreversible without a manual down-migration.** There is no automatic rollback command — reverting a bad production push means hand-writing and pushing a new migration that undoes it. Phase 4 is therefore a human-gated, non-automated phase: `/10x-implement` should not run `db push` unattended.

## Phase 1: Schema migration

### Overview

Create all 5 tables, their indexes, `updated_at` triggers, and RLS policies in one migration.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_create_pairing_domain_schema.sql` (generate via `supabase migration new create_pairing_domain_schema` — do not hand-name the file)

**Intent**: Stand up the full domain schema — teams, rosters (ours and opponents'), and the pairing-matrix estimates between them — with uniform captain-scoped RLS on every table.

**Contract**:

```sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_captain_id_idx on public.teams(captain_id);

create table public.team_armies (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  captain_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (team_id, name)
);
create index team_armies_team_id_idx on public.team_armies(team_id);
create index team_armies_captain_id_idx on public.team_armies(captain_id);

create table public.opponents (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opponents_captain_id_idx on public.opponents(captain_id);

create table public.opponent_armies (
  id uuid primary key default gen_random_uuid(),
  opponent_id uuid not null references public.opponents(id) on delete cascade,
  captain_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (opponent_id, name)
);
create index opponent_armies_opponent_id_idx on public.opponent_armies(opponent_id);
create index opponent_armies_captain_id_idx on public.opponent_armies(captain_id);

create table public.pairing_matrix_estimates (
  id uuid primary key default gen_random_uuid(),
  team_army_id uuid not null references public.team_armies(id) on delete cascade,
  opponent_army_id uuid not null references public.opponent_armies(id) on delete cascade,
  captain_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 20),
  updated_at timestamptz not null default now(),
  unique (team_army_id, opponent_army_id)
);
create index pme_team_army_id_idx on public.pairing_matrix_estimates(team_army_id);
create index pme_opponent_army_id_idx on public.pairing_matrix_estimates(opponent_army_id);
create index pme_captain_id_idx on public.pairing_matrix_estimates(captain_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger opponents_set_updated_at before update on public.opponents
  for each row execute function public.set_updated_at();
create trigger pme_set_updated_at before update on public.pairing_matrix_estimates
  for each row execute function public.set_updated_at();

alter table public.teams enable row level security;
alter table public.team_armies enable row level security;
alter table public.opponents enable row level security;
alter table public.opponent_armies enable row level security;
alter table public.pairing_matrix_estimates enable row level security;

create policy "captain manages own teams" on public.teams
  for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id);
create policy "captain manages own team_armies" on public.team_armies
  for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id);
create policy "captain manages own opponents" on public.opponents
  for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id);
create policy "captain manages own opponent_armies" on public.opponent_armies
  for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id);
create policy "captain manages own pairing_matrix_estimates" on public.pairing_matrix_estimates
  for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id);
```

### Success Criteria:

#### Automated Verification:

- `supabase db reset` exits 0 and applies the new migration cleanly
- `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*"` lists all 5 new tables
- `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select tablename, rowsecurity from pg_tables where schemaname='public';"` shows `rowsecurity = t` for all 5 tables

#### Manual Verification:

- Supabase Studio (`http://localhost:54323`) → Table Editor shows all 5 tables with the expected columns
- Supabase Studio → Authentication → Policies shows exactly one policy per table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Seed data + RLS isolation verification

### Overview

Prove RLS actually isolates rows between two different captains, via a deterministic script that runs automatically on every `supabase db reset`.

### Changes Required:

#### 1. Seed script

**File**: `supabase/seed.sql` (new file — already referenced by `config.toml`'s `[db.seed] sql_paths`)

**Intent**: Create two synthetic captains, insert one team each (as that captain, via simulated JWT claims), then assert — with `RAISE EXCEPTION` on failure — that captain B cannot see captain A's row and that captain A can see their own.

**Contract**: Each simulated-user block follows the pattern `select set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true); set role authenticated; <insert or assert>; reset role;` — the `set role` / `reset role` pair is mandatory (see Critical Implementation Details); omitting it makes the assertions vacuously pass under the superuser's `BYPASSRLS`.

```sql
insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'captain-a@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'captain-b@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
insert into public.teams (id, captain_id, name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Captain A Team')
on conflict (id) do nothing;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set role authenticated;
insert into public.teams (id, captain_id, name)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Captain B Team')
on conflict (id) do nothing;

do $$
declare visible_count int;
begin
  select count(*) into visible_count from public.teams where id = '10000000-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'RLS FAILED: captain B can see captain A''s team (% rows visible)', visible_count;
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
do $$
declare own_count int;
begin
  select count(*) into own_count from public.teams where id = '10000000-0000-0000-0000-000000000001';
  if own_count <> 1 then
    raise exception 'RLS FAILED: captain A cannot see own team (% rows visible, expected 1)', own_count;
  end if;
end $$;
reset role;
```

### Success Criteria:

#### Automated Verification:

- `supabase db reset` runs `seed.sql` and completes without a `RAISE EXCEPTION` (every RLS assertion passes)
- Running `supabase db reset` a second time is idempotent — no unique-violation errors from the seed script itself (`on conflict do nothing` on all seed inserts)

#### Manual Verification:

- Supabase Studio → Table Editor → `teams`, filtered by service-role access, shows both seeded teams exist (confirms the isolation check above wasn't silently vacuous because no data was ever inserted)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: TypeScript type generation

### Overview

Generate typed database access for S-01/S-02 to build against.

### Changes Required:

#### 1. `package.json` script

**File**: `package.json`

**Intent**: Add a repeatable command to regenerate types from the local schema.

**Contract**: New script `"db:types": "supabase gen types typescript --local > src/db/database.types.ts"` in the `"scripts"` block.

#### 2. Generated types file

**File**: `src/db/database.types.ts` (new — run `npm run db:types` once locally against the migrated database and commit the output)

**Intent**: Give S-01/S-02 a typed `Database` type to parameterize the Supabase client, instead of `any`.

**Contract**: Output of `supabase gen types typescript --local` — not hand-written; regenerate via the script above whenever the schema changes.

### Success Criteria:

#### Automated Verification:

- `npm run db:types` exits 0
- `src/db/database.types.ts` exists and contains all 5 new table names (`teams`, `team_armies`, `opponents`, `opponent_armies`, `pairing_matrix_estimates`)
- `npm run lint` passes with the new file present

#### Manual Verification:

- Open `src/db/database.types.ts` and confirm the generated columns match Phase 1's schema (names, nullability, the `color` check-constraint values)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Apply migration to production Supabase

### Overview

Push the verified local migration to the production Supabase project already wired into the live Cloudflare Worker deploy (`SUPABASE_URL`/`SUPABASE_KEY` set via `wrangler secret put` — see `context/deployment/deploy-plan.md`). This is a human-authorized operational step, not an agent-driven code change — the agent runs commands only with the human present and each mutating step confirmed, per this repo's production-access posture (`CLAUDE.md`: destructive/irreversible actions are human-only).

This environment is currently **not** logged into the Supabase CLI and **not** linked to any project (verified: `supabase projects list` → "Access token not provided"; no `supabase/.temp/project-ref`). Both must be established by the human before this phase can run.

### Changes Required:

#### 1. Authenticate and link

**File**: none (CLI state, not a repo file)

**Intent**: Establish the CLI's connection to the real Supabase project backing production, using the human's own credentials.

**Contract**: `supabase login` (interactive browser auth — human runs this themselves, token never touches chat) then `supabase link --project-ref <project-ref>` (the ref is the subdomain segment of the project's `SUPABASE_URL`, e.g. `https://<project-ref>.supabase.co`). Confirm success via `supabase projects list` showing the project, and `supabase/.temp/project-ref` existing afterward.

#### 2. Diff before push

**File**: none

**Intent**: See exactly what `db push` would apply before applying it — the last check before an irreversible production mutation.

**Contract**: `supabase db diff --linked` (or `supabase migration list --linked` to compare local vs. remote applied migrations) — review the output names only the Phase 1 migration, nothing unexpected.

#### 3. Push

**File**: none

**Intent**: Apply the migration to production.

**Contract**: `supabase db push` — human confirms the CLI's own pre-push prompt (it lists pending migrations and asks for confirmation before applying). Do not pass `--yes`/non-interactive flags that skip this confirmation.

### Success Criteria:

#### Automated Verification:

- `supabase migration list --linked` shows the Phase 1 migration as applied on the remote (matching local)

#### Manual Verification:

- Human confirms the CLI's pre-push confirmation prompt before it applies
- Supabase Studio (cloud dashboard, not local) → Table Editor shows all 5 tables on the production project
- The live app (`https://pairing-assistant.michal-nowak-7b3.workers.dev`) still responds 200 on `/` and redirects correctly on `/dashboard` after the push (no regression to the already-verified auth flow — see `context/deployment/deploy-plan.md`'s verification steps)

**Implementation Note**: This phase has no "next phase" to gate into — it's the last step. Do not run Phase 4 unattended; every command in this phase requires the human present and each confirmation prompt answered by them, not auto-approved.

---

## Testing Strategy

### Unit Tests:

- None — no application code in this change.

### Integration Tests:

- Phase 2's `seed.sql` RLS isolation script, re-run automatically on every `supabase db reset`.

### Manual Testing Steps:

1. `supabase start`, then `supabase db reset` — confirm all 5 tables, indexes, triggers, RLS policies, and the seed script complete without error.
2. Open Supabase Studio (`http://localhost:54323`), inspect each table's RLS policies.
3. Spot-check beyond the automated assertions: run one INSERT as each seeded captain via Studio's SQL editor (with `set role authenticated` + the matching JWT claim) and confirm cross-visibility still fails as expected.

## Performance Considerations

Indexes on every foreign key and on `captain_id` (the RLS filter column) keep both the FK joins and the RLS policy check index-backed. At this project's target scale (small user count, low QPS per `prd.md`), no further tuning is warranted.

## Migration Notes

This creates a new schema — no existing data to migrate. Phases 1-3 run entirely against the local Supabase stack; Phase 4 is the only phase that touches the production project, and it is human-gated (see Phase 4 and Critical Implementation Details). There is no automatic rollback for `supabase db push` — reverting after a bad production push means writing and pushing a new corrective migration, not a single revert command.

## References

- Roadmap item: `context/foundation/roadmap.md` — F-01
- PRD: `context/foundation/prd.md` — FR-001, FR-003, FR-004, FR-006, Access Control, privacy NFR
- Domain source: `context/foundation/shape-notes.md` (color-band matrix mechanics, roster rules)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration

#### Automated

- [x] 1.1 `supabase db reset` exits 0 and applies the new migration cleanly — f4e8826
- [x] 1.2 `\dt public.*` lists all 5 new tables — f4e8826
- [x] 1.3 `rowsecurity = t` for all 5 tables — f4e8826

#### Manual

- [x] 1.4 Studio Table Editor shows all 5 tables with expected columns — f4e8826
- [x] 1.5 Studio Policies shows exactly one policy per table — f4e8826

### Phase 2: Seed data + RLS isolation verification

#### Automated

- [x] 2.1 `supabase db reset` completes with no RLS `RAISE EXCEPTION` — b514d30
- [x] 2.2 Second `supabase db reset` run is idempotent — b514d30

#### Manual

- [x] 2.3 Studio confirms both seeded teams exist — b514d30

### Phase 3: TypeScript type generation

#### Automated

- [x] 3.1 `npm run db:types` exits 0 — c1d2d0e
- [x] 3.2 `src/db/database.types.ts` contains all 5 table names — c1d2d0e
- [x] 3.3 `npm run lint` passes — c1d2d0e

#### Manual

- [x] 3.4 Generated types match Phase 1's schema — c1d2d0e

### Phase 4: Apply migration to production Supabase

#### Automated

- [x] 4.1 `supabase migration list --linked` shows the Phase 1 migration applied remotely — 4317ac7

#### Manual

- [x] 4.2 Human confirms the CLI's pre-push prompt before it applies — 4317ac7
- [x] 4.3 Cloud Supabase Studio shows all 5 tables on the production project — 4317ac7
- [x] 4.4 Live app still responds correctly on `/` and `/dashboard` after the push — 4317ac7
