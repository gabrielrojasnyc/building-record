import { describe, expect, it } from "vitest";
import caseRows from "./fixtures/cases.json";
import { CITY_CATEGORY_DESCRIPTION, CITY_CATEGORY_TERM } from "@/domain/labels";
import { PERIODS, periodStarts } from "@/domain/periods";
import type { Period } from "@/domain/periods";
import {
  categoryOf,
  emptyCaseSummary,
  loadCases,
  type CaseSummary,
} from "./cases";

const PULLED_AT = new Date("2026-11-14T15:00:00Z");

describe("the city's category descriptions", () => {
  it("each map to their category, and each includes the term the method page names", () => {
    for (const category of [
      "structure",
      "property",
      "landuse",
      "permit",
    ] as const) {
      expect(categoryOf(CITY_CATEGORY_DESCRIPTION[category])).toBe(category);
      expect(CITY_CATEGORY_DESCRIPTION[category]).toContain(
        CITY_CATEGORY_TERM[category],
      );
    }
    expect(categoryOf("Structure Condition Violation(s)")).toBe("structure");
    expect(categoryOf("Property Abatement")).toBe("property");
    expect(categoryOf("Land Use Violation(s)")).toBe("landuse");
    expect(categoryOf("Work Without Permit")).toBe("permit");
  });
});
const PARCEL_A = "0100000001";
const PARCEL_B = "R056943";

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

const caseOn = (opened: string, overrides: Record<string, string> = {}) => ({
  parcelid: PARCEL_A,
  description: "Property Abatement",
  status: "Closed",
  opened_date: `${opened}T00:00:00.000`,
  ...overrides,
});

/** Complaints in one period of a summary's tally, every category and outcome together. */
const complaintsIn = (summary: CaseSummary, period: Period) =>
  Object.values(summary.tally[period])
    .flatMap((outcomes) => Object.values(outcomes))
    .reduce((a, b) => a + b, 0);

describe("categoryOf", () => {
  it("maps the four city descriptions", () => {
    expect(categoryOf("Structure Condition Violation(s)")).toBe("structure");
    expect(categoryOf("Property Abatement")).toBe("property");
    expect(categoryOf("Land Use Violation(s)")).toBe("landuse");
    expect(categoryOf("Work Without Permit")).toBe("permit");
    expect(categoryOf("Property Abatement  Property Abatement")).toBe(
      "property",
    );
    expect(categoryOf("Something New")).toBeNull();
  });
});

