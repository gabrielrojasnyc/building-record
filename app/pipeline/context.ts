import type { RepeatOffender } from '@/domain/types';
import { readAll } from './socrata';

const REPEAT_OFFENDER_DATASET = '86z9-i27i';
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
export async function loadRepeatOffenders(fetchImpl: typeof fetch = fetch): Promise<RepeatOffenderList> {
  const rows = await readAll<RepeatOffenderRow>(
    REPEAT_OFFENDER_DATASET,
    {
      select: 'parcelid,status,establishmentname,foldername,numberofunits,activeviolations,totalviolations',
      order: 'parcelid,:id',
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
