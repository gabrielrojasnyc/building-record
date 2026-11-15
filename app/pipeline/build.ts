import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Complex, Meta } from "@/domain/types";
import { formatRegisteredAddress } from "@/domain/address";
import { austinCalendarDate } from "@/domain/history";
import { periodStarts } from "@/domain/periods";
import { complaintTotal } from "@/domain/query";
import { buildAddressResolver, loadAddressPoints } from "./addresses";
import { emptyCaseSummary, loadCases } from "./cases";
import { loadDeficiencies, loadRepeatOffenders } from "./context";
import {
  assertUniqueAddresses,
  combineParcels,
  type LabelledParcel,
} from "./merge";
import {
  NAMES_SNAPSHOT_PATH,
  TITLE_REVIEW_PATH,
  chooseName,
  readNamesSnapshot,
  readTitleReview,
} from "./names";
import { loadApartmentParcels, toOutline } from "./parcels";

/**
 * A pull that returns fewer rows than a floor below was cut short. Each is well under the live count.
 * The periods roll, so a count read from them can shrink as well as grow.
 */
export const MIN_EXPECTED_COMPLEXES = 2000; // live: about 2,400 once parcels sharing an address are merged
export const MIN_EXPECTED_CASES = 50_000; // live: 82,382 complaint rows read for the rolling 3 years on 2026-11-14
export const MIN_EXPECTED_ADDRESS_POINTS = 300_000; // live: 441,043
export const MIN_EXPECTED_REPEAT_OFFENDER_ROWS = 40; // live: 80
export const MIN_EXPECTED_DEFICIENCY_ROWS = 1_000; // live: 5,376 in the rolling 3 years
/** More unrecognized descriptions than this share of all complaint rows read means the city changed its categories. */
export const MAX_UNCATEGORIZED_SHARE = 0.01; // live: under 0.1%
/** More outcome phrases outside the allow-list than this share of all complaint rows read means the city changed its wording. */
export const MAX_UNRECOGNIZED_OUTCOME_SHARE = 0.01; // live: 0%
/** More rows with no outcome phrase than this share means the city stopped sending it, and every outcome would be misread. */
export const MAX_BLANK_OUTCOME_SHARE = 0.03; // live: 0.2%
/** Fewer Closed rows than this share means the city changed how it writes status, which decides what is still open. */
export const MIN_CLOSED_SHARE = 0.85; // live: about 97%
/** More deficiency rows skipped than this share means the city renamed a category or changed its kinds. */
export const MAX_SKIPPED_DEFICIENCY_SHARE = 0.05; // live: 0%

export interface BuildOptions {
  minComplexes?: number;
  minCases?: number;
  minAddressPoints?: number;
  minRepeatOffenderRows?: number;
  minDeficiencyRows?: number;
  maxUncategorizedShare?: number;
  maxUnrecognizedOutcomeShare?: number;
  maxBlankOutcomeShare?: number;
  minClosedShare?: number;
  maxSkippedDeficiencyShare?: number;
  /** The committed OpenStreetMap names file. Missing or unreadable means no OpenStreetMap names. */
  namesSnapshotPath?: string;
  /** The committed list of approved city titles and withheld parcels. Missing or unreadable stops the build. */
  titleReviewPath?: string;
  /** Where the build prints what a person should look at, one line at a time. Never part of the published data. */
  log?: (line: string) => void;
}

/** Every floor and share limit a pull is held to. */
export type Limits = Required<
  Omit<
    BuildOptions,
    "minComplexes" | "namesSnapshotPath" | "titleReviewPath" | "log"
  >
>;

const DEFAULT_LIMITS: Limits = {
  minCases: MIN_EXPECTED_CASES,
  minAddressPoints: MIN_EXPECTED_ADDRESS_POINTS,
  minRepeatOffenderRows: MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
  minDeficiencyRows: MIN_EXPECTED_DEFICIENCY_ROWS,
  maxUncategorizedShare: MAX_UNCATEGORIZED_SHARE,
  maxUnrecognizedOutcomeShare: MAX_UNRECOGNIZED_OUTCOME_SHARE,
  maxBlankOutcomeShare: MAX_BLANK_OUTCOME_SHARE,
  minClosedShare: MIN_CLOSED_SHARE,
  maxSkippedDeficiencyShare: MAX_SKIPPED_DEFICIENCY_SHARE,
};

