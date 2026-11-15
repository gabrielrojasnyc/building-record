import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BuildingDetail, Complex, Meta } from "@/domain/types";
import addressRows from "./fixtures/addresses.json";
import parcelRows from "./fixtures/parcels.json";
import repeatOffenderRows from "./fixtures/repeat-offenders.json";
import {
  MIN_EXPECTED_ADDRESS_POINTS,
  MIN_EXPECTED_CASES,
  MIN_EXPECTED_COMPLEXES,
  MAX_UNCATEGORIZED_SHARE,
  MAX_UNRECOGNIZED_OUTCOME_SHARE,
  MIN_EXPECTED_DEFICIENCY_ROWS,
  MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
  MAX_BLANK_OUTCOME_SHARE,
  MIN_CLOSED_SHARE,
  MAX_SKIPPED_DEFICIENCY_SHARE,
  buildData,
  refuseIncompletePull,
  type PullReadings,
} from "./build";
import { CityApiError } from "./socrata";

const NOW = new Date("2026-11-14T15:00:00Z");
const BIG_PARCEL = "0304070701";
const NO_CASES = "0231091509";
/** The land of parcel 0204080102 listed again under a Williamson County ID, as the city does for some parcels. */
const TWIN = "R999001";
const twinRow = {
  ...parcelRows.find((row) => row.parcel_id_10 === "0204080102")!,
  parcel_id_10: TWIN,
};
/** Rows the build must leave out and count: an ID that cannot name a file, and a row with no polygon. */
const unsafeIdRow = { ...twinRow, parcel_id_10: "../0204080102" };
const noPolygonRow = {
  parcel_id_10: "R999002",
  land_use: "220",
  shape_area: "5000",
};

const NONE = "No Violation(s) Found/Inspection Performed";
const DUPLICATE = "Closed/Duplicate Case";
const CITY_LINK =
  "https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=13796096";
/** Typed by an inspector: must never reach a published file. */
const FREE_TEXT = "Tenant says the landlord is retaliating";

const caseRow = (
  parcelid: string | null,
  description: string,
  opened: string,
  extra: Record<string, unknown> = {},
) => ({
  ...(parcelid ? { parcelid } : {}),
  description,
  status: "Closed",
  opened_date: `${opened}T00:00:00.000`,
  ...extra,
});

const repeat = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i));

/**
 * 284 cases on the big parcel, plus cases the output must leave out or count elsewhere.
 * Outcomes on the big parcel: structure 254 other; property 1 fixed, 1 with unrecognized text, 22 other;
 * land use 3 none, 1 duplicate, 1 open; permit 1 open violation.
 */
function caseFixture() {
  const month = (i: number) => String((i % 12) + 1).padStart(2, "0");
  return [
    ...repeat(254, (i) =>
      caseRow(
        BIG_PARCEL,
        "Structure Condition Violation(s)",
        `2024-${month(i)}-10`,
      ),
    ),
    ...repeat(24, (i) =>
      caseRow(
        BIG_PARCEL,
        "Property Abatement",
        `2025-${month(i)}-10`,
        i === 0
          ? { last_update: "Inspection Performed/Abated by Inspector" }
          : i === 1
            ? { last_update: FREE_TEXT }
            : {},
      ),
    ),
    ...repeat(5, (i) =>
      caseRow(
        BIG_PARCEL,
        "Land Use Violation(s)",
        "2026-02-03",
        i < 3
          ? { last_update: NONE }
          : i === 3
            ? { last_update: DUPLICATE, violationcasenumber: "2026 100001-CV" }
            : { status: "Active" },
      ),
    ),
    caseRow(BIG_PARCEL, "Work Without Permit", "2026-10-30", {
      status: "Active",
      last_update: "Follow-up Inspection",
      violationcasenumber: "2026 141538-CV",
      violationcaselink: { url: CITY_LINK },
    }),
    ...repeat(2, () => caseRow("R056943", "Property Abatement", "2026-05-05")),
    caseRow(TWIN, "Property Abatement", "2026-06-06", {
      last_update: DUPLICATE,
    }),
    caseRow(TWIN, "Property Abatement", "2026-06-06"),
    // The twin land's other parcel has one complaint of its own, so the merged complex combines both.
    caseRow("0204080102", "Structure Condition Violation(s)", "2026-03-03", {
      last_update: NONE,
    }),
    ...repeat(3, () =>
      caseRow("9999999999", "Property Abatement", "2026-05-05"),
    ),
    ...repeat(10, () => caseRow(null, "Property Abatement", "2026-05-05")),
    caseRow("R056943", "Something New", "2026-05-05"),
    // Opened after the pull date: left out of every count.
    caseRow(BIG_PARCEL, "Property Abatement", "2026-11-20"),
  ];
}

