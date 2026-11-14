# Austin Apartment Finder: Design

Date: 2026-11-14. Status: draft, awaiting approval.

## Intent

People choosing an Austin apartment cannot tell what a building is like until they live there. Reddit's "where to live" theme was the second largest in the research (about 500 posts in six months), and the most specific asks were "recommend a complex with no roach issues" and "what are your red flags." Review sites answer with opinion that is easy to game.

The city already records what goes wrong in buildings. This tool turns those records into a way to shortlist complexes by area, using facts instead of reviews.

## What a person does

1. Picks an area: types an address, taps an area shortcut, or moves the map.
2. Sees every apartment complex in view twice: as a point of light on the map, and as a card in a row along the bottom, ordered by code complaints.
3. Opens one building, from its pin or its card, to see its full record in a side panel.

```
+----------------------+  ( 12 months | 3 years )( All | Structure | ... )( Repeat Offenders )
| Building Record      |
| [ search ________ ]  |                                   +--------------------------+
+----------------------+        tilted 3D map              | 1700 Burton Dr           |
                                 o   .  o                  | 284 code cases           |
            .   o  (244)   .        (103)                  | by type, month by month, |
                                                           | latest cases             |
( 242 complexes in view | Most first )  ( Downtown )( The Domain )( East Riverside )
+-----------+ +-----------+ +-----------+ +-----------+
| 284       | | 244       | | 237       | | 202       |   <- cards scroll sideways
| 1700 Bur..| | 2000 Bur..| | 2239 Cro..| | 1817 E O..|
+-----------+ +-----------+ +-----------+ +-----------+
```

Building page:

- Code cases over time, by category, open vs. closed.
- Repeat Offender status, active and total violations.
- 311 requests filed at the address, by type.
- Every figure links to its city source and shows the dataset's last update.

## Goals

- Answer "which complexes near X have a clean record" in under a minute.
- Every number traceable to a city record.
- Fair comparison between large and small complexes.

## Non-goals (v1)

- Rents, availability, listings. No public source exists; link out instead.
- Neighborhood fit, crime, flood, transit, schools.
- Suburbs. Round Rock, Pflugerville and Cedar Park are not in city data.
- Accounts, saved searches, alerts.

## Anti-goals

- No score, grade or "worst landlords" ranking. Counts and sources only.
- No names of people. Inspector names and phone numbers are in the data and must be dropped at ingest. Owner names shown only where the city's Repeat Offender list already publishes them.
- No claim that zero cases means a good building. Zero means no complaint reached Code Enforcement.

## What the data supports (verified 2026-11-14)

| Source | ID | Verified |
|---|---|---|
| Land Use Inventory Detailed | `7vsm-dvxg` | 3,972 multifamily parcels (2,501 apartment, code 220), each with a 10-digit parcel ID and polygon. |
| Code Complaint Cases | `6wtj-zbtb` | 82,638 cases, 87% with parcel ID. Updated daily. Joins to land use on parcel ID (confirmed on one complex). |
| Repeat Offender Registrations | `86z9-i27i` | 80 properties with name, unit count, active and total violations, parcel ID. |
| Austin 311 Public Data | `xwdj-i9he` | Address and coordinates. One day behind. Code cases carry the 311 request number. |

Limits that shape the design:

- **History starts in late 2023.** Earlier years have a few dozen rows each. The tool offers "last 12 months" and "since Nov 2023," nothing longer.
- **Complaint categories are coarse.** Only four: Property Abatement, Structure Condition, Land Use, Work Without Permit. The data cannot say "roaches" or "mold." Structure Condition is the closest proxy for habitability and is shown separately.
- **No complex names** outside the Repeat Offender list and the Affordable Housing Inventory. Buildings are identified by address in v1.
- **No unit counts** for most buildings. See open item 1.

## Approaches considered

**A. Area first, then building (chosen).** Pick an area, see complexes ordered by record, open one. Matches how people ask ("apartments near the Domain"). Needs the parcel list and a fair size comparison.

**B. Lookup only.** Type an address, see its record. Simplest, and it is step 3 of A. Rejected as the whole product because most searchers do not have an address yet.

**C. Citywide leaderboard.** Rank every complex in Austin. Easy to build and shareable, but it is the naming-and-shaming version, it invites disputes from owners, and it does not help someone searching one area.

A was picked by Gabe on 2026-11-14 ("Apartment finder"), after B was judged too narrow.

## How it gets built (Claude's calls, open to change)

