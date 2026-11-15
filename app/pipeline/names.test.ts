import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Outline } from "@/domain/types";
import {
  TITLE_REVIEW_PATH,
  chooseName as choose,
  cleanPlaceName,
  fetchApartmentNames,
  looksLikeLegalEntity,
  namesAgree,
  readTitleReview,
  type NamedPlace,
  type TitleReview,
} from "./names";

/** A 0.01 degree block. */
const outline: Outline = [
  [
    [
      [-97.75, 30.3],
      [-97.74, 30.3],
      [-97.74, 30.31],
      [-97.75, 30.31],
      [-97.75, 30.3],
    ],
  ],
];
const inside = { lon: -97.745, lat: 30.305 };
const alsoInside = { lon: -97.742, lat: 30.307 };
const outside = { lon: -97.7, lat: 30.305 };

const place = (name: string, at: { lon: number; lat: number }): NamedPlace => ({
  name,
  ...at,
});

const PARCEL = "0304070701";
const NO_REVIEW: TitleReview = { cityTitles: {}, withheld: {} };

/** The title alone, for a one-parcel complex whose city name, when it has one, a person approved. */
function chooseName(
  outline: Outline,
  places: NamedPlace[],
  registeredName: string | null,
) {
  const review: TitleReview = registeredName
    ? { cityTitles: { [PARCEL]: registeredName }, withheld: {} }
    : NO_REVIEW;
  return choose(
    { outline, parcelIds: [PARCEL], registeredName },
    places,
    review,
  ).name;
}

describe("namesAgree", () => {
  it.each([
    ["Solaris Austin", "Mia Riverside"],
    ["Falls on Bull Creek", "Capital Hills Apartment Homes"],
    ["Verde Apartments", "The Patten West"],
    ["Fairway Village", "Riverside Townhomes"],
    ["Acclaim at South Congress", "Blunn Creek Apartments"],
    ["Arbors at Creekside", "Sunday Village Apartments"],
    ["The Vibe", "The Arbors Of Austin Apartments"],
    ["Santora Villas", "Frontier East Apartments"],
  ])(
    "reads %s and the registration %s as two different names",
    (openStreetMap, city) => {
      expect(namesAgree(openStreetMap, city)).toBe(false);
      expect(namesAgree(city, openStreetMap)).toBe(false);
    },
  );

  it.each([
    ["City View at Mueller", "Mueller City View Apartments"],
    ["Casa Hills Apartments @290", "Casa Hills @ 290 Apartments"],
    ["Creek's Edge Apartments", "Creeks Edge Apartments"],
  ])("reads %s and the registration %s as one name", (openStreetMap, city) => {
    expect(namesAgree(openStreetMap, city)).toBe(true);
    expect(namesAgree(city, openStreetMap)).toBe(true);
  });

  it("agrees when every word left of one name is in the other", () => {
    expect(namesAgree("Menlo at Mueller", "Menlo Apartments")).toBe(true);
    expect(
      namesAgree("South Shore Apartments", "Avesta South Shore Apartments"),
    ).toBe(true);
    expect(namesAgree("Altura Falls", "Avesta Altura Apartments")).toBe(false);
  });

  it("ignores case, punctuation and the words that only say what kind of place it is", () => {
    expect(
      namesAgree(
        "Oaks",
        "THE OAKS: a Home, Homes, Apartment, Apartments, Apts. and Townhomes at Austin, in the Oaks, of the Oaks, on the Oaks",
      ),
    ).toBe(true);
    expect(namesAgree("Oaks", "The Oaks Village")).toBe(true);
    expect(namesAgree("Oaks Square", "The Oaks Village")).toBe(false);
  });
});

describe("chooseName against the city registration", () => {
  const at = { outline, parcelIds: [PARCEL] };

  it("keeps the OpenStreetMap name when the registration agrees with it", () => {
    expect(
      choose(
        { ...at, registeredName: "The Palms On Lamar Apartments" },
        [place("The Palms on Lamar", inside)],
        NO_REVIEW,
      ),
    ).toEqual({
      name: { text: "The Palms on Lamar", source: "openstreetmap" },
      awaitingReview: null,
    });
  });

  it("shows no name when the registration names the place something else, since either could be the current one", () => {
    expect(
      choose(
        { ...at, registeredName: "Mia Riverside" },
        [place("Solaris Austin", inside)],
        { cityTitles: { [PARCEL]: "Mia Riverside" }, withheld: {} },
      ),
    ).toEqual({ name: null, awaitingReview: null });
  });

  it("does not hold a company's name against the OpenStreetMap name", () => {
    expect(
      choose(
        { ...at, registeredName: "1830 W Rundberg Db Llc" },
        [place("Lantana Trace", inside)],
        NO_REVIEW,
      ).name,
    ).toEqual({ text: "Lantana Trace", source: "openstreetmap" });
  });

  it("uses a city name as the title only when a person approved that exact name, for any of the complex's parcels", () => {
    expect(
      choose(
        {
          outline,
          parcelIds: [PARCEL, "R056943"],
          registeredName: "Mia Riverside, Building 4",
        },
        [],
        {
          cityTitles: { R056943: "Mia Riverside, Building 4" },
          withheld: {},
        },
      ),
    ).toEqual({
      name: { text: "Mia Riverside", source: "city" },
      awaitingReview: null,
    });
  });

  it("holds back a city name nobody has approved, and says it awaits review", () => {
    expect(
      choose(
        { ...at, registeredName: "Rundberg Capital Group" },
        [],
        NO_REVIEW,
      ),
    ).toEqual({ name: null, awaitingReview: "Rundberg Capital Group" });
  });

  it("treats a renamed registration as unapproved until the approved list changes", () => {
    expect(
      choose({ ...at, registeredName: "Mia Riverside East" }, [], {
        cityTitles: { [PARCEL]: "Mia Riverside" },
        withheld: {},
      }),
    ).toEqual({ name: null, awaitingReview: "Mia Riverside East" });
  });

  it("withholds any name, from either source, for a parcel on the withheld list", () => {
    const review: TitleReview = {
      cityTitles: { [PARCEL]: "Mia Riverside" },
      withheld: { [PARCEL]: "OpenStreetMap name is a former name" },
    };
    expect(
      choose(
        { ...at, registeredName: null },
        [place("Solaris Austin", inside)],
        review,
      ),
    ).toEqual({ name: null, awaitingReview: null });
    expect(
      choose({ ...at, registeredName: "Mia Riverside" }, [], review),
    ).toEqual({ name: null, awaitingReview: null });
  });
});

