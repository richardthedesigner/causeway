-- Behaviour of the reviewer rules (0005_review.sql). Run by scripts/test-db.sh
-- after sharing.test.sql, on the same scratch database.
\set ON_ERROR_STOP 1
\set a '''aaaaaaaa-0000-0000-0000-000000000001'''
\set r '''eeeeeeee-0000-0000-0000-00000000000e'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

-- The owner makes R a reviewer. A (the note's author) is not one.
insert into reviewer (user_id, name) values ('eeeeeeee-0000-0000-0000-00000000000e', 'Test reviewer');

-- The flagged note from sharing.test.sql is hidden; its automatic hiding is logged without a reviewer.
select pg_temp.check((select count(*) = 1 from review_log where subject = 'note' and to_state = 'hidden' and reviewer_id is null),
  'two flags hiding a note is logged as automatic');

-- A, a signed-in non-reviewer, can't see hidden notes of others, change statuses, read reports or read the log.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
update note set status = 'visible' where id = '11111111-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) = 0 from note where id = '11111111-0000-0000-0000-000000000001'), 'non-reviewers can''t see hidden notes');
select pg_temp.check((select count(*) = 0 from report), 'non-reviewers can''t read reports');
select pg_temp.check((select count(*) = 0 from review_log), 'non-reviewers can''t read the log');
select pg_temp.check(not is_reviewer(), 'an ordinary account is not a reviewer');
reset role;
select pg_temp.check((select status = 'hidden' from note where id = '11111111-0000-0000-0000-000000000001'), 'a non-reviewer''s update changed nothing');

-- R reviews.
set role authenticated;
select set_config('request.jwt.claim.sub', :r, false);
select pg_temp.check(is_reviewer(), 'a listed account is a reviewer');
select pg_temp.check((select count(*) = 1 from note where id = '11111111-0000-0000-0000-000000000001' and status = 'hidden'), 'reviewers see hidden notes');
select pg_temp.check((select count(*) = 2 from note_flag where note_id = '11111111-0000-0000-0000-000000000001'), 'reviewers see the flags');
update note set status = 'visible' where id = '11111111-0000-0000-0000-000000000001';
update note set photo_status = 'approved' where id = '11111111-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) = 1 from note_public where id = '11111111-0000-0000-0000-000000000001'), 'a note put back is visible again');
select pg_temp.check((select photo_path = 'a/2.jpg' from note_public where id = '11111111-0000-0000-0000-000000000002'), 'an approved photo shows in the public view');
do $$ begin
  update note set body = 'rewritten' where id = '11111111-0000-0000-0000-000000000002';
  raise exception 'FAILED: reviewer rewrote a note';
exception when insufficient_privilege then raise notice 'ok: reviewers can''t rewrite what people wrote';
end $$;
select pg_temp.check((select count(*) >= 1 from report), 'reviewers read reports');
-- One new flag after the reviewer put the note back doesn't undo their decision.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
insert into note_flag (note_id, reason) values ('11111111-0000-0000-0000-000000000001', 'wrong');
select pg_temp.check((select count(*) = 1 from note_public where id = '11111111-0000-0000-0000-000000000001'), 'one new flag doesn''t override a reviewer''s decision');
select set_config('request.jwt.claim.sub', :r, false);
update report set status = 'triaged';
do $$ begin
  update report set detail = 'edited';
  raise exception 'FAILED: reviewer edited a report';
exception when insufficient_privilege then raise notice 'ok: reviewers can''t edit a report''s contents';
end $$;
select pg_temp.check((select count(*) = 3 from review_log where reviewer_id = 'eeeeeeee-0000-0000-0000-00000000000e'::uuid), 'every decision is logged with the reviewer');
do $$ begin
  delete from review_log;
  raise exception 'FAILED: the log was editable';
exception when insufficient_privilege then raise notice 'ok: nobody can edit the log';
end $$;
do $$ begin
  insert into reviewer (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Me');
  raise exception 'FAILED: a reviewer added a reviewer';
exception when insufficient_privilege then raise notice 'ok: reviewers can''t add reviewers';
end $$;
reset role;
