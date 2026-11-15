# Complaint Outcomes, Clearer Categories and Three Periods: Design

Date: 2026-11-14. Status: approved by Gabe on 2026-11-14. Plan: `docs/superpowers/plans/2026-11-14-complaint-outcomes.md`. Adds to `2026-11-14-apartment-finder-design.md`.

## Intent

Gabe, using the site: the labels "Structure condition", "Property upkeep" and "Land use" do not say what is going on at a building. He asked for something clearer, for a click on a category to show details and a summary of the violations, and for a 2-year period beside 12 months and 3 years.

Checking the city's data for this turned up something bigger than a wording fix. The site counts every case the same, but the city records how each one ended, and four in ten ended with no violation found. Showing that is both clearer and fairer.

## What the city records about each case (checked live on 2026-11-14)

82,384 cases since November 2023 in Austin Code Complaint Cases (`6wtj-zbtb`). Fields the site has not been reading:

| Field | What it holds | Filled |
|---|---|---|
| `last_update` | The inspector's last recorded outcome, from a fixed list of 44 phrases | 99.8% |
| `violationcasenumber`, `violationcaselink` | Present when the complaint led to a formal violation case, with a link to the city's public record | 28.7% |
| `closed_date` | When the case closed | 96.7% |

How the outcomes fall, citywide:

| What happened | Cases | Share |
|---|---|---|
| No violation found | 33,837 | 41% |
| Formal violation case opened | 23,613 | 29% |
| Duplicate of another complaint | 11,137 | 14% |
| Problem dealt with at the inspection, no formal case | 6,836 | 8% |
| Referred to another agency, cancelled or closed without a finding | about 6,500 | 8% |
| Still being looked into, no violation case yet | about 480 | under 1% |

The split between "formal violation case" and the rest is the city's own: every case closed as voluntary compliance, abatement or legal action carries a violation case number, and no case closed as "no violation found" does.

One more source: Repeat Offender Property Deficiencies (`ge82-ij4h`) lists the specific problems the city recorded at the 78 Repeat Offender properties, 5,376 of them in the last three years, each with a kind (for example "Roofs and Drainage"), a broad category, a date and whether it was cleared.

## Decisions Gabe made

- **The big number is all complaints, with the outcome split under it** (2026-11-14). Not confirmed violations only.

## Decisions (Claude's calls, open to change)

1. **The word is "complaints".** It replaces "code cases" everywhere. It is what the city's dataset is called and what the records are.
2. **Duplicates are not counted.** A complaint the city closed as a duplicate of another is left out of every number. Each building's record says how many were left out.
3. **Five outcomes, in plain words,** decided for each complaint in this order:

   | Shown as | Rule |
   |---|---|
   | (not counted) Duplicate report | The city's outcome is "Closed/Duplicate Case" |
   | **Violation confirmed** | The complaint has a violation case number. Marked "still open" when the case is not closed |
   | **Fixed at inspection** | Outcome is one of: Inspection Performed/Abated by Inspector, Inspection Performed/Abated by Community Court, Inspection Performed/ Voluntary Compliance |
   | **No violation found** | Outcome contains "No Violation(s) Found" |
   | **Still being looked into** | The case is not closed |
   | **Referred or closed without a finding** | Everything else that is closed |

4. **Only the city's known outcome phrases are ever shown.** The 44 phrases seen today form an allow-list. An unknown phrase is shown as "Other update" and counted in the build report, so free text an inspector might one day type never reaches the site.
5. **Plain category names, each with one line on what it covers,** written from the kinds of problem the city recorded at Repeat Offender properties:

   | City's term | Shown as | What it covers |
   |---|---|---|
   | Structure Condition | **Building condition** | The buildings themselves: electrical, plumbing, roofs, walls, stairs and balconies, heating and appliances, pests |
   | Property Abatement | **Trash and grounds** | The land around them: trash, dumping, overgrowth and other unsanitary conditions |
   | Land Use | **Signs, zoning and use** | Site rules: required signs, what the property is used for, and what may be built there |
   | Work Without Permit | **Work without a permit** | Construction, repair or demolition done without the city permit it needed |

   The city's own term is shown beside each, so anyone can look it up.
6. **Three rolling periods: 12 months, 2 years, 3 years,** counted back from the day the data was pulled. "3 years" replaces "Since Nov 2023". The city's data now covers a full three years, so all three are complete.
7. **A category row opens in place.** No new screen.
8. **Recorded problems are shown only where the city publishes them,** which is Repeat Offender properties. For other buildings the section does not appear, and the method page says why.

## What a person sees

On a card in the tray and on a map pin: the number of complaints for the chosen period and type, duplicates excluded. Under the number on the card, the two largest outcomes in a line, for example "97 violations confirmed, 78 none found".

In the record panel, under the photo and name:

```
201 complaints in the last 3 years           43 duplicate reports not counted

What the city found
  Violation confirmed            97    4 still open
  Fixed at inspection             1
  No violation found             78
  Referred or closed, no finding  6
  Still being looked into        19

What the complaints were about
  > Building condition           185
  > Trash and grounds             13
  > Signs, zoning and use          2
  > Work without a permit          1
```

Opening "Building condition":

```
  v Building condition           185
    The buildings themselves: electrical, plumbing, roofs, walls, stairs and
    balconies, heating and appliances, pests. The city calls this Structure Condition.

    12 months    2 years    3 years
        55         131        185

    What the city found (3 years)
      Violation confirmed  91   Fixed at inspection  1   No violation found  70 ...

    Problems the city recorded here            (Repeat Offender properties only)
      Electrical installation    38   2 not cleared
      Roofs and drainage         21   all cleared
      Stairways and balconies    12   1 not cleared

    Complaints, newest first
      Nov 7, 2026    No violation found
      Oct 27, 2026   Violation confirmed, still open       city record
      Sep 3, 2026    Violation confirmed, closed Oct 26    city record
```

Figures in these sketches are illustrative.

## Goals

- Someone can tell, per building, how many complaints were substantiated and how many were not.
- Every category says what it means in one line.
- Every outcome shown is the city's, traceable to the city's record where one exists.

## Non-goals

- Reading the violation notices themselves. The link goes to the city's page.
- Deficiency detail for buildings outside the Repeat Offender program. The city does not publish it.
- Changing which buildings are shown or how they are named.

## Anti-goals

- Turning outcomes into a score or a color scale. Still counts only.
- Publishing free text written by inspectors.
- Calling a complaint a violation. Only complaints with a formal violation case are called confirmed.

## What changes in the app

- **Pipeline:** read the four extra case fields, classify each complaint, drop duplicates from counts, tally per period, type and outcome, write the full complaint list into each building's file, and read Repeat Offender deficiencies (never the `owner` column).
- **Counts everywhere:** pins, cards, filters, the panel and building pages use the new tallies and the three periods.
- **Panel:** the outcome summary and the expandable categories.
- **Words:** "complaints" throughout; the new category names.
- **Method page:** the outcome rules with every city phrase and where it lands, the duplicates rule, the three periods, the deficiency source.

## What done looks like

- For ten buildings checked by hand against the city portal, each period's complaint count and each outcome count match.
- No number on the site includes a duplicate.
- Opening a category shows its explanation, the three period counts, the outcome split and its complaints with links.
- The method page lists every city outcome phrase and how it is shown.