describe("readTitleReview", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "title-review-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reads the approved city titles and the withheld parcels", async () => {
    const path = join(root, "title-review.json");
    writeFileSync(
      path,
      JSON.stringify({
        cityTitles: { [PARCEL]: "Mia Riverside" },
        withheld: { R056943: "Former name" },
      }),
    );
    await expect(readTitleReview(path)).resolves.toEqual({
      cityTitles: { [PARCEL]: "Mia Riverside" },
      withheld: { R056943: "Former name" },
    });
  });

  it("refuses a review file that is missing or not the expected shape, since it decides which names show", async () => {
    const path = join(root, "title-review.json");
    await expect(readTitleReview(path)).rejects.toThrow(path);
    writeFileSync(path, '{"cityTitles": ');
    await expect(readTitleReview(path)).rejects.toThrow(path);
    writeFileSync(
      path,
      JSON.stringify({ cityTitles: { [PARCEL]: 7 }, withheld: {} }),
    );
    await expect(readTitleReview(path)).rejects.toThrow(/cityTitles/);
    writeFileSync(path, JSON.stringify({ cityTitles: {} }));
    await expect(readTitleReview(path)).rejects.toThrow(/withheld/);
  });

  it("reads the committed file", async () => {
    const review = await readTitleReview(TITLE_REVIEW_PATH);
    expect(Object.keys(review.cityTitles).length).toBeGreaterThan(0);
    expect(Object.keys(review.withheld).length).toBeGreaterThan(0);
  });
});

describe("chooseName", () => {
  it("names a complex when exactly one distinct apartment name lies inside it", () => {
    expect(
      chooseName(
        outline,
        [
          place("Lantana Trace", inside),
          place("Lantana Trace", alsoInside),
          place("Elsewhere", outside),
        ],
        null,
      ),
    ).toEqual({ text: "Lantana Trace", source: "openstreetmap" });
  });

  it("shows no name when two different names lie inside", () => {
    expect(
      chooseName(
        outline,
        [place("North Phase", inside), place("South Phase", alsoInside)],
        "City Name",
      ),
    ).toBeNull();
  });

  it("prefers the OpenStreetMap name's own words over a city name that agrees with it", () => {
    expect(
      chooseName(
        outline,
        [place("Lantana Trace", inside)],
        "Lantana Trace Apartments",
      ),
    ).toEqual({
      text: "Lantana Trace",
      source: "openstreetmap",
    });
  });

  it("falls back to the city name when OpenStreetMap has none inside", () => {
    expect(
      chooseName(outline, [place("Elsewhere", outside)], "Mia Riverside"),
    ).toEqual({ text: "Mia Riverside", source: "city" });
    expect(chooseName(outline, [], "Mia Riverside")).toEqual({
      text: "Mia Riverside",
      source: "city",
    });
  });

  it("has no name when there is neither", () => {
    expect(chooseName(outline, [], null)).toBeNull();
    expect(chooseName(outline, [], "   ")).toBeNull();
  });

  it("does not use a city name that is a legal entity", () => {
    expect(chooseName(outline, [], "1830 W Rundberg Db Llc")).toBeNull();
    expect(looksLikeLegalEntity("Burton Holdings LP")).toBe(true);
    expect(looksLikeLegalEntity("The Social")).toBe(false);
  });
});

