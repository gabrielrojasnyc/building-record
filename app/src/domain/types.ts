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
  /** City parcel ID: 10 digits in Travis County, R-prefixed in Williamson County. */
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

export interface BuildingDetail {
  id: string;
  /** 'YYYY-MM', every month from 2023-11 to the pull month, zeros included. */
  monthly: { month: string; count: number }[];
  /** Newest first, at most 8. */
  latest: { opened: string; category: Category; status: string }[];
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

export interface Meta {
  /** Austin calendar date of the pull, YYYY-MM-DD. */
  pulledAt: string;
  since: '2023-11-01';
  complexCount: number;
  /** Categorized cases matched to an apartment parcel, since 2023-11-01. */
  caseCount: number;
  /** Share of all cases with no parcel ID, 3 decimals. */
  unmatchedCaseShare: number;
  /** Cases with a parcel ID and a description the app does not recognise. */
  uncategorizedCases: number;
}
