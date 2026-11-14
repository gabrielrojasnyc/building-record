# Building Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone picks a building, the city drops into fog, the complex rises as a white 3D model on a navy base with its name above it, and the card shows the name and an aerial photo.

**Architecture:** The pipeline adds each complex's parcel outline to its building file and an optional name matched from a committed OpenStreetMap snapshot. In the browser, building shapes with heights are read live from the city when a building is picked, and the map draws them as extrusions inside a "spotlight" state owned by `BuildingMap`. The record panel gains a photo and name header.

**Tech Stack:** unchanged (Next.js 16 static, TypeScript, Tailwind 4, MapLibre GL JS 6, Vitest, Playwright).

**Spec:** `docs/2026-11-14-building-spotlight-design.md`. Visual and behavioral reference: `mockup/select3d.js`, `mockup/app.js` (the `spotlight` mode), `mockup/styles.css` (the "mock:" section). Copy values from the mock, not its structure.

## Global Constraints

- Everything in the first plan's Global Constraints still holds (`docs/superpowers/plans/2026-11-14-apartment-finder.md`): palette tokens only, no em dashes or double dashes, no score or ranking language, no names of people, `src/` never imports from `pipeline/`, the notice on every page.
- The model is white (`#F4F8FA`) on a navy base (`#0B131F` at 90% opacity) for every building, whatever its record. No color may vary with the case count.
- A name is shown only under the rule in Task 1. When the rule does not produce exactly one name, the address is the title. Never guess.
- The address is always shown with a name and remains the unique label wherever uniqueness matters.
- Motion: growth and turning are skipped under `prefers-reduced-motion: reduce`; turning stops on the first pointer, touch or wheel input on the map.
- A failure of the city footprints API, USGS imagery or the names snapshot must never stop the record panel from opening with its full content.
- Before writing code against MapLibre or Next.js, look up the current API (Context7, or `app/node_modules/next/dist/docs/`).
- Commit after every task, with a message that says why.

## Decisions made in this plan

1. **Name order differs from the design draft.** OpenStreetMap first, then the city's Repeat Offender establishment name, then none. The city's field often holds the owning company ("1830 W Rundberg Db Llc"), while OpenStreetMap holds the sign on the property ("Lantana Trace"). A Repeat Offender name is used only when it does not look like a legal entity.
2. **One clear name or none.** A complex gets an OpenStreetMap name only when the apartment-tagged features whose center lies inside its outline carry exactly one distinct name.
3. **The names snapshot stores raw places, not matches.** Matching to parcels happens in every build, so it follows parcel changes without re-querying OpenStreetMap.
4. **The outline travels in the building file.** The browser needs it for the base, the framing and for choosing which city footprints belong to the complex.
5. **`BuildingMap` owns the spotlight.** The screen passes a target or `null`; the map handles layers, flight, turning, restore and cleanup.

## Review Focus

- **The city footprints API fails or is slow:** the navy base still rises, the OpenStreetMap shapes in the loaded tiles are used if any, and the record opens regardless. Test in Task 3 and Task 4.
- **Two different apartment names inside one parcel:** no name is shown. Test in Task 1.
- **A complex with no building shapes anywhere:** base only, no error, no endless wait. Test in Task 3.
- **The photo fails to load:** the header shows the fog gradient and the name, with no broken-image icon. Test in Task 4.
- **A second building picked, or the card closed, while the first is still flying or growing:** exactly one model and one label remain, or none, and the camera returns. Test in Task 3 (unit) and Task 4 (end to end).

---

### Task 1: Outlines and names in the pipeline

**Files:**
- Create: `app/src/domain/outline.ts`, `app/src/domain/outline.test.ts`, `app/pipeline/names.ts`, `app/pipeline/names.test.ts`, `app/pipeline/refreshNames.ts`, `app/pipeline/snapshots/apartment-names.json`
- Modify: `app/src/domain/types.ts`, `app/src/domain/labels.ts`, `app/pipeline/merge.ts`, `app/pipeline/build.ts`, their tests, `app/package.json` (script `names`)

**Interfaces:**
- Consumes: `combineParcels`, `Property`, `buildData`, `Parcel` as they stand.
- Produces:

