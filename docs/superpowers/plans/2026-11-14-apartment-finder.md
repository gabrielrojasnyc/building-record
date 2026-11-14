# Austin Apartment Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public site where someone picks an area of Austin and sees every apartment complex there with its city code complaint record, on a tilted glass-styled map.

**Architecture:** A build-time pipeline pulls four City of Austin datasets, joins them on parcel ID, and writes static JSON. A statically generated Next.js site reads that JSON; there is no database and no server at request time. A scheduled rebuild refreshes the data nightly.

**Tech Stack:** Next.js (App Router, static generation), TypeScript, Tailwind CSS, MapLibre GL JS v6, Vitest, Playwright, Vercel.

**Spec:** `docs/2026-11-14-apartment-finder-design.md`. Visual reference implementation: `mockup/` (throwaway; copy values from it, not structure).

## Global Constraints

- App lives in `app/` at the repo root (`/Users/gabe/git/austin-research/app`). `mockup/` and `docs/` stay untouched.
- Before writing code against Next.js, Tailwind, MapLibre GL, Vitest or Playwright, look up current docs with Context7 (`resolve-library-id`, then `query-docs`). MapLibre v6 is ESM-only; do not write v4/v5 UMD patterns from memory.
- TypeScript strict mode. No `any`. Functional React components.
- No em dashes and no double dashes in any copy, comment or commit message.
- No score, grade, rating or ranking language anywhere in the UI. Counts and sources only.
- No names of people. Never read, store or emit the `inspector` field or any permit applicant or contractor field. Owner names appear only as published on the Repeat Offender list (`establishmentname`); the `owner` field is not used.
- Colors come only from the Arctic palette: navy `#0B131F`, deep `#16314A`, slate `#2E4F68`, steel `#5F7F98`, mist `#A9BDC9`, ice `#E8EFF3`, coral `#E9A99E`. Coral is used only for Repeat Offender status.
- Fonts: Instrument Serif (title italic, headings upright) and Outfit (weights 200, 300, 400, 500).
- Glass panels: white gradient from 24% to 5% opacity at 145 degrees, `backdrop-filter: blur(10px) saturate(1.7)`, 1px white border at 90% opacity.
- History window starts `2023-11-01`. The two periods are "last 12 months" (rolling from the pull date) and "since Nov 2023".
- Every page footer carries: "Not an official City of Austin site. Data: City of Austin Development Services and Austin 311, with no warranty." plus the date of the last data pull.
- City API calls send the header `X-App-Token` from env `SOCRATA_APP_TOKEN` when set, and work without it.
- Commit after every task. Commit messages say why, and end with the trailer `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Decisions made in this plan

These settle the spec's open items. Each was checked against live data on 2026-11-14.

1. **No per-unit rate.** Unit counts exist for 46% of apartment parcels and permit-derived counts disagree with the city's own Repeat Offender figures. Show raw counts, with acres on every building and unit counts only where the Repeat Offender list or Affordable Housing Inventory publishes them.
2. **One parcel is one complex.** No merging of adjacent parcels in v1.
3. **Addresses by containment.** A parcel's address is the city address point inside its polygon with the lowest street number; if none is inside, the nearest point within 150 m; otherwise the label `Parcel <id>`.
4. **Cases without a parcel ID (13%) are left out** and their share is published on the method page.
5. **Apartments only.** Land use code `220`. Code `210` (small multifamily) is out of v1.
6. **Default period is the last 12 months.** Default order is fewest cases first, and buildings with equal counts are ordered largest parcel first, so a large clean complex outranks a small one.
7. **No database.** Static JSON, regenerated nightly.

## Review Focus

- **City portal fails or throttles mid-pull:** the pipeline must exit non-zero and write nothing, so a bad night leaves yesterday's site live instead of publishing an empty map. Test in Task 5.
- **A parcel with no address point inside it:** must still appear, labelled by the fallback rule in Decision 3, never with an empty name. Test in Task 3.
- **A case whose description is not one of the four known categories:** must not crash or vanish silently; it is counted in `meta.uncategorizedCases` and excluded from category counts. Test in Task 4.
- **Search text containing a quote or wildcard character:** must be escaped before it reaches the city API query. Test in Task 10.
- **Map cannot start (no WebGL or tiles blocked):** the card tray, filters and building pages must still work, with a plain notice where the map would be. Test in Task 11.

---

## File Structure

```
app/
  pipeline/                  build-time only; never imported by UI code
    socrata.ts               paged, retried reads from the city API
    parcels.ts               apartment parcels: polygon, centroid, acres
    addresses.ts             choose one address per parcel
    cases.ts                 code cases -> counts, monthly series, latest
    context.ts               Repeat Offender and published unit counts
    build.ts                 run all of the above, write data/
    fixtures/                small recorded API responses for tests
  public/data/               generated; git-ignored; read by server components from disk and by the browser over HTTP
    complexes.json           Complex[] for the map and tray
    buildings/<id>.json      BuildingDetail per parcel
    meta.json                Meta
  src/
    domain/
      types.ts               Complex, BuildingDetail, Meta, Category
      query.ts               filter, count, sort, bounds
    city/
      addressSearch.ts       live address lookup against the city API
      requests311.ts         live 311 summary for a parcel's bounds
    map/
      arcticStyle.ts         repaint the base style; pin layer specs
      BuildingMap.tsx        MapLibre wrapper
    ui/
      Glass.tsx  IntroSearch.tsx  Filters.tsx  Tray.tsx  BuildingPanel.tsx  Notice.tsx
    app/
      layout.tsx  page.tsx  building/[id]/page.tsx  method/page.tsx  globals.css
  e2e/                       Playwright
