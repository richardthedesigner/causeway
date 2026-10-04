-- Behaviour of the sharing rules (0003_sharing.sql), run with
--   scripts/test-db.sh
-- against a scratch Postgres + PostGIS with db/test/supabase-stub.sql loaded.
-- Every check raises if it fails, so ON_ERROR_STOP turns any failure into a non-zero exit.
\set ON_ERROR_STOP 1
\set a '''aaaaaaaa-0000-0000-0000-000000000001'''
\set b '''bbbbbbbb-0000-0000-0000-000000000002'''
\set c '''cccccccc-0000-0000-0000-000000000003'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- A leaves a note with a photo.
set role authenticated;
select set_config('request.jwt.claim.sub', :a, false);
insert into note (id, area_id, target_kind, target_name, osm_way_ids, geom, sentiment, body, photo_path, mobility_label, ground, observed_at)
values ('11111111-0000-0000-0000-000000000001', 'edinburgh', 'way', 'Victoria Street', '{100}', st_setsrid(st_point(-3.1937, 55.9484), 4326),
        'bad', 'Setts are fine in the dry, lethal when wet.', 'a/1.jpg', 'manual wheelchair', 'wet', now());
select pg_temp.check((select own and photo_path is null and author_key is not null from note_public where id = '11111111-0000-0000-0000-000000000001'),
  'author sees their note as their own, photo held back until checked');

-- A can't claim to be someone else, or slip a photo past review.
do $$ begin
  insert into note (area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, author_id)
  values ('edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326), 'good', 'x', now(), 'bbbbbbbb-0000-0000-0000-000000000002');
  raise exception 'FAILED: inserted a note as someone else';
exception when insufficient_privilege then raise notice 'ok: cannot write a note as someone else';
end $$;
insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, photo_path, observed_at)
values ('11111111-0000-0000-0000-000000000002', 'edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326), 'good', 'Step-free side entrance', 'a/2.jpg', now());
select pg_temp.check((select photo_status = 'pending' from note where id = '11111111-0000-0000-0000-000000000002'), 'a new photo always starts pending');

-- B reads A's note through the public view only, and can't delete it.
select set_config('request.jwt.claim.sub', :b, false);
select pg_temp.check((select count(*) = 0 from note), 'someone else''s rows are not readable from the table');
select pg_temp.check((select count(*) = 2 and bool_and(not own) from note_public), 'others see visible notes through the view, not as their own');
select pg_temp.check((select count(*) = 0 from information_schema.columns where table_name = 'note_public' and column_name = 'author_id'), 'the view never exposes author ids');
delete from note where id = '11111111-0000-0000-0000-000000000001';
reset role;
select pg_temp.check((select count(*) = 1 from note where id = '11111111-0000-0000-0000-000000000001'), 'nobody can delete someone else''s note');

-- B's note has a different pseudonym from A's.
set role authenticated;
select set_config('request.jwt.claim.sub', :b, false);
insert into note (id, area_id, target_kind, target_name, osm_way_ids, geom, sentiment, body, observed_at)
values ('22222222-0000-0000-0000-000000000001', 'edinburgh', 'way', 'Victoria Street', '{100}', st_setsrid(st_point(-3.1937, 55.9484), 4326), 'bad', 'Slippery in the rain', now());
select pg_temp.check((select count(distinct author_key) = 2 from note_public where target_name = 'Victoria Street'), 'different people get different pseudonyms');

-- Two different people flag A's first note: it disappears from the view. One flag isn't enough.
insert into note_flag (note_id, reason) values ('11111111-0000-0000-0000-000000000001', 'wrong');
select pg_temp.check((select count(*) = 1 from note_public where id = '11111111-0000-0000-0000-000000000001'), 'one flag does not hide a note');
select set_config('request.jwt.claim.sub', :c, false);
insert into note_flag (note_id, reason) values ('11111111-0000-0000-0000-000000000001', 'unkind');
select pg_temp.check((select count(*) = 0 from note_public where id = '11111111-0000-0000-0000-000000000001'), 'two people flagging hides a note');

-- Reports: write only.
insert into report (geom, kind, detail) values (st_setsrid(st_point(-3.19, 55.95), 4326), 'blocked', 'Bins across the pavement');
do $$ begin
  perform count(*) from report;
  raise exception 'FAILED: read reports as the public';
exception when insufficient_privilege then raise notice 'ok: reports are write-only for the public';
end $$;

-- Rate limit: the 31st note in a day is refused.
do $$ begin
  for i in 1..30 loop
    insert into note (area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
    values ('edinburgh', 'place', 'Somewhere', 'p' || i, st_setsrid(st_point(-3.19, 55.947), 4326), 'mixed', 'note ' || i, now());
  end loop;
  begin
    insert into note (area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
    values ('edinburgh', 'place', 'Somewhere', 'p31', st_setsrid(st_point(-3.19, 55.947), 4326), 'mixed', 'one too many', now());
    raise exception 'FAILED: 31st note accepted';
  exception when raise_exception then raise notice 'ok: 31 notes in a day is refused';
  end;
end $$;

-- Anyone, signed in or not, can read the public view; nobody signed out can write.
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) > 0 from note_public), 'signed-out visitors can read visible notes');
do $$ begin
  insert into note (area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
  values ('edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326), 'good', 'x', now());
  raise exception 'FAILED: signed-out insert accepted';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors cannot write';
end $$;
reset role;
