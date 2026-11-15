# Names check report (2026-11-14)

Method note: evidence comes from WebSearch result summaries and listing pages (apartments.com, Zillow, Trulia, HAR, ApartmentFinder, rent.com, property sites, city and nonprofit news). Most property sites and apartments.com returned HTTP 403 to direct fetches, so I did not bypass them; only riversidetownhomesaustin.com was read directly. Search results rarely show page dates, so "today" means "what current listings show in November 2026". No page contained instructions aimed at an agent. Nothing was edited in the repository.

## 1. How the random complexes were picked

Source: app/public/data/complexes.json (2,496 complexes) as read on 2026-11-14.

- Group A rows were matched by address prefix (all 8 found, all with source openstreetmap).
- Group B pool: `name.source == "openstreetmap"` and not in group A, 811 complexes, sorted by `id` ascending (plain string sort). Sample: `random.Random(20261114).sample(pool, 12)`.
- Group C pool: `name.source == "city"`, 25 complexes, sorted by `id` ascending. Sample: a second call on the same `random.Random(20261114)` instance, `.sample(pool, 8)` (B drawn first, then C, one generator, seeded once).
- The pick will differ if the regenerated file changes the pools. Picked rows are saved at /private/tmp/claude-501/-Users-gabe--claude-spares-spare-zvxXGq/22811bf2-942c-447a-b054-86ff2d91b5bf/scratchpad/picked.json.

## 2. Tables

### Group A: disputed properties

| id | address | site shows (source) / city registration | found today | best source | verdict |
|---|---|---|---|---|---|
| 0304070701 | 1601 Royal Crest Dr | Solaris Austin (osm) / Mia Riverside | Mia Riverside (formerly Solaris) | https://www.apartmentfinder.com/Texas/Austin-Apartments/Mia-Riverside-Apartments-kbq2dj8 ; property Facebook page says "Formerly known as Solaris" | renamed |
| 0150050125 | 8527 N Capital Of Texas Hwy NB | Falls on Bull Creek (osm) / Capital Hills Apartment Homes | Capital Hills (formerly The Falls on Bull Creek) | https://www.apartments.com/capital-hills-austin-tx/yyzgvxv/ ; own site https://entrata.capitalhillsaustin.com/ (title seen in search only) | renamed |
| 0307010101 | 2306 Wickersham Ln | Verde Apartments (osm) / The Patten West | Not established. Verde Apartments is at 2310 Wickersham; The Patten West markets at 2207 Wickersham, though a city open-data record lists it at 2306 | https://www.verde-austin.com/ ; https://www.greystar.com/the-patten-west-austin-tx/p_11059 | unclear |
| 0307150614 | 6118 Fairway St | Fairway Village (osm) / Riverside Townhomes | Riverside Townhomes (formerly Fairway Village) | https://www.riversidetownhomesaustin.com/ (fetched; shows 6118 Fairway Street) | renamed |
| 0410010440 | 701 Woodward St | Acclaim at South Congress (osm) / Blunn Creek Apartments | Acclaim at South Congress (formerly Blunn Creek) | https://acclaimatsouthcongress.com/location/ (address in search result); https://www.apartments.com/acclaim-at-south-congress-austin-tx/enq0qln/ | matches |
| 0225150335 | 1026 Clayton Ln | Arbors at Creekside (osm) / Sunday Village Apartments | Sunday Village (formerly Arbors at Creekside), renovation completed, announced 2026-03-04 | https://www.austintexas.gov/housing/news/newly-renovated-affordable-housing-active-adults-sunday-village-completed-austins ; https://www.sundayvillage.org/ | renamed |
| 0243160501 | 1070 Mearns Meadow Blvd | The Vibe (osm) / The Arbors Of Austin Apartments | The Sonata (formerly The Vibe; older still: The Arbors of Austin) | https://www.apartments.com/the-sonata-austin-tx/nwz7cqn/ (listing updated about 16 days before the search); MapQuest marks The Vibe closed | different |
| 0310180106 | 1705 Frontier Valley Dr | Santora Villas (osm) / Frontier East Apartments | Frontier East Apartments (formerly Santora Villas) | https://www.apartments.com/frontier-east-apartments-austin-tx/fh1cdfr/ ; own site frontiereastapts.com | renamed |

### Group B: 12 openstreetmap names

| id | address | site shows | found today | best source | verdict |
|---|---|---|---|---|---|
| 0147380101 | 4800 Steiner Ranch Blvd | Bell Steiner Ranch Apartment Homes | Bridge at Steiner Ranch (some listings still say Bell) | https://www.zillow.com/apartments/austin-tx/bridge-at-steiner-ranch/649BSh/ | renamed |
| 0219131301 | 1911 Philomena St | Amli Branch Park North | AMLI Branch Park (units are prefixed N and S, so "North" is one of two buildings) | https://www.amli.com/apartments/austin/mueller-apartments/amli-branch-park | matches (the "North" suffix is not on the property's own name) |
| 0303090108 | 1300 S Pleasant Valley Rd | Waterloo Flats | Waterloo Flats | https://www.rent.com/apartment/waterloo-flats-austin-tx-lc5914928 | matches |
| 0307110134 | 1300 Crossing Pl | Estates at East Riverside | Estates at East Riverside | https://estatesateastriverside.com/contact/ | matches |
| 0259021101 | 11411 Research Blvd SVRD NB | Wind River Crossing | Wind River Crossing | https://www.windrivercrossing.com/ | matches |
| 0266260203 | 14200 The Lakes Blvd | Lakewood Apartments | Lakewood (listings say Austin or Pflugerville) | https://www.apartments.com/lakewood-apartments-pflugerville-tx/2dq9b09/ | matches |
| R401754 | 9301 Spectrum Dr | Ventana Oaks | Ventana Oaks | https://www.ventanaoaks.com/ | matches |
| 0209150204 | 3107 E 12th St | Anderson Village | No apartment found; Redfin lists the address as vacant land, nearby 3005 and 3007 E 12th are other properties | https://www.redfin.com/TX/Austin/3107-E-12th-St-78702/home/109937564 | unclear |
| 0262200641 | 12820 N Lamar Blvd | Marquis Parkside | Marquis Parkside (some rent.com units say "Gracy Woods") | https://www.rentcafe.com/apartments/tx/austin/marquis-parkside/default.aspx | matches |
| 0105020431 | 1717 Toomey Rd | Coldwater Apartments | Coldwater | https://www.apartments.com/coldwater-austin-tx/vc12dng/ | matches |
| 0251310239 | 12433 Dessau Rd | Harris Branch Senior Living | Harris Branch Seniors (also called Harris Branch Senior Living and 55+) | https://www.apartments.com/harris-branch-seniors-austin-tx/ktx3he9/ | matches (variant wording) |
| R532918 | 13535 Lyndhurst St | The Michael at Presidio | The Michael at Presidio | https://www.themichaelatpresidio.com/Contact.aspx | matches |

### Group C: 8 city names

| id | address | site shows | found today | best source | verdict |
|---|---|---|---|---|---|
| 0234111501 | 8900 N IH 35 SVRD SB | Capella Apartments | Avesta Capella (same property; Yelp pages for it are marked closed, status unconfirmed) | https://www.har.com/avesta-capella/apartment_9422A | matches (brand prefix) |
| 0239200901 | 1007 E Rundberg Ln | Center Piont Apartments | Alma North Plaza (older: Glen Oaks, Abbey Haus). "Piont" is a typo in the city's text | https://www.apartments.com/alma-north-plaza-austin-tx/qcbtgkz/ | different |
| 0228170824 | 1220 Camino La Costa | Villas De Sendero Apartments | Only one weak hit: ApartmentRatings page "Irongate Apartments" at this address; no listing for Villas De Sendero | https://www.apartmentratings.com/tx/austin/irongate-apartments_512453530078752/ | unclear |
| 0168090512 | 8312 Fathom Cir | Summit At Westwood | Summit at Westwood | https://www.summitwestwood.com/ | matches |
| 0422030118 | 2302 E William Cannon Dr | Hillside On Cannon Apartment Homes | Hillside on Cannon | https://www.trulia.com/building/hillside-on-cannon-2302-e-william-cannon-dr-austin-tx-78744-1001414342 | matches |
| 0304020541 | 1221 Algarita Ave | Cascade Apartments | Cascade Apartments (some sites say Algarita Apartments) | https://www.cascadeapartmentsaustin.com/ | matches |
| 0303050358 | 1300 Parker Ln | Parker Heights Apartments | Parker Heights & Flats | https://www.rent.com/apartment/parker-heights-and-flats-apartments-austin-tx-lc6297574 | matches |
| 0239200804 | 9200 North Plaza | Tides Of North Plaza | Aviva at North Plaza (HAR also lists Abbey Haus) | https://www.avivanorthplaza.com/ | renamed |

## 3. Group A: which name is current

| address | current name | other name | source |
|---|---|---|---|
| 1601 Royal Crest Dr | Mia Riverside (city) | Solaris is former | ApartmentFinder, HAR, property Facebook |
| 8527 N Capital Of Texas Hwy | Capital Hills (city) | Falls on Bull Creek is former | apartments.com, own site |
| 2306 Wickersham Ln | Neither confirmed | Verde is at 2310 next door; Patten West markets at 2207 | verde-austin.com, Greystar |
| 6118 Fairway St | Riverside Townhomes (city) | Fairway Village is former | own site fetched |
| 701 Woodward St | Acclaim at South Congress (OSM) | Blunn Creek is former (rename likely around Dec 2018 sale, per an Avanath page; not confirmed) | own site, apartments.com |
| 1026 Clayton Ln | Sunday Village (city) | Arbors at Creekside is former | City of Austin housing news, 2026 |
| 1070 Mearns Meadow Blvd | The Sonata; neither name is current | The Vibe is the former name; The Arbors of Austin is older still | apartments.com, Apple Maps, MapQuest |
| 1705 Frontier Valley Dr | Frontier East Apartments (city) | Santora Villas is former | apartments.com, RentCafe |

