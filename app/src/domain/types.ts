import type { Outcome } from "./outcomes";
import type { Period } from "./periods";

export type Category = "structure" | "property" | "landuse" | "permit";
/** Complaints per category and outcome. Zeros are omitted. Duplicates are never in a tally. */
export type Tally = Partial<Record<Category, Partial<Record<Outcome, number>>>>;

export interface Complaint {
  /** YYYY-MM-DD */
  opened: string;
  closed: string | null;
  category: Category;
  outcome: Outcome;
  /** The case is not closed. */
  stillOpen: boolean;
  /** The city's outcome phrase when it is on the allow-list, else null. */
  cityOutcome: string | null;
  /** The formal violation case, with a link to the city's record when it is on the city permit site. */
  violationCase: { number: string; url: string | null } | null;
}

/** One kind of problem the city recorded at a Repeat Offender property, with the section reference removed. */
export interface Deficiency {
  category: Category;
  kind: string;
  cleared: number;
  notCleared: number;
}

export type Ring = [lon: number, lat: number][];
/** Polygons, each a list of rings with the outer ring first. Coordinates rounded to 6 decimals. */
export type Outline = Ring[][];

export interface ComplexName {
  text: string;
  source: "openstreetmap" | "city";
}

export interface RepeatOffender {
  name: string | null;
  units: number;
  activeViolations: number;
  totalViolations: number;
}

export interface Complex {
  /** City parcel ID of the member with the most reports in the 3 year period, duplicates included: 10 digits in Travis County, R-prefixed in Williamson County. */
  id: string;
  /** Every parcel shown as this complex, sorted. Parcels that share an address within 250 m are one complex. */
  parcelIds: string[];
  address: string;
  /** What the property is called, when a trustworthy name exists. The address stays the unique label. */
  name: ComplexName | null;
  lon: number;
  lat: number;
  acres: number;
  /** Complaints in the 3 year period whose case is not closed, duplicates left out. */
  open: number;
  repeatOffender: RepeatOffender | null;
  /** Complaints by period, category and outcome, duplicates left out. */
  tally: Record<Period, Tally>;
  /** Complaints the city closed as duplicates of another, by period. Not in any tally. */
  duplicates: Record<Period, number>;
  /** Complaints in the 3 year period with a confirmed violation whose case is not closed. */
  violationsOpen: number;
}

export interface BuildingDetail {
  id: string;
  /** Complaints opened each month, duplicates left out: 'YYYY-MM', every month from the 3 year period's first to the pull month, zeros included. */
  monthly: { month: string; count: number }[];
  /** Every complaint in the 3 year period, duplicates left out, newest first. */
  complaints: Complaint[];
  /** Problems the city recorded in the 3 year period. Empty unless the property is on the Repeat Offender list. */
  deficiencies: Deficiency[];
  /** Every member parcel's polygons, in member order. */
  outline: Outline;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

export interface Meta {
  /** Austin calendar date of the pull, YYYY-MM-DD. */
  pulledAt: string;
  complexCount: number;
  /** Complaints at published complexes in the 3 year period, duplicates left out. */
  caseCount: number;
  /** Share of all cases with no parcel ID, 3 decimals. */
  unmatchedCaseShare: number;
  /** Cases with a parcel ID and a description the app does not recognise. */
  uncategorizedCases: number;
  /** Categorized cases opened after the pull date, left out of every count. */
  futureDatedCases: number;
  /** Land use rows left out: no polygon, a missing or non-numeric area, or an ID that is not letters and digits. */
  skippedParcelRows: number;
  /** Complexes with a name from OpenStreetMap or the city's Repeat Offender registration. */
  namedComplexes: number;
  /** Date the OpenStreetMap names snapshot was fetched, YYYY-MM-DD; null when no snapshot was readable. */
  namesAsOf: string | null;
  /** First day of each period, YYYY-MM-DD. */
  periodStarts: Record<Period, string>;
  /** Duplicate complaints in the 3 year period at published complexes, left out of every tally. */
  duplicateCases: number;
  /** Complaints whose city outcome phrase is not on the allow-list. Never published as text. */
  unrecognizedOutcomes: number;
  /** Deficiency rows left out: a category this site does not recognize, or no kind. */
  skippedDeficiencies: number;
}
