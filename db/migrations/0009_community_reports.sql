-- Community reports (FEAT-35, D-084). People tag good or bad access on the
-- map by category, others agree, disagree or say whether it's still there,
-- and the app works out a decaying confidence from the votes
-- (packages/graph/src/community.ts). Unlike problem reports (`report`, write
-- only, for triage), these are public: that is the point of them.
--
-- Who: the anonymous id from Supabase's anonymous sign-in, as for notes
-- (D-030). When accounts come (DEF-07), Supabase links an identity to the
-- same anonymous user, so auth.uid() and everything here stays the same.
-- Nothing in this file needs to change for that.
--
-- Abuse, enforced here and not in the app:
--   - per person: 20 reports and 200 votes a day;
--   - per network address: 60 reports and 600 votes a day, counted by a
--     salted hash that changes daily and is never readable (anyone can make
--     new anonymous ids, but not new addresses as easily);
--   - one vote per person per report (a new vote replaces the old one), and
--     never on your own report;
--   - two people reporting a report as wrong, unkind or personal hide it
--     until a reviewer looks;
--   - photos are pre-moderated (faces, number plates), as for notes;
--   - everyone else sees the position rounded to 4 decimal places, never the
--     author, and vote times only to the hour, so one person's reports can't
--     be strung together into where they live.

-- ------------------------------------------------------------ the tables
create table community_report (
  id            uuid primary key,
  author_id     uuid not null default auth.uid(),
  area_id       text not null references area(id),
  category      text not null check (category in (
    'no-dropped-kerb', 'steps', 'broken-lift', 'narrow-pavement', 'blocked-pavement', 'rough-surface', 'steep',
    'dropped-kerb', 'ramp', 'big-lift', 'smooth-pavement', 'accessible-toilet', 'seat'
  )),
  geom          geometry(Point, 4326) not null,
  body          text check (body is null or char_length(btrim(body)) between 1 and 200),
  photo_path    text,
  photo_status  text not null default 'none' check (photo_status in ('none', 'pending', 'approved', 'rejected')),
  -- visible: shown. hidden: flagged by two people, waiting for a look. removed: taken down.
  status        text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  observed_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  -- Salted, daily-changing hash of the network address, for rate limits only. Never readable.
  net_key       text
);
create index community_report_area on community_report (area_id, status);
create index community_report_author on community_report (author_id, created_at);
create index community_report_net on community_report (net_key, created_at);

create table community_vote (
  report_id  uuid not null references community_report(id) on delete cascade,
  voter_id   uuid not null default auth.uid(),
  kind       text not null check (kind in ('agree', 'disagree', 'still-there', 'gone')),
  created_at timestamptz not null default now(),
  net_key    text,
  primary key (report_id, voter_id)
);
create index community_vote_voter on community_vote (voter_id, created_at);
create index community_vote_net on community_vote (net_key, created_at);

create table community_flag (
  report_id  uuid not null references community_report(id) on delete cascade,
  flagger_id uuid not null default auth.uid(),
  reason     text not null check (reason in ('wrong', 'unkind', 'personal', 'other')),
  created_at timestamptz not null default now(),
  primary key (report_id, flagger_id)
);

insert into source (id, name, licence, attribution, share_alike, refresh_cadence, notes) values
  ('community', 'Causewayside community reports', 'Causewayside content (not ODbL)', 'Reports from Causewayside users', false, 'live',
   'Separate layer from the ODbL graph (D-008). Joined to edges by position at request time (D-084).')
on conflict (id) do nothing;

-- ------------------------------------------------------------ server fields and limits
-- The network address PostgREST passes on, hashed with the private salt and today's date.
-- Null outside PostgREST (tests, the SQL editor): then only the per-person limits apply.
create function private.net_key() returns text language plpgsql stable security definer set search_path = public, private as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
  ip text := btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', ''), ',', 1));
begin
  if ip = '' then return null; end if;
  return encode(sha256(convert_to(ip || current_date::text || (select value from private.salt limit 1), 'UTF8')), 'hex');
end $$;
revoke all on function private.net_key() from public, anon, authenticated;

