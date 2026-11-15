import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Complex, Meta } from '@/domain/types';
import { formatRegisteredAddress } from '@/domain/address';
import { austinCalendarDate } from '@/domain/history';
import { periodStarts } from '@/domain/periods';
import { complaintTotal } from '@/domain/query';
import { buildAddressResolver, loadAddressPoints } from './addresses';
import { emptyCaseSummary, loadCases } from './cases';
import { loadDeficiencies, loadRepeatOffenders } from './context';
import { assertUniqueAddresses, combineParcels, type LabelledParcel } from './merge';
import { NAMES_SNAPSHOT_PATH, chooseName, readNamesSnapshot } from './names';
import { loadApartmentParcels, toOutline } from './parcels';

/** A pull that returns fewer rows than a floor below was cut short. Each is well under the live count. */
export const MIN_EXPECTED_COMPLEXES = 2000; // live: about 2,400 once parcels sharing an address are merged
export const MIN_EXPECTED_CASES = 50_000; // live: 82,384
export const MIN_EXPECTED_ADDRESS_POINTS = 300_000; // live: 441,043
export const MIN_EXPECTED_REPEAT_OFFENDER_ROWS = 40; // live: 80
export const MIN_EXPECTED_DEFICIENCY_ROWS = 2_000; // live: 5,376 in the last three years
/** More unrecognized descriptions than this share of all cases read means the city changed its categories. */
export const MAX_UNCATEGORIZED_SHARE = 0.01;
/** More outcome phrases outside the allow-list than this share of all cases read means the city changed its wording. */
export const MAX_UNRECOGNIZED_OUTCOME_SHARE = 0.01;

export interface BuildOptions {
  minComplexes?: number;
  minCases?: number;
  minAddressPoints?: number;
  minRepeatOffenderRows?: number;
  minDeficiencyRows?: number;
  maxUncategorizedShare?: number;
  maxUnrecognizedOutcomeShare?: number;
  /** The committed OpenStreetMap names file. Missing or unreadable means no OpenStreetMap names. */
  namesSnapshotPath?: string;
}

type Floors = Required<Omit<BuildOptions, 'namesSnapshotPath'>>;

function requireAtLeast(dataset: string, received: number, floor: number): void {
  if (received < floor) {
    throw new Error(`Only ${received} ${dataset} came back, expected at least ${floor}. Refusing to write.`);
  }
}

const WRITE_BATCH = 100;

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;

const startsWithHouseNumber = (address: string) => /^\d/.test(address);

const SAFE_PARCEL_ID = /^[A-Za-z0-9]+$/;

/** Files to publish, keyed by path relative to the output directory. */
type Files = Map<string, string>;