const deficiencyRow = (
  parcelid: string,
  violationcategory: string,
  deficiencycategory: string,
  deficiencystatus: string,
) => ({
  parcelid,
  violationcategory,
  deficiencycategory,
  deficiencyindate: "2025-03-01T00:00:00.000",
  deficiencystatus,
});

const FIXTURES: Record<string, unknown[]> = {
  "7vsm-dvxg": [...parcelRows, twinRow, unsafeIdRow, noPolygonRow],
  "9s7j-tygf": addressRows,
  "6wtj-zbtb": caseFixture(),
  // Registered the way the city writes some addresses: every building number listed, the street type spelled out.
  // The registration leads with 1519, while the address point inside the parcel says 1515, so only
  // the registered-address path can produce '1519 Royal Crest Dr'.
  "ge82-ij4h": [
    deficiencyRow(
      BIG_PARCEL,
      "Structure Condition Violations",
      "Roofs and Drainage (§304.7)",
      "Cleared",
    ),
    deficiencyRow(
      BIG_PARCEL,
      "Structure Condition Violations",
      "Roofs and Drainage (§304.7)",
      "Not Cleared",
    ),
    deficiencyRow(
      BIG_PARCEL,
      "Property Abatement Violations",
      "Unsanitary Conditions",
      "Not Cleared",
    ),
    deficiencyRow(
      BIG_PARCEL,
      "Mystery Violations",
      "Something else",
      "Cleared",
    ),
    deficiencyRow(
      "0204080102",
      "Structure Condition Violations",
      "Roofs and Drainage (§304.7)",
      "Cleared",
    ),
    deficiencyRow(
      TWIN,
      "Structure Condition Violations",
      "Roofs and Drainage (§304.7)",
      "Not Cleared",
    ),
  ],
  "86z9-i27i": repeatOffenderRows.map((row) =>
    row.parcelid === BIG_PARCEL
      ? { ...row, foldername: "1519 (AKA 1521, 1523) ROYAL CREST DRIVE" }
      : row,
  ),
};

const datasetOf = (url: string | URL | Request) =>
  /resource\/([^.]+)\.json/.exec(String(url))![1];

const fixtureFetch = (async (url: string | URL | Request) =>
  new Response(JSON.stringify(FIXTURES[datasetOf(url)]), {
    status: 200,
  })) as typeof fetch;

const failingOn = (datasetId: string) =>
  (async (url: string | URL | Request) =>
    datasetOf(url) === datasetId
      ? new Response("forbidden", { status: 403 })
      : fixtureFetch(url)) as typeof fetch;

/** Written fresh for each test, so no test depends on the committed OpenStreetMap snapshot. */
let namesRoot: string;
let namesPath: string;
const writeNames = (
  places: { name: string; lon: number; lat: number }[],
  fetchedAt = "2026-11-10",
) => writeFileSync(namesPath, JSON.stringify({ fetchedAt, places }));

/** The fixture's Repeat Offender registration name, as the city gives it. */
const REGISTERED_NAME = "Riverside Terrace Apartments";
let reviewPath: string;
const writeReview = (
  cityTitles: Record<string, string> = { [BIG_PARCEL]: REGISTERED_NAME },
  withheld: Record<string, string> = {},
) => writeFileSync(reviewPath, JSON.stringify({ cityTitles, withheld }));

/** What the build printed for a person to read, one entry per line. */
let logged: string[];

const LOW = {
  minComplexes: 1,
  minCases: 1,
  minAddressPoints: 1,
  minRepeatOffenderRows: 1,
  minDeficiencyRows: 1,
  // The fixture leaves most phrases blank and skips one deficiency row in six, far past the live limits.
  maxBlankOutcomeShare: 1,
  maxSkippedDeficiencyShare: 1,
};
const options = () => ({
  ...LOW,
  namesSnapshotPath: namesPath,
  titleReviewPath: reviewPath,
  log: (line: string) => logged.push(line),
});

const readJson = <T>(path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as T;

let root: string;
let out: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-test-"));
  out = join(root, "data");
  namesRoot = mkdtempSync(join(tmpdir(), "names-test-"));
  namesPath = join(namesRoot, "apartment-names.json");
  writeNames([]);
  reviewPath = join(namesRoot, "title-review.json");
  writeReview();
  logged = [];
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(namesRoot, { recursive: true, force: true });
});