## 4. Counts

| group | matches | different or renamed | unclear |
|---|---|---|---|
| A (8) | 1 | 6 (5 renamed, 1 different) | 1 |
| B (12) | 10 | 1 (renamed) | 1 |
| C (8) | 5 | 2 (1 different, 1 renamed) | 1 |

## 5. Other things worth the owner's attention

- OpenStreetMap names are stale in 5 of 8 disputed cases. In each, the city's registration name is the current one and OSM holds the pre-rename name. In the random OSM sample, 1 of 12 was stale (Bell Steiner Ranch) and 1 had no apartment at that address. When the two sources disagree, prefer the city name as a first approximation.
- 2306 Wickersham looks like a parcel mismatch rather than a rename: the unit numbers there (800 to 1600 series) and the Trulia condo-style valuation do not match the apartment complexes on the street. Check the coordinates before publishing either name.
- 3107 E 12th St appears to be vacant land, so "Anderson Village" may be a misplaced or demolished POI.
- 1220 Camino La Costa: the city name Villas De Sendero found no listing at all. The registry name may be out of date, or the property may not be marketed under it.
- City names carry typos ("Center Piont"). Avesta Capella and Capital Hills style renames are common; consider showing "formerly" where known.
- Two Yelp pages flagged properties as closed (Capella, Patten West by Sandalwood, Harris Branch 55+ by Cardinal Group). These look like management changes, not demolition, but are unverified.
- Search summaries in this check were model-written, so each verdict rests on listing-site data, not on pages I read myself except Riverside Townhomes. Treat the A-group results as strong (several sources agree) and the rest as good but not primary-source verified.

## Second pass: the remaining city names

Scope: the 17 city-sourced names not covered in the first pass. complexes.json still holds all 25 city-sourced names, so no git recovery was needed. Same method and limits as the first pass: WebSearch result summaries and listing pages only, no direct page reads (property sites return 403 to fetches and I did not work around that). "matches" below means the exact city name appears for that street address on the property's own site or a current listing, in the spelling the city uses; spelling or wording variants are marked `different`. Listing pages are mostly undated; where a date showed (Yelp "updated" labels) it is noted.

| id | address | city's name | found today | best source | verdict |
|---|---|---|---|---|---|
| 0220110955 | 4715 Harmon Ave | Harmon Square'D Apartments | Listed as Bamboo Court Apartments and as Harmon Square; "Harmon Square'D" appears only in the city's Repeat Offender record | https://www.apartments.com/bamboo-court-apartments-austin-tx/n8zyfyq/ | different |
| 0224140502 | 1012 Reinli St | Reinli Arms Apartments | iConic Mueller 1 (formerly Reinli Arms) | https://www.apartments.com/reinli-arms-apartments-austin-tx/x7q276p/ | renamed |
| 0225120306 | 1008 Reinli | Capital Villa Apartments | iConic Mueller 2 (formerly Capital Villa, also Reinli Arms) | https://www.apartments.com/iconic-mueller-2-austin-tx/8c3xym1/ | renamed |
| 0229080212 | 902 Romeria Dr | Sunset Palms Apartments | Sunset Palms Apartments | https://www.padmapper.com/buildings/p24091/sunset-palms-apartments-at-902-romeria-dr-austin-tx-78757 | matches |
| 0229190901 | 1319 Mc Kie Dr | Hights At Cameron Apartments | Heights at the Cameron (also listed as Redondo Flats); the city's "Hights" is a misspelling | https://www.thecameronaustin.com/ ; https://www.zillow.com/apartments/austin-tx/heights-at-the-cameron/CkBJdW/ | different |
| 0235150711 | 303 John Nance Garner Cir | Allentown Apartments | Allantown Apartments (city spells it Allentown) | https://www.apartments.com/allantown-apartments-austin-tx/z14gnny/ | different |
| 0235160412 | 8312 N IH 35 SVRD SB | Woodland Heights Apartments | Woodland Heights (Yelp updated Aug 2026) | https://www.liveatwoodlandheightsaustin.com/ ; https://www.apartments.com/woodland-heights-austin-tx/cmlfp5d/ | matches |
| 0236120208 | 8071 N Lamar Blvd NB | Oaks On Lamar Apartments | Oaks on Lamar (formerly Santa Maria Village; a Yelp page updated Oct 2026 still carries the old name) | https://www.oaksonlamar.com/ | matches |
| 0236170117 | 8800 N IH 35 SVRD SB | Starburst Apartments | Starburst (Yelp updated Sep 2026; some listing snapshots are years old) | https://www.zillow.com/apartments/austin-tx/starburst/5XhtBY/ | matches |
| 0239200905 | 9121 North Plz | Alma North Plaza 2 Apartments | Alma North Plaza II ("II", not "2"; sister of Alma North Plaza I at 1007 E Rundberg) | https://www.almanorthplaza.com/ ; https://www.apartments.com/alma-north-plaza-ii-austin-tx/4c1nztj/ | different |
| 0243100803 | 9024 Northgate Blvd | Northgate Hills Apartments | The Axel (older listing URLs still say Northgate Hills) | https://www.zillow.com/apartments/austin-tx/the-axel/5Xht7R/ | renamed |
| 0244121003 | 1804 W Rundberg Ln | Ascent At Walnut Creek | Skye at North Lamar (formerly Ascent at Walnut Creek) | https://www.zillow.com/homedetails/1804-W-Rundberg-Ln-Austin-TX-78758/29429980_zpid/ ; https://www.rentler.com/places-for-rent/tx/austin/1804-w-rundberg-ln/12431988 | renamed |
| 0303050359 | 1302 Parker Ln | Parker Flats | Parker Heights at 1302 (Parker Flats is the sibling building at 1300 Parker Ln, marketed together as Parker Heights & Flats) | https://www.trulia.com/building/parker-heights-1302-parker-ln-austin-tx-78741-2750798806 | different |
| 0310080313 | 2504 Huntwick Dr | Chevy Chase Downs Apartments | Chevy Chase Downs | https://www.liveatchevychasedownsaustin.com/ ; https://www.apartments.com/chevy-chase-downs-austin-tx/cmndrdg/ | matches |
| 0403010249 | 2301 Durwood St | Lucero Apartments | Lucero Apartments (Yelp updated Jul 2026; no rental listing page seen, so slightly thinner evidence) | https://www.yelp.com/biz/lucero-apartments-austin | matches |
| 0403010250 | 2302 Durwood St | Oak Creek Village Apartments | Oak Creek Village (one listing also says Lamar Square) | https://www.liveatoakcreekvillage.com/contact_us/ ; https://www.zillow.com/apartments/austin-tx/oak-creek-village/BNcfjt/ | matches |
| 0426050105 | 7100 Bluff Springs Rd | Bluff Springs Townhomes | Bluff Springs Townhomes | https://www.bluffspringstownhomes.com/ | matches |

Counts (17): matches 8, different 5, renamed 4, unclear 0.

Notes for approval:
- Safe to approve as exact names: 0229080212, 0235160412, 0236120208, 0236170117, 0310080313, 0403010249, 0403010250, 0426050105. Weakest evidence: Lucero (Yelp and directories, no rental listing) and Starburst (several stale snapshots).
- Four "different" names are spelling or wording problems in the city's text ("Hights", "Allentown", "Alma North Plaza 2", "Harmon Square'D"). Approving the city's exact string would show a misspelled or non-marketed name.
- Pattern across both passes: the city registry lags renames. Of 25 city names, 11 are renamed or different from today's marketing name and 1 more is unclear.
- 8900 N IH 35 (Capella): the property is now Avesta Capella and Yelp marks its pages closed, status unconfirmed.
- Combined: 13 of 25 city names have a `matches` verdict (5 first pass, 8 second pass); 12 do not (3 in the first pass: Center Piont, Tides Of North Plaza, unclear Villas De Sendero; 9 in the second).

## Third pass: the 100 busiest named records (2026-11-15)

The 100 complexes with a name and the most complaints in the 3 years (222 down to 24 complaints): 91 names from OpenStreetMap, 9 approved city names. Ten had been confirmed in the first two passes, all matches. The other 90 were checked by four agents with the same method and rules. Evidence is again search results and listing sites, not pages read directly; most property sites refuse direct fetches and that was not worked around.

### Counts

| | matches | renamed | different | unclear |
|---|---|---|---|---|
| Checked in this pass (90) | 65 | 15 | 3 | 7 |
| Confirmed in earlier passes (10) | 10 | 0 | 0 | 0 |
| All 100 | 75 | 15 | 3 | 7 |

So among the busiest named records, 18 names in 100 were a former name or another property's name, against about 1 in 12 in the random sample of the first pass. Busy records are often buildings that have changed hands.

### What was done

- The 15 renamed and the 2 where another property was found at the address are withheld in `app/pipeline/snapshots/title-review.json`. They show their address. So is 85 Trinity St, whose OpenStreetMap name is misspelled ("Lakeside Apartmments"); the property is Lakeside Apartments.
- The 7 unclear ones and Mosaic at Mueller keep their names. In each, the name is listed at a different street address from the one this site shows, and nothing else was found at the site's address. The site's address is the lowest-numbered city address point inside the parcel, which is often not the leasing office's, and an OpenStreetMap name is only used when it lies inside the parcel. That is doubt about the address label more than about the name. They are listed below for a person to look at.
- Named complexes: 819 before, 801 after (790 OpenStreetMap, 11 city).
- The current names below are what OpenStreetMap should say. Correcting them there and running `npm run names` would bring the names back, right.

### Renamed (withheld)