async function assemble(
  pulledAt: Date,
  fetchImpl: typeof fetch,
  floors: Floors,
  namesSnapshotPath: string,
): Promise<{ files: Files; meta: Meta }> {
  const [landUse, addressPoints, caseIndex, repeatOffenders, deficiencies, namesSnapshot] = await Promise.all([
    loadApartmentParcels(fetchImpl),
    loadAddressPoints(fetchImpl),
    loadCases(pulledAt, fetchImpl),
    loadRepeatOffenders(fetchImpl),
    loadDeficiencies(pulledAt, fetchImpl),
    readNamesSnapshot(namesSnapshotPath),
  ]);

  requireAtLeast('address points', addressPoints.length, floors.minAddressPoints);
  requireAtLeast('code cases', caseIndex.totalCases, floors.minCases);
  requireAtLeast('Repeat Offender rows', repeatOffenders.rowsRead, floors.minRepeatOffenderRows);
  requireAtLeast('Repeat Offender deficiency rows', deficiencies.rowsRead, floors.minDeficiencyRows);
  const uncategorizedShare = caseIndex.totalCases === 0 ? 0 : caseIndex.uncategorizedCases / caseIndex.totalCases;
  if (uncategorizedShare > floors.maxUncategorizedShare) {
    throw new Error(
      `${caseIndex.uncategorizedCases} of ${caseIndex.totalCases} cases (${(uncategorizedShare * 100).toFixed(1)}%) carry a description this site does not recognize, more than the ${floors.maxUncategorizedShare * 100}% allowed. Refusing to write.`,
    );
  }
  const unrecognizedShare = caseIndex.totalCases === 0 ? 0 : caseIndex.unrecognizedOutcomes / caseIndex.totalCases;
  if (unrecognizedShare > floors.maxUnrecognizedOutcomeShare) {
    throw new Error(
      `${caseIndex.unrecognizedOutcomes} of ${caseIndex.totalCases} cases (${(unrecognizedShare * 100).toFixed(1)}%) carry an outcome phrase this site does not recognize, more than the ${floors.maxUnrecognizedOutcomeShare * 100}% allowed. Refusing to write.`,
    );
  }
  const { offenders } = repeatOffenders;

  // An ID names a file under buildings/, so anything but letters and digits is left out and counted.
  const parcels = landUse.parcels.filter(({ id }) => SAFE_PARCEL_ID.test(id));
  const skippedParcelRows = landUse.skippedRows + (landUse.parcels.length - parcels.length);

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
      outline: toOutline(parcel.polygon.coordinates),
      summary: caseIndex.byParcel.get(parcel.id) ?? emptyCaseSummary(parcel.id, pulledAt),
      offender,
      deficiencies: deficiencies.byParcel.get(parcel.id) ?? [],
    };
  });

  const places = namesSnapshot?.places ?? [];
  const properties = combineParcels(labelled).map(({ complex, detail }) => ({
    complex: { ...complex, name: chooseName(detail.outline, places, complex.repeatOffender?.name ?? null) },
    detail,
  }));
  const complexes: Complex[] = properties.map(({ complex }) => complex);
  requireAtLeast('apartment complexes', complexes.length, floors.minComplexes);
  assertUniqueAddresses(complexes);

  const files: Files = new Map();
  for (const { detail } of properties) files.set(`buildings/${detail.id}.json`, JSON.stringify(detail));

  const meta: Meta = {
    pulledAt: austinCalendarDate(pulledAt),
    complexCount: complexes.length,
    caseCount: complexes.reduce((sum, c) => sum + complaintTotal(c.tally.y3), 0),
    unmatchedCaseShare: caseIndex.totalCases === 0 ? 0 : roundTo3(caseIndex.unmatchedCases / caseIndex.totalCases),
    uncategorizedCases: caseIndex.uncategorizedCases,
    futureDatedCases: caseIndex.futureDatedCases,
    skippedParcelRows,
    namedComplexes: complexes.filter(({ name }) => name !== null).length,
    namesAsOf: namesSnapshot?.fetchedAt ?? null,
    periodStarts: periodStarts(austinCalendarDate(pulledAt)),
    duplicateCases: complexes.reduce((sum, c) => sum + c.duplicates.y3, 0),
    unrecognizedOutcomes: caseIndex.unrecognizedOutcomes,
    skippedDeficiencies: deficiencies.skipped,
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
    minDeficiencyRows = MIN_EXPECTED_DEFICIENCY_ROWS,
    maxUncategorizedShare = MAX_UNCATEGORIZED_SHARE,
    maxUnrecognizedOutcomeShare = MAX_UNRECOGNIZED_OUTCOME_SHARE,
    namesSnapshotPath = NAMES_SNAPSHOT_PATH,
  }: BuildOptions = {},
): Promise<Meta> {
  const floors = {
    minComplexes,
    minCases,
    minAddressPoints,
    minRepeatOffenderRows,
    minDeficiencyRows,
    maxUncategorizedShare,
    maxUnrecognizedOutcomeShare,
  };
  const { files, meta } = await assemble(pulledAt, fetchImpl, floors, namesSnapshotPath);

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
