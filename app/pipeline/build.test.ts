import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuildingDetail, Complex, Meta } from '@/domain/types';
import addressRows from './fixtures/addresses.json';
import housingRows from './fixtures/housing-inventory.json';
import parcelRows from './fixtures/parcels.json';
import repeatOffenderRows from './fixtures/repeat-offenders.json';
import {
  MIN_EXPECTED_ADDRESS_POINTS,
  MIN_EXPECTED_CASES,
  MIN_EXPECTED_COMPLEXES,
  MIN_EXPECTED_HOUSING_PARCELS,
  MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
  buildData,
} from './build';
import { CityApiError } from './socrata';

const NOW = new Date('2026-11-14T15:00:00Z');
const BIG_PARCEL = '0304070701';
const NO_CASES = '0231091509';
/** The land of parcel 0204080102 listed again under a Williamson County ID, as the city does for some parcels. */
const TWIN = 'R999001';
const twinRow = { ...parcelRows.find((row) => row.parcel_id_10 === '0204080102')!, parcel_id_10: TWIN };

const caseRow = (parcelid: string | null, description: string, opened: string) => ({
  ...(parcelid ? { parcelid } : {}),
  description,
  status: 'Closed',
  opened_date: `${opened}T00:00:00.000`,
});

const repeat = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));

/** 284 cases on the big parcel, plus cases the output must leave out or count elsewhere. */
function caseFixture() {
  const month = (i: number) => String((i % 12) + 1).padStart(2, '0');
  return [
    ...repeat(254, (i) => caseRow(BIG_PARCEL, 'Structure Condition Violation(s)', `2024-${month(i)}-10`)),
    ...repeat(24, (i) => caseRow(BIG_PARCEL, 'Property Abatement', `2025-${month(i)}-10`)),
    ...repeat(5, () => caseRow(BIG_PARCEL, 'Land Use Violation(s)', '2026-02-03')),
    caseRow(BIG_PARCEL, 'Work Without Permit', '2026-10-30'),
    ...repeat(2, () => caseRow('R056943', 'Property Abatement', '2026-05-05')),
    ...repeat(2, () => caseRow(TWIN, 'Property Abatement', '2026-06-06')),
    ...repeat(3, () => caseRow('9999999999', 'Property Abatement', '2026-05-05')),
    ...repeat(10, () => caseRow(null, 'Property Abatement', '2026-05-05')),
    caseRow('R056943', 'Something New', '2026-05-05'),
  ];
}

const FIXTURES: Record<string, unknown[]> = {
  '7vsm-dvxg': [...parcelRows, twinRow],
  '9s7j-tygf': addressRows,
  '6wtj-zbtb': caseFixture(),
  '86z9-i27i': repeatOffenderRows,
  'ifzc-3xz8': housingRows,
};

const datasetOf = (url: string | URL | Request) => /resource\/([^.]+)\.json/.exec(String(url))![1];

const fixtureFetch = (async (url: string | URL | Request) =>
  new Response(JSON.stringify(FIXTURES[datasetOf(url)]), { status: 200 })) as typeof fetch;

const failingOn = (datasetId: string) =>
  (async (url: string | URL | Request) =>
    datasetOf(url) === datasetId
      ? new Response('forbidden', { status: 403 })
      : fixtureFetch(url)) as typeof fetch;

const LOW = { minComplexes: 1, minCases: 1, minAddressPoints: 1, minRepeatOffenderRows: 1, minHousingParcels: 1 };

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

let root: string;
let out: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-test-'));
  out = join(root, 'data');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const complexById = (id: string) => readJson<Complex[]>(`${out}/complexes.json`).find((c) => c.id === id)!;

