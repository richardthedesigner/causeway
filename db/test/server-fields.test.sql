-- The server sets the fields the client shouldn't (0008_server_fields.sql, SEC-17). Run by
-- scripts/test-db.sh after the other rules tests, on the same scratch database.
-- Every check raises if it fails.
\set ON_ERROR_STOP 1
\set d '''dddddddd-0000-0000-0000-000000000004'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', :d, false);

-- M1. A backdated created_at is replaced, so 40 backdated notes still meet the 30-a-day limit.
do $$
declare stored int;
begin
  for i in 1..40 loop
    begin
      insert into note (area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, created_at)
      values ('edinburgh', 'place', 'Somewhere', 'd' || i, st_setsrid(st_point(-3.19, 55.947), 4326), 'mixed', 'note ' || i,
              now() - interval '2 days', now() - interval '2 days');
    exception when raise_exception then null;
    end;
  end loop;
  select count(*) into stored from note where author_id = auth.uid();
  if stored <> 30 then raise exception 'FAILED: % backdated notes accepted, expected 30', stored; end if;
  raise notice 'ok: a backdated created_at does not get round the 30-a-day limit';
end $$;
select pg_temp.check((select bool_and(created_at > now() - interval '1 minute') from note where author_id = auth.uid()),
  'the server sets created_at, whatever the client sends');
select pg_temp.check((select bool_and(observed_at < now() - interval '1 day') from note where author_id = auth.uid()),
  'an earlier observed_at is kept (notes wait on the phone when offline)');
reset role;
delete from note where author_id = 'dddddddd-0000-0000-0000-000000000004';
set role authenticated;

-- A note can't be seen in the future, or arrive already reviewed.
insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, status, photo_status)
values ('dddddddd-1111-0000-0000-000000000001', 'edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326),
        'good', 'x', now() + interval '30 days', 'removed', 'approved');
select pg_temp.check((select observed_at <= now() and status = 'visible' and photo_status = 'none' from note where id = 'dddddddd-1111-0000-0000-000000000001'),
  'a future observed_at becomes now, and status and photo_status are the server''s');

-- L1. A note can only carry your own photo, uploaded for that note.
insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, photo_path)
values ('dddddddd-1111-0000-0000-000000000002', 'edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326),
        'good', 'x', now(), 'dddddddd-0000-0000-0000-000000000004/dddddddd-1111-0000-0000-000000000002.jpg');
select pg_temp.check((select photo_status = 'pending' from note where id = 'dddddddd-1111-0000-0000-000000000002'), 'your own photo for this note is accepted');
do $$ begin
  insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, photo_path)
  values ('dddddddd-1111-0000-0000-000000000003', 'edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326),
          'good', 'x', now(), 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000002.jpg');
  raise exception 'FAILED: a note claimed someone else''s photo';
exception when insufficient_privilege then raise notice 'ok: a note cannot claim someone else''s photo';
end $$;
do $$ begin
  insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at, photo_path)
  values ('dddddddd-1111-0000-0000-000000000004', 'edinburgh', 'place', 'Museum', 'nms', st_setsrid(st_point(-3.19, 55.947), 4326),
          'good', 'x', now(), 'dddddddd-0000-0000-0000-000000000004/dddddddd-1111-0000-0000-000000000002.jpg');
  raise exception 'FAILED: a note claimed the photo of another of your notes';
exception when insufficient_privilege then raise notice 'ok: a note cannot reuse the photo of another note';
end $$;

-- M1. A report always starts new and unverified; its created_at is the client's.
insert into report (id, geom, kind, detail, status, verified_by, created_at)
values ('dddddddd-2222-0000-0000-000000000001', st_setsrid(st_point(-3.19, 55.95), 4326), 'blocked', 'Bins',
        'fixed', '{eeeeeeee-0000-0000-0000-00000000000e}', now() - interval '1 hour');
select pg_temp.check((select status = 'new' and verified_by = '{}' and created_at < now() - interval '59 minutes' from report where id = 'dddddddd-2222-0000-0000-000000000001'),
  'a report arrives new and unverified, whatever the client sends');
reset role;
