import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Complex, Meta, PublishedUnits } from '@/domain/types';
import { buildAddressResolver, formatAddress, loadAddressPoints } from './addresses';
import { emptyCaseSummary, loadCases } from './cases';
import { loadPublishedUnits, loadRepeatOffenders, type RepeatOffenderRecord } from './context';
import { loadApartmentParcels } from './parcels';

/** A pull that returns fewer apartment parcels than this was cut short. The city lists about 2,500. */
export const MIN_EXPECTED_COMPLEXES = 2000;

const WRITE_BATCH = 100;

const austinDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;

const startsWithHouseNumber = (address: string) => /^\d/.test(address);

function publishedUnits(
  offender: RepeatOffenderRecord | undefined,
  housingUnits: number | undefined,
): PublishedUnits | null {
  if (offender && offender.units > 0) return { count: offender.units, source: 'repeat-offender' };
  if (housingUnits && housingUnits > 0) return { count: housingUnits, source: 'affordable-housing' };
  return null;
}

const sumCounts = (counts: Complex['cases']) => counts.structure + counts.property + counts.landuse + counts.permit;

/** Files to publish, keyed by path relative to the output directory. */
type Files = Map<string, string>;

async function assemble(pulledAt: Date, fetchImpl: typeof fetch, minComplexes: number): Promise<{ files: Files; meta: Meta }> {
  const [parcels, addressPoints, caseIndex, offenders, housing] = await Promise.all([
    loadApartmentParcels(fetchImpl),
    loadAddressPoints(fetchImpl),
    loadCases(pulledAt, fetchImpl),
    loadRepeatOffenders(fetchImpl),
    loadPublishedUnits(fetchImpl),
  ]);

  if (parcels.length < minComplexes) {
    throw new Error(`Only ${parcels.length} apartment parcels came back, expected at least ${minComplexes}. Refusing to write.`);
  }

  const resolveAddress = buildAddressResolver(addressPoints);
  const sorted = [...parcels].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const files: Files = new Map();
  const complexes: Complex[] = [];

  for (const parcel of sorted) {
    const summary = caseIndex.byParcel.get(parcel.id) ?? emptyCaseSummary(parcel.id, pulledAt);
    const offender = offenders.get(parcel.id);
    const registered = offender?.registeredAddress;

    complexes.push({
      id: parcel.id,
      address: registered && startsWithHouseNumber(registered) ? formatAddress(registered) : resolveAddress(parcel),
      lon: parcel.lon,
      lat: parcel.lat,
      acres: parcel.acres,
      cases12: summary.cases12,
      cases: summary.cases,
      open: summary.open,
      lastCase: summary.lastCase,
      repeatOffender: offender
        ? {
            name: offender.name,
            units: offender.units,
            activeViolations: offender.activeViolations,
            totalViolations: offender.totalViolations,
          }
        : null,
      units: publishedUnits(offender, housing.get(parcel.id)),
    });
    files.set(`buildings/${parcel.id}.json`, JSON.stringify({ ...summary.detail, bbox: parcel.bbox }));
  }

  const meta: Meta = {
    pulledAt: austinDate.format(pulledAt),
    since: '2023-11-01',
    complexCount: complexes.length,
    caseCount: complexes.reduce((sum, c) => sum + sumCounts(c.cases), 0),
    unmatchedCaseShare: caseIndex.totalCases === 0 ? 0 : roundTo3(caseIndex.unmatchedCases / caseIndex.totalCases),
    uncategorizedCases: caseIndex.uncategorizedCases,
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
  { minComplexes = MIN_EXPECTED_COMPLEXES }: { minComplexes?: number } = {},
): Promise<Meta> {
  const { files, meta } = await assemble(pulledAt, fetchImpl, minComplexes);

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
