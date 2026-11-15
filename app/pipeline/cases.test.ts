import { describe, expect, it } from "vitest";
import caseRows from "./fixtures/cases.json";
import { PERIODS, periodStarts } from "@/domain/periods";
import { categoryOf, emptyCaseSummary, loadCases } from "./cases";

const PULLED_AT = new Date("2026-11-14T15:00:00Z");
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

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

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
    expect(a.lastCase).toBe("2026-11-14");
    expect(a.detail.latest.map((c) => c.opened)).not.toContain("2026-11-20");
  });

  it("keeps the monthly series summing to the case total for every parcel", async () => {
    const { index } = await load();
    for (const summary of index.byParcel.values()) {
      const monthlySum = summary.detail.monthly.reduce(
        (sum, m) => sum + m.count,
        0,
      );
      expect(monthlySum).toBe(total(summary.cases));
    }
  });

  it("includes a case opened on 2023-11-01 in the totals and the first month", async () => {
    const { index, urls } = await load();
    expect(new URL(urls[0]).searchParams.get("$where")).toBe(
      "opened_date >= '2023-11-01'",
    );
    const a = index.byParcel.get(PARCEL_A)!;
    expect(a.cases.structure).toBe(4);
    expect(a.detail.monthly[0]).toEqual({ month: "2023-11", count: 2 });
  });

  it("keeps a parcel for every ID with a categorized case, trimming IDs", async () => {
    const { index } = await load();
    expect([...index.byParcel.keys()].sort()).toEqual([PARCEL_A, PARCEL_B]);
    expect(total(index.byParcel.get(PARCEL_B)!.cases)).toBe(2);
  });

  it("counts a case on the 12 month boundary day in both periods and the day before in one", async () => {
    const { index } = await load();
    const a = index.byParcel.get(PARCEL_A)!;
    // 2025-11-14 is inside the window, 2025-11-13 is outside; 2025-10-14 is 13 months back.
    expect(a.cases12).toEqual({
      structure: 2,
      property: 1,
      landuse: 2,
      permit: 0,
    });
    expect(a.cases).toEqual({
      structure: 4,
      property: 2,
      landuse: 2,
      permit: 2,
    });
  });

  it("counts status other than Closed as open", async () => {
    const { index } = await load();
    expect(index.byParcel.get(PARCEL_A)!.open).toBe(2);
    // The unknown description on parcel B is Active but never counted.
    expect(index.byParcel.get(PARCEL_B)!.open).toBe(0);
  });

  it("fills months with no cases as zero", async () => {
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

  it("puts a case from the first history month and one from the pull day in their months", async () => {
    const { index } = await load();
    const { monthly } = index.byParcel.get(PARCEL_A)!.detail;
    expect(monthly[0]).toEqual({ month: "2023-11", count: 2 });
    expect(monthly.at(-1)).toEqual({ month: "2026-11", count: 2 });
    expect(monthly.reduce((sum, m) => sum + m.count, 0)).toBe(10);
  });

  it("keeps the 8 newest cases, newest first, with the city status unchanged", async () => {
    const { index } = await load();
    const { latest } = index.byParcel.get(PARCEL_A)!.detail;
    expect(latest).toHaveLength(8);
    expect(latest[0]).toEqual({
      opened: "2026-11-14",
      category: "property",
      status: "Pending",
    });
    expect(latest.map((c) => c.opened)).toEqual(
      [...latest.map((c) => c.opened)].sort().reverse(),
    );
    expect(latest.map((c) => c.opened)).not.toContain("2023-11-02");
  });

  it("reports the most recent categorized case as lastCase", async () => {
    const { index } = await load();
    expect(index.byParcel.get(PARCEL_A)!.lastCase).toBe("2026-11-14");
    // The newer unknown description case on parcel B is ignored.
    expect(index.byParcel.get(PARCEL_B)!.lastCase).toBe("2026-06-01");
  });

  it("never requests inspector or owner, and asks only for the case fields it uses since 2023-11-01", async () => {
    const { urls } = await load();
    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/resource/6wtj-zbtb.json");
    expect(url.searchParams.get("$select")).toBe(
      "parcelid,description,status,opened_date,closed_date,last_update,violationcasenumber,violationcaselink",
    );
    expect(url.searchParams.get("$where")).toBe("opened_date >= '2023-11-01'");
    expect(decodeURIComponent(urls[0])).not.toMatch(/inspector|owner/i);
  });
});