describe("loadCases with the fixture", () => {
  const load = async () => {
    const { impl, urls } = fakeFetch(caseRows);
    const index = await loadCases(PULLED_AT, impl);
    return { index, urls };
  };

  it("tallies cases with no parcel ID and cases with an unknown description", async () => {
    const { index } = await load();
    expect(index.totalCases).toBe(17);
    expect(index.unmatchedCases).toBe(2);
    expect(index.uncategorizedCases).toBe(1);
  });

  it("leaves future dated cases out of every count but still reads them", async () => {
    const { index } = await load();
    expect(index.futureDatedCases).toBe(2);
    // Parcel 0100000003 has only a future dated case, so it has no summary.
    expect(index.byParcel.has("0100000003")).toBe(false);
    const a = index.byParcel.get(PARCEL_A)!;
    expect(a.open).toBe(2);
    expect(a.detail.complaints.map((c) => c.opened)).not.toContain(
      "2026-11-20",
    );
  });

  it("keeps the monthly series summing to the complaints in the 3 year period for every parcel", async () => {
    const { index } = await load();
    for (const summary of index.byParcel.values()) {
      const monthlySum = summary.detail.monthly.reduce(
        (sum, m) => sum + m.count,
        0,
      );
      expect(monthlySum).toBe(complaintsIn(summary, "y3"));
    }
  });

  it("asks the city for cases from the 3 year start and leaves out any opened before it", async () => {
    const { index, urls } = await load();
    expect(new URL(urls[0]).searchParams.get("$where")).toBe(
      "opened_date >= '2023-11-14'",
    );
    const opened = index.byParcel
      .get(PARCEL_A)!
      .detail.complaints.map((c) => c.opened);
    // The fixture's cases of 2023-11-01 and 2023-11-02 are before 2023-11-14.
    expect(opened).not.toContain("2023-11-01");
    expect(opened).not.toContain("2023-11-02");
    expect(index.byParcel.get(PARCEL_A)!.detail.monthly[0]).toEqual({
      month: "2023-11",
      count: 0,
    });
  });

  it("keeps a parcel for every ID with a categorized case, trimming IDs", async () => {
    const { index } = await load();
    expect([...index.byParcel.keys()].sort()).toEqual([PARCEL_A, PARCEL_B]);
    expect(complaintsIn(index.byParcel.get(PARCEL_B)!, "y3")).toBe(2);
  });

  it("counts a case on the 12 month boundary day in every period and the day before only in the longer ones", async () => {
    const { index } = await load();
    const a = index.byParcel.get(PARCEL_A)!;
    // 2025-11-14 is inside the 12 months, 2025-11-13 is outside; 2025-10-14 is 13 months back.
    expect(a.tally.m12).toEqual({
      structure: { open: 1, other: 1 },
      property: { open: 1 },
      landuse: { other: 2 },
    });
    expect(a.tally.y3).toEqual({
      structure: { open: 1, other: 2 },
      property: { open: 1, other: 1 },
      landuse: { other: 2 },
      permit: { other: 1 },
    });
  });

  it("counts status other than Closed as open", async () => {
    const { index } = await load();
    expect(index.byParcel.get(PARCEL_A)!.open).toBe(2);
    // The unknown description on parcel B is Active but never counted.
    expect(index.byParcel.get(PARCEL_B)!.open).toBe(0);
  });

  it("fills months with no complaints as zero, from the 3 year start's month to the pull month", async () => {
    const { index } = await load();
    const summary = index.byParcel.get(PARCEL_B)!;
    expect(summary.detail.monthly[0]).toEqual({ month: "2023-11", count: 0 });
    expect(summary.detail.monthly).toHaveLength(37);
    expect(summary.detail.monthly.at(-1)).toEqual({
      month: "2026-11",
      count: 0,
    });
    expect(
      summary.detail.monthly.find((m) => m.month === "2026-06")?.count,
    ).toBe(1);
  });

  it("puts a case from the pull day in the last month", async () => {
    const { index } = await load();
    const { monthly } = index.byParcel.get(PARCEL_A)!.detail;
    expect(monthly.at(-1)).toEqual({ month: "2026-11", count: 2 });
    expect(monthly.reduce((sum, m) => sum + m.count, 0)).toBe(8);
  });

  it("never requests inspector or owner, and asks only for the case fields it uses", async () => {
    const { urls } = await load();
    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/resource/6wtj-zbtb.json");
    expect(url.searchParams.get("$select")).toBe(
      "parcelid,description,status,opened_date,closed_date,last_update,violationcasenumber,violationcaselink",
    );
    expect(decodeURIComponent(urls[0])).not.toMatch(/inspector|owner/i);
  });
});

