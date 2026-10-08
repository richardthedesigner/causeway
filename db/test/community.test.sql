-- Community reports (0009_community_reports.sql, D-084), run by scripts/test-db.sh.
\set ON_ERROR_STOP 1
\set a '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set b '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set c '''cccccccc-0000-0000-0000-00000000000c'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- A reports a missing dropped kerb, with a photo, from a phone whose network PostgREST names.
set role authenticated;
select set_config('request.jwt.claim.sub', :a, false);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', false);
insert into community_report (id, area_id, category, geom, body, photo_path, observed_at)
values ('c0000000-0000-0000-0000-000000000001', 'edinburgh', 'no-dropped-kerb', st_setsrid(st_point(-3.191234, 55.951278), 4326),
        'Full height kerb both sides', 'aaaaaaaa-0000-0000-0000-00000000000a/c0000000-0000-0000-0000-000000000001.jpg', now() + interval '1 day');
select pg_temp.check((select own and lon = -3.1912 and lat = 55.9513 and photo_path is null from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'),
  'author sees it as their own, at a rounded point, photo held back until checked');
select pg_temp.check((select observed_at <= now() and photo_status = 'pending' and status = 'visible' from community_report where id = 'c0000000-0000-0000-0000-000000000001'),
  'the server sets when, the photo state and the status');

-- Server fields can't be sent.
do $$ begin
  insert into community_report (id, area_id, category, geom, observed_at, status) values (gen_random_uuid(), 'edinburgh', 'steps', st_setsrid(st_point(-3.19, 55.95), 4326), now(), 'removed');
  raise exception 'FAILED: client set status';
exception when insufficient_privilege then raise notice 'ok: a client cannot set the status';
end $$;
do $$ begin
  insert into community_report (id, area_id, category, geom, observed_at, net_key) values (gen_random_uuid(), 'edinburgh', 'steps', st_setsrid(st_point(-3.19, 55.95), 4326), now(), 'x');
  raise exception 'FAILED: client set net_key';
exception when insufficient_privilege then raise notice 'ok: a client cannot set the network key';
end $$;
do $$ begin
  select net_key from community_report limit 1;
  raise exception 'FAILED: read net_key';
exception when insufficient_privilege then raise notice 'ok: nobody reads the network key, not even its author';
end $$;
do $$ begin
  insert into community_report (id, area_id, category, geom, observed_at) values (gen_random_uuid(), 'edinburgh', 'steps', st_setsrid(st_point(-0.1, 51.5), 4326), now());
  raise exception 'FAILED: report outside the city accepted';
exception when invalid_parameter_value then raise notice 'ok: a report outside its city is refused';
end $$;
do $$ begin
  insert into community_report (id, area_id, category, geom, photo_path, observed_at)
  values ('c0000000-0000-0000-0000-000000000099', 'edinburgh', 'steps', st_setsrid(st_point(-3.19, 55.95), 4326), 'bbbbbbbb-0000-0000-0000-00000000000b/x.jpg', now());
  raise exception 'FAILED: someone else''s photo accepted';
exception when insufficient_privilege then raise notice 'ok: a report can only carry your own photo';
end $$;

-- A can't vote on their own report.
do $$ begin
  insert into community_vote (report_id, kind) values ('c0000000-0000-0000-0000-000000000001', 'agree');
  raise exception 'FAILED: voted on own report';
exception when insufficient_privilege then raise notice 'ok: nobody votes on their own report';
end $$;

-- B agrees, then changes their mind: one vote each, the latest counts.
select set_config('request.jwt.claim.sub', :b, false);
select pg_temp.check((select not own and my_vote is null from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'), 'others see it, not as their own');
select pg_temp.check((select count(*) = 0 from information_schema.columns where table_name = 'community_report_public' and column_name in ('author_id', 'net_key', 'geom')),
  'the public view never exposes the author, the network key or the exact point');
insert into community_vote (report_id, kind) values ('c0000000-0000-0000-0000-000000000001', 'agree');
do $$ begin
  insert into community_vote (report_id, kind) values ('c0000000-0000-0000-0000-000000000001', 'agree');
  raise exception 'FAILED: second vote';
exception when unique_violation then raise notice 'ok: one vote per person per report';
end $$;
update community_vote set kind = 'gone' where report_id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.check((select my_vote = 'gone' and json_array_length(votes) = 0 from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'),
  'your own vote is yours, and replaces the old one');

-- C sees B's vote, to the hour, with no voter.
select set_config('request.jwt.claim.sub', :c, false);
select pg_temp.check((select json_array_length(votes) = 1 and votes->0->>'kind' = 'gone' and (votes->0->>'at')::timestamptz = date_trunc('hour', (votes->0->>'at')::timestamptz) and votes->0->'voter_id' is null
  from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'), 'others see each vote and its hour, never who');
do $$ begin
  update community_vote set kind = 'agree';
  if exists (select 1 from community_vote where kind = 'agree') then raise exception 'FAILED: changed someone else''s vote'; end if;
  raise notice 'ok: nobody changes someone else''s vote';
end $$;

-- Two flags hide it.
insert into community_flag (report_id, reason) values ('c0000000-0000-0000-0000-000000000001', 'personal');
select pg_temp.check((select count(*) = 1 from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'), 'one flag does not hide a report');
select set_config('request.jwt.claim.sub', :b, false);
insert into community_flag (report_id, reason) values ('c0000000-0000-0000-0000-000000000001', 'wrong');
select pg_temp.check((select count(*) = 0 from community_report_public where id = 'c0000000-0000-0000-0000-000000000001'), 'two people flagging hides a report');

-- Rate limits: 20 a day per person; 60 a day per network across people.
select set_config('request.jwt.claim.sub', :c, false);
do $$ begin
  for i in 1..20 loop
    insert into community_report (id, area_id, category, geom, observed_at) values (gen_random_uuid(), 'edinburgh', 'seat', st_setsrid(st_point(-3.19, 55.95), 4326), now());
  end loop;
  begin
    insert into community_report (id, area_id, category, geom, observed_at) values (gen_random_uuid(), 'edinburgh', 'seat', st_setsrid(st_point(-3.19, 55.95), 4326), now());
    raise exception 'FAILED: 21st report accepted';
  exception when raise_exception then raise notice 'ok: the 21st report in a day is refused';
  end;
end $$;
do $$ begin
  for i in 1..60 loop
    perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
    begin
      insert into community_report (id, area_id, category, geom, observed_at) values (gen_random_uuid(), 'edinburgh', 'seat', st_setsrid(st_point(-3.19, 55.95), 4326), now());
    exception when raise_exception then
      raise notice 'ok: a network that keeps making new ids is stopped (after % more)', i - 1;
      return;
    end;
  end loop;
  raise exception 'FAILED: no limit per network';
end $$;

-- Signed out: read only.
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) > 0 from community_report_public), 'signed-out visitors can read reports');
do $$ begin
  insert into community_report (id, area_id, category, geom, observed_at) values (gen_random_uuid(), 'edinburgh', 'seat', st_setsrid(st_point(-3.19, 55.95), 4326), now());
  raise exception 'FAILED: signed-out insert';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors cannot report';
end $$;

-- Delete everything (SEC-06): A's report, B's vote and flag go.
set role authenticated;
select set_config('request.jwt.claim.sub', :b, false);
delete from community_flag where flagger_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
delete from community_vote where voter_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', :a, false);
delete from community_report where author_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
reset role;
select pg_temp.check((select count(*) = 0 from community_report where author_id = 'aaaaaaaa-0000-0000-0000-00000000000a')
  and (select count(*) = 0 from community_vote where voter_id = 'bbbbbbbb-0000-0000-0000-00000000000b'), 'people can delete everything they added');
select set_config('request.headers', '', false);
