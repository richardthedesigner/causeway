# Causewayside data sources

Research date: 2026-10-04. Pilot cities: Edinburgh, Newcastle/Gateshead, London.

Scope: every external dataset or API we might use for wheelchair-passable routing, venue access and live disruption. Each source gets a verdict:

- **keep**: use in the pilot.
- **trial**: worth a time-boxed spike before committing.
- **drop**: not usable (licence, coverage or cost).
- **partnership-only (needs Richard)**: no open route; needs a data agreement that Richard leads.

## Verification key

| Code | Meaning |
|---|---|
| **V** | Verified in this session on 2026-10-04: the terms page or endpoint was fetched or queried directly. URL given. |
| **S** | Seen only via search-result summaries on 2026-10-04 (secondary). Treat as provisional until someone reads the primary page. |
| **N** | Not verified this session. Values are "unknown, to verify" unless stated otherwise. |

Network notes for this container: `overpass-api.de`, `download.geofabrik.de`, `api.mapillary.com`, `photon.komoot.io`, `www.street-manager.service.gov.uk`, `datex2.traffic.scotland.org`, `data.edinburghcouncilmaps.info` and `data.edinburghopendata.info` did not respond (proxy). `tfl.gov.uk` terms pages, `wheelmap.org`, `data.bus-data.dft.gov.uk`, `nexus.org.uk` and `data.spatialhub.scot` returned 403. A failed fetch here says nothing about whether the service works. Update 2026-10-04: `data.edinburghcouncilmaps.info`, `edinburghcouncilmaps.info/arcgis/rest` and the `data.spatialhub.scot` CKAN API now answer; Spatial Hub downloads need a free account and key.

A UK-wide survey of further sources (October 2026), with corrections to this file, is in [DATA_SURVEY_UK.md](DATA_SURVEY_UK.md).

---

## Licensing rules

