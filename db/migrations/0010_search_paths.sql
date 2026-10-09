-- Pin search_path on trigger functions (SEC-26).
--
-- community_report_server_fields() calls st_intersects(). On Supabase, PostGIS
-- lives in the `extensions` schema, so with `search_path = public, private`
-- (0009) every new community report failed: "function st_intersects does not
-- exist". Already applied to production by hand on 2026-10-09; this keeps a
-- fresh database the same. Where `extensions` doesn't exist (CI's plain
-- PostGIS image puts it in `public`), Postgres skips the missing schema.
alter function community_report_server_fields() set search_path = public, private, extensions;

-- The rest had no search_path, so they ran with the caller's. None of them
-- uses PostGIS. Supabase's Security Advisor flags these ("function search
-- path mutable").
alter function note_rate_limit() set search_path = public;
alter function review_fields_only() set search_path = public;
alter function note_server_fields() set search_path = public;
alter function report_server_fields() set search_path = public;
