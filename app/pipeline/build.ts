import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Complex, Meta } from '@/domain/types';
import { formatRegisteredAddress } from '@/domain/address';
import { buildAddressResolver, loadAddressPoints } from './addresses';
import { emptyCaseSummary, loadCases } from './cases';
import { loadRepeatOffenders } from './context';
import { assertUniqueAddresses, combineParcels, type LabelledParcel } from './merge';
import { loadApartmentParcels } from './parcels';

/** A pull that returns fewer rows than a floor below was cut short. Each is well under the live count. */
export const MIN_EXPECTED_COMPLEXES = 2000; // live: about 2,400 once parcels sharing an address are merged
export const MIN_EXPECTED_CASES = 50_000; // live: 82,384
export const MIN_EXPECTED_ADDRESS_POINTS = 300_000; // live: 441,043
export const MIN_EXPECTED_REPEAT_OFFENDER_ROWS = 40; // live: 80
/** More unrecognized descriptions than this share of all cases read means the city changed its categories. */
export const MAX_UNCATEGORIZED_SHARE = 0.01;

export interface BuildOptions {
  minComplexes?: number;
  minCases?: number;
  minAddressPoints?: number;
  minRepeatOffenderRows?: number;
  maxUncategorizedShare?: number;
}

function requireAtLeast(dataset: string, received: number, floor: number): void {
  if (received < floor) {
    throw new Error(`Only ${received} ${dataset} came back, expected at least ${floor}. Refusing to write.`);
  }
}

const WRITE_BATCH = 100;

const austinDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;

const startsWithHouseNumber = (address: string) => /^\d/.test(address);

const sumCounts = (counts: Complex['cases']) => counts.structure + counts.property + counts.landuse + counts.permit;

/** Files to publish, keyed by path relative to the output directory. */
type Files = Map<string, string>;

async function assemble(pulledAt: Date, fetchImpl: typeof fetch, floors: Required<BuildOptions>): Promise<{ files: Files; meta: Meta }> {
  const [parcels, addressPoints, caseIndex, repeatOffenders] = await Promise.all([
    loadApartmentParcels(fetchImpl),
    loadAddressPoints(fetchImpl),
    loadCases(pulledAt, fetchImpl),
    loadRepeatOffenders(fetchImpl),
  ]);

  requireAtLeast('address points', addressPoints.length, floors.minAddressPoints);
  requireAtLeast('code cases', caseIndex.totalCases, floors.minCases);
  requireAtLeast('Repeat Offender rows', repeatOffenders.rowsRead, floors.minRepeatOffenderRows);
  const uncategorizedShare = caseIndex.totalCases === 0 ? 0 : caseIndex.uncategorizedCases / caseIndex.totalCases;
  if (uncategorizedShare > floors.maxUncategorizedShare) {
    throw new Error(
      `${caseIndex.uncategorizedCases} of ${caseIndex.totalCases} cases (${(uncategorizedShare * 100).toFixed(1)}%) carry a description this site does not recognize, more than the ${floors.maxUncategorizedShare * 100}% allowed. Refusing to write.`,
    );
  }
  const { offenders } = repeatOffenders;

  const resolveAddress = buildAddressResolver(addressPoints);
  const sorted = [...parcels].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const labelled: LabelledParcel[] = sorted.map((parcel) => {
    const offender = offenders.get(parcel.id) ?? null;
    const registered = offender?.registeredAddress ? formatRegisteredAddress(offender.registeredAddress) : null;
    const { label, source } =
      registered && startsWithHouseNumber(registered)
        ? { label: registered, source: 'registered' as const }
        : resolveAddress(parcel);
    return {
      id: parcel.id,
      label,
      source,
      lon: parcel.lon,
      lat: parcel.lat,
      squareFeet: parcel.squareFeet,
      bbox: parcel.bbox,
      summary: caseIndex.byParcel.get(parcel.id) ?? emptyCaseSummary(parcel.id, pulledAt),
      offender,
    };
  });

  const properties = combineParcels(labelled);
  const complexes: Complex[] = properties.map(({ complex }) => complex);
  requireAtLeast('apartment complexes', complexes.length, floors.minComplexes);
  assertUniqueAddresses(complexes);

  const files: Files = new Map();
  for (const { detail } of properties) files.set(`buildings/${detail.id}.json`, JSON.stringify(detail));

  const meta: Meta = {
    pulledAt: austinDate.format(pulledAt),
    since: '2023-11-01',
    complexCount: complexes.length,
    caseCount: complexes.reduce((sum, c) => sum + sumCounts(c.cases), 0),
    unmatchedCaseShare: caseIndex.totalCases === 0 ? 0 : roundTo3(caseIndex.unmatchedCases / caseIndex.totalCases),
    uncategorizedCases: caseIndex.uncategorizedCases,
    futureDatedCases: caseIndex.futureDatedCases,
  };
  files.set('complexes.json', JSON.stringify(complexes));
  files.set('meta.json', JSON.stringify(meta));
  return { files, meta };
}

async function writeFiles(directory: string, files: Files): Promise<void> {
  await mkdir(join(directory, 'buildings'), { recursive: true });
  const entries = [...files];
  for (let i = 0; i < entries.length; i += WRITE_BATCH) {
    await Promise.all(entries.slice(i, i + WRITE_BATCH).map(([path, body]) => writeFile(join(directory, path), body)));
  }
}

/** Moves `staged` to `outDir`, keeping the old directory aside until the swap succeeds. */
async function swapIntoPlace(staged: string, outDir: string): Promise<void> {
  const previous = `${outDir}.previous-${process.pid}`;
  await rm(previous, { recursive: true, force: true });

  let hadPrevious = true;
  try {
    await rename(outDir, previous);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    hadPrevious = false;
  }

  try {
    await rename(staged, outDir);
  } catch (error) {
    if (hadPrevious) await rename(previous, outDir);
    throw error;
  }
  if (hadPrevious) await rm(previous, { recursive: true, force: true });
}

/**
 * Pulls every dataset, joins them in memory, and publishes the result to `outDir`.
 * Nothing on disk changes unless every read succeeds and the output looks complete.
 */
export async function buildData(
  outDir: string,
  pulledAt: Date,
  fetchImpl: typeof fetch = fetch,
  {
    minComplexes = MIN_EXPECTED_COMPLEXES,
    minCases = MIN_EXPECTED_CASES,
    minAddressPoints = MIN_EXPECTED_ADDRESS_POINTS,
    minRepeatOffenderRows = MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
    maxUncategorizedShare = MAX_UNCATEGORIZED_SHARE,
  }: BuildOptions = {},
): Promise<Meta> {
  const floors = { minComplexes, minCases, minAddressPoints, minRepeatOffenderRows, maxUncategorizedShare };
  const { files, meta } = await assemble(pulledAt, fetchImpl, floors);

  await mkdir(dirname(outDir), { recursive: true });
  const staged = `${outDir}.staging-${process.pid}`;
  await rm(staged, { recursive: true, force: true });
  try {
    await writeFiles(staged, files);
    await swapIntoPlace(staged, outDir);
  } catch (error) {
    await rm(staged, { recursive: true, force: true });
    throw error;
  }
  return meta;
}
