-- User notes: people's own experience of a place or a stretch of footway
-- (D-024). Our own content, kept in a separate layer from the ODbL graph
-- (D-008): no foreign keys into graph_edge or graph_node. Notes point at
-- OSM way ids (stable across builds) and carry edge ids only as a hint for
-- the build they were written on. Joined to the graph at query time.
--
-- Not wired to anything yet: notes live on the device until there is a
-- backend decision (D-022). Shape matches UserNote in
-- packages/graph/src/notes.ts.

create type note_sentiment as enum ('good', 'mixed', 'bad');

create table note (
  id              uuid primary key default gen_random_uuid(),
  -- Pseudonymous author (device or account). Used to count corroboration
  -- from different people; never shown, never joined to a profile.
  author_id       uuid not null,
  area_id         text not null references area(id),
  target_kind     text not null check (target_kind in ('place', 'way')),
  target_name     text not null,
  -- Place notes: the venue or entrance reference ('station:...', 'entrance:<osm id>').
  place_ref       text,
  -- Way notes: OSM way ids, plus edge ids for the build they were taken on.
  osm_way_ids     bigint[] not null default '{}',
  edge_ids        bigint[] not null default '{}',
  graph_built_at  timestamptz,
  geom            geometry(Point, 4326) not null,
  sentiment       note_sentiment not null,
  body            text not null check (char_length(btrim(body)) between 1 and 280),
  photo_path      text,
  -- Opt-in per note, a coarse label only. Never thresholds (D-009).
  mobility_label  text check (mobility_label in (
    'manual wheelchair', 'powerchair or scooter', 'walking aid', 'walking',
    'pram or buggy', 'visual impairment', 'fatigue or chronic illness'
  )),
  observed_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  check ((target_kind = 'place') = (place_ref is not null)),
  check (target_kind = 'place' or cardinality(osm_way_ids) > 0 or cardinality(edge_ids) > 0)
);

create index note_geom on note using gist (geom);
create index note_osm_ways on note using gin (osm_way_ids);
create index note_place_ref on note (place_ref) where place_ref is not null;

insert into source (id, name, licence, attribution, share_alike, refresh_cadence, notes) values
  ('notes', 'Causewayside user notes', 'Causewayside content (not ODbL)', 'Notes from Causewayside users', false, 'live',
   'Separate layer from the ODbL graph (D-008). Never merged into OSM-derived edges.');
