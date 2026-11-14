import type { RepeatOffender } from '@/domain/types';
import { readAll } from './socrata';

const REPEAT_OFFENDER_DATASET = '86z9-i27i';
const AFFORDABLE_HOUSING_DATASET = 'ifzc-3xz8';
const ACTIVE_STATUS = 'Active';

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

interface HousingRow {
  parcel_id?: string;
  total_units?: string;
}

const count = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Active Repeat Offender registrations, keyed by parcel ID. The owner field is never requested. */
export async function loadRepeatOffenders(fetchImpl: typeof fetch = fetch): Promise<Map<string, RepeatOffenderRecord>> {
  const rows = await readAll<RepeatOffenderRow>(
    REPEAT_OFFENDER_DATASET,
    {
      select: 'parcelid,status,establishmentname,foldername,numberofunits,activeviolations,totalviolations',
      order: 'parcelid',
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
  return offenders;
}

/** Affordable Housing Inventory unit counts, the largest total when a parcel has several rows. */
export async function loadPublishedUnits(fetchImpl: typeof fetch = fetch): Promise<Map<string, number>> {
  const rows = await readAll<HousingRow>(
    AFFORDABLE_HOUSING_DATASET,
    { select: 'parcel_id,total_units', order: 'parcel_id' },
    fetchImpl,
  );

  const units = new Map<string, number>();
  for (const row of rows) {
    const id = row.parcel_id?.trim();
    if (!id) continue;
    const total = count(row.total_units);
    if (total > (units.get(id) ?? 0)) units.set(id, total);
  }
  return units;
}
