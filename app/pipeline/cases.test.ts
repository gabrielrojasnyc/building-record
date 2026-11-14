import { describe, expect, it } from 'vitest';
import caseRows from './fixtures/cases.json';
import { categoryOf, emptyCaseSummary, loadCases } from './cases';

const PULLED_AT = new Date('2026-11-14T15:00:00Z');
const PARCEL_A = '0100000001';
const PARCEL_B = 'R056943';

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

const caseOn = (opened: string, overrides: Record<string, string> = {}) => ({
  parcelid: PARCEL_A,
  description: 'Property Abatement',
  status: 'Closed',
  opened_date: `${opened}T00:00:00.000`,
  ...overrides,
});

const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

describe('categoryOf', () => {
  it('maps the four city descriptions', () => {
    expect(categoryOf('Structure Condition Violation(s)')).toBe('structure');
    expect(categoryOf('Property Abatement')).toBe('property');
    expect(categoryOf('Land Use Violation(s)')).toBe('landuse');
    expect(categoryOf('Work Without Permit')).toBe('permit');
    expect(categoryOf('Property Abatement  Property Abatement')).toBe('property');
    expect(categoryOf('Something New')).toBeNull();
  });
});

describe('loadCases with the fixture', () => {
  const load = async () => {
    const { impl, urls } = fakeFetch(caseRows);
    const index = await loadCases(PULLED_AT, impl);
    return { index, urls };
  };

  it('tallies cases with no parcel ID and cases with an unknown description', async () => {
    const { index } = await load();
    expect(index.totalCases).toBe(17);
    expect(index.unmatchedCases).toBe(2);
    expect(index.uncategorizedCases).toBe(1);
  });

  it('leaves future dated cases out of every count but still reads them', async () => {
    const { index } = await load();
    expect(index.futureDatedCases).toBe(2);
    // Parcel 0100000003 has only a future dated case, so it has no summary.
    expect(index.byParcel.has('0100000003')).toBe(false);
    const a = index.byParcel.get(PARCEL_A)!;
    expect(a.open).toBe(2);
    expect(a.lastCase).toBe('2026-11-14');
    expect(a.detail.latest.map((c) => c.opened)).not.toContain('2026-11-20');
  });

  it('keeps the monthly series summing to the case total for every parcel', async () => {
    const { index } = await load();
    for (const summary of index.byParcel.values()) {
      const monthlySum = summary.detail.monthly.reduce((sum, m) => sum + m.count, 0);
      expect(monthlySum).toBe(total(summary.cases));
    }
  });

  it('includes a case opened on 2023-11-01 in the totals and the first month', async () => {
    const { index, urls } = await load();
    expect(new URL(urls[0]).searchParams.get('$where')).toBe("opened_date >= '2023-11-01'");
    const a = index.byParcel.get(PARCEL_A)!;
    expect(a.cases.structure).toBe(4);
    expect(a.detail.monthly[0]).toEqual({ month: '2023-11', count: 2 });
  });

  it('keeps a parcel for every ID with a categorized case, trimming IDs', async () => {
    const { index } = await load();
    expect([...index.byParcel.keys()].sort()).toEqual([PARCEL_A, PARCEL_B]);
    expect(total(index.byParcel.get(PARCEL_B)!.cases)).toBe(2);
  });

  it('counts a case on the 12 month boundary day in both periods and the day before in one', async () => {
    const { index } = await load();
    const a = index.byParcel.get(PARCEL_A)!;
    // 2025-11-14 is inside the window, 2025-11-13 is outside; 2025-10-14 is 13 months back.
    expect(a.cases12).toEqual({ structure: 2, property: 1, landuse: 2, permit: 0 });
    expect(a.cases).toEqual({ structure: 4, property: 2, landuse: 2, permit: 2 });
  });

  it('counts status other than Closed as open', async () => {
    const { index } = await load();
    expect(index.byParcel.get(PARCEL_A)!.open).toBe(2);
    // The unknown description on parcel B is Active but never counted.
    expect(index.byParcel.get(PARCEL_B)!.open).toBe(0);
  });

  it('fills months with no cases as zero', async () => {
    const { index } = await load();
    const summary = index.byParcel.get(PARCEL_B)!;
    expect(summary.detail.monthly[0]).toEqual({ month: '2023-11', count: 0 });
    expect(summary.detail.monthly).toHaveLength(37);
    expect(summary.detail.monthly.at(-1)).toEqual({ month: '2026-11', count: 0 });
    expect(summary.detail.monthly.find((m) => m.month === '2026-06')?.count).toBe(1);
  });

  it('puts a case from the first history month and one from the pull day in their months', async () => {
    const { index } = await load();
    const { monthly } = index.byParcel.get(PARCEL_A)!.detail;
    expect(monthly[0]).toEqual({ month: '2023-11', count: 2 });
    expect(monthly.at(-1)).toEqual({ month: '2026-11', count: 2 });
    expect(monthly.reduce((sum, m) => sum + m.count, 0)).toBe(10);
  });

  it('keeps the 8 newest cases, newest first, with the city status unchanged', async () => {
    const { index } = await load();
    const { latest } = index.byParcel.get(PARCEL_A)!.detail;
    expect(latest).toHaveLength(8);
    expect(latest[0]).toEqual({ opened: '2026-11-14', category: 'property', status: 'Pending' });
    expect(latest.map((c) => c.opened)).toEqual([...latest.map((c) => c.opened)].sort().reverse());
    expect(latest.map((c) => c.opened)).not.toContain('2023-11-02');
  });

  it('reports the most recent categorized case as lastCase', async () => {
    const { index } = await load();
    expect(index.byParcel.get(PARCEL_A)!.lastCase).toBe('2026-11-14');
    // The newer unknown description case on parcel B is ignored.
    expect(index.byParcel.get(PARCEL_B)!.lastCase).toBe('2026-06-01');
  });

  it('asks only for the four case fields since 2023-11-01 and never the inspector column', async () => {
    const { urls } = await load();
    const url = new URL(urls[0]);
    expect(url.pathname).toBe('/resource/6wtj-zbtb.json');
    expect(url.searchParams.get('$select')).toBe('parcelid,description,status,opened_date');
    expect(url.searchParams.get('$where')).toBe("opened_date >= '2023-11-01'");
    expect(urls[0]).not.toContain('inspector');
  });
});

