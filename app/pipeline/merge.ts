import type {
  BuildingDetail,
  Complex,
  Counts,
  PublishedUnits,
} from "@/domain/types";
import { metresBetween, type LabelSource } from "./addresses";
import type { CaseSummary } from "./cases";
import type { RepeatOffenderRecord } from "./context";
import { toAcres } from "./parcels";

/** Parcels with the same address whose centroids are this close to another member are one property. */
const SAME_PROPERTY_METRES = 250;
const LATEST_LIMIT = 8;

/** One apartment parcel with its label and its own record, before parcels that share an address are combined. */
export interface LabelledParcel {
  id: string;
  label: string;
  source: LabelSource;
  lon: number;
  lat: number;
  squareFeet: number;
  bbox: BuildingDetail["bbox"];
  summary: CaseSummary;
  /** An active Repeat Offender registration on this parcel. */
  offender: RepeatOffenderRecord | null;
  units: PublishedUnits | null;
}

/** A published complex and the history file that goes with it. */
export interface Property {
  complex: Complex;
  detail: BuildingDetail;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const sumCounts = (counts: Counts) =>
  counts.structure + counts.property + counts.landuse + counts.permit;

const addCounts = (a: Counts, b: Counts): Counts => ({
  structure: a.structure + b.structure,
  property: a.property + b.property,
  landuse: a.landuse + b.landuse,
  permit: a.permit + b.permit,
});

/** Only a label read from the city's own address for this land can say two parcels are one property. */
const namesTheLand = (parcel: LabelledParcel) =>
  parcel.source === "inside" || parcel.source === "registered";

/** Parcels that share a label and are linked, directly or through other members, by centroids within 250 m. */
function groupSameProperty(parcels: LabelledParcel[]): LabelledParcel[][] {
  const groups: LabelledParcel[][] = [];
  const byLabel = new Map<string, LabelledParcel[]>();
  for (const parcel of parcels) {
    if (!namesTheLand(parcel)) {
      groups.push([parcel]);
      continue;
    }
    const sameLabel = byLabel.get(parcel.label);
    if (sameLabel) sameLabel.push(parcel);
    else byLabel.set(parcel.label, [parcel]);
  }

  for (const sameLabel of byLabel.values()) {
    const unvisited = new Set(sameLabel);
    for (const seed of sameLabel) {
      if (!unvisited.delete(seed)) continue;
      const group = [seed];
      for (let i = 0; i < group.length; i++) {
        for (const other of unvisited) {
          if (metresBetween(group[i], other) <= SAME_PROPERTY_METRES) {
            unvisited.delete(other);
            group.push(other);
          }
        }
      }
      groups.push(group);
    }
  }
  return groups;
}

function unionBox(boxes: BuildingDetail["bbox"][]): BuildingDetail["bbox"] {
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

function newestFirst(a: { opened: string }, b: { opened: string }): number {
  return compareText(b.opened, a.opened);
}

/** One complex from the members of a group: its ID and URL come from the busiest member, its figures from all of them. */
function combine(group: LabelledParcel[]): Property {
  const members = [...group].sort((a, b) => compareText(a.id, b.id));
  const casesOf = (member: LabelledParcel) => sumCounts(member.summary.cases);

  // Members are in ID order and only a strictly larger value replaces the best so far, so ties go to the lowest ID.
  const busiest = members.reduce((best, member) =>
    casesOf(member) > casesOf(best) ? member : best,
  );
  const largest = members.reduce((best, member) =>
    member.squareFeet > best.squareFeet ? member : best,
  );
  // With more than one active registration, the one with the most total violations.
  const offender = members
    .flatMap(({ offender }) => (offender ? [offender] : []))
    .reduce<RepeatOffenderRecord | null>(
      (best, candidate) =>
        !best || candidate.totalViolations > best.totalViolations
          ? candidate
          : best,
      null,
    );

  const summaries = members.map((member) => member.summary);
  const lastCases = summaries.flatMap(({ lastCase }) =>
    lastCase ? [lastCase] : [],
  );
  const monthly = busiest.summary.detail.monthly.map(({ month }) => ({
    month,
    count: summaries.reduce(
      (sum, { detail }) =>
        sum +
        (detail.monthly.find((entry) => entry.month === month)?.count ?? 0),
      0,
    ),
  }));

  const complex: Complex = {
    id: busiest.id,
    parcelIds: members.map(({ id }) => id),
    address: busiest.label,
    lon: largest.lon,
    lat: largest.lat,
    acres: toAcres(members.reduce((sum, member) => sum + member.squareFeet, 0)),
    cases12: summaries.map(({ cases12 }) => cases12).reduce(addCounts),
    cases: summaries.map(({ cases }) => cases).reduce(addCounts),
    open: summaries.reduce((sum, { open }) => sum + open, 0),
    lastCase:
      lastCases.length === 0
        ? null
        : lastCases.reduce((newest, date) => (date > newest ? date : newest)),
    repeatOffender: offender
      ? {
          name: offender.name,
          units: offender.units,
          activeViolations: offender.activeViolations,
          totalViolations: offender.totalViolations,
        }
      : null,
    // A count published for one parcel does not describe a property of several.
    units: members.length === 1 ? members[0].units : null,
  };

  return {
    complex,
    detail: {
      id: busiest.id,
      monthly,
      latest: summaries
        .flatMap(({ detail }) => detail.latest)
        .sort(newestFirst)
        .slice(0, LATEST_LIMIT),
      bbox: unionBox(members.map(({ bbox }) => bbox)),
    },
  };
}

/** Appends the parcel ID to any label two complexes still share, so every published address names one complex. */
function disambiguate(properties: Property[]): Property[] {
  const uses = new Map<string, number>();
  for (const { complex } of properties)
    uses.set(complex.address, (uses.get(complex.address) ?? 0) + 1);
  return properties.map((property) =>
    (uses.get(property.complex.address) ?? 0) > 1
      ? {
          ...property,
          complex: {
            ...property.complex,
            address: `${property.complex.address} (parcel ${property.complex.id})`,
          },
        }
      : property,
  );
}

/**
 * Turns labelled parcels into published complexes. Parcels whose address came from inside the
 * parcel or from a Repeat Offender registration, with identical labels and centroids within 250 m
 * of another member, become one complex. Any label still shared afterwards gets its parcel ID.
 * Complexes come back in ID order.
 */
export function combineParcels(parcels: LabelledParcel[]): Property[] {
  const properties = groupSameProperty(parcels).map(combine);
  return disambiguate(properties).sort((a, b) =>
    compareText(a.complex.id, b.complex.id),
  );
}

/** Throws when two complexes would be published under one address. */
export function assertUniqueAddresses(complexes: Complex[]): void {
  const idsByAddress = new Map<string, string[]>();
  for (const { address, id } of complexes)
    idsByAddress.set(address, [...(idsByAddress.get(address) ?? []), id]);
  for (const [address, ids] of idsByAddress) {
    if (ids.length > 1) {
      throw new Error(
        `Complexes ${ids.join(", ")} share the address "${address}". Refusing to write.`,
      );
    }
  }
}
