import { describe, expect, it, vi } from "vitest";
import type { Complex, Counts } from "@/domain/types";
import { escapeSoql, searchAddresses, searchComplexes } from "./addressSearch";

const counts: Counts = { structure: 0, property: 0, landuse: 0, permit: 0 };

function complex(id: string, address: string): Complex {
  return {
    id,
    address,
    lon: -97.7,
    lat: 30.2,
    acres: 2,
    cases12: counts,
    cases: counts,
    open: 0,
    lastCase: null,
    repeatOffender: null,
    units: null,
  };
}

const complexes = [
  complex("a", "1601 Royal Crest Dr"),
  complex("b", "Park at Royal Crest Dr Annex"),
  complex("c", "900 W 26th St"),
];

const cityRow = (name: string) => ({
  full_street_name: name,
  the_geom: { type: "Point", coordinates: [-97.74, 30.26] },
});

function fakeCity(rows: unknown[]) {
  return vi.fn<typeof fetch>(async () => Response.json(rows));
}

describe("escapeSoql", () => {
  it("escapes quotes and wildcards", () => {
    expect(escapeSoql(`o'brien%_`)).toBe(`o''brien\\%\\_`);
  });

  it("escapes the escape character so a backslash stays literal", () => {
    expect(escapeSoql(`a\\b`)).toBe(`a\\\\b`);
  });
});

describe("searchAddresses", () => {
  it("returns nothing for fewer than 3 characters without calling the city", async () => {
    const fetchImpl = fakeCity([]);
    await expect(searchAddresses("  16 ", complexes, fetchImpl)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lists matching complexes before other addresses and caps at 6", async () => {
    const fetchImpl = fakeCity([
      cityRow("1601 ROYAL CREST DR"),
      cityRow("1601 ROYAL OAK LN"),
      cityRow("1601 ROYAL VIEW CT"),
      cityRow("1601 ROYAL WAY"),
      cityRow("1601 ROYAL ST"),
      cityRow("1601 ROYAL RD"),
    ]);
    const matches = await searchAddresses("1601 Roy", complexes, fetchImpl);

    expect(matches).toHaveLength(6);
    expect(matches[0]).toMatchObject({ label: "1601 Royal Crest Dr", complexId: "a" });
    expect(matches.slice(1).every((match) => match.complexId === null)).toBe(true);
  });

  it("puts complexes that start with the text before those that merely contain it, then sorts alphabetically", async () => {
    const matches = await searchAddresses("1601 royal", complexes, fakeCity([]));
    expect(matches.map((match) => match.label)).toEqual(["1601 Royal Crest Dr"]);

    const contained = await searchAddresses("crest", complexes, fakeCity([]));
    expect(contained.map((match) => match.label)).toEqual(["1601 Royal Crest Dr", "Park at Royal Crest Dr Annex"]);

    const ordered = await searchAddresses(
      "main",
      [complex("x", "5 Main St"), complex("y", "Main Annex 9"), complex("z", "2 Main St"), complex("w", "Main Alley 1")],
      fakeCity([]),
    );
    expect(ordered.map((match) => match.label)).toEqual(["Main Alley 1", "Main Annex 9", "2 Main St", "5 Main St"]);
  });

  it("drops a city address that repeats a complex already listed", async () => {
    const matches = await searchAddresses("1601 Royal", complexes, fakeCity([cityRow("1601 ROYAL CREST DR"), cityRow("1601 ROYAL OAK LN")]));
    expect(matches.map((match) => match.label)).toEqual(["1601 Royal Crest Dr", "1601 Royal Oak Ln"]);
  });

  it("formats city addresses and carries their point", async () => {
    const [match] = await searchAddresses("100 Cong", [], fakeCity([cityRow("100 CONGRESS AVE")]));
    expect(match).toEqual({ label: "100 Congress Ave", lon: -97.74, lat: 30.26, complexId: null });
  });

  it("still returns complex matches when the city lookup fails", async () => {
    const failing = vi.fn<typeof fetch>(async () => new Response("nope", { status: 503 }));
    await expect(searchAddresses("1601 Roy", complexes, failing)).resolves.toMatchObject([{ complexId: "a" }]);

    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    await expect(searchAddresses("1601 Roy", complexes, offline)).resolves.toMatchObject([{ complexId: "a" }]);
  });

  it("asks the city for primary addresses that start with the escaped text, at most 6", async () => {
    const fetchImpl = fakeCity([]);
    await searchAddresses("o'b_%", [], fetchImpl);

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://data.austintexas.gov/resource/9s7j-tygf.json");
    expect(url.searchParams.get("$where")).toBe(
      "address_type='1' AND upper(full_street_name) like upper('o''b\\_\\%%')",
    );
    expect(url.searchParams.get("$limit")).toBe("6");
  });
});

describe("searchComplexes", () => {
  it("matches complexes only, never asking the city, with the same ordering as the full search", () => {
    expect(searchComplexes("royal crest", complexes).map((match) => match.complexId)).toEqual(["a", "b"]);
  });

  it("returns nothing for fewer than 3 characters", () => {
    expect(searchComplexes("16", complexes)).toEqual([]);
  });

  it("returns at most 6", () => {
    const many = Array.from({ length: 9 }, (_, index) => complex(String(index), `${index} Oak Ln`));
    expect(searchComplexes("oak", many)).toHaveLength(6);
  });
});