```

---

### Task 1: Project skeleton with the Arctic design tokens

**Files:**
- Create: `app/` via `create-next-app` (TypeScript, Tailwind, App Router, `src/` directory, no ESLint prompts changed from defaults)
- Create: `app/vitest.config.ts`, `app/src/ui/Glass.tsx`, `app/src/ui/Glass.test.tsx`
- Modify: `app/src/app/globals.css`, `app/src/app/layout.tsx`, `app/package.json`, `.gitignore`

**Interfaces:**
- Produces: Tailwind theme colors `navy deep slate steel mist ice coral`; font families `font-display` (Instrument Serif) and `font-sans` (Outfit); `<Glass as? className?>` component rendering the glass surface; npm scripts `test` (vitest run), `data` (runs the pipeline), `build`.

- [ ] **Step 1:** Run `git init` at the repo root if `.git` is absent. The repo and `.gitignore` already exist (branch `apartment-finder`); confirm `.gitignore` lists `app/node_modules`, `app/.next`, `app/public/data`, `.env*`.
- [ ] **Step 2:** Look up current `create-next-app` flags and Tailwind theme configuration in Context7, then scaffold `app/`.
- [ ] **Step 3:** Write the failing test.

```tsx
// app/src/ui/Glass.test.tsx
it('renders its children inside a glass surface', () => {
  render(<Glass>Building Record</Glass>);
  expect(screen.getByText('Building Record').closest('.glass')).not.toBeNull();
});
it('renders as the requested element', () => {
  render(<Glass as="aside">x</Glass>);
  expect(screen.getByText('x').tagName).toBe('ASIDE');
});
```

- [ ] **Step 4:** Run `npm test` in `app/`. Expected: FAIL, `Glass` not found.
- [ ] **Step 5:** Add Vitest with jsdom and Testing Library. Define the palette and fonts as Tailwind theme tokens in `globals.css`, load both fonts with `next/font/google` in `layout.tsx`, and implement `Glass` plus the `.glass` rule using the exact values in Global Constraints.
- [ ] **Step 6:** Run `npm test` and `npm run build`. Expected: both pass.
- [ ] **Step 7:** Commit.

---

### Task 2: Reading the city's data API

**Files:**
- Create: `app/pipeline/socrata.ts`, `app/pipeline/socrata.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SoqlQuery { select?: string; where?: string; group?: string; order?: string }
/** Reads every row of a dataset, 50,000 per page, ordered for stable paging. */
export function readAll<Row>(datasetId: string, query: SoqlQuery, fetchImpl?: typeof fetch): Promise<Row[]>
export class CityApiError extends Error { constructor(datasetId: string, status: number) }
```

- [ ] **Step 1:** Write the failing tests with an injected fake `fetch`.

```ts
it('pages until a short page arrives', async () => {
  const fetchImpl = fakeFetch([rows(50000), rows(50000), rows(12)]);
  expect(await readAll('6wtj-zbtb', { order: 'case_id' }, fetchImpl)).toHaveLength(100012);
  expect(urlOf(fetchImpl, 2)).toContain('%24offset=100000');
});
it('retries a 429 up to three times, then succeeds', async () => {
  const fetchImpl = fakeFetch([status(429), status(429), rows(3)]);
  expect(await readAll('x', {}, fetchImpl)).toHaveLength(3);
});
it('throws CityApiError after the fourth failure', async () => {
  const fetchImpl = fakeFetch([status(503), status(503), status(503), status(503)]);
  await expect(readAll('x', {}, fetchImpl)).rejects.toBeInstanceOf(CityApiError);
});
it('sends the app token only when SOCRATA_APP_TOKEN is set', async () => { /* header present / absent */ });
```

- [ ] **Step 2:** Run `npm test -- socrata`. Expected: FAIL.
- [ ] **Step 3:** Implement `readAll` against `https://data.austintexas.gov/resource/<id>.json`. Retry on 429 and 5xx with waits of 1 s, 3 s, 9 s (injectable so tests do not sleep). If `query.order` is absent, order by `:id`.
- [ ] **Step 4:** Run `npm test -- socrata`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 3: Apartment parcels and their addresses