describe("date boundaries", () => {
  const summaryFor = async (pulledAt: string, opened: string[]) => {
    const { impl } = fakeFetch(opened.map((d) => caseOn(d)));
    const index = await loadCases(new Date(pulledAt), impl);
    return index.byParcel.get(PARCEL_A)!;
  };

  it("counts a case opened 11 months before the pull in every period, 13 months back only in the longer ones", async () => {
    const summary = await summaryFor("2026-11-14T15:00:00Z", [
      "2025-12-14",
      "2025-10-14",
    ]);
    expect(complaintsIn(summary, "y3")).toBe(2);
    expect(complaintsIn(summary, "y2")).toBe(2);
    expect(complaintsIn(summary, "m12")).toBe(1);
  });

  it("includes exactly the same day 12 months back and excludes the day before", async () => {
    const onDay = await summaryFor("2026-11-14T15:00:00Z", ["2025-11-14"]);
    const dayBefore = await summaryFor("2026-11-14T15:00:00Z", ["2025-11-13"]);
    expect(complaintsIn(onDay, "m12")).toBe(1);
    expect(complaintsIn(dayBefore, "m12")).toBe(0);
  });

  it("takes the pull date in Austin: 03:00Z is still the evening of 13 November", async () => {
    const summary = await summaryFor("2026-11-14T03:00:00Z", [
      "2025-11-13",
      "2025-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    // Austin date 2026-11-13: the 12 months open on 2025-11-13, and the 14th is in the future.
    expect(complaintsIn(summary, "m12")).toBe(2);
    expect(complaintsIn(summary, "y3")).toBe(3);
  });

  it("takes the pull date in Austin: 07:00Z is the early morning of 14 November", async () => {
    const summary = await summaryFor("2026-11-14T07:00:00Z", [
      "2025-11-13",
      "2025-11-14",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(complaintsIn(summary, "m12")).toBe(2);
    expect(complaintsIn(summary, "y3")).toBe(3);
  });

  it("puts the pull in the previous month when Austin has not reached it yet", async () => {
    const summary = await summaryFor("2026-12-01T03:00:00Z", ["2026-11-30"]);
    expect(summary.detail.monthly.at(-1)).toEqual({
      month: "2026-11",
      count: 1,
    });
  });

  it("clamps a 29 February pull to 28 February of the previous year", async () => {
    const summary = await summaryFor("2028-02-29T12:00:00Z", [
      "2027-02-28",
      "2027-02-27",
    ]);
    expect(complaintsIn(summary, "m12")).toBe(1);
  });

  it("runs the monthly series from the 3 year start's month to the pull month", async () => {
    const summary = await summaryFor("2024-02-10T15:00:00Z", ["2024-02-01"]);
    const months = summary.detail.monthly.map((m) => m.month);
    expect(months[0]).toBe("2021-02");
    expect(months).toHaveLength(37);
    expect(months.at(-1)).toBe("2024-02");
    expect(summary.detail.monthly.at(-1)?.count).toBe(1);
  });
});

describe("emptyCaseSummary", () => {
  it("returns nothing open and a zero-filled series for the pull date", () => {
    const summary = emptyCaseSummary("0100000009", PULLED_AT);
    expect(summary.open).toBe(0);
    expect(summary.detail.id).toBe("0100000009");
    expect(summary.detail.monthly).toHaveLength(37);
    expect(summary.detail.monthly.every((m) => m.count === 0)).toBe(true);
    expect(summary.detail.monthly[0].month).toBe("2023-11");
    expect(summary.detail.monthly.at(-1)?.month).toBe("2026-11");
  });

  it("starts with empty tallies, no duplicates and no open violations", () => {
    const summary = emptyCaseSummary("0100000009", PULLED_AT);
    expect(summary.tally).toEqual({ m12: {}, y2: {}, y3: {} });
    expect(summary.duplicates).toEqual({ m12: 0, y2: 0, y3: 0 });
    expect(summary.violationsOpen).toBe(0);
    expect(summary.detail.complaints).toEqual([]);
  });
});

describe("complaint outcomes", () => {
  const NONE = "No Violation(s) Found/Inspection Performed";
  const DUPLICATE = "Closed/Duplicate Case";
  const CITY_LINK =
    "https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=13796096";

  const complaint = (
    opened: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    ...caseOn(opened),
    ...overrides,
  });

  const summaryOf = async (rows: unknown[], pulledAt = PULLED_AT) => {
    const { impl, urls } = fakeFetch(rows);
    const index = await loadCases(pulledAt, impl);
    return { index, urls, summary: index.byParcel.get(PARCEL_A)! };
  };

  it("tallies by period, category and outcome, leaving duplicates out and counting them apart", async () => {
    const { summary } = await summaryOf([
      complaint("2026-11-10", {
        description: "Structure Condition Violation(s)",
        last_update: NONE,
      }),
      complaint("2025-01-01", {
        description: "Structure Condition Violation(s)",
        violationcasenumber: "2025 100001-CV",
      }),
      complaint("2024-06-01", {
        description: "Property Abatement",
        last_update: "Inspection Performed/Abated by Inspector",
      }),
      complaint("2026-10-01", {
        description: "Land Use Violation(s)",
        last_update: DUPLICATE,
        violationcasenumber: "2026 100002-CV",
      }),
      complaint("2023-12-01", {
        description: "Land Use Violation(s)",
        last_update: DUPLICATE,
      }),
      complaint("2026-11-01", {
        description: "Work Without Permit",
        status: "Active",
      }),
    ]);

    expect(summary.tally.m12).toEqual({
      structure: { none: 1 },
      permit: { open: 1 },
    });
    expect(summary.tally.y2).toEqual({
      structure: { none: 1, violation: 1 },
      permit: { open: 1 },
    });
    expect(summary.tally.y3).toEqual({
      structure: { none: 1, violation: 1 },
      property: { fixed: 1 },
      permit: { open: 1 },
    });
    expect(summary.duplicates).toEqual({ m12: 1, y2: 1, y3: 2 });
  });

  it("counts a complaint opened on a period start and leaves out the day before, for all three periods", async () => {
    const starts = periodStarts("2026-11-14");
    const dayBefore = (date: string) =>
      new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10);
    for (const period of PERIODS) {
      const { summary } = await summaryOf([
        complaint(starts[period], { last_update: NONE }),
        complaint(dayBefore(starts[period]), { last_update: NONE }),
      ]);
      expect(summary.tally[period]).toEqual({ property: { none: 1 } });

      const dupes = await summaryOf([
        complaint(starts[period], { last_update: DUPLICATE }),
        complaint(dayBefore(starts[period]), { last_update: DUPLICATE }),
      ]);
      expect(dupes.summary.duplicates[period]).toBe(1);
    }
  });

  it("counts a complaint opened on the pull date and leaves out one opened after it", async () => {
    const { summary } = await summaryOf([
      complaint("2026-11-14", { last_update: NONE }),
      complaint("2026-11-15", { last_update: NONE }),
    ]);
    for (const period of PERIODS)
      expect(summary.tally[period]).toEqual({ property: { none: 1 } });
  });

  it("counts an open violation case under violation and in violationsOpen, not under open", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", {
        status: "Active",
        violationcasenumber: "2026 141538-CV",
        violationcaselink: { url: CITY_LINK },
      }),
      complaint("2026-08-01", {
        status: "Closed",
        last_update: "Closed due to Voluntary Compliance",
        closed_date: "2026-09-15T00:00:00.000",
        violationcasenumber: "2026 141000-CV",
      }),
    ]);
    expect(summary.tally.y3).toEqual({ property: { violation: 2 } });
    expect(summary.violationsOpen).toBe(1);
  });

  it("calls a complaint a violation only for a case number or a phrase that says one was found", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", {
        status: "Closed",
        last_update: "Follow-up Inspection",
      }),
      complaint("2026-09-02", {
        status: "Closed",
        last_update: "Referred to Appropriate Agency",
      }),
      complaint("2026-09-03", {
        status: "Closed",
        last_update: "CV Violation(s) Found/Inspection Performed",
      }),
      complaint("2026-09-04", {
        status: "Closed",
        last_update: NONE,
        violationcasenumber: "   ",
      }),
    ]);
    expect(summary.tally.y3).toEqual({
      property: { other: 2, violation: 1, none: 1 },
    });
  });

  it("publishes only allow-listed outcome text and counts the rest", async () => {
    const free = "Tenant says landlord is retaliating, call 512 555 0100";
    const { index, summary } = await summaryOf([
      complaint("2026-09-01", { status: "Closed", last_update: free }),
      complaint("2026-09-02", { status: "Active", last_update: free }),
      complaint("2026-09-03", { status: "Closed", last_update: NONE }),
      complaint("2026-09-04", {
        status: "Closed",
        last_update: "  Cancelled ",
      }),
      complaint("2026-09-05", { status: "Closed" }),
      complaint("2026-09-06", { status: "Closed", last_update: "" }),
    ]);
    expect(index.unrecognizedOutcomes).toBe(2);
    const byDate = Object.fromEntries(
      summary.detail.complaints.map((c) => [c.opened, c]),
    );
    expect(byDate["2026-09-01"]).toMatchObject({
      cityOutcome: null,
      outcome: "other",
    });
    expect(byDate["2026-09-02"]).toMatchObject({
      cityOutcome: null,
      outcome: "open",
    });
    expect(byDate["2026-09-03"].cityOutcome).toBe(NONE);
    expect(byDate["2026-09-04"].cityOutcome).toBe("Cancelled");
    expect(byDate["2026-09-05"].cityOutcome).toBeNull();
    expect(JSON.stringify(summary)).not.toContain("retaliating");
  });

  it("counts unrecognized phrases on every row read, whether or not it joins a parcel or category", async () => {
    const free = "Something new";
    const { index } = await summaryOf([
      complaint("2026-09-01", { parcelid: "", last_update: free }),
      complaint("2026-09-02", {
        description: "Brand new kind",
        last_update: free,
      }),
      complaint("2026-09-03", { last_update: NONE }),
    ]);
    expect(index.unrecognizedOutcomes).toBe(2);
  });

  it("keeps a violation case link only when it is on the city permit site", async () => {
    const link = (url: unknown) => ({
      violationcasenumber: "2026 141538-CV",
      violationcaselink: { url },
    });
    const { summary } = await summaryOf([
      complaint("2026-09-01", link(CITY_LINK)),
      complaint(
        "2026-09-02",
        link("https://evil.example.com/https://abc.austintexas.gov/"),
      ),
      complaint("2026-09-03", link("http://abc.austintexas.gov/web/permit")),
      complaint(
        "2026-09-04",
        link("https://abc.austintexas.gov.evil.example.com/x"),
      ),
      complaint("2026-09-05", link(42)),
      complaint("2026-09-06", { violationcasenumber: "2026 141538-CV" }),
    ]);
    const byDate = Object.fromEntries(
      summary.detail.complaints.map((c) => [c.opened, c.violationCase]),
    );
    expect(byDate["2026-09-01"]).toEqual({
      number: "2026 141538-CV",
      url: CITY_LINK,
    });
    for (const date of [
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]) {
      expect(byDate[date]).toEqual({ number: "2026 141538-CV", url: null });
    }
  });

  it("gives no violation case when there is only a link", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", {
        last_update: NONE,
        violationcaselink: { url: CITY_LINK },
      }),
    ]);
    expect(summary.detail.complaints[0].violationCase).toBeNull();
    expect(summary.tally.y3).toEqual({ property: { none: 1 } });
  });

  it("lists every non-duplicate complaint of the 3 year period, newest first, closed only when the case is", async () => {
    const { summary } = await summaryOf([
      complaint("2026-05-01", {
        last_update: NONE,
        closed_date: "2026-05-20T00:00:00.000",
      }),
      complaint("2026-10-01", {
        status: "Active",
        closed_date: "2026-10-05T00:00:00.000",
      }),
      complaint("2026-05-01", { last_update: DUPLICATE }),
      complaint("2023-11-05", { last_update: NONE }),
      complaint("2023-11-14", {
        last_update: NONE,
        closed_date: "2023-12-01T00:00:00.000",
      }),
    ]);
    expect(
      summary.detail.complaints.map((c) => [c.opened, c.closed, c.stillOpen]),
    ).toEqual([
      ["2026-10-01", null, true],
      ["2026-05-01", "2026-05-20", false],
      ["2023-11-14", "2023-12-01", false],
    ]);
  });

  it("orders complaints opened on the same day the same way whatever order the city returns them", async () => {
    const rows = [
      complaint("2026-05-01", {
        description: "Work Without Permit",
        last_update: NONE,
      }),
      complaint("2026-05-01", {
        description: "Land Use Violation(s)",
        last_update: NONE,
      }),
      complaint("2026-05-01", {
        description: "Property Abatement",
        violationcasenumber: "2026 2-CV",
      }),
      complaint("2026-05-01", {
        description: "Property Abatement",
        violationcasenumber: "2026 1-CV",
      }),
      complaint("2026-05-01", {
        description: "Structure Condition Violation(s)",
        last_update: NONE,
      }),
    ];
    const forward = (await summaryOf(rows)).summary.detail.complaints;
    const backward = (await summaryOf([...rows].reverse())).summary.detail
      .complaints;
    expect(forward).toHaveLength(5);
    expect(backward).toEqual(forward);
  });

  it("reads from the 3 year start whatever the pull date, and starts the monthly series in its month", async () => {
    const { urls, summary } = await summaryOf(
      [
        complaint("2023-10-31", { last_update: NONE }),
        complaint("2023-11-01", { last_update: NONE }),
      ],
      new Date("2026-10-31T15:00:00Z"),
    );
    expect(new URL(urls[0]).searchParams.get("$where")).toBe(
      "opened_date >= '2023-10-31'",
    );
    expect(summary.tally.y3).toEqual({ property: { none: 2 } });
    expect(summary.detail.complaints).toHaveLength(2);
    expect(summary.detail.monthly.slice(0, 2)).toEqual([
      { month: "2023-10", count: 1 },
      { month: "2023-11", count: 1 },
    ]);
  });

  it("leaves a complaint opened before the 3 year start out of everything", async () => {
    const { index } = await summaryOf([
      complaint("2023-11-05", { last_update: NONE }),
    ]);
    expect(index.byParcel.has(PARCEL_A)).toBe(false);
  });

  it("counts as open every complaint whose case is not closed, duplicates left out", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", { status: "Active", last_update: NONE }),
      complaint("2026-09-02", {
        status: "Active",
        violationcasenumber: "2026 141538-CV",
      }),
      complaint("2026-09-03", { status: "Pending" }),
      complaint("2026-09-04", { status: "Active", last_update: DUPLICATE }),
      complaint("2026-09-05", { status: "Closed", last_update: NONE }),
    ]);
    expect(summary.open).toBe(3);
  });

  it("leaves duplicates out of the monthly series", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", { last_update: NONE }),
      complaint("2026-09-02", { last_update: DUPLICATE }),
      complaint("2026-09-03", { last_update: DUPLICATE }),
    ]);
    expect(
      summary.detail.monthly.find((m) => m.month === "2026-09")?.count,
    ).toBe(1);
    expect(summary.duplicates.y3).toBe(2);
  });

  it("writes none of the retired fields: counts by category, the latest list or the last case date", async () => {
    const { summary } = await summaryOf([
      complaint("2026-09-01", { last_update: NONE }),
    ]);
    expect(Object.keys(summary).sort()).toEqual([
      "detail",
      "duplicates",
      "open",
      "tally",
      "violationsOpen",
    ]);
    expect(Object.keys(summary.detail).sort()).toEqual([
      "complaints",
      "id",
      "monthly",
    ]);
  });
});
