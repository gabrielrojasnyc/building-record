import { describe, expect, it } from "vitest";
import repeatOffenderRows from "./fixtures/repeat-offenders.json";
import {
  groupDeficiencies,
  loadDeficiencies,
  loadRepeatOffenders,
} from "./context";

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

describe("loadRepeatOffenders", () => {
  it("keeps only Active registrations, keyed by parcel ID", async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    const { offenders } = await loadRepeatOffenders(impl);
    expect([...offenders.keys()].sort()).toEqual(["0304070701", "0312130115"]);
  });

  it("reads the numbers as numbers and the name when the city gives one", async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    const { offenders } = await loadRepeatOffenders(impl);
    expect(offenders.get("0304070701")).toEqual({
      name: "Riverside Terrace Apartments",
      units: 300,
      activeViolations: 12,
      totalViolations: 41,
      registeredAddress: "8900 N IH 35 SVRD SB",
    });
    expect(offenders.get("0312130115")?.name).toBeNull();
  });

  it("reports every row read, Suspended included", async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    expect((await loadRepeatOffenders(impl)).rowsRead).toBe(3);
  });

  it("pages in a stable order, with the row ID breaking ties between repeated parcels", async () => {
    const { impl, urls } = fakeFetch(repeatOffenderRows);
    await loadRepeatOffenders(impl);
    expect(new URL(urls[0]).searchParams.get("$order")).toBe("parcelid,:id");
  });

  it("never requests the owner field", async () => {
    const { impl, urls } = fakeFetch(repeatOffenderRows);
    await loadRepeatOffenders(impl);
    expect(decodeURIComponent(urls[0])).not.toMatch(/owner/i);
  });
});
describe("loadDeficiencies", () => {
  const PULLED_AT = new Date("2026-11-14T15:00:00Z");
  const deficiency = (overrides: Record<string, string> = {}) => ({
    parcelid: "0304070701",
    violationcategory: "Structure Condition Violations",
    deficiencycategory: "Roofs and Drainage (§304.7)",
    deficiencyindate: "2025-03-01T00:00:00.000",
    deficiencystatus: "Cleared",
    ...overrides,
  });

  it("groups deficiencies by category and kind, keeps the city's section reference, and skips unknown categories", async () => {
    const { impl } = fakeFetch([
      deficiency(),
      deficiency({ deficiencystatus: "Not Cleared" }),
      deficiency({ deficiencystatus: "Not Cleared" }),
      deficiency({
        deficiencycategory: "Exterior Walls (§304.6)",
        deficiencystatus: "Cleared",
      }),
      deficiency({
        violationcategory: "Property Abatement Violations",
        deficiencycategory: "Unsanitary Conditions",
        deficiencystatus: "Not Cleared",
      }),
      deficiency({
        violationcategory: "Land Use Violations",
        deficiencycategory: "Signs, Required",
      }),
      deficiency({
        violationcategory: "Fire Safety Violations",
        deficiencycategory: "Alarms",
      }),
      deficiency({ deficiencycategory: "  " }),
      deficiency({
        parcelid: "0312130115",
        deficiencycategory: "Installation (§605.1)",
      }),
    ]);

    const { byParcel, skipped, rowsRead } = await loadDeficiencies(
      PULLED_AT,
      impl,
    );

    expect(rowsRead).toBe(9);
    expect(skipped).toBe(2);
    expect(byParcel.get("0304070701")).toEqual([
      {
        category: "structure",
        kind: "Roofs and Drainage (§304.7)",
        cleared: 1,
        notCleared: 2,
      },
      {
        category: "structure",
        kind: "Exterior Walls (§304.6)",
        cleared: 1,
        notCleared: 0,
      },
      {
        category: "property",
        kind: "Unsanitary Conditions",
        cleared: 0,
        notCleared: 1,
      },
      {
        category: "landuse",
        kind: "Signs, Required",
        cleared: 1,
        notCleared: 0,
      },
    ]);
    expect(byParcel.get("0312130115")).toEqual([
      {
        category: "structure",
        kind: "Installation (§605.1)",
        cleared: 1,
        notCleared: 0,
      },
    ]);
  });

  it("keeps apart two code sections that share a title", async () => {
    const { impl } = fakeFetch([
      deficiency({ deficiencycategory: "General (§504.1)" }),
      deficiency({ deficiencycategory: "General (§305.1)" }),
      deficiency({ deficiencycategory: " General (§504.1) " }),
    ]);
    const { byParcel } = await loadDeficiencies(PULLED_AT, impl);
    expect(
      byParcel.get("0304070701")?.map(({ kind, cleared }) => [kind, cleared]),
    ).toEqual([
      ["General (§504.1)", 2],
      ["General (§305.1)", 1],
    ]);
  });

  it("skips, and counts, a kind longer than 90 characters or with anything but the city's title characters", async () => {
    const longest = `Plumbing system hazards, Action Plan Required (§504.3) ${"x".repeat(90 - 55)}`;
    expect(longest).toHaveLength(90);
    const { impl } = fakeFetch([
      deficiency({ deficiencycategory: longest }),
      deficiency({ deficiencycategory: `${longest}x` }),
      deficiency({
        deficiencycategory: "Graffiti Prohibited - City Code 9-4-43",
      }),
      deficiency({
        deficiencycategory: "Smoke alarms- residential (§704.6.1.2)",
      }),
      deficiency({ deficiencycategory: "Logan's Mill & Co. / Doors, Frames" }),
      deficiency({
        deficiencycategory: "Tenant in 4B says: call 512-555-0100!",
      }),
      deficiency({ deficiencycategory: "Leak\nin unit" }),
      deficiency({ deficiencycategory: "<b>Doors</b>" }),
    ]);
    const { byParcel, skipped } = await loadDeficiencies(PULLED_AT, impl);
    expect(
      byParcel
        .get("0304070701")
        ?.map(({ kind }) => kind)
        .sort(),
    ).toEqual(
      [
        longest,
        "Graffiti Prohibited - City Code 9-4-43",
        "Smoke alarms- residential (§704.6.1.2)",
        "Logan's Mill & Co. / Doors, Frames",
      ].sort(),
    );
    expect(skipped).toBe(4);
  });

  it("counts anything but Cleared as not cleared", async () => {
    const { impl } = fakeFetch([
      deficiency({ deficiencystatus: "Not Cleared" }),
      deficiency({ deficiencystatus: "Pending review" }),
      deficiency({ deficiencystatus: "" }),
    ]);
    const { byParcel } = await loadDeficiencies(PULLED_AT, impl);
    expect(byParcel.get("0304070701")).toEqual([
      {
        category: "structure",
        kind: "Roofs and Drainage (§304.7)",
        cleared: 0,
        notCleared: 3,
      },
    ]);
  });

  it("asks for the five columns it uses, from the 3 year start, in a stable order, and never the owner", async () => {
    const { impl, urls } = fakeFetch([deficiency()]);
    await loadDeficiencies(PULLED_AT, impl);
    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/resource/ge82-ij4h.json");
    expect(url.searchParams.get("$select")).toBe(
      "parcelid,violationcategory,deficiencycategory,deficiencyindate,deficiencystatus",
    );
    expect(url.searchParams.get("$where")).toBe(
      "deficiencyindate >= '2023-11-14'",
    );
    expect(url.searchParams.get("$order")).toBe("parcelid,:id");
    expect(decodeURIComponent(urls[0])).not.toMatch(/owner/i);
  });

  it("takes the 3 year start from the Austin pull date", async () => {
    const { impl, urls } = fakeFetch([]);
    await loadDeficiencies(new Date("2026-11-14T03:00:00Z"), impl);
    expect(new URL(urls[0]).searchParams.get("$where")).toBe(
      "deficiencyindate >= '2023-11-13'",
    );
  });

  it("leaves out rows with no parcel ID, without counting them as skipped categories", async () => {
    const { impl } = fakeFetch([deficiency({ parcelid: "" }), deficiency()]);
    const { byParcel, skipped } = await loadDeficiencies(PULLED_AT, impl);
    expect([...byParcel.keys()]).toEqual(["0304070701"]);
    expect(skipped).toBe(0);
  });
});

describe("groupDeficiencies", () => {
  it("adds kinds with the same category and name and orders them by category, then most recorded, then name", () => {
    expect(
      groupDeficiencies([
        { category: "property", kind: "Trash", cleared: 1, notCleared: 0 },
        { category: "structure", kind: "Walls", cleared: 1, notCleared: 0 },
        { category: "structure", kind: "Roofs", cleared: 0, notCleared: 3 },
        { category: "structure", kind: "Walls", cleared: 0, notCleared: 1 },
        { category: "structure", kind: "Doors", cleared: 2, notCleared: 0 },
      ]),
    ).toEqual([
      { category: "structure", kind: "Roofs", cleared: 0, notCleared: 3 },
      { category: "structure", kind: "Doors", cleared: 2, notCleared: 0 },
      { category: "structure", kind: "Walls", cleared: 1, notCleared: 1 },
      { category: "property", kind: "Trash", cleared: 1, notCleared: 0 },
    ]);
  });
});
