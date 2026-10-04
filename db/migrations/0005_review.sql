-- Reviewing flags, photos and reports (D-030). Reviewers are real accounts
-- (email sign-in), listed in `reviewer` by the project owner. The review
-- page signs in as that person; it never holds the service key. What a
-- reviewer can do is decided here, by row-level security, and every
-- decision is logged.

create table reviewer (
  user_id  uuid primary key,
  name     text not null,
  added_at timestamptz not null default now()
);
-- Only the owner (SQL editor / service role) adds or removes reviewers.
alter table reviewer enable row level security;
revoke all on reviewer from anon, authenticated;

create function is_reviewer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from reviewer where user_id = auth.uid())
$$;
revoke all on function is_reviewer() from public;
grant execute on function is_reviewer() to anon, authenticated;

-- Who decided what, and when. Written by triggers, readable by reviewers, never editable.
create table review_log (
  id          bigserial primary key,
  -- Null when the change was automatic (two people flagging a note hides it).
  reviewer_id uuid,
  subject     text not null check (subject in ('note', 'photo', 'report')),
  subject_id  uuid not null,
  from_state  text,
  to_state    text not null,
  at          timestamptz not null default now()
);
alter table review_log enable row level security;
revoke all on review_log from anon, authenticated;
grant select on review_log to authenticated;
create policy review_log_read on review_log for select to authenticated using (is_reviewer());

create function log_review() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who uuid := case when is_reviewer() then auth.uid() end;
begin
  if tg_table_name = 'note' then
    if new.status is distinct from old.status then
      insert into review_log (reviewer_id, subject, subject_id, from_state, to_state) values (who, 'note', new.id, old.status, new.status);
    end if;
    if new.photo_status is distinct from old.photo_status then
      insert into review_log (reviewer_id, subject, subject_id, from_state, to_state) values (who, 'photo', new.id, old.photo_status, new.photo_status);
    end if;
  elsif new.status is distinct from old.status then
    insert into review_log (reviewer_id, subject, subject_id, from_state, to_state) values (who, 'report', new.id, old.status, new.status);
  end if;
  return new;
end $$;

-- Reviewers can only ever change the review fields, never what someone wrote.
create function review_fields_only() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'note' then
    if (to_jsonb(new) - 'status' - 'photo_status') is distinct from (to_jsonb(old) - 'status' - 'photo_status') then
      raise exception 'only status and photo_status can be changed' using errcode = '42501';
    end if;
  elsif (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only status can be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger note_review_fields before update on note for each row execute function review_fields_only();
create trigger report_review_fields before update on report for each row execute function review_fields_only();
create trigger note_review_log after update on note for each row execute function log_review();
create trigger report_review_log after update on report for each row execute function log_review();

-- Notes: reviewers see every note (hidden and pending ones too) and its flags, and set the review fields.
grant update (status, photo_status) on note to authenticated;
create policy note_review_select on note for select to authenticated using (is_reviewer());
create policy note_review_update on note for update to authenticated using (is_reviewer()) with check (is_reviewer());
grant select on note_flag to authenticated;
create policy flag_review_select on note_flag for select to authenticated using (is_reviewer());

-- Reports: reviewers read them and move them along.
grant select, update (status) on report to authenticated;
create policy report_review_select on report for select to authenticated using (is_reviewer());
create policy report_review_update on report for update to authenticated using (is_reviewer()) with check (is_reviewer());

-- Photos (Supabase only): reviewers can look at pending photos and publish approved ones.
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema: skipping reviewer photo policies';
    return;
  end if;
  execute $p$
    create policy note_photos_review_read on storage.objects for select to authenticated
    using (bucket_id = 'note-photos' and public.is_reviewer())
  $p$;
  execute $p$
    create policy note_photos_review_publish on storage.objects for insert to authenticated
    with check (bucket_id = 'note-photos-approved' and public.is_reviewer())
  $p$;
  execute $p$
    create policy note_photos_review_unpublish on storage.objects for delete to authenticated
    using (bucket_id = 'note-photos-approved' and public.is_reviewer())
  $p$;
end
$outer$;

-- Once a reviewer has put a note back, only flags made after that decision count towards hiding it again.
create or replace function note_flag_hide() returns trigger language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := coalesce(
    (select max(at) from review_log where subject = 'note' and subject_id = new.note_id and reviewer_id is not null),
    '-infinity');
begin
  if (select count(distinct flagger_id) from note_flag where note_id = new.note_id and created_at > since) >= 2 then
    update note set status = 'hidden' where id = new.note_id and status = 'visible';
  end if;
  return new;
end $$;