```ts
// src/domain/types.ts
export type Ring = [lon: number, lat: number][];
/** Polygons, each a list of rings with the outer ring first. Coordinates rounded to 6 decimals. */
export type Outline = Ring[][];
export interface ComplexName { text: string; source: 'openstreetmap' | 'city' }
// Complex gains:        name: ComplexName | null;
// BuildingDetail gains: outline: Outline;        (every member parcel's polygons for a merged complex)
// Meta gains:           namedComplexes: number;  namesAsOf: string | null;   (snapshot date, YYYY-MM-DD)

// src/domain/outline.ts
export function outlineBbox(outline: Outline): [west: number, south: number, east: number, north: number];
export function isInsideOutline(lon: number, lat: number, outline: Outline): boolean;   // even-odd over every ring
export function ringCenter(ring: Ring): [lon: number, lat: number];                     // mean of the vertices

// src/domain/labels.ts
export function titleOf(complex: Complex): string;   // name text, else address

// pipeline/names.ts
export interface NamedPlace { name: string; lon: number; lat: number }
export interface NamesSnapshot { fetchedAt: string; places: NamedPlace[] }
export function fetchApartmentNames(fetchImpl?: typeof fetch): Promise<NamedPlace[]>;
export function looksLikeLegalEntity(name: string): boolean;
export function chooseName(outline: Outline, places: NamedPlace[], repeatOffenderName: string | null): ComplexName | null;
```

Fixed values:
- Overpass endpoint `https://overpass-api.de/api/interpreter`, POST, with headers `User-Agent: austin-building-record (names snapshot)` and `Accept: application/json` (it answers 406 without them). Bounding box `(30.05,-98.05,30.55,-97.50)`. Query for ways and relations with a `name` and either `building=apartments` or `landuse=residential` plus `residential=apartments`, `out center tags`.
- A place is kept when its trimmed name is 3 to 60 characters and does not start with a digit.
- `looksLikeLegalEntity`: true when the name contains, as a whole word and in any case, `llc`, `lp`, `llp`, `inc`, `ltd`, `trust`, `holdings`, `partners`, `partnership`, `properties`, `investments`, or starts with a digit.
- `npm run names` runs `refreshNames.ts`, which writes the snapshot with today's Austin date. The build reads the committed snapshot and never calls Overpass. A missing or unreadable snapshot yields no OpenStreetMap names and `namesAsOf: null`; it does not fail the build.

- [ ] **Step 1:** Write the failing tests.

```ts
it('finds a point inside a polygon and outside its courtyard hole', ...);
it('treats a merged complex as inside when the point is in any member polygon', ...);
it('gives the bounding box over every ring', ...);

it('names a complex when exactly one distinct apartment name lies inside it', () => {
  expect(chooseName(outline, [place('Lantana Trace', inside), place('Lantana Trace', alsoInside), place('Elsewhere', outside)], null))
    .toEqual({ text: 'Lantana Trace', source: 'openstreetmap' });
});
it('shows no name when two different names lie inside', () => {
  expect(chooseName(outline, [place('North Phase', inside), place('South Phase', alsoInside)], 'City Name')).toBeNull();
});
it('falls back to the city name when OpenStreetMap has none', () => {
  expect(chooseName(outline, [], 'Mia Riverside')).toEqual({ text: 'Mia Riverside', source: 'city' });
});
it('does not use a city name that is a legal entity', () => {
  expect(chooseName(outline, [], '1830 W Rundberg Db Llc')).toBeNull();
  expect(looksLikeLegalEntity('Burton Holdings LP')).toBe(true);
  expect(looksLikeLegalEntity('The Social')).toBe(false);
});
it('sends the required headers to Overpass and keeps only plausible names', ...);
it('writes each complex its outline and name, and counts named complexes in meta', ...);   // build.test.ts
it('builds without names when the snapshot file is missing', ...);
```

- [ ] **Step 2:** Run `npm test -- outline names build`. Expected: FAIL.
- [ ] **Step 3:** Implement. Carry each parcel's polygons through `combineParcels` so a merged complex's outline is the list of all members' polygons. Round coordinates to 6 decimals.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run `npm run names` once against the live service and commit the snapshot. Then `REFRESH_DATA=1 npm run data` and report: named complexes by source, ten examples (address, name, source), the count of complexes where two or more names were found and none was used, and the size of `public/data`.
- [ ] **Step 5:** Commit.

