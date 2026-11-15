import { austinCalendarDate } from "@/domain/history";
import { classify, isKnownCityOutcome, type Outcome } from "@/domain/outcomes";
import { PERIODS, periodStarts, type Period } from "@/domain/periods";
import type {
  BuildingDetail,
  Category,
  Complaint,
  Tally,
} from "@/domain/types";
import { readAll } from "./socrata";

const CODE_CASES_DATASET = "6wtj-zbtb";
/** A violation case link is published only when it points at the city's own permit site. */
const CITY_RECORD_PREFIX = "https://abc.austintexas.gov/";

/** First recognised phrase wins. Matching ignores case and the city's "(s)" suffixes. */
const PHRASES: [string, Category][] = [
  ["structure condition", "structure"],
  ["property abatement", "property"],
  ["land use", "landuse"],
  ["work without permit", "permit"],
];

export interface CaseSummary {
  /** Complaints in the 3 year period whose case is not closed, duplicates left out. */
  open: number;
  /** Non-duplicate complaints by period, category and outcome. */
  tally: Record<Period, Tally>;
  /** Complaints the city closed as duplicates, by period. */
  duplicates: Record<Period, number>;
  /** Complaints in the 3 year period with a confirmed violation whose case is not closed. */
  violationsOpen: number;
  detail: Omit<BuildingDetail, "bbox" | "outline" | "deficiencies">;
}

export interface CaseIndex {
  /** Every parcel ID with at least one categorized case. */
  byParcel: Map<string, CaseSummary>;
  /** Every row read. */
  totalCases: number;
  /** Rows with no parcel ID. */
  unmatchedCases: number;
  /** Rows with a parcel ID and a description this app does not recognise. */
  uncategorizedCases: number;
  /** Categorized rows opened after the pull date. Left out of every count and series, still in totalCases. */
  futureDatedCases: number;
  /** Rows, whatever else is true of them, whose outcome phrase is not on the allow-list. */
  unrecognizedOutcomes: number;
}

interface CaseRow {
  parcelid?: string;
  description?: string;
  status?: string;
  /** Floating timestamp with no timezone, for example 2026-11-14T00:00:00.000. */
  opened_date?: string;
  closed_date?: string;
  last_update?: string;
  violationcasenumber?: string;
  violationcaselink?: { url?: unknown } | null;
}

