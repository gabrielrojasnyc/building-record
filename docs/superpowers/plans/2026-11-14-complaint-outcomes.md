# Complaint Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every count on the site becomes "complaints" with duplicates left out, each complaint carries the city's outcome in plain words, categories explain themselves and open to show detail, and three rolling periods (12 months, 2 years, 3 years) replace the two there are now.

**Architecture:** The pipeline reads four more fields of each code case, classifies it into one of five outcomes by rules grounded in the city's own violation case numbers, and writes per-complex tallies by period, category and outcome plus the full complaint list in each building's file. The browser never classifies; it sums tallies. Task 1 adds the new data beside the old so the site keeps working; Task 2 moves every count onto it and removes the old fields.

**Tech Stack:** unchanged.

**Spec:** `docs/2026-11-14-complaint-outcomes-design.md`.

**Runs after** `docs/superpowers/plans/2026-11-14-building-spotlight.md` is complete: its Task 4 reshapes the record panel and tray that Tasks 2 and 3 here build on.

## Global Constraints

- Everything in the two earlier plans' constraints still holds: palette tokens only, no em dashes or double dashes, no score or ranking language, no names of people, `src/` never imports from `pipeline/`, the notice on every page.
- Never read or emit `inspector` (code cases) or `owner` (Repeat Offender datasets).
- The only city outcome text ever shown is a phrase on the allow-list. Anything else is shown as `Other update`.
- A complaint is called a violation only under the "Violation confirmed" rule below. No other wording may imply one.
- Outcomes are never colored as good or bad and never combined into one figure. Counts only.
- The word is `complaints` (`1 complaint`). The phrases `code case` and `code cases` must not remain in the UI.
- Exact labels: outcomes `Violation confirmed`, `Fixed at inspection`, `No violation found`, `Referred or closed without a finding`, `Still being looked into`; categories `Building condition`, `Trash and grounds`, `Signs, zoning and use`, `Work without a permit`; periods `12 months`, `2 years`, `3 years`.
- Commit after every task, with a message that says why.

## Decisions made in this plan

1. **Classification order** (first match wins), from the design, with one addition found in the data: an outcome phrase that says a violation was found counts as confirmed even without a case number.
   1. `duplicate`: the city outcome is `Closed/Duplicate Case`.
   2. `violation`: a violation case number is present, or the outcome contains `Violation(s) Found` not preceded by `No `.
   3. `fixed`: the outcome is `Inspection Performed/Abated by Inspector`, `Inspection Performed/Abated by Community Court` or `Inspection Performed/ Voluntary Compliance`.
   4. `none`: the outcome contains `No Violation(s) Found`.
   5. `open`: the status is not `Closed`.
   6. `other`: everything else.
2. **Periods are rolling and inclusive:** a complaint is in a period when it was opened on or after the same day of the month N years before the Austin pull date, and not after the pull date. Keys `m12`, `y2`, `y3`. The pipeline reads cases opened on or after the `y3` start. The fixed `2023-11-01` start is retired; the method page still says the city's data is sparse before November 2023, which is why there is no longer period.
3. **Tallies, not dates, go to the browser.** `Complex.tally[period][category][outcome]` with zeros omitted. Duplicates are in `Complex.duplicates[period]`, never in a tally.
4. **The allow-list lives in `src/domain/outcomes.ts`** so the pipeline and the method page read the same list.
5. **Deficiencies:** Repeat Offender Property Deficiencies (`ge82-ij4h`), last 3 years, grouped per complex by category and kind, with the trailing section reference (for example ` (§304.7)`) removed from the kind.
6. **URL values** for `period` are `2y` and `3y`; 12 months is the default and is omitted. Unknown values fall back to the default.

## Review Focus

- **A new outcome phrase appears in the city's data:** it must classify by the rules, show as `Other update`, and be counted in the build report, never printed. Test in Task 1.
- **A violation case that is still open:** counted under `Violation confirmed` and also in "still open", never under `Still being looked into`. Test in Task 1.
- **A complaint opened exactly on a period's first day, and one opened the day before:** in and out respectively, for all three periods, including a pull on 29 February. Test in Task 1.
- **A building whose every complaint is a duplicate or outside the period:** shows `None` and says how many duplicates were left out, without a divide-by-zero or an empty outcome list. Test in Tasks 2 and 3.
- **A Repeat Offender deficiency whose category the app does not recognize:** skipped and counted, not shown under a wrong heading. Test in Task 1.

