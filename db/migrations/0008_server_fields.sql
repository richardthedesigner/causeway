-- The server sets the fields the client shouldn't (SEC-17, security review M1 and L1).
--
-- The insert grants on note and report cover every column, so a client could
-- send fields the server owns:
--   - note.created_at: the 30-a-day limit counts notes by created_at, so a
--     backdated one skipped it.
--   - note.photo_path: free text, so a note could point at someone else's
--     photo in the private bucket, even one a reviewer had rejected.
--   - report.status and report.verified_by: a report could arrive as 'fixed'
--     and never reach the "new" list reviewers work through.
-- Triggers rather than column grants: the app sends whole rows (and reports
-- carry their own created_at from the offline queue), and a trigger keeps
-- working if a later migration grants a new column.

-- Notes. Replaces note_photo_pending (0003_sharing.sql), which already set
-- status and photo_status. Runs before note_rate_limit (triggers fire in name
-- order), though that one only reads rows already stored.
create function note_server_fields() returns trigger language plpgsql as $$
begin
  new.created_at := now();
  -- When it was seen can be earlier than now (notes wait on the phone when
  -- offline), never later.
  new.observed_at := least(new.observed_at, now());
  -- A photo can only be your own, uploaded for this note (apps/web/src/lib/sync.ts).
  if new.photo_path is not null and new.photo_path is distinct from new.author_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'photo_path must be your own photo for this note' using errcode = '42501';
  end if;
  new.photo_status := case when new.photo_path is null then 'none' else 'pending' end;
  new.status := 'visible';
  return new;
end $$;
create trigger note_server_fields before insert on note for each row execute function note_server_fields();
drop trigger note_photo_pending on note;
drop function note_photo_pending();

-- Reports always start new and unverified. created_at stays the client's: it
-- is when the person saw the problem, and nothing counts reports by it.
create function report_server_fields() returns trigger language plpgsql as $$
begin
  new.status := 'new';
  new.verified_by := '{}';
  return new;
end $$;
create trigger report_server_fields before insert on report for each row execute function report_server_fields();

revoke all on function note_server_fields(), report_server_fields() from public, anon, authenticated;