| id | address | name the site showed | current name | note |
|---|---|---|---|---|
| 0308060203 | 2201 Willow Creek Dr | Sofia Apartments | Aero Riverside | No page states the rename outright; several listing URLs still say "sofia" |
| 0307110306 | 2207 Wickersham Ln | Hillside Villas Apartments | Lyv Austin | In between it was The Patten West |
| 0214150218 | 3300 Manor Rd | Kensington Apartments | The Nellie |  |
| R401747 | 10101 W Parmer Ln | Griffis Parmer Lane | Lakeline Parmer Lane | Griffis from about 2015 to 2023 |
| 0221190711 | 5800 Wellington Dr | Mueller Place | Flats at Wellington |  |
| 0256161125 | 12113 Metric Blvd | The Park at Walnut Creek | Windsor Walnut Creek | Homes.com marks the old name historical |
| 0166280103 | 9009 N FM 620 Rd | Monterone at Canyon Creek | Bridge at Canyon Creek | Renamed around 2018 or earlier |
| 0310140155 | 2201 Montopolis Dr | Trove Eastside | Eastside at 2201 | Property's own site |
| 0245160530 | 1200 Mearns Meadow Blvd | Ascent at Quail Creek Apartments | Skye at Austin |  |
| 0219080712 | 4210 Red River St | Century Plaza Apartments | Casa Marfil |  |
| 0439080724 | 810 E Slaughter Ln | Residences at Onion Creek | River Valley Apartments | Moderate confidence: no page states the rename |
| 0208001708 | 1106 Nueces St | Capitol Quarters | Capitol Living | Inferred: sources place the building at 1108 Nueces |
| 0254130549 | 11701 Metric Blvd | Bradford Pointe | The Fielder | Sold November 2020 |
| 0306080101 | 2409 Town Lake Cir | Link | The Collection Lady Bird Lake | The property's own site says so |
| R392272 | 10015 Lake Creek Pkwy | Legends Lake Creek | Sutton |  |

### Another property's name

| id | address | name the site shows | found | handled |
|---|---|---|---|---|
| 0237240209 | 1400 E Rundberg Ln | Blu Apartments | Englebrook Apartments is at this address; Blu is at 9500 Dessau Rd | withheld |
| 0310080101 | 2425 Cromwell Cir | The Aspect | Coppertree Apartment Homes is at this address; The Aspect is at 4900 E Oltorf | withheld |
| 0218130118 | 1714 Aldrich St | Mosaic at Mueller | Listed at 4600 Mueller Blvd; nothing else was found at 1714 Aldrich | kept: no other property found at this address, and the parcel's address label can differ from the leasing address |

### Unclear (kept)

| id | address | name the site shows | why unclear |
|---|---|---|---|
| 0243170114 | 9908 N Lamar Blvd | Copper Mill Apartments | Listed at 10000 N Lamar; nothing listed at 9908 |
| 0244110306 | 1827 W Rundberg Ln | Ventura Apartments | No listing at this address; a Ventura is at 9209 Northgate Blvd |
| 0239160102 | 846 Payton Gin Rd | The Ivy Apartments | Listed at 8912 N Lamar Blvd, near Payton Gin Rd |
| 0406120403 | 4004 Victory Dr | Mission James Place | Every listing says 4009 Victory Dr |
| 0231180413 | 1114 Delmar Ave | The Vue | A property called The Vue is at 7607 Blessing Ave; no listing found here |
| 0214011303 | 613 W 24th Half St | Yugo Austin Waterloo | Listings show Seton Square at 613 W 24th St and Yugo at 2400 Seton Ave |
| 0309061001 | 2510 S Pleasant Valley Rd | Sotol Riverside | Listed at 2800 Collins Creek Dr; nothing found at 2510 |

### Matches worth knowing about

- 1500 and 1600 Royal Crest Dr both show "The Element Austin"; listings say "Element Austin Apartments".
- 10127 Middle Fiskville Rd shows "Villages at Fiskville 55+ Apartments"; the property now goes by "Villages at Fiskville".
- 2504 New York Dr shows "Mount Carmel Apartments"; listings say "Mt. Carmel Village Apartments".
- 4301 Staggerbrush Rd (Monterey Ranch) and 2503 E Oltorf St (TRIO Apartments) match on name but weakly on address.

### The four agents' own tables

#### Slice 1

The report file was not written. The Write call was rejected with "Subagents should return findings as text, not write report files", so /Users/gabe/git/austin-research/.superpowers/sdd/names-check-3/report-1.md does not exist. The full table is below instead.

Counts (23 rows): matches 14, renamed 5, different 0, unclear 4.

Renamed (id, address, shown name, current name):
- 0308060203, 2201 Willow Creek Dr, Sofia Apartments, now Aero Riverside. Zillow, HAR and ApartmentGuide URLs still say "sofia". No page states the rename outright.
- 0307110306, 2207 Wickersham Ln, Hillside Villas Apartments, now Lyv Austin (in between it was The Patten West).
- 0214150218, 3300 Manor Rd, Kensington Apartments, now The Nellie. An Apartments.com URL still says "kensington-apartments".
- R401747, 10101 W Parmer Ln, Griffis Parmer Lane, now Lakeline Parmer Lane (Griffis from about 2015 to 2023).
- 0221190711, 5800 Wellington Dr, Mueller Place, now Flats at Wellington. Old Mueller Place pages survive on Zumper and ApartmentGuide.

Unclear:
- 0243170114, 9908 N Lamar Blvd, Copper Mill Apartments. Copper Mill is listed at 10000 N Lamar. Nothing is listed at 9908.
- 0244110306, 1827 W Rundberg Ln, Ventura Apartments. No listing at that address. The only Ventura found is at 9209 Northgate Blvd, so this may be `different`.
- 0239160102, 846 Payton Gin Rd, The Ivy Apartments. The Ivy is listed at 8912 N Lamar Blvd, near Payton Gin Rd. Nothing is listed at 846.
- 0406120403, 4004 Victory Dr, Mission James Place. Every listing puts it at 4009 Victory Dr. No property name was found for 4004.

Matches, with the wording difference and best source URL:

| id | address | shown name | current name | source | note |
|---|---|---|---|---|---|
| 0307110310 | 2239 Cromwell Cir | Patten East | Patten East / The Patten East | https://www.apartments.com/patten-east-austin-tx/fc67mjs/ | "The" is optional. Former name Hawthorne at the District (closed on Yelp and MapQuest). |
| 0243100107 | 9001 Northgate Blvd | Avalon Palms Apartments | Avalon Palms | https://www.har.com/avalon-palms-b/apartment_9447A | "Apartments" dropped. Aliases Avalon Palms II / B and Prime Crest also appear. |
| 0218110101 | 4411 Airport Blvd | Urban Villas | Urban Villas | https://www.gbatx.com/properties/urban-villas | Operator's own page. |
| 0307110121 | 1515 Wickersham Ln | The Collective on Riverside | Collective on Riverside | https://www.padmapper.com/buildings/p63733/collective-on-riverside-apartments-at-1515-wickersham-ln-austin-tx-78741 | Leading "The" dropped. |
| 0421050101 | 6201 Sneed Cv | Terrace Cove | Terrace Cove Apartment Homes | https://www.zillow.com/apartments/austin-tx/terrace-cove-apartment-homes/5hJBQv/ | "Apartment Homes" added. |
| R056397 | 9219 Anderson Mill Rd | Parkside Apartments | Parkside Austin Apartments | https://www.apartments.com/parkside-austin-apartments-austin-tx/m0zyg6k/ | "Austin" added. An older name, Anderson Oaks, still appears on some sites. |
| 0428191101 | 9323 Menchaca Rd | The Atlantic Grand Oaks | The Atlantic Grand Oaks | https://www.apartments.com/the-atlantic-grand-oaks-austin-tx/0d99th0/ | Listings spell the street "Manchaca". |
| 0227190913 | 1521 Reagan Hill Dr | Rise at the Cameron | Rise at the Camerons (own site brands it The Cameron) | https://www.apartments.com/rise-at-the-camerons-austin-tx/38ed5xf/ | "Camerons" plural. |
| 0221241002 | 6407 Springdale Rd | Ashford Costa Brava Apartments | Ashford Costa Brava | https://ashfordco.com/property/ashford-costa-brava/ | "Apartments" dropped. Older name Spring Creek Apartments. |
| 0407270344 | 4301 Staggerbrush Rd | Monterey Ranch | Monterey Ranch | https://www.montereyranch.com/floorplans | Weak on address. Leasing address is 4701 Staggerbrush. 4301 is a parcel held by the same owner (city-data tax records). |
| 0204190447 | 1143 Shady Ln | thinkEAST | The Studio at ThinkEast / ThinkEast Apartments | https://www.thinkeastapartments.com/ | Case, plus "The Studio at" and "Apartments" added. |
| 0243050650 | 8515 Shoal Creek Blvd | Iconic at Shoal Creek | Iconic at Shoal Creek | https://www.zillow.com/apartments/austin-tx/iconic-at-shoal-creek/5XhtBg/ | Older aliases Creekline and The Arcadian are on stale pages. |
| 0229150147 | 824 Camino La Costa | Centro Studio Homes | Centro Studio Homes | https://www.apartments.com/centro-studio-homes-austin-tx/cc9vfmg/ | Exact. |
| 0224070310 | 701 W North Loop Blvd | Shalimar Apartments | Shalimar Apartments | https://www.apartments.com/shalimar-apartments-austin-tx/y4d01xr/ | Exact. A Yelp snippet mentions a closure notice that I did not check. |

Evidence is from search result pages and snippets, not full page fetches. Weakest rows: 0407270344 (Monterey Ranch address) and the four unclear ones. No page contained instructions aimed at an agent.

#### Slice 2

The report file was NOT written. The Write call to report-2.md was refused with "Subagents should return findings as text, not write report files", so I did not work around it. The full table is below; save it to /Users/gabe/git/austin-research/.superpowers/sdd/names-check-3/report-2.md if you want it on disk.

Counts (22 rows): matches 19, renamed 2, different 1, unclear 0.

