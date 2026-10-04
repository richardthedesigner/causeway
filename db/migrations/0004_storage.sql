-- Photo storage for notes (D-030). Supabase only: does nothing on a plain
-- Postgres without the storage schema (tests, local builds).
--
-- note-photos: private. You can upload into your own folder; nobody can
--   read from it but the service role (the reviewer).
-- note-photos-approved: public. A reviewer copies a photo here and sets
--   note.photo_status = 'approved'; only then does note_public show it.
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema: skipping photo buckets';
    return;
  end if;
  insert into storage.buckets (id, name, public) values
    ('note-photos', 'note-photos', false),
    ('note-photos-approved', 'note-photos-approved', true)
  on conflict (id) do nothing;
  execute $p$
    create policy note_photos_upload_own on storage.objects for insert to authenticated
    with check (bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy note_photos_replace_own on storage.objects for update to authenticated
    using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end
$outer$;
