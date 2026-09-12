-- Production security audit (roadmap S-10) remediation.
-- 1. Pin search_path on the shared updated_at trigger function (Supabase
--    linter: function_search_path_mutable) — an unset search_path is a
--    schema-hijacking risk. Safe to pin to empty here: the function body
--    only calls the built-in now(), which resolves via pg_catalog
--    regardless of search_path.
-- 2. Rewrite all 5 RLS policies to wrap auth.uid() in (select ...)
--    (Supabase linter: auth_rls_initplan) so it's evaluated once per
--    query instead of once per row. Same access-control semantics.
-- 3. Revoke anon's leftover TRUNCATE/REFERENCES/TRIGGER grants on all 5
--    tables — provisioned by Supabase's default project template, never
--    explicitly revoked. Not exploitable via PostgREST (no TRUNCATE verb
--    exposed), but inconsistent with this app's login-required access
--    model (every table is captain-owned; anon should hold zero
--    privileges).

alter function public.set_updated_at() set search_path = '';

drop policy "captain manages own teams" on public.teams;
create policy "captain manages own teams" on public.teams
  for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id);

drop policy "captain manages own team_armies" on public.team_armies;
create policy "captain manages own team_armies" on public.team_armies
  for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id);

drop policy "captain manages own opponents" on public.opponents;
create policy "captain manages own opponents" on public.opponents
  for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id);

drop policy "captain manages own opponent_armies" on public.opponent_armies;
create policy "captain manages own opponent_armies" on public.opponent_armies
  for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id);

drop policy "captain manages own pairing_matrix_estimates" on public.pairing_matrix_estimates;
create policy "captain manages own pairing_matrix_estimates" on public.pairing_matrix_estimates
  for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id);

revoke truncate, references, trigger on public.teams from anon;
revoke truncate, references, trigger on public.team_armies from anon;
revoke truncate, references, trigger on public.opponents from anon;
revoke truncate, references, trigger on public.opponent_armies from anon;
revoke truncate, references, trigger on public.pairing_matrix_estimates from anon;
