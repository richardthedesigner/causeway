-- What a new Supabase project already has before our migrations run, so the tests
-- see what production sees (SEC-16). Run before db/migrations/*.sql.
--
-- 1. The anon, authenticated and service_role roles, the auth schema and auth.uid().
--    0003_sharing.sql also creates the first three itself when they are missing.
-- 2. Supabase's default privileges: everything created in public is granted in full
--    to anon, authenticated and service_role. Without this, a plain Postgres starts
--    every table with no grants and hides holes like review C1 and H1.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated;
  end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
