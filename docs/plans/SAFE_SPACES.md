# Safer spaces and getting home at night

FEAT-25. Research and a plan. Nothing here is built yet. Decision: [D-083](../DECISIONS.md#d-083-safer-spaces-opt-in-on-the-phone-only-what-places-say-about-themselves).

## The request

A user wrote: "There are apps for it, but given that it's built on accessibility and intersectionality is central to that, you should have a queer/diverse minorities/woman friendly spaces section or optional tab."

They're right that it fits. Disabled women, and disabled LGBTQ+ people, face the same night-time risks as everyone else, with fewer ways to get out of a situation. Someone who can't take the stairs to a side exit, or run, plans more carefully. Causewayside already prefers lit streets after dark for some profiles (D-038).

But a map of "queer-friendly places" can be used to find targets, and knowing who looks at it can out people. So this plan is as much about what not to build as what to build.

## What we found

Research done 2026-10-08 with web searches, a download of the BODS Scotland GTFS and counts from an OSM extract of central Edinburgh dated 2026-10-02. "Unverified" means we couldn't confirm it.

### The short version

- **Almost no venue scheme publishes reusable data.** None of the safe-venue schemes we looked at offers an open licence or an API. Each needs a written agreement, or we stay with OpenStreetMap.
- **Two big schemes have ended.** Police Scotland has ended Keep Safe: its page says "it is no longer feasible or proportionate to continue". Ask for ANI ended in pharmacies on 4 November 2024. A layer built on either would already be out of date. Lists of "safe" places go stale in a way that can put people at risk.
- **Lighting data is good and getting better.** In June 2026 the council's 58,819 street lighting columns in Edinburgh were imported into OSM (OGL). Main roads in central Edinburgh are 95 to 98% tagged `lit`, but footways are only 27%.
- **Night buses are in data we already use.** The BODS Scotland GTFS has 15 Lothian night routes (N1 to N44). The North East file has Go North East's night routes.
- **OSM's `lgbtq=*` tag is too sparse for a layer on its own.** It is on 9 venues in central Edinburgh.
- **Crime data is a trap.** It's not available street by street in Scotland. In England it's snapped to anonymised points and two months old. Apps that steered people away from "bad areas" were rightly called racist (Microsoft's 2012 patent, SketchFactor in 2014). We won't route on crime or deprivation.

### Sources, one by one

Coverage starts with Edinburgh and Scotland, then the UK.

| Source | What | Coverage | Licence and terms | Access | Freshness | How we'd use it |
|---|---|---|---|---|---|---|
| OSM `lit=*` | Whether a way is lit | Central Edinburgh: 52% of highway length tagged, footways 40%, main roads 95 to 98%. Newcastle per D-038 | ODbL (already used) | Our OSM build | Weekly refresh | Already in routing (D-038). Keep "lighting not mapped" as unknown, never dark |
| OSM `highway=street_lamp` (Edinburgh council import, June 2026) | 58,819 lamp columns | Edinburgh only. 11,493 in the central box | OGL v3 via OSM, OS attribution | Our OSM build | Council data possibly two years old | A weaker "probably lit" class for untagged ways near lamps. 63% of untagged footways have a lamp within 30 m. Not good enough to call a way lit, since a lamp on the next street counts too |
| Council lighting open data (Darlington, York, Camden and others) | Lamp columns | Patchy in England. None found for Newcastle, Gateshead or pan-London | OGL where published | Downloads | Varies | Same as the Edinburgh lamps, city by city. Ask Newcastle for theirs |
| OS NGD Street Light | Lamps from aerial images | GB | Premium | Licence | | Not now. Misses lights under trees |
| VIIRS and Black Marble night lights | Satellite brightness | World, about 500 m pixels | Unverified | Download | Yearly | Too coarse for a street. No |
| BODS GTFS (Scotland, North East) | Timetables incl. night buses and trams | Lothian N routes, Edinburgh Trams, Go North East night routes, Metro (shuts about midnight) | OGL | Bulk download, already in `scripts/gtfs-bus.py` | Daily | Check our hourly counts keep after-midnight trips (GTFS times past 24:00). Say "last bus" and "night bus" on routes |
| TfL Unified API | Night Tube, night buses, lifts | London | TfL licence (OGL with "Powered by TfL Open Data") | API, already used | Live | Same, for London |
| OSM facilities: `amenity=police`, `amenity=taxi`, `amenity=pharmacy` with `opening_hours`, `unisex=yes` and `changing_table=*` on toilets | Places to get help or a toilet | Central Edinburgh: 5 police, 31 taxi ranks, 42 pharmacies (36 with hours), 59 toilets (8 `unisex`, 12 with changing tables) | ODbL | Our OSM build | Weekly | "Open now" help points; toilet filters for everyone |
| OSM `lgbtq=*`, `lgbtq:*` | Venue says it is LGBTQ+ primary or welcoming | 4,022 worldwide; 9 in central Edinburgh | ODbL. The wiki asks for verifiable evidence | Our OSM build | Weekly, but rarely rechecked | One input to a "LGBTQ+ welcoming" filter, labelled as mapped by volunteers, with its date |
| OSM `toilets:gender_neutral` | | 0 uses. Gender-neutral toilets are tagged `unisex=yes` | | | | Use `unisex=yes` |
| Scottish LGBTI+ Rainbow Mark (Equality Network) | Venues and organisations that signed a pledge | Scotland, map of signatories | No licence stated. Carries a caveat after the April 2025 Supreme Court ruling | Web map only | Unknown | The best Scottish LGBTQ+ source. Needs Equality Network's agreement |
| UK SAYS NO MORE Safe Spaces (Hestia) | Domestic abuse safe spaces in all Boots, Morrisons, Superdrug and Well pharmacies and every TSB branch | UK, over 5,000 sites, incl. Scotland through the chains | No licence or API | Web locator | Unknown | Needs Hestia's agreement. We could match the chains' branches in OSM by brand, but only with Hestia's say-so that every branch takes part |
| Ask for Angela (Ask for Angela CIC) | Venues that signed the National Venue Pledge | UK. Scottish coverage unverified | "All rights reserved" | Web map | Unknown | Needs their agreement |
| Best Bar None Scotland (Retailers Against Crime CIC) | Accredited licensed venues | Edinburgh city-wide since 2016; 46 venues in 2019 | Not stated | Website | Yearly awards | Ask whether a list exists and can be shared |
| Women's Night Safety Charter (Mayor of London) | Organisations that signed a pledge | London, over 3,000 signatories | Not stated | Web list | Unknown | Weak: a pledge, not on-site help. Later, if at all |
| London LGBTQ+ Venues Charter (GLA) | Venue pledge | London | Not stated | Unverified whether a list is public | | Ask the GLA |
| Safe Places National Network (CIC) | Places for people who feel lost or scared, mainly for learning disabled and autistic people | Mainly England | Not stated | App and search page | Unknown | A partner for the cognitive and autism profiles (survey: Warm Spaces, Safe Places) |
| Keep Safe (Police Scotland, I Am Me) | Was over 900 venues in Scotland | | | App only | **Ended** | Don't use. Ask Police Scotland what replaces it |
| Ask for ANI | Pharmacy codeword | | | | **Ended 4 Nov 2024** | Don't use |
| Purple Flag (ATCM) | Accredits whole town centres, not venues | Aberdeen confirmed. Edinburgh, Newcastle unverified | No public list | Ask ATCM | Yearly | At most a line about an area. Low value |
| Strut Safe | Volunteer phone line, walks you home by phone | UK. Thu and Sun 19:00 to 01:00, Fri and Sat 19:00 to 03:00. BSL via SignVideo | | Phone number | | A link in the layer, with its hours |
| Street Assist Edinburgh, Edinburgh Street Pastors, Edinburgh SafeZone, Newcastle Safe Haven van, Newcastle Street Pastors | Welfare help on weekend nights | Local | No data published | Ask them | Changes | Hand-curated points with hours, only with each group's agreement |
| WalkSafe+ | App that already gathers council, police and BID safe-space lists | UK | Commercial | Partnership | | Possible partner. Also the main existing app |
| police.uk street crime | Crimes snapped to anonymised points | England, Wales, NI. Not Scotland | OGL | API, no key | About two months behind | **No.** Not as a cost, not as a layer |
| Scottish Index of Multiple Deprivation | Deprivation by data zone | Scotland | OGL | CSV | 2020 | **No.** It measures deprivation, not safety |
| Queering the Map | Anonymous personal stories pinned to places | World | None found | | | **No.** Stories, not checked venues, and it could expose people |
| Grindr, Gaydar and similar | | | Terms forbid it | | | **No.** Inferring places from a dating app's users is a serious privacy harm |

### Existing apps

People already use WalkSafe+, Strut Safe (a phone line), the Safe Places app and the UK SAYS NO MORE locator. Safe & the City looks dormant (last update September 2022). Right To Be (formerly Hollaback) is US-focused bystander training. Citymapper's "Main Roads" walking option is the closest routing precedent: it uses main roads as a stand-in for lit, busy streets. Google tested a lit-streets map layer in 2019 but we found no launch. Our edge is the combination: a route that fits your body, lit where it can be, ending at a door you can get through, with help points you can actually reach.

## Safety and sensitivity

These rules come before any feature. They are D-083.

1. **Off by default, opt in, on the phone only.** Turning the layer on is a setting kept in `localStorage`, like the profile (D-009). It is never sent, logged or counted. No analytics on it, ever.
2. **Nobody can tell who has it on.** The layer's data ships to everyone in the same city file, so downloading it says nothing. No separate request when the layer opens. The e2e privacy check (SEC-05) extends to it.
3. **Discreet by design.** A neutral name in the menu ("Out at night"). Plain markers with no rainbow or gendered symbols, so a glance at the screen gives nothing away. Nothing about it on a lock screen or in a share link.
4. **Only what places say about themselves.** A place is listed only if it publicly signed a scheme or pledge, or is tagged in OSM with the evidence the wiki asks for. Never inferred from reviews, names, dating apps or crowd guesses. Never nominated by the public.
5. **Never list places where people need to stay hidden.** No women's refuges, shelters, support group meeting places, LGBTQ+ youth groups or social facilities (`social_facility:for=*`, `community_centre:for=lgbtq`), even when OSM has them. Public-facing venues and services only.
6. **Venues can leave.** Any venue can ask to be removed, and we remove it within a week, no questions. A contact address goes on the about page.
7. **Words.** "Signed up to Ask for Angela", "LGBTQ+ welcoming (from Equality Network's Rainbow Mark)", "Lit". Never "safe", "safe route" or "safe space" as our own claim. Every item shows its source and when it was last checked. A route is "lit for 92% of the way", never "safe".
8. **Stale means hidden.** An item not confirmed by its source in 12 months stops showing. A scheme that ends is removed at once (Keep Safe shows why).
9. **No crime or deprivation data** in routing, layers or explanations.
10. **Helps everyone, not only the opted-in.** Lit routes, open-late pharmacies, unisex toilets and changing tables are useful to everyone. They go in the normal app, not behind the opt-in. Only the venue lists sit behind it.

### Community additions and moderation

This ties into the reports and notes work (D-030, D-076, DEF-06) and the confidence and voting thread running in parallel.

- **No public additions of welcoming or safe venues.** The public can't add "this bar is LGBTQ+ friendly" or "this is a women's safe space". It invites false listings, pranks and target lists, and nobody on our side can check it.
- **Confirm or flag only.** On a listed item, people can answer "Still there?" with "Yes", "Closed", "No longer takes part" or "I had a bad experience here". Fixed answers, no free text, so nothing hateful can be posted and nothing can name a person.
- **Pre-moderated, not post-moderated.** Unlike notes (D-030), answers on these items never show directly. Two independent "no longer" answers send the item to review and hide it until a person checks with the scheme. "Bad experience" goes to the scheme, if they agree to take it, not on the map.
- **Pseudonymous counts only.** The same salted per-person pseudonym as D-030, so one person can't vote ten times. No accounts needed.
- **Confidence.** An item's confidence comes from the source first (signed scheme > OSM tag), then recent confirmations, then age. The confidence model in the parallel reports thread should treat these as a separate class with a stricter threshold.

## The experience

**Settings, then "Out at night"**, off by default. Turning it on explains, in two short lines, what it shows, where it comes from and that it's never sent anywhere.

When it's on, the map gets a layer with filter chips. Each chip has words, not only an icon:

| Filter | Shows | Data | Behind the opt-in? |
|---|---|---|---|
| Help points | Police stations, staffed stations, pharmacies open now, taxi ranks, weekend welfare points with their hours | OSM, TfL, hand-curated with partners | No: also in normal search |
| Ask for Angela and Safe Spaces | Venues signed up to Ask for Angela; Safe Spaces in pharmacies and banks | Partners | Yes |
| LGBTQ+ welcoming | Rainbow Mark signatories; OSM `lgbtq=primary` or `welcome` | Equality Network, OSM | Yes |
| Gender-neutral toilets | Toilets tagged `unisex=yes` | OSM, Toilet Map | No: a filter on toilets for everyone |
| Changing tables | Toilets with `changing_table=yes` | OSM | No |
| Night buses and trams | Stops with a service in the next hour, last departures | BODS, TfL | No |

We name the schemes ("Ask for Angela and Safe Spaces") rather than "women-friendly", because they help anyone who needs them and the name says what the venue has agreed to. Each item opens a card: what it is, which scheme, when last checked, opening hours, and whether you can get in (our existing entrance verdict).

A "Need help now?" link in the layer gives 999 (and 999 BSL and text relay), 101 and Strut Safe's number with its hours.

## Routing

- **Lit streets after dark, for anyone.** D-038 already prefers lit ways for the visual-impairment preset, and anyone can turn it on. With the layer on, offer it once: "After dark, prefer streets that are lit?"
- **"Probably lit."** For untagged ways in Edinburgh, a lamp column within about 15 m along the way (not at its midpoint) gives a "probably lit" class, costed between lit and not mapped. Test the distance against the 2,010 ways mapped as unlit first. Say "lighting not mapped, lamps nearby", never "lit".
- **Prefer main streets after dark (to research).** Citymapper's approach. It may suit some people and not others, since main streets are noisier and busier. Ask in research before building (RES).
- **Night transport.** If the trip ends after the last bus, say so, and offer the night bus. Check first that our bus build keeps trips after midnight.
- **Help points along the way.** With the layer on, "On this route" (D-067) can list open help points within 100 m of the route, under "Worth knowing".
- **Never a "safe route".** The route card says "Lit for 92% of the way. 5% lighting not mapped." Nothing more.

## Partnerships worth contacting

In order. Each email asks the same things: can we show your list, under what terms, how often does it change, and will you tell us when a venue leaves.

1. **Equality Network** (Scottish LGBTI+ Rainbow Mark): en@equality-network.org, 0131 467 6039, 30 Bernard Street, Edinburgh EH6 6PR. Also ask about the post-ruling caveat on the map.
2. **Hestia, UK SAYS NO MORE** (Safe Spaces): uksaysnomore@hestia.org. Ask whether every Boots, Superdrug, Morrisons and Well pharmacy and TSB branch takes part, so we can use OSM's branch locations.
3. **Ask for Angela CIC**: hello@askforangela.co.uk.
4. **Police Scotland**: what replaces Keep Safe, and whether it will publish a list.
5. **City of Edinburgh Council**: the night-time economy coordinator and the Women's Safety in Public Places partnership.
6. **Street Assist Edinburgh**, **Edinburgh Street Pastors** and **Essential Edinburgh** (the city centre BID): weekend welfare points and hours.
7. **Best Bar None Scotland** (Retailers Against Crime CIC): bbnscotland@retailersagainstcrime.org, 01786 471451.
8. **Strut Safe**: outreach@strutsafe.org. A link, with their agreement.
9. **Newcastle**: Northumbria Police (Safe Haven van), Newcastle Street Pastors (newcastle@streetpastors.org.uk), NE1 (the BID), and the council for its street lighting data.

To review the wording and the safety rules before anything ships (paid, if they'll take it):

- **LGBT Health and Wellbeing**, **Scottish Trans** and **LGBT Youth Scotland**
- **Engender**, **Edinburgh Rape Crisis Centre** and **Scottish Women's Aid**: especially on rule 5, keeping refuges and services hidden

## Phases

| Phase | What | Size | Needs | Roadmap |
|---|---|---|---|---|
| 1 | "Probably lit" from Edinburgh's lamp columns, tested against mapped unlit ways; route card wording "Lit for N%" | M | Nothing | FEAT-26 |
| 2 | Toilet filters for everyone: gender-neutral (`unisex=yes`) and changing tables | S | Nothing | FEAT-27 |
| 3 | Night transport: keep after-midnight trips in the bus build; "last bus" and night bus lines on routes | M | Nothing | FEAT-28 |
| 4 | "Out at night" layer, off by default, on the phone only: help points from OSM and TfL, "Need help now?", lit-streets prompt. OSM `lgbtq=*` as the first, labelled, LGBTQ+ source | M | Richard's yes to the rules (D-083); wording review | FEAT-29 |
| 5 | Partner lists in the layer: Rainbow Mark, Safe Spaces, Ask for Angela, welfare points; removal on request; 12-month expiry | L | Written agreements | FEAT-30 |
| 6 | "Still there?" confirmations, pre-moderated, with the confidence model | M | DEF-04 backend, the parallel reports work | FEAT-31 |
| Research | Ask women, LGBTQ+ and disabled users at night: what helps, main streets or not, what the layer should be called | S | Testers, partner groups | RES-12 |

Phases 1 to 3 are worth doing whatever happens with the rest, and none of them is sensitive. Start there.

## Risks

| Risk | How we handle it |
|---|---|
| A listed venue is targeted | Only venues that publicly say it themselves; no public nominations; removal on request; neutral markers |
| A user is outed by the app | Setting on the phone only; data shipped to everyone; nothing sent, logged or counted; no lock-screen or share traces |
| False reassurance: "lit" or "listed" taken as "safe" | Never say safe; show the source and the date; "lighting not mapped" stays unknown |
| Stale lists (Keep Safe, Ask for ANI ended) | 12-month expiry; partners tell us about leavers; remove ended schemes at once |
| Hostile or prank community input | No free text, no additions, pre-moderation, pseudonymous counts |
| Stigmatising areas | No crime or deprivation data, anywhere |
| Legal and reputational risk of naming venues | The same question as Richard's open item on naming venues' access (#11). Partners' terms in writing. Source and date on every item |
| Contested wording after the April 2025 Supreme Court ruling | Use the facility's own words and OSM's (`unisex`); get reviewed by Scottish Trans and Equality Network |
| Scope creep from the pilot-city work | Phases 1 to 3 are small and help the core product; 4 to 6 wait on Richard and partners |

## Questions for Richard

1. Do you agree with the safety rules (D-083), especially "only what places say about themselves" and "no public additions"?
2. Shall we do phases 1 to 3 now? They need nothing from anyone.
3. Will you send the partnership emails above? We can draft them.
4. Is "Out at night" the right name for the layer, or something else? We'd test it with users too.
5. Should we pay a partner group to review the wording and rules before phase 4 ships?
6. "Prefer main streets after dark": worth researching, or not for us?
7. Any partner you'd rather not approach, or one we've missed?