---

### Task 1: Outcomes, periods and deficiencies in the data

**Files:**
- Create: `app/src/domain/outcomes.ts`, `app/src/domain/outcomes.test.ts`, `app/src/domain/periods.ts`, `app/src/domain/periods.test.ts`
- Modify: `app/src/domain/types.ts`, `app/pipeline/cases.ts`, `app/pipeline/context.ts`, `app/pipeline/merge.ts`, `app/pipeline/build.ts`, their tests

**Interfaces:**
- Consumes: `readAll`, `austinCalendarDate`, `combineParcels`, `buildData` as they stand.
- Produces (all additive; nothing existing is removed in this task):

```ts
// src/domain/periods.ts
export type Period = 'm12' | 'y2' | 'y3';
export const PERIODS: readonly Period[];                       // ['m12', 'y2', 'y3']
export const PERIOD_LABEL: Record<Period, string>;             // '12 months', '2 years', '3 years'
export const PERIOD_PHRASE: Record<Period, string>;            // 'in the last 12 months', 'in the last 2 years', 'in the last 3 years'
/** First day of each period for a pull date (YYYY-MM-DD in, YYYY-MM-DD out). 29 Feb steps back to 28 Feb. */
export function periodStarts(pulledAt: string): Record<Period, string>;

// src/domain/outcomes.ts
export type Outcome = 'violation' | 'fixed' | 'none' | 'other' | 'open';
export const OUTCOMES: readonly Outcome[];                     // display order: violation, fixed, none, other, open
export const OUTCOME_LABEL: Record<Outcome, string>;
export const KNOWN_CITY_OUTCOMES: readonly string[];           // every phrase the city uses today, exactly as written
export function classify(input: { cityOutcome: string | null; status: string; hasViolationCase: boolean }): Outcome | 'duplicate';

// src/domain/types.ts (add)
export type Tally = Partial<Record<Category, Partial<Record<Outcome, number>>>>;
export interface Complaint {
  opened: string;                    // YYYY-MM-DD
  closed: string | null;
  category: Category;
  outcome: Outcome;
  stillOpen: boolean;                // the case is not closed
  cityOutcome: string | null;        // an allow-listed phrase, else null
  violationCase: { number: string; url: string | null } | null;
}
export interface Deficiency { category: Category; kind: string; cleared: number; notCleared: number }
// Complex gains:        tally: Record<Period, Tally>;  duplicates: Record<Period, number>;  violationsOpen: number;
// BuildingDetail gains: complaints: Complaint[];       (3 years, newest first, duplicates left out)
//                       deficiencies: Deficiency[];    (empty unless on the Repeat Offender list)
// Meta gains:           periodStarts: Record<Period, string>;  duplicateCases: number;  unrecognizedOutcomes: number;  skippedDeficiencies: number;
```

Fixed values:
- Code cases: add `last_update`, `closed_date`, `violationcasenumber`, `violationcaselink` to the select (the link column is an object with a `url`). Still never `inspector`.
- `KNOWN_CITY_OUTCOMES`: record the live distinct `last_update` values for cases opened in the last 3 years at implementation time (43 phrases on 2026-11-14, among them `No Violation(s) Found/Inspection Performed`, `Closed due to Voluntary Compliance`, `Closed/Duplicate Case`, `Follow-up Inspection`, `Send CV Notice`, `CV Violation(s) Found/Inspection Performed`). Compare trimmed, exact.
- A violation case URL is kept only when it starts with `https://abc.austintexas.gov/`.
- Deficiencies: select `parcelid, violationcategory, deficiencycategory, deficiencyindate, deficiencystatus`; where `deficiencyindate` is on or after the `y3` start; order `parcelid,:id`. Category by prefix: `Structure Condition` to `structure`, `Property Abatement` to `property`, `Land Use` to `landuse`; anything else is skipped and counted. `deficiencystatus` `Cleared` counts as cleared, anything else as not cleared. New floor `MIN_EXPECTED_DEFICIENCY_ROWS = 2_000` (live: 5,376), overridable like the others.
- The build refuses to write when unrecognized outcome phrases exceed 1% of cases read.

