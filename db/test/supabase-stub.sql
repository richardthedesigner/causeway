-- Kept for running the sharing test on an older checkout. 0003_sharing.sql now
-- creates the same minimum itself when it isn't on Supabase, so this is a no-op
-- when run before the migrations on a current checkout.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated;
  end if;
end $$;
grant usage on schema public to anon, authenticated;
