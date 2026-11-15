import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { Category, Complaint, Complex, Deficiency } from "@/domain/types";
import { CategoryDetail } from "./CategoryDetail";

const THREE_YEARS: View = { ...DEFAULT_VIEW, period: "y3" };

const complex: Complex = {
  id: "0307050309",
  parcelIds: ["0307050309"],
  address: "2000 Burton Dr",
  name: null,
  lon: -97.73,
  lat: 30.23,
  acres: 14.2,
  open: 19,
  tally: {
    m12: { structure: { violation: 19, none: 13 }, landuse: { fixed: 1 } },
    y2: {
      structure: { violation: 28, none: 18 },
      landuse: { violation: 1, fixed: 1 },
    },
    y3: {
      structure: { violation: 112, none: 71, other: 2 },
      property: { none: 7 },
      landuse: { violation: 2, fixed: 1 },
    },
  },
  duplicates: { m12: 33, y2: 38, y3: 43 },
  violationsOpen: 19,
  repeatOffender: null,
};

function complaint(overrides: Partial<Complaint> = {}): Complaint {
  return {
    opened: "2026-11-07",
    closed: "2026-11-09",
    category: "structure",
    outcome: "none",
    stillOpen: false,
    cityOutcome: "No Violation(s) Found/Inspection Performed",
    violationCase: null,
    ...overrides,
  };
}

const CASE_URL =
  "https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=13689866";

const complaints: Complaint[] = [
  complaint(),
  complaint({
    opened: "2026-10-27",
    closed: null,
    outcome: "violation",
    stillOpen: true,
    cityOutcome: "Supervisor Review",
    violationCase: { number: "2026 048480-CV", url: CASE_URL },
  }),
  complaint({ opened: "2026-10-01", category: "property" }),
  complaint({
    opened: "2026-09-03",
    closed: "2026-10-26",
    outcome: "violation",
    cityOutcome: "Closed due to Voluntary Compliance",
    violationCase: { number: "2026 012362-CV", url: null },
  }),
  complaint({
    opened: "2025-12-30",
    closed: "2026-05-04",
    outcome: "violation",
    cityOutcome: "CV Violation(s) Found/Inspection Performed",
    violationCase: { number: "2025 163636-CV", url: CASE_URL },
  }),
];

function renderDetail(
  props: Partial<{
    category: Category;
    complex: Complex;
    complaints: Complaint[] | "loading" | "failed";
    deficiencies: Deficiency[];
    view: View;
    isRepeatOffender: boolean;
    violationsOpen: number | null;
  }> = {},
) {
  return render(
    <CategoryDetail
      category="structure"
      complex={complex}
      complaints={complaints}
      deficiencies={[]}
      view={DEFAULT_VIEW}
      isRepeatOffender={false}
      violationsOpen={null}
      {...props}
    />,
  );
}

const section = (name: RegExp | string) =>
  within(screen.getByRole("region", { name }));