**Files:**
- Create: `app/src/domain/types.ts`, `app/pipeline/parcels.ts`, `app/pipeline/addresses.ts`, tests beside each, `app/pipeline/fixtures/parcels.json`, `app/pipeline/fixtures/addresses.json`

**Interfaces:**
- Consumes: `readAll` (Task 2).
- Produces:

```ts
// src/domain/types.ts
export type Category = 'structure' | 'property' | 'landuse' | 'permit';
export type Counts = Record<Category, number>;
export interface RepeatOffender { name: string | null; units: number; activeViolations: number; totalViolations: number }
export interface PublishedUnits { count: number; source: 'repeat-offender' | 'affordable-housing' }
export interface Complex {
  id: string;            // city parcel ID: 10 digits in Travis County, R-prefixed in Williamson County
  address: string;
  lon: number; lat: number;
  acres: number;
  cases12: Counts;       // last 12 months
  cases: Counts;         // since 2023-11-01
  open: number;
  lastCase: string | null;   // ISO date
  repeatOffender: RepeatOffender | null;
  units: PublishedUnits | null;
}

// pipeline/parcels.ts
export interface Parcel { id: string; polygon: GeoJSON.MultiPolygon; lon: number; lat: number; acres: number; bbox: [number, number, number, number] }
export function loadApartmentParcels(fetchImpl?: typeof fetch): Promise<Parcel[]>   // dataset 7vsm-dvxg, land_use = '220'

// pipeline/addresses.ts
export interface AddressPoint { label: string; number: number; lon: number; lat: number }
export function chooseAddress(parcel: Parcel, points: AddressPoint[]): string
export function loadAddressPoints(fetchImpl?: typeof fetch): Promise<AddressPoint[]>   // dataset 9s7j-tygf, address_type = '1'
export function formatAddress(raw: string): string
```

- [ ] **Step 1:** Record fixtures: five real apartment parcels (include `0304070701` and `0234111501`) and the address points within 200 m of each.
- [ ] **Step 2:** Write the failing tests.

```ts
it('merges rows that share a parcel ID into one parcel and sums the area', ...);
it('converts shape_area square feet to acres rounded to one decimal', () => {
  expect(toAcres(453755.49)).toBe(10.4);
});
it('picks the lowest-numbered address point inside the polygon', () => {
  expect(chooseAddress(parcel, [inside(1708), inside(1700), outside(12)])).toBe('1700 Burton Dr');
});
it('falls back to the nearest point within 150 m when none is inside', ...);
it('labels the parcel by ID when nothing is within 150 m', () => {
  expect(chooseAddress(parcel, [farAway()])).toBe('Parcel 0304070701');
});
it('formats city casing', () => {
  expect(formatAddress('1000 W 26TH ST')).toBe('1000 W 26th St');
  expect(formatAddress('8900 N IH 35 SVRD SB')).toBe('8900 N IH 35 SVRD SB');
});
```

- [ ] **Step 3:** Run `npm test -- parcels addresses`. Expected: FAIL.
- [ ] **Step 4:** Implement. Centroid is the mean of the largest ring's vertices. Point-in-polygon by ray casting over all rings; no geometry dependency is needed. Bucket address points in a 0.002 degree grid so matching 441,000 points to 2,500 parcels stays under a few seconds. `formatAddress` title-cases words, keeps ordinals lowercase after the digit, and keeps `IH SH FM RM US NB SB EB WB SVRD` uppercase.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit.

---

### Task 4: Code cases per parcel

**Files:**
- Create: `app/pipeline/cases.ts`, `app/pipeline/cases.test.ts`, `app/pipeline/fixtures/cases.json`
- Modify: `app/src/domain/types.ts` (add `BuildingDetail`; the UI reads it too, and UI code never imports from `pipeline/`)

**Interfaces:**
- Consumes: `readAll`; `Category`, `Counts` (Task 3).
- Produces:

```ts
// src/domain/types.ts (add)
export interface BuildingDetail {
  id: string;
  monthly: { month: string; count: number }[];              // 'YYYY-MM', every month from 2023-11 to the pull month, zeros included
  latest: { opened: string; category: Category; status: string }[];   // newest first, at most 8
  bbox: [number, number, number, number];                   // west, south, east, north; filled in Task 5
}

// pipeline/cases.ts
export interface CaseSummary { cases12: Counts; cases: Counts; open: number; lastCase: string | null; detail: Omit<BuildingDetail, 'bbox'> }
export interface CaseIndex { byParcel: Map<string, CaseSummary>; totalCases: number; unmatchedCases: number; uncategorizedCases: number }
export function categoryOf(description: string): Category | null
export function loadCases(pulledAt: Date, fetchImpl?: typeof fetch): Promise<CaseIndex>    // dataset 6wtj-zbtb
```