- [ ] **Step 1:** Write the failing tests.

```ts
// outcomes.test.ts: one row per rule, plus order
it.each([
  [{ cityOutcome: 'Closed/Duplicate Case', status: 'Closed', hasViolationCase: false }, 'duplicate'],
  [{ cityOutcome: 'Closed due to Voluntary Compliance', status: 'Closed', hasViolationCase: true }, 'violation'],
  [{ cityOutcome: 'Follow-up Inspection', status: 'Active', hasViolationCase: true }, 'violation'],
  [{ cityOutcome: 'CV Violation(s) Found/Inspection Performed', status: 'Active', hasViolationCase: false }, 'violation'],
  [{ cityOutcome: 'Inspection Performed/Abated by Inspector', status: 'Closed', hasViolationCase: false }, 'fixed'],
  [{ cityOutcome: 'No Violation(s) Found/Inspection Performed', status: 'Closed', hasViolationCase: false }, 'none'],
  [{ cityOutcome: 'City-Owned Property/No Violation(s) Found', status: 'Closed', hasViolationCase: false }, 'none'],
  [{ cityOutcome: 'Inspection Performed', status: 'Active', hasViolationCase: false }, 'open'],
  [{ cityOutcome: null, status: 'Pending', hasViolationCase: false }, 'open'],
  [{ cityOutcome: 'Referred to Appropriate Agency', status: 'Closed', hasViolationCase: false }, 'other'],
  [{ cityOutcome: 'Something the city invented yesterday', status: 'Closed', hasViolationCase: false }, 'other'],
])('classifies %o as %s', (input, expected) => expect(classify(input)).toBe(expected));
it('a duplicate with a violation case number is still a duplicate', ...);

// periods.test.ts
it('starts each period on the same day N years back', () => {
  expect(periodStarts('2026-11-14')).toEqual({ m12: '2025-11-14', y2: '2024-11-14', y3: '2023-11-14' });
});
it('steps back from 29 February', () => expect(periodStarts('2028-02-29').m12).toBe('2027-02-28'));

// cases.test.ts and build.test.ts
it('tallies by period, category and outcome, leaving duplicates out and counting them apart', ...);
it('counts a complaint opened on a period start and leaves out the day before, for all three periods', ...);
it('counts an open violation case under violation and in violationsOpen, not under open', ...);
it('publishes only allow-listed outcome text and counts the rest', ...);
it('drops a violation case link that is not on the city permit site', ...);
it('never requests inspector or owner', ...);
it('groups deficiencies by category and kind, strips the section reference, and skips unknown categories', ...);
it('refuses to write when unknown outcome phrases pass 1% of cases', ...);
it('combines tallies, complaints and deficiencies across a merged complex', ...);
```

