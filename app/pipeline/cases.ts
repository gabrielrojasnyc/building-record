import type { BuildingDetail, Category, Counts } from '@/domain/types';
import { readAll } from './socrata';

const CODE_CASES_DATASET = '6wtj-zbtb';
const HISTORY_START_MONTH = '2023-11';
const LATEST_LIMIT = 8;

/** First recognised phrase wins. Matching ignores case and the city's "(s)" suffixes. */
const PHRASES: [string, Category][] = [
  ['structure condition', 'structure'],
  ['property abatement', 'property'],
  ['land use', 'landuse'],
  ['work without permit', 'permit'],
];

export interface CaseSummary {
  cases12: Counts;
  cases: Counts;
  open: number;
  /** ISO date of the most recent categorized case. */
  lastCase: string | null;
  detail: Omit<BuildingDetail, 'bbox'>;
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
}

interface CaseRow {
  parcelid?: string;
  description?: string;
  status?: string;
  /** Floating timestamp with no timezone, for example 2026-11-14T00:00:00.000. */
  opened_date?: string;
}

export function categoryOf(description: string): Category | null {
  const text = description.toLowerCase();
  return PHRASES.find(([phrase]) => text.includes(phrase))?.[1] ?? null;
}

const emptyCounts = (): Counts => ({ structure: 0, property: 0, landuse: 0, permit: 0 });

const pad = (n: number) => String(n).padStart(2, '0');

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The pull date as a UTC calendar date, YYYY-MM-DD. */
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Same day of month, 12 months earlier, clamped for 29 February. */
function twelveMonthsBefore(pulled: string): string {
  const year = Number(pulled.slice(0, 4)) - 1;
  const month = Number(pulled.slice(5, 7));
  const day = Math.min(Number(pulled.slice(8, 10)), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Every month from 2023-11 through the pull month, as YYYY-MM. */
function monthRange(pulled: string): string[] {
  const last = pulled.slice(0, 7);
  const months: string[] = [];
  let year = Number(HISTORY_START_MONTH.slice(0, 4));
  let month = Number(HISTORY_START_MONTH.slice(5, 7));
  for (let key = `${year}-${pad(month)}`; key <= last; key = `${year}-${pad(month)}`) {
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

interface Accumulator {
  cases12: Counts;
  cases: Counts;
  open: number;
  lastCase: string | null;
  monthly: Map<string, number>;
  recent: { opened: string; category: Category; status: string }[];
}

/** Reads code complaint cases since 2023-11-01 and summarises them per parcel. */
export async function loadCases(pulledAt: Date, fetchImpl: typeof fetch = fetch): Promise<CaseIndex> {
  const pulled = isoDate(pulledAt);
  const since12 = twelveMonthsBefore(pulled);
  const months = monthRange(pulled);

  const rows = await readAll<CaseRow>(
    CODE_CASES_DATASET,
    {
      select: 'parcelid,description,status,opened_date',
      where: `opened_date > '2023-11-01'`,
      order: 'case_id',
    },
    fetchImpl,
  );

  const accumulators = new Map<string, Accumulator>();
  let unmatchedCases = 0;
  let uncategorizedCases = 0;

  for (const row of rows) {
    const parcelId = row.parcelid?.trim();
    if (!parcelId) {
      unmatchedCases += 1;
      continue;
    }
    const category = categoryOf(row.description ?? '');
    if (!category) {
      uncategorizedCases += 1;
      continue;
    }

    const opened = (row.opened_date ?? '').slice(0, 10);
    const status = row.status ?? '';
    const acc: Accumulator = accumulators.get(parcelId) ?? {
      cases12: emptyCounts(),
      cases: emptyCounts(),
      open: 0,
      lastCase: null,
      monthly: new Map(months.map((month) => [month, 0])),
      recent: [],
    };
    accumulators.set(parcelId, acc);

    acc.cases[category] += 1;
    if (opened >= since12) acc.cases12[category] += 1;
    if (status !== 'Closed') acc.open += 1;
    if (acc.lastCase === null || opened > acc.lastCase) acc.lastCase = opened;
    const month = opened.slice(0, 7);
    if (acc.monthly.has(month)) acc.monthly.set(month, (acc.monthly.get(month) ?? 0) + 1);
    acc.recent.push({ opened, category, status });
  }

  const byParcel = new Map<string, CaseSummary>();
  for (const [id, acc] of accumulators) {
    const latest = acc.recent.sort((a, b) => (a.opened < b.opened ? 1 : a.opened > b.opened ? -1 : 0)).slice(0, LATEST_LIMIT);
    byParcel.set(id, {
      cases12: acc.cases12,
      cases: acc.cases,
      open: acc.open,
      lastCase: acc.lastCase,
      detail: {
        id,
        monthly: months.map((month) => ({ month, count: acc.monthly.get(month) ?? 0 })),
        latest,
      },
    });
  }

  return { byParcel, totalCases: rows.length, unmatchedCases, uncategorizedCases };
}
