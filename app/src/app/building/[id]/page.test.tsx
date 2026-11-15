import { expect, it, vi } from "vitest";
import type { Complex } from "@/domain/types";
import { generateMetadata } from "./page";

function complex(
  id: string,
  address: string,
  name: string | null,
  tally: Complex["tally"] = { m12: {}, y2: {}, y3: {} },
): Complex {
  return {
    id,
    parcelIds: [id],
    address,
    name: name === null ? null : { text: name, source: "openstreetmap" },
    lon: -97.7,
    lat: 30.2,
    acres: 14.2,
    open: 0,
    tally,
    duplicates: { m12: 40, y2: 41, y3: 43 },
    violationsOpen: 0,
    repeatOffender: null,
  };
}

vi.mock("../../dataFiles", () => ({
  readDataFile: vi.fn(async () => [
    complex("0307050309", "2000 Burton Dr", "Array Apartments", {
      m12: { structure: { violation: 19, none: 13 } },
      y2: {},
      y3: {
        structure: { violation: 112, none: 71, other: 2 },
        property: { violation: 5, none: 7, other: 1 },
        landuse: { violation: 2, fixed: 1 },
      },
    }),
    complex("0304070701", "1601 Royal Crest Dr", null),
    complex("0100000001", "1 One Complaint Ln", null, {
      m12: {},
      y2: {},
      y3: { permit: { open: 1 } },
    }),
  ]),
}));

const metadataFor = (id: string) =>
  generateMetadata({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });

it("titles a named building's page by its name and address", async () => {
  expect((await metadataFor("0307050309")).title).toBe(
    "Array Apartments, 2000 Burton Dr: code complaint record",
  );
});

it("titles an unnamed building's page by its address alone", async () => {
  expect((await metadataFor("0304070701")).title).toBe(
    "1601 Royal Crest Dr: code complaint record",
  );
});

it("describes the record as complaints in the last 3 years, duplicates left out", async () => {
  expect((await metadataFor("0307050309")).description).toBe(
    "2000 Burton Dr: 201 complaints in the last 3 years. Data from the City of Austin.",
  );
  expect((await metadataFor("0100000001")).description).toBe(
    "1 One Complaint Ln: 1 complaint in the last 3 years. Data from the City of Austin.",
  );
  expect((await metadataFor("0304070701")).description).toBe(
    "1601 Royal Crest Dr: no complaints in the last 3 years. Data from the City of Austin.",
  );
});