/** What a pull read, as the guards weigh it. */
export interface PullReadings {
  addressPoints: number;
  caseRows: number;
  repeatOffenderRows: number;
  deficiencyRows: number;
  uncategorizedCases: number;
  unrecognizedOutcomes: number;
  blankOutcomes: number;
  closedCases: number;
  skippedDeficiencies: number;
}

interface Inputs {
  namesSnapshotPath: string;
  titleReviewPath: string;
  log: (line: string) => void;
}

/** A city registration name that would be a title once approved, with what a person needs to check it. */
interface AwaitingReview {
  parcelIds: string[];
  address: string;
  registeredName: string;
}

function printAwaitingReview(
  awaiting: AwaitingReview[],
  titleReviewPath: string,
  log: (line: string) => void,
): void {
  if (awaiting.length === 0) {
    log("City registration names awaiting review as titles: none.");
    return;
  }
  log(
    `City registration names awaiting review as titles (${awaiting.length}). Each shows its address until a person checks it and adds it to ${titleReviewPath}:`,
  );
  for (const { parcelIds, address, registeredName } of awaiting) {
    log(`  ${parcelIds.join(", ")}  ${address}  "${registeredName}"`);
  }
}

const count = (value: number) => value.toLocaleString("en-US");
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const shareOf = (part: number, whole: number) =>
  whole === 0 ? 0 : part / whole;
/** Where to change a limit, so a refused build says what to edit if the city's data really did change. */
const inBuild = (constant: string) => `${constant} in pipeline/build.ts`;
const REFUSING = "Refusing to write.";

function requireAtLeast(
  dataset: string,
  received: number,
  floor: number,
  constant: string,
): void {
  if (received < floor) {
    throw new Error(
      `Only ${count(received)} ${dataset} came back, expected at least ${count(floor)} (${inBuild(constant)}). ${REFUSING}`,
    );
  }
}

/** Throws when more than `limit` of `whole` is `part`. */
function requireAtMost(
  part: number,
  whole: number,
  limit: number,
  what: string,
  constant: string,
): void {
  const share = shareOf(part, whole);
  if (share > limit) {
    throw new Error(
      `${count(part)} of ${count(whole)} ${what.replace("{share}", percent(share))}, more than the ${limit * 100}% allowed (${inBuild(constant)}). ${REFUSING}`,
    );
  }
}

/**
 * Refuses a pull that looks cut short or reads data the city has changed the shape of. A refused nightly keeps
 * yesterday's site, a day old but whole, which is better than publishing counts or problems that are partial.
 */
export function refuseIncompletePull(
  readings: PullReadings,
  limits: Limits = DEFAULT_LIMITS,
): void {
  const { caseRows, deficiencyRows } = readings;
  requireAtLeast(
    "address points",
    readings.addressPoints,
    limits.minAddressPoints,
    "MIN_EXPECTED_ADDRESS_POINTS",
  );
  requireAtLeast(
    "complaint rows",
    caseRows,
    limits.minCases,
    "MIN_EXPECTED_CASES",
  );
  requireAtLeast(
    "Repeat Offender rows",
    readings.repeatOffenderRows,
    limits.minRepeatOffenderRows,
    "MIN_EXPECTED_REPEAT_OFFENDER_ROWS",
  );
  requireAtLeast(
    "Repeat Offender deficiency rows",
    deficiencyRows,
    limits.minDeficiencyRows,
    "MIN_EXPECTED_DEFICIENCY_ROWS",
  );
  requireAtMost(
    readings.uncategorizedCases,
    caseRows,
    limits.maxUncategorizedShare,
    "complaint rows ({share}) carry a description this site does not recognize",
    "MAX_UNCATEGORIZED_SHARE",
  );
  requireAtMost(
    readings.unrecognizedOutcomes,
    caseRows,
    limits.maxUnrecognizedOutcomeShare,
    "complaint rows ({share}) carry an outcome phrase this site does not recognize",
    "MAX_UNRECOGNIZED_OUTCOME_SHARE",
  );
  requireAtMost(
    readings.blankOutcomes,
    caseRows,
    limits.maxBlankOutcomeShare,
    "complaint rows ({share}) have no outcome phrase",
    "MAX_BLANK_OUTCOME_SHARE",
  );
  const closedShare = shareOf(readings.closedCases, caseRows);
  if (closedShare < limits.minClosedShare) {
    throw new Error(
      `Only ${count(readings.closedCases)} of ${count(caseRows)} complaint rows (${percent(closedShare)}) are Closed, fewer than the ${limits.minClosedShare * 100}% expected (${inBuild("MIN_CLOSED_SHARE")}). ${REFUSING}`,
    );
  }
  requireAtMost(
    readings.skippedDeficiencies,
    deficiencyRows,
    limits.maxSkippedDeficiencyShare,
    "Repeat Offender deficiency rows ({share}) were skipped for an unknown category or a missing or unsafe kind",
    "MAX_SKIPPED_DEFICIENCY_SHARE",
  );
}

