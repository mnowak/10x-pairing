-- RLS policies only take effect once a role already has base table
-- privileges — Postgres checks GRANTs before RLS. The original schema
-- migration (20260904185524) enabled RLS and added policies for these
-- tables but never granted the underlying privileges to `authenticated`,
-- which is silently masked on a local `supabase start` stack (its default
-- project template pre-grants these) but not on a project provisioned via
-- the CLI/API, where no such default exists. Confirmed on production via
-- "permission denied for table opponents" on every read/write to these
-- tables despite correct RLS policies.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_armies to authenticated;
grant select, insert, update, delete on public.opponents to authenticated;
grant select, insert, update, delete on public.opponent_armies to authenticated;
grant select, insert, update, delete on public.pairing_matrix_estimates to authenticated;
