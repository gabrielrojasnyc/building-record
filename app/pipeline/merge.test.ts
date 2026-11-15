import { describe, expect, it } from "vitest";
import type { Period } from "@/domain/periods";
import type {
  Category,
  Complaint,
  Counts,
  Deficiency,
  Tally,
} from "@/domain/types";
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
  tally?: Partial<Record<Period, Tally>>;
  duplicates?: Partial<Record<Period, number>>;
  violationsOpen?: number;
  complaints?: Complaint[];
}

function summary(
  id: string,
  {
    cases = {},
    cases12 = {},
    open = 0,
    opened = [],
    tally = {},
    duplicates = {},
    violationsOpen = 0,
    complaints = [],
  }: SummaryInput = {},
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
    tally: { m12: {}, y2: {}, y3: {}, ...tally },
    duplicates: { m12: 0, y2: 0, y3: 0, ...duplicates },
    violationsOpen,
    detail: {
      id,
      monthly: MONTHS.map((month) => ({
        month,
        count: opened.filter((date) => date.startsWith(month)).length,
      })),
      latest,
      complaints,
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
    outline: [
      [
        [
          [ORIGIN.lon - 0.0005, lat - 0.0005],
          [ORIGIN.lon + 0.0005, lat - 0.0005],
          [ORIGIN.lon + 0.0005, lat + 0.0005],
          [ORIGIN.lon - 0.0005, lat + 0.0005],
          [ORIGIN.lon - 0.0005, lat - 0.0005],
        ],
      ],
    ],
    summary: summary(id),
    offender: null,
    deficiencies: [],
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
    expect(complex.lat).toBeCloseTo(quiet.lat, 6);
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

  it("gives a merged complex every member parcel's polygons, in member order, and no name yet", () => {
    const first = parcel("0000000002");
    const second = parcel("0000000001", { metresNorth: 20 });
    const [{ complex, detail }] = combineParcels([first, second]);
    expect(detail.outline).toEqual([...second.outline, ...first.outline]);
    expect(detail.outline).toHaveLength(2);
    expect(complex.name).toBeNull();
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

describe("combineParcels outcome fields", () => {
  const complaint = (
    opened: string,
    overrides: Partial<Complaint> = {},
  ): Complaint => ({
    opened,
    closed: null,
    category: "structure",
    outcome: "none",
    stillOpen: false,
    cityOutcome: null,
    violationCase: null,
    ...overrides,
  });
  const deficiency = (overrides: Partial<Deficiency> = {}): Deficiency => ({
    category: "structure",
    kind: "Roofs and Drainage",
    cleared: 1,
    notCleared: 0,
    ...overrides,
  });

  it("combines tallies, complaints and deficiencies across a merged complex", () => {
    const first = parcel("0204040107", {
      deficiencies: [
        deficiency({ cleared: 2, notCleared: 1 }),
        deficiency({
          category: "property",
          kind: "Trash",
          cleared: 1,
          notCleared: 0,
        }),
      ],
      summary: summary("0204040107", {
        cases: { structure: 3 },
        tally: {
          m12: { structure: { none: 1 } },
          y3: { structure: { none: 2, violation: 1 }, property: { fixed: 1 } },
        },
        duplicates: { m12: 1, y2: 1, y3: 2 },
        violationsOpen: 1,
        complaints: [
          complaint("2026-11-02"),
          complaint("2026-10-01", { outcome: "violation", stillOpen: true }),
        ],
      }),
    });
    const second = parcel("0203020605", {
      metresNorth: 20,
      deficiencies: [deficiency({ cleared: 0, notCleared: 4 })],
      summary: summary("0203020605", {
        cases: { structure: 1 },
        tally: {
          m12: { structure: { none: 2 }, landuse: { open: 1 } },
          y3: { structure: { none: 1, other: 1 } },
        },
        duplicates: { m12: 0, y2: 3, y3: 3 },
        violationsOpen: 2,
        complaints: [complaint("2026-11-12"), complaint("2026-09-30")],
      }),
    });

    const [{ complex, detail }] = combineParcels([first, second]);

    expect(complex.tally).toEqual({
      m12: { structure: { none: 3 }, landuse: { open: 1 } },
      y2: {},
      y3: {
        structure: { none: 3, violation: 1, other: 1 },
        property: { fixed: 1 },
      },
    });
    expect(complex.duplicates).toEqual({ m12: 1, y2: 4, y3: 5 });
    expect(complex.violationsOpen).toBe(3);
    expect(detail.complaints.map(({ opened }) => opened)).toEqual([
      "2026-11-12",
      "2026-11-02",
      "2026-10-01",
      "2026-09-30",
    ]);
    expect(detail.deficiencies).toEqual([
      {
        category: "structure",
        kind: "Roofs and Drainage",
        cleared: 2,
        notCleared: 5,
      },
      { category: "property", kind: "Trash", cleared: 1, notCleared: 0 },
    ]);
  });

  it("does not let the order members are given in change the order of complaints opened the same day", () => {
    const a = complaint("2026-05-01", { category: "landuse" });
    const b = complaint("2026-05-01", { category: "structure" });
    const merged = (members: [Complaint[], Complaint[]]) =>
      combineParcels([
        parcel("0000000001", {
          summary: summary("0000000001", { complaints: members[0] }),
        }),
        parcel("0000000002", {
          metresNorth: 20,
          summary: summary("0000000002", { complaints: members[1] }),
        }),
      ])[0].detail.complaints;
    expect(merged([[b], [a]])).toEqual(merged([[a], [b]]));
    expect(merged([[b], [a]]).map(({ category }) => category)).toEqual([
      "landuse",
      "structure",
    ]);
  });

  it("gives a complex of one parcel that parcel's own figures", () => {
    const only = parcel("0100000001", {
      deficiencies: [deficiency()],
      summary: summary("0100000001", {
        tally: { y3: { permit: { open: 1 } } },
        duplicates: { y3: 1 },
        complaints: [
          complaint("2026-05-01", { category: "permit", outcome: "open" }),
        ],
      }),
    });
    const [{ complex, detail }] = combineParcels([only]);
    expect(complex.tally.y3).toEqual({ permit: { open: 1 } });
    expect(complex.duplicates.y3).toBe(1);
    expect(detail.complaints).toHaveLength(1);
    expect(detail.deficiencies).toEqual([deficiency()]);
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