- [ ] **Step 1:** Write the failing tests against a hand-built fixture of 12 cases across 2 parcels.

```ts
it('maps the four city descriptions', () => {
  expect(categoryOf('Structure Condition Violation(s)')).toBe('structure');
  expect(categoryOf('Property Abatement')).toBe('property');
  expect(categoryOf('Land Use Violation(s)')).toBe('landuse');
  expect(categoryOf('Work Without Permit')).toBe('permit');
  expect(categoryOf('Property Abatement  Property Abatement')).toBe('property');
  expect(categoryOf('Something New')).toBeNull();
});
it('counts a case opened 11 months before the pull in both periods, 13 months in one', ...);
it('counts status other than Closed as open', ...);
it('fills months with no cases as zero', () => {
  expect(summary.detail.monthly[0]).toEqual({ month: '2023-11', count: 0 });
});
it('keeps the 8 newest cases, newest first', ...);
it('tallies cases with no parcel ID and cases with an unknown description', () => {
  expect(index.unmatchedCases).toBe(2);
  expect(index.uncategorizedCases).toBe(1);
});
it('never requests the inspector column', () => {
  expect(urlOf(fetchImpl, 0)).not.toContain('inspector');
});
```

- [ ] **Step 2:** Run `npm test -- cases`. Expected: FAIL.
- [ ] **Step 3:** Implement. Select only `parcelid, description, status, opened_date` where `opened_date > '2023-11-01'`. `categoryOf` matches on the first recognised phrase.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 5: Assemble and write the data files

**Files:**
- Create: `app/pipeline/context.ts`, `app/pipeline/build.ts`, tests beside each, `app/pipeline/fixtures/repeat-offenders.json`, `app/pipeline/fixtures/housing-inventory.json`

**Interfaces:**
- Consumes: `loadApartmentParcels`, `loadAddressPoints`, `chooseAddress`, `loadCases`, all types above.
- Produces:

```ts
// pipeline/context.ts
export function loadRepeatOffenders(fetchImpl?: typeof fetch): Promise<Map<string, RepeatOffender>>   // dataset 86z9-i27i, keyed by parcelid
export function loadPublishedUnits(fetchImpl?: typeof fetch): Promise<Map<string, number>>           // dataset ifzc-3xz8, parcel_id -> max(total_units)

// src/domain/types.ts (add)
export interface Meta { pulledAt: string; since: '2023-11-01'; complexCount: number; caseCount: number; unmatchedCaseShare: number; uncategorizedCases: number }

// pipeline/build.ts
export const MIN_EXPECTED_COMPLEXES = 2000;
export function buildData(outDir: string, pulledAt: Date, fetchImpl?: typeof fetch, options?: { minComplexes?: number }): Promise<Meta>   // minComplexes defaults to MIN_EXPECTED_COMPLEXES
```

Output: `complexes.json` (`Complex[]`, sorted by `id`), `buildings/<id>.json` (`BuildingDetail`), `meta.json` (`Meta`).

- [ ] **Step 1:** Write the failing tests, driving `buildData` with a fake `fetch` that serves the fixtures.

```ts
it('writes one Complex per apartment parcel, including parcels with no cases', async () => {
  const meta = await buildData(tmp, new Date('2026-11-14'), fixtureFetch, { minComplexes: 1 });
  const complexes = readJson(`${tmp}/complexes.json`);
  expect(complexes).toHaveLength(5);
  expect(complexes.find(c => c.id === '0304070701').cases.structure).toBe(254);
  expect(meta.complexCount).toBe(5);
});
it('prefers Repeat Offender units over the housing inventory when both exist', ...);
it('uses the Repeat Offender establishment name and never an owner field', () => {
  expect(JSON.stringify(readJson(`${tmp}/complexes.json`))).not.toMatch(/owner/i);
});
it('writes a BuildingDetail with the parcel bbox for every complex', ...);
it('writes nothing when any dataset read fails', async () => {
  await expect(buildData(tmp, now, failingOn('6wtj-zbtb'))).rejects.toBeInstanceOf(CityApiError);
  expect(existsSync(`${tmp}/complexes.json`)).toBe(false);
});
it('refuses to write when fewer than MIN_EXPECTED_COMPLEXES come back', ...);   // default floor, 5 fixture parcels; guards against a silently truncated pull
```

- [ ] **Step 2:** Run `npm test -- build context`. Expected: FAIL.
- [ ] **Step 3:** Implement. Build everything in memory, write to a temporary directory, then rename it into place so a failure leaves the old files untouched. Task 5 builds its own cases fixture for this integration test, generated in code so parcel `0304070701` has 254 structure, 24 property, 5 land use and 1 permit case; Task 4's 12-case fixture stays as it is.
- [ ] **Step 4:** Wire `npm run data` to run `buildData('public/data', new Date())`. Add `npm run data:ensure`, which runs `data` only when `public/data/meta.json` is missing or env `REFRESH_DATA=1`, and make `npm run build` run `data:ensure` first. (A fresh deploy checkout never has the files, so every deploy pulls; local rebuilds do not hammer the city API.)
- [ ] **Step 5:** Run the tests. Expected: PASS. Then run `npm run data` once for real. Expected: about 2,500 complexes, `meta.unmatchedCaseShare` near 0.13, and parcel `0304070701` showing 284 cases since Nov 2023 (the figure verified on 2026-11-14; a slightly higher number is fine).
- [ ] **Step 6:** Commit.