export function categoryOf(description: string): Category | null {
  const text = description.toLowerCase();
  return PHRASES.find(([phrase]) => text.includes(phrase))?.[1] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Every month from the 3 year period's first through the pull month, as YYYY-MM. */
function monthRange(pulled: string): string[] {
  const first = periodStarts(pulled).y3;
  const last = pulled.slice(0, 7);
  const months: string[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  for (
    let key = `${year}-${pad(month)}`;
    key <= last;
    key = `${year}-${pad(month)}`
  ) {
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first. Complaints opened the same day fall back on fields that tell them apart, so the order never depends on how the city returned them. */
export function compareComplaints(a: Complaint, b: Complaint): number {
  return (
    compareText(b.opened, a.opened) ||
    compareText(a.category, b.category) ||
    compareText(a.violationCase?.number ?? "", b.violationCase?.number ?? "") ||
    compareText(a.outcome, b.outcome) ||
    compareText(a.closed ?? "", b.closed ?? "") ||
    compareText(a.cityOutcome ?? "", b.cityOutcome ?? "") ||
    compareText(a.violationCase?.url ?? "", b.violationCase?.url ?? "")
  );
}

interface Accumulator {
  open: number;
  monthly: Map<string, number>;
  tally: Record<Period, Tally>;
  duplicates: Record<Period, number>;
  violationsOpen: number;
  complaints: Complaint[];
}

const byPeriod = <T>(make: () => T): Record<Period, T> => ({
  m12: make(),
  y2: make(),
  y3: make(),
});

const emptyAccumulator = (months: string[]): Accumulator => ({
  open: 0,
  monthly: new Map(months.map((month) => [month, 0])),
  tally: byPeriod(() => ({})),
  duplicates: byPeriod(() => 0),
  violationsOpen: 0,
  complaints: [],
});

function summarise(
  id: string,
  acc: Accumulator,
  months: string[],
): CaseSummary {
  return {
    open: acc.open,
    tally: acc.tally,
    duplicates: acc.duplicates,
    violationsOpen: acc.violationsOpen,
    detail: {
      id,
      monthly: months.map((month) => ({
        month,
        count: acc.monthly.get(month) ?? 0,
      })),
      complaints: [...acc.complaints].sort(compareComplaints),
    },
  };
}

/** A parcel with no complaints: empty tallies and a zero-filled monthly series for the pull date. */
export function emptyCaseSummary(id: string, pulledAt: Date): CaseSummary {
  const months = monthRange(austinCalendarDate(pulledAt));
  return summarise(id, emptyAccumulator(months), months);
}

/** The formal violation case a complaint led to, with its link only when it is on the city permit site. */
function violationCaseOf(row: CaseRow): Complaint["violationCase"] {
  const number = row.violationcasenumber?.trim();
  if (!number) return null;
  const link = row.violationcaselink?.url;
  const url =
    typeof link === "string" && link.startsWith(CITY_RECORD_PREFIX)
      ? link
      : null;
  return { number, url };
}

function addToTally(tally: Tally, category: Category, outcome: Outcome): void {
  const outcomes = (tally[category] ??= {});
  outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
}

/** Reads code complaint cases for the 3 year period and summarises them per parcel. */
export async function loadCases(
  pulledAt: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<CaseIndex> {
  const pulled = austinCalendarDate(pulledAt);
  const starts = periodStarts(pulled);
  const months = monthRange(pulled);

  const rows = await readAll<CaseRow>(
    CODE_CASES_DATASET,
    {
      select:
        "parcelid,description,status,opened_date,closed_date,last_update,violationcasenumber,violationcaselink",
      where: `opened_date >= '${starts.y3}'`,
      order: "case_id",
    },
    fetchImpl,
  );

  const accumulators = new Map<string, Accumulator>();
  let unmatchedCases = 0;
  let uncategorizedCases = 0;
  let futureDatedCases = 0;
  let unrecognizedOutcomes = 0;

  for (const row of rows) {
    const phrase = row.last_update?.trim() ?? "";
    if (phrase && !isKnownCityOutcome(phrase)) unrecognizedOutcomes += 1;

    const parcelId = row.parcelid?.trim();
    if (!parcelId) {
      unmatchedCases += 1;
      continue;
    }
    const category = categoryOf(row.description ?? "");
    if (!category) {
      uncategorizedCases += 1;
      continue;
    }

    const opened = (row.opened_date ?? "").slice(0, 10);
    if (opened > pulled) {
      futureDatedCases += 1;
      continue;
    }
    // The city filters by the 3 year start already; this keeps a stray older row out of every count.
    if (opened < starts.y3) continue;
    const status = row.status ?? "";
    const acc = accumulators.get(parcelId) ?? emptyAccumulator(months);
    accumulators.set(parcelId, acc);

    const violationCase = violationCaseOf(row);
    const outcome = classify({
      cityOutcome: phrase || null,
      status,
      hasViolationCase: violationCase !== null,
    });
    const periods = PERIODS.filter((period) => opened >= starts[period]);

    if (outcome === "duplicate") {
      for (const period of periods) acc.duplicates[period] += 1;
      continue;
    }
    for (const period of periods)
      addToTally(acc.tally[period], category, outcome);
    const month = opened.slice(0, 7);
    acc.monthly.set(month, (acc.monthly.get(month) ?? 0) + 1);

    const stillOpen = status !== "Closed";
    if (stillOpen) acc.open += 1;
    if (outcome === "violation" && stillOpen) acc.violationsOpen += 1;
    acc.complaints.push({
      opened,
      closed: stillOpen ? null : (row.closed_date ?? "").slice(0, 10) || null,
      category,
      outcome,
      stillOpen,
      cityOutcome: isKnownCityOutcome(phrase) ? phrase : null,
      violationCase,
    });
  }

  const byParcel = new Map<string, CaseSummary>();
  for (const [id, acc] of accumulators)
    byParcel.set(id, summarise(id, acc, months));

  return {
    byParcel,
    totalCases: rows.length,
    unmatchedCases,
    uncategorizedCases,
    futureDatedCases,
    unrecognizedOutcomes,
  };
}