describe("cleanPlaceName", () => {
  it.each([
    ["Travis at the Lake, building 3", "Travis at the Lake"],
    ["Griffis at the Domain (Building 1/2/3)", "Griffis at the Domain"],
    ["Triangle Building C", "Triangle"],
    ["Tower - Bldg. 4", "Tower"],
    ["Oak Creek BLDG 2", "Oak Creek"],
    ["Oak Creek, Phase II", "Oak Creek"],
    ["  Lantana   Trace ", "Lantana Trace"],
    ["Colorado D", "Colorado D"],
    ["Lamar Place B", "Lamar Place B"],
  ])("%s becomes %s", (raw, expected) =>
    expect(cleanPlaceName(raw)).toBe(expected),
  );

  it.each(["Phase 2", "No Name 6 Plex", "no name", "Ab", "12 Oaks"])(
    "gives no title for %s",
    (raw) => expect(cleanPlaceName(raw)).toBeNull(),
  );
});

describe("chooseName with fragments", () => {
  it('gives no title for the city placeholder "No Name 6 Plex"', () => {
    expect(chooseName(outline, [], "No Name 6 Plex")).toBeNull();
  });

  it("counts building-suffixed variants of one name as that one name", () => {
    expect(
      chooseName(
        outline,
        [
          place("Griffis at the Domain (Building 1)", inside),
          place("Griffis at the Domain (Building 2)", alsoInside),
        ],
        null,
      ),
    ).toEqual({ text: "Griffis at the Domain", source: "openstreetmap" });
  });

  it("ignores a phase-only place and still gives none for two genuinely different names", () => {
    expect(
      chooseName(
        outline,
        [place("Phase 2", inside), place("Lantana Trace", alsoInside)],
        null,
      )?.text,
    ).toBe("Lantana Trace");
    expect(
      chooseName(
        outline,
        [
          place("North Phase", inside),
          place("South Court (Building 2)", alsoInside),
        ],
        null,
      ),
    ).toBeNull();
  });

  it("cleans the city name too, and still refuses a legal entity after cleaning", () => {
    expect(chooseName(outline, [], "Mia Riverside, Building 4")).toEqual({
      text: "Mia Riverside",
      source: "city",
    });
    expect(chooseName(outline, [], "Burton Holdings LP Phase 2")).toBeNull();
  });
});

describe("looksLikeLegalEntity", () => {
  it.each([
    "Oak Creek LLC",
    "oak creek llc",
    "Riverside Partners",
    "Lakeview Properties",
    "The Smith Family Trust",
    "Acme Inc",
    "500 Congress",
  ])("reads %s as a legal entity", (name) =>
    expect(looksLikeLegalEntity(name)).toBe(true),
  );

  it.each([
    "Mia Riverside",
    "Parkview Apartments",
    "Trustworthy Flats",
    "Helpline Court",
  ])(
    "does not read %s as one, because a keyword must be a whole word",
    (name) => expect(looksLikeLegalEntity(name)).toBe(false),
  );
});

describe("fetchApartmentNames", () => {
  const element = (
    name: string | undefined,
    lon = -97.7,
    lat = 30.3,
    center = true,
  ) => ({
    type: "way",
    id: 1,
    ...(center ? { center: { lat, lon } } : {}),
    tags: name === undefined ? {} : { name },
  });

  it("sends the required headers to Overpass and keeps only plausible names", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      request = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          elements: [
            element("  Lantana Trace  ", -97.7123456789, 30.31),
            element("Ab"),
            element("x".repeat(61)),
            element("x".repeat(60), -97.6),
            element("1830 Rundberg"),
            element(undefined),
            element("No Center Court", 0, 0, false),
            element("Array Apartments", -97.65),
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const places = await fetchApartmentNames(fetchImpl);

    expect(request?.url).toBe("https://overpass-api.de/api/interpreter");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.headers).toMatchObject({
      "User-Agent": "austin-building-record (names snapshot)",
      Accept: "application/json",
    });
    const query = decodeURIComponent(String(request?.init.body)).replaceAll(
      "+",
      " ",
    );
    expect(query).toContain("(30.05,-98.05,30.55,-97.5");
    expect(query).toMatch(/building.*apartments/);
    expect(query).toMatch(/landuse.*residential/);
    expect(query).toMatch(/residential.*apartments/);
    expect(query).toContain("out center tags");

    expect(places).toEqual([
      { name: "Array Apartments", lon: -97.65, lat: 30.3 },
      { name: "Lantana Trace", lon: -97.712346, lat: 30.31 },
      { name: "x".repeat(60), lon: -97.6, lat: 30.3 },
    ]);
  });

  it("sorts by name then longitude so an unchanged pull gives an unchanged file", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          elements: [
            element("Beta Flats", -97.6),
            element("Alpha Flats", -97.5),
            element("Alpha Flats", -97.8),
          ],
        }),
        {
          status: 200,
        },
      )) as typeof fetch;
    expect(
      (await fetchApartmentNames(fetchImpl)).map(({ name, lon }) => [
        name,
        lon,
      ]),
    ).toEqual([
      ["Alpha Flats", -97.8],
      ["Alpha Flats", -97.5],
      ["Beta Flats", -97.6],
    ]);
  });

  it("throws when Overpass does not answer 200", async () => {
    const fetchImpl = (async () =>
      new Response("busy", { status: 429 })) as typeof fetch;
    await expect(fetchApartmentNames(fetchImpl)).rejects.toThrow(/429/);
  });
});
