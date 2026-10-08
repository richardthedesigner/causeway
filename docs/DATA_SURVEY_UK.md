# UK data survey (October 2026)

Research date: 2026-10-04. Scope: the whole UK, not only the three pilot areas, so Causewayside can expand from them. This is a survey of what else we could consume or connect to. The catalogue of record stays [DATA_SOURCES.md](DATA_SOURCES.md). Items move there when we decide to use them.

**Roadmap.** What we'll do with these findings, and when, is in [ROADMAP.md](ROADMAP.md). It refers back to this survey by section number (§).

**How it was done.** Two rounds of research, with 14 research passes in all.
- **Round 1:** eight topic and city passes (street assets, transit, venues, live conditions, imagery, standards and community, Edinburgh plus Newcastle/Gateshead, London).
- **Round 2, UK-wide:** four passes:
  - every relevant keyword through the data.gov.uk catalogue (14,226 records);
  - an ArcGIS Hub sweep (about 21,000 items);
  - Wales, Northern Ireland and Scotland outside Edinburgh;
  - English city-regions and national bodies.
- **"Look again":** a pass for missed categories and a check of every headline claim against the live endpoint.

Web search ran out early, so most facts were checked by querying the endpoint itself. That makes them better verified than search summaries would be.

Codes, as in DATA_SOURCES.md:
- **V:** fetched or queried on 2026-10-04.
- **S:** seen in a catalogue, search summary or metadata only.
- **N:** not verified.

Verdicts:
- **keep:** use it.
- **trial:** a time-boxed spike first.
- **ask:** usable data, but the licence is missing or unclear, so we need written permission. This is a cheap email, not a partnership.
- **partner:** needs a data agreement that Richard leads.
- **drop:** not usable.

---

## 1. What we have today

Wired into code and data:
- OSM, through BBBike and the OSM API.
- LiDAR: SRSP Phase 5 for Edinburgh, EA 1 m composite for England.
- OSTN15.
- Overture places.
- Protomaps base map.
- BODS GTFS: buses, trams, Metro.
- Street Manager monthly permit archive.
- TfL: StopPoint, Line Route Sequence, lift disruptions v2, road and street disruptions, arrivals.
- Open-Meteo.
- Photon and postcodes.io for search top-ups.
- Our own notes and reports, in Supabase.

Everything else in DATA_SOURCES.md is catalogued but not yet used.

## 2. The short list: highest value for the least effort

| # | Source | What it unlocks | Licence | Coverage | Effort | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Scottish Road Works Register open data** (`downloads.srwr.scot/export/disruptions-daily/`) | Roadworks for all of Scotland, daily. For Edinburgh today: 344 works entirely on the footway, 535 road closures, **338 street café permits as polygons with dates** (filter on `LicenceType`, not traffic management: cafés are coded 'No Obstruction On C/W Or F/W') (the tables-and-chairs data we couldn't find), scaffolding, hoardings and events | OGL v3 | All 32 Scottish councils plus trunk roads | S | **keep** (V). **Corrects DATA_SOURCES.md:** it is open. The download pages are JavaScript shells, which is why it looked closed |
| 2 | **TfL station data** (`api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip`, `-gtfs.zip`) | Which areas each of 569 lifts connects. Platform step and gap in mm for every line, and where the level-access doors are. Manual ramps, accessible toilets (RADAR, hours), step-free interchange distances. GTFS pathways and levels | TfL open data | Tube, DLR, Elizabeth line, Overground lines, tram, cable car | M | **keep** (V). Answers open task 29 (lift-to-platform mapping) |
| 3 | **TfL lift disruptions joined to #2** | The v2 feed we already read (`/Disruptions/Lifts/v2`) carries `disruptedLiftUniqueIds`, and all 24 checked match `LiftUniqueId` in #2's `Lifts.csv`. An outage can then close exactly the lift edges #2 maps, with no free-text parsing (D-020). The undocumented v1 feed (`/Disruptions/Lifts`) has more records (30, including National Rail stations), but its area names join for only 14 of 30 | TfL | London | S | **keep** v2 join (V); v1 as a top-up only |
| 4 | **TfL StopPoint and Line disruptions** (`/StopPoint/Mode/{modes}/Disruption`, `/Line/Mode/{modes}/Status`) | Station closures, "trains not calling", planned step-free losses, line part-closures. The graph can't see any of these today | TfL | London | S | **keep** (V) |
| 5 | **City of Edinburgh Adopted Roads** (`edinburghcouncilmaps.info/arcgis/rest/services/Transport/Transport/MapServer/23`) | Edinburgh's List of Public Roads as polygons: 64,269 footways with **surface** (2,639 setts, flags, block paving) and **width**, edited 2026-10-01 | OGL v3 (on the council hub) | Edinburgh | M | **keep** (V) |
| 6 | **Street Manager activity archive** (`opendata.manage-roadworks.service.gov.uk/activity/YYYY/MM.zip`) | Non-works highway licences: skips (7,696 in Sept), scaffolding (2,997), hoardings, mobile cranes, events, each with footway flags. Same bucket we already read | OGL v3 | England | S | **keep** (V) |
| 7 | **Met Office weather warnings via Weather DataHub** | Wind, ice, snow, rain, thunder and extreme-heat warnings with polygons | Free tier (20,000 calls a day); commercial use allowed. Credit "Powered by Met Office data" | UK | S | **keep** (V) |
| 8 | **Environment Agency flood monitoring API** (England), **SEPA KiWIS river levels** (Scotland), **Natural Resources Wales flood APIs** (Wales) | Close or flag riverside paths during flood warnings or high water: Quayside, Ouseburn, Water of Leith walkway, the Thames | OGL | England, Scotland, Wales | S | **keep** (V; NRW needs a free key) |
| 9 | **Toilet Map, update** | Now exported **daily**, with `verified_at` and `updated_at` per record. 16,119 UK toilets, 6,656 accessible, 2,516 RADAR | CC BY 4.0 | UK | S | **keep** (V). Closes open task 18 |
| 10 | **Gritted footways**: Edinburgh priority-1 pavement routes; Spatial Hub national gritting "paths" layer; City of London priority pavements; Durham winter footway routes; Glasgow, Fife, Falkirk, Stirling footway gritting | When the weather adapter says ice, prefer gritted footways and say so | OGL (Edinburgh hub, Spatial Hub, City of London, Stirling); "no conditions" (Durham); not stated (Glasgow, Fife, Falkirk) | Patchy, but strongest in Scotland | S | **keep** where open (V) |
| 11 | **OS Open Greenspace access points** | Park entrances (pedestrian or vehicle), so routes end at a gate rather than a park's centre | OGL | GB | S | **keep** (V) |
| 12 | **OS Open USRN + Open Linked Identifiers** | Join key: Street Manager, SRWR, council layers and pavement licences all carry USRN. Match USRN to OSM once, then every USRN-keyed feed attaches | OGL | GB | M | **keep** (V) |
| 13 | **Sport England Active Places** | 43,744 English sports sites with disabled toilets, parking, doorways, findable entrance, Changing Places flag (1,430) | CC BY 4.0 | England | S | **keep** (V) |
| 14 | **Wales National Toilet Map** (DataMapWales WFS `geonode:national_toilet_map`) | Statutory national map, 961 toilets: accessible, RADAR, **Changing Places (50)**, hours | Not stated on the layer (assume OGL; confirm) | Wales | S | **keep** after confirming (V) |
| 15 | **Welsh Government LiDAR 2020-23** (DataMapWales tile catalogue) | 1 m DTM for all of Wales, with per-tile flight dates. Same pipeline as EA | Assumed OGL (licence field blank) | Wales | S | **keep** (V) |

