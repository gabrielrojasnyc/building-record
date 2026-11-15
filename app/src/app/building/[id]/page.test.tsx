import { expect, it, vi } from "vitest";
import type { Complex, Counts } from "@/domain/types";
import { generateMetadata } from "./page";

const none: Counts = { structure: 0, property: 0, landuse: 0, permit: 0 };

function complex(id: string, address: string, name: string | null): Complex {
  return {
    id,
    parcelIds: [id],
    address,
    name: name === null ? null : { text: name, source: "openstreetmap" },
    lon: -97.7,
    lat: 30.2,
    acres: 14.2,
    cases12: none,
    cases: none,
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    lastCase: null,
    repeatOffender: null,
  };
}

vi.mock("../../dataFiles", () => ({
  readDataFile: vi.fn(async () => [
    complex("0307050309", "2000 Burton Dr", "Array Apartments"),
    complex("0304070701", "1601 Royal Crest Dr", null),
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