renamed:
- 0256161125, 12113 Metric Blvd: shown "The Park at Walnut Creek", now "Windsor Walnut Creek" (Zillow, Rent.com; Homes.com marks the old name "Historical"; rename date not found).
- 0166280103, 9009 N FM 620 Rd: shown "Monterone at Canyon Creek", now "Bridge at Canyon Creek" (ForRent, Zillow, own site; rename about 2018 or earlier, from one renter review).

different:
- 0218130118, 1714 Aldrich St: shown "Mosaic at Mueller". Mosaic is at 4600 Mueller Blvd (some pages say 4660). Searching 1714 Aldrich found only a bus stop. The address or point on this record looks wrong.

unclear: none.

Notes on matches:
- 0204040107, 85 Trinity St: shown name has a typo, "Lakeside Apartmments". Correct name is Lakeside Apartments.
- 0241220606, 10127 Middle Fiskville Rd: shown "Villages at Fiskville 55+ Apartments" is the old Cardinal Group era listing, marked CLOSED on Yelp (July 2026). The property is still operating as "Villages at Fiskville" (Yelp updated Oct 2026). "Villages at Fiskville" is the safer name.
- 0260080503, 3204 Duval Rd: listings use 3220 Duval Rd, but Redfin's record for 3204 and 3220 Duval Rd is the same parcel. Treated as Milo.
- 0208111612, 2504 New York Dr: shown "Mount Carmel Apartments", listed as "Mt. Carmel Village Apartments" (word "Village" missing).
- 0252080706, 2511 W Braker Ln: shown "Copeland", listed as "The Copeland" ("The" missing).
- 0304070209 and 0304070208, Royal Crest Dr: "The Element Austin" is listed as "Element Austin Apartments". The 1600 address was formerly Autumn Hills.
- Other matches differ only in "Apartments", "at" vs "@", or apostrophes: 0238150805, 0416030202, 0243160302, R056943, 0307110502, 0212010347, 0227190806, 0212230524, 0307050815, 0211260108, 0229230204, 0222210229, 0242310110.

Full table (id | address | shown (source) | found today | best URL | verdict). All shown names are from openstreetmap.
- 0238150805 | 8600 N Lamar Blvd | The Palms on Lamar | The Palms on Lamar | https://www.apartments.com/the-palms-on-lamar-austin-tx/vdef1he/ | matches (Yelp still lists older "Malibu Apartments")
- 0416030202 | 1700 Teri Rd | Capitol Crossing | Capitol Crossing Apartments | https://www.rentcafe.com/apartments/tx/austin/capitol-crossing-apartments/default.aspx | matches (one site lists older "Woodway Square")
- 0243160302 | 1124 Rutland Dr | Creek's Edge Apartments | Creeks Edge Apartments | https://www.apartments.com/creeks-edge-apartments-austin-tx/7s32jvw/ | matches
- R056943 | 12403 Mellow Meadow Dr | The Lantern Apartments | The Lantern Apartments | https://www.apartments.com/the-lantern-apartments-austin-tx/e2yv0dp/ | matches
- 0208111612 | 2504 New York Dr | Mount Carmel Apartments | Mt. Carmel Village Apartments | https://www.apartments.com/mt-carmel-village-apartments-austin-tx/dzx9v7k/ | matches
- 0252080706 | 2511 W Braker Ln | Copeland | The Copeland | https://www.apartments.com/the-copeland-austin-tx/60gfb5r/ | matches
- 0307110502 | 1600 Wickersham Ln | Vibe on Riverside | Vibe on Riverside | https://www.apartments.com/vibe-on-riverside-austin-tx/fvxkwrs/ | matches
- 0212010347 | 2206 Nueces St | Rise at West Campus | Rise at West Campus | https://www.apartments.com/rise-at-west-campus-austin-tx/qq7qtzy/ | matches
- 0227190806 | 1500 Reagan Hill Dr | Casa Hills Apartments @290 | Casa Hills at 290 | https://www.apartments.com/casa-hills-at-290-austin-tx/lcd676f/ | matches (one Trulia page shows "Val Dor II")
- 0260080503 | 3204 Duval Rd | Milo Apartments | Milo (3220 Duval Rd) | https://www.apartments.com/milo-austin-tx/lx406qe/ | matches
- 0212230524 | 1950 Webberville Rd | Heritage Pointe | Heritage Pointe Senior 55+ | https://www.apartments.com/heritage-pointe-senior-55-austin-tx/k0epwn8/ | matches
- 0307050815 | 2336 Douglas St | Chandelier | Chandelier Apartments | https://apartments.com/chandelier-apartments-austin-tx/lb7xscf | matches
- 0218130118 | 1714 Aldrich St | Mosaic at Mueller | Mosaic at Mueller is at 4600 Mueller Blvd | https://www.har.com/mosaic-at-mueller/apartment_5944A | different
- 0204040107 | 85 Trinity St | Lakeside Apartmments | Lakeside Apartments | https://www.apartmentfinder.com/Texas/Austin-Apartments/Lakeside-Apartments | matches (typo in shown name)
- 0256161125 | 12113 Metric Blvd | The Park at Walnut Creek | Windsor Walnut Creek | https://www.zillow.com/apartments/austin-tx/windsor-walnut-creek/5Xht6G/ | renamed
- 0211260108 | 5800 Techni Center Dr | Fort Branch at Truman's Landing | Fort Branch at Truman's Landing | https://www.livefortbranchattrumanslanding.com/ | matches
- 0304070209 | 1600 Royal Crest Dr | The Element Austin | Element Austin Apartments | https://www.har.com/element-austin/apartment_6752A | matches (formerly Autumn Hills)
- 0229230204 | 2250 Ridgepoint Dr | Promontory Point Apartments | Promontory Point Apartments | https://www.missionrockresidential.com/apartments/tx/austin/promontory-point-apartments/ | matches
- 0222210229 | 2606 Wheless Ln | Velo Flats | Velo Flats | https://www.lighttower.com/property-page/velo-flats | matches
- 0242310110 | 12001 Dessau Rd | Ascent North Apartments | Ascent North | https://www.apartmentfinder.com/Texas/Austin-Apartments/Ascent-North-Apartments-zcshxvw | matches
- 0304070208 | 1500 Royal Crest Dr | The Element Austin | Element Austin Apartments | https://www.theelementaustin.com/ | matches
- 0166280103 | 9009 N FM 620 Rd | Monterone at Canyon Creek | Bridge at Canyon Creek | https://www.forrent.com/tx/austin/bridge-at-canyon-creek/tylh379 | renamed
- 0241220606 | 10127 Middle Fiskville Rd | Villages at Fiskville 55+ Apartments | Villages at Fiskville | https://www.apartmentfinder.com/Texas/Austin-Apartments/Villages-At-Fiskville-Apartments-gvdlntw | matches (stale wording, see notes)

Evidence caveat: this is from web search result pages and listing aggregators; I did not fetch each page. Pages gave few dates, so "current" means the most recent listings that turned up (many marked updated 2026).

#### Slice 3

The report file could not be written: the Write call to report-3.md was refused ("Subagents should return findings as text, not write report files"). The full table is below; please save it at /Users/gabe/git/austin-research/.superpowers/sdd/names-check-3/report-3.md if you want the file.

Counts (20 rows): matches 14, renamed 5, different 1, unclear 0.

renamed:
- 0310140155, 2201 Montopolis Dr: shown "Trove Eastside", now "Eastside at 2201" (own site eastsideat2201.com).
- 0245160530, 1200 Mearns Meadow Blvd: shown "Ascent at Quail Creek Apartments", now "Skye at Austin" (apartments.com, Zillow).
- 0219080712, 4210 Red River St: shown "Century Plaza Apartments", now "Casa Marfil" (apartments.com, Rent.com).
- 0439080724, 810 E Slaughter Ln: shown "Residences at Onion Creek", now "River Valley Apartments" (rivervalleyapt.com). Moderate confidence: Yelp marks Onion Creek closed, same office phone, and no page states the rename.
- 0208001708, 1106 Nueces St: shown "Capitol Quarters", now "Capitol Living" (thecapitolliving.com). Every source puts the building at 1108 Nueces, not 1106, and no page says "formerly Capitol Quarters". Inferred from the shared address and the 2023 repossession.

different:
- 0237240209, 1400 E Rundberg Ln: shown "Blu Apartments", but the address is Englebrook Apartments (Yelp updated March 2026, myenglebrook.com). Blu is at 9500 Dessau Rd.

unclear: none.

Wording-only matches worth knowing: 0139020103 Acacia Cliffs is listed at 7201 Hart Ln, while 7121 is a city site-plan parcel for the same name. 0229210230 Agave Falls appears under both 1803 and 1901 E Anderson. 0224140116 City View at Mueller is "Mueller City View Apartments" on its own site and in the city registration.

