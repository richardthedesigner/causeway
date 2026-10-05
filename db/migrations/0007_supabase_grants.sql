-- Take back Supabase's default grants (SEC-16, security review C1 and H1).
--
-- A new Supabase project grants everything created in public to anon and
-- authenticated: select, insert, update, delete, truncate. The earlier
-- migrations assumed a plain Postgres, where nothing is granted. So:
--   - note_public is a plain one-table view that runs as its owner. With the
--     default grants, anyone signed out could delete any note through it.
--   - the graph tables had no row-level security, so anyone could write them.
-- After this migration every table in public has row-level security on, and
-- anon and authenticated hold only the grants the migrations give by name.
-- The tests apply Supabase's defaults first (db/test/supabase-stub.sql).

-- New tables, views, sequences and functions in public start with no grants
-- for anon and authenticated. Each one is granted by name, as 0003 to 0006 do.
-- Applies to objects created by the role that runs the migrations (postgres).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- C1. Read only, through the view.
revoke all on note_public from anon, authenticated;
grant select on note_public to anon, authenticated;

-- H1. The graph (0001_graph.sql) is built and loaded by the project, never
-- written from the app. The app routes from JSON files and reads none of
-- these tables, so they get no select policy either: nobody but the owner and
-- the service role sees or changes them.
alter table source enable row level security;
alter table area enable row level security;
alter table graph_node enable row level security;
alter table graph_edge enable row level security;
alter table edge_attribute enable row level security;
alter table node_attribute enable row level security;
alter table live_state enable row level security;
alter table partner_venue_access enable row level security;

revoke all on source, area, graph_node, graph_edge, edge_attribute, node_attribute,
  live_state, partner_venue_access from anon, authenticated;
-- A view runs as its owner, so row-level security on edge_attribute doesn't cover it.
revoke all on edge_attribute_resolved from anon, authenticated;

-- Sequences: rows with serial ids are only ever written by the owner or by
-- security definer triggers (review_log).
revoke all on sequence live_state_id_seq, partner_venue_access_id_seq, review_log_id_seq
  from anon, authenticated;

-- Functions: the trigger functions can't be called directly, but take back
-- the default grant anyway. is_reviewer() stays callable (0005_review.sql).
revoke all on function note_photo_pending(), note_rate_limit(), note_flag_hide(),
  log_review(), review_fields_only() from public, anon, authenticated;

-- PostGIS. Supabase's dashboard installs it in the extensions schema, so this
-- usually does nothing. Where it sits in public (CI, or a manual install), its
-- reference tables would carry the default grants too: read only from here.
-- On Supabase the extension's owner is supabase_admin, so a revoke by postgres
-- only warns.
do $$
declare t text;
begin
  foreach t in array array['spatial_ref_sys', 'geometry_columns', 'geography_columns', 'raster_columns', 'raster_overviews'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
