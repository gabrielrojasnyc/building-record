import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuildingDetail, Complex, Meta } from '@/domain/types';
import addressRows from './fixtures/addresses.json';
import parcelRows from './fixtures/parcels.json';
import repeatOffenderRows from './fixtures/repeat-offenders.json';
import {
  MIN_EXPECTED_ADDRESS_POINTS,
  MIN_EXPECTED_CASES,
  MIN_EXPECTED_COMPLEXES,
  MAX_UNCATEGORIZED_SHARE,
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
/** Rows the build must leave out and count: an ID that cannot name a file, and a row with no polygon. */
const unsafeIdRow = { ...twinRow, parcel_id_10: '../0204080102' };
const noPolygonRow = { parcel_id_10: 'R999002', land_use: '220', shape_area: '5000' };

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
    // Opened after the pull date: left out of every count.
    caseRow(BIG_PARCEL, 'Property Abatement', '2026-11-20'),
  ];
}

const FIXTURES: Record<string, unknown[]> = {
  '7vsm-dvxg': [...parcelRows, twinRow, unsafeIdRow, noPolygonRow],
  '9s7j-tygf': addressRows,
  '6wtj-zbtb': caseFixture(),
  // Registered the way the city writes some addresses: every building number listed, the street type spelled out.
  '86z9-i27i': repeatOffenderRows.map((row) =>
    row.parcelid === BIG_PARCEL ? { ...row, foldername: '1515 (AKA 1517, 1519) ROYAL CREST DRIVE' } : row,
  ),
};

const datasetOf = (url: string | URL | Request) => /resource\/([^.]+)\.json/.exec(String(url))![1];

const fixtureFetch = (async (url: string | URL | Request) =>
  new Response(JSON.stringify(FIXTURES[datasetOf(url)]), { status: 200 })) as typeof fetch;

const failingOn = (datasetId: string) =>
  (async (url: string | URL | Request) =>
    datasetOf(url) === datasetId
      ? new Response('forbidden', { status: 403 })
      : fixtureFetch(url)) as typeof fetch;

const LOW = { minComplexes: 1, minCases: 1, minAddressPoints: 1, minRepeatOffenderRows: 1 };

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

  it('leaves out a parcel whose ID is not letters and digits before it can name a file', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    const ids = readJson<Complex[]>(`${out}/complexes.json`).flatMap((c) => c.parcelIds);
    expect(ids.every((id) => /^[A-Za-z0-9]+$/.test(id))).toBe(true);
    expect(readdirSync(root)).toEqual(['data']);
    expect(readdirSync(`${out}/buildings`).every((name) => /^[A-Za-z0-9]+\.json$/.test(name))).toBe(true);
  });

  it('publishes coordinates to 6 decimals, about 10 cm, to keep the page light', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    for (const { lon, lat } of readJson<Complex[]>(`${out}/complexes.json`)) {
      expect(Math.round(lon * 1e6) / 1e6).toBe(lon);
      expect(Math.round(lat * 1e6) / 1e6).toBe(lat);
    }
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
      futureDatedCases: 1,
      skippedParcelRows: 2,
    });
  });

  it('uses the Austin calendar date even when UTC has already rolled over', async () => {
    const lateEvening = new Date('2026-11-15T03:30:00Z');
    const meta = await buildData(out, lateEvening, fixtureFetch, LOW);
    expect(meta.pulledAt).toBe('2026-11-14');
  });

  it('publishes no unit count of its own: the only one is the Repeat Offender figure', async () => {
    await buildData(out, NOW, fixtureFetch, LOW);
    for (const complex of readJson<Complex[]>(`${out}/complexes.json`)) {
      expect(Object.keys(complex)).not.toContain('units');
    }
    expect(complexById(BIG_PARCEL).repeatOffender?.units).toBe(300);
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
    expect(complexById(BIG_PARCEL).address).toBe('1515 Royal Crest Dr');
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
  ])('refuses to publish over good data when %s is short (%s)', async (_dataset, label, option) => {
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    const tooHigh = { ...LOW, [option]: 1_000_000 };
    await expect(buildData(out, NOW, fixtureFetch, tooHigh)).rejects.toThrow(new RegExp(`Only \\d+ ${label} came back, expected at least 1000000`));
    expect(readFileSync(`${out}/meta.json`, 'utf8')).toBe('{"yesterday":true}');
    expect(readdirSync(root)).toEqual(['data']);
  });

  it('declares a floor for every dataset', () => {
    expect([MIN_EXPECTED_CASES, MIN_EXPECTED_ADDRESS_POINTS, MIN_EXPECTED_REPEAT_OFFENDER_ROWS]).toEqual([50_000, 300_000, 40]);
  });

  it('refuses to publish when more than 1% of cases carry a description it does not recognize', async () => {
    expect(MAX_UNCATEGORIZED_SHARE).toBe(0.01);
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    // The fixture has 1 unrecognized case in 303, about 0.3%: under the default, over a stricter limit.
    await expect(buildData(out, NOW, fixtureFetch, { ...LOW, maxUncategorizedShare: 0.001 })).rejects.toThrow(
      /1 of 303 cases \(0\.3%\) carry a description this site does not recognize/,
    );
    expect(readFileSync(`${out}/meta.json`, 'utf8')).toBe('{"yesterday":true}');
    await expect(buildData(out, NOW, fixtureFetch, LOW)).resolves.toMatchObject({ uncategorizedCases: 1 });
  });

  it('refuses to write when fewer than MIN_EXPECTED_COMPLEXES come back', async () => {
    expect(MIN_EXPECTED_COMPLEXES).toBe(2000);
    await expect(buildData(out, NOW, fixtureFetch, { ...LOW, minComplexes: MIN_EXPECTED_COMPLEXES })).rejects.toThrow(/6 .*2000/);
    expect(existsSync(out)).toBe(false);
  });
});