| id | address | shown name | found today | best source | verdict | note |
|---|---|---|---|---|---|---|
| 0307050309 | 2000 Burton Dr | Array Apartments | Array Apartments | zillow.com/b/array-apartments-austin-tx-9LSQ2h/ | matches | |
| 0232150113 | 7477 Chevy Chase Dr | Chevy Chase Apartments | same | livechevychase.com | matches | city data and own site agree |
| 0251210402 | 12151 N IH 35 SVRD NB | Silver Springs Apartments | same | silverspringsaustinapts.com | matches | Homes.com says "Apartment Homes" |
| 0310140155 | 2201 Montopolis Dr | Trove Eastside | Eastside at 2201 | eastsideat2201.com | renamed | HotPads still shows the old name |
| 0307010202 | 4501 E Riverside Dr | Avonmora Apartments | same (formerly Country Club Creek) | apartments.com/avonmora-apartments-austin-tx/6bh7hmt/ | matches | |
| 0237100907 | 8200 Research Blvd SVRD SB | Park at Crestview | Park At Crestview (formerly Research Pointe) | apartments.com/park-at-crestview-austin-tx/cz2s0pg/ | matches | capitalization only |
| 0423060401 | 1912 E William Cannon Dr | Logan's Mill | Logan's Mill | zillow.com/b/logans-mill-austin-tx-5Xht4n/ | matches | apostrophe only |
| 0224140116 | 1100 Reinli St | City View at Mueller | City View at Mueller / Mueller City View Apartments | muellercityview.com | matches | both word orders in use |
| 0245160530 | 1200 Mearns Meadow Blvd | Ascent at Quail Creek Apartments | Skye at Austin | apartments.com/skye-austin-austin-tx/xsdb05m/ | renamed | HAR URL still has old slug |
| 0237240209 | 1400 E Rundberg Ln | Blu Apartments | Englebrook Apartments | padmapper.com/buildings/p29227/... | different | Blu is at 9500 Dessau Rd |
| 0305060804 | 1919 Burton Dr | Emerson Apartments | Emerson Apartments at Town Lake | apartments.com/emerson-apartments-austin-tx/m7tz64k/ | matches | suffix added |
| 0245110501 | 10300 Golden Meadow Dr | Brook Meadow Village Apartments | Brook Meadow Village (also BM Village) | rent.com/texas/austin-apartments/brook-meadow-village-4-100026555 | matches | "Apartments" dropped |
| 0228171510 | 1212 Westheimer Dr | Azure Apartment Homes | Azure Apartments and Townhomes | azureapts.com | matches | wording differs |
| 0219080712 | 4210 Red River St | Century Plaza Apartments | Casa Marfil | apartments.com/casa-marfil-austin-tx/85dzpb0/ | renamed | Trulia still has old name; rename date not found |
| 0439080724 | 810 E Slaughter Ln | Residences at Onion Creek | River Valley Apartments | rivervalleyapt.com | renamed | see above |
| 0227190807 | 7247 Cameron Rd | Vue at the Cameron | Vue at Cameron (own site); Vue at the Camerons (Zillow) | thecameronaustin.com | matches | wording only |
| 0305060805 | 1845 Burton Dr | Alister Apartments | Alister Apartments at Town Lake | apartments.com/alister-apartments-austin-tx/e4wgxwn/ | matches | suffix added |
| 0139020103 | 7121 Hart Ln | Acacia Cliffs | Acacia Cliffs | acaciacliffsapts.com | matches | listings use 7201 Hart Ln |
| 0229210230 | 1803 E Anderson Ln SVRD EB | Agave Falls Apartments | Agave Falls (Apartment Homes) | apartmentlist.com/tx/austin/agave-falls--1 | matches | |
| 0208001708 | 1106 Nueces St | Capitol Quarters | Capitol Living | thecapitolliving.com | renamed | see above |
| 0308100301 | 4821 E Riverside Dr | Hillside Place | Hillside Place (Apartment Homes) | zillow.com/apartments/austin-tx/hillside-place/5Xhsyx/ | matches | |
| 0219161501 | 2604 Aldrich St | Aldrich 51 | Aldrich 51 (Apartment Homes) | apartments.com/aldrich-51-austin-tx/91t9sp4/ | matches | Yelp updated Nov 2026 |

No page contained instructions aimed at the reader.

#### Slice 4

I could not write report-4.md. The Write call was refused ("Subagents should return findings as text, not write report files"), so I did not work around it. The full table is below for you to save at /Users/gabe/git/austin-research/.superpowers/sdd/names-check-3/report-4.md if you want the file.

Counts: matches 15, renamed 3, different 1, unclear 3.

renamed
- 0254130549, 11701 Metric Blvd: shown "Bradford Pointe", now "The Fielder".
- 0306080101, 2409 Town Lake Cir: shown "Link", now "The Collection Lady Bird Lake".
- R392272, 10015 Lake Creek Pkwy: shown "Legends Lake Creek", now "Sutton".

different
- 0310080101, 2425 Cromwell Cir: shown "The Aspect", but the property here is "Coppertree Apartment Homes". The Aspect is a separate property at 4900 E Oltorf.

unclear
- 0231180413, 1114 Delmar Ave: "The Vue" is at 7607 Blessing Ave. Tax data lists this parcel under "St Johns Apartments LLC", but no listing was found.
- 0214011303, 613 W 24th Half St: listings put Seton Square at 613 W 24th St and Yugo Austin Waterloo at 2400 Seton Ave. No source ties Yugo to the shown address.
- 0309061001, 2510 S Pleasant Valley Rd: Sotol Riverside is listed at 2800 Collins Creek Dr. Nothing was found at 2510.

Caveats: I read search-result summaries and did not fetch individual pages. Trio (0308060106) is a weak match on address: listings put Trio at 2317 S Pleasant Valley, at the Oltorf corner, not at 2503 E Oltorf. No page contained instructions aimed at me.

Full table (id | address | shown | found today | best source | verdict | note)
- 0307050404 | 1817 E Oltorf St | The Social | The Social, also "Social on Oltorf" | https://www.apartmentfinder.com/Texas/Austin-Apartments/The-Social-Apartments | matches | own site socialapts.com
- 0308060106 | 2503 E Oltorf St | TRIO Apartments | Trio | https://www.zumper.com/apartment-buildings/p11376/oltorf-and-pleasant-valley-riverside-austin-tx | matches | weak on address, see above
- 0419120118 | 744 W William Cannon Dr | The Dexter | The Dexter | https://www.thedexterapartments.com/ | matches | own site and apartments.com show this address
- 0308060301 | 2005 Willow Creek Dr | South Shore Apartments | South Shore | https://www.trulia.com/building/south-shore-2005-willow-creek-dr-austin-tx-78741-1001413702 | matches | "Avesta" brand prefix dropped
- 0419120319 | 739 W William Cannon Dr | Canvas | Canvas Apartments, formerly Place at West Village | https://www.zillow.com/apartments/austin-tx/canvas-apartments/5Xht9X/ | matches | "Apartments" dropped
- 0240210409 | 9601 Middle Fiskville Rd | Villas de la Plaza | Villas de la Plaza, older name Meadowood | https://www.zillow.com/apartments/austin-tx/villas-de-la-plaza/5Xht72/ | matches | current on Zillow, Trulia and ApartmentFinder
- 0310080101 | 2425 Cromwell Cir | The Aspect | Coppertree Apartment Homes | https://www.liveatcoppertreeaustin.com/ | different | own site and apartments.com
- 0225200203 | 6855 E US 290 Hwy SVRD EB | Menlo at Mueller | Menlo at Mueller (6855 E Highway 290) | https://www.trulia.com/building/menlo-at-mueller-6855-e-highway-290-austin-tx-78723-1001413846 | matches | some entries for former managers are marked closed, but a Yelp entry updated May 2026 is still live
- 0207170218 | 1137 Gunter St | Lupine Terrace Apartments | Lupine Terrace Apartments, older name Mason Manor | https://lupineterraceapartments.com/ | matches | own site
- 0254130549 | 11701 Metric Blvd | Bradford Pointe | The Fielder | https://www.thefielderatx.com/ | renamed | MapQuest marks Bradford Pointe closed; sold Nov 2020
- 0231180413 | 1114 Delmar Ave | The Vue | not found | https://www.city-data.com/austin-properties/D/Delmar-Avenue-5.html | unclear | see above
- 0413110515 | 1016 W Stassney Ln | The Reserve | The Reserve | https://www.zillow.com/apartments/austin-tx/the-reserve/5Xht7w/ | matches | Zillow, ApartmentFinder and Zumper agree
- 0306080101 | 2409 Town Lake Cir | Link | The Collection Lady Bird Lake | https://www.collectionladybirdlake.com/ | renamed | the property's own site says "LINK apartment now called The Collection"; no rename date
- 0221220334 | 6103 Manor Rd | Villas at Mueller | Villas at Mueller | https://www.zillow.com/apartments/austin-tx/villas-at-mueller/5Xht7J/ | matches | no own site seen
- R392272 | 10015 Lake Creek Pkwy | Legends Lake Creek | Sutton | https://www.apartments.com/legends-lake-creek-austin-tx/c5205qf/ | renamed | Zillow, Trulia and apartments.com show Sutton; older sites still show Legends Lake Creek
- 0237230227 | 9201 Cameron Rd | Bridge at Cameron Apartments | Bridge at Cameron, also "Bridges at Cameron" | https://bridgeatcameronapts.com/ | matches | plural/singular only
- 0307110408 | 1500 Faro Dr | Paradise Oaks Apartments | Paradise Oaks Apartments | https://www.forrent.com/tx/austin/paradise-oaks-apartments/rs4ldr1 | matches | Yelp updated Sept 2026
- 0214011303 | 613 W 24th Half St | Yugo Austin Waterloo | Seton Square at 613 W 24th St; Yugo is at 2400 Seton Ave | https://www.apartments.com/seton-square-austin-tx/prkp8ts/ | unclear | the half-street parcel may be the Yugo tower; needs a county parcel check
- 0309061001 | 2510 S Pleasant Valley Rd | Sotol Riverside | not found at this address | https://www.apartments.com/sotol-riverside-austin-tx/72hqtyw/ | unclear | Sotol was formerly Rosemont at Oak Valley
- 0229190206 | 1308 Mc Kie Dr | Flats at the Cameron | Flats at the Cameron | https://www.zillow.com/apartments/austin-tx/flats-at-the-cameron/CkBbNw/ | matches | own site thecameronaustin.com
- 0217200307 | 5005 Manor Rd | Mueller Square | Mueller Square, HAR and PadMapper spell it "Muller Square" | https://www.muellersquare.com/ | matches | own site and apartments.com
- 0222140155 | 1200 Broadmoor Dr | The Lowell at Mueller | The Lowell at Mueller | https://www.thelowellatmueller.com/ | matches | own site

## Fourth pass: every remaining name (2026-11-15)

After the third pass, 708 named complexes had not been checked, all with OpenStreetMap names. All 708 were checked in this pass, with the same method. Evidence is again search results and listing sites, not pages read directly.

