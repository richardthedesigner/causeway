-- Supabase's default grants are taken back (0007_supabase_grants.sql, SEC-16), run with
--   scripts/test-db.sh
-- after db/test/supabase-stub.sql, which grants everything in public the way a new
-- Supabase project does. Every check raises if it fails.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- A visible note to aim at.
insert into note (id, author_id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
values ('77777777-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000007', 'edinburgh', 'place', 'Museum', 'nms',
        st_setsrid(st_point(-3.19, 55.947), 4326), 'good', 'Step-free side entrance', now());

-- C1. Signed out, the view is read only.
set role anon;
select pg_temp.check((select count(*) = 1 from note_public where id = '77777777-0000-0000-0000-000000000001'), 'signed out, anyone can still read visible notes');
do $$ begin
  delete from note_public where id = '77777777-0000-0000-0000-000000000001';
  raise exception 'FAILED: anon deleted a note through note_public';
exception when insufficient_privilege then raise notice 'ok: signed out, nobody can delete a note through note_public';
end $$;
do $$ begin
  insert into note_public (id, area_id, target_kind, target_name, place_ref, sentiment, body, observed_at)
  values (gen_random_uuid(), 'edinburgh', 'place', 'x', 'x', 'good', 'x', now());
  raise exception 'FAILED: anon inserted through note_public';
exception when insufficient_privilege then raise notice 'ok: signed out, nobody can write through note_public';
end $$;
reset role;

-- Signed in, the same.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000007', false);
do $$ begin
  delete from note_public where id = '77777777-0000-0000-0000-000000000001';
  raise exception 'FAILED: authenticated deleted a note through note_public';
exception when insufficient_privilege then raise notice 'ok: signed in, nobody can delete a note through note_public';
end $$;
reset role;
select pg_temp.check((select count(*) = 1 from note where id = '77777777-0000-0000-0000-000000000001'), 'the note is still there');
select pg_temp.check(
  (select count(*) = 0 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'note_public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
  'note_public grants anon and authenticated select only');

-- H1. Nobody but the owner writes the graph.
set role anon;
do $$ begin
  delete from source where id = 'crowd';
  raise exception 'FAILED: anon deleted a source';
exception when insufficient_privilege then raise notice 'ok: signed out, nobody can delete a source';
end $$;
do $$ begin
  insert into area (id, name, bounds) values ('probe', 'probe', st_makeenvelope(0, 0, 1, 1, 4326));
  raise exception 'FAILED: anon inserted an area';
exception when insufficient_privilege then raise notice 'ok: signed out, nobody can add an area';
end $$;
reset role;
select pg_temp.check(
  (select bool_and(not has_table_privilege(r, 'public.' || t, p))
   from unnest(array['anon', 'authenticated']) r,
        unnest(array['source', 'area', 'graph_node', 'graph_edge', 'edge_attribute', 'node_attribute',
                     'live_state', 'partner_venue_access', 'edge_attribute_resolved']) t,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p),
  'anon and authenticated can''t insert, update, delete or truncate any graph table');
select pg_temp.check((select count(*) = 6 from source where id in ('osm', 'lidar-scotland', 'lidar-england', 'derived', 'tfl', 'crowd')), 'the sources are untouched');

-- Every table in public has row-level security on. Tables that belong to an
-- extension (PostGIS's spatial_ref_sys, on a plain Postgres) aren't ours to change.
select pg_temp.check(
  (select count(*) = 0 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')),
  'every table in public has row-level security on');

-- Nothing in public is truncatable by anon or authenticated: row-level security doesn't stop truncate.
select pg_temp.check(
  (select count(*) = 0 from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
  'anon and authenticated hold no truncate, trigger or references grants in public');

-- New objects start with no grants, despite Supabase's defaults.
create table public.grants_probe (id int);
create sequence public.grants_probe_seq;
select pg_temp.check(
  not has_table_privilege('anon', 'public.grants_probe', 'select')
  and not has_table_privilege('authenticated', 'public.grants_probe', 'insert')
  and not has_sequence_privilege('anon', 'public.grants_probe_seq', 'usage'),
  'new tables and sequences in public are not granted to anon or authenticated');
drop table public.grants_probe;
drop sequence public.grants_probe_seq;

delete from note where id = '77777777-0000-0000-0000-000000000001';