describe('buildData', () => {
  it('writes one Complex per property, including parcels with no cases', async () => {
    const meta = await buildData(out, NOW, fixtureFetch, LOW);
    const complexes = readJson<Complex[]>(`${out}/complexes.json`);
    expect(complexes).toHaveLength(6);
    expect(complexes.map((c) => c.id)).toEqual([...complexes.map((c) => c.id)].sort());
    expect(complexById(BIG_PARCEL).cases).toEqual({ structure: 254, property: 24, landuse: 5, permit: 1 });
    expect(complexById(BIG_PARCEL).parcelIds).toEqual([BIG_PARCEL]);
    expect(complexById(NO_CASES).cases).toEqual({ structure: 0, property: 0, landuse: 0, permit: 0 });
    expect(meta.complexCount).toBe(6);
  });

  it('shows the same land under two parcel IDs as one complex, under the busier ID, with one page', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    const twin = complexById(TWIN);
    expect(twin.parcelIds).toEqual(['0204080102', TWIN]);
    expect(twin.address).toBe('1638 E 2nd St');
    expect(twin.cases.property).toBe(2);
    expect(twin.acres).toBe(4.7);
    expect(complexById('0204080102')).toBeUndefined();
    expect(existsSync(`${out}/buildings/${TWIN}.json`)).toBe(true);
    expect(existsSync(`${out}/buildings/0204080102.json`)).toBe(false);
  });

  it('never publishes two complexes under one address', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    const addresses = readJson<Complex[]>(`${out}/complexes.json`).map((c) => c.address);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it('publishes meta with the Austin pull date and case shares', async () => {
    const meta = await buildData(out, NOW, fixtureFetch, LOW);
    expect(readJson<Meta>(`${out}/meta.json`)).toEqual(meta);
    expect(meta).toEqual({
      pulledAt: '2026-11-14',
      since: '2023-11-01',
      complexCount: 6,
      caseCount: 284 + 2 + 2,
      unmatchedCaseShare: 0.033,
      uncategorizedCases: 1,
    });
  });

  it('uses the Austin calendar date even when UTC has already rolled over', async () => {
    const lateEvening = new Date('2026-11-15T03:30:00Z');
    const meta = await buildData(out, lateEvening, fixtureFetch, LOW);
    expect(meta.pulledAt).toBe('2026-11-14');
  });

  it('prefers Repeat Offender units over the housing inventory when both exist', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    expect(complexById(BIG_PARCEL).units).toEqual({ count: 300, source: 'repeat-offender' });
  });

  it('falls back to the housing inventory for a Suspended registration, a zero unit count and a parcel not on the list', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    const suspended = complexById('0234111501');
    expect(suspended.repeatOffender).toBeNull();
    expect(suspended.units).toEqual({ count: 120, source: 'affordable-housing' });
    expect(complexById('0312130115').units).toEqual({ count: 60, source: 'affordable-housing' });
    expect(complexById('R056943').units).toEqual({ count: 80, source: 'affordable-housing' });
    expect(complexById(NO_CASES).units).toBeNull();
  });

  it('uses the Repeat Offender establishment name and never an owner field', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    expect(complexById(BIG_PARCEL).repeatOffender).toEqual({
      name: 'Riverside Terrace Apartments',
      units: 300,
      activeViolations: 12,
      totalViolations: 41,
    });
    const everything = readdirSync(out, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.json'))
      .map((f) => readFileSync(join(out, f), 'utf8'))
      .join('');
    expect(everything).not.toMatch(/owner|registeredAddress/i);
  });

  it('takes the address from the city registration for a listed property and from containment otherwise', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    // The fixture registers the big parcel under the address of parcel 0234111501, kilometres away,
    // so both keep the address and each names its parcel.
    expect(complexById(BIG_PARCEL).address).toBe('8900 N IH 35 SVRD SB (parcel 0304070701)');
    expect(complexById('0234111501').address).toBe('8900 N IH 35 SVRD SB (parcel 0234111501)');
    // Active but registered under a name with no house number: containment applies.
    expect(complexById('0312130115').address).not.toMatch(/PARCEL ONLY/i);
    expect(complexById(NO_CASES).address).not.toBe('');
  });

  it('writes a BuildingDetail with the parcel bbox for every complex', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    const complexes = readJson<Complex[]>(`${out}/complexes.json`);
    for (const { id } of complexes) {
      const detail = readJson<BuildingDetail>(`${out}/buildings/${id}.json`);
      expect(detail.id).toBe(id);
      expect(detail.bbox).toHaveLength(4);
      expect(detail.bbox[0]).toBeLessThan(detail.bbox[2]);
      expect(detail.bbox[1]).toBeLessThan(detail.bbox[3]);
      expect(detail.monthly[0]).toEqual({ month: '2023-11', count: 0 });
      expect(detail.monthly.at(-1)?.month).toBe('2026-11');
    }
    const big = readJson<BuildingDetail>(`${out}/buildings/${BIG_PARCEL}.json`);
    expect(big.monthly.reduce((sum, m) => sum + m.count, 0)).toBe(284);
    expect(big.latest).toHaveLength(8);
  });

  it('writes nothing when any dataset read fails', async () => {
    for (const dataset of Object.keys(FIXTURES)) {
      await expect(buildData(out, NOW, failingOn(dataset), LOW)).rejects.toBeInstanceOf(CityApiError);
      expect(existsSync(out)).toBe(false);
    }
  });

  it('leaves the previous files untouched when a pull fails', async () => {
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    await expect(buildData(out, NOW, failingOn('6wtj-zbtb'), LOW)).rejects.toBeInstanceOf(CityApiError);
    expect(readFileSync(`${out}/meta.json`, 'utf8')).toBe('{"yesterday":true}');
    expect(readdirSync(root)).toEqual(['data']);
  });

  it('replaces the previous files completely on success', async () => {
    mkdirSync(`${out}/buildings`, { recursive: true });
    writeFileSync(`${out}/buildings/stale.json`, '{}');
    await buildData(out, NOW, fixtureFetch, LOW);
    expect(existsSync(`${out}/buildings/stale.json`)).toBe(false);
    expect(existsSync(`${out}/meta.json`)).toBe(true);
    expect(readdirSync(root)).toEqual(['data']);
  });

  it.each([
    ['6wtj-zbtb', 'code cases', 'minCases'],
    ['9s7j-tygf', 'address points', 'minAddressPoints'],
    ['86z9-i27i', 'Repeat Offender rows', 'minRepeatOffenderRows'],
    ['ifzc-3xz8', 'housing inventory parcels', 'minHousingParcels'],
  ])('refuses to publish over good data when %s is short (%s)', async (_dataset, label, option) => {
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    const tooHigh = { ...LOW, [option]: 1_000_000 };
    await expect(buildData(out, NOW, fixtureFetch, tooHigh)).rejects.toThrow(new RegExp(`Only \\d+ ${label} came back, expected at least 1000000`));
    expect(readFileSync(`${out}/meta.json`, 'utf8')).toBe('{"yesterday":true}');
    expect(readdirSync(root)).toEqual(['data']);
  });

  it('declares a floor for every dataset', () => {
    expect([MIN_EXPECTED_CASES, MIN_EXPECTED_ADDRESS_POINTS, MIN_EXPECTED_REPEAT_OFFENDER_ROWS, MIN_EXPECTED_HOUSING_PARCELS]).toEqual([50_000, 300_000, 40, 1_000]);
  });

  it('refuses to write when fewer than MIN_EXPECTED_COMPLEXES come back', async () => {
    expect(MIN_EXPECTED_COMPLEXES).toBe(2000);
    await expect(buildData(out, NOW, fixtureFetch, { ...LOW, minComplexes: MIN_EXPECTED_COMPLEXES })).rejects.toThrow(/6 .*2000/);
    expect(existsSync(out)).toBe(false);
  });
});
