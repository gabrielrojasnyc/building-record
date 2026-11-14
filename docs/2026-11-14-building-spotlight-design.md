# Building Spotlight: Design

Date: 2026-11-14. Status: draft, awaiting approval. Adds to `2026-11-14-apartment-finder-design.md`.

## Intent

Picking a building should feel like the building steps forward, not like a pin got highlighted. Gabe asked for the selected building to appear as a real 3D version, and for the card to show the building's name and a picture of it.

Three mocks were compared on the live mockup (`mockup/select3d.js`): Rise, Model card and Spotlight. Gabe chose **Spotlight** on 2026-11-14.

## What a person sees

1. They pick a building from a pin, a card or search.
2. The rest of the city drops into fog. Other pins and the faint city buildings disappear.
3. The complex's own buildings rise from a dark navy base as a white model, at their real heights. Its name floats above it on a small glass label.
4. The camera settles close and turns slowly around the complex. It stops the moment the person touches the map.
5. The card opens with a photo of the complex across the top and the name over it, then the address, then the record as today.
6. Closing the card returns the city, the pins and the previous view.

```
+----------------------+   ( filters )
| Building Record      |                         +---------------------------+
| [ search ________ ]  |                         | [ aerial photo          ] |
+----------------------+      ( Array Apartments )| Array Apartments         |
                                    |            | 2000 Burton Dr, 14.2 acres|
            fog          white buildings on      +---------------------------+
                         a navy base, turning    | 244 code cases ...        |
            fog                                  | record as today           |
( 106 complexes in view )  ( area shortcuts )    +---------------------------+
[ card ] [ card, selected ] [ card ] [ card ]
```

## Goals

- The selected complex is drawn from its real building shapes and heights.
- The card shows a name when a trustworthy one exists, and a photo for every building.
- Nothing about the record itself changes: same counts, same sources.

## Non-goals (this round)

- Street-level photos. The only source with real Austin coverage is Google Street View, which needs a paid key and forbids storing images. Gabe has not asked for it; the aerial photo is the default because it needs no account.
- 3D on the standalone building page. That page gets the name and photo only.
- Textured or photorealistic models. Buildings are clean white massing models.

## Anti-goals

- A name that might be wrong. A wrong name on a record about complaints is worse than no name. When in doubt, show the address.
- Motion that cannot be stopped, or that runs for people who have asked their device to reduce motion.
- Color that implies a verdict. The model is white on navy for every building, whatever its record.

## Where each piece comes from (checked live on 2026-11-14)

| Piece | Source | Coverage | Notes |
|---|---|---|---|
| Parcel outline (the navy base) | Already in the pipeline (Land Use Inventory `7vsm-dvxg`) | Every complex | Written into each building's JSON file. |
| Building shapes and heights | City "Building Footprints Year 2013" `3qcc-8uhz`: 585,916 surveyed footprints with `max_height` in feet | Buildings that existed in 2013 | Public domain. Read live when a building is picked. |
| Shapes for newer buildings | OpenStreetMap buildings already in the map tiles | Most of the rest | Heights are estimates; shown the same way. |
| Name | 1. The city's Repeat Offender registration name. 2. OpenStreetMap apartment names | About 4 in 10 complexes (980 of 2,497 in the mock's rough match) | Otherwise the address is the title. |
| Photo | USGS NAIP aerial imagery, framed on the parcel | Every complex | Public domain, top-down, about 60 cm per pixel. |

## Decisions (Claude's calls, open to change)

1. **Footprints are read live from the city when a building is picked,** not stored. The mock does this in under a second. If the city does not answer, the map falls back to the OpenStreetMap shapes already loaded, and if there are none, the navy base rises alone. Storing them would mean pulling 586,000 shapes into the nightly build for a dataset that has not changed since 2013.
2. **Names are a saved snapshot, refreshed by hand,** not pulled nightly. A script queries OpenStreetMap once, keeps only features tagged as apartments whose center falls inside a complex's parcel, and writes a small file that is committed. The nightly build never depends on OpenStreetMap being up. Subdivision names (plain residential areas) are excluded because they are not complex names.
3. **Name order:** the city's Repeat Offender name first, then OpenStreetMap, then none. The address is always shown under a name and stays the unique label everywhere uniqueness matters (page addresses, search results).
4. **The photo loads straight from USGS** in the person's browser, sized for the card. If it fails or is slow, the card shows the fog gradient with the name and nothing breaks.
5. **While a building is selected, the card tray keeps the list it had.** The turning camera would otherwise reshuffle the cards every few seconds.
6. **Search also matches names,** so typing "Array" finds Array Apartments. Suggestions show the name with the address beside it.
7. **Phones:** the record sheet opens at 60% of the screen instead of 72% while a building is selected, so the model has room above it.
8. **Reduced motion:** no growth animation and no turning; the model simply appears and the camera jumps.

## Credits and licenses

- Building footprints and parcels: City of Austin, public domain, credited on the method page.
- Aerial photos: USGS National Agriculture Imagery Program, public domain, credited on the photo and the method page.
- Names: OpenStreetMap contributors, Open Database License. The site already credits OpenStreetMap for the map. The method page will say names come from it, and the published data file that contains them is openly downloadable, which is what the license asks of a database built from OpenStreetMap. **Gabe should confirm he is comfortable with that license before names ship.**

## What changes in the app

- **Pipeline:** each building file gains its parcel outline; each complex gains an optional `name` with its source. A new script builds the names snapshot.
- **Map:** selection layers (base, glow outline, extruded buildings), the fog vignette, the floating name label, the framing flight and the turn.
- **Card and tray:** photo and name across the top of the record panel; names on tray cards and building pages; names in search.
- **Method page:** the three new sources and what a name does and does not mean.

## What done looks like

- Picking any complex shows its buildings in 3D on the navy base within about two seconds on a normal connection, or the base alone when no shapes exist.
- For ten complexes spot-checked by hand, the name shown matches the sign on the property (or no name is shown).
- With the city, USGS or OpenStreetMap unreachable, picking a building still opens the full record.
- The end-to-end suite covers: select, model appears, name and photo in the card, close restores the map.