- **App:** Next.js with TypeScript and Tailwind, deployed on Vercel.
- **Data:** no database. A build-time script pulls the four sources through the city's API, strips personal names, joins on parcel ID and writes static JSON that the site reads. A scheduled rebuild refreshes it nightly. Changed from Postgres on 2026-11-14: the full dataset is about 2,500 parcels and 82,000 cases, which does not need a running database.
- **Map:** MapLibre GL (v6) with vector tiles, tilt, 3D building extrusions and a custom style in the Arctic palette (see Visual direction). The mockup recolors a free OpenFreeMap style at load; the real build should ship its own style file.
- **Address search:** the city's own Addresses dataset, so no paid geocoder. Searching by employer or place name is left out of v1.
- **Required notices:** not an official City site, data has no warranty, credit to the City of Austin and Development Services.

## Visual direction

Settled with Gabe on 2026-11-14 through four rounds of a live mockup (`mockup/`). The first two rounds were rejected: a beige, serif, Nagomi-led version and a flat white app-style version. The reference that leads is the Mindora meditation UI kit (uiuxjosh): frosted glass over an atmospheric scene. Gabe then compared three palettes and three glass strengths on the live map and chose **Arctic with clear glass**.

**The scene**

- The map is the scenery, not a widget. It is tilted (about 52 degrees), with translucent 3D buildings at street zoom and fog settling on the horizon.
- It is repainted in the Arctic palette: mist land, steel-blue water, pale sage parks, near-white roads.

**Palette (Arctic)**

| Role | Hex |
|---|---|
| Navy, darkest text and the highest case counts | `#0B131F` |
| Deep, headings and pressed controls | `#16314A` |
| Slate, body text | `#2E4F68` |
| Steel, secondary text and water | `#5F7F98` |
| Mist, map land and fog | `#A9BDC9` |
| Ice, highlights and text on dark | `#E8EFF3` |
| Coral, Repeat Offender only | `#E9A99E` |

**Glass (clear)**

- Panels are nearly transparent: a white gradient from 24% to 5% opacity, a 10px background blur, and a bright 1px white rim with an inner highlight.
- Known cost, accepted for now: dark pins behind a panel show through as soft shadows behind the text. If readability suffers in the real build, raise the blur before raising the opacity.

**Type**

- Instrument Serif, italic for the title and upright for headings.
- Outfit for everything else, light weights. Large figures are set very thin (weight 200).

**Layout**

- Top left: one glass block with the title, a one-line description and search.
- Top: one glass bar of filters (period, complaint type, Repeat Offenders only).
- Bottom: a sideways-scrolling row of glass cards, one per complex in view, with a count pill, sort toggle and area shortcuts above it.
- Right: a glass detail panel that rises in when a building is selected. On a phone it becomes a bottom sheet.

**Pins**

- Each complex is a point of light: a soft halo plus a solid core. Clean buildings glow white. Size and darkness grow with the case count, ending in navy.
- Repeat Offender properties get a coral halo and ring. No red, amber and green, because traffic-light colors read as a grade.
- Case numbers appear inside the pins from zoom 13.

**Motion**

- Only in answer to an action: the map flies and tilts to a selection, the detail panel rises, a hovered card lifts.

**What the mockup taught**

- Ordered fewest first, the results open with a long run of buildings that have no cases (870 of 2,497). The build needs a second ordering for clean buildings, or should default to most first.
- The period matters: one complex shows 284 cases since Nov 2023 but 12 in the last 12 months. The default period is a product decision.
- The mockup labels each parcel with its nearest city address point, which produces duplicates and wrong neighbors. The real build must resolve addresses properly (see open item 2).

## Open items, now settled

Decided in the build plan (`docs/superpowers/plans/2026-11-14-apartment-finder.md`) after testing against live data on 2026-11-14.

1. **Fair size comparison:** no per-unit rate in v1. Only 46% of apartment parcels get a unit count from any city source, and permit-derived counts contradict the city's Repeat Offender figures. Show raw counts with parcel acres, plus unit counts only where the city publishes them.
2. **Parcels vs. complexes:** one parcel is one complex in v1. Each is labelled with the city address point inside its boundary.
3. **Cases without a parcel ID (13%):** left out, with the share stated on a method page.
4. **Small multifamily (code 210):** out of v1. Apartments (code 220) only.
5. **Defaults:** last 12 months, fewest cases first, and among equal counts the larger parcel first.

## What done looks like

- Any Austin address returns the complexes around it with correct counts, spot-checked against the city portal for ten buildings.
- The nightly job runs unattended and the page shows the date of the last successful pull.
- Works at phone width.
