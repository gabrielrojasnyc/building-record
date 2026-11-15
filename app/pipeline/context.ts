import { austinCalendarDate } from "@/domain/history";
import { periodStarts } from "@/domain/periods";
import type { Category, Deficiency, RepeatOffender } from "@/domain/types";
import { readAll } from "./socrata";

const REPEAT_OFFENDER_DATASET = "86z9-i27i";
const ACTIVE_STATUS = "Active";

/** A Repeat Offender entry plus the street address the city registered it under. The address never reaches the published files as such. */
export interface RepeatOffenderRecord extends RepeatOffender {
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

/** A trailing section reference such as " (§304.7)". */
const SECTION_REFERENCE = /\s*\(§[^)]*\)\s*$/;

interface DeficiencyRow {
  parcelid?: string;
  violationcategory?: string;
  deficiencycategory?: string;
  deficiencyindate?: string;
  deficiencystatus?: string;
}

export interface DeficiencyList {
  /** Deficiencies recorded since the 3 year start, grouped by category and kind, keyed by parcel ID. */
  byParcel: Map<string, Deficiency[]>;
  /** Every row the city returned. Lets the caller spot a truncated read. */
  rowsRead: number;
  /** Rows with a parcel ID left out: a violation category this site does not recognize, or no kind. */
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
    const violationCategory = row.violationcategory?.trim() ?? "";
    const category = DEFICIENCY_CATEGORIES.find(([prefix]) =>
      violationCategory.startsWith(prefix),
    )?.[1];
    const kind = (row.deficiencycategory ?? "")
      .replace(SECTION_REFERENCE, "")
      .trim();
    if (!category || !kind) {
      skipped += 1;
      continue;
    }
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