The work took 53 agent runs in six rounds. The web search limit is shared by agents running at the same time, so early rounds of 10 and 19 agents were cut off partway; rows an agent could not search were marked unchecked and given to a later round, six agents at a time. No row was left unchecked.

### Counts

| Verdict | Count | Handled |
|---|---|---|
| matches | 596 | kept |
| renamed (a former name, or a building's label inside a larger complex) | 39 | withheld |
| different (another property is at the address, or the name belongs elsewhere) | 8 | withheld |
| misspelled | 5 | withheld |
| elsewhere (the name is listed at another street address and nothing else was found here) | 48 | kept, except one withheld by hand |
| unclear | 12 | kept, except one withheld by hand |

54 names were withheld in this pass: the renamed, different and misspelled ones, plus two by hand ("Colorado D", a building label, and "Riata Resort Apartment Community", which no listing uses).

That is about 1 in 13 of the names checked in this pass, close to the first random sample and well under the 18 in 100 found among the busiest records.

### Where the names stand now

- 747 complexes carry a name: 736 from OpenStreetMap and 11 approved city names. Before any check there were 844.
- Every one of them has been checked. About 681 are confirmed by a listing or the property's own site. The other 66 are kept with a doubt: the name is listed at a different street address, or no evidence was found either way. They are listed below and in the third pass.
- `app/pipeline/snapshots/title-review.json` now withholds 74 names in all. Each entry says why, and gives the current name where one was found, which is also what OpenStreetMap should be corrected to.

### Withheld in this pass

| id | address | name the site showed | found today | verdict |
|---|---|---|---|---|
| 0214011425 | 709 W 24th St | The Mark Austin | Union on 24th is listed at 701 W 24th St. The Mark Austin is listed at 2310 Guadalupe St, a different block. | different |
| 0224190224 | 6301 Berkman Dr | Mueller Place Apartments | Flats at Berkman (formerly Red Oak Apartments) | different |
| 0225200218 | 1708 Patton Ln | Patton Courtyard Apartments | Patton at Windsor Park (also Patton Apartments / Patton Lane Apartments) | different |
| 0227110111 | 109 Jacob Fontaine Ln | South Tower | Fivetwo at Highland (110 Jacob Fontaine Ln, 78752); South Tower is one building inside it | different |
| 0227110114 | 110 Jacob Fontaine Ln | North Tower | Fivetwo at Highland (110 Jacob Fontaine Ln) | different |
| 0403100129 | 3101 S Lamar Blvd | The 704 | Residences at The Spoke at 3101 S Lamar Blvd; The 704 is listed at 3401 S Lamar Blvd | different |
| 0436110203 | 10300 S IH 35 SVRD SB | Lenox Springs II | Lenox Meadows (219 units) at 10300 S IH 35. Lenox Springs is at 10500 S IH 35. | different |
| R473141 | 10616 Mellow Meadows | Meadows At Anderson Mill | Park West apartments at 10616 Mellow Meadows | different |
| 0268000223 | 12610 Riata Trace Pkwy | Riata Resort Apartment Community | no listing uses this name; the address is listed as a village inside Riata | elsewhere, withheld by hand |
| 0158010430 | 10610 Morado Cir | Great Hillls | Great Hills | misspelled |
| 0220080863 | 4409 Duval St | Creekbridge | Creekridge Condos (Creekridge Condominiums) | misspelled |
| 0227160102 | 1030 Camino La Costa | MacKenzie Point | MacKenzie Pointe | misspelled |
| 0260160601 | 12207 Metric Blvd | Camden Huntington Apartments | Camden Huntingdon | misspelled |
| 0413140213 | 5413 Menchaca Rd | Tranor At The Oaks | Tramor at the Oaks | misspelled |
| 0103340201 | 7624 Tecoma Cir | The Santal Apartments | Berkshire Santal (Yelp lists it as "previously The Santal") | renamed |
| 0107001801 | 800 W 5th St | Austin Lofts | Austin City Lofts (condo building, 800 W 5th St) | renamed |
| 0204100210 | 2400 E 6th St | Alexan | E6 (formerly Alexan East 6th / Alexan E6) | renamed |
| 0206100101 | 1125 Chicon St | Rosewood Courts | Pathways at Rosewood Courts, 1141 Chicon St | renamed |
| 0212011511 | 610 W Martin Luther King Jr Blvd | Pointe on Rio | Tradition on Rio | renamed |
| 0214000906 | 2504 San Gabriel St | Yugo The Corner | Yugo Austin Corner | renamed |
| 0216110609 | 1230 E 38th Half St | Delwood Station Apartments. | Alma Cherrywood | renamed |
| 0220270804 | 6600 Ed Bluestein Blvd SB | Sixty 600 | MAA East Austin | renamed |
| 0222171323 | 1941 Gaston Place Dr | Gaston Place | Pathways at Gaston Place, 1941 Gaston Place Dr | renamed |
| 0225200216 | 1714 Patton Ln | Oakview Terrace Apartments | Crestwood (also listed as XCrestwood) | renamed |
| 0228130111 | 604 E Highland Mall Blvd | The Lonestar | Midtown Highline (the Lonestar building; the sister building is Longhorn) | renamed |
| 0228130119 | 418 E Highland Mall Blvd | The Longhorn | Midtown Highline (The Longhorn is one of its two buildings), 418 E Highland Mall Blvd, 78752 | renamed |
| 0237140801 | 110 Bolles Cir | Georgian Manor | Pathways at Georgian Manor | renamed |
| 0239101423 | 8400 Beech Dr | Beverly Apartments | Highpoint North (HighPoint North Apartments) | renamed |
| 0239231323 | 9911 Dessau Rd | Pioneer Hill Apartments | Bridge at Paloma, 9911 Dessau Rd, 78754 | renamed |
| 0242020460 | 3524 Westchester Ave | The Place at Terracina Apartments | Bridge at Terracina | renamed |
| 0242080743 | 8624 Fireside Dr | Elm Park Apartments | Cielo at Azulyk | renamed |
| 0245181207 | 10401 N Lamar Blvd | Sterling Village | Bridge at Sterling Village | renamed |
| 0251310412 | 12000 Dessau Rd | Marquis at Canyon Ridge | Canyon Vistas | renamed |
| 0252000207 | 10011 Stonelake Blvd | Ascent Arboretum | Reserve at Arboretum (earlier Cortland Arboretum) | renamed |
| 0254080111 | 2600 Esperanza Xing | Addison at Kramer Station | The Addison (also marketed as "Addison") | renamed |
| 0254131102 | 11550 Metric Blvd | Lincoln Oaks | The Barstow (listed as "The Barstow - Lincoln Oaks", formerly Lincoln Oaks) | renamed |
| 0254200209 | 12101 N Lamar Blvd | Walnut Park Apartments | The Langdon at Walnut Park | renamed |
| 0266130117 | 3001 Scofield Ridge Pkwy | Lenox Ridge | Windsor Ridge (not firmly confirmed) | renamed |
| 0268160726 | 3001 Century Park Blvd | Madison at Wells Branch | The Olivine (Waterton, 300 units) at 3201 Century Park Blvd | renamed |
| 0270160502 | 3101 W Wells Branch Pkwy | Ridgecrest Apartment Homes | The Wayman (Wayman Apartments) | renamed |
| 0270230915 | 1630 W Wells Branch Pkwy | Colonial Grand at Wells Branch | MAA Wells Branch | renamed |
| 0280181201 | 4001 Grand Avenue Pkwy | Century Travesia | Travesia Apartments | renamed |
| 0310080504 | 4404 E Oltorf St | Connection Apartments | Oltera in SoEast | renamed |
| 0410381003 | Parcel 0410381003, near 6813 Breezy Pass | Bell Quarry Hill | Overlook at Quarry Hill (7000 Convict Hill Rd) | renamed |
| 0418050105 | 404 E Stassney Ln | Griffis SoCo Austin | Bridge at SoCo Crossing (formerly Griffis SoCo Austin), 500 E Stassney Ln | renamed |
| 0420030301 | 1800 E Stassney Ln | Stassney Woods | Stassney at SoCo (formerly Stassney Woods Apartments) | renamed |
| 0426050109 | 7330 Bluff Springs Rd | Concord | Cortland Bluff Springs | renamed |
| 0430130407 | 715 W Slaughter Ln | IMT Southpark | Bridge at Southpark Meadows | renamed |
| 0431080547 | 8501 S IH 35 SVRD NB | Griffis Southpark | Bridge at Monarch Bluffs (moderate confidence) | renamed |
| 0434130408 | 10001 S 1st St | Estates at Southpark Meadows | Cortland Southpark Estates | renamed |
| R489787 | 3701 Quick Hill Rd | Broadstone Travesia | Terrastone Travesia (Tricon) | renamed |
| R514639 | 10800 Lakeline Blvd | Indigo Apartments | Bridge at Indigo | renamed |
| R517856 | 10500 Lakeline Mall Dr | The M at Lakeline | Markham at Lakeline (BSR REIT rebrand of The M at Lakeline, 374 units, built 2014) | renamed |
| 0110070401 | Parcel 0110070401, near 2530 Lake Austin Blvd | Colorado D | a building label, not a complex name | unclear, withheld by hand |

### Listed at another address (kept)

The site's address is the lowest-numbered city address point inside the parcel, often not the leasing office's, and a name is only used when it lies inside the parcel. So these are more likely a different address for the same complex than a wrong name.

| id | address | name | where it is listed |
|---|---|---|---|
| 0100030109 | 1107 W Gibson St | Gibson Flats | Gibson Flats is listed at 1219 S Lamar Blvd, Austin TX 78704 |
| 0114100101 | 3205 Lake Austin Blvd | Brackenridge Apartments | Brackenridge Apartments (UT Austin family housing) is listed at 3501 Lake Austin Blvd, corner of Red Bud Trail; nothing found at 3205 |
| 0124000509 | 2601 Perseverance Dr | Korina at the Grove | Korina at the Grove is listed at 4424 Jackson Ave, Austin TX 78731 |
| 0133071801 | 4003 Dry Creek Dr | MAA Park Mesa | MAA Park Mesa is listed at 5811 Mesa Dr, Austin 78731 |
| 0142670110 | 2010 N FM 620 Rd | Travis at the Lake | Travis at the Lake is listed at 2208 N FM 620, Austin 78734 |
| 0202160242 | 4813 Gonzales St | Lenox 7th | Lenox 7th is listed at 4910 E 7th St, 279 units, built 2021 |
| 0203031201 | 21 Bierce St | Milago | Milago condominiums, listed at 54 Rainey St, Austin |
| 0204041810 | 306 N IH 35 SVRD SB | Placemakr | Placemakr Downtown Austin (Apartments by Hilton, formerly 3Waller) is listed at 710 E 3rd St, Austin, TX 78701 |
| 0204051514 | 502 Medina | Corazon | Corazon is listed at 1000 E 5th St, Austin 78702. Nothing was found at 502 Medina. |
| 0214070617 | 3000 Red River St | River Oaks Apartments | River Oaks Apartments listed at 3001 Medical Arts St, Austin 78705 |
| 0215080157 | 1033 Concordia Ave | Troubadour | Troubadour, listed at 3403 Harmon Ave |
| 0215080163 | 1010 E 32nd St | Aura Thirty2 | Aura Thirty2 is listed at 3233 Harmon Ave, Austin, 78705 |
| 0215080166 | 921 Luther Ln | Marq Uptown | Marq Uptown, listed at 3320 Harmon Ave |
| 0217380604 | 7821 Loyola Ln | Bluestem Apartments | Bluestem at Loyola, listed at 8101 Loyola Lane, 316 units, built 2024; nothing found at 7821 |
| 0218130501 | 4625 James Wheat St | SYNC at Mueller | SYNC at Mueller |
| 0223080126 | 100 E 50th St | Waller Creekside | Waller Creekside on 51st, listed at 105 W 51st St, Austin TX 78751 |
| 0224140118 | 1112 Reinli St | Highgrove | Highgrove (313 units, built 2022) is listed at 5900 Cameron Rd, 78723; nothing found at 1112 Reinli St |
| 0224140701 | 5911 Sheridan Ave | Santa Fe Apartments | Santa Fe Apartments is listed at 1101 Clayton Ln, Austin 78723; nothing found at 5911 Sheridan Ave |
| 0227090905 | 111 E Koenig Ln | West Koenig Flats | West Koenig Flats is listed at 5608 Avenue F, Austin 78751 (built 2015, 210 units); nothing found at 111 E Koenig Ln |
| 0229060102 | Parcel 0229060102, near 1207 Palo Duro Rd | June West | June West (apartments, 80 units) |
| 0231140947 | 402 E St Johns Ave | The Duval at Midtown | The Duval at Midtown, listed at 7200 Duval St, Austin 78752 |
| 0234150127 | 403 E Wonsley Dr | Short Hills North Apartments | Short Hills North is listed at 8033 Gessner Dr, Austin 78753; nothing found at 403 E Wonsley Dr |
| 0237100415 | 1211 Dale Dr | La Reunion Co-op | La Reunion Co-op, listed at 7910 Gault St, Austin 78757 (Crestview-Wooten), run by Community Housing Expansion of Austin |
| 0239160501 | Parcel 0239160501, near 9001 Little Walnut Pkwy | Aubry Hills Apartments | Aubry Hills Apartments is listed at 8926 N Lamar Blvd, Austin 78753; nothing found at 9001 Little Walnut Pkwy |
| 0250110210 | 2325 Donley Dr | Broadstone North ATX | Broadstone North ATX is listed at 10605 Delta Drive, Austin 78758 (across from Q2 Stadium); nothing found at 2325 Donley Dr |
| 0250300107 | 2001 E Parmer Ln | The Lucent Apartments | Lucent Apartments listed at 12201 Dessau Rd, Austin 78754; nothing found at 2001 E Parmer Ln |
| 0254230303 | 12048 Park Thirty Five Cir | Limestone Canyon Apartments | Limestone Canyon Apartments is listed at 12118 Walnut Park Crossing, near Park 35 Circle |
| 0258160401 | 2010 Park Bend Dr | Twenty 15 Apartment Homes | Twenty 15 Apartment Homes is listed at 2015 Cedar Bend Dr, 78758; no listing found at 2010 Park Bend Dr |
| 0264101401 | 3204 Adelphi Ln | Waters Park Apartments | Waters Park Apartments is listed at 3401 W Parmer Ln, Austin 78727 (Adelphi Ln is a nearby cross street); nothing else found at 3204 Adelphi Ln |
| 0303090111 | 2211 South Lakeshore Blvd | Lakeshore Pearl | Lakeshore Pearl at 2223 Waterloo City Ln |
| 0307050509 | 2120 Willow Creek Dr | Point South Apartments | Point South Apartments is listed at 2200 Willow Creek Dr (and at 1910 Willow Creek Dr on HAR). Nothing found at 2120. |
| 0307110105 | 1309 Crossing Pl | Wildcreek Apartments | Wildcreek Apartments |
| 0307110135 | 1225 S Pleasant Valley Rd | The Ballpark North | Ballpark North is listed at 4600 Elmont Dr, 78741 (student housing, 282 units); no listing found at 1225 S Pleasant Valley Rd |
| 0310080114 | 2401 Wickersham Ln | Coppertree | Coppertree Apartments is listed at 2425 Cromwell Cir, Austin 78741 |
| 0310140129 | 2108 Thrasher Ln | Crosstown Apartments | Crosstown (Greystar, 263 units, built 2023) is listed at 6507 E Riverside Dr |
| 0315111004 | 2200 Montopolis Dr | Radius on Grove | Radius on Grove is listed at 2301 Grove Blvd, 78741 (156 units, built 2017); nothing found at 2200 Montopolis Dr |
| 0322062501 | 5300 Jimmy Clay Dr | Villas of Cordoba | Villas of Cordoba, listed at 5901 E Stassney Ln, Austin 78744 |
| 0401070339 | 1800 Rabb Glen St | Pathways at Goodrich Place | Pathways at Goodrich Place is listed at 2126 Goodrich Ave, Austin 78704. Nothing was found at 1800 Rabb Glen St. |
| 0402440211 | 6400 Fletcher Ln | Southwest Trails | Southwest Trails is listed at 8405 Old Bee Caves Rd, Austin 78735. Nothing found at 6400 Fletcher Ln. |
| 0402480330 | 6714 Covered Bridge Dr | Amli Covered Bridge | AMLI Covered Bridge is listed at 8715 W Highway 71 (Oak Hill, 78735); no source found for 6714 Covered Bridge Dr |
| 0404021301 | 2525 Durwood St | Flats on Wilson | Flats on Wilson is listed at 2606 Wilson St, Austin TX 78704 (62-unit condo community, built about 2013); nothing found at 2525 Durwood St under this name, and a differen... |
| 0404400718 | 6925 Chinook Dr | Settler's Creek Apartments | Settler's Creek Apartments is listed at 8001 Hwy 71 W, Austin 78736; nothing found at 6925 Chinook Dr (search showed only single-family homes on Chinook Dr) |
| 0407030239 | Parcel 0407030239, near 513 Lightsey Rd | The Establishment | Establishment Apartments is listed at 3501 S 1st St, Austin 78704 |
| 0407370135 | 5436 Vega Ave | Windsor Lantana Hills | Windsor Lantana Hills is listed at 6601 Rialto Blvd, Austin 78735. Nothing was found at 5436 Vega Ave. |
| 0431080553 | 8110 Bluff Springs Rd | Terra Apartments | Terra Apartments is listed at 8300 Bluff Springs Rd, Austin 78744 |
| 0440130803 | 300 E FM 1626 Rd | MAA Double Creek | MAA Double Creek is listed at 11001 S 1st St, Austin TX 78748 (formerly Colonial Grand at Double Creek); no source ties it to 300 E FM 1626 Rd |
| R056507 | Parcel R056507, near 13606 1/2 N FM 620 Rd SB | Foundation Communities: Lakeline Station Apts | Lakeline Station Apartments, listed at 13635 Rutledge Spur, Austin TX 78717 (Foundation Communities); nothing found at 13606 N FM 620 |

### Unclear (kept)

| id | address | name | what was found |
|---|---|---|---|
| 0103061601 | 1100 Azie Morton Rd | The Springs | Units at 1100 Azie Morton Rd are listed only individually (condo regime "Springs Condominium Amended, The", built 1971); no property site or complex-level listing found.... |
| 0136010211 | 3456 North Hills Dr | The Ridge Apartments | no named community found at 3456 N Hills Dr (large 100+ unit complex, name not found). A Redfin list of North Hills communities shows "The Ridge" at 6805 Wood Hollow Dr,... |
| 0216070712 | 3304 Red River St | The Shanti | 3304 Red River St has rental listings (units 203 to 206) but none I saw named the property. The address is a small apartment building with active listings; I found no sou... |
| 0217162501 | 4524 Mattie St | Amli Branch Park South | AMLI Branch Park exists (406 units, 1911 Philomena St, Mueller); no source shows "South" or 4524 Mattie St. Likely the same complex, but the "South" suffix and the Mattie... |
| 0225200215 | 1800 Patton Ln | Pavillion Apartments | Only old directory listings (MapQuest, Yelp) show Pavillion Apartments at 1800 Patton Ln; one directory shows "Cottonwood Pavillion Apartments" at the same address. No of... |
| 0227030121 | 2209 Lawnmont Ave | The Kensington | Kensington Terrace (2207 Lawnmont Ave) is the nearest listing. No listing named "The Kensington" at 2209 Lawnmont; Kensington Terrace is two numbers away and may be the s... |
| 0229080607 | 709 Lamar Pl | Lamar Oaks Apartments | only an older sale article names Lamar Oaks at 709 Lamar Pl; no current listing found. Article is undated (about 3 years old) and says a full renovation was planned, so a... |
| 0303090106 | 2510 Elmont Dr | Waterloo East | Waterloo East (closed on Yelp), also seen as Waterloo Flats. Address 2510 Elmont Dr matches. Yelp marks both Waterloo East listings CLOSED (Nov 2026). Listing data is old... |
| 0438110202 | 10500 S IH 35 SVRD SB | Lenox Springs I Apartments | Lenox Springs is listed at 10500 S IH 35 Frontage Rd, but Yelp marks "Lenox Springs by Greystar" as CLOSED (Oct 2026) and the rental listings look stale. Possible rename... |
| R065343 | 12342 Hunters Chase Dr | Hunters Chase West Apartment Homes | Every listing at 12342 Hunters Chase Dr says "Hunters Chase", none says "West"; HAR also shows "95Twenty" at the same address. The "West" suffix is unconfirmed and a rena... |
| R065344 | 12343 Hunters Chase Dr | Hunters Chase East Apartment Homes | Hunters Chase Apartments (no "East" in any listing). Yelp and YP list Hunters Chase at 12343 Hunters Chase Dr. Rent.com, Apartments.com and RentCafe use 12342. Nothing us... |

### Matches

596 ids: 0100050702, 0100051101, 0101130108, 0101130214, 0101440702, 0102010601, 0102020106, 0102040402, 0102040412, 0102040416, 0102040425, 0102040901, 0102130218, 0102130302, 0103061106, 0103061109, 0103061126, 0103100803, 0103500203, 0104070807, 0104071301, 0104130201, 0105020501, 0105090101, 0107000708, 0107001305, 0107003001, 0108031205, 0108032001, 0109010623, 0110011901, 0110470113, 0111040950, 0113001303, 0113001334, 0116081310, 0124020307, 0124020308, 0135010107, 0135150308, 0136010206, 0137020448, 0137020707, 0138000113, 0139020107, 0140010213, 0140010901, 0142470109, 0143030701, 0143110501, 0144010201, 0145090301, 0147050101, 0147440419, 0151270127, 0151270132, 0151370436, 0152030326, 0154300218, 0154300220, 0154300301, 0156010103, 0156010306, 0156010309, 0159370131, 0159370243, 0159370244, 0160010101, 0160010114, 0160010401, 0160030133, 0162010707, 0167370501, 0168280101, 0170010806, 0201011105, 0201011108, 0201040216, 0202170323, 0202170324, 0202190558, 0202210230, 0203000218, 0203030901, 0203030908, 0203031501, 0203033101, 0204040110, 0204080102, 0204080315, 0204080513, 0204080517, 0204080701, 0204140408, 0204160101, 0204190451, 0205021001, 0205202003, 0206041404, 0207080518, 0207130201, 0207170201, 0207170329, 0207170344, 0208000904, 0209150202, 0210020501, 0210022304, 0210022405, 0210023009, 0210121701, 0210210902, 0210410112, 0211360207, 0212010216, 0212010345, 0212010408, 0212010412, 0212010901, 0212010905, 0212011010, 0212011319, 0212011415, 0212011504, 0212012601, 0212013701, 0212013801, 0212101115, 0212120704, 0212120707, 0212121004, 0212121401, 0212130144, 0212150204, 0213110132, 0214000522, 0214000525, 0214000701, 0214000911, 0214001109, 0214001307, 0214001320, 0214001601, 0214010407, 0214010413, 0214011304, 0214011428, 0214120803, 0215020415, 0215020417, 0215020701, 0215021123, 0215021124, 0215050417, 0215050423, 0215050424, 0215050707, 0215051019, 0215051701, 0215051801, 0215061116, 0215061208, 0215080167, 0215080219, 0215080308, 0215080805, 0215161508, 0215163103, 0216040614, 0216040712, 0216042301, 0216270102, 0217131101, 0217131601, 0217200102, 0217230201, 0218040415, 0218040917, 0218041003, 0218041406, 0218042001, 0218042002, 0218090805, 0218190502, 0218240103, 0218410301, 0219050214, 0219050612, 0219050615, 0219050617, 0219050706, 0219050718, 0219050817, 0219060104, 0219060116, 0219060204, 0219061101, 0219120202, 0219150401, 0219150501, 0219180301, 0219301001, 0219331601, 0220060820, 0220060821, 0220080855, 0220080869, 0220101719, 0220110106, 0220110911, 0220110960, 0221080936, 0221081219, 0221221401, 0221241401, 0221250407, 0222120417, 0223050103, 0223091601, 0223091901, 0224040208, 0224140601, 0225050109, 0225050144, 0225101709, 0225102201, 0225120443, 0225120601, 0225150332, 0226040310, 0226040358, 0226070535, 0226170411, 0226170421, 0226210201, 0226210202, 0226311401, 0226500206, 0227030102, 0227030307, 0227050522, 0227050631, 0227051101, 0227110109, 0227160105, 0227520102, 0228060321, 0228070501, 0228110102, 0229030336, 0229031006, 0229080118, 0229080470, 0229080472, 0229080612, 0229081101, 0229082101, 0229190205, 0229190803, 0229200129, 0229200302, 0229230207, 0229260706, 0229330402, 0231141801, 0231280222, 0231520323, 0233100217, 0233100411, 0233100434, 0233100553, 0233170110, 0234030412, 0234030419, 0234140204, 0234140503, 0234150106, 0234150116, 0234150124, 0234150128, 0234150203, 0235150814, 0236091801, 0236170105, 0236190140, 0237070245, 0237101008, 0237101009, 0238081136, 0238121027, 0238150812, 0239010104, 0239010307, 0239011001, 0239040101, 0239100312, 0239101020, 0239160504, 0239190251, 0239200123, 0240050213, 0241061035, 0241100332, 0241160703, 0242020461, 0242150204, 0242410501, 0242410503, 0242410516, 0242410604, 0242410607, 0243100215, 0243160401, 0243170317, 0244070821, 0244071204, 0244110302, 0244180506, 0244200539, 0245010204, 0245040536, 0245110123, 0245210104, 0247380302, 0248030105, 0248100503, 0250000302, 0250000601, 0250080112, 0250300105, 0250300202, 0250430207, 0251210424, 0251310508, 0251310509, 0251311001, 0252060206, 0252200115, 0252300716, 0252300717, 0254000114, 0254060401, 0254080407, 0254080409, 0254080410, 0254100101, 0254130234, 0254200301, 0254260209, 0254300717, 0256060501, 0256081002, 0256081009, 0256081101, 0256130255, 0256130602, 0256200308, 0256230305, 0256260102, 0256280117, 0256301015, 0257020116, 0258100103, 0258160506, 0258260109, 0258260301, 0258331104, 0258331801, 0258360901, 0259310502, 0260061201, 0260080601, 0260100502, 0260160701, 0260160702, 0260161003, 0260181010, 0260201105, 0260260401, 0262030820, 0262260306, 0264200264, 0264260213, 0266130508, 0266260202, 0266260413, 0267110213, 0267110214, 0267210501, 0267310139, 0268031101, 0268031201, 0268160217, 0268161201, 0268201105, 0268201106, 0268201108, 0268230107, 0268230111, 0268230407, 0268230605, 0268230606, 0268260501, 0268300202, 0270030401, 0270030402, 0270030403, 0270180901, 0270180904, 0270181001, 0270230702, 0270230908, 0272231185, 0274160108, 0276180219, 0276180572, 0276200326, 0276200901, 0276260802, 0276280601, 0276280702, 0278160106, 0278230401, 0301040236, 0302060128, 0302070116, 0302070612, 0303090113, 0303090201, 0304070207, 0304080502, 0304080503, 0304080504, 0304080601, 0305030120, 0305030910, 0305031122, 0305060108, 0305060364, 0305060365, 0305060801, 0305141201, 0306070102, 0306070105, 0306070115, 0306120601, 0307110117, 0307110137, 0307110301, 0308041534, 0308060204, 0308140309, 0308141001, 0308141701, 0309020310, 0309030110, 0309060701, 0310010101, 0310010107, 0310080501, 0310181501, 0311030303, 0312130103, 0312130115, 0312160303, 0312160304, 0312160305, 0312180606, 0315110824, 0315111101, 0315310701, 0316100202, 0319030114, 0328431501, 0332060603, 0334130401, 0336360109, 0400040211, 0401070229, 0401090168, 0401090911, 0401091601, 0402440213, 0403100804, 0406090211, 0406380414, 0407180113, 0407270127, 0407370125, 0407370132, 0407370134, 0408111702, 0408210102, 0408250208, 0410130649, 0410210104, 0410231002, 0410400117, 0411130212, 0412090654, 0413111001, 0413111101, 0413111201, 0414100804, 0414131304, 0414230208, 0414440925, 0415170502, 0415170505, 0415470401, 0416210401, 0417050732, 0418070701, 0418340802, 0419280633, 0420090101, 0421100904, 0421100917, 0422060103, 0422060105, 0422070204, 0422150139, 0422230202, 0422231601, 0423270501, 0423270504, 0424050101, 0424070418, 0424070419, 0426300928, 0428130775, 0430190410, 0430440202, 0431080601, 0431180109, 0431180110, 0431180701, 0432070108, 0432230604, 0434130401, 0436030106, 0438110301, 0439080522, 0439081001, 0439180611, 0440110124, 0440110126, 0440130901, 0440131103, 0443130104, 0445110301, 0445110302, 0447110104, 0448180203, 0448180213, 0448180217, 0448180601, 0448180602, 0451150801, R065674, R066402, R066403, R066465, R081221, R090204, R311034, R321689, R330928, R359319, R386226, R391721, R392271, R401751, R406485, R413951, R417461, R417937, R489042, R496710, R496877, R497211, R500216, R500219, R516102, R516103, R516163, R525118, R528025, R539770, R562948, R573084, R590130, R594452, R594454, R601416, R613169