describe("CategoryDetail", () => {
  it("says what the category covers, then the city's own term for it", () => {
    renderDetail();
    expect(
      screen.getByText(
        "The buildings themselves: electrical, plumbing, roofs, walls, stairs and balconies, heating and appliances, pests.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("The city calls this Structure Condition."),
    ).toBeVisible();
  });

  it("shows the category's complaints in each of the three periods, marking the one the panel leads with", () => {
    renderDetail({ view: THREE_YEARS });
    const figures = screen.getAllByTestId("period-figure");
    expect(figures.map((figure) => figure.textContent)).toEqual([
      "3212 months",
      "462 years",
      "1853 years",
    ]);
    expect(
      figures.map((figure) => figure.getAttribute("aria-current")),
    ).toEqual([null, null, "true"]);
    expect(
      screen.queryByRole("button", { name: /12 months|2 years|3 years/ }),
    ).toBeNull();
  });

  it("splits the category's complaints by what the city found, in the active period", () => {
    renderDetail({ violationsOpen: 4 });
    const found = section(/^What the city found/);
    expect(
      screen.getByRole("heading", {
        name: "What the city found in the last 12 months",
      }),
    ).toBeVisible();
    expect(
      found.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual(["Violation confirmed4 still open19", "No violation found13"]);
  });

  it("says so when the category had no complaints in the active period", () => {
    renderDetail({ category: "property" });
    expect(
      section(/^What the city found/).getByText(
        "No complaints of this type in the last 12 months.",
      ),
    ).toBeVisible();
    expect(
      screen
        .getAllByTestId("period-figure")
        .map((figure) => figure.textContent),
    ).toEqual(["012 months", "02 years", "73 years"]);
  });

  describe("problems the city recorded", () => {
    const deficiencies: Deficiency[] = [
      {
        category: "structure",
        kind: "Roofs and Drainage",
        cleared: 21,
        notCleared: 0,
      },
      {
        category: "structure",
        kind: "Electrical installation",
        cleared: 36,
        notCleared: 2,
      },
      {
        category: "property",
        kind: "Unsanitary Conditions",
        cleared: 9,
        notCleared: 0,
      },
      {
        category: "structure",
        kind: "Stairways and balconies",
        cleared: 11,
        notCleared: 1,
      },
    ];

    it("lists each kind at a Repeat Offender property, largest first, with how many are not cleared", () => {
      renderDetail({ deficiencies, isRepeatOffender: true });
      const problems = section("Problems the city recorded here");
      expect(
        problems.getByText(
          "Published by the city for Repeat Offender properties only.",
        ),
      ).toBeVisible();
      expect(
        problems.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual([
        "Electrical installation2 not cleared38",
        "Roofs and Drainageall cleared21",
        "Stairways and balconies1 not cleared12",
      ]);
    });

    it("shows at most eight kinds, then says how many more there are", () => {
      const many = Array.from({ length: 10 }, (_, index) => ({
        category: "structure" as const,
        kind: `Kind ${index + 1}`,
        cleared: 20 - index,
        notCleared: 0,
      }));
      renderDetail({ deficiencies: many, isRepeatOffender: true });
      const problems = section("Problems the city recorded here");
      expect(problems.getAllByRole("listitem")).toHaveLength(8);
      expect(problems.getByText("and 2 more kinds")).toBeVisible();

      renderDetail({ deficiencies: many.slice(0, 9), isRepeatOffender: true });
      expect(screen.getByText("and 1 more kind")).toBeVisible();
    });

    it("shows nothing in their place for a Repeat Offender property with none recorded in this category", () => {
      renderDetail({
        category: "landuse",
        deficiencies,
        isRepeatOffender: true,
      });
      expect(screen.queryByText("Problems the city recorded here")).toBeNull();
    });

    it("shows nothing in their place for any other property", () => {
      renderDetail({ deficiencies, isRepeatOffender: false });
      expect(screen.queryByText("Problems the city recorded here")).toBeNull();
    });
  });

  describe("the complaints, newest first", () => {
    const listed = () =>
      section("Complaints, newest first").getAllByRole("listitem");

    it("lists the category's complaints from all three years with their dates and outcomes", () => {
      renderDetail();
      expect(listed().map((row) => row.textContent)).toEqual([
        "Nov 7, 2026No violation found",
        "Oct 27, 2026Violation confirmed, still openSupervisor Reviewcity record",
        "Sep 3, 2026Violation confirmed, closed Oct 26Closed due to Voluntary Compliance",
        "Dec 30, 2025Violation confirmed, closed May 4, 2026city record",
      ]);
    });

    it("links to the city's record for the case, in a new tab, named for its complaint", () => {
      renderDetail();
      const link = screen.getByRole("link", {
        name: "City record for the complaint opened Oct 27, 2026",
      });
      expect(link).toHaveAttribute("href", CASE_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
      expect(link).toHaveTextContent("city record");
    });

    it("shows twelve, then all of them on request", async () => {
      const many = Array.from({ length: 15 }, (_, index) =>
        complaint({ opened: `2026-01-${String(28 - index).padStart(2, "0")}` }),
      );
      renderDetail({ complaints: many });
      expect(listed()).toHaveLength(12);

      await userEvent.click(
        screen.getByRole("button", { name: "Show all 15" }),
      );
      expect(listed()).toHaveLength(15);
      expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
    });

    it("needs no button for twelve or fewer", () => {
      renderDetail({
        complaints: Array.from({ length: 12 }, () => complaint()),
      });
      expect(listed()).toHaveLength(12);
      expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
    });

    it("holds the list's place in one line while the building file loads", () => {
      renderDetail({ complaints: "loading" });
      expect(
        section("Complaints, newest first").getByText("Loading the complaints"),
      ).toBeVisible();
      expect(screen.getAllByTestId("period-figure")).toHaveLength(3);
    });

    it("says the complaints could not be loaded, and keeps the counts", () => {
      renderDetail({ complaints: "failed" });
      expect(
        section("Complaints, newest first").getByText(
          "These complaints could not be loaded right now.",
        ),
      ).toBeVisible();
      expect(screen.getAllByTestId("period-figure")[0]).toHaveTextContent("32");
    });
  });
});
