import { describe, expect, it, vi } from "vitest";
import type { Complex } from "@/domain/types";
import { escapeSoql, searchAddresses, searchComplexes } from "./addressSearch";

function complex(id: string, address: string, name: string | null = null): Complex {
  return {
    id,
    parcelIds: [id],
    address,
    name: name === null ? null : { text: name, source: "openstreetmap" },
    lon: -97.7,
    lat: 30.2,
    acres: 2,
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    repeatOffender: null,
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
    await expect(searchAddresses("  16 ", complexes, fetchImpl)).resolves.toEqual({ matches: [], cityUnavailable: false });
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
    const { matches, cityUnavailable } = await searchAddresses("1601 Roy", complexes, fetchImpl);

    expect(cityUnavailable).toBe(false);
    expect(matches).toHaveLength(6);
    expect(matches[0]).toMatchObject({ label: "1601 Royal Crest Dr", complexId: "a" });
    expect(matches.slice(1).every((match) => match.complexId === null)).toBe(true);
  });

  it("puts complexes that start with the text before those that merely contain it, then sorts alphabetically", async () => {
    const { matches } = await searchAddresses("1601 royal", complexes, fakeCity([]));
    expect(matches.map((match) => match.label)).toEqual(["1601 Royal Crest Dr"]);

    const { matches: contained } = await searchAddresses("crest", complexes, fakeCity([]));
    expect(contained.map((match) => match.label)).toEqual(["1601 Royal Crest Dr", "Park at Royal Crest Dr Annex"]);

    const { matches: ordered } = await searchAddresses(
      "main",
      [complex("x", "5 Main St"), complex("y", "Main Annex 9"), complex("z", "2 Main St"), complex("w", "Main Alley 1")],
      fakeCity([]),
    );
    expect(ordered.map((match) => match.label)).toEqual(["Main Alley 1", "Main Annex 9", "2 Main St", "5 Main St"]);
  });

  it("drops a city address that repeats a complex already listed", async () => {
    const { matches } = await searchAddresses("1601 Royal", complexes, fakeCity([cityRow("1601 ROYAL CREST DR"), cityRow("1601 ROYAL OAK LN")]));
    expect(matches.map((match) => match.label)).toEqual(["1601 Royal Crest Dr", "1601 Royal Oak Ln"]);
  });

  it("formats city addresses and carries their point", async () => {
    const {
      matches: [match],
    } = await searchAddresses("100 Cong", [], fakeCity([cityRow("100 CONGRESS AVE")]));
    expect(match).toEqual({ label: "100 Congress Ave", name: null, lon: -97.74, lat: 30.26, complexId: null });
  });

  it("still returns complex matches when the city lookup fails, and says the city could not be reached", async () => {
    const failing = vi.fn<typeof fetch>(async () => new Response("nope", { status: 503 }));
    await expect(searchAddresses("1601 Roy", complexes, failing)).resolves.toEqual({
      matches: [expect.objectContaining({ complexId: "a" })],
      cityUnavailable: true,
    });

    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    await expect(searchAddresses("zzzz", complexes, offline)).resolves.toEqual({ matches: [], cityUnavailable: true });
  });

  it("does not ask the city, and so cannot miss it, when complexes fill every suggestion", async () => {
    const many = Array.from({ length: 6 }, (_, index) => complex(String(index), `${index} Oak Ln`));
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    const result = await searchAddresses("oak", many, offline);
    expect(offline).not.toHaveBeenCalled();
    expect(result.cityUnavailable).toBe(false);
    expect(result.matches).toHaveLength(6);
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

describe("searching by name", () => {
  const named = [
    complex("array", "2000 Burton Dr", "Array Apartments"),
    complex("arroyo", "4400 Pearce Rd", "The Arrayo"),
    complex("lane", "12 Array Ln"),
    complex("court", "Array Ct 5"),
    complex("other", "900 W 26th St", "Pearl Flats"),
  ];

  it("finds a named complex by its name and carries the name beside its address", async () => {
    const { matches } = await searchAddresses("array apart", named, fakeCity([]));
    expect(matches).toEqual([{ label: "2000 Burton Dr", name: "Array Apartments", lon: -97.7, lat: 30.2, complexId: "array" }]);
  });

  it("still finds a named complex by its address", async () => {
    const { matches } = await searchAddresses("2000 bur", named, fakeCity([]));
    expect(matches).toEqual([expect.objectContaining({ label: "2000 Burton Dr", name: "Array Apartments", complexId: "array" })]);
  });

  it("gives an unnamed complex no name", async () => {
    const { matches } = await searchAddresses("12 array", named, fakeCity([]));
    expect(matches).toEqual([expect.objectContaining({ label: "12 Array Ln", name: null, complexId: "lane" })]);
  });

  it("ranks names and addresses by one rule: those starting with the text first, then those containing it, each alphabetical by the text that matched", async () => {
    const { matches } = await searchAddresses("array", named, fakeCity([]));
    expect(matches.map((match) => match.complexId)).toEqual(["array", "court", "lane", "arroyo"]);
  });

  it("finds names without a map too", () => {
    expect(searchComplexes("pearl", named).map((match) => match.complexId)).toEqual(["other"]);
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
