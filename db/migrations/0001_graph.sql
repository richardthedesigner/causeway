-- Causewayside: canonical pedestrian graph (PostGIS). See docs/DATA_MODEL.md.
-- Phase 0: schema only. Not yet applied to a Supabase project.

create extension if not exists postgis;

create type confidence_state as enum ('verified', 'inferred', 'reported', 'unknown');
create type edge_kind as enum (
  'sidewalk', 'footway', 'pedestrian', 'crossing', 'steps', 'ramp',
  'elevator', 'escalator', 'corridor', 'street_proxy'
);
create type node_kind as enum ('junction', 'kerb', 'crossing', 'entrance', 'elevator', 'endpoint');
create type live_status as enum ('open', 'closed', 'restricted', 'degraded');

-- Every dataset we ingest. Licence and share-alike are data, not comments.
create table source (
  id              text primary key,             -- 'osm', 'lidar-scotland', 'tfl', ...
  name            text not null,
  licence         text not null,                -- SPDX-ish: 'ODbL-1.0', 'OGL-UK-3.0'
  attribution     text not null,
  share_alike     boolean not null,
  refresh_cadence text,
  notes           text
);

create table area (
  id    text primary key,                       -- 'edinburgh', 'newcastle-gateshead', 'london'
  name  text not null,
  bounds geometry(Polygon, 4326) not null
);

create table graph_node (
  id       bigint primary key,
  area_id  text not null references area(id),
  geom     geometry(Point, 4326) not null,
  level    numeric not null default 0,
  kind     node_kind not null,
  osm_id   bigint,
  -- Provenance for ODbL: true when the node is derived from OSM.
  from_osm boolean not null default true
);
create index graph_node_geom on graph_node using gist (geom);

create table graph_edge (
  id            bigint primary key,
  area_id       text not null references area(id),
  from_node     bigint not null references graph_node(id),
  to_node       bigint not null references graph_node(id),
  kind          edge_kind not null,
  geom          geometry(LineString, 4326) not null,
  length_m      double precision not null,
  name          text,
  name_inferred boolean not null default false,
  level         numeric not null default 0,
  layer         smallint not null default 0,
  bridge        boolean not null default false,
  bidirectional boolean not null default true,
  osm_way_id    bigint,
  from_osm      boolean not null default true
);
create index graph_edge_geom on graph_edge using gist (geom);
create index graph_edge_from on graph_edge (from_node);
create index graph_edge_to on graph_edge (to_node);

-- One row per observation. Several sources can describe the same attribute;
-- the resolver view chooses. Nothing is overwritten, so disagreement between
-- sources (OSM incline vs LiDAR) is itself data for validation.
create table edge_attribute (
  edge_id        bigint not null references graph_edge(id) on delete cascade,
  attr           text not null,                 -- 'incline', 'inclineMax', 'crossSlope', 'surface', 'width', ...
  value_num      double precision,
  value_text     text,
  state          confidence_state not null,
  source_id      text not null references source(id),
  observed_at    timestamptz,
  method         text,
  corroborations integer not null default 0,
  ingested_at    timestamptz not null default now(),
  primary key (edge_id, attr, source_id)
);

create table node_attribute (
  node_id        bigint not null references graph_node(id) on delete cascade,
  attr           text not null,                 -- 'ele', 'kerbType', 'kerbHeightCm', 'tactilePaving'
  value_num      double precision,
  value_text     text,
  state          confidence_state not null,
  source_id      text not null references source(id),
  observed_at    timestamptz,
  method         text,
  corroborations integer not null default 0,
  ingested_at    timestamptz not null default now(),
  primary key (node_id, attr, source_id)
);

-- Live overlays: closures, works, lift outages. Always time-bounded.
create table live_state (
  id          bigserial primary key,
  edge_id     bigint references graph_edge(id) on delete cascade,
  node_id     bigint references graph_node(id) on delete cascade,
  status      live_status not null,
  reason      text not null,
  source_id   text not null references source(id),
  external_id text,
  valid_from  timestamptz not null,
  valid_until timestamptz not null,
  check (edge_id is not null or node_id is not null),
  check (valid_until > valid_from)
);
create index live_state_window on live_state (valid_until, valid_from);

-- Crowd reports (Phase 4). No profile data here, ever.
create table report (
  id          uuid primary key default gen_random_uuid(),
  edge_id     bigint references graph_edge(id),
  node_id     bigint references graph_node(id),
  geom        geometry(Point, 4326) not null,
  kind        text not null,                    -- 'obstruction', 'kerb', 'surface', 'lift', 'closure'
  detail      text,
  photo_path  text,
  created_at  timestamptz not null default now(),
  verified_by uuid[] not null default '{}'
);

-- Licensed or partner data: keyed by location, never written into the ODbL graph (D-008).
create table partner_venue_access (
  id          bigserial primary key,
  partner     text not null references source(id),
  external_id text not null,
  geom        geometry(Point, 4326) not null,
  attributes  jsonb not null,                   -- VisitEngland-style access vocabulary
  observed_at timestamptz,
  unique (partner, external_id)
);

-- Highest-confidence observation per edge attribute. Phase 1 replaces the
-- ordering with the decay function from packages/graph/src/attribute.ts.
create view edge_attribute_resolved as
select distinct on (edge_id, attr) *
from edge_attribute
where state <> 'unknown'
order by edge_id, attr,
  case state when 'verified' then 0 when 'inferred' then 1 when 'reported' then 2 else 3 end,
  observed_at desc nulls last;

insert into source (id, name, licence, attribution, share_alike, refresh_cadence) values
  ('osm', 'OpenStreetMap', 'ODbL-1.0', '© OpenStreetMap contributors', true, 'minutely diffs'),
  ('lidar-scotland', 'LiDAR for Scotland (Phases 1 to 6)', 'OGL-UK-3.0', 'Contains public sector information licensed under the Open Government Licence v3.0', false, 'per phase'),
  ('lidar-england', 'Environment Agency National LiDAR Programme', 'OGL-UK-3.0', '© Environment Agency copyright and/or database right', false, 'annual'),
  ('derived', 'Causewayside derived', 'ODbL-1.0', '© Causewayside, © OpenStreetMap contributors', true, 'per build'),
  ('tfl', 'TfL Unified API', 'TfL open data terms', 'Powered by TfL Open Data', false, 'live'),
  ('crowd', 'Causewayside reports', 'ODbL-1.0', '© Causewayside contributors', true, 'live');
