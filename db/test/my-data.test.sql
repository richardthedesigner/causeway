-- Delete everything about me (0006_my_data.sql, SEC-06), run with scripts/test-db.sh.
\set ON_ERROR_STOP 1
\set d '''dddddddd-0000-0000-0000-000000000004'''
\set e '''eeeeeeee-0000-0000-0000-000000000005'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- D and E each leave a note, a report and a flag.
set role authenticated;
select set_config('request.jwt.claim.sub', :d, false);
insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
values ('44444444-0000-0000-0000-000000000001', 'edinburgh', 'place', 'Library', 'lib', st_setsrid(st_point(-3.19, 55.947), 4326), 'good', 'Level entrance', now());
insert into report (id, geom, kind, detail) values ('44444444-0000-0000-0000-0000000000a1', st_setsrid(st_point(-3.19, 55.95), 4326), 'blocked', 'Scaffolding');
select set_config('request.jwt.claim.sub', :e, false);
insert into note (id, area_id, target_kind, target_name, place_ref, geom, sentiment, body, observed_at)
values ('55555555-0000-0000-0000-000000000001', 'edinburgh', 'place', 'Cafe', 'cafe', st_setsrid(st_point(-3.19, 55.947), 4326), 'bad', 'Two steps', now());
insert into report (id, geom, kind, detail) values ('55555555-0000-0000-0000-0000000000a1', st_setsrid(st_point(-3.19, 55.95), 4326), 'blocked', 'Bins');
insert into note_flag (note_id, reason) values ('44444444-0000-0000-0000-000000000001', 'wrong');
select set_config('request.jwt.claim.sub', :d, false);
insert into note_flag (note_id, reason) values ('55555555-0000-0000-0000-000000000001', 'other');

-- D deletes everything of theirs, as the app's "Delete everything" does.
select pg_temp.check((select count(*) = 1 from report), 'you can read back your own reports, and only yours');
delete from note where author_id = auth.uid();
delete from report where author_id = auth.uid();
delete from note_flag where flagger_id = auth.uid();
-- E tries to delete D's things, and can't.
select set_config('request.jwt.claim.sub', :e, false);
delete from report where id = '44444444-0000-0000-0000-0000000000a1';
delete from note_flag where flagger_id <> auth.uid();
reset role;

select pg_temp.check((select count(*) = 0 from note where author_id = :d), 'your notes are gone');
select pg_temp.check((select count(*) = 0 from report where author_id = :d), 'your reports are gone');
select pg_temp.check((select count(*) = 0 from note_flag where flagger_id = :d), 'your flags are gone');
select pg_temp.check((select count(*) = 0 from note_flag where note_id = '44444444-0000-0000-0000-000000000001'), 'flags on your deleted notes go with them');
select pg_temp.check((select count(*) = 1 from note where author_id = :e) and (select count(*) = 1 from report where author_id = :e), 'nobody else''s notes or reports are touched');