---

### Task 2: Building shapes and the aerial photo address

**Files:**
- Create: `app/src/city/footprints.ts`, `app/src/city/footprints.test.ts`, `app/src/city/aerialPhoto.ts`, `app/src/city/aerialPhoto.test.ts`, `app/src/city/buildingDetail.ts`, `app/src/city/buildingDetail.test.ts`
- Modify: `app/src/ui/BuildingPanel.tsx` (use the shared loader)

**Interfaces:**
- Consumes: `Outline`, `outlineBbox`, `isInsideOutline`, `ringCenter`, `BuildingDetail`.
- Produces:

```ts
// src/city/footprints.ts
export type BuildingShapes = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { h: number }>;   // h in metres
export const FALLBACK_HEIGHT_M = 9;
export function heightInMetres(maxHeightFeet: unknown): number;
/** The city's surveyed footprints (dataset 3qcc-8uhz) whose center lies inside the outline. Rejects when the city cannot be read. */
export function loadFootprints(outline: Outline, fetchImpl?: typeof fetch): Promise<BuildingShapes>;

// src/city/aerialPhoto.ts
/** A USGS NAIP aerial image framed on the box at this pixel size, padded 30% and widened or heightened to the image's aspect. */
export function aerialPhotoUrl(bbox: [number, number, number, number], width: number, height: number): string;

// src/city/buildingDetail.ts
/** One request per building however many callers ask; a failed request is forgotten so a later pick can retry. */
export function loadBuildingDetail(id: string, fetchImpl?: typeof fetch): Promise<BuildingDetail>;
```