- [ ] **Step 2:** Run `npm test -- outcomes periods cases context build merge`. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep writing `cases12`, `cases`, `latest` and the existing `monthly` exactly as today; the new fields sit beside them.
- [ ] **Step 4:** Run the tests, lint and tsc. Then `REFRESH_DATA=1 npm run data` and report: `meta.json`; citywide counts per outcome for `y3` (compare with the design's table); the complex at `2000 Burton Dr` with its tally, duplicates and deficiencies; the largest building file; the total size of `public/data`. For three complexes, check each outcome count for `y3` against a direct portal query and report both numbers.
- [ ] **Step 5:** Commit.

---

### Task 2: Every count moves to complaints and three periods

**Files:**
- Modify: `app/src/domain/query.ts`, `app/src/domain/labels.ts`, `app/src/domain/history.ts`, `app/src/domain/types.ts`, `app/src/map/arcticStyle.ts`, `app/src/ui/Filters.tsx`, `app/src/ui/Tray.tsx`, `app/src/ui/Finder.tsx`, `app/src/ui/BuildingPanel.tsx` (counts only), `app/src/city/requests311.ts`, `app/src/app/building/[id]/page.tsx`, `app/pipeline/cases.ts`, `app/pipeline/merge.ts`, `app/pipeline/build.ts`, their tests, `app/e2e/finder.spec.ts`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:

```ts
// src/domain/query.ts
export interface View { period: Period; category: CategoryFilter; repeatOffendersOnly: boolean; order: 'fewest' | 'most' }   // Period now from periods.ts
export const DEFAULT_VIEW: View;                                               // period 'm12'
export function countFor(complex: Complex, view: View): number;                // complaints in the tally, duplicates never included
export function outcomeSplit(complex: Complex, view: View): Record<Outcome, number>;
// labels.ts
export const CATEGORY_LABEL: Record<Category, string>;                         // the four new names
export const CATEGORY_MEANING: Record<Category, string>;                       // the one-line explanations from the design
export const CITY_CATEGORY_TERM: Record<Category, string>;                     // 'Structure Condition', 'Property Abatement', 'Land Use', 'Work Without Permit'
```

What changes:
- `cases12`, `cases` and `latest` are removed from the types, the pipeline and every caller. `monthly` covers the 3-year window and leaves duplicates out. `open` counts complaints that are not closed, duplicates left out.
- Filter bar: three period buttons. Query string as in Decision 6.
- Pins, tooltips, tray count, card numbers, search, building pages: complaints for the view.
- Card: the figure, the caption `complaints` or `complaint` or `no complaints on file`, then the two largest outcomes for the view on one line in lower case with their counts (`97 violations confirmed, 78 no violation found`; singular `1 violation confirmed`); a zero figure keeps its existing lines. The "Mostly ..." line is dropped; the outcome line replaces it. A named complex still shows its address.
- The panel's lead figure and three small figures use the new counts: the lead is the active period, the other two periods fill the first two small figures, the third is `open now`. Everything else in the panel is Task 3.
- 311 summary: counted from the `y3` start in `meta.periodStarts`; its text says `in the last 3 years`.
- Wording: `complaints` everywhere.

- [ ] **Step 1:** Write the failing tests: `countFor` and `outcomeSplit` for each period and a single category; duplicates never counted; `viewFromSearchParams` for `2y`, `3y`, junk and the retired `cases`; card lines for one outcome, two outcomes and none; no remaining `code case` in rendered UI (render Tray, Filters and the panel and assert the text). Update the end-to-end specs for three periods and the new words.
- [ ] **Step 2:** Run `npm test` and `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, lint, tsc, `REFRESH_DATA=1 npm run data`, `npm run e2e` twice. Expected: PASS. Report the size of `/` and of `complexes.json` before and after.
- [ ] **Step 5:** Commit.

---

### Task 3: The outcome summary and categories that open

**Files:**
- Create: `app/src/ui/OutcomeSummary.tsx`, `app/src/ui/CategoryDetail.tsx`, tests beside each
- Modify: `app/src/ui/BuildingPanel.tsx`, `app/src/app/globals.css`, `app/e2e/finder.spec.ts`

**Interfaces:**
- Consumes: `Complex`, `BuildingDetail`, `Complaint`, `Deficiency`, `View`, `outcomeSplit`, `OUTCOME_LABEL`, `OUTCOMES`, `CATEGORY_LABEL`, `CATEGORY_MEANING`, `CITY_CATEGORY_TERM`, `PERIODS`, `PERIOD_LABEL`.
- Produces:

```tsx
export function OutcomeSummary(props: { split: Record<Outcome, number>; violationsOpen: number; duplicates: number }): JSX.Element;
export function CategoryDetail(props: { category: Category; complex: Complex; complaints: Complaint[]; deficiencies: Deficiency[]; view: View; isRepeatOffender: boolean }): JSX.Element;
```

The panel, under its header, in this order:
1. The lead figure and small figures (from Task 2).
2. `What the city found`: one row per outcome with a count above zero, in `OUTCOMES` order. `Violation confirmed` adds `<n> still open` when any are. Beneath, when duplicates were left out: `<n> duplicate reports not counted` (`1 duplicate report not counted`).
3. `What the complaints were about`: one row per category, each a button with `aria-expanded` that opens its detail in place. Only one is open at a time. Rows with zero complaints in 3 years are shown but cannot open.
4. An open category shows, in order: its meaning, then `The city calls this <term>.`; the three period counts side by side with the active one marked; `What the city found` for this category and the active period; for a Repeat Offender property, `Problems the city recorded here` with each kind, its count and `<n> not cleared` or `all cleared`, largest first, at most 8 with `and <n> more kinds`; for any other property nothing in that place; then `Complaints, newest first`: date, the outcome label (with `, still open` or `, closed <date>` for a confirmed violation), the city's phrase in small text when allow-listed, and a link `city record` (new tab, `rel="noopener"`) when a violation case URL exists. At most 12 complaints, then a `Show all <n>` button.
5. `Month by month`, the 311 section and the source line, as they are.

Empty states: no complaints in 3 years shows `None` with `no complaints in the last 3 years`, no outcome list and no category rows. No complaints in the active period but some in 3 years shows `None` for the lead and keeps the categories, whose rows show their 3-year counts.

- [ ] **Step 1:** Write the failing tests for each numbered item, each empty state, keyboard opening and closing (Enter and Space on a row), the 12-row cap, and that a link's `href` is the URL from the data. End to end: open a building, open `Building condition`, see its meaning and at least one complaint row; for a Repeat Offender property (found by reading `complexes.json`), see `Problems the city recorded here`.
- [ ] **Step 2:** Run `npm test` and `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement, in the panel's existing glass style. No new colors.
- [ ] **Step 4:** `npm test`, lint, tsc, `npm run e2e` twice. Then check the production build in a browser at 1440 by 900 and 375 by 812 on three buildings: one Repeat Offender property with many complaints, one with a handful, one with none. Save screenshots.
- [ ] **Step 5:** Commit.

---

### Task 4: The method page and a check against the city

**Files:**
- Modify: `app/src/app/method/page.tsx`, its test, `app/e2e/finder.spec.ts`, `app/README.md` only if it already describes the data

**Interfaces:**
- Consumes: `KNOWN_CITY_OUTCOMES`, `classify`, `OUTCOME_LABEL`, `CATEGORY_LABEL`, `CATEGORY_MEANING`, `CITY_CATEGORY_TERM`, `Meta`.

The method page gains or changes:
- **What counts:** complaints from Austin Code Complaint Cases; duplicates are left out, with the citywide number from `meta.duplicateCases`.
- **How outcomes are decided:** the six rules in plain words, in order, and a table of every phrase in `KNOWN_CITY_OUTCOMES` with the outcome it usually lands in, generated by calling `classify` for a closed case without a violation case number, plus the sentence that a violation case number always means `Violation confirmed`. The number of unrecognized phrases from `meta.unrecognizedOutcomes` when above zero.
- **What "Violation confirmed" means and does not:** the city opened a formal violation case. It does not say the violation was serious, who was responsible, or that it remains.
- **The categories:** the four names with their meanings and the city's terms, and that the examples come from the kinds of problem the city recorded at Repeat Offender properties.
- **Recorded problems:** from Repeat Offender Property Deficiencies (`https://data.austintexas.gov/d/ge82-ij4h`), published only for properties in that program, last 3 years.
- **Periods:** the three rolling periods and their start dates from `meta.periodStarts`; the city's data is sparse before November 2023, which is why there is no longer one.
- Remove every statement the earlier page made that is no longer true (the two-period wording, "since November 2023" as a period, "code cases").

- [ ] **Step 1:** Write the failing tests: every allow-listed phrase appears once in the table; the six rules appear in order; the three period start dates come from the fixture meta; none of the retired phrases remain.
- [ ] **Step 2:** Run `npm test -- method`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Verify against the city: write a script under the scratchpad (not committed) that, for ten complexes (three Repeat Offender, three mid-sized, three with one or two complaints, one merged), queries the portal directly for each period and outcome using the rules in plain SoQL and compares with `complexes.json`. Put the table of expected and actual in the report. Any mismatch is a finding to explain or fix.
- [ ] **Step 5:** `npm test`, lint, tsc, `npm run e2e` twice. Commit.