const complexById = (id: string) =>
  readJson<Complex[]>(`${out}/complexes.json`).find((c) => c.id === id)!;

describe("buildData", () => {
  it("writes one Complex per property, including parcels with no complaints", async () => {
    const meta = await buildData(out, NOW, fixtureFetch, options());
    const complexes = readJson<Complex[]>(`${out}/complexes.json`);
    expect(complexes).toHaveLength(6);
    expect(complexes.map((c) => c.id)).toEqual(
      [...complexes.map((c) => c.id)].sort(),
    );
    expect(complexById(BIG_PARCEL).parcelIds).toEqual([BIG_PARCEL]);
    expect(complexById(NO_CASES).tally).toEqual({ m12: {}, y2: {}, y3: {} });
    expect(complexById(NO_CASES).open).toBe(0);
    expect(meta.complexCount).toBe(6);
  });

  it("publishes complaints only: no counts by category, last case date or latest list", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    expect(Object.keys(complexById(BIG_PARCEL)).sort()).toEqual([
      "acres",
      "address",
      "duplicates",
      "id",
      "lat",
      "lon",
      "name",
      "open",
      "parcelIds",
      "repeatOffender",
      "tally",
      "violationsOpen",
    ]);
    const detail = readJson<BuildingDetail>(
      `${out}/buildings/${BIG_PARCEL}.json`,
    );
    expect(Object.keys(detail).sort()).toEqual([
      "bbox",
      "complaints",
      "deficiencies",
      "id",
      "monthly",
      "outline",
    ]);
  });

  it("shows the same land under two parcel IDs as one complex, under the busier ID, with one page", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const twin = complexById(TWIN);
    expect(twin.parcelIds).toEqual(["0204080102", TWIN]);
    expect(twin.address).toBe("1638 E 2nd St");
    // The twin ID has a complaint and a duplicate, the other parcel one complaint: every report counts towards which is busier.
    expect(twin.tally.y3.property).toEqual({ other: 1 });
    expect(twin.duplicates.y3).toBe(1);
    expect(twin.acres).toBe(4.7);
    expect(complexById("0204080102")).toBeUndefined();
    expect(existsSync(`${out}/buildings/${TWIN}.json`)).toBe(true);
    expect(existsSync(`${out}/buildings/0204080102.json`)).toBe(false);
  });

  it("leaves out a parcel whose ID is not letters and digits before it can name a file", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const ids = readJson<Complex[]>(`${out}/complexes.json`).flatMap(
      (c) => c.parcelIds,
    );
    expect(ids.every((id) => /^[A-Za-z0-9]+$/.test(id))).toBe(true);
    expect(readdirSync(root)).toEqual(["data"]);
    expect(
      readdirSync(`${out}/buildings`).every((name) =>
        /^[A-Za-z0-9]+\.json$/.test(name),
      ),
    ).toBe(true);
  });

  it("publishes coordinates to 6 decimals, about 10 cm, to keep the page light", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    for (const { lon, lat } of readJson<Complex[]>(`${out}/complexes.json`)) {
      expect(Math.round(lon * 1e6) / 1e6).toBe(lon);
      expect(Math.round(lat * 1e6) / 1e6).toBe(lat);
    }
  });

  it("never publishes two complexes under one address", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const addresses = readJson<Complex[]>(`${out}/complexes.json`).map(
      (c) => c.address,
    );
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("publishes meta with the Austin pull date and case shares", async () => {
    const meta = await buildData(out, NOW, fixtureFetch, options());
    expect(readJson<Meta>(`${out}/meta.json`)).toEqual(meta);
    expect(meta).toEqual({
      pulledAt: "2026-11-14",
      complexCount: 6,
      // Complaints in the 3 years at published complexes, duplicates left out.
      caseCount: 283 + 2 + 1 + 1,
      unmatchedCaseShare: 0.033,
      uncategorizedCases: 1,
      futureDatedCases: 1,
      skippedParcelRows: 2,
      namedComplexes: 1,
      namesAsOf: "2026-11-10",
      periodStarts: { m12: "2025-11-14", y2: "2024-11-14", y3: "2023-11-14" },
      duplicateCases: 2,
      unrecognizedOutcomes: 1,
      skippedDeficiencies: 1,
      phrasesUsuallyWithCase: [],
    });
  });

  it("uses the Austin calendar date even when UTC has already rolled over", async () => {
    const lateEvening = new Date("2026-11-15T03:30:00Z");
    const meta = await buildData(out, lateEvening, fixtureFetch, options());
    expect(meta.pulledAt).toBe("2026-11-14");
  });

  it("publishes no unit count of its own: the only one is the Repeat Offender figure", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    for (const complex of readJson<Complex[]>(`${out}/complexes.json`)) {
      expect(Object.keys(complex)).not.toContain("units");
    }
    expect(complexById(BIG_PARCEL).repeatOffender?.units).toBe(300);
  });

  it("uses the Repeat Offender establishment name and never an owner field", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).repeatOffender).toEqual({
      name: "Riverside Terrace Apartments",
      units: 300,
      activeViolations: 12,
      totalViolations: 41,
    });
    const everything = readdirSync(out, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFileSync(join(out, f), "utf8"))
      .join("");
    expect(everything).not.toMatch(/owner|registeredAddress/i);
  });

  it("takes the address from the city registration for a listed property and from containment otherwise", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).address).toBe("1519 Royal Crest Dr");
    // Active but registered under a name with no house number: containment applies.
    expect(complexById("0312130115").address).not.toMatch(/PARCEL ONLY/i);
    expect(complexById(NO_CASES).address).not.toBe("");
  });

  it("writes a BuildingDetail with the parcel bbox for every complex", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const complexes = readJson<Complex[]>(`${out}/complexes.json`);
    for (const { id } of complexes) {
      const detail = readJson<BuildingDetail>(`${out}/buildings/${id}.json`);
      expect(detail.id).toBe(id);
      expect(detail.bbox).toHaveLength(4);
      expect(detail.bbox[0]).toBeLessThan(detail.bbox[2]);
      expect(detail.bbox[1]).toBeLessThan(detail.bbox[3]);
      expect(detail.monthly[0]).toEqual({ month: "2023-11", count: 0 });
      expect(detail.monthly.at(-1)?.month).toBe("2026-11");
    }
    const big = readJson<BuildingDetail>(`${out}/buildings/${BIG_PARCEL}.json`);
    // 284 complaints, one a duplicate, which the monthly series leaves out.
    expect(big.monthly.reduce((sum, m) => sum + m.count, 0)).toBe(283);
  });

  it("writes each complex its outline, rounded to 6 decimals, with every member parcel's polygons", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    for (const { id } of readJson<Complex[]>(`${out}/complexes.json`)) {
      const { outline } = readJson<BuildingDetail>(
        `${out}/buildings/${id}.json`,
      );
      expect(outline.length).toBeGreaterThan(0);
      for (const polygon of outline) {
        expect(polygon[0].length).toBeGreaterThanOrEqual(4);
        for (const [lon, lat] of polygon.flat()) {
          expect(Math.round(lon * 1e6) / 1e6).toBe(lon);
          expect(Math.round(lat * 1e6) / 1e6).toBe(lat);
        }
      }
    }
    const twin = readJson<BuildingDetail>(`${out}/buildings/${TWIN}.json`);
    expect(twin.outline).toHaveLength(2);
    const [west, south, east, north] = twin.bbox;
    for (const [lon, lat] of twin.outline.flat(2)) {
      expect(lon).toBeGreaterThanOrEqual(west - 1e-6);
      expect(lon).toBeLessThanOrEqual(east + 1e-6);
      expect(lat).toBeGreaterThanOrEqual(south - 1e-6);
      expect(lat).toBeLessThanOrEqual(north + 1e-6);
    }
  });

  it("writes each complex its name, and counts named complexes in meta", async () => {
    const [bigLon, bigLat] = [-97.728744, 30.23791];
    const [smallLon, smallLat] = [-97.716249, 30.335624];
    writeNames([
      { name: "Riverside Terrace", lon: bigLon, lat: bigLat },
      { name: "Riverside Terrace", lon: bigLon + 0.0001, lat: bigLat },
      { name: "Guadalupe North", lon: smallLon, lat: smallLat },
      { name: "Guadalupe South", lon: smallLon, lat: smallLat },
      { name: "Somewhere Else", lon: -97.0, lat: 30.0 },
    ]);
    const meta = await buildData(out, NOW, fixtureFetch, options());
    // The registration, Riverside Terrace Apartments, agrees with it.
    expect(complexById(BIG_PARCEL).name).toEqual({
      text: "Riverside Terrace",
      source: "openstreetmap",
    });
    // Two different names inside: no name at all, and the city's name is not used to break the tie.
    expect(complexById("0231091509").name).toBeNull();
    expect(complexById(NO_CASES).name).toBeNull();
    expect(meta.namedComplexes).toBe(1);
    expect(meta.namesAsOf).toBe("2026-11-10");
    expect(readJson<Meta>(`${out}/meta.json`)).toEqual(meta);
  });

  it("shows no name where the OpenStreetMap name and the registration disagree", async () => {
    const [bigLon, bigLat] = [-97.728744, 30.23791];
    writeNames([{ name: "Royal Crest", lon: bigLon, lat: bigLat }]);
    const meta = await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).name).toBeNull();
    expect(complexById(BIG_PARCEL).repeatOffender?.name).toBe(REGISTERED_NAME);
    expect(meta.namedComplexes).toBe(0);
  });

  it("falls back to the Repeat Offender registration name when OpenStreetMap has none inside, once a person approved it", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).name).toEqual({
      text: "Riverside Terrace Apartments",
      source: "city",
    });
    expect(logged.join("\n")).not.toContain(REGISTERED_NAME);
  });

  it("leaves an unapproved city name off, and lists it in the build log with its parcel, address and name", async () => {
    writeReview({});
    const meta = await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).name).toBeNull();
    expect(meta.namedComplexes).toBe(0);
    const awaiting = logged.find((line) => line.includes(REGISTERED_NAME));
    expect(awaiting).toContain(BIG_PARCEL);
    expect(awaiting).toContain("1519 Royal Crest Dr");
    expect(logged.join("\n")).toContain("title-review.json");
  });

  it("shows no name at all for a withheld parcel", async () => {
    writeReview(
      { [BIG_PARCEL]: REGISTERED_NAME },
      { [BIG_PARCEL]: "Former name" },
    );
    await buildData(out, NOW, fixtureFetch, options());
    expect(complexById(BIG_PARCEL).name).toBeNull();
    expect(logged.join("\n")).not.toContain(REGISTERED_NAME);
  });

  it("refuses to write without a readable title review", async () => {
    writeFileSync(reviewPath, "{");
    await expect(buildData(out, NOW, fixtureFetch, options())).rejects.toThrow(
      /title review/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it("builds without names when the snapshot file is missing", async () => {
    rmSync(namesPath);
    const meta = await buildData(out, NOW, fixtureFetch, options());
    expect(meta.namesAsOf).toBeNull();
    expect(meta.complexCount).toBe(6);
    expect(complexById(BIG_PARCEL).name?.source).toBe("city");
  });

  it("builds without OpenStreetMap names when the snapshot file is unreadable", async () => {
    writeFileSync(namesPath, '{"fetchedAt": ');
    const meta = await buildData(out, NOW, fixtureFetch, options());
    expect(meta.namesAsOf).toBeNull();
    expect(meta.complexCount).toBe(6);
  });

  it("writes nothing when any dataset read fails", async () => {
    for (const dataset of Object.keys(FIXTURES)) {
      await expect(
        buildData(out, NOW, failingOn(dataset), options()),
      ).rejects.toBeInstanceOf(CityApiError);
      expect(existsSync(out)).toBe(false);
    }
  });

  it("leaves the previous files untouched when a pull fails", async () => {
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    await expect(
      buildData(out, NOW, failingOn("6wtj-zbtb"), options()),
    ).rejects.toBeInstanceOf(CityApiError);
    expect(readFileSync(`${out}/meta.json`, "utf8")).toBe('{"yesterday":true}');
    expect(readdirSync(root)).toEqual(["data"]);
  });

  it("replaces the previous files completely on success", async () => {
    mkdirSync(`${out}/buildings`, { recursive: true });
    writeFileSync(`${out}/buildings/stale.json`, "{}");
    await buildData(out, NOW, fixtureFetch, options());
    expect(existsSync(`${out}/buildings/stale.json`)).toBe(false);
    expect(existsSync(`${out}/meta.json`)).toBe(true);
    expect(readdirSync(root)).toEqual(["data"]);
  });

  it.each([
    ["6wtj-zbtb", "complaint rows", "minCases", "MIN_EXPECTED_CASES"],
    [
      "9s7j-tygf",
      "address points",
      "minAddressPoints",
      "MIN_EXPECTED_ADDRESS_POINTS",
    ],
    [
      "86z9-i27i",
      "Repeat Offender rows",
      "minRepeatOffenderRows",
      "MIN_EXPECTED_REPEAT_OFFENDER_ROWS",
    ],
    [
      "ge82-ij4h",
      "Repeat Offender deficiency rows",
      "minDeficiencyRows",
      "MIN_EXPECTED_DEFICIENCY_ROWS",
    ],
  ])(
    "refuses to publish over good data when %s is short (%s), naming the floor to change",
    async (_dataset, label, option, constant) => {
      mkdirSync(out);
      writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
      const tooHigh = { ...options(), [option]: 1_000_000 };
      await expect(buildData(out, NOW, fixtureFetch, tooHigh)).rejects.toThrow(
        new RegExp(
          `Only \\d+ ${label} came back, expected at least 1,000,000 \\(${constant} in pipeline/build\\.ts\\)`,
        ),
      );
      expect(readFileSync(`${out}/meta.json`, "utf8")).toBe(
        '{"yesterday":true}',
      );
      expect(readdirSync(root)).toEqual(["data"]);
    },
  );

  it("declares a floor for every dataset", () => {
    expect([
      MIN_EXPECTED_CASES,
      MIN_EXPECTED_ADDRESS_POINTS,
      MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
      MIN_EXPECTED_DEFICIENCY_ROWS,
    ]).toEqual([50_000, 300_000, 40, 1_000]);
  });

  it("prints what each guard saw, and every unrecognized phrase with its count, even when a guard refuses", async () => {
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        maxUnrecognizedOutcomeShare: 0.001,
      }),
    ).rejects.toThrow(/outcome phrase/);
    const printed = logged.join("\n");
    expect(printed).toMatch(
      /Outcome phrases not on the allow-list \(build log only\), most frequent first:\n {2}1 {2}Tenant says the landlord is retaliating/,
    );
    expect(printed).toContain("304 complaint rows read");
    expect(printed).toContain("6 Repeat Offender deficiency rows read");
  });

  it("refuses to write when more than 3% of complaint rows have no outcome phrase", async () => {
    // Most of the fixture's rows carry no phrase at all.
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        maxBlankOutcomeShare: MAX_BLANK_OUTCOME_SHARE,
      }),
    ).rejects.toThrow(/have no outcome phrase.*MAX_BLANK_OUTCOME_SHARE/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to write when more than 5% of deficiency rows are skipped", async () => {
    // One of the fixture's six has a category this site does not recognize.
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        maxSkippedDeficiencyShare: MAX_SKIPPED_DEFICIENCY_SHARE,
      }),
    ).rejects.toThrow(
      /1 of 6 Repeat Offender deficiency rows \(16\.7%\) were skipped.*MAX_SKIPPED_DEFICIENCY_SHARE/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to publish when more than 1% of cases carry a description it does not recognize", async () => {
    expect(MAX_UNCATEGORIZED_SHARE).toBe(0.01);
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    // The fixture has 1 unrecognized case in 303, about 0.3%: under the default, over a stricter limit.
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        maxUncategorizedShare: 0.001,
      }),
    ).rejects.toThrow(
      /1 of 304 complaint rows \(0\.3%\) carry a description this site does not recognize.*MAX_UNCATEGORIZED_SHARE/,
    );
    expect(readFileSync(`${out}/meta.json`, "utf8")).toBe('{"yesterday":true}');
    await expect(
      buildData(out, NOW, fixtureFetch, options()),
    ).resolves.toMatchObject({ uncategorizedCases: 1 });
  });

  it("refuses to write when unknown outcome phrases pass 1% of cases", async () => {
    expect(MAX_UNRECOGNIZED_OUTCOME_SHARE).toBe(0.01);
    mkdirSync(out);
    writeFileSync(`${out}/meta.json`, '{"yesterday":true}');
    // The fixture has 1 unrecognized phrase in 304 cases, about 0.3%: under the default, over a stricter limit.
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        maxUnrecognizedOutcomeShare: 0.001,
      }),
    ).rejects.toThrow(
      /1 of 304 complaint rows \(0\.3%\) carry an outcome phrase this site does not recognize.*MAX_UNRECOGNIZED_OUTCOME_SHARE/,
    );
    expect(readFileSync(`${out}/meta.json`, "utf8")).toBe('{"yesterday":true}');
    await expect(
      buildData(out, NOW, fixtureFetch, options()),
    ).resolves.toMatchObject({ unrecognizedOutcomes: 1 });
  });

  it("tallies by period, category and outcome, leaving duplicates out and counting them apart", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const big = complexById(BIG_PARCEL);
    expect(big.tally.y3).toEqual({
      structure: { other: 254 },
      property: { fixed: 1, other: 23 },
      landuse: { none: 3, open: 1 },
      permit: { violation: 1 },
    });
    expect(big.tally.y2).toEqual({
      structure: { other: 21 },
      property: { fixed: 1, other: 23 },
      landuse: { none: 3, open: 1 },
      permit: { violation: 1 },
    });
    expect(big.tally.m12).toEqual({
      property: { other: 2 },
      landuse: { none: 3, open: 1 },
      permit: { violation: 1 },
    });
    expect(big.duplicates).toEqual({ m12: 1, y2: 1, y3: 1 });
  });

  it("counts an open violation case under violation and in violationsOpen, not under open", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const big = complexById(BIG_PARCEL);
    expect(big.violationsOpen).toBe(1);
    expect(big.tally.y3.permit).toEqual({ violation: 1 });
    expect(complexById(NO_CASES).violationsOpen).toBe(0);
    expect(complexById(NO_CASES).tally).toEqual({ m12: {}, y2: {}, y3: {} });
  });

  it("writes every non-duplicate complaint of the 3 years into the building file, newest first", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const { complaints } = readJson<BuildingDetail>(
      `${out}/buildings/${BIG_PARCEL}.json`,
    );
    expect(complaints).toHaveLength(283);
    expect(complaints.map((c) => c.opened)).toEqual(
      [...complaints.map((c) => c.opened)].sort().reverse(),
    );
    expect(complaints[0]).toEqual({
      opened: "2026-10-30",
      closed: null,
      category: "permit",
      outcome: "violation",
      stillOpen: true,
      cityOutcome: "Follow-up Inspection",
      violationCase: { number: "2026 141538-CV", url: CITY_LINK },
    });
    expect(
      complaints.filter((c) => c.stillOpen && c.outcome === "violation"),
    ).toHaveLength(1);
    expect(
      readJson<BuildingDetail>(`${out}/buildings/${NO_CASES}.json`).complaints,
    ).toEqual([]);
  });

  it("publishes only allow-listed outcome text and counts the rest", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const everything = readdirSync(out, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFileSync(join(out, f), "utf8"))
      .join("");
    expect(everything).not.toContain(FREE_TEXT);
    const { complaints } = readJson<BuildingDetail>(
      `${out}/buildings/${BIG_PARCEL}.json`,
    );
    const shown = new Set(complaints.map((c) => c.cityOutcome));
    expect(shown).toEqual(
      new Set([
        null,
        NONE,
        "Inspection Performed/Abated by Inspector",
        "Follow-up Inspection",
      ]),
    );
  });

  it("groups deficiencies by category and kind, keeps the section reference, and skips unknown categories", async () => {
    const meta = await buildData(out, NOW, fixtureFetch, options());
    const { deficiencies } = readJson<BuildingDetail>(
      `${out}/buildings/${BIG_PARCEL}.json`,
    );
    expect(deficiencies).toEqual([
      {
        category: "structure",
        kind: "Roofs and Drainage (§304.7)",
        cleared: 1,
        notCleared: 1,
      },
      {
        category: "property",
        kind: "Unsanitary Conditions",
        cleared: 0,
        notCleared: 1,
      },
    ]);
    expect(meta.skippedDeficiencies).toBe(1);
    expect(
      readJson<BuildingDetail>(`${out}/buildings/${NO_CASES}.json`)
        .deficiencies,
    ).toEqual([]);
  });

  it("combines tallies, complaints and deficiencies across a merged complex", async () => {
    await buildData(out, NOW, fixtureFetch, options());
    const twin = complexById(TWIN);
    expect(twin.parcelIds).toEqual(["0204080102", TWIN]);
    // One complaint on each parcel, apart from the duplicate on the second.
    expect(twin.tally.y3).toEqual({
      structure: { none: 1 },
      property: { other: 1 },
    });
    expect(twin.duplicates).toEqual({ m12: 1, y2: 1, y3: 1 });
    const detail = readJson<BuildingDetail>(`${out}/buildings/${TWIN}.json`);
    expect(
      detail.complaints.map((c) => [c.opened, c.category, c.outcome]),
    ).toEqual([
      ["2026-06-06", "property", "other"],
      ["2026-03-03", "structure", "none"],
    ]);
    expect(detail.deficiencies).toEqual([
      {
        category: "structure",
        kind: "Roofs and Drainage (§304.7)",
        cleared: 1,
        notCleared: 1,
      },
    ]);
  });

  it("never requests inspector or owner from any dataset", async () => {
    const urls: string[] = [];
    const recording = (async (url: string | URL | Request) => {
      urls.push(decodeURIComponent(String(url)));
      return fixtureFetch(url);
    }) as typeof fetch;
    await buildData(out, NOW, recording, options());
    expect(urls.length).toBeGreaterThanOrEqual(5);
    expect(urls.join("\n")).not.toMatch(/inspector|owner/i);
  });

  it("refuses to write when fewer than MIN_EXPECTED_COMPLEXES come back", async () => {
    expect(MIN_EXPECTED_COMPLEXES).toBe(2000);
    await expect(
      buildData(out, NOW, fixtureFetch, {
        ...options(),
        minComplexes: MIN_EXPECTED_COMPLEXES,
      }),
    ).rejects.toThrow(/Only 6 apartment complexes .*2,000/);
    expect(existsSync(out)).toBe(false);
  });
});