Fixed values:
- Footprints: `https://data.austintexas.gov/resource/3qcc-8uhz.json`, `$select=the_geom,max_height`, `$where=within_box(the_geom, <north>, <west>, <south>, <east>)`, `$limit=3000`, no app token.
- Height: `max_height` is feet. Valid when above 6 and below 600; convert with 0.3048. Anything else (missing, the city's `-9999999999` sentinel) is `FALLBACK_HEIGHT_M`.
- Photo: `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage` with `bbox`, `bboxSR=4326`, `imageSR=3857`, `size=<w>,<h>`, `format=jpg`, `f=image`. Horizontal extent is scaled by the cosine of the latitude when matching the aspect.

- [ ] **Step 1:** Write the failing tests.

```ts
it('converts feet to metres and falls back for the sentinel, zero and absurd values', () => {
  expect(heightInMetres('24.43')).toBeCloseTo(7.446, 2);
  for (const bad of ['-9999999999', '0', '4', '900', undefined, 'tall']) expect(heightInMetres(bad)).toBe(9);
});
it('keeps only footprints whose center is inside the outline', ...);
it('asks the city for the outline box and never for more than it needs', () => {
  expect(decodeURIComponent(urlOf(fetchImpl, 0))).toContain('within_box(the_geom, 30.24, -97.73, 30.236, -97.725)');
});
it('rejects when the city answers with an error', ...);
it('frames the photo on the box at the image aspect', ...);   // the returned bbox contains the input box and has the width:height ratio of the size, within 1%
it('shares one request between two callers and retries after a failure', ...);
```

- [ ] **Step 2:** Run `npm test -- footprints aerialPhoto buildingDetail`. Expected: FAIL.
- [ ] **Step 3:** Implement. Move the panel's building-file fetch into `loadBuildingDetail` and have the panel call it; its existing tests must pass unchanged in meaning.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 3: The spotlight on the map

**Files:**
- Create: `app/src/map/spotlight.ts`, `app/src/map/spotlight.test.ts`
- Modify: `app/src/map/BuildingMap.tsx`, `app/src/map/BuildingMap.test.tsx`, `app/src/app/globals.css`

**Interfaces:**
- Consumes: `Outline`, `outlineBbox`, `isInsideOutline`, `ringCenter`, `loadFootprints`, `BuildingShapes`, `FALLBACK_HEIGHT_M`, `CameraPadding`.
- Produces:

```ts
// src/map/spotlight.ts
export interface SpotlightTarget { id: string; title: string; lon: number; lat: number; outline: Outline }
export const SPOTLIGHT_LAYER_IDS: readonly ['spot-base', 'spot-glow', 'spot-outline', 'spot-buildings'];
export function spotlightLayers(): LayerSpecification[];
export const GROW_MS = 1300;
export function growthAt(elapsedMs: number): number;                                          // 0 to 1, ease-out cubic, clamped
/** Shapes for complexes the city's survey missed: tile building features whose center is inside the outline. */
export function shapesFromTiles(features: { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null }[], outline: Outline): BuildingShapes;

// BuildingMap gains one prop:
//   spotlight: SpotlightTarget | null;
// and its outermost element carries data-spotlight="<id>" while a spotlight is showing.
```

Behavior, with the mock's values:
- **Enter** (`spotlight` becomes non-null, or changes id): remember the camera (center, zoom, pitch, bearing). Hide the three pin layers and `buildings-3d`. Draw the outline as `spot-base` (fill `#0B131F`, opacity 0.9), `spot-glow` (line white, width 14, blur 12, opacity 0.85) and `spot-outline` (line white, width 2), all beneath where `buildings-3d` sits. Add a name label: a glass pill, Instrument Serif 19 px, color deep, with a 52 px hairline stem, anchored 64 px above the complex's point, text `title`.
- **Frame:** fly so the outline's box fits inside the current `padding`, centered on the box, pitch 60, `maxZoom` 17.6, zoom reduced by 0.25, `speed` 0.9, `curve` 1.3.
- **Shapes:** call `loadFootprints(outline)`. On an empty result or a rejection, use `shapesFromTiles` over `querySourceFeatures('openmaptiles', { sourceLayer: 'building' })`. Then set `spot-buildings` (fill-extrusion `#F4F8FA`, opacity 1) and grow its height from 0 to `h` over `GROW_MS`. With no shapes at all the base stays alone.
- **Turn:** when the flight ends, rotate 60 degrees every 21 seconds, linear, repeating, until the first `mousedown`, `touchstart` or `wheel` on the map.
- **Reduced motion:** jump instead of fly, full height at once, no turning.
- **Leave** (`spotlight` becomes null): stop turning, remove the label, empty the spotlight sources, show the pins and `buildings-3d` again, and ease back to the remembered camera.
- **Stale work:** every asynchronous step checks it still belongs to the current target before touching the map. Changing target mid-flight leaves exactly one label and one set of shapes.
- **Fog:** add a `.fog-spotlight` rule to `globals.css` for the screen to apply: `radial-gradient(58% 52% at 46% 46%, transparent 38%, ice at 90% 100%)` over `linear-gradient(180deg, ice at 88% 0%, transparent 30%)`.
- The existing `flyTo`, `padding`, `selectedId` and `hoveredId` props keep working; while a spotlight is showing, `selectedId` highlighting is moot because pins are hidden.

- [ ] **Step 1:** Write the failing tests for the pure parts.

```ts
it('lists the four layers in drawing order with the mock paint values', () => {
  const layers = spotlightLayers();
  expect(layers.map((l) => l.id)).toEqual([...SPOTLIGHT_LAYER_IDS]);
  expect(layers[0].paint).toMatchObject({ 'fill-color': '#0B131F', 'fill-opacity': 0.9 });
  expect(layers[3].paint).toMatchObject({ 'fill-extrusion-color': '#F4F8FA' });
});
it('uses no color that depends on a case count', () => {
  expect(JSON.stringify(spotlightLayers())).not.toMatch(/"v"|interpolate/);
});
it('grows from nothing to full height and stays there', () => {
  expect(growthAt(0)).toBe(0); expect(growthAt(GROW_MS)).toBe(1); expect(growthAt(GROW_MS * 3)).toBe(1);
  expect(growthAt(GROW_MS / 2)).toBeGreaterThan(0.5);
});
it('keeps tile buildings centered inside the outline, at least the fallback height', ...);
it('returns no shapes when no tile building is inside', ...);
```

Extend `BuildingMap.test.tsx` in its existing style (a fake map object) to pin the sequencing: entering hides pins and adds the label; a footprints rejection falls back to tile shapes; an empty result leaves the base alone without throwing; changing the target before the first target's footprints resolve applies only the second target's shapes and leaves one label; leaving removes the label, restores the layers and eases to the remembered camera; under reduced motion no rotation is started.

- [ ] **Step 2:** Run `npm test -- spotlight BuildingMap`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, `npm run lint`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 4: Name and photo on the card, and wiring the screen

**Files:**
- Modify: `app/src/ui/BuildingPanel.tsx`, `app/src/ui/Tray.tsx`, `app/src/ui/Finder.tsx`, `app/src/ui/IntroSearch.tsx`, `app/src/city/addressSearch.ts`, `app/src/app/building/[id]/page.tsx`, `app/src/app/method/page.tsx`, `app/src/app/globals.css`, their tests, `app/e2e/finder.spec.ts`

**Interfaces:**
- Consumes: `titleOf`, `ComplexName`, `aerialPhotoUrl`, `loadBuildingDetail`, `SpotlightTarget`, `BuildingMap`'s `spotlight` prop, `.fog-spotlight`.

What changes:
- **Panel header, both placements.** A header 204 px tall (170 px on phones) across the top of the panel: the aerial photo (`aerialPhotoUrl(detail.bbox, 744, 400)`, `alt="Aerial photo of <title>"`), a gradient from transparent at 42% to navy at 82%, the title in Instrument Serif 30 px ice as the panel's heading (`h2` on the map, `h1` on the page), and under it `<address>, <acres>` when there is a name, or `<acres>` alone when the title is the address. Credit `Aerial photo: USGS` in small ice text. The close button sits over the header. Until the detail arrives, and if the image errors, the header shows the fog gradient with the title; never a broken-image icon. The meta line and heading that used to open the panel are removed, since the header carries them.
- **Tray cards.** Title is `titleOf(complex)`. For a named complex the second line is the address; otherwise the existing caption.
- **Search.** `searchComplexes` matches the address or the name. A suggestion for a named complex shows the name with the address beside it.
- **Building page.** `h1` is the title; the document title is `<name>, <address>: code complaint record` when named, unchanged otherwise.
- **Screen.** On selection `Finder` keeps its immediate fly, loads the detail with `loadBuildingDetail`, and passes `spotlight` to the map once the outline is known. While something is selected: the fog element carries `.fog-spotlight`; the tray shows the list it had at the moment of selection; the camera padding is `{ top: 110, right: 440, bottom: 250, left: 70 }` on desktop and `{ top: 190, right: 30, bottom: <60% of the viewport height plus 20>, left: 30 }` on phones; the phone sheet is 60% of the viewport tall instead of 72%. Clearing the selection restores all of it.
- **Method page.** Add the building footprints, USGS imagery and OpenStreetMap names to the sources, with these statements: names come from OpenStreetMap, are recorded by volunteers, may be out of date, and are shown only when one clear name lies inside the parcel; the snapshot date from `meta.namesAsOf`; building shapes are from the city's 2013 survey, with OpenStreetMap shapes for newer buildings and estimated heights where none was measured; aerial photos are USGS National Agriculture Imagery Program, public domain. OpenStreetMap data is under the Open Database License, linked.

- [ ] **Step 1:** Write the failing unit tests: the header shows name over address when named and address alone otherwise; the image error path leaves no `img` in the header; tray card lines for a named and an unnamed complex; search finds a complex by name and by address; the page title for a named complex; the method page's new statements.
- [ ] **Step 2:** Write the failing end-to-end tests, stubbing `3qcc-8uhz` and the USGS image with `page.route`, and choosing a named complex by reading `public/data/complexes.json`:
  - picking a building sets `data-spotlight` on the map to that id, shows the name label, and the panel shows the name, the address and an image with the aerial alt text;
  - Escape clears `data-spotlight` and brings the card count text back;
  - with the footprints stub answering 500, the panel still shows the full record and `data-spotlight` is still set;
  - with the image stub answering 500, the header has the name and no `img`;
  - picking one building and then another immediately leaves exactly one name label, for the second;
  - the tray's cards do not change while a building is selected;
  - searching a complex's name selects it.
- [ ] **Step 3:** Run `npm test` and `npm run e2e`. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run e2e` twice. Expected: PASS. Then check the production build in a browser at 1440 by 900 and 375 by 812: pick three buildings (one named with city footprints, one built after 2013, one tiny parcel), and compare the first against the mockup's Spotlight mode side by side. Save screenshots.
- [ ] **Step 6:** Commit.
