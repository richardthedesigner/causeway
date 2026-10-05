# Where next after the pilot cities (RES-09)

Research date: 2026-10-05. Roadmap row: RES-09. Scores are in [where-next-scores.csv](where-next-scores.csv).

## Answer

**Glasgow first, then Leeds.** Glasgow agrees with DEF-09. Wales does not: Cardiff and Swansea score last of the 14, so the second expansion should be an English city, with Leeds the best fit today. Wales should wait until there is a reason to go (see "Does this agree with DEF-09?").

| Pick | Why, in one line |
|---|---|
| 1. Glasgow | The most disabled residents of any Scottish city (about 161,000, 26%), the richest council accessibility data in the UK, and most of our Edinburgh code already fits. Held back only by a licence (DATA-13). |
| 2. Leeds | About 136,000 disabled residents, open crossings, rights-of-way and café-licence data, 27 million station journeys, and the England stack we built for Newcastle. |
| 3. Sheffield | About 110,000 disabled residents at a high 19.7% share, open footway hierarchy, benches and toilets, and no licence problem. |

Bristol, Manchester and Birmingham sit within one point of Sheffield. Treat places 3 to 6 as a tie. Glasgow and Leeds are not close calls.

## Scoring method

Fourteen candidates: Glasgow, Leeds, Sheffield, Bristol, Manchester, Birmingham, Nottingham, Liverpool, Dundee, Aberdeen, Leicester, Brighton and Hove, Cardiff, Swansea. Each is one local authority, which is a rough fit for "the city" (Manchester's authority is the city proper, not Greater Manchester).

Six scores, each turned into 0 to 5, then weighted to 100.

| Measure | Weight | How it is scored |
|---|---|---|
| Reach | 25 | Residents whose day-to-day activities are limited a lot or a little (Census). Square root of the count against the largest candidate, so size helps but does not swamp everything. |
| Need | 10 | The city's disabled share divided by its own nation's share (England and Wales 17.5%, Scotland 24.1%). Index 0.6 scores 0, 1.4 scores 5. Done inside each nation because the two censuses ask different questions. |
| Transit | 10 | Station entries and exits (ORR, 2024-25) at the main stations. Square root against the busiest. A proxy for how many journeys a step-free route could help. |
| Open data | 20 | Judgement, 0 to 5, from what the [data survey](../DATA_SURVEY_UK.md) found for the area: kerbs, steps, crossings, widths, toilets, lighting. 0 is nothing found. |
| Licence | 15 | Judgement, 0 to 5. Every English and Scottish city starts at 3 because the national feeds are open (Environment Agency LiDAR, Street Manager, BODS, NaPTAN, SRWR). Plus 1 where the local data is clearly open. Minus 1 where the best local data has no licence (Glasgow) or comes with ODbL strings. |
| Code reuse | 20 | Judgement, 0 to 5. English cities 4 (the Newcastle stack). Scottish cities 5 (SRWR, SEPA, Edinburgh builders and Scottish terrain are already in `packages/live` and `scripts`). Welsh cities 2 (new terrain source, no open roadworks, a different flood API). |

The three judgement scores are mine, not measured. They are in the CSV so you can change them. Where the survey found nothing for a city, the data score is low because we have not looked, not because the data does not exist (Birmingham and Liverpool especially).

**Sensitivity.** Rank on benefit alone (reach, need, transit) and Birmingham, Glasgow and Liverpool lead. Rank on feasibility alone (data, licence, reuse) and Glasgow, Bristol and Dundee lead. Glasgow is the only city in the top three of both. Leeds is fourth on each.

## Results

| Rank | City | Score | People limited by disability | Share | Blue Badges held | Station entries and exits (m) | Data | Licence | Reuse |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Glasgow | 83.8 | 161,382 | 26.0% | not by council | 40.2 | 5 | 2 | 5 |
| 2 | Leeds | 72.7 | 135,681 | 16.7% | 41,000 | 27.3 | 3 | 4 | 4 |
| 3 | Sheffield | 69.9 | 109,869 | 19.7% | 29,000 | 10.3 | 3 | 4 | 4 |
| 4 | Bristol | 69.6 | 81,159 | 17.2% | 22,000 | 10.9 | 4 | 4 | 4 |
| 5 | Manchester | 69.0 | 96,737 | 17.5% | 22,000 | 42.2 | 3 | 3 | 4 |
| 6 | Birmingham | 68.9 | 198,064 | 17.3% | 54,000 | 46.9 | 1 | 3 | 4 |
| 7 | Nottingham | 63.7 | 60,218 | 18.6% | 12,000 | 8.1 | 3 | 4 | 4 |
| 8 | Liverpool | 63.2 | 105,962 | 21.8% | 22,000 | 29.3 | 1 | 3 | 4 |
| 9 | Dundee | 57.3 | 33,158 | 22.4% | not by council | 1.8 | 3 | 3 | 5 |
| 10 | Aberdeen | 53.7 | 43,950 | 19.6% | not by council | 2.4 | 2 | 3 | 5 |
| 11 | Leicester | 53.4 | 57,148 | 15.5% | 18,000 | 5.5 | 2 | 3 | 4 |
| 12 | Brighton and Hove | 53.4 | 51,797 | 18.7% | 13,000 | 15.3 | 1 | 3 | 4 |
| 13 | Cardiff | 50.9 | 67,506 | 18.6% | not by council | 14.5 | 2 | 3 | 2 |
| 14 | Swansea | 48.7 | 53,484 | 22.4% | not by council | 2.3 | 2 | 3 | 2 |

For comparison, the pilots: Newcastle 56,961 (19.0%) and Gateshead 42,548 (21.7%) disabled residents; Edinburgh about 100,000 (19.5%, council figure). Glasgow alone is bigger than Newcastle and Gateshead together.

Blue Badges are rounded to the nearest thousand by DfT. Station figures sum the main stations named in the CSV. Edinburgh (22.8 m) and Newcastle (10.5 m) are the pilot baselines.

### Short reasons

1. **Glasgow.** Biggest benefit in Scotland, the best data, the most reuse. Its council data (city-centre kerbs, 157 steps with alternative ramps, 2,855 bus stops with raised-kerb flags, gritting, pavement-parking exemptions) is the richest found anywhere in the UK, but none of it states a licence. Without DATA-13 Glasgow still gets open Scottish roadworks, flood levels, terrain and OSM, so it is a useful second city even before the licence lands. The licence is the one thing that can slow it.
2. **Leeds.** Large, central stations, and open data we can use today: crossings, rights-of-way furniture (stiles and gates), street café licences, Changing Places and footfall counters. Its disabled share is below average (16.7%), which costs it on need.
3. **Sheffield.** A high share (19.7%) and a good Blue Badge count. Open footway hierarchy ("no limitations"), 1,493 benches and council toilets. Fewer station journeys.
4. **Bristol.** Best English data: a 21,761-segment walking and cycling network with steps and surface keyed by USRN, 151 community toilets with measurements, and pavement licences. Smaller than the three above, and the walking-network licence is "not stated, hub default OGL", so confirm it.
5. **Manchester.** Busy stations and typed signal crossings from TfGM. Its GTFS is ODbL, and `wheelchair_boarding` is unknown for 15,623 of 15,693 stops, so step-free bus data is thin.
6. **Birmingham.** The most disabled residents (198,000) and the most station journeys, but the survey found no local accessibility data at all. A research pass could move it up the list.
7. **Nottingham.** Good crossing data (331 zebras, 205 refuges, nightly disabled-parking orders), but the smallest of the English cities that scored well.
8. **Liverpool.** High need (21.8%) and busy stations, but no local data found.
9. **Dundee.** Cheap to reuse, but small. Has benches and disabled-bay data.
10. **Aberdeen.** Same story, with nothing found beyond the national Scottish feeds.
11. **Leicester.** Lowest share of any candidate (15.5%). Open footfall counters and a taxi list.
12. **Brighton and Hove.** Nothing found locally.
13. **Cardiff.** Large, but every Welsh score is held back: no open roadworks (Street Manager has no Welsh authorities), a new LiDAR source, a different flood API, and no council accessibility data found.
14. **Swansea.** As Cardiff, smaller.

## Does this agree with DEF-09?

DEF-09 says: Glasgow first (once DATA-13 is licensed), then Wales.

- **Glasgow first: agreed.** It is first on the combined score, second on benefit alone and first on feasibility alone.
- **Then Wales: not supported.** Both Welsh cities are in the bottom three on the combined score. The people are there (Cardiff about 67,500, Swansea about 53,500) but the data and the code are not ready. Leeds, Sheffield and Bristol each reach more disabled people with less new work.
- **Qualification on "once licensed".** Glasgow does not have to wait for the licence to be useful, but its best layers do. If Richard prefers not to start before the licence is confirmed, Leeds becomes the first expansion and nothing else changes.

The case for Wales that this score cannot see: Welsh bilingual requirements, public funding priorities, or a partner. If one of those exists, say so and move it up.

## Sources and licences

All published tables. Nothing was scraped. Every file was downloaded on 2026-10-05.

| Source | What we used | Licence |
|---|---|---|
| ONS Census 2021, TS038 Disability, England and Wales, local authorities (April 2023 boundaries), via [Nomis](https://www.nomisweb.co.uk/census/2021) dataset NM_2056_1 | Residents limited a lot, a little, and total, for 318 authorities | Open: Open Government Licence v3.0 |
| National Records of Scotland, [Scotland's Census 2022: health, disability and unpaid care chart data](https://www.scotlandscensus.gov.uk/2022-reports/scotland-s-census-2022-health-disability-and-unpaid-care) (21 November 2024) | Age-standardised "bad or very bad health" by council area (figure 5); people limited a little or a lot by age for Scotland (figure 7) | NRS census data is published as open, but the page and file do not state the licence. Confirm OGL v3.0 before we redistribute |
| National Records of Scotland, [Scotland's Census 2022 rounded population estimates](https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-rounded-population-estimates-data/) | Population by council area | As above: assume OGL, confirm |
| Glasgow City Council indicators ([Understanding Glasgow](https://www.understandingglasgow.com/glasgow-indicators/health/disability)) | Glasgow 26.0% limited a little or a lot | Council web page, quoted for one figure only. Not a dataset. Licence not stated |
| City of Edinburgh Council, [Census 2022 health infographic](https://www.edinburgh.gov.uk/strategy-performance-research/census-2022/3) | Edinburgh 19.5% (pilot comparison only) | Council web page. Licence not stated |
| DfT, [Blue Badge scheme statistics, table DIS0105](https://www.gov.uk/government/statistical-data-sets/blue-badge-scheme-statistics-data-tables-dis) (19 March 2026) | Badges held at 31 March 2025 by English authority; England 3.07 m, 5.2% of the population | Open: OGL v3.0 (GOV.UK) |
| Scottish Government, [Blue Badge statistics FOI release](https://www.gov.scot/publications/foi-202500458187/) | Scotland 324,826 live badges at 7 April 2025. National figure only | OGL v3.0 (gov.scot default) |
| ORR, [Estimates of station usage 2024-25](https://dataportal.orr.gov.uk/station-usage), table 1410 | Entries and exits by station | Open: OGL v3.0 (data portal footer) |
| [DATA_SURVEY_UK](../DATA_SURVEY_UK.md) §2, §3, §5, §7 | Local data, licence status and expansion needs | Per row in the survey |

## What the sources do not give us

- **Scotland's disability share by council area** is not in the files I could reach. The UK Data Service tables (UV303a and UV303b, by council area) sit behind a human-verification wall, and I did not try to get round it. For Dundee and Aberdeen the share is an **estimate**: a straight line through Edinburgh (bad health 5.4%, limited 19.5%) and Glasgow (10.8%, 26.0%), applied to each council's bad-health figure. Treat it as a few points either way. It cannot reorder the top three, because Dundee and Aberdeen are small.
- **Blue Badges by council** are published for England only. Scotland has a national total and Wales gave me nothing council by council, so Blue Badges are shown but not scored. They moved nothing in the ranking: the English cities' badge counts follow their census counts closely (Leeds 41,000, Sheffield 29,000, Birmingham 54,000).
- **Northern Ireland** is out. Belfast is not scored: ORR covers Great Britain only and I did not pull the NI census. DfI has a national crossing, defect and lighting inventory, which makes Belfast worth a look later (survey §5).
- **Census questions differ.** England and Wales ask about long-term conditions that limit day-to-day activities (the Equality Act measure). Scotland asks a similar but not identical question, and its share runs higher (24.1% against 17.5%). Do not compare Glasgow's 26.0% with Leeds's 16.7% directly. The need score handles this by indexing within each nation.
- **Census 2021 and 2022 are snapshots**, and the census counts residents, not visitors or commuters. City-centre footfall is not in here.
- **Disability is not one thing.** The census measure covers all limiting conditions. Causewayside's routes help people who use wheelchairs, scooters, walkers and who have mobility limits, and blind and partially sighted people for crossings and lighting. The Blue Badge "moving around" categories are closer to that group, but are only usable for England.
- **Reach counts the whole authority.** A big share of the benefit is in the city centre, and a council area can include towns that never use the app.
- **Station usage is a proxy.** It counts rail journeys, not the walk to the station. It ignores buses, trams and the Glasgow subway, and it counts a commuter's single trip the same as a disabled passenger's.
- **The three judgement scores (open data, licence, reuse) are mine**, drawn from a survey that searched by keyword. A city with no survey hits scores low. Birmingham and Liverpool deserve a proper data pass before anyone writes them off.
- **Licence status moves.** Glasgow's score assumes DATA-13 is not yet licensed. If the council confirms OGL, Glasgow's licence score rises from 2 to 4 and its lead widens.

## Follow-ups

Added to the roadmap: RES-11 (Scottish council-level census and Blue Badge figures, and a data pass on Birmingham and Liverpool) and DEF-10 (Leeds as the second expansion city, once Glasgow is under way or if Richard prefers not to wait for the licence). Richard's decision on whether to change DEF-09 is in [OPEN_ITEMS.md](../OPEN_ITEMS.md).
