-- Sharing notes and reports (D-030). Supabase: Postgres + PostGIS, with
-- anonymous sign-in so nobody needs an account. auth.uid() is the
-- anonymous user's id; it is never shown to anyone else.
--
-- Notes are shown to other people straight away (post-moderation), and are
-- hidden as soon as two different people flag one. Photos are never shown to
-- anyone else until someone has checked them (faces, number plates).
-- Reports are write-only for the public: they go to triage, not to a feed.
-- No profile data, ever (D-009).

-- On Supabase the auth schema, auth.uid() and the anon and authenticated
-- roles already exist. On a plain Postgres (CI, local builds) create the
-- minimum so the rules below can be defined and tested. auth.uid() reads the
-- same JWT claim Supabase's does.
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

-- ---------------------------------------------------------------- areas
insert into area (id, name, bounds) values
  ('edinburgh', 'Central Edinburgh', st_makeenvelope(-3.25, 55.92, -3.15, 55.975, 4326)),
  ('newcastle', 'Newcastle and Gateshead', st_makeenvelope(-1.627, 54.961, -1.59, 54.979, 4326)),
  ('london', 'Westminster to Canary Wharf', st_makeenvelope(-0.133, 51.4975, -0.013, 51.509, 4326))
on conflict (id) do nothing;

-- ---------------------------------------------------------------- notes
alter table note
  add column ground text check (ground in ('dry', 'wet')),
  -- visible: shown to others. hidden: flagged by two people, waiting for a look. removed: taken down.
  add column status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  add column photo_status text not null default 'none' check (photo_status in ('none', 'pending', 'approved', 'rejected'));

alter table note alter column author_id set default auth.uid();
create index note_area_status on note (area_id, status);

-- Photos start pending; only a reviewer (service role) can approve them.
create function note_photo_pending() returns trigger language plpgsql as $$
begin
  new.photo_status := case when new.photo_path is null then 'none' else 'pending' end;
  new.status := 'visible';
  return new;
end $$;
create trigger note_photo_pending before insert on note for each row execute function note_photo_pending();

-- At most 30 notes a day from one person: enough for a busy day out, not enough to flood a city.
create function note_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from note where author_id = new.author_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many notes today' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger note_rate_limit before insert on note for each row execute function note_rate_limit();

-- People can flag a note as wrong, unkind or personal. Two different people hide it.
create table note_flag (
  note_id    uuid not null references note(id) on delete cascade,
  flagger_id uuid not null default auth.uid(),
  reason     text not null check (reason in ('wrong', 'unkind', 'personal', 'other')),
  created_at timestamptz not null default now(),
  primary key (note_id, flagger_id)
);

create function note_flag_hide() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct flagger_id) from note_flag where note_id = new.note_id) >= 2 then
    update note set status = 'hidden' where id = new.note_id and status = 'visible';
  end if;
  return new;
end $$;
create trigger note_flag_hide after insert on note_flag for each row execute function note_flag_hide();

-- A per-person pseudonym for counting different people (corroboration) without
-- exposing anyone's id. The salt lives where only the view's owner can read it.
create schema if not exists private;
create table private.salt (value text not null);
insert into private.salt (value) select gen_random_uuid()::text || gen_random_uuid()::text;

-- What everyone can read: visible notes, never the author id, photos only once approved.
create view note_public as
select
  n.id,
  n.area_id,
  n.target_kind,
  n.target_name,
  n.place_ref,
  n.osm_way_ids,
  n.edge_ids,
  n.graph_built_at,
  st_x(n.geom) as lon,
  st_y(n.geom) as lat,
  n.sentiment,
  n.body,
  case when n.photo_status = 'approved' then n.photo_path end as photo_path,
  n.mobility_label,
  n.ground,
  n.observed_at,
  encode(sha256(convert_to(n.author_id::text || (select value from private.salt limit 1), 'UTF8')), 'hex') as author_key,
  n.author_id = auth.uid() as own
from note n
where n.status = 'visible';

-- ---------------------------------------------------------------- reports
alter table report
  add column author_id uuid default auth.uid(),
  add column area_id text references area(id),
  add column accuracy_m real,
  add column status text not null default 'new' check (status in ('new', 'triaged', 'fixed', 'rejected'));

-- ---------------------------------------------------------------- access
alter table note enable row level security;
alter table note_flag enable row level security;
alter table report enable row level security;

-- Notes: write and delete your own. Reading other people's goes through note_public.
create policy note_insert_own on note for insert to authenticated with check (author_id = auth.uid());
create policy note_select_own on note for select to authenticated using (author_id = auth.uid());
create policy note_delete_own on note for delete to authenticated using (author_id = auth.uid());

create policy flag_insert_own on note_flag for insert to authenticated with check (flagger_id = auth.uid());

-- Reports: write only. Nobody but the service role reads them.
create policy report_insert_own on report for insert to authenticated with check (author_id = auth.uid());

revoke all on note, note_flag, report from anon, authenticated;
grant select, insert, delete on note to authenticated;
grant insert on note_flag, report to authenticated;
grant select on note_public to anon, authenticated;
revoke all on schema private from anon, authenticated;