---

### Task 6: Filtering, counting and ordering

**Files:**
- Create: `app/src/domain/query.ts`, `app/src/domain/query.test.ts`

**Interfaces:**
- Consumes: `Complex`, `Category`.
- Produces:

```ts
export type Period = 'cases12' | 'cases';
export type CategoryFilter = Category | 'all';
export interface View { period: Period; category: CategoryFilter; repeatOffendersOnly: boolean; order: 'fewest' | 'most' }
export const DEFAULT_VIEW: View   // { period: 'cases12', category: 'all', repeatOffendersOnly: false, order: 'fewest' }
export type Bounds = [west: number, south: number, east: number, north: number];
export function countFor(complex: Complex, view: View): number
export function complexesInView(all: Complex[], bounds: Bounds, view: View): Complex[]   // filtered and ordered
export function viewFromSearchParams(params: URLSearchParams): View
export function viewToSearchParams(view: View): URLSearchParams   // default values are omitted
```

- [ ] **Step 1:** Write the failing tests.

```ts
it('sums all categories for "all" and one for a single category', ...);
it('orders fewest first, and among equal counts puts the larger parcel first', () => {
  const ordered = complexesInView([small0, large0, one], WORLD, DEFAULT_VIEW);
  expect(ordered.map(c => c.id)).toEqual([large0.id, small0.id, one.id]);
});
it('orders most first when asked, ties still largest first', ...);
it('keeps only Repeat Offender properties when the toggle is on', ...);
it('drops complexes outside the bounds', ...);
it('round-trips a view through search params and ignores junk values', () => {
  expect(viewFromSearchParams(new URLSearchParams('period=nope&order=most'))).toEqual({ ...DEFAULT_VIEW, order: 'most' });
});
```

- [ ] **Step 2:** Run `npm test -- query`. Expected: FAIL.
- [ ] **Step 3:** Implement as pure functions.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 7: The map

**Files:**
- Create: `app/src/map/arcticStyle.ts`, `app/src/map/arcticStyle.test.ts`, `app/src/map/BuildingMap.tsx`

**Interfaces:**
- Consumes: `Complex`, `View`, `countFor`, `Bounds`.
- Produces:

```ts
// arcticStyle.ts
export function repaint(baseStyle: StyleSpecification): StyleSpecification   // returns a new style; hides shields, boundaries, airports, flat buildings
export function pinLayers(): LayerSpecification[]     // ids: 'halo', 'core', 'counts', in that order
export function buildingsLayer(): LayerSpecification  // id 'buildings-3d', fill-extrusion, minzoom 13.5
export function toFeatures(complexes: Complex[], view: View): GeoJSON.FeatureCollection   // properties: { id, v, ro }

// BuildingMap.tsx
export interface BuildingMapProps {
  complexes: Complex[]; view: View;
  selectedId: string | null; hoveredId: string | null;
  flyTo: { lon: number; lat: number; zoom: number } | null;
  onBoundsChange(bounds: Bounds): void; onSelect(id: string): void; onHover(id: string | null): void;
  onUnavailable(): void;     // called once if the map cannot start
}
```

Exact values, copied from `mockup/looks.js` and `mockup/app.js`:

| Thing | Value |
|---|---|
| Base style | `https://tiles.openfreemap.org/styles/positron` |
| Land / blocks / water / parks | `#C3D3DC` / `#CCDAE2` (opacity .6) / `#6F93AD` / `#A9C6BE` (opacity .8) |
| Roads / motorway / casing / rail | `#E6EEF2` / `#FFFFFF` / `#B3C6D1` / `#AEC0CB` |
| Labels / city labels | `#2E4F68` / `#0B131F` |
| 3D buildings | `#E1EAEF`, opacity .5 |
| Start view | center `[-97.7431, 30.285]`, zoom 11.6, pitch 52, bearing -12, minZoom 9.5, maxPitch 70 |
| Max bounds | `[[-98.35, 29.95], [-97.2, 30.7]]` |
| Core color by count | 0 `#FFFFFF`, 1 `#E8EFF3`, 8 `#A9BDC9`, 25 `#2E4F68`, 80 `#0B131F` |
| Halo color by count | 0 `#FFFFFF`, 20 `#2E4F68`, 80 `#0B131F`; Repeat Offender `#E9A99E` |
| Core radius | zoom 9.5: 1.6 to 5; zoom 13: 4 to 13; zoom 16: 7 to 22 (count 0 to 80). Halo is 2.4 times that, `circle-blur` 1 |
| Count labels | from zoom 13, only where count > 0; text `#E8EFF3` at 14 or more, else `#0B131F` |
| Sky | sky `#DCE7ED`, horizon `#EDF3F6`, fog `#CBD9E0` |

