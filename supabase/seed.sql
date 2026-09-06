-- RLS isolation verification for the pairing domain schema.
-- Runs automatically on every `supabase db reset` (local only — never applied to production).
-- Fails loudly via RAISE EXCEPTION if row-level security stops isolating captains' data.
-- See context/changes/schema-teams-opponents-matrix/plan.md (Phase 2) for design rationale.

insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'captain-a@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'captain-b@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Insert captain A's team while impersonating captain A.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
insert into public.teams (id, captain_id, name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Captain A Team')
on conflict (id) do nothing;
reset role;

-- Insert captain B's team while impersonating captain B.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set role authenticated;
insert into public.teams (id, captain_id, name)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Captain B Team')
on conflict (id) do nothing;

-- Assert: captain B cannot see captain A's team.
do $$
declare visible_count int;
begin
  select count(*) into visible_count from public.teams where id = '10000000-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'RLS FAILED: captain B can see captain A''s team (% rows visible)', visible_count;
  end if;
end $$;
reset role;

-- Assert: captain A can see their own team.
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
