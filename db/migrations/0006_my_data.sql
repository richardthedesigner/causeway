-- Delete everything about me (SEC-06, UK GDPR). Someone could already delete their own
-- notes (0003). Now also their own reports, their own flags, and their own photos in the
-- private bucket, so "Delete everything" in the app leaves nothing of theirs behind.
-- A photo a reviewer approved is a copy in the public bucket; deleting the note hides it
-- (note_public only shows photos of visible notes), and a reviewer removes the copy.
create policy report_delete_own on report for delete to authenticated using (author_id = auth.uid());
create policy flag_delete_own on note_flag for delete to authenticated using (flagger_id = auth.uid());
-- Deleting needs the rows to be visible to the statement: own rows only.
create policy report_select_own on report for select to authenticated using (author_id = auth.uid());
create policy flag_select_own on note_flag for select to authenticated using (flagger_id = auth.uid());
grant select, delete on report, note_flag to authenticated;

do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema: skipping photo deletion rules';
    return;
  end if;
  execute $p$
    create policy note_photos_read_own on storage.objects for select to authenticated
    using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy note_photos_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end
$outer$;
