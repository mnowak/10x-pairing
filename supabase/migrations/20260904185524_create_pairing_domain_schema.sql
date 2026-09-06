-- Pairing Assistant domain schema: teams, rosters, opponents, and pairing-matrix estimates.
-- See context/changes/schema-teams-opponents-matrix/plan.md (Phase 1) for design rationale.

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