describe('date boundaries', () => {
  const summaryFor = async (pulledAt: string, opened: string[]) => {
    const { impl } = fakeFetch(opened.map((d) => caseOn(d)));
    const index = await loadCases(new Date(pulledAt), impl);
    return index.byParcel.get(PARCEL_A)!;
  };

  it('counts a case opened 11 months before the pull in both periods, 13 months in one', async () => {
    const summary = await summaryFor('2026-11-14T15:00:00Z', ['2025-12-14', '2025-10-14']);
    expect(total(summary.cases)).toBe(2);
    expect(total(summary.cases12)).toBe(1);
  });

  it('includes exactly the same day 12 months back and excludes the day before', async () => {
    const onDay = await summaryFor('2026-11-14T15:00:00Z', ['2025-11-14']);
    const dayBefore = await summaryFor('2026-11-14T15:00:00Z', ['2025-11-13']);
    expect(total(onDay.cases12)).toBe(1);
    expect(total(dayBefore.cases12)).toBe(0);
  });

  it('takes the pull date in Austin: 03:00Z is still the evening of 13 November', async () => {
    const summary = await summaryFor('2026-11-14T03:00:00Z', ['2025-11-13', '2025-11-12', '2026-11-13', '2026-11-14']);
    // Austin date 2026-11-13: window opens 2025-11-13, and the 14th is in the future.
    expect(total(summary.cases12)).toBe(2);
    expect(total(summary.cases)).toBe(3);
    expect(summary.lastCase).toBe('2026-11-13');
  });

  it('takes the pull date in Austin: 07:00Z is the early morning of 14 November', async () => {
    const summary = await summaryFor('2026-11-14T07:00:00Z', ['2025-11-13', '2025-11-14', '2026-11-14', '2026-11-15']);
    expect(total(summary.cases12)).toBe(2);
    expect(total(summary.cases)).toBe(3);
    expect(summary.lastCase).toBe('2026-11-14');
  });

  it('puts the pull in the previous month when Austin has not reached it yet', async () => {
    const summary = await summaryFor('2026-12-01T03:00:00Z', ['2026-11-30']);
    expect(summary.detail.monthly.at(-1)).toEqual({ month: '2026-11', count: 1 });
  });

  it('clamps a 29 February pull to 28 February of the previous year', async () => {
    const summary = await summaryFor('2028-02-29T12:00:00Z', ['2027-02-28', '2027-02-27']);
    expect(total(summary.cases12)).toBe(1);
  });

  it('ends the monthly series at the pull month', async () => {
    const summary = await summaryFor('2024-02-10T15:00:00Z', ['2024-02-01']);
    expect(summary.detail.monthly.map((m) => m.month)).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
    expect(summary.detail.monthly.at(-1)?.count).toBe(1);
  });
});

describe('emptyCaseSummary', () => {
  it('returns zero counts and a zero-filled series for the pull date', () => {
    const summary = emptyCaseSummary('0100000009', PULLED_AT);
    expect(summary.cases).toEqual({ structure: 0, property: 0, landuse: 0, permit: 0 });
    expect(summary.cases12).toEqual(summary.cases);
    expect(summary.open).toBe(0);
    expect(summary.lastCase).toBeNull();
    expect(summary.detail.id).toBe('0100000009');
    expect(summary.detail.latest).toEqual([]);
    expect(summary.detail.monthly).toHaveLength(37);
    expect(summary.detail.monthly.every((m) => m.count === 0)).toBe(true);
    expect(summary.detail.monthly.at(-1)?.month).toBe('2026-11');
  });
});
