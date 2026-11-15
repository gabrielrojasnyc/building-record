import { austinCalendarDate } from "@/domain/history";
import { periodStarts } from "@/domain/periods";
import { familyOf, PESTS } from "@/domain/problems";
import type {
  Category,
  Deficiency,
  RecordedProblems,
  RepeatOffender,
} from "@/domain/types";
import { pestsNamed } from "./pests";
import { readAll } from "./socrata";

const REPEAT_OFFENDER_DATASET = "86z9-i27i";
const ACTIVE_STATUS = "Active";

/** A Repeat Offender entry plus the street address the city registered it under. The address never reaches the published files as such. */
export interface RepeatOffenderRecord
  extends Omit<RepeatOffender, "recorded"> {
  registeredAddress: string | null;
}

interface RepeatOffenderRow {
  parcelid?: string;
  status?: string;
  establishmentname?: string;
  foldername?: string;
  numberofunits?: string;
  activeviolations?: string;
  totalviolations?: string;
}

const count = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface RepeatOffenderList {
  /** Active registrations, keyed by parcel ID. */
  offenders: Map<string, RepeatOffenderRecord>;
  /** Every row the city returned, Suspended included. Lets the caller spot a truncated read. */
  rowsRead: number;
}

/** Active Repeat Offender registrations, keyed by parcel ID. The owner field is never requested. */
export async function loadRepeatOffenders(
  fetchImpl: typeof fetch = fetch,
): Promise<RepeatOffenderList> {
  const rows = await readAll<RepeatOffenderRow>(
    REPEAT_OFFENDER_DATASET,
    {
      select:
        "parcelid,status,establishmentname,foldername,numberofunits,activeviolations,totalviolations",
      order: "parcelid,:id",
    },
    fetchImpl,
  );

  const offenders = new Map<string, RepeatOffenderRecord>();
  for (const row of rows) {
    const id = row.parcelid?.trim();
    if (!id || row.status !== ACTIVE_STATUS) continue;
    offenders.set(id, {
      name: row.establishmentname?.trim() || null,
      units: count(row.numberofunits),
      activeViolations: count(row.activeviolations),
      totalViolations: count(row.totalviolations),
      registeredAddress: row.foldername?.trim() || null,
    });
  }
  return { offenders, rowsRead: rows.length };
}
const DEFICIENCIES_DATASET = "ge82-ij4h";

/** The city's violation category, by prefix, and the category this site shows it under. */
const DEFICIENCY_CATEGORIES: [string, Category][] = [
  ["Structure Condition", "structure"],
  ["Property Abatement", "property"],
  ["Land Use", "landuse"],
];

const CATEGORY_ORDER: Category[] = [
  "structure",
  "property",
  "landuse",
  "permit",
];

const CLEARED = "Cleared";