/** What each guard saw, and every phrase off the allow-list, for the person reading the build log. */
function printReadings(
  readings: PullReadings,
  unrecognizedPhrases: Map<string, number>,
  log: (line: string) => void,
): void {
  const { caseRows, deficiencyRows } = readings;
  const of = (part: number, whole: number) =>
    `${count(part)} (${percent(shareOf(part, whole))})`;
  log(
    `${count(caseRows)} complaint rows read: ${of(readings.closedCases, caseRows)} Closed, ${of(readings.blankOutcomes, caseRows)} with no outcome phrase, ${of(readings.unrecognizedOutcomes, caseRows)} with a phrase not on the allow-list, ${of(readings.uncategorizedCases, caseRows)} with a description not recognized.`,
  );
  log(
    `${count(deficiencyRows)} Repeat Offender deficiency rows read: ${of(readings.skippedDeficiencies, deficiencyRows)} skipped.`,
  );
  if (unrecognizedPhrases.size === 0) {
    log("Outcome phrases not on the allow-list: none.");
    return;
  }
  log(
    "Outcome phrases not on the allow-list (build log only), most frequent first:",
  );
  for (const [phrase, rows] of unrecognizedPhrases) {
    log(`  ${count(rows)}  ${phrase}`);
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
  { minComplexes, ...limits }: Limits & { minComplexes: number },
  { namesSnapshotPath, titleReviewPath, log }: Inputs,
): Promise<{ files: Files; meta: Meta }> {
  const [
    landUse,
    addressPoints,
    caseIndex,
    repeatOffenders,
    deficiencies,
    namesSnapshot,
    titleReview,
  ] = await Promise.all([
    loadApartmentParcels(fetchImpl),
    loadAddressPoints(fetchImpl),
    loadCases(pulledAt, fetchImpl),
    loadRepeatOffenders(fetchImpl),
    loadDeficiencies(pulledAt, fetchImpl),
    readNamesSnapshot(namesSnapshotPath),
    readTitleReview(titleReviewPath),
  ]);

  const readings: PullReadings = {
    addressPoints: addressPoints.length,
    caseRows: caseIndex.totalCases,
    repeatOffenderRows: repeatOffenders.rowsRead,
    deficiencyRows: deficiencies.rowsRead,
    uncategorizedCases: caseIndex.uncategorizedCases,
    unrecognizedOutcomes: caseIndex.unrecognizedOutcomes,
    blankOutcomes: caseIndex.blankOutcomes,
    closedCases: caseIndex.closedCases,
    skippedDeficiencies: deficiencies.skipped,
  };
  // Printed before the guards, so a refused build still says what it saw.
  printReadings(readings, caseIndex.unrecognizedPhrases, log);
  refuseIncompletePull(readings, limits);
  const { offenders } = repeatOffenders;

  // An ID names a file under buildings/, so anything but letters and digits is left out and counted.
  const parcels = landUse.parcels.filter(({ id }) => SAFE_PARCEL_ID.test(id));
  const skippedParcelRows =
    landUse.skippedRows + (landUse.parcels.length - parcels.length);

  const resolveAddress = buildAddressResolver(addressPoints);
  const sorted = [...parcels].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const labelled: LabelledParcel[] = sorted.map((parcel) => {
    const offender = offenders.get(parcel.id) ?? null;
    const registered = offender?.registeredAddress
      ? formatRegisteredAddress(offender.registeredAddress)
      : null;
    const { label, source } =
      registered && startsWithHouseNumber(registered)
        ? { label: registered, source: "registered" as const }
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
      summary:
        caseIndex.byParcel.get(parcel.id) ??
        emptyCaseSummary(parcel.id, pulledAt),
      offender,
      deficiencies: deficiencies.byParcel.get(parcel.id) ?? [],
    };
  });

  const places = namesSnapshot?.places ?? [];
  const awaitingReview: AwaitingReview[] = [];
  const properties = combineParcels(labelled).map(({ complex, detail }) => {
    const registeredName = complex.repeatOffender?.name ?? null;
    const choice = chooseName(
      { outline: detail.outline, parcelIds: complex.parcelIds, registeredName },
      places,
      titleReview,
    );
    if (choice.awaitingReview !== null) {
      awaitingReview.push({
        parcelIds: complex.parcelIds,
        address: complex.address,
        registeredName: choice.awaitingReview,
      });
    }
    return { complex: { ...complex, name: choice.name }, detail };
  });
  printAwaitingReview(awaitingReview, titleReviewPath, log);
  const complexes: Complex[] = properties.map(({ complex }) => complex);
  requireAtLeast(
    "apartment complexes",
    complexes.length,
    minComplexes,
    "MIN_EXPECTED_COMPLEXES",
  );
  assertUniqueAddresses(complexes);

  const files: Files = new Map();
  for (const { detail } of properties)
    files.set(`buildings/${detail.id}.json`, JSON.stringify(detail));

  const meta: Meta = {
    pulledAt: austinCalendarDate(pulledAt),
    complexCount: complexes.length,
    caseCount: complexes.reduce(
      (sum, c) => sum + complaintTotal(c.tally.y3),
      0,
    ),
    unmatchedCaseShare:
      caseIndex.totalCases === 0
        ? 0
        : roundTo3(caseIndex.unmatchedCases / caseIndex.totalCases),
    uncategorizedCases: caseIndex.uncategorizedCases,
    futureDatedCases: caseIndex.futureDatedCases,
    skippedParcelRows,
    namedComplexes: complexes.filter(({ name }) => name !== null).length,
    namesAsOf: namesSnapshot?.fetchedAt ?? null,
    periodStarts: periodStarts(austinCalendarDate(pulledAt)),
    duplicateCases: complexes.reduce((sum, c) => sum + c.duplicates.y3, 0),
    unrecognizedOutcomes: caseIndex.unrecognizedOutcomes,
    skippedDeficiencies: deficiencies.skipped,
    phrasesUsuallyWithCase: caseIndex.phrasesUsuallyWithCase,
  };
  files.set("complexes.json", JSON.stringify(complexes));
  files.set("meta.json", JSON.stringify(meta));
  return { files, meta };
}

async function writeFiles(directory: string, files: Files): Promise<void> {
  await mkdir(join(directory, "buildings"), { recursive: true });
  const entries = [...files];
  for (let i = 0; i < entries.length; i += WRITE_BATCH) {
    await Promise.all(
      entries
        .slice(i, i + WRITE_BATCH)
        .map(([path, body]) => writeFile(join(directory, path), body)),
    );
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
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
    namesSnapshotPath = NAMES_SNAPSHOT_PATH,
    titleReviewPath = TITLE_REVIEW_PATH,
    log = console.log,
    ...limits
  }: BuildOptions = {},
): Promise<Meta> {
  const floors = { ...DEFAULT_LIMITS, ...limits, minComplexes };
  const { files, meta } = await assemble(pulledAt, fetchImpl, floors, {
    namesSnapshotPath,
    titleReviewPath,
    log,
  });

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