describe("date boundaries", () => {
  const summaryFor = async (pulledAt: string, opened: string[]) => {
    const { impl } = fakeFetch(opened.map((d) => caseOn(d)));
    const index = await loadCases(new Date(pulledAt), impl);
    return index.byParcel.get(PARCEL_A)!;
  };

  it("counts a case opened 11 months before the pull in both periods, 13 months in one", async () => {
    const summary = await summaryFor("2026-11-14T15:00:00Z", [
      "2025-12-14",
      "2025-10-14",
    ]);
    expect(total(summary.cases)).toBe(2);
    expect(total(summary.cases12)).toBe(1);
  });

  it("includes exactly the same day 12 months back and excludes the day before", async () => {
    const onDay = await summaryFor("2026-11-14T15:00:00Z", ["2025-11-14"]);
    const dayBefore = await summaryFor("2026-11-14T15:00:00Z", ["2025-11-13"]);
    expect(total(onDay.cases12)).toBe(1);
    expect(total(dayBefore.cases12)).toBe(0);
  });

  it("takes the pull date in Austin: 03:00Z is still the evening of 13 November", async () => {
    const summary = await summaryFor("2026-11-14T03:00:00Z", [
      "2025-11-13",
      "2025-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    // Austin date 2026-11-13: window opens 2025-11-13, and the 14th is in the future.
    expect(total(summary.cases12)).toBe(2);
    expect(total(summary.cases)).toBe(3);
    expect(summary.lastCase).toBe("2026-11-13");
  });

  it("takes the pull date in Austin: 07:00Z is the early morning of 14 November", async () => {
    const summary = await summaryFor("2026-11-14T07:00:00Z", [
      "2025-11-13",
      "2025-11-14",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(total(summary.cases12)).toBe(2);
    expect(total(summary.cases)).toBe(3);
    expect(summary.lastCase).toBe("2026-11-14");
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
    expect(total(summary.cases12)).toBe(1);
  });

  it("ends the monthly series at the pull month", async () => {
    const summary = await summaryFor("2024-02-10T15:00:00Z", ["2024-02-01"]);
    expect(summary.detail.monthly.map((m) => m.month)).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
    ]);
    expect(summary.detail.monthly.at(-1)?.count).toBe(1);
  });
});

describe("emptyCaseSummary", () => {
  it("returns zero counts and a zero-filled series for the pull date", () => {
    const summary = emptyCaseSummary("0100000009", PULLED_AT);
    expect(summary.cases).toEqual({
      structure: 0,
      property: 0,
      landuse: 0,
      permit: 0,
    });
    expect(summary.cases12).toEqual(summary.cases);
    expect(summary.open).toBe(0);
    expect(summary.lastCase).toBeNull();
    expect(summary.detail.id).toBe("0100000009");
    expect(summary.detail.latest).toEqual([]);
    expect(summary.detail.monthly).toHaveLength(37);
    expect(summary.detail.monthly.every((m) => m.count === 0)).toBe(true);
    expect(summary.detail.monthly.at(-1)?.month).toBe("2026-11");
  });
});
describe("emptyCaseSummary outcome fields", () => {
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
    // The existing counts keep their meaning: every categorized case since 2023-11-01, duplicates included.
    expect(total(summary.cases)).toBe(6);
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

  it("reads from the earlier of the history start and the 3 year start, but leaves the existing counts on the history start", async () => {
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
    expect(total(summary.cases)).toBe(1);
    expect(summary.detail.monthly[0]).toEqual({ month: "2023-11", count: 1 });
    expect(summary.lastCase).toBe("2023-11-01");
  });

  it("keeps the history start in the filter when it is the earlier one", async () => {
    const { urls } = await summaryOf([complaint("2024-01-01")]);
    expect(new URL(urls[0]).searchParams.get("$where")).toBe(
      "opened_date >= '2023-11-01'",
    );
  });

  it("leaves a complaint opened between the history start and the 3 year start out of the tallies but in the existing counts", async () => {
    const { summary } = await summaryOf([
      complaint("2023-11-05", { last_update: NONE }),
    ]);
    expect(summary.tally.y3).toEqual({});
    expect(summary.detail.complaints).toEqual([]);
    expect(total(summary.cases)).toBe(1);
  });
});