/** Longer than any code section title the city has used (54 characters), so free text never reaches the page. */
const MAX_KIND_LENGTH = 90;
/** The characters the city's code section titles are written in: letters, digits, spaces and . , ( ) § / & - ' */
const KIND_CHARACTERS = /^[\p{L}\p{Nd} .,()§/&\-']+$/u;

/**
 * The kind exactly as the city writes it, section reference and all, so two sections that share a title such as
 * "General" stay apart; or null for anything that is not a code section title.
 */
export function deficiencyKind(raw: string | undefined): string | null {
  const kind = (raw ?? "").trim();
  if (!kind || kind.length > MAX_KIND_LENGTH || !KIND_CHARACTERS.test(kind))
    return null;
  return kind;
}

interface DeficiencyRow {
  parcelid?: string;
  violationcategory?: string;
  deficiencycategory?: string;
  deficiencyindate?: string;
  deficiencystatus?: string;
}

/** The category and kind a row is counted under, or null for a row this site leaves out. */
function countedAs(row: {
  violationcategory?: string;
  deficiencycategory?: string;
}): { category: Category; kind: string } | null {
  const violationCategory = row.violationcategory?.trim() ?? "";
  const category = DEFICIENCY_CATEGORIES.find(([prefix]) =>
    violationCategory.startsWith(prefix),
  )?.[1];
  const kind = deficiencyKind(row.deficiencycategory);
  return category && kind ? { category, kind } : null;
}

export interface DeficiencyList {
  /** Deficiencies recorded since the 3 year start, grouped by category and kind, keyed by parcel ID. */
  byParcel: Map<string, Deficiency[]>;
  /** Every row the city returned. Lets the caller spot a truncated read. */
  rowsRead: number;
  /** Rows with a parcel ID left out: a violation category this site does not recognize, or a kind that is missing or not a code section title. */
  skipped: number;
}

/** Adds up entries with the same category and kind. Most recorded first within a category, then by name. */
export function groupDeficiencies(entries: Deficiency[]): Deficiency[] {
  const grouped = new Map<string, Deficiency>();
  for (const { category, kind, cleared, notCleared } of entries) {
    const key = `${category}\u0000${kind}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.cleared += cleared;
      existing.notCleared += notCleared;
    } else {
      grouped.set(key, { category, kind, cleared, notCleared });
    }
  }
  const recorded = (entry: Deficiency) => entry.cleared + entry.notCleared;
  return [...grouped.values()].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      recorded(b) - recorded(a) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
  );
}

/**
 * Repeat Offender Property Deficiencies recorded on or after the 3 year start, grouped per parcel.
 * The owner column is never requested.
 */
export async function loadDeficiencies(
  pulledAt: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<DeficiencyList> {
  const since = periodStarts(austinCalendarDate(pulledAt)).y3;
  const rows = await readAll<DeficiencyRow>(
    DEFICIENCIES_DATASET,
    {
      select:
        "parcelid,violationcategory,deficiencycategory,deficiencyindate,deficiencystatus",
      where: `deficiencyindate >= '${since}'`,
      order: "parcelid,:id",
    },
    fetchImpl,
  );

  const perParcel = new Map<string, Deficiency[]>();
  let skipped = 0;
  for (const row of rows) {
    const id = row.parcelid?.trim();
    if (!id) continue;
    const counted = countedAs(row);
    if (!counted) {
      skipped += 1;
      continue;
    }
    const { category, kind } = counted;
    const cleared = row.deficiencystatus?.trim() === CLEARED;
    const entries = perParcel.get(id) ?? [];
    perParcel.set(id, entries);
    entries.push({
      category,
      kind,
      cleared: cleared ? 1 : 0,
      notCleared: cleared ? 0 : 1,
    });
  }

  const byParcel = new Map<string, Deficiency[]>();
  for (const [id, entries] of perParcel)
    byParcel.set(id, groupDeficiencies(entries));
  return { byParcel, rowsRead: rows.length, skipped };
}

interface PestNoteRow {
  parcelid?: string;
  violationcategory?: string;
  deficiencycategory?: string;
  deficiencydescription?: string;
}

export interface PestNotes {
  /** How many recorded pest problems named each pest in the city's note, keyed by parcel ID. */
  byParcel: Map<string, RecordedProblems["pests"]>;
  /** Pest notes read, and how many of them named a pest. For the build log. */
  notesRead: number;
  notesNaming: number;
}

/**
 * The kinds of the pest family, as the city's API can filter them: code sections 309 and 302.5, however the
 * city spaces the reference. Loose on purpose; `familyOf` decides, row by row, which notes are read.
 */
const PEST_KINDS =
  "(deficiencycategory like '%§%309.%' OR deficiencycategory like '%§%302.5%')";

/**
 * Which pests the city's notes name, for the pest problems recorded on or after the 3 year start.
 * The note is free text that can hold a unit number or what a tenant said, so it is requested for
 * pest rows alone and only ever read by `pestsNamed`: no word of it is kept. The owner column is
 * never requested.
 */
export async function loadPestNotes(
  pulledAt: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<PestNotes> {
  const since = periodStarts(austinCalendarDate(pulledAt)).y3;
  const rows = await readAll<PestNoteRow>(
    DEFICIENCIES_DATASET,
    {
      select:
        "parcelid,violationcategory,deficiencycategory,deficiencydescription",
      where: `deficiencyindate >= '${since}' AND ${PEST_KINDS}`,
      order: "parcelid,:id",
    },
    fetchImpl,
  );

  const byParcel: PestNotes["byParcel"] = new Map();
  let notesRead = 0;
  let notesNaming = 0;
  for (const row of rows) {
    const id = row.parcelid?.trim();
    const counted = countedAs(row);
    // Only a row counted as a pest problem can name a pest, so the names never outnumber the problems.
    if (!id || !counted || familyOf(counted.kind) !== "pests") continue;
    notesRead += 1;
    const named = pestsNamed(row.deficiencydescription ?? "");
    if (named.length === 0) continue;
    notesNaming += 1;
    const counts = byParcel.get(id) ?? {};
    byParcel.set(id, counts);
    for (const pest of named) counts[pest] = (counts[pest] ?? 0) + 1;
  }
  return { byParcel, notesRead, notesNaming };
}

/** Adds up the pests named at several parcels, in the pests' own order. */
export function addPests(
  counts: RecordedProblems["pests"][],
): RecordedProblems["pests"] {
  const sum: RecordedProblems["pests"] = {};
  for (const pest of PESTS) {
    const total = counts.reduce((all, one) => all + (one[pest] ?? 0), 0);
    if (total > 0) sum[pest] = total;
  }
  return sum;
}
