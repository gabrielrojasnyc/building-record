import { describe, expect, it } from "vitest";
import type { Category, Counts } from "@/domain/types";
import type { CaseSummary } from "./cases";
import type { RepeatOffenderRecord } from "./context";
import {
  assertUniqueAddresses,
  combineParcels,
  type LabelledParcel,
} from "./merge";

const METRES_PER_DEGREE_LAT = 111_195;
const ORIGIN = { lon: -97.75, lat: 30.3 };
const MONTHS = ["2026-09", "2026-10", "2026-11"];
const SQUARE_FEET_PER_ACRE = 43_560;

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

interface SummaryInput {
  cases?: Partial<Counts>;
  cases12?: Partial<Counts>;
  open?: number;
  /** Opened dates, each a structure case, in any order. */
  opened?: string[];
}

function summary(
  id: string,
  { cases = {}, cases12 = {}, open = 0, opened = [] }: SummaryInput = {},
): CaseSummary {
  const latest = [...opened]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, 8)
    .map((date) => ({
      opened: date,
      category: "structure" as Category,
      status: "Closed",
    }));
  return {
    cases: counts(cases),
    cases12: counts(cases12),
    open,
    lastCase: latest[0]?.opened ?? null,
    detail: {
      id,
      monthly: MONTHS.map((month) => ({
        month,
        count: opened.filter((date) => date.startsWith(month)).length,
      })),
      latest,
    },
  };
}

const offender = (
  overrides: Partial<RepeatOffenderRecord> = {},
): RepeatOffenderRecord => ({
  name: "Example Apartments",
  units: 200,
  activeViolations: 1,
  totalViolations: 10,
  registeredAddress: "100 MAIN ST",
  ...overrides,
});

/** A parcel `metresNorth` of a fixed origin, so two parcels' distance is the difference of their offsets. */
function parcel(
  id: string,
  {
    metresNorth = 0,
    acres = 1,
    ...overrides
  }: Partial<LabelledParcel> & { metresNorth?: number; acres?: number } = {},
): LabelledParcel {
  const lat = ORIGIN.lat + metresNorth / METRES_PER_DEGREE_LAT;
  return {
    id,
    label: "100 Main St",
    source: "inside",
    lon: ORIGIN.lon,
    lat,
    squareFeet: acres * SQUARE_FEET_PER_ACRE,
    bbox: [
      ORIGIN.lon - 0.0005,
      lat - 0.0005,
      ORIGIN.lon + 0.0005,
      lat + 0.0005,
    ],
    summary: summary(id),
    offender: null,
    ...overrides,
  };
}

const addresses = (parcels: LabelledParcel[]) =>
  combineParcels(parcels).map(({ complex }) => complex.address);