describe("the guards on a pull", () => {
  /** A pull with round numbers, every reading on the right side of its limit. */
  const healthy: PullReadings = {
    addressPoints: MIN_EXPECTED_ADDRESS_POINTS,
    caseRows: 100_000,
    repeatOffenderRows: MIN_EXPECTED_REPEAT_OFFENDER_ROWS,
    deficiencyRows: 2_000,
    uncategorizedCases: 0,
    unrecognizedOutcomes: 0,
    blankOutcomes: 0,
    closedCases: 100_000,
    skippedDeficiencies: 0,
  };

  it("passes a pull that reads like the live one", () => {
    expect(() => refuseIncompletePull(healthy)).not.toThrow();
  });

  it("allows 3% of complaint rows with no outcome phrase, and refuses one more", () => {
    expect(MAX_BLANK_OUTCOME_SHARE).toBe(0.03);
    expect(() =>
      refuseIncompletePull({ ...healthy, blankOutcomes: 3_000 }),
    ).not.toThrow();
    expect(() =>
      refuseIncompletePull({ ...healthy, blankOutcomes: 3_001 }),
    ).toThrow(
      "3,001 of 100,000 complaint rows (3.0%) have no outcome phrase, more than the 3% allowed (MAX_BLANK_OUTCOME_SHARE in pipeline/build.ts). Refusing to write.",
    );
  });

  it("needs 85% of complaint rows closed, and refuses one fewer", () => {
    expect(MIN_CLOSED_SHARE).toBe(0.85);
    expect(() =>
      refuseIncompletePull({ ...healthy, closedCases: 85_000 }),
    ).not.toThrow();
    expect(() =>
      refuseIncompletePull({ ...healthy, closedCases: 84_999 }),
    ).toThrow(
      "Only 84,999 of 100,000 complaint rows (85.0%) are Closed, fewer than the 85% expected (MIN_CLOSED_SHARE in pipeline/build.ts). Refusing to write.",
    );
  });

  it("allows 1% of complaint rows with an unrecognized phrase or description, and refuses one more", () => {
    for (const reading of [
      "unrecognizedOutcomes",
      "uncategorizedCases",
    ] as const) {
      expect(() =>
        refuseIncompletePull({ ...healthy, [reading]: 1_000 }),
      ).not.toThrow();
      expect(() =>
        refuseIncompletePull({ ...healthy, [reading]: 1_001 }),
      ).toThrow(/1,001 of 100,000 complaint rows \(1\.0%\)/);
    }
  });

  it("needs 1,000 deficiency rows, and refuses one fewer", () => {
    expect(() =>
      refuseIncompletePull({ ...healthy, deficiencyRows: 1_000 }),
    ).not.toThrow();
    expect(() =>
      refuseIncompletePull({ ...healthy, deficiencyRows: 999 }),
    ).toThrow(
      "Only 999 Repeat Offender deficiency rows came back, expected at least 1,000 (MIN_EXPECTED_DEFICIENCY_ROWS in pipeline/build.ts). Refusing to write.",
    );
  });

  it("allows 5% of deficiency rows skipped, and refuses one more", () => {
    expect(MAX_SKIPPED_DEFICIENCY_SHARE).toBe(0.05);
    expect(() =>
      refuseIncompletePull({ ...healthy, skippedDeficiencies: 100 }),
    ).not.toThrow();
    expect(() =>
      refuseIncompletePull({ ...healthy, skippedDeficiencies: 101 }),
    ).toThrow(
      "101 of 2,000 Repeat Offender deficiency rows (5.1%) were skipped for an unknown category or a missing or unsafe kind, more than the 5% allowed (MAX_SKIPPED_DEFICIENCY_SHARE in pipeline/build.ts). Refusing to write.",
    );
  });
});
