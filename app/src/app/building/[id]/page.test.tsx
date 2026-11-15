import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { BuildingDetail, Complex, Meta } from "@/domain/types";
import BuildingPage, { generateMetadata } from "./page";

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

const COMPLEXES = [
  complex("0307050309", "2000 Burton Dr", "Array Apartments", {
    m12: { structure: { violation: 19, none: 13 } },
    y2: { structure: { violation: 50, none: 31 }, property: { none: 4 } },
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
];

const DETAIL: BuildingDetail = {
  id: "0307050309",
  monthly: [{ month: "2026-11", count: 0 }],
  complaints: [],
  deficiencies: [],
  outline: [],
  bbox: [-97.701, 30.199, -97.699, 30.201],
};

const META: Meta = {
  pulledAt: "2026-11-14",
  complexCount: 3,
  caseCount: 202,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
  futureDatedCases: 0,
  skippedParcelRows: 0,
  namedComplexes: 1,
  namesAsOf: "2026-11-14",
  periodStarts: { m12: "2025-11-14", y2: "2024-11-14", y3: "2023-11-14" },
  duplicateCases: 43,
  unrecognizedOutcomes: 0,
  skippedDeficiencies: 0,
  spread: {
    m12: { noneShare: 0.52, nineInTen: 5 },
    y2: { noneShare: 0.41, nineInTen: 9 },
    y3: { noneShare: 0.35, nineInTen: 14 },
  },
  phrasesUsuallyWithCase: [],
};

vi.mock("../../dataFiles", () => ({
  readDataFile: vi.fn(async (name: string) =>
    name === "complexes.json"
      ? COMPLEXES
      : name === "meta.json"
        ? META
        : name === "buildings/0307050309.json"
          ? DETAIL
          : undefined,
  ),
}));

// The page renders the record panel, which asks the city for 311 requests once it is on screen.
vi.stubGlobal(
  "fetch",
  vi.fn(() => new Promise<Response>(() => {})),
);

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

it("shows the building's full record: the 3 years lead, with 12 months and 2 years beside them", async () => {
  render(
    await BuildingPage({
      params: Promise.resolve({ id: "0307050309" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "Array Apartments" }),
  ).toBeVisible();
  expect(
    screen.getByText("in the last 3 years", { exact: true }).closest("p"),
  ).toHaveTextContent("201 complaints in the last 3 years");
  const lines = [
    ...screen.getByRole("list", { name: "What the record shows" }).children,
  ].map((row) => row.firstElementChild?.textContent);
  expect(lines.slice(0, 2)).toEqual([
    "32 of them in the last 12 months.",
    "The city confirmed a violation in 119 of them.",
  ]);

  // Behind the first line, the three periods side by side, with the 3 years marked as the one shown.
  fireEvent.click(
    screen.getByRole("button", { name: "32 of them in the last 12 months." }),
  );
  expect(
    screen.getAllByTestId("period-figure").map((figure) => figure.textContent),
  ).toEqual(["3212 months", "852 years", "2013 years"]);
  expect(screen.getAllByTestId("period-figure")[2]).toHaveAttribute(
    "aria-current",
    "true",
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "The city confirmed a violation in 119 of them.",
    }),
  );
  expect(
    screen.getByText("Violation confirmed").closest("li"),
  ).toHaveTextContent(/^Violation confirmed.*119$/);

  fireEvent.click(screen.getByRole("button", { name: /were about/ }));
  expect(
    screen.getByRole("button", { name: /^Building condition/ }),
  ).toHaveTextContent("185");
  expect(
    screen.getByRole("button", { name: /^Trash and grounds/ }),
  ).toHaveTextContent("13");
});