describe("combineParcels", () => {
  it("leaves a parcel with an address of its own as a complex of one parcel", () => {
    const [only] = combineParcels([parcel("0100000001")]);
    expect(only.complex.id).toBe("0100000001");
    expect(only.complex.parcelIds).toEqual(["0100000001"]);
    expect(only.complex.address).toBe("100 Main St");
    expect(only.detail.id).toBe("0100000001");
  });

  it("makes one complex of two parcels with the same address 20 m apart, adding their records together", () => {
    const busy = parcel("0204040107", {
      acres: 1.2,
      summary: summary("0204040107", {
        cases: { structure: 30, property: 9 },
        cases12: { structure: 4 },
        open: 2,
        opened: [
          "2026-09-03",
          "2026-10-01",
          "2026-10-20",
          "2026-11-02",
          "2026-11-09",
          "2026-11-10",
        ],
      }),
    });
    const quiet = parcel("0203020605", {
      metresNorth: 20,
      acres: 1.5,
      summary: summary("0203020605", {
        cases: { landuse: 1, permit: 2 },
        cases12: { permit: 1 },
        open: 1,
        opened: ["2026-09-30", "2026-11-12", "2026-11-11"],
      }),
    });

    const merged = combineParcels([busy, quiet]);

    expect(merged).toHaveLength(1);
    const [{ complex, detail }] = merged;
    expect(complex.id).toBe("0204040107");
    expect(complex.parcelIds).toEqual(["0203020605", "0204040107"]);
    expect(complex.address).toBe("100 Main St");
    expect(complex.cases).toEqual(
      counts({ structure: 30, property: 9, landuse: 1, permit: 2 }),
    );
    expect(complex.cases12).toEqual(counts({ structure: 4, permit: 1 }));
    expect(complex.open).toBe(3);
    expect(complex.lastCase).toBe("2026-11-12");
    expect(complex.acres).toBe(2.7);
    // The larger parcel's centroid, so the pin sits on the bulk of the property.
    expect(complex.lat).toBe(quiet.lat);
    expect(detail.id).toBe("0204040107");
    expect(detail.monthly).toEqual([
      { month: "2026-09", count: 2 },
      { month: "2026-10", count: 2 },
      { month: "2026-11", count: 5 },
    ]);
    expect(detail.latest.map(({ opened }) => opened)).toEqual([
      "2026-11-12",
      "2026-11-11",
      "2026-11-10",
      "2026-11-09",
      "2026-11-02",
      "2026-10-20",
      "2026-10-01",
      "2026-09-30",
    ]);
    expect(detail.bbox).toEqual([
      busy.bbox[0],
      busy.bbox[1],
      quiet.bbox[2],
      quiet.bbox[3],
    ]);
  });

  it("sums the exact areas before rounding to a tenth of an acre", () => {
    const [{ complex }] = combineParcels([
      parcel("0000000001", { acres: 0.04 }),
      parcel("0000000002", { acres: 0.04, metresNorth: 10 }),
    ]);
    expect(complex.acres).toBe(0.1);
  });

  it("keeps two parcels with the same address 400 m apart separate, each named with its parcel ID", () => {
    expect(
      addresses([
        parcel("0000000001"),
        parcel("0000000002", { metresNorth: 400 }),
      ]),
    ).toEqual([
      "100 Main St (parcel 0000000001)",
      "100 Main St (parcel 0000000002)",
    ]);
  });

  it("measures the 250 m limit between centroids", () => {
    expect(
      combineParcels([
        parcel("0000000001"),
        parcel("0000000002", { metresNorth: 249 }),
      ]),
    ).toHaveLength(1);
    expect(
      combineParcels([
        parcel("0000000001"),
        parcel("0000000002", { metresNorth: 251 }),
      ]),
    ).toHaveLength(2);
  });

  it("merges a chain of parcels each within 250 m of the next, even when its ends are 400 m apart", () => {
    // The ruling joins a parcel within 250 m of any member of the group, so a chain becomes one complex.
    const chain = [
      parcel("0000000001"),
      parcel("0000000002", { metresNorth: 200 }),
      parcel("0000000003", { metresNorth: 400 }),
    ];
    const merged = combineParcels(chain);
    expect(merged).toHaveLength(1);
    expect(merged[0].complex.parcelIds).toEqual([
      "0000000001",
      "0000000002",
      "0000000003",
    ]);
  });

  it("never merges a parcel named after a nearby address with the parcel that address is inside", () => {
    const owner = parcel("0000000001");
    const neighbour = parcel("0000000002", {
      metresNorth: 20,
      source: "nearby",
      label: "Parcel 0000000002, near 100 Main St",
    });
    expect(addresses([owner, neighbour])).toEqual([
      "100 Main St",
      "Parcel 0000000002, near 100 Main St",
    ]);
  });

  it("merges only labels taken from inside the parcel or from a registration, whatever the text", () => {
    const nearby = parcel("0000000002", { metresNorth: 20, source: "nearby" });
    const none = parcel("0000000003", { metresNorth: 40, source: "none" });
    expect(combineParcels([parcel("0000000001"), nearby, none])).toHaveLength(
      3,
    );
  });

  it("treats a registered address like an address inside the parcel", () => {
    const registered = parcel("0168090512", {
      source: "registered",
      label: "8312 Fathom Cir",
      offender: offender(),
      summary: summary("0168090512", { cases: { structure: 25 } }),
    });
    const sameLand = parcel("R072626", {
      source: "inside",
      label: "8312 Fathom Cir",
      metresNorth: 20,
    });
    const merged = combineParcels([sameLand, registered]);
    expect(merged).toHaveLength(1);
    expect(merged[0].complex).toMatchObject({
      id: "0168090512",
      parcelIds: ["0168090512", "R072626"],
      address: "8312 Fathom Cir",
    });
  });

  it("takes the Repeat Offender registration from the member that holds it, even when another member has more cases", () => {
    const busy = parcel("0000000002", {
      summary: summary("0000000002", { cases: { property: 9 } }),
    });
    const listed = parcel("0000000001", {
      metresNorth: 30,
      offender: offender({ name: "Listed Flats", totalViolations: 4 }),
    });
    const [{ complex }] = combineParcels([busy, listed]);
    expect(complex.id).toBe("0000000002");
    expect(complex.repeatOffender).toEqual({
      name: "Listed Flats",
      units: 200,
      activeViolations: 1,
      totalViolations: 4,
    });
  });

  it("with two registrations, takes the one with more total violations", () => {
    const fewer = parcel("0000000001", {
      offender: offender({ name: "Fewer", totalViolations: 4 }),
    });
    const more = parcel("0000000002", {
      metresNorth: 30,
      offender: offender({ name: "More", totalViolations: 40 }),
    });
    expect(combineParcels([fewer, more])[0].complex.repeatOffender?.name).toBe(
      "More",
    );
  });

  it("keeps the busiest member as the complex ID, and the lowest ID when members tie", () => {
    const busyHigh = parcel("R072626", {
      summary: summary("R072626", { cases: { structure: 2 } }),
    });
    const quietLow = parcel("0168090512", {
      metresNorth: 20,
      summary: summary("0168090512", { cases: { structure: 1 } }),
    });
    expect(combineParcels([quietLow, busyHigh])[0].complex.id).toBe("R072626");

    const tiedHigh = parcel("R072626", {
      summary: summary("R072626", { cases: { structure: 1 } }),
    });
    expect(combineParcels([tiedHigh, quietLow])[0].complex.id).toBe(
      "0168090512",
    );
    expect(combineParcels([quietLow, tiedHigh])[0].complex.id).toBe(
      "0168090512",
    );
  });

  it("counts only cases since November 2023 when choosing the busiest member", () => {
    const recent = parcel("0000000002", {
      summary: summary("0000000002", {
        cases: { structure: 3 },
        cases12: { structure: 3 },
      }),
    });
    const older = parcel("0000000001", {
      metresNorth: 20,
      summary: summary("0000000001", { cases: { structure: 5 } }),
    });
    expect(combineParcels([recent, older])[0].complex.id).toBe("0000000001");
  });

  it("returns complexes in ID order", () => {
    const merged = combineParcels([
      parcel("0000000003", { label: "C" }),
      parcel("0000000001", { label: "A" }),
      parcel("0000000002", { label: "B" }),
    ]);
    expect(merged.map(({ complex }) => complex.id)).toEqual([
      "0000000001",
      "0000000002",
      "0000000003",
    ]);
  });
});

describe("assertUniqueAddresses", () => {
  it("passes distinct addresses and refuses two complexes with the same one", () => {
    const [a, b] = combineParcels([
      parcel("0000000001", { label: "A" }),
      parcel("0000000002", { label: "B" }),
    ]).map(({ complex }) => complex);
    expect(() => assertUniqueAddresses([a, b])).not.toThrow();
    expect(() =>
      assertUniqueAddresses([a, { ...b, address: a.address }]),
    ).toThrow(/0000000001, 0000000002 share the address "A"/);
  });
});