create function community_report_server_fields() returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  new.observed_at := least(new.observed_at, now());
  new.status := 'visible';
  new.net_key := private.net_key();
  if new.photo_path is not null and new.photo_path is distinct from new.author_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'photo_path must be your own photo for this report' using errcode = '42501';
  end if;
  new.photo_status := case when new.photo_path is null then 'none' else 'pending' end;
  if not exists (select 1 from area a where a.id = new.area_id and st_intersects(a.bounds, new.geom)) then
    raise exception 'outside the city' using errcode = '22023';
  end if;
  if (select count(*) from community_report where author_id = new.author_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports today' using errcode = 'P0001';
  end if;
  if new.net_key is not null and (select count(*) from community_report where net_key = new.net_key and created_at > now() - interval '1 day') >= 60 then
    raise exception 'too many reports today from this network' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger community_report_server_fields before insert on community_report for each row execute function community_report_server_fields();

create function community_vote_server_fields() returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  new.voter_id := auth.uid();
  new.created_at := now();
  new.net_key := private.net_key();
  if tg_op = 'UPDATE' and new.report_id is distinct from old.report_id then
    raise exception 'a vote stays on its report' using errcode = '42501';
  end if;
  if exists (select 1 from community_report where id = new.report_id and author_id = new.voter_id) then
    raise exception 'you can''t vote on your own report' using errcode = '42501';
  end if;
  if (select count(*) from community_vote where voter_id = new.voter_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'too many votes today' using errcode = 'P0001';
  end if;
  if new.net_key is not null and (select count(*) from community_vote where net_key = new.net_key and created_at > now() - interval '1 day') >= 600 then
    raise exception 'too many votes today from this network' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger community_vote_server_fields before insert or update on community_vote for each row execute function community_vote_server_fields();

create function community_flag_hide() returns trigger language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := coalesce(
    (select max(at) from review_log where subject = 'community' and subject_id = new.report_id and reviewer_id is not null),
    '-infinity');
begin
  new.flagger_id := auth.uid();
  new.created_at := now();
  if (select count(distinct flagger_id) from community_flag where report_id = new.report_id and flagger_id <> new.flagger_id and created_at > since) >= 1 then
    update community_report set status = 'hidden' where id = new.report_id and status = 'visible';
  end if;
  return new;
end $$;
create trigger community_flag_hide before insert on community_flag for each row execute function community_flag_hide();

revoke all on function community_report_server_fields(), community_vote_server_fields(), community_flag_hide() from public, anon, authenticated;

-- ------------------------------------------------------------ what everyone sees
create view community_report_public as
select
  r.id,
  r.area_id,
  r.category,
  round(st_x(r.geom)::numeric, 4)::float8 as lon,
  round(st_y(r.geom)::numeric, 4)::float8 as lat,
  r.body,
  case when r.photo_status = 'approved' then r.photo_path end as photo_path,
  r.observed_at,
  coalesce((
    select json_agg(json_build_object('kind', v.kind, 'at', date_trunc('hour', v.created_at)) order by v.created_at)
    from community_vote v where v.report_id = r.id and v.voter_id is distinct from auth.uid()
  ), '[]'::json) as votes,
  (select v.kind from community_vote v where v.report_id = r.id and v.voter_id = auth.uid()) as my_vote,
  r.author_id = auth.uid() as own
from community_report r
where r.status = 'visible';

-- ------------------------------------------------------------ access
alter table community_report enable row level security;
alter table community_vote enable row level security;
alter table community_flag enable row level security;

create policy community_report_insert_own on community_report for insert to authenticated with check (author_id = auth.uid());
create policy community_report_select_own on community_report for select to authenticated using (author_id = auth.uid());
create policy community_report_delete_own on community_report for delete to authenticated using (author_id = auth.uid());

create policy community_vote_insert_own on community_vote for insert to authenticated with check (voter_id = auth.uid());
create policy community_vote_select_own on community_vote for select to authenticated using (voter_id = auth.uid());
create policy community_vote_update_own on community_vote for update to authenticated using (voter_id = auth.uid()) with check (voter_id = auth.uid());
create policy community_vote_delete_own on community_vote for delete to authenticated using (voter_id = auth.uid());

create policy community_flag_insert_own on community_flag for insert to authenticated with check (flagger_id = auth.uid());
create policy community_flag_select_own on community_flag for select to authenticated using (flagger_id = auth.uid());
create policy community_flag_delete_own on community_flag for delete to authenticated using (flagger_id = auth.uid());

revoke all on community_report, community_vote, community_flag, community_report_public from anon, authenticated;
-- Column lists: the server fields (net_key, status, photo_status, created_at) are never the client's to send.
grant select (id, area_id, category, body, photo_path, observed_at, created_at, status, photo_status), delete on community_report to authenticated;
grant insert (id, area_id, category, geom, body, photo_path, observed_at) on community_report to authenticated;
grant select (report_id, voter_id, kind, created_at), delete on community_vote to authenticated;
grant insert (report_id, kind), update (kind) on community_vote to authenticated;
-- Changing your vote is an update of your own row (a new vote replaces the old one, never adds a second).
grant select (report_id, flagger_id, reason, created_at), delete on community_flag to authenticated;
grant insert (report_id, reason) on community_flag to authenticated;
grant select on community_report_public to anon, authenticated;

-- ------------------------------------------------------------ reviewers (0005)
alter table review_log drop constraint review_log_subject_check;
alter table review_log add constraint review_log_subject_check check (subject in ('note', 'photo', 'report', 'community', 'community-photo'));

create function community_review() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who uuid := case when is_reviewer() then auth.uid() end;
begin
  if (to_jsonb(new) - 'status' - 'photo_status') is distinct from (to_jsonb(old) - 'status' - 'photo_status') then
    raise exception 'only status and photo_status can be changed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    insert into review_log (reviewer_id, subject, subject_id, from_state, to_state) values (who, 'community', new.id, old.status, new.status);
  end if;
  if new.photo_status is distinct from old.photo_status then
    insert into review_log (reviewer_id, subject, subject_id, from_state, to_state) values (who, 'community-photo', new.id, old.photo_status, new.photo_status);
  end if;
  return new;
end $$;
revoke all on function community_review() from public, anon, authenticated;
create trigger community_review before update on community_report for each row execute function community_review();

grant select (author_id, geom) on community_report to authenticated;
grant update (status, photo_status) on community_report to authenticated;
create policy community_report_review_select on community_report for select to authenticated using (is_reviewer());
create policy community_report_review_update on community_report for update to authenticated using (is_reviewer()) with check (is_reviewer());
create policy community_flag_review_select on community_flag for select to authenticated using (is_reviewer());
