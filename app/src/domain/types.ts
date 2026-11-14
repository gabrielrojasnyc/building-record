export type Category = 'structure' | 'property' | 'landuse' | 'permit';
export type Counts = Record<Category, number>;

export interface RepeatOffender {
  name: string | null;
  units: number;
  activeViolations: number;
  totalViolations: number;
}

export interface PublishedUnits {
  count: number;
  source: 'repeat-offender' | 'affordable-housing';
}

export interface Complex {
  /** 10-digit parcel ID. */
  id: string;
  address: string;
  lon: number;
  lat: number;
  acres: number;
  /** Cases in the last 12 months. */
  cases12: Counts;
  /** Cases since 2023-11-01. */
  cases: Counts;
  open: number;
  /** ISO date of the most recent case. */
  lastCase: string | null;
  repeatOffender: RepeatOffender | null;
  units: PublishedUnits | null;
}