- [ ] **Step 1:** Look up MapLibre GL JS v6 in Context7: ESM import, worker setup under a bundler (`setWorkerUrl`), `setFeatureState`, `setSky`, fill-extrusion.
- [ ] **Step 2:** Write the failing tests for the pure style functions.

```ts
it('paints water, parks and land in the Arctic palette', () => {
  const style = repaint(positronFixture);
  expect(paintOf(style, 'water')['fill-color']).toBe('#6F93AD');
  expect(paintOf(style, 'background')['background-color']).toBe('#C3D3DC');
});
it('removes shields, boundaries and the flat building layer', () => {
  expect(repaint(positronFixture).layers.some(l => /shield|boundary|^building$/.test(l.id))).toBe(false);
});
it('does not mutate the style it was given', ...);
it('emits one feature per complex with the count for the current view', () => {
  expect(toFeatures([burton], { ...DEFAULT_VIEW, period: 'cases' }).features[0].properties).toEqual({ id: burton.id, v: 284, ro: 1 });
});
it('returns pin layers in halo, core, counts order', ...);
```

- [ ] **Step 3:** Run `npm test -- arcticStyle`. Expected: FAIL.
- [ ] **Step 4:** Implement `arcticStyle.ts`, then `BuildingMap` as a client component loaded with `next/dynamic` and `ssr: false`. It fetches and repaints the base style, adds the layers, mirrors `selectedId` and `hoveredId` into feature state, reports bounds on `moveend`, and calls `onUnavailable` if map creation throws or WebGL is missing. Honor `prefers-reduced-motion` by jumping instead of flying.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit.

---

### Task 8: The main screen

**Files:**
- Create: `app/src/ui/IntroSearch.tsx`, `app/src/ui/Filters.tsx`, `app/src/ui/Tray.tsx`, `app/src/ui/Notice.tsx`, tests beside `Filters` and `Tray`
- Modify: `app/src/app/page.tsx`, `app/src/app/layout.tsx`, `app/src/app/globals.css`

**Interfaces:**
- Consumes: `Glass`, `BuildingMap`, `View`, `DEFAULT_VIEW`, `complexesInView`, `countFor`, `viewFromSearchParams`, `viewToSearchParams`, `Complex`, `Meta`.
- Produces:

```ts
export function Filters(props: { view: View; onChange(view: View): void }): JSX.Element
export function Tray(props: { complexes: Complex[]; view: View; selectedId: string | null; hoveredId: string | null;
  onSelect(id: string): void; onHover(id: string | null): void; onToggleOrder(): void; onJump(area: Area): void }): JSX.Element
export interface Area { name: string; lon: number; lat: number }
export const AREAS: Area[]
export function Notice(props: { meta: Meta }): JSX.Element
```

Fixed copy and values:
- Title: `Building Record`. Line under it: `Austin apartments, seen through the city's own complaint files.`
- Search placeholder: `Search an Austin address`.
- Filter labels: `12 months`, `Since 2023`; `All`, `Structure`, `Property`, `Land use`, `Permits`; `Repeat Offenders`.
- Order toggle: `Fewest first` / `Most first`.
- Tray count: `<n> complexes in view` (`1 complex in view`).
- Card: the count in weight 200; `None` in italic Instrument Serif when zero; caption `code cases` / `code case` / `no cases on file`; address; second line `Mostly <category label, lowercase>` or `<acres> acres` when there are no cases; a coral `Repeat Offender` tag when applicable.
- Category labels: `Structure condition`, `Property upkeep`, `Land use`, `Work without permit`.
- The tray renders at most 40 cards, then one card reading `<n> more in view. Zoom in to narrow them down.` Empty state: `No apartment complexes in this part of the map. Zoom out or jump to an area.`
- Each tray card is a `<button data-testid="card">`.
- `AREAS`: Downtown `[-97.7431, 30.2680]`, The Domain `[-97.7220, 30.4020]`, East Riverside `[-97.7250, 30.2370]`, South Lamar `[-97.7700, 30.2480]`, Rundberg `[-97.7030, 30.3620]`, Mueller `[-97.7050, 30.2980]`; jump zoom 13.9.
- A fixed, click-through fog layer sits between the map and the panels: ice at 88% fading out by 36% from the top, slate at 30% fading out by 40% from the bottom (the `.mist` rule in `mockup/styles.css`).
- Layout and sizes: copy from `mockup/styles.css` (intro 340 px wide; cards 232 by 148 px; panel radius 28 px, card radius 22 px; phone breakpoint 760 px).