1. **No Google or Apple Maps data.** No tiles, geocodes, Places data, Street View imagery or derived measurements from either. The only permitted use is an external deep link (for example "Open in Google Maps") that hands the user off. This also rules out datasets whose features were *derived* from Google Street View unless the licence and provenance have been checked: see Project Sidewalk below, whose labels are CC0 but are made by people viewing Street View panoramas.
2. **ODbL share-alike by design.** OpenStreetMap (OSM) and every OSM-derived source (Overture base, buildings, transportation and divisions; Wheelmap; Geofabrik; Photon and Nominatim results) are ODbL.
   - Keep OSM-derived layers in a **separable derivative database**. If we publish it or use it publicly, we must be able to offer it, or a diff from OSM, under ODbL.
   - Map tiles, route geometries and turn-by-turn instructions shown to users are **produced works**. They need attribution ("© OpenStreetMap contributors" with a link to openstreetmap.org/copyright) but no share-alike on the output. Verified: OSMF Attribution Guidelines say routing apps "must credit OpenStreetMap" and generated instructions need no attached attribution provided they are not a derivative database (V, https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
   - Non-OSM layers (council data, LiDAR slopes, our own surveys, partner venue data) stay out of the share-alike scope only if we follow the **Collective Database Guideline** (endorsed by the OSMF board on 2016-06-17). For a given feature type and property within a region, the data must be all OSM or all non-OSM. There must be no cross-references between the two sets, and no merging or de-duplication of OSM with third-party features. Merging triggers derivative-database status (V, https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline).
   - Design consequence: store `source` per attribute rather than per feature. Compute derived values (incline from LiDAR, width from OS) in a separate table keyed by our own segment IDs, not written back into OSM-derived rows. Joins happen at query or render time.
   - Partner data that a partner will not allow under ODbL must never be merged into the OSM-derived network table.
3. **Every access fact shows source and date.** Each kerb height, width, incline, lift status, toilet or venue fact displayed or used in routing carries `source_id`, `source_licence`, `observed_at` (or `valid_from`) and `ingested_at`. The UI shows "Source, date" next to the fact. Stale facts degrade confidence rather than silently persisting.
4. **Attribution register.** Keep a machine-readable list of required attribution strings (OSM, OS, Royal Mail, ONS, TfL, Copernicus, Scottish Government/Fugro LiDAR, Open-Meteo, Foursquare NOTICE). Render it on an "About the data" screen and in API docs.
5. **No scraping** of sites without an open licence or written permission (Euan's Guide, AccessAble, Changing Places, Wheelmap web UI, council HTML pages where a dataset is not offered).

---

## 1. Base network and places

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **OpenStreetMap** (planet, API 0.6) | Pedestrian graph and accessibility tags: `footway=sidewalk`, `sidewalk:*`, `kerb`, `kerb:height`, `incline`, `surface`, `smoothness`, `width`, `wheelchair`, `tactile_paving`, `highway=steps`, `step_count`, `ramp*`, `handrail`, `level`, `amenity=bench`, `toilets:wheelchair` | ODbL 1.0 | "© OpenStreetMap contributors", link to /copyright | Yes, on derivative databases | Planet and diffs free. Editing API not for bulk reads. Tile server policy: identifiable User-Agent, honour cache headers or cache 7 days, no prefetch (V, https://operations.osmfoundation.org/policies/tiles/) | Minutely diffs. state.txt seq 7314612 at 2026-10-04T13:22:58Z (V, https://planet.openstreetmap.org/replication/minute/state.txt) | Yes / Yes / Yes. Tag depth varies: see sample below | V | **keep** (core) |
| **Geofabrik extracts** (GB, Scotland, England; `.osm.pbf`) | Regional extracts so we do not process the planet | ODbL (OSM data) | As OSM | Yes | Free download. Updates for public extracts unknown, to verify. Internal server (with user metadata) requires OSM login | Daily extracts (unknown, to verify) | Yes / Yes / Yes | N (host blocked here) | **keep** (bootstrap); use OSM minutely diffs for freshness |
| **BBBike city extracts** (`download.bbbike.org/osm/bbbike/Edinburgh`) | Weekly OSM extract for greater Edinburgh (-3.58,55.70 to -2.77,56.10) as `.osm.pbf`, about 43 MB | ODbL (OSM data) | As OSM | Yes | Free, no key. Reachable from the build container when Geofabrik and Overpass were not | Weekly (the 2026-10-04 download held data to 2026-10-02T23:00Z) | Yes / Newcastle extract to verify / London extract to verify | V (downloaded 2026-10-04) | **keep** for Phase 1 builds until the worker can use Geofabrik and minutely diffs |
| **Overture Maps**: transportation, base, buildings, divisions | OSM-derived plus TomTom transportation segments, including footway sidewalk/crosswalk subclasses | ODbL ("© OpenStreetMap contributors") | Required | Yes | Free GeoParquet on S3/Azure, no key. Latest release `2026-09-23.1` (V, S3 listing) | Monthly | Yes / Yes / Yes | V (https://docs.overturemaps.org/attribution/) | **trial** for cross-checks only. Adds little over OSM for footways and carries the same ODbL obligation |
| **Overture Maps**: places | POIs with categories | Mixed per record: CDLA Permissive 2.0 (most), **Apache 2.0** (Foursquare-sourced, since 2025-09-24), **CC0 1.0** (AllThePlaces) | Per source; record carries `sources` | No | As above | Monthly | Yes / Yes / Yes | V (attribution page); S (2025-09-24 release notes) | **keep** for POI search seeding. Store per-record licence |
| **Overture Maps**: addresses | Address points | Varies by country (permissive) | Per source | Varies | As above | Monthly | GB coverage unknown, to verify | V (licence summary) | **trial** |
| **Foursquare Open Source Places** (FSQ OS Places) | ~100M+ global POIs | **Apache 2.0**, unchanged | Include NOTICE.txt with flat files. For API distribution, show NOTICE content prominently in developer docs | No | **Changed Oct 2025:** no longer anonymous S3. Releases from October 2025 onwards only via Places Portal (free account, token), Snowflake Marketplace or Hugging Face (approval) | Unknown, to verify | Yes / Yes / Yes | V (https://foursquare.com/resources/blog/data/evolving-fsq-open-source-places/) | **trial** (via Overture places is simpler) |
| **OS Open Roads** | Road centrelines with names, classes | OGL v3 (OS OpenData) | "Contains OS data © Crown copyright and database right [year]" | No | Free download | 6-monthly | Yes / Yes / Yes | S | **keep** as road-name and classification fallback |
| **OS Open Names** | Gazetteer: places, roads, postcodes | OGL v3 | As above | No | Free download | Quarterly (Jan, Apr, Jul, Oct) | Yes / Yes / Yes | S | **keep** for search |
| **OS Open Zoomstack** | Basemap vector tiles | OGL v3 | As above | No | Free | Biannual | Yes / Yes / Yes | S | **trial** as non-OSM basemap option |
| **OS MasterMap Topography / OS NGD** (incl. NGD Transport: Pavement Link, pavement polygons, Road Link pavement attributes) | Pavement presence per side of road, **min and average pavement width**, pavement polygons | OS premium licence (not open). Free via OS Data Hub Premium allowance up to a monthly £ threshold (S: £1,000/month quoted on OS pages) | OS copyright statement | No, but **redistribution of derived data is restricted** by OS terms (to verify) | OS Data Hub API: 50 tx/min dev, 600 tx/min live, per API per project (V, https://docs.os.uk/os-apis/core-concepts/rate-limiting-policy) | NGD updated continuously, delivered via OS Select+Build (to verify cadence) | GB-wide (coverage of pavement widths outside urban areas unknown, to verify) | V for feature model (https://docs.os.uk/osngd/using-os-ngd-data/os-ngd-transport/pavements) and rate limits; S for pricing | **trial** (highest-value width source in GB; licence terms decide) |
| **OS Data Hub plans** (OpenData, Premium, Public Sector/PSGA, Energy and Infrastructure) | Access route for all OS data | Per plan | Per plan | n/a | Premium free allowance (S). PSGA covers public-sector members only; we may reach PSGA data only via council contracts (to verify) | n/a | n/a | S | Richard to confirm plan and whether a start-up deal applies (Geovation accelerator offers OS and HMLR data plus up to £20k equity-free, S) |
| **Photon** (komoot) | Typo-tolerant geocoder/autocomplete over OSM | Code Apache 2.0 (to verify). Data ODbL | OSM attribution | Results are OSM-derived | Public instance has fair-use terms (to verify). Self-host recommended | Self-host: as fresh as our import | Yes / Yes / Yes | N (host blocked here) | **keep** (self-hosted) |
| **Pelias** | Modular geocoder (OSM, OpenAddresses, Who's On First) | Code MIT (to verify). Data per source | Per source | OSM parts ODbL | Self-host only | Self-host | Yes / Yes / Yes | N | **drop** for pilot (Photon is simpler) |
| **Nominatim** (osm.org instance) | Geocoding, reverse geocoding | Data ODbL | Must display attribution | Yes | **Max 1 req/s**, **no autocomplete**, no bulk or grid reverse queries, periodic app requests count as bulk (V, https://operations.osmfoundation.org/policies/nominatim/) | Minutely | Yes / Yes / Yes | V | **drop** the public instance for production. Self-host only if Photon falls short |
| **ONS Postcode Directory (ONSPD)** | Postcode to coordinates and admin codes | OGL v3, with OS and Royal Mail statements | All three: "Contains OS data © Crown copyright and database right [year]"; "Contains Royal Mail data © Royal Mail copyright and database right [year]"; "Source: Office for National Statistics licensed under the Open Government Licence v.3.0". **BT (Northern Ireland) postcodes need a separate commercial LPS licence** | No | Free download | Quarterly (to verify) | Yes / Yes / Yes | V (https://www.ons.gov.uk/methodology/geography/licences) | **keep** (exclude BT postcodes) |
| **postcodes.io** | Hosted postcode API over ONSPD/OS data | Service MIT (to verify). Data as ONSPD | As ONSPD | No | Free, no key. Rate limits unknown, to verify. Self-hostable | Follows ONSPD | `EH1 1YZ` and `NE1 8ST` resolved (V, https://api.postcodes.io/postcodes/NE18ST) | V (endpoint) / N (terms) | **keep** (self-host for production) |

### Notes

- **OSM tag depth sample, 2026-10-04**, from `api.openstreetmap.org/api/0.6/map` on small central bboxes. The bbox call also returns ways that cross the edge, so treat these as indicative only.

  | Area (bbox) | Pedestrian ways | `footway=sidewalk` | surface | smoothness | width | incline | Roads with `sidewalk:*` | kerb nodes | `kerb:height` | tactile_paving nodes | steps with `step_count` |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | Edinburgh Old Town (-3.196,55.948,-3.183,55.9525) | 818 | 15 | 448 | 89 | 26 | 166 | 61/159 | 43 | 0 | 90 | 101/205 |
  | Newcastle Grey St (-1.620,54.968,-1.608,54.974) | 349 | 18 | 174 | 4 | 2 | 36 | 108/283 | 20 | 0 | 95 | 12/56 |
  | London Charing Cross (-0.130,51.508,-0.118,51.513) | 1184 | 372 | 661 | 96 | 1 | 96 | 207/251 | 240 | 0 | 218 | 52/107 |

  Takeaways:
  - Separately mapped sidewalks are common in central London and rare in Edinburgh and Newcastle.
  - `width` and `kerb:height` are almost absent everywhere, so widths must come from OS NGD, council data or our own survey.
  - Edinburgh's Old Town has good `incline`, `step_count` and `handrail` tagging (steps and closes).
- **Overture places licence mix** contradicts any assumption of a single licence. Store `license` per POI and surface the Foursquare NOTICE where FSQ-sourced POIs appear.
- **FSQ OS Places**: the brief's "Apache 2.0" is correct. What changed is access: from October 2025 new releases need registration. Licence and commercial use are unchanged.
- **OS NGD Pavement Link is explicitly "not a routable network"**. Pavement Links are discontinuous and derived from Road Link plus pavement polygons with a buffer (V, https://docs.os.uk/osngd/using-os-ngd-data/os-ngd-transport/pavements/pavement-link-feature-type). Use them as attributes conflated onto our OSM-based graph, held as a non-OSM property layer under the collective-database rule. Whether OS terms let us show derived widths to the public and keep them after a licence ends is the key question for Richard and OS.

---

## 2. Terrain

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Scottish Remote Sensing Portal (SRSP) LiDAR Phase 5** | 50 cm DTM/DSM, 4 ppm LAZ. Captured 2020-2021 by Fugro for SPEN | OGL v3 | DTM: "Crown copyright Scottish Government and Fugro (2021)". DSM: "...Fugro (2020)". LAS: "Crown copyright Scottish Government, SEPA and Fugro (2021)" | No | Public S3, no key: `srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-5/` | Static (one-off capture) | **Edinburgh: full NT27 (NE, NW, SE, SW) plus NT24-NT29 quadrants at 50 cm.** LAZ tiles `NT2570`-`NT2578` cover the Old Town / no / no | V (bucket listing; https://ckan.publishing.service.gov.uk/dataset/lidar-for-scotland-phase-5-dtm via search: S for attribution text) | **keep**: primary Edinburgh terrain |
| **SRSP LiDAR Phase 3** | 50 cm DTM, 4 ppm LAZ. Captured 2015-2016 by Fugro for SPEN | OGL | "Crown copyright Scottish Government, SEPA and Fugro (2020)" | No | Same bucket | Static | Edinburgh: `NT27SE_50CM_DTM_PHASE3.tif` (43.6 MB, last modified 2021-09-08) plus NT20-NT26 quadrants. The Phase 5 NT27SE file is 434 MB, so Phase 3 likely covers only part of the tile (to verify) / no / no | V (bucket; https://spatialdata.gov.scot/geonetwork/srv/api/records/f07fa5bd-493e-46bf-ba12-4a6615e445ab) | **keep** as fallback and change check |
| **SRSP LiDAR Phases 1, 2, 4, 6** | Phase 1 and 2: **1 m** DTM, 2 ppm LAZ. Phase 4 and 6: 50 cm DTM, 4 ppm LAZ | OGL | Phase 6: "Crown copyright Scottish Government and Fugro (2020)" (S). Others to verify | No | Same bucket | Static | Phase 1: NT20-NT26, NT29 (1 m). Phase 2: NT28, NT29 (1 m). Phase 4: NT20-NT22, NT28, NT29 quadrants. **Phase 6: no NT2x tiles** / no / no | V (bucket) | **keep** as gap-fill only |
| **SRSP Scotland National LiDAR Programme** | 50 cm DTM/DSM, **10 ppm** LAZ | OGL (to verify exact statement) | To verify | No | Same bucket, `national-lidar-programme/` | Rolling (to verify schedule) | **No Edinburgh tiles yet**: a 2026-10-04 listing shows one NT tile (`NT5099`). Coverage is concentrated in NX, NS and NW / no / no | V (bucket) | **trial**: recheck quarterly for Edinburgh coverage |
| **SRSP HES LiDAR** (`lidar/hes/`, 2010-2017 surveys) | Heritage-focused 50 cm DSM tiles | To verify | To verify | To verify | Same bucket | Static | Edinburgh coverage unknown, to verify | V (bucket exists) / N (terms) | **drop** unless it fills an Edinburgh gap |
| **Environment Agency National LIDAR Programme / LIDAR Composite DTM 1 m** | 1 m DTM/DSM for England, 5 km GeoTIFF tiles | OGL | Environment Agency copyright statement (to verify exact wording) | No | Free via Defra Data Services Platform (`environment.data.gov.uk/survey` responded 200) | Phase 1 surveys Jan 2017 to Feb 2023 for all England (302 blocks). Repeat surveys since. Composite produced 2022. A merged EA/NRW DTM/DSM was updated 2026-08-14 (S) | no / **Yes** / **Yes** | S | **keep**: primary Newcastle/Gateshead and London terrain |
| **OS Terrain 50** | 50 m DTM and contours | OGL (OS OpenData) | OS statement | No | Free download | Annual (July) | Yes / Yes / Yes | S | **drop** for routing (too coarse for kerbs and gradients). Keep only as a sanity check |
| **Copernicus DEM GLO-30** | 30 m global DSM | Copernicus DEM licence: free worldwide except Armenia and Azerbaijan | "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" plus liability disclaimer | No | Free | Static (2024_1 version listed) | Yes / Yes / Yes | S (https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf) | **drop** (DSM at 30 m is useless for pavements) |

### Notes

- **Edinburgh central answer:** Old Town grid reference is roughly NT257735, so it sits in tile NT27SE. Use **Phase 5 `NT27SE_50CM_DTM_PHASE5.tif`** (2020-2021 capture, full tile) as primary, with Phase 3 for the same tile as an older comparison. Download LAZ `NT2573` and neighbours (4 ppm) if we want to rebuild ground classification around closes and steps.
- A DTM gives longitudinal gradient along a centreline. It does not give cross-slope at the kerb, and it smooths steps. Validate against `incline` tags and field checks on 10 to 20 known Edinburgh streets (Cockburn St, Victoria St, Warriston's Close, the Mound) before trusting computed gradients.
- 50 cm DTM in dense closes may interpolate under buildings. Mask with building footprints.

---

## 3. Kerbs, surfaces, widths and obstructions

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Mapillary imagery** | Street-level photos for desk verification of kerbs, steps, widths | **CC BY-SA 4.0** (some datasets may carry other licences such as CC BY-NC-SA) | Required | **Yes (CC BY-SA)** | API needs a token. Limits: entity 60,000/min/app, search 10,000/min/app, tiles 50,000/day (V, https://www.mapillary.com/developer/api-documentation) | Continuous, contributor-driven | Coverage density unknown for all three cities, to verify | V | **trial** for mapper verification workflow |
| **Mapillary map features** (triangulated points) | 42 point classes. Relevant: `object--bench`, `construction--flat--crosswalk-plain`, `marking--discrete--crosswalk-zebra`, `object--manhole`, `object--trash-can`, `object--street-light`, `construction--barrier--temporary`, `object--traffic-cone`, `object--traffic-light--pedestrians` | Terms: "If you integrate data that Mapillary extracts ... you must attribute the source." No separate data licence named (to verify) | Required | Unclear (to verify) | As above | Continuous | As above | V (https://www.mapillary.com/developer/api-documentation/points, https://www.mapillary.com/terms) | **trial** (benches, temporary barriers) |
| **Mapillary detections** (per-image segmentation) | Includes `construction--flat--curb-cut`, `construction--flat--sidewalk`, `construction--flat--pedestrian-area`, `object--pothole` | As above | As above | As above | As above | As above | As above | V (https://www.mapillary.com/developer/api-documentation/detections) | **trial** for dropped-kerb candidate generation, human-confirmed |
| **City of Edinburgh Council open data** | Parking Bays (TRO-backed polygons, monthly). Street furniture layer (bollards, benches, bins, bus shelters, barriers) via Spatial Hub | OGL v3. Attribution "Copyright City of Edinburgh Council, contains Ordnance Survey data © Crown copyright" | As stated | No | Portal `data.edinburghcouncilmaps.info` (unreachable here). Spatial Hub may need login (to verify) | Parking bays: monthly (data.gov.uk record last updated 2021-02-03, so recency is questionable) | Yes / n/a / n/a | V (https://www.data.gov.uk/dataset/parking-bays-city-of-edinburgh); S (street furniture) | **trial**. Dropped kerbs, footway condition, tables-and-chairs permits, scaffolding/hoarding permits, communal bins and Blue Badge bays as separate open datasets: **not found, unknown, to verify**. Likely needs a data request (Richard) |
| **Newcastle City Council** | 45 datasets on data.gov.uk (OGL), e.g. cycle parking, licensed premises, planning layers. No pavement, kerb or footway dataset found | OGL v3 | OGL statement | No | data.gov.uk / planning.data.gov.uk | Varies | n/a / Yes / n/a | S | **trial** (licensed premises for pavement-cafe proxy). Kerb and footway data: **partnership-only (needs Richard)** |
| **Gateshead Council** | 51 datasets, mostly OGL (one Brownfield Register under CC BY). Planning layers. No kerb or footway data found | OGL v3 / CC BY | As licence | No | data.gov.uk | Varies | n/a / Yes / n/a | S | **partnership-only (needs Richard)** for highway asset data |
| **City of London: Pavement Widths** | Estimated footway width lines on a uniform grid, derived from pavement polygons or kerb-to-building-line | OGL v3 | OGL, City of London. Derived from OS base mapping, so check whether an OS statement is also needed | No | WMS/WFS (INSPIRE) | Last updated 2026-03-02 | n/a / n/a / City of London only | V (https://www.data.gov.uk/dataset/c37cd9b4-a2f9-4431-907c-99f55ce66453/pavement-widths) | **keep** for the Square Mile |
| **London Datastore and boroughs** | Borough-level footway, kerb and permit data not found in this pass | Varies | Varies | Varies | Varies | Varies | n/a / n/a / partial | N | **trial**: targeted search per pilot borough (Westminster, Camden, Southwark) |
| **UCL Bartlett/CASA London pavement widths (2020)** | Street-space analysis of all Greater London streets (only 36% of pavements at least 3 m wide) built on OS data | Not found; probably bound by OS licence, to verify | Unknown | Unknown | Unknown | One-off (2020) | n/a / n/a / Greater London | S (https://www.ucl.ac.uk/news/2020/may/most-london-pavements-are-not-wide-enough-social-distancing) | **partnership-only (needs Richard)** |
| **Esri UK pavement width map (2020)** | Free pavement width layer released for social distancing, OS-derived | Unknown, to verify | Unknown | Unknown | Unknown | One-off | GB? to verify | S | **drop** (stale, unclear licence) |
| **Project Sidewalk** (UW Makeability Lab) | Crowd labels: curb ramps, missing ramps, obstacles, surface problems, no sidewalk | **CC0 1.0** (S) | None required | No | Per-city APIs, e.g. `sidewalk-sea.cs.washington.edu/v3/api/cities` | Ongoing per city | **No UK deployment.** The 59 cities listed on 2026-10-04 cover USA, Mexico, Netherlands, Switzerland, Taiwan, NZ, Ecuador, Canada, India, Chile, Brazil and France (Bayonne) | V (cities API) / S (licence) | **drop** as a data source. Labels are made on Street View-type imagery (each record has `pano_source`), which conflicts with rule 1 unless the source is non-Google. Useful as a **labelling schema and UX reference**, and as a possible partner for a UK deployment on Mapillary imagery (Richard) |
| **OpenSidewalks (OSW) schema, TCAT / UW; TDEI tools** | OSM-compatible pedestrian network schema and tooling (Tasking Manager, TDEI exchange) | Schema: open (exact licence to verify) | To verify | n/a | GitHub, OSM wiki | Active (USDOT ITS4US-funded) | Schema is global. Data is US-centric | S (https://wiki.openstreetmap.org/wiki/OpenSidewalks) | **keep** as internal pedestrian-network schema reference. Aligns with OSM tagging |
| **Academic datasets with ground truth** | Liu et al., ASSETS 2024, "Towards Fine-Grained Sidewalk Accessibility Assessment with Deep Learning: Initial Benchmarks and an Open Dataset". SideSeeing (arXiv 2407.06464), chest-mounted video plus sensors. Navability routes (AU) with slope, surface and cross-slope effort levels | Per dataset, to verify | Per dataset | Per dataset | Downloads | Static | Not UK | S | **trial** for model and threshold benchmarking only. No UK ground truth found |

### Notes

- **Mapillary terms contain a commercial-use clause.** "You may use the Mapillary Services only for the following commercial purposes: (i) improvement, training, and development of products ... and (ii) in the provision of services for ... clients" (V, https://www.mapillary.com/terms).
  - Causewayside is a consumer service. Whether showing Mapillary-derived features to end users fits within (i) or (ii) needs a legal read before production use.
  - Contributing Mapillary-assisted edits to OSM is explicitly permitted. The cleanest route is: Mapillary as a mapper aid, facts land in OSM, we consume OSM.
- **There is no Mapillary "kerb" map feature.** Kerbs only appear as `curb-cut` in per-image detections, not as triangulated point features. Do not plan on a ready-made dropped-kerb layer.
- **No open dropped-kerb registers** were found for Edinburgh, Newcastle, Gateshead or London boroughs. Multiple 2025-2026 FOI requests to UK councils asking for exactly this exist (for example Moray, Pembrokeshire), which suggests councils do not publish it routinely. Plan for a council data-sharing route plus our own survey capture.

---

## 4. Live closures and roadworks

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **DfT Street Manager** (roadworks service API) | Every English street works permit and highway authority works: location, dates, status, traffic management | OGL (S) | OGL statement | No | Free. **Registration required** (name, organisation, contact, endpoint to receive data). Push-style event notifications (permit events). Rate limits unknown, to verify | Near real time (event-driven) | no / **Yes** / **Yes** | S (https://findtransportdata.dft.gov.uk/dataset/roadworks-service-api-street-manager) | **keep** (England) |
| **TfL Road Disruptions** (`/Road/all/Disruption`) | Works, planned events, incidents on London roads. 109 records on 2026-10-04. Categories: Works, Planned events, Network delays, Asset issues, Emergency service incidents, Other | TfL transport data terms, based on OGL v2 with TfL amendments | "Powered by TfL Open Data". OS statement ("Contains OS data © Crown copyright and database rights 2016") and Geomni UK Map data statement | No | No key needed. 500 req/min with app_key (S) | Live | n/a / n/a / **Yes** | V (endpoint); S (terms, page 403 here) | **keep** |
| **Scottish Road Works Register (SRWR) open data** | **Open.** Daily CSV (zipped) full export and a "Disruptions export" summarising disruptive road works, events and permissions | **OGL v3** | OGL statement | No | No key. `downloads.srwr.scot/export/daily`, `downloads.srwr.scot/disruptions-export/` (responded 200). Specification downloadable. No API | **Daily, overnight** | **Yes** (all Scottish roads authorities, including City of Edinburgh) / no / no | V (https://roadworks.scot/publications/scottish-road-works-register-open-data and endpoint) | **keep** (Edinburgh primary closures feed) |
| **Traffic Scotland DATEX II** | Unplanned events, roadworks, future roadworks, VMS, journey times (mostly trunk roads) | Terms issued on approval (unknown, to verify) | To verify | To verify | **Approved subscribers only**: email `Datex2@trafficscotland.org`, then a company-headed letter with IP addresses, then assessment | Live | Trunk roads around Edinburgh / no / no | S (https://www.traffic.gov.scot/traffic-scotland-developer-hub) | **partnership-only (needs Richard)**, low priority: trunk roads matter little for pavements |
| **City of Edinburgh roadworks reports and TROs** | Weekly lists of planned roadworks, closures and diversions (PDF and Excel) from the council travel team. TRO notices | Not stated (to verify) | To verify | To verify | Council website downloads (www.edinburgh.gov.uk/edintravel) | Weekly | Yes / no / no | S | **trial** (manual ingest of the Excel). SRWR is the machine route |
| **DfT D-TRO service** (Digital Traffic Regulation Orders) | Central API of TROs in a standard data model (v4.0.0 user guide published). Mandatory for English traffic authorities under secondary legislation following the Automated Vehicles Act 2024 s.93 | Open data intended (licence to verify) | To verify | To verify | API (registration to verify) | As authorities publish | **England only** (no / Yes / Yes). Mandate timing to verify | S (https://www.gov.uk/guidance/digital-traffic-regulation-orders-d-tro-service) | **trial**: watch for TTROs covering pedestrian closures |
| **one.network** | Aggregated roadworks, events and closures from 600+ authorities | **Commercial licence** | Per contract | n/a | Paid. Contact `info@one.network` | Live | Yes / Yes / Yes (to verify Scotland) | S (https://findtransportdata.dft.gov.uk/dataset/planned-road-disruptions-feed-1785b06f327) | **drop** for pilot (open sources cover all three cities) |
| **Event closures** (Edinburgh Festival Fringe/International, Hogmanay, Great North Run) | Temporary closures, barriers, crowd routes | Mostly TTRO notices and organiser PDFs | Varies | Varies | Some appear in SRWR (events and permissions) and Street Manager or TfL (planned events). No dedicated machine-readable feed found | Per event | Yes / Yes / Yes | N | **trial**: manual curation layer per event with source and date. Ask councils for barrier plans (Richard) |

### Notes

- **Contradiction with the brief:** Scottish roadworks are **openly available** (OGL v3, daily CSV, no key) via the Scottish Road Works Commissioner. Only the Traffic Scotland DATEX II feed is gated.
- Roadworks feeds describe carriageway works. Footway-only closures and pedestrian diversions are inconsistently recorded. Treat them as "possible obstruction near here" signals, not reliable footway closures, until validated against field observations.

---

## 5. Transit and lifts

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **TfL Unified API: lift disruptions** (`/Disruptions/Lifts/v2/`) | **Responds 200, no key.** JSON array with `stationUniqueId`, `disruptedLiftUniqueIds`, `message` (free text). 18 entries on 2026-10-04 (e.g. Wembley Park lift 5, Elephant & Castle Northern line lifts) | TfL terms (OGL v2-based) | "Powered by TfL Open Data" plus OS/Geomni statements | No | No key. 500 req/min with app_key (S) | Live | n/a / n/a / **Yes** | V (endpoint) | **keep** |
| **TfL Unified API: StopPoint** | Stations, entrances, facilities (`additionalProperties`, e.g. Facility: Lifts, Escalators, Toilets for `940GZZLUKSX`). Step-free details need hub IDs and the separate step-free/station data downloads (to verify) | TfL terms | As above | No | As above | Daily-ish (to verify) | n/a / n/a / **Yes** | V (endpoint) | **keep** |
| **National Rail Knowledgebase (KB) Stations** | Every GB station: step-free descriptions, staffed help hours, accessible ticket machines, ramps. JSON v5.0 (enhanced accessibility) and XML v4.0 | RDG "open" licence via a Data Sharing Agreement. OSM community (Dec 2025) flagged possibly problematic attribution terms, unresolved | To verify against the full DSA | To verify | Free, **registration on the Rail Data Marketplace (RDM)** | At least every 24 h | Yes / Yes / Yes | S (https://www.nationalrail.co.uk/developers/knowledgebase-data-feeds; https://community.openstreetmap.org/t/can-i-use-rail-delivery-group-open-station-data/139640) | **keep** (read the DSA first) |
| **Darwin** (real-time trains) and **Darwin Lifts API** | Train running. A Darwin Lifts API exists in RDG's estate | Darwin: free on RDM sign-up (S). Lifts API terms unknown, to verify | To verify | To verify | RDM registration | Live | Yes / Yes / Yes | S | **trial** (Darwin Lifts once terms are known) |
| **Network Rail Stations Experience API** (lift and escalator status) | Live lift/escalator status at Network Rail-managed stations (Edinburgh Waverley, Newcastle, London termini). The old CrossTech "Lift and Escalator API" was **decommissioned 2024-01-31** | To verify | To verify | To verify | Request access by email to `APIIntegrationServicesC4E@networkrail.co.uk` for `s-nr-sfdc-liftsandescalator` and `e-nr-stations` (S, openraildata wiki). Whether it is now on RDM is to verify | Live | Waverley / Newcastle Central / managed London termini | S | **trial** (high value for Waverley's lifts) |
| **RDG lift data modernisation** | RDG directly awarded "Nexus Alpha Lift Data" (£2,555,941 incl. VAT, 2026-03-02 to 2029-03-01) to automate lift status ingestion from the Darwin Lifts API. Lift status is currently reported manually by station staff | n/a | n/a | n/a | n/a | n/a | GB rail | S (https://www.find-tender.service.gov.uk/Notice/013392-2026, 403 here) | Watch item. Note: **"Nexus Alpha Limited" is a supplier, not Nexus the Tyne and Wear PTE** |
| **Nexus Tyne and Wear Metro lift status** | Lift renewals published as news. **No public lift-status API or feed found** | n/a | n/a | n/a | nexus.org.uk returned 403 here | n/a | n/a / Metro (Monument, Central, Haymarket, Gateshead etc.) / n/a | S (no feed found) | **partnership-only (needs Richard)** |
| **Bus Open Data Service (BODS)** | Timetables (TransXChange), fares, live locations (SIRI-VM) for England | OGL (to verify on BODS) | To verify | No | Free API key (to verify limits). Host returned 403 here | Live / per publication | no / **Yes** / **Yes** (TfL buses via TfL) | N | **trial** (transit legs, not core) |
| **NaPTAN** | Stops, stations and access nodes. Edinburgh (ATCO area 620): 2,856 records on 2026-10-04 | OGL | OGL statement | No | Free API, no key (`naptan.api.dft.gov.uk/v1/access-nodes`) | Continuous | Yes / Yes / Yes | V (endpoint) | **keep** for stop locations. **No accessibility attributes in the CSV export today.** A DfT programme to add stop accessibility (kerb height for ramp deployment, shelter, hard standing) is under way (S, tender 038238-2025) |
| **Traveline National Dataset (TNDS) / Traveline Scotland** | Scottish and GB bus, tram and ferry timetables (TransXChange 2.1) | OGL (S) | OGL statement | No | Download (registration to verify) | Weekly (to verify) | **Yes** / Yes / Yes | S | **trial**. Scotland's own bus open data rules were consulted on in 2025 (transport.gov.scot); status to verify |
| **Edinburgh Travel Tracker API** (City of Edinburgh Council) | Real-time departures behind 322 on-street displays (Lothian, trams, other operators), with planned diversions and disruptions | Not stated (to verify) | To verify | To verify | "API open to developers" (launched Sept 2024). Registration route to verify | Live | **Yes** / no / no | S (https://futurescot.com/edinburgh-city-council-unveils-digital-on-street-bus-tracking-system-with-api-open-to-developers/) | **trial** |
| **Lothian Buses / Edinburgh Trams** own open data | Dedicated GTFS or API not found this session | Unknown, to verify | n/a | n/a | n/a | n/a | Yes / n/a / n/a | N | Use TNDS and the Travel Tracker API instead |
| **Indoor maps for major stations** | Network Rail and Hack Partners ran early engagement on an intra-station routing API. No open indoor dataset found. OSM indoor tagging exists for some stations | Unknown | n/a | n/a | n/a | n/a | Waverley / Newcastle / termini | S | **partnership-only (needs Richard)** with Network Rail. Meanwhile map key step-free paths in OSM ourselves |
| **Shopping centre lift status APIs** | None found | n/a | n/a | n/a | n/a | n/a | n/a | N | **partnership-only (needs Richard)** per centre (St James Quarter, Eldon Square, Metrocentre) |

### Notes

- TfL lift disruption `message` is free text. Parse the station, then attach the whole message to the station node. Do not try to infer which platforms are affected without the lift-to-platform mapping (step-free data, to verify).
- On the **Nexus lift data** assumption: the only live lift-data initiative found is RDG's national-rail programme with a supplier called Nexus Alpha. It is not a Tyne and Wear Metro feed.

---

## 6. Weather

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Met Office Weather DataHub: Site-specific (Global Spot)** | Hourly, 3-hourly and daily point forecasts: rain, ice, wind | Met Office DataHub terms (licence type unknown, to verify) | To verify | To verify | **Free: 360 calls/day.** Paid from 900 calls/day (£8/month) to 72,000/day (£420/month) (S). Atmospheric (gridded) free tier 1 GB/month, daily cap 130,000 calls (V, https://datahub.metoffice.gov.uk/pricing/atmospheric) | Hourly | Yes / Yes / Yes | V (atmospheric pricing); S (site-specific) | **keep** (cache per city grid, well under 360/day) |
| **Open-Meteo** | Forecast API | Data **CC BY 4.0** | Attribution to Open-Meteo | No | **Free tier is non-commercial only**: under 10,000 calls/day, 5,000/hour, 600/minute. Ads, subscriptions or commercial products need a paid plan (V, https://open-meteo.com/en/terms) | Hourly | Yes / Yes / Yes (endpoint responded 200) | V | **trial** (non-commercial pilot only; switch or pay before any commercial launch) |
| **Sunrise and daylight** | Sunrise, sunset, civil twilight for lighting-aware routing | n/a: compute locally (NOAA solar algorithm or an open library such as SunCalc; library licence to verify) | n/a | n/a | No API needed | n/a | Yes / Yes / Yes | N | **keep** (compute) |

---

## 7. Venue and facility access

| Source | What it gives us | Licence | Attribution | Share-alike | Access / limits | Refresh | EDI / NCL-GHD / LDN | Verif. | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **Changing Places toilet map** (Muscular Dystrophy UK) | 2,492 Changing Places toilets on the map (date of count to verify) | **No open licence or API found** | n/a | n/a | Website map only. Contact `changingplaces@musculardystrophyuk.org` | Ongoing | Yes / Yes / Yes | S | **partnership-only (needs Richard)**. Do not scrape. Some councils publish their own CP lists under OGL (e.g. Leeds) |
| **Great British Public Toilet Map** (Public Convenience Ltd, with Neontribe) | ~10,000+ UK public and publicly accessible toilets with accessibility and opening hours | **CC BY 4.0** | Clear credit, and state changes | No | Dataset download at `toiletmap.org.uk/dataset` (site responded 200). Last updated 2026-02-19 (S) | Periodic (to verify) | Yes / Yes / Yes | S (https://www.toiletmap.org.uk/dataset) | **keep** |
| **AccessAble** | 70,000+ Detailed Access Guides (surveyed measurements and photos, UK and Ireland). Funded by 350+ partners, often councils, NHS and universities | Commercial. **No public API found** | Per contract | n/a | Partnership | Per partner contract | Edinburgh and Newcastle partner coverage to verify / London partial | S | **partnership-only (needs Richard)**. Deep-link to guides as a minimum |
| **Wheelmap.org** (Sozialhelden e.V.) | Place accessibility using OSM tags `wheelchair=yes/limited/no`, `toilets:wheelchair`, `wheelchair:description` | Data in OSM: **ODbL** | OSM attribution | Yes | Wheelmap API with api_key (S). We can read the same tags from OSM directly | Live (OSM) | Yes / Yes / Yes | S | **drop** the Wheelmap API: use OSM directly. Link to Wheelmap for user edits |
| **accessibility.cloud** (Sozialhelden) | Aggregator of 90+ accessibility data sources, A11yJSON format | Per-source licences. Sozialhelden says datasets are published under ODbL (S). API terms in `/app/docs/terms-for-signup.md`, unread | To verify | To verify | Token required (to verify). Host returned 503 here | Varies | UK coverage unknown, to verify | S | **trial**: adopt **A11yJSON** as our venue-fact interchange format. Data use after reading terms |
| **Euan's Guide** | ~3,000+ disabled-reviewer venue reviews, Edinburgh-based charity | Not open. **Do not scrape** | n/a | n/a | No public API found | Ongoing | Strong Edinburgh / some / some | S | **partnership-only (needs Richard).** Richard leads. **Conflict of interest: Richard holds a board role at Euan's Guide. Declare it in writing before any data or commercial discussion**, and have someone without the conflict sign off terms on the Causewayside side |
| **VisitEngland / VisitBritain accessibility vocabulary** (Accessibility Guides scheme) | Controlled vocabulary for venue access statements (to verify current scheme and terms) | To verify | To verify | To verify | To verify | n/a | England (VisitScotland has its own access guide work) | N | **trial** as vocabulary input alongside A11yJSON and OSM tags |
| **Benches and rest points** | OSM `amenity=bench` (52 / 51 / 54 benches in the three sample bboxes). Mapillary `object--bench` map features. Edinburgh street furniture layer (benches and seats) via Spatial Hub | ODbL / Mapillary terms / OGL (to verify for Spatial Hub) | Per source | OSM: yes | As above | As above | Yes / Yes / Yes | V (OSM count); S (others) | **keep** OSM. **trial** Edinburgh furniture layer for gap-fill |

---

## 8. Newer and adjacent sources (2024-2026)

| Source | Relevance | Status / licence | Verif. | Verdict |
|---|---|---|---|---|
| **OS NGD Transport pavements** (Pavement Link, pavement polygons, Road Link pavement presence and width attributes) | First national per-side pavement presence and min/avg width | Premium OS. See section 1 | V (feature docs) | **trial** |
| **SRWR open data** (new open data source introduced by the Scottish Road Works Commissioner) | Scotland-wide works and disruptions, daily | OGL v3 | V | **keep** |
| **D-TRO service** (DfT) | Machine-readable English TROs including TTROs | Open intent. Secondary legislation timing to verify | S | **trial** |
| **FSQ OS Places access change** (Oct 2025) | Registration now required for new releases | Apache 2.0 unchanged | V | see section 1 |
| **Overture places adds Apache 2.0 and CC0 sources** (2025-09-24 onwards) | Per-record licences | Mixed | V/S | see section 1 |
| **Edinburgh Travel Tracker API** (Sept 2024) | Live departures and diversions | Terms to verify | S | **trial** |
| **NaPTAN accessibility attributes programme** (DfT, 2025 tender) | Bus stop kerb height, shelter, hard standing | Will be OGL if added to NaPTAN (to verify) | S | Watch, high value |
| **RDG Darwin Lifts automation** (contract 2026-03 to 2029-03) | National rail lift status quality should improve | Terms to verify | S | Watch |
| **EA/NRW merged LiDAR DTM/DSM** (updated 2026-08-14) | Newer England coverage | OGL (to verify) | S | **keep** (check whether it supersedes the 2022 composite in our tiles) |
| **Scottish National LiDAR Programme** (10 ppm) | Future denser Edinburgh terrain | OGL | V (bucket) | Recheck quarterly |
| **Geospatial Commission Data Exploration Licence** | Free exploratory access to OS, HMLR, BGS, Coal Authority and UKHO data in one place | Exploration only, not production | S | **trial** for evaluating OS NGD pavements before committing |
| **Transport for All** | Disabled-led transport campaigning (pavement parking, step-free access). No dataset found | n/a | N | Partnership for user research and validation (Richard) |
| **Moray / Pembrokeshire FOIs 2025-2026 on dropped kerbs** | Shows councils hold registers but do not publish them | FOI responses are not a licence to reuse | S | Use as an evidence base for council data requests |

---

## Coverage summary by city

| Need | Edinburgh | Newcastle / Gateshead | London |
|---|---|---|---|
| Pedestrian graph | OSM (few separate sidewalks, good steps, incline and handrail tagging in the Old Town) | OSM (few separate sidewalks, `sidewalk:*` on ~38% of sampled roads) | OSM (many separate sidewalks, `sidewalk:*` on ~82% of sampled roads) |
| Pavement width | OS NGD (premium, trial). No council open data found | OS NGD (premium, trial) | City of London Pavement Widths (OGL, Square Mile only), plus OS NGD |
| Kerbs / dropped kerbs | OSM (sparse, no `kerb:height`). Mapillary curb-cut detections (trial). Council register: request | Same. Council register: request | OSM (better), Mapillary trial, borough registers: request |
| Terrain | **SRSP Phase 5 50 cm DTM** (NT27 complete), Phase 3 fallback | **EA 1 m DTM** | **EA 1 m DTM** |
| Roadworks / closures | **SRWR open data (OGL, daily)**, council weekly Excel, events manual | **Street Manager**, D-TRO (future), events manual (Great North Run) | **Street Manager**, **TfL Road Disruptions**, D-TRO (future) |
| Rail lifts | Network Rail Stations Experience API (Waverley, trial), KB Stations | Network Rail API (Newcastle Central, trial), KB Stations | **TfL lift disruptions (live, no key)**, Network Rail API for termini |
| Metro / tram / bus | TNDS, Travel Tracker API (trial) | Nexus Metro lifts: **no feed**, partnership. BODS | TfL Unified API, BODS |
| Toilets | GB Toilet Map (CC BY), OSM, Changing Places (partnership) | Same | Same |
| Venue access | OSM `wheelchair`, Euan's Guide (partnership, COI), AccessAble (partnership) | OSM, AccessAble (partnership) | OSM, AccessAble (partnership) |
| Weather | Met Office Global Spot (free 360/day) | Same | Same |
| Geocoding | Photon (self-host), OS Open Names, ONSPD / postcodes.io | Same | Same |

---

## Open verification tasks

Licence and terms (read the primary page and record URL and date in this file):

1. TfL Transport Data Service terms: current OGL basis, exact OS/Geomni attribution year strings, call limits. Page returned 403 from this container.
2. OS Data Hub Premium free allowance (amount, conditions). Whether OS NGD-derived pavement widths may be shown publicly, cached and retained after the licence ends. Start-up or Geovation terms.
3. Mapillary: whether the "commercial purposes" clause allows a consumer app. Licence of map features and detections data (beyond attribution).
4. RDG Knowledgebase Data Sharing Agreement: attribution and downstream terms (OSM community flagged concerns, Dec 2025).
5. Darwin Lifts API and Network Rail Stations Experience API: licence, access route (email or RDM), rate limits.
6. Street Manager: rate limits, archive downloads, whether footway-only works are flagged.
7. D-TRO: commencement date of the mandate, licence, API access.
8. BODS and TNDS: exact licence and attribution, key limits, update cadence. Status of Scottish bus open data after the 2025 consultation.
9. Met Office DataHub: licence type for site-specific data and attribution text. Confirm 360/day free from the primary pricing page.
10. accessibility.cloud: API terms (`terms-for-signup.md`), token, commercial conditions, UK coverage.
11. Copernicus GLO-30: read the full licence PDF (not needed if we drop it).
12. Photon (public instance fair use, licence), Pelias licence, postcodes.io limits, Geofabrik update cadence. These hosts were blocked or unverified here.
13. ONSPD release cadence.
14. Overture addresses: GB coverage and per-source licences.
15. OpenSidewalks schema licence.
16. Project Sidewalk licence page (CC0 seen only in search summary). Whether any city uses non-Google imagery.
17. Edinburgh Travel Tracker API: registration route and licence.
18. Great British Public Toilet Map: confirm CC BY 4.0 and the update cadence on the dataset page.
19. VisitEngland/VisitBritain accessibility guide vocabulary: current scheme and reuse terms.
20. SRSP: attribution statements for Phases 1, 2, 4 and the National LiDAR Programme. HES LiDAR terms.
21. EA LiDAR: exact attribution wording. Whether the 2026-08-14 merged DTM supersedes the composite for our tiles.
22. Copy of SRWR CSV specification into the repo; confirm whether footway works are distinguishable.

Coverage and data checks:

23. Phase 3 vs Phase 5 NT27SE: compare extents (43.6 MB vs 434 MB suggests partial Phase 3 coverage).
24. Mapillary image density and recency in all three pilot areas (API blocked here).
25. Edinburgh: existence of open datasets for dropped kerbs, footway condition, tables-and-chairs permits, scaffolding and hoarding permits, communal bins, Blue Badge bays. Whether the parking bay layer has a bay-type attribute. Recency (data.gov.uk record says 2021-02-03).
26. Spatial Hub (Improvement Service): access conditions and licence for the Edinburgh street furniture layer.
27. Newcastle and Gateshead: highway asset data (kerbs, footway widths, permits) via officer contact. Newcastle Urban Observatory sensors (terms to verify).
28. London pilot boroughs: footway, kerb and pavement licence datasets.
29. TfL step-free data: lift-to-platform mapping and hub-level StopPoint accessibility properties.
30. Event closures: obtain barrier and closure plans for Edinburgh Festival, Hogmanay and the Great North Run, with reuse permission.
31. UCL Bartlett/CASA pavement width data: availability and licence.
32. Changing Places count date and whether MDUK will license the data.

Partnership items for Richard:

33. Euan's Guide (declare board conflict of interest first).
34. AccessAble.
35. Changing Places / Muscular Dystrophy UK.
36. Nexus (Metro lift status).
37. Network Rail (lift status, indoor routing).
38. City of Edinburgh, Newcastle and Gateshead councils (kerb registers, permits, footway surveys; PSGA-derived data via a council contract).
39. Traffic Scotland DATEX II (low priority).
40. Project Sidewalk team (possible UK deployment on Mapillary imagery).
41. Transport for All (user validation).

## Phase 3 additions (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Environment Agency LiDAR composite DTM 1 m, WCS** (`environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs`, coverage `13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m`) | Gradient for Newcastle, Gateshead and London. Requested as 500 m GeoTIFF chunks (`subset=E(...)&subset=N(...)`, EPSG:27700) | OGL v3; "© Environment Agency copyright and/or database right" | V (GetCapabilities and GetCoverage, 2026-10-04) | **keep**. Per-pixel survey dates are not exposed; the composite's year is used as the observation date. |
| **TfL Line Route Sequence** (`/Line/{id}/Route/Sequence/all`) | Station order for the Jubilee line and DLR. Recorded in `data/transit/london/` | TfL open data terms, "Powered by TfL Open Data" | V (2026-10-04) | **keep** |
| **TfL StopPoint** (`/StopPoint/{ids}`) | Station positions, hubs and `Accessibility` properties (`AccessViaLift`, `LimitedCapacityLift`, interchange notes). Batch requests return the hub record for interchange stations, whose children carry the accessibility. Some Underground platforms in hubs (Canning Town Jubilee) have none | As above | V (2026-10-04) | **keep**. `AccessViaLift = No` is not "has steps". |
| **TfL lift disruptions v2** | Live lift outages, placed on platforms by line name in the message | As above | V (2026-10-04): 18 outages including Canary Wharf (Jubilee) | **keep**. Integrated (D-020). |
| **Gateshead Millennium Bridge tilt times** | Closures of the tilting bridge | Unknown | Not found as open data | **partnership-only** (request to Gateshead Council) |

## Base map (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Protomaps daily planet build** (`build.protomaps.com/20261004.pmtiles`) | Vector base map cut per city (`data/basemap/*.pmtiles`) | Data ODbL (OpenStreetMap); schema and styles BSD-3 | V (range-read extracts, 2026-10-04) | **keep** (D-024) |
| **Protomaps basemaps-assets fonts** (Noto Sans) | Map labels, bundled as `data/basemap/fonts/glyphs.json` | OFL | V (2026-10-04) | **keep** |

## Search (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **OpenStreetMap** (BBBike Edinburgh PBF; OSM API tiles elsewhere) | Bundled search index: places, access tags, addresses, postcodes (`data/places/`) | ODbL | V (2026-10-04): Edinburgh 9,944 places (1,264 with a wheelchair tag), 50,746 addresses, 2,011 postcodes | **keep** (D-025) |
| **Photon** (`photon.komoot.io/api`) | Live name search when the bundled index has fewer than 5 matches. Bounded to the city | OSM data, ODbL; public instance has a fair-use limit, so self-host before launch | Reachable from the container, 2026-10-04 | **keep**; self-host for scale |
| **postcodes.io** (`api.postcodes.io/postcodes/{pc}`) | Full postcodes missing from OSM | OGL v3 (ONS Postcode Directory, contains Royal Mail and OS data) | Not reachable from the container; documented API | **keep**; self-hostable |

## User notes (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Causewayside user notes** (`notes`) | People's own experience of a place or a stretch of footway: good, mixed or bad, a few words, a date, optionally a photo and a coarse mobility label. Shown with date and attribution; soft signal in routing | Our own content, **not ODbL**. Kept as a separate layer keyed by OSM way id and our place refs, never written into the graph (D-008, D-026) | n/a (on the device only, D-022) | **keep** |

## Roadworks (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Street Manager open data** (`opendata.manage-roadworks.service.gov.uk/permit/YYYY/MM.zip`) | Footway closures and works for English areas: `close_footway_ref` (`no`, `yes_provide_alternative_route`, `yes_provide_pedestrian_walkway`), `works_location_type`, BNG geometry, dates | OGL v3 | V (2026-09 archive, 1 GB, 2026-10-04): Newcastle 56 works on pavements, 43 closing them | **keep** (D-026). Monthly archive in the build now; live SNS notifications for production |
| **Street Manager activity archive** (`opendata.manage-roadworks.service.gov.uk/activity/YYYY/MM.zip`) | Skips, scaffolding, hoardings, cranes, events and other non-works licences, with `activity_location_type` (Footway, Footpath, Carriageway), BNG point, dates. No footway-closure flag | OGL v3 | V (2026-09 archive, 12 MB, 2026-10-04): 9 on pavements in Newcastle, 5 in London. Since 2026-10-05 the build reads six months; the June 2026 archive is published truncated and is skipped | **keep** (DATA-05). On the pavement, counted as unknown |
| **TfL road disruptions** (`/Road/all/Street/Disruption`) | Live London top-up, kept only when the description mentions the pavement | TfL open data terms | V (300 segments, 2026-10-04) | **keep** |
| **Scottish Road Works Register** (SRWR, roadworks.scot) | Edinburgh and all of Scotland: works, closures, footway-only works (`TrafficManagement = Works Entirely On The Footway`), street café permits as polygons, scaffolding, hoardings, events. Daily disruptions export at `downloads.srwr.scot/export/disruptions-daily/` (redirects to a zip with `CurrentActivities.csv`, BNG WKT geometry, USRN) | OGL v3 | V (2026-10-04): City of Edinburgh 2,344 current activities, 344 entirely on the footway, 338 street cafés. The download pages are JavaScript shells, which is why an earlier check found nothing | **keep**: corrected 2026-10-04, see [DATA_SURVEY_UK.md](DATA_SURVEY_UK.md) |

## Overture places (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Overture Maps places**, release 2026-09-23.1 (`overturemaps-us-west-2.s3.amazonaws.com/release/.../theme=places/`) | Venues OSM hasn't mapped, added to search only (`scripts/overture-places.py`, `scripts/overture-merge.ts`). Read over HTTPS with DuckDB; row-group bounding boxes keep it to seconds per city | CDLA Permissive 2.0; some records also Apache 2.0 (Foursquare) or CC0 (AllThePlaces). Credit "Overture Maps Foundation" | V (2026-10-04): Edinburgh 7,966 added, Newcastle 2,378, London zones 1,298 | **keep**. Confidence 0.7 and over, open places only, no home or business-to-business services. Never a source of access facts: they carry none |

## Buses (2026-10-04)

| Source | Use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **Bus Open Data Service GTFS** (`data.bus-data.dft.gov.uk/timetable/download/gtfs-file/<region>/`: scotland 204 MB, north_east 40 MB, london 301 MB) | Stops, ride times, departures per hour (`data/transit/<area>/bus.json`) | OGL v3 | V (2026-10-04, no key needed): Edinburgh 842 stops and 189 route directions (Lothian, Lothian Country, Stagecoach...), Newcastle 159 and 186, London zones 40 and 58 | **keep** (D-029) |
| **TfL StopPoint arrivals** (`/StopPoint/{id}/Arrivals`) | Live London departures (next step) | TfL open data terms | Reachable, 2026-10-04 | **keep** |

| **Bus Open Data Service GTFS: trams and Metro** (same files) | Edinburgh Trams (route type 0: 9 stops in the area), Tyne and Wear Metro (route type 1: 6 stations, Green and Yellow lines) | OGL v3 | V (2026-10-04) | **keep** (D-031). Nexus lift status: not open, so Metro stations below street level count as unknown for step-free users |

## Council footways and TfL station data (2026-10-04)

| Source | What we use | Licence | Verified | Verdict |
|---|---|---|---|---|
| **City of Edinburgh Council, Adopted Roads** (`edinburghcouncilmaps.info/arcgis/rest/services/Transport/Transport/MapServer/23`) | Footway polygons with `surface` (setts, flags, asphalt and so on) and `width`, matched to our pavement edges. A separate layer, `data/council/edinburgh-central.footways.json`, joined at load and never written into the ODbL graph (D-008). Fills only what OSM doesn't know | OGL v3. Credit: "City of Edinburgh Council, Open Government Licence v3.0" | V (25,127 footway polygons in the central box, 2026-10-04): widths on 8,707 pavement edges (was 1,731) | **keep** (DATA-06) |
| **TfL station data** (`api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip`) | Each station's areas and the level paths, ramps and lifts between them; platform-to-train step and gap; toilets (24 stations, 65 toilets, in search since DATA-23). Fields: `Stations.csv` (OutsideStationUniqueId), `Platforms.csv` (FriendlyName, PlatformNumber, HasStepFreeRouteInformation), `PlatformServices.csv` (Line, DirectionTowards, MinStep, MaxStep, MinGap, MaxGap, DesignatedLevelAccessPoint, LocationOfLevelAccess, LevelAccessByManualRamp), `SameLevelPaths.csv`, `RampRoutes.csv`, `Lifts.csv`, `Toilets.csv`, `FeedInfo.csv`. The step and gap per platform are held to each person's limits (D-059); blanks are unknown, never level | TfL open data | V (feed of 2026-08-03; all 72 of our stations; 141 of 158 platform rows on our lines have figures, the 17 without are at stations with no step-free route, or Bond Street southbound, which has a staff ramp) | **keep** (DATA-03, DATA-23, DATA-29) |
| **TfL line status and station disruptions** (`/Line/{ids}/Status?detail=true`, `/StopPoint/Mode/{modes}/Disruption`) | Line closures by affected station; station closures and losses of step-free access | TfL open data | V (2026-10-04, recorded as test fixtures) | **keep** (DATA-04) |
| **Scottish Road Works Register, disruptions export** (`downloads.srwr.scot/export/disruptions-daily/`, redirects to a dated zip holding `CurrentActivities.csv`) | Edinburgh's works on the pavement: footway works, road closures that mention the footway, street café footprints, scaffolding, hoardings, cabins and events (`pnpm build:srwr`, `data/live/edinburgh-central.works.json`). Shown in our own words and the street only; the register's free text and promoter are never shown | OGL v3 | V (export of 2026-10-05, reached from the cloud container: 999 rows in the area, 456 entries kept) | **keep**, in use (DATA-02, [D-057](DECISIONS.md#d-057-edinburghs-works-from-the-scottish-road-works-register)). Weekly in the data refresh |
| **Edinburgh pavement gritting routes, priority 1** (council ArcGIS `Transport/Transport/MapServer/3`) | Pavement edges on a gritting route, preferred in ice | OGL v3 (council hub) | V (55 km in the central box, 1,130 edges, 2026-10-04) | **keep** (DATA-07, D-047) |
| **Environment Agency flood monitoring** (`environment.data.gov.uk/flood-monitoring`: `/id/floodAreas`, `/id/floods`) | Flood areas over our paths (build), warnings in force (live, CORS) | OGL v3 | V (Newcastle 4 areas, London 9, 2026-10-04) | **keep** (DATA-07, D-047) |
| **OS Open Greenspace** (OS Downloads API, per 100 km square, shapefile) | Named parks and their pedestrian access points | OGL v3. "Contains OS data © Crown copyright and database right" | V (NT, NZ, TQ, March 2026 release) | **keep** (DATA-08, D-048) |
| **OpenStreetMap notes** (`api.openstreetmap.org/api/0.6/notes.json`, open, by bbox) | Notes about the ground near a route, shown only | ODbL | V (Edinburgh 314 open, 28 kept; London 108, 23) | **keep** (DATA-08, D-048). Fetched at build time only |
| **Great British Public Toilet Map** daily export (`toiletmap.org.uk/dataset`, JSON) | Accessible, RADAR, fee, baby changing, weekly hours, verified date, per toilet | CC BY 4.0 (Public Convenience Ltd), credit in the app | V (export of 2026-10-04: 16,119 UK toilets; Edinburgh 62, Newcastle 22, London 73) | **keep** (DATA-09, D-049) |