## 3. The big "ask" list: high-value data that is public but unlicensed

These services answer queries from anyone, but state no licence (or "internal use"). A public endpoint is not a licence. Each needs a short email asking the owner to confirm OGL, or to publish it on their open data hub. Collectively this is the biggest prize in the survey: it would give us kerbs, widths and steps, the data OSM lacks.

| Owner | Data | Why it matters | V/S |
|---|---|---|---|
| **City of Edinburgh Council** (TransportHubAtlas MapServer; checked: no `copyrightText` and not in the council's DCAT feed, which is where its OGL statements live) | Kerb upstand in mm (39,642 kerb lines); signal crossings with dropped-kerb and tactile-paving flags and rotating cones (1,978); steps with width (398); bollards, guardrail, central islands | Closest thing to a kerb register in any pilot city. Kerb and footway records date from 1995-96, so show as "Council inventory, 1995" and weight low; crossing flags look current. Spatial Hub's OGL street-furniture record already lists these services as sources | V |
| City of Edinburgh Council (Atlas layer 104; ArcGIS Online) | Pavement widths: 222,474 transects city-wide. 2026 footway-widening programme layers (edited Aug-Sep 2026). Setted Streets April 2026 (4,305). Public toilets (96). Presentation seats (1,610; drop donor fields). City Centre Pedestrian Priority Area. School Streets (117) | Width and setts for the whole city | V |
| **Glasgow City Council** | City-centre kerbs (2,430: dropped, height and width bands, tactile). Steps (157, keyed by OS TOID: step count and height, handrail side, **alternative ramp**). Bus stops (2,855: **raised kerb, audio arrival times**, shelter). Live footway gritting. Pavement-parking assessment (27,498 street segments, exempt or not) | The richest accessibility data found anywhere in the UK. Expansion city #1 | V |
| **Metis Consultants for LB Islington, Southwark, LBHF/RBKC, Tower Hamlets** | Islington 2026 footway condition survey (5,751 sections, defects, photos), crossings with kerb transition and tactiles (2,353), bollards, benches, steps, gates. Southwark footway width bands (42,949). LBHF/RBKC narrow footways (16,163) | Consultant-hosted; the councils own it | V |
| Westminster City Council | Blue Badge bays (452: spaces, hours) | Drop-off near destinations in a pilot zone | V |
| RB Kensington and Chelsea | Tables-and-chairs licences (409 + 3,116 applications) | Pavement obstructions | V |
| Canal & River Trust | Towpath access points (7,691 England and Wales: width, gradient, steps, handrail, locked gates), surface, gradient, accessibility rating | Gates and steps on towpaths are classic scooter traps. Licence says "internal use only" | V |
| Sustrans (Walk Wheel Cycle Trust) | UK barriers: 22,157 with critical width, too narrow or acceptable. Scotland barriers audit (6,843 with ramp gradient, camber) | Gate and chicane widths on off-road paths | V |
| Bristol City Council | Walking and cycling network (21,761 segments: steps, surface, by USRN) | Licence not stated on the layer (hub default OGL) | V |
| Dundee, Fife, Renfrewshire, Leeds, Lincolnshire, TfL LTNs, University of Edinburgh | Benches (Dundee 1,525), disabled bays (Fife 6,853, Dundee 2,130, Renfrewshire 1,219), footway defects (Renfrewshire), crossings (Leeds), rights-of-way limitations (Lincolnshire), LTN filters (TfL), campus toilets, lifts and entrances (UoE) | Expansion cities and pilot gap-fill | V |
| Tower Hamlets | Waste collection time bands (233 streets) | The only open "sacks out on the pavement at these times" data found | V |

**Don't use** (licence or rule conflicts):
- **Tower Hamlets crossing audit:** every record links to Google Street View, so it may be Street View-derived (rule 1).
- **RampNet** curb-ramp model: trained on Google Street View.
- **Changing Places** data scraped by AllThePlaces (see section 9).

## 4. By theme: what's new

Rows already in the short list or the ask list aren't repeated.

### 4.1 Kerbs, crossings, widths, surface, condition

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| York footway condition survey 2016-21; York reported road and pavement incidents (live) | OGL | York | Grade, surface, damage per street; live defect reports | trial (template to show other councils) | V |
| DfI Roads (NI) controlled crossings (1,572), carriageway and footway surface defects (daily), highway network | OGL | All NI | National crossings and defects | keep for NI | V/S |
| Nottingham zebras (331), refuge islands (205), bollards (1,249), disabled parking orders (nightly) | OGL | Nottingham | Crossings and islands | keep (expansion) | V |
| TfGM traffic signal locations, typed (puffin, pelican, toucan) | OGL | Greater Manchester | Controlled crossings | keep (expansion) | V |
| Leeds and Calderdale crossings; York zebras and signals | OGL (portal) | Yorkshire | Crossings | trial | V |
| Sheffield footway hierarchy (29,564) and planned footway schemes | "No limitations… ok to share" | Sheffield | Maintenance priority; upcoming works | trial | V |
| TfL Cycling Infrastructure Database (2017-18) | TfL | London | 935 barriers, 174 steps, 2,772 raised tables, 7,581 entry treatments (likely level crossings), photos | trial: "check this" flags only, never current fact | V |
| City of London accessibility route (gradient, surface), City Walkways (highwalks), pedestrian zones, closures | Accessibility route OGL; others OS INSPIRE licence | City of London | Highwalk geometry, timed closures | keep (OGL parts); ask (INSPIRE parts) | V |
| Network Rail level crossings (about 6,000) | OGL | GB | Step-free hazards | trial | V |
| Inclusive Mobility (DfT, Dec 2021) reference values | OGL | UK | Width 2,000 mm normal / 1,000 mm absolute minimum at obstacles; crossfall max 1:40; dropped kerbs flush 0-6 mm; seats every 50 m; rest distances 50-150 m | keep as cited thresholds | V |
| Transport Scotland "Inclusive Kerbs" research | Crown copyright | Reference | 40-50 mm kerb upstand works for both blind and wheelchair users | keep as reference | V |

**Gaps between Inclusive Mobility and our presets** (`packages/profile`):
- **Rest intervals:** walking presets use 250-500 m, but IM says 50-150 m.
- **Kerb tolerance:** the manual-wheelchair preset allows a 2 cm kerb, but IM says flush is 0-6 mm.

Worth a D-013 follow-up.

### 4.2 Obstructions and permits

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| Camden: tables and chairs (4,771, daily), parking suspensions (reason field: skips, scaffolding), lamp columns, trees and vacant tree pits | OGL v3 | Camden | Pavement cafés with furniture counts and hours (drop applicant names) | keep | V |
| Leeds street café licences; Bristol pavement licences (47) | OGL | Leeds, Bristol | The only other open pavement-licence lists | trial | V |
| Edinburgh communal bins (5,777), trees (50,400) | OGL | Edinburgh | Fixed obstructions | trial | V |
| London Public Realm Trees (1.14M), Sheffield street trees | OGL | London, Sheffield | Tree-pit pinch points (weak) | trial (low) | V |
| York alley gates (locked), Leeds rights-of-way furniture (stiles, gates), Lancashire rights-of-way access points (788 gate types) and path width | OGL | Those areas | Hard barriers | keep (expansion) | V |
| Scotland pavement-parking exemptions (Glasgow, East Renfrewshire, East Dunbartonshire layers) | Not stated | Those councils | Streets where pavement parking is still legal (1.5 m must be left) | ask; ask Edinburgh for its own (TRO PDFs only today) | V |
| GBFS dockless bikes and scooters | No open feed in any pilot city (Lime London 404, Voi and Neuron 401) | — | Obstacles on pavements | partner (TfL, Edinburgh's Voi contract). FixMyStreet has "abandoned Lime/Voi/Forest bike" categories in London | V |

### 4.3 Transit and lifts

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| TfL Journey Planner with `accessibilityPreference` | TfL | London | Each leg returns `obstacles` (lift, ramp, stairs, escalator). Regression oracle for our own rail routing | trial (CI oracle) | V |
| TfL Crowding (`/crowding/{naptan}`, `/Live`) | TfL | Tube only (not DLR) | "Busy now" and quieter times; quiet/busy/very busy bands at 0.4 and 0.7 | trial | V |
| TfL taxi ranks (580) and Cabwise (`wc=true`) | TfL | London | "Never a dead end" fallback: every licensed black cab is wheelchair accessible | keep | V |
| BODS live bus locations (SIRI-VM bulk zip, no key) | OGL | England (Newcastle: about 226 vehicles; **none from Lothian**) | Live Newcastle buses. No wheelchair-space field anywhere | keep (Newcastle) | V |
| BODS disruptions (SIRI-SX bulk) | OGL | England; no North East publishers yet | Stop closures, diversions, `liftFailure` | trial; check weekly | V |
| BODS GTFS for Wales | OGL | Wales | Same pipeline as now | keep | V |
| Traveline NextBuses API | OGL-based, signed. Free to 180,000 hits per 6 months | GB | The only route found to **Edinburgh live departures** | trial (server-side, cached) | V |
| Network Rail Stations Experience API | OGL (S) | NR-managed stations (about 1,500 lifts) | **New:** publishing guidelines require set wording and notices and forbid showing escalators. **Newcastle Central is LNER-managed**, so probably not covered | trial; design UI to the guidelines | V |
| National Rail KB Incidents 5.0 | KB licence | GB | Station and line incidents every 5 minutes, alongside KB Stations; free automated RDM registration | trial | V |
| TfGM GTFS | **ODbL** (not OGL) | Greater Manchester | Treat as OSM-derived. `wheelchair_boarding` is unknown for 15,623 of 15,693 stops | keep with ODbL handling | V |
| TfGM Metrolink API `MessageBoard` | TfGM terms | Metrolink | The only possible lift-notice signal outside London | trial (free key) | V/S |
| Translink stops and TransXChange; Translink Journey Planner API; NI Railways real time | OGL / Translink terms | NI (no NaPTAN or BODS there) | NI transit | keep (when NI is in scope) | S |
| Scottish Bus Open Data Regulations | — | Scotland | Real-time data due about 18 months after commencement (about 2028); scope mentions wheelchair-space availability | watch | V |
| NaPTAN accessibility | — | GB | In private beta with data consumers; CSV still has no accessibility columns | partner: ask DfT to join the beta | V/S |
| Uber Boat piers (all step-free except Cadogan, London Bridge City, Wandsworth Riverside Quarter) | Facts only | London | Hand-curated dated facts | trial | V/S |
| Edinburgh Waverley lifts (10, with door widths) from Network Rail's page | Facts | Edinburgh | Curate into the station graph | keep | V |
| ORR lift statistics, ORR station usage, DfT Access for All list | OGL | GB | Priors for "lift unknown"; expansion priorities | trial | V/S |
| Nexus Metro RTI | No licence; now locked (401) | Tyne and Wear | — | drop; still a partner item | V |

### 4.4 Venues and facilities

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| **NHS Service Search API v3** (facilities) | NHS syndication terms (read first) | England | Per GP, pharmacy, dentist, hospital: wheelchair and step-free access, accessible toilets, hearing loop, lift, parking, with "last confirmed" date | trial. **Apply now:** v1/v2 were switched off in Feb 2026 and v3 onboarding is taking months | V/S |
| **Edinburgh Festivals Listings API** | Own licence: commercial use allowed, attribution, 24-hour refresh, delete on termination | Edinburgh (11 festivals) | Per-space wheelchair access; per-performance audio description, captions, BSL, touch tours | keep; apply for a **type C** key (Fringe data needs B or C; C needs approval testing) | V |
| OpenBenches | CC BY-SA 4.0 | UK (44,445; Edinburgh 918, London 2,283, Newcastle 28) | Rest points | keep as a separate share-alike layer (or route through OSM via OpenBenches' CC BY permission to OSM) | V |
| York seats | OGL under the OS derived-data exemption (licence text is not a clean grant; credit OS too) | York | 1,166 seats with **arms (430 yes), back (746 yes), age-friendly** fields | keep; use as the schema to ask other councils for | V |
| Sheffield benches (1,493), Spatial Hub Street Furniture (Scotland, 7 councils incl. Edinburgh and Glasgow; OGL, free key) | OGL | Sheffield; Scotland | Rest points | keep | V |
| Bristol community toilets (151) | OGL | Bristol | Door width, cubicle size, seat height, RADAR, Changing Places | keep (expansion); model dataset | V |
| Council toilets: Camden, City of London, Calderdale, Sheffield, Manchester, Highland (124), Perth and Kinross, Causeway Coast and Glens, Leeds Changing Places (open alternative with equipment detail) | OGL | Those areas | Gap-fill against the Toilet Map | trial | V |
| OpenAEDMap (defibrillators from OSM) | ODbL | UK (22,966) | Safety layer; already in our OSM stream | keep | V |
| AllThePlaces chain-level `wheelchair` flags (22 GB chains: Asda, Morrisons, Costa, banks, English Heritage) | CC0, **but see section 9** | UK | Brand-stated access hints | trial, marked "brand-stated, unverified" | V |
| FSA food hygiene API | OGL | UK | Is this café still trading? | trial (low) | V |
| Wikidata P2846 | CC0 | UK: only 498 items | Almost nothing; no step-free or hearing-loop properties exist | drop | V |
| Hand-curated: Shopmobility schemes (e.g. Newcastle Eldon Garden), Portobello beach wheelchairs, QEOP park mobility, Royal Parks Liberty Drives | Facts | Per city | Scooter and wheelchair hire | keep as a curated layer with source, date and phone | S |
| Pembrokeshire Coast mobility equipment, Peak District Miles without Stiles, Forestry England graded trails and 1,693 seats, NatureScot Trossachs barrier updates | Mostly OGL or not stated | Rural | Days out | trial (later) | V |
| Ticketmaster Discovery (arena access info), Your Local Cinema, VocalEyes/Stagetext, Sociability, Level Playing Field, Skiddle, Refill | Commercial / none | UK | Sensory and venue access | partner (low) | S |

### 4.5 Live conditions and environment

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| UKHSA heat and cold health alerts (`ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1/{heat,cold}`) | OGL | England only | Shade, rest and shorter routes on alert days | keep (pin the path in a test; it is the dashboard's own) | V |
| Open-Meteo air quality, pollen, UV, wind gusts | CC BY 4.0, non-commercial tier (as D-011) | UK | Respiratory and asthma warnings; gusts on exposed bridges for scooters and light chairs | keep (same adapter) | V |
| Surface-water flood maps: EA NaFRA2, SEPA | OGL | England, Scotland | "Likely to pond after heavy rain" | keep (static) | V |
| Strategic noise maps, Round 4 (England, Scotland, NI) | OGL | E/S/NI | A "quieter route" option for autistic and sensory users | keep (static) | V |
| Defra UK-AIR (DAQI forecast, SOS API), London Air, Breathe London, Scottish, Welsh and NI air quality | OGL / various | UK | Measured air quality | trial | V |
| openfootball fixtures | Public domain | UK | Match-day crowd windows near stadiums | keep | V |
| DfI NI street lighting faults (daily) and full NI lighting inventory (308,970) | OGL | NI | Live "lights out" for D-038 | keep for NI | V |
| Newcastle Urban Observatory | CC BY 4.0 | Newcastle | Mostly stale (brokers inactive), no pedestrian counts | drop the legacy API; email about v2 | V |
| SEPA flood warnings | No open feed | Scotland | — | partner; use river thresholds meanwhile | V |

### 4.6 Imagery, terrain and machine learning

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| **Panoramax** street-level imagery | CC BY-SA 4.0, **no commercial-use clause** (unlike Mapillary) | Edinburgh about 400 images, London about 500, Newcastle 23 | Open, non-Google photos for desk checks and our own models. We can upload our survey photos so each fact has a public photo | keep | V |
| Mapillary `on_foot` field (since June 2026) | As Mapillary | UK | Filters to imagery taken on foot, where kerbs are visible | trial | V |
| OSM kerb campaign | ODbL | GB has 154,597 `kerb` nodes but only 345 `kerb:height` | StreetComplete and MapComplete onwheels in the pilot areas: cheapest open route to kerb data | keep (as process) | V |
| EA LiDAR point clouds, vegetation object model, intensity | OGL | England (NCL 2017/21/22; LDN 2018/20) | VOM may flag overhanging hedges and trees. At about 1 point per m², **open LiDAR cannot see kerbs** | trial (VOM) | V |
| SRSP Phase 5 LAZ (4 points per m²) | OGL | Edinburgh | Cross-slope spike on wide pavements; kerbs are at the limit | trial | V |
| Scottish Land LiDAR Programme (10 points per m², releases every 6 months to 2027) | Open | Scotland | Best open chance of kerb-scale data in Edinburgh, from about 2027 | watch | V |
| OS pavement-widths method (with TfWM) | No licence on the repo; reimplement | GB (needs OS NGD) | Transects every 1 m across pavement polygons | keep as method, run under the Data Exploration Licence | V |
| StreetSurfaceVis (surface type incl. setts, from street photos) | CC BY-SA 4.0 | Trained on German images | Classify sett and surface quality from Panoramax/Mapillary | trial | V |
| OS NGD | **Premium only: no free OpenData subset** (confirmed in OS docs) | GB | Pavement links, street lights, routing hazards | trial under the Data Exploration Licence | V |
| Bluesky MetroVista (16 points per m², 5 cm), Cyclomedia, APGB (public sector only) | Commercial / public sector | All three pilots | Kerb-grade data. Route: a council commissions extraction and publishes the result under OGL | partner | S |
| Tile2Net, KartaView, Microsoft buildings, Google Open Buildings | — | — | US-only, dormant, redundant, or Google-derived (no UK coverage anyway) | drop | V |

### 4.7 Standards and integrations

| Item | Status | Use | Verdict |
|---|---|---|---|
| A11yJSON | **MIT** (confirmed) | Venue and entrance interchange format; pin a version (v31) | keep |
| OpenSidewalks schema 0.3 (Jan 2026) | **CC BY-ND 4.0**: use it, don't publish a modified copy | Reference for DATA_MODEL | keep as reference |
| accessibility.cloud terms | Registration; consent needed above 10,000 requests a day; each source keeps its own rights; free for non-profits | Venue data | trial (closes open task 10) |
| GTFS-Pathways; OpenTripPlanner 2 wheelchair settings | Open | Export our station edges as pathways for OTP2 (D-003); map our unknown penalty to OTP's `unknownCost` | trial |
| OSM Notes API | ODbL, no key | Open notes near an edge as "a mapper flagged something here (date)"; also where our "report a map error" posts to | keep |
| Osmose QA | ODbL | Footway and crossing tagging errors for mappers | trial |
| FixMyStreet | Deep link `fixmystreet.com/report/new?latitude=…&longitude=…`. Read API has no data licence | Hand off pavement faults to the council | keep (link only) |
| Relay UK (dial 18000), 999 BSL, emergencySMS (pre-register) | Public services | Emergency sheet | keep |
| Passenger Assist, Uber WAV deep link (needs a client id), Be My Eyes app link | Commercial onboarding / links | Hand-offs | trial or partner |
| what3words | Paid, proprietary | — | drop |
| Meta's organised pedestrian mapping in Scotland (since July 2026, NE Scotland) | Lands in OSM | Ask them to bring Edinburgh into scope | watch |

## 5. Expanding beyond the pilots: what each nation offers

| Need | England | Scotland | Wales | Northern Ireland |
|---|---|---|---|---|
| Terrain | EA 1 m (have) | SRSP (have); national 10 ppm from 2027 | **WG LiDAR 2020-23, 1 m** | OSNI river-basin LiDAR only (patchy) |
| Roadworks | Street Manager permits + activities (OGL) | **SRWR** (OGL, daily) | **None open**: Street Manager has no Welsh authorities | TrafficwatchNI RSS (text, no coordinates) |
| Buses and trams | BODS GTFS | BODS GTFS (Scotland) | BODS GTFS (Wales) | Translink TransXChange (OGL) |
| Stops | NaPTAN | NaPTAN | NaPTAN | Translink stop list |
| Toilets | Toilet Map + council lists | Toilet Map + Highland, P&K | **National Toilet Map** (statutory) | Toilet Map + council lists |
| Lighting | Council inventories (York, Camden, Leeds, Lancashire, Derbyshire…) | Edinburgh, Glasgow, Stirling, P&K; national layer is premium | Not found | **DfI national inventory + daily faults** |
| Winter footways | Council by council (Durham, City of London) | **Spatial Hub national paths layer** + councils | Not found | Not found |
| Flood | EA API | SEPA KiWIS (levels), no warnings feed | NRW APIs | Not found |
| Heat/cold alerts | UKHSA | Met Office warnings only | Met Office | Met Office |
| Venue access | NHS facilities, Sport England | Festivals API (Edinburgh) | Polling-station access (Democracy Club, Wales only) | — |
| Prioritising where to go next | ONS Census TS038 disability, Blue Badge statistics, ORR station usage | Scotland's census (separate) | TS038 | NI census |

**Best publishers to point other councils at:**
- York: seats with armrests, footway condition, alley gates.
- Camden: daily OGL: café licences, works, lighting, toilets.
- City of London: an accessibility route and gritting priorities.
- Bristol: community toilets with measurements.
- Glasgow: kerbs and steps (once licensed).
- Northern Ireland's DfI: national crossings, defects, lighting.

**Never published anywhere in the UK as open data:**
- dropped-kerb registers;
- tactile paving, except at Glasgow and Edinburgh signal crossings;
- scaffolding, hoarding and skip permits outside Street Manager and SRWR;
- live lift status outside London and Network Rail;
- pavement widths outside the City of London, Edinburgh, Southwark and LBHF/RBKC, and those four have no clear licence apart from the City of London;
- wheelchair-space occupancy on buses.

## 6. Corrections to DATA_SOURCES.md

Applied in this change unless marked otherwise.

1. **SRWR is open (OGL v3, daily, no key).** The "Roadworks (2026-10-04)" row saying "not open" was wrong; it is fixed.
2. **Network note:** these hosts answered on 2026-10-04:
   - `data.edinburghcouncilmaps.info`
   - `edinburghcouncilmaps.info/arcgis/rest`
   - the `data.spatialhub.scot` CKAN API

   Spatial Hub downloads and WFS need a free account and key.
3. **Edinburgh parking bays** have a bay type (1,104 disabled bays). The hub record was modified 2023-12, not 2021 (open task 25).
4. **Spatial Hub street furniture is OGL** with a free key (open task 26). The national street-lighting layer is premium.
5. **Toilet Map:** daily export, CC BY 4.0 confirmed (open task 18).
6. **Newcastle Central is LNER-managed:** the Network Rail lift API probably doesn't cover it.
7. **TfE open data is down** (522); Lothian's API refuses (403).
8. **OpenSidewalks is CC BY-ND 4.0; A11yJSON is MIT** (open task 15).
9. **accessibility.cloud terms read** (open task 10).
10. **TfL `/AccidentStats` is retired.**
11. **EA LiDAR covers England only;** Wales has its own (section 5).

## 7. Who to ask (for Richard)

Cheap emails, in order of value:

1. **City of Edinburgh Council GIS / open data:**
   - Confirm OGL for TransportHubAtlas layers 72, 101, 104, 86, 95, 57, 87 and Atlas layer 104 (pavement widths), or publish them on the hub.
   - Ask about the 2026 footway-widening layers, Setted Streets, public toilets, presentation seats and the pavement-parking exemption list.
2. **Glasgow City Council:** confirm OGL for City_Centre_Kerbs, CCTP_Steps, bus stops, gritting and the pavement-parking assessment.
3. **LB Islington and LB Southwark** (data hosted by Metis Consultants): footway condition, widths and crossings.
4. **Westminster** (Blue Badge bays) and **RBKC** (tables and chairs).
5. **Canal & River Trust:** an OGL release of towpath access points.
6. **Sustrans / Walk Wheel Cycle Trust:** reuse terms for the barriers data.
7. **NHS England:** apply for a Service Search v3 key now (ssd.nationalservicedesk@nhs.net).
8. **Edinburgh Festivals:** apply for a type C key before August 2027.
9. **Improvement Service (Spatial Hub):** register for a free key.
10. **Welsh Government:** confirm the National Toilet Map licence; ask for Active Travel Network audit data in bulk.

Bigger asks (partnerships):
- DfT (NaPTAN accessibility beta).
- TfL (dockless vehicle feeds; the bus stop accessibility audit).
- Edinburgh (Voi data).
- SEPA (a flood warnings feed).
- Nexus (Metro lifts).
- NHS 24 (Scotland service directory).
- A council willing to commission kerb and width extraction from MetroVista or Cyclomedia and publish it under OGL.

## 8. Engineering next steps (no permission needed)

In rough order of value per day of work:

1. **SRWR adapter for Edinburgh:** footway-only works, café footprints, scaffolding, hoardings and events, as `WorksObservation`s.
2. **TfL station data:** platform step and gap, lift-to-area mapping, toilets. Join v2 lift outages on `LiftUniqueId`. GTFS `pathways.txt` has no lengths, stairs or escalators, so build from the detailed CSVs (`SameLevelPaths`, `RampRoutes`, `StationPoints`).
3. **TfL StopPoint and Line disruptions** on transit edges.
4. **Street Manager activity archive** (skips, scaffolding) in the existing works build.
5. **Edinburgh Adopted Roads:** footway surface (setts) and width as a non-OSM attribute layer (D-008).
6. **Weather warnings, floods, gritted footways:** Met Office DataHub (key), EA/SEPA river and flood state, gritting routes when `ice`.
7. **OS Open Greenspace access points** and **OSM Notes** as soft signals.
8. **Presets:** re-base rest intervals and kerb tolerance on Inclusive Mobility values.

## 9. A licensing problem we already have

AllThePlaces (ATP) labels its output CC0, but some of its spiders scrape sites without an open licence:
- Changing Places (`changing_places_gb`);
- NHS inform (`nhs_scotland_gb`, which ignores robots.txt);
- nhs.uk.

ATP's waiver can't grant rights it doesn't hold.

**Checked on 2026-10-04:** our committed search indexes contain **29 Overture places named "Changing Places"** (15 Edinburgh, 10 Newcastle, 4 London). They are category public_restroom, and their only source is AllThePlaces. That breaks rule 5 ("no scraping … Changing Places").

**Fix:**
- Filter AllThePlaces-only records named "Changing Places", and similar NHS-derived records, in `scripts/overture-places.py` / `overture-merge.ts`.
- Strip them from the committed indexes.
- Note it in D-028.

OSM-mapped `changing_places=yes` toilets are fine to keep.

## 10. Looked for and not found

- **Dropped kerbs and tactile paving:**
  - an openly licensed dropped-kerb register anywhere in the UK (Leeds publishes counts only; RBKC's is public but unlicensed, see section 11);
  - tactile paving data outside Edinburgh and Glasgow signal crossings.
- **Live status:**
  - live lift status for Metrolink, Merseyrail, Supertram, West Midlands Metro, NET, Glasgow Subway, shopping centres, Barbican highwalks or Canary Wharf;
  - a Nexus lift or step-free feed.
- **Live departures and roadworks:**
  - live Lothian or Edinburgh Trams departures (Travel Tracker API registration still unpublished);
  - Welsh roadworks;
  - an NI street-works register with coordinates.
- **Crowding and obstructions:**
  - pedestrian footfall counters in the pilot cities (open ones exist only in Leeds, York, Leicester, Calderdale);
  - open GBFS for dockless vehicles in any pilot city;
  - wheelie-bin collection days.
- **Directories:** hearing loops, scooter charging points, wheelchair repair, quiet hours, Shopmobility.
- **Access data from:** VisitScotland, VisitEngland, VisitWales, Tourism NI, National Trust, English Heritage, Historic Environment Scotland.
- **Imagery and indoor maps:**
  - an open UK sub-metre aerial imagery source;
  - open 3D city models;
  - open indoor maps of UK stations.

## 11. Look again: what the first passes missed

A final pass hunted for whole categories nobody had searched. New finds, best first:

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| **OS NGD Building Access Location** | OS Premium / PSGA | GB | One point per building entrance with `access_obstruction` (none / ramp / step) and level. Step-free entrances nationally | trial; add to the OS ask | V (schema) |
| OS NGD Path Link and Pavement Link extra fields | OS Premium | GB | Elevation gain per direction, street-light coverage, surface type, minimum pavement width | trial; add to the OS ask | V (schema) |
| **Camden parking tickets, street-level, daily** | OGL v3 | Camden | Code 62 (wheels on the footway) 2,413 tickets this year; code 27 (beside a dropped kerb) 94. A direct "pavement often blocked" signal, and a pattern to ask other boroughs for | keep | V |
| **The Gazette linked-data API** | OGL | UK | Traffic orders and footpath stopping-up and diversion orders, including Wales | trial | V |
| TrafficwatchNI roadworks RSS | OGL | NI | 1,744 works (text only; geocode by road) | keep for NI | V |
| **RBKC Highways MapServer** | Not stated | Kensington and Chelsea | 4,040 dropped kerbs, crossings, raised tables, guardrails, benches, York stone pavements | ask | V |
| GLA Cool Spaces 2025, Camden heat resources | London Datastore | London | 250 heat refuges with wheelchair access, toilets, seating, water | keep | V |
| UK public GBFS (54 systems: Beryl, Dott, Bolt, Donkey) | Beryl CDLA-Permissive-2.0; others per feed | Leeds, Manchester, Bristol, West Midlands and more (none in the pilots) | Dockless vehicles on pavements; Dott parking zones | trial (expansion) | V |
| East Renfrewshire pavement-parking layer | Not stated | East Renfrewshire | Second council pattern after Glasgow | ask | V |
| police.uk street crime API | OGL | England, Wales, NI (not Scotland) | Opt-in personal-safety signal at night | no: coarse, two months late, stigmatises areas (D-084) | V |
| DfT STATS19, DfT road traffic counts | OGL | GB | Pedestrian casualty sites; traffic volume as a "hard to cross" proxy | trial | V |
| Geograph | CC BY-SA 2.0 | UK | Rural photos for desk checks where Mapillary and Panoramax are thin | trial | V |
| Tower Bridge lift times | None stated | London | Footway closes about 800 times a year | ask | V |
| Met Office climate data portal (frost days, wet days) | OGL | UK | Seasonal ice and wet risk by area | trial | V |
| ADMIRALTY tidal API | UKHO terms | British Isles | Tidal causeways and promenades | trial | S |
| Warm Spaces, Safe Places schemes | Mostly not stated | Local | Winter rest places; places to go if lost or frightened (cognitive and autism profiles). Police Scotland's Keep Safe has ended (§12) | trial / partner | V/S |
| GoodMaps, NaviLens | Commercial | UK stations (GoodMaps names Network Rail and LNER) | Indoor station maps; codes for low-vision users | partner | S |
| TfGM traffic signals, GM Local Link (demand-responsive transport) | OGL | Greater Manchester | Crossings by type; accessible fallback | keep (expansion) | V |
| Footfall counters (York hourly since 2009, Leeds, Leicester, Stirling) | OGL / not stated | Local | Quiet-time routing | trial | S |
| Wheelchair-accessible taxi lists (York, Leicester, Middlesbrough) | OGL / not stated | Local | Taxi fallback | trial | V |
| NHS PLACE disability scores, EA beach ramps and slipways, school crossing patrols, DWP Stat-Xplore | OGL | England / GB | Hospital quality; coastal access; staffed crossings; rollout planning | trial (low) | S/V |
| Robson & Ford (Newcastle University) GB pavement-width analysis | Paper CC BY 4.0, data not attached | GB | National widths | partner: ask the authors | S |
| Wayfindr / ITU-T F.921 | Standard | — | How to word audio directions for vision-impaired users | keep as reference | N |

**OSM coverage in GB** (taginfo, data to 2026-10-03). This is why so much has to come from elsewhere:

| Well tagged | Count | Barely tagged | Count |
|---|---|---|---|
| `tactile_paving` | 377,997 | `kerb:height` | 345 |
| `entrance` | 242,047 | `hearing_loop` | 32 |
| `crossing:island` | 235,136 | `door:width` | 1 |
| `kerb` | 154,597 | `changing_places` | 1 |
| `smoothness` | 142,150 | `automatic_door` | 669 |
| `wheelchair` | 128,510 | `ramp:wheelchair` | 1,465 |
| `width` | 120,538 | `highway=elevator` | 2,656 |
| `incline` | 82,153 | | |
| `step_count` | 39,143 | | |
| `traffic_signals:sound` | 18,726 | | |
| `toilets:wheelchair` | 6,503 | | |

**Corrections from this pass:**
- **Dropped kerbs are published in one London borough.** RBKC has 4,040 dropped kerbs, with no licence stated, which corrects section 10. The "London borough kerb data not found" note in DATA_SOURCES.md is out of date.
- **OSM can't stand in for Changing Places.** The `changing_places` key is used once in GB, so section 9's "OSM-mapped Changing Places are fine" holds but covers almost nothing.

**Checked and empty:**
- Welsh street works.
- Pedestrian signal timings.
- Street-level parking tickets outside Camden.
- Network Rail platform heights.
- Open indoor station maps.
- A Swing Bridge lift feed.
- Tidal crossing-time feeds.
- Hearing loops, quiet hours and Sunflower scheme locations.
- Scooter charging.
- GBFS in the pilot cities.

## 12. Night-time and safer spaces

Researched 2026-10-08 for FEAT-35. Plan and safety rules: [plans/SAFE_SPACES.md](plans/SAFE_SPACES.md), D-084. Counts are for central Edinburgh (55.93,-3.24 to 55.97,-3.15) from an OSM extract dated 2026-10-02.

| Source | Licence | Coverage | Adds | Verdict | V/S |
|---|---|---|---|---|---|
| **Edinburgh street lighting columns, imported into OSM (June 2026)** | OGL v3 via OSM, OS attribution | Edinburgh: 58,819 lamps, 11,493 in the central box | `highway=street_lamp`. 63% of untagged footways have a lamp within 30 m. A "probably lit" signal, not proof | keep (DATA-33, FEAT-36) | V |
| OSM `lit=*` | ODbL | Central Edinburgh: 52% of highway length tagged, footways 40%, main roads 95 to 98% | Already routed on (D-038) | keep | V |
| Council lighting open data: Darlington, York, Camden | OGL | Those councils only. None found for Newcastle, Gateshead or pan-London | Lamp columns | ask Newcastle; keep where open (DATA-33) | V |
| OS NGD Street Light | Premium | GB | Lamps from aerial images; misses lights under trees | add to the OS ask | S |
| VIIRS, NASA Black Marble night lights | Unverified | World, about 500 m | Area brightness | no: too coarse | S |
| BODS GTFS night services | OGL | Lothian N1 to N44 (15 routes), Edinburgh Trams; Go North East 861N, 876N, 877N, N21 | Night buses in data we already load | keep (FEAT-38). Check after-midnight trips survive the build | V |
| OSM help points: `amenity=police`, `amenity=taxi`, pharmacies with `opening_hours` | ODbL | Central Edinburgh: 5 police, 31 taxi ranks, 42 pharmacies (36 with hours) | "Open now" help points | keep (DATA-34) | V |
| OSM toilets: `unisex=yes`, `changing_table=*` | ODbL | Central Edinburgh: 8 unisex, 12 with changing tables (59 toilets) | Toilet filters for everyone. `toilets:gender_neutral` is unused | keep (DATA-34, FEAT-37) | V |
| OSM `lgbtq=*`, `lgbtq:*` | ODbL | 4,022 worldwide; 9 in central Edinburgh | Venues that say they are LGBTQ+ primary or welcoming | keep, labelled as volunteer-mapped (FEAT-39) | V |
| Scottish LGBTI+ Rainbow Mark (Equality Network) | Not stated | Scotland | Signatory venues and organisations | partner (FEAT-40, DATA-35) | S |
| UK SAYS NO MORE Safe Spaces (Hestia) | Not stated | UK, over 5,000: Boots, Morrisons, Superdrug, Well pharmacies, TSB | Domestic abuse safe spaces | partner (FEAT-40, DATA-35) | V |
| Ask for Angela (CIC) | All rights reserved | UK | Pledged venues | partner (DATA-35) | V |
| Best Bar None Scotland (Retailers Against Crime CIC) | Not stated | Edinburgh city-wide; 46 venues in 2019 | Accredited venues | ask (DATA-35) | S |
| Safe Places National Network (CIC) | Not stated | Mainly England | Places for people who feel lost or scared | partner | S |
| Women's Night Safety Charter, London LGBTQ+ Venues Charter (GLA) | Not stated | London | Pledges, not on-site help | later, if at all | S |
| Street Assist, Street Pastors, SafeZone (Edinburgh); Safe Haven van, Street Pastors (Newcastle) | None published | Weekend nights | Welfare points with hours | partner, hand-curated | S |
| Strut Safe | n/a | UK phone line | Link with hours | link | V |
| Keep Safe (Police Scotland, I Am Me) | | Scotland | Was over 900 venues | **ended**: do not use | V |
| Ask for ANI | | UK pharmacies | | **ended 4 Nov 2024** | V |
| Purple Flag (ATCM) | No public list | Whole town centres | An area award | low value | S |
| SIMD, police.uk crime | OGL | | Deprivation, crime | **no** (D-084) | V |
| Queering the Map; Grindr and similar | None / terms forbid | | | **no**: exposes people | S |