- [ ] **Step 1:** Write the failing tests.

```tsx
it('marks the active period and reports a change', async () => {
  const onChange = vi.fn();
  render(<Filters view={DEFAULT_VIEW} onChange={onChange} />);
  expect(screen.getByRole('button', { name: '12 months' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Since 2023' }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, period: 'cases' });
});
it('shows None for a complex with no cases and the count otherwise', ...);
it('caps the tray at 40 cards and says how many more are in view', ...);
it('shows the empty message when nothing is in view', ...);
it('tags Repeat Offender properties', ...);
it('never renders the words score, grade, rating or rank', () => {
  render(<Tray complexes={sample} {...handlers} view={DEFAULT_VIEW} selectedId={null} hoveredId={null} />);
  expect(document.body.textContent).not.toMatch(/score|grade|rating|rank/i);
});
```

- [ ] **Step 2:** Run `npm test -- Filters Tray`. Expected: FAIL.
- [ ] **Step 3:** Implement the components. `page.tsx` is a server component that reads `public/data/complexes.json` and `public/data/meta.json` from disk and hands them to one client component holding `view`, `bounds`, `selectedId` and `hoveredId`. The view is kept in the URL query string so a filtered map can be shared.
- [ ] **Step 4:** Run the tests and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 9: A building's record

**Files:**
- Create: `app/src/ui/BuildingPanel.tsx`, `app/src/ui/BuildingPanel.test.tsx`, `app/src/city/requests311.ts`, `app/src/city/requests311.test.ts`, `app/src/app/building/[id]/page.tsx`
- Modify: the client component from Task 8 (open the panel on selection)

**Interfaces:**
- Consumes: `Complex`, `BuildingDetail`, `View`, `Glass`.
- Produces:

```ts
export function BuildingPanel(props: { complex: Complex; detail: BuildingDetail; view: View; onClose?(): void }): JSX.Element
// city/requests311.ts
export interface RequestTypeCount { type: string; count: number }
export function load311Summary(bbox: BuildingDetail['bbox'], fetchImpl?: typeof fetch): Promise<RequestTypeCount[]>   // top 6 types since 2023-11-01, dataset xwdj-i9he
```

Content, top to bottom: address; `Apartment parcel, <acres> acres` plus `, <n> units` when published; Repeat Offender note (`On the city's Repeat Offender list`, name, units, `<active> active of <total> total violations`); the count for the current period with caption; three figures (the other period, `open now`, latest case date); `What the cases were about` (four bars); `Month by month` (one bar per month, each `data-testid="month-bar"`, caption `Busiest month: <n>`); `Latest cases` (date, category label, status); `311 requests at this address` (loaded in the browser); source line linking `https://data.austintexas.gov/d/6wtj-zbtb` and `https://data.austintexas.gov/d/xwdj-i9he`, followed by: `No cases means none reached Code Enforcement. It does not mean the building has no problems.`

- [ ] **Step 1:** Write the failing tests.

```tsx
it('leads with the count for the active period', ...);
it('shows None and "no code cases" for a clean building', ...);
it('shows units only when the city publishes them', ...);
it('renders one bar per month', () => { expect(screen.getAllByTestId('month-bar')).toHaveLength(detail.monthly.length); });
it('says so when the 311 lookup fails, and keeps everything else', async () => {
  render(<BuildingPanel {...props} />);   // with load311Summary rejecting
  expect(await screen.findByText('311 requests could not be loaded from the city right now.')).toBeVisible();
  expect(screen.getByText('What the cases were about')).toBeVisible();
});
it('queries 311 by the parcel box and the history start date', async () => {
  await load311Summary([-97.73, 30.2365, -97.7265, 30.2395], fetchImpl);
  expect(decodeURIComponent(urlOf(fetchImpl, 0))).toContain('within_box(sr_location_lat_long, 30.2395, -97.73, 30.2365, -97.7265)');
});
```

- [ ] **Step 2:** Run `npm test -- BuildingPanel requests311`. Expected: FAIL.
- [ ] **Step 3:** Implement. On the map screen the panel fetches `/data/buildings/<id>.json` on selection and rises in as in the mockup; on phones it is a bottom sheet 72% of the viewport tall. `building/[id]/page.tsx` is statically generated for every complex (`generateStaticParams`), renders the same panel full-width without a map, and sets the page title to `<address>: code complaint record`.
- [ ] **Step 4:** Run the tests and `npm run build`. Expected: PASS, with about 2,500 building pages generated.
- [ ] **Step 5:** Commit.

---

### Task 10: Address search

**Files:**
- Create: `app/src/city/addressSearch.ts`, `app/src/city/addressSearch.test.ts`
- Modify: `app/src/ui/IntroSearch.tsx`

**Interfaces:**
- Produces:

```ts
export interface AddressMatch { label: string; lon: number; lat: number; complexId: string | null }
/** Complexes first (matched locally), then other city addresses (dataset 9s7j-tygf). At most 6. */
export function searchAddresses(text: string, complexes: Complex[], fetchImpl?: typeof fetch): Promise<AddressMatch[]>
export function escapeSoql(text: string): string
```

- [ ] **Step 1:** Write the failing tests.

```ts
it('returns nothing for fewer than 3 characters without calling the city', ...);
it('lists matching complexes before other addresses and caps at 6', ...);
it('escapes quotes and wildcards', () => {
  expect(escapeSoql(`o'brien%_`)).toBe(`o''brien\\%\\_`);
});
it('still returns complex matches when the city lookup fails', ...);
```

- [ ] **Step 2:** Run `npm test -- addressSearch`. Expected: FAIL.
- [ ] **Step 3:** Implement. Query `upper(full_street_name) like upper('<escaped>%')`, limit 6. In `IntroSearch`, wait 250 ms after typing stops; choosing a complex selects it, choosing any other address flies the map there at zoom 15. No match: `No Austin address starts with that.`
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 11: Method page, fallbacks and end-to-end checks

**Files:**
- Create: `app/src/app/method/page.tsx`, `app/e2e/finder.spec.ts`, `app/playwright.config.ts`
- Modify: the client component from Task 8 (map-unavailable state), `app/src/app/layout.tsx` (footer `Notice`)

**Interfaces:**
- Consumes: `Meta`, `Notice`, `onUnavailable` from `BuildingMapProps`.

Method page states, in plain language: where the data comes from (four datasets, linked); that history starts November 2023; the four complaint categories and that the city does not record pests or mold specifically; that `meta.unmatchedCaseShare` of cases have no parcel and are left out; that buildings are shown by raw count with parcel size because unit counts are not available for most; that no cases does not mean no problems; that this is not a City site.

- [ ] **Step 1:** Write the failing Playwright specs (run against `npm run build && npm start`, desktop and a 375 by 812 phone project).

```ts
test('pick an area, open a building, see its record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'East Riverside' }).click();
  await expect(page.getByText(/complexes in view/)).toBeVisible();
  await page.getByRole('button', { name: 'Fewest first' }).click();
  await page.locator('[data-testid="card"]').first().click();
  await expect(page.getByText('What the cases were about')).toBeVisible();
});
test('a filtered view survives a reload', async ({ page }) => {
  await page.goto('/?period=cases&order=most');
  await expect(page.getByRole('button', { name: 'Since 2023' })).toHaveAttribute('aria-pressed', 'true');
});
test('the tray and building pages work when the map cannot start', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('/');
  await expect(page.getByText('The map could not load on this device. You can still browse the list below.')).toBeVisible();
  await expect(page.locator('[data-testid="card"]').first()).toBeVisible();
});
test('every page carries the not-official notice and the pull date', ...);
test('nothing scrolls sideways on a phone', ...);
test('a building page is reachable directly', async ({ page }) => {
  await page.goto('/building/0304070701');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Burton');
});
```

- [ ] **Step 2:** Run `npx playwright test`. Expected: FAIL.
- [ ] **Step 3:** Implement the method page, the footer notice, and the map-unavailable state (when there is no map, the tray lists all complexes citywide, ordered by the current view).
- [ ] **Step 4:** Run `npm test` and `npx playwright test`. Expected: PASS. Check keyboard access by hand: every control reachable by Tab with a visible focus ring, panel closable with Escape.
- [ ] **Step 5:** Commit.

---

### Task 12: Publish and refresh nightly

**Stop before this task and get Gabe's go-ahead. It creates a public site and external accounts' resources.**

**Files:**
- Create: `.github/workflows/nightly-refresh.yml`, `app/README.md`

- [ ] **Step 1:** With Gabe: create the GitHub repository and the Vercel project (root directory `app`), and set `SOCRATA_APP_TOKEN` in Vercel. Gabe registers the token at data.austintexas.gov and creates a Vercel Deploy Hook; its URL goes in the GitHub secret `VERCEL_DEPLOY_HOOK`.
- [ ] **Step 2:** Write the workflow: on `schedule` (`cron: '30 9 * * *'`, 3:30 or 4:30 AM Central) and `workflow_dispatch`, `curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"`. The Vercel build runs `npm run build`, which runs the pipeline; a failed pull fails the build and the previous deployment stays live.
- [ ] **Step 3:** Trigger the workflow by hand. Expected: a new deployment whose footer shows today's pull date.
- [ ] **Step 4:** Spot-check ten buildings against the city portal: the count since Nov 2023 on the site equals a portal query on `parcelid` for the same dates. Record the ten parcel IDs and results in `app/README.md`.
- [ ] **Step 5:** Write `app/README.md`: what the site is, `npm run data`, `npm test`, `npx playwright test`, how the nightly refresh works, the data credits and license notes.
- [ ] **Step 6:** Commit.
