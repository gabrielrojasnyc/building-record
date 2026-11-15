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
