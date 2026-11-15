import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CATEGORY_BUTTON_LABEL,
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  CITY_CATEGORY_TERM,
  OUTCOME_CARD_PHRASE,
} from "@/domain/labels";
import {
  classify,
  KNOWN_CITY_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOMES,
} from "@/domain/outcomes";
import type { Meta } from "@/domain/types";
import { readDataFile } from "../dataFiles";
import MethodPage from "./page";

const meta: Meta = {
  pulledAt: "2026-11-14",
  complexCount: 2498,
  caseCount: 17602,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
  futureDatedCases: 0,
  skippedParcelRows: 0,
  namedComplexes: 0,
  namesAsOf: null,
  periodStarts: { m12: "2025-11-14", y2: "2024-11-14", y3: "2023-11-14" },
  duplicateCases: 1732,
  unrecognizedOutcomes: 0,
  skippedDeficiencies: 0,
  phrasesUsuallyWithCase: [],
};

vi.mock("../dataFiles", () => ({
  readDataFile: vi.fn(async () => meta),
}));

async function renderPage(overrides: Partial<Meta> = {}) {
  vi.mocked(readDataFile).mockResolvedValueOnce({ ...meta, ...overrides });
  render(await MethodPage());
}

function sectionOf(heading: string) {
  const section = screen.getByRole("heading", { name: heading }).parentElement;
  if (!section) throw new Error(`The heading ${heading} has no section`);
  return section;
}

const NOT_COUNTED = "Not counted: duplicate report";

it("starts with a way back to the map and has one h1 over a plain heading order", async () => {
  await renderPage();

  expect(screen.getAllByRole("link")[0]).toHaveTextContent("Back to the map");
  expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Method and sources",
  );
  expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
});

it("reads the numbers it names from the data", async () => {
  await renderPage();

  expect(screen.getByText(/This copy has 2,498 complexes/)).toBeVisible();
  expect(screen.getByText(/About 13% of the city's complaints/)).toBeVisible();
  expect(screen.getByText(/17,602 complaints/)).toBeVisible();
  expect(
    screen.getByText("This copy of the data was pulled on November 14, 2026."),
  ).toBeVisible();
});

it("links and names all seven city sources, with the map credit", async () => {
  await renderPage();

  const sources = {
    "Land Use Inventory": "https://data.austintexas.gov/d/7vsm-dvxg",
    Addresses: "https://data.austintexas.gov/d/9s7j-tygf",
    "Austin Code Complaint Cases": "https://data.austintexas.gov/d/6wtj-zbtb",
    "Repeat Offender Registrations": "https://data.austintexas.gov/d/86z9-i27i",
    "Repeat Offender Property Deficiencies":
      "https://data.austintexas.gov/d/ge82-ij4h",
    "Austin 311 Public Data": "https://data.austintexas.gov/d/xwdj-i9he",
    "Building Footprints Year 2013": "https://data.austintexas.gov/d/3qcc-8uhz",
  };
  for (const [name, href] of Object.entries(sources)) {
    expect(screen.getAllByRole("link", { name })[0]).toHaveAttribute(
      "href",
      href,
    );
  }
  expect(
    screen.getByText(/All seven datasets are published by the City of Austin/),
  ).toBeVisible();
  expect(document.body.textContent).not.toMatch(
    /Affordable Housing|CC BY-SA|six datasets/,
  );
  expect(
    screen.getByText(
      /Map data is from OpenStreetMap contributors, delivered through OpenMapTiles and OpenFreeMap/,
    ),
  ).toBeVisible();
});

it("carries the caution and says what the site is not", async () => {
  await renderPage();

  expect(
    screen.getByText(
      "No complaints means none reached Code Enforcement. It does not mean the building has no problems.",
    ),
  ).toBeVisible();
  expect(screen.getByText(/not a City of Austin site/i)).toBeVisible();
  expect(
    screen.getByText(/do not say whether a complaint was about pests, mold/),
  ).toBeVisible();
  expect(screen.getByText(/The data comes with no warranty/)).toBeVisible();
});

it("uses no score language, em dashes or double dashes", async () => {
  await renderPage();

  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/score|grade|rating|rank/i);
  expect(text).not.toMatch(/—|--/);
});

it("explains why counts are not shown per unit", async () => {
  await renderPage();

  expect(
    screen.getByText(
      "Buildings are shown by raw complaint count with the size of their parcel, not as complaints per unit. The city does not publish unit counts for most of these buildings, so a per-unit rate cannot be shown.",
    ),
  ).toBeVisible();
});

it("makes only the claims the data supports", async () => {
  await renderPage();

  const text = document.body.textContent ?? "";
  expect(text).toContain("not endorsed by the City of Austin");
  for (const removed of [
    "has not reviewed",
    "reported or found",
    "closest match",
    "who was at fault",
    "whether the problem was real",
    "unreliable for the rest",
  ]) {
    expect(text).not.toContain(removed);
  }
});

it("no longer says anything from the two-period, code case way of counting", async () => {
  await renderPage();

  const text = document.body.textContent ?? "";
  for (const retired of [
    "code case",
    "Code case",
    "since November 2023",
    "What a code case is",
    "how a case was resolved",
    "open now",
    "cases per unit",
    "raw case count",
    "November 1, 2023",
  ]) {
    expect(text, retired).not.toContain(retired);
  }
});

describe("what counts as a complaint", () => {
  it("names the dataset and says duplicates are left out", async () => {
    await renderPage();
    const section = sectionOf("What counts as a complaint");

    expect(section).toHaveTextContent("Austin Code Complaint Cases");
    expect(section).toHaveTextContent(
      "category, status, dates and the city's outcome phrase",
    );
    expect(section).toHaveTextContent("a violation case number");
  });

  it("says the duplicates were at the complexes on this site, never citywide, with the number from the data", async () => {
    await renderPage({ duplicateCases: 4321 });
    const section = sectionOf("What counts as a complaint");

    expect(section).toHaveTextContent(
      "4,321 complaints at these complexes were closed by the city as duplicates of another complaint and are not counted.",
    );
    expect(section).toHaveTextContent("Over the last 3 years");
    expect(document.body.textContent).not.toMatch(/citywide|city-wide/i);
  });

  it("says one duplicate in the singular", async () => {
    await renderPage({ duplicateCases: 1 });
    expect(
      screen.getByText(
        /1 complaint at these complexes was closed by the city as a duplicate of another complaint and is not counted\./,
      ),
    ).toBeVisible();
  });

  it("gives all four categories with the city's own term and what each covers, then the words on the filter buttons", async () => {
    await renderPage();
    const items = within(sectionOf("What counts as a complaint")).getAllByRole(
      "listitem",
    );

    for (const category of [
      "structure",
      "property",
      "landuse",
      "permit",
    ] as const) {
      const item = items.find((li) =>
        li.textContent?.startsWith(CATEGORY_LABEL[category]),
      );
      expect(item, category).toBeDefined();
      expect(item).toHaveTextContent(
        `the city's description includes ${CITY_CATEGORY_TERM[category]}`,
      );
      expect(item).toHaveTextContent(CATEGORY_MEANING[category]);
    }
    const [building, grounds, zoning, permits] = (
      ["structure", "property", "landuse", "permit"] as const
    ).map((category) => CATEGORY_BUTTON_LABEL[category]);
    expect(sectionOf("What counts as a complaint")).toHaveTextContent(
      `The type buttons on the filter bar read ${building}, ${grounds}, ${zoning} and ${permits}, short for these four names in that order.`,
    );
    expect(
      screen.getByText(
        /the examples come from the kinds of problem the city recorded at Repeat Offender properties/i,
      ),
    ).toBeVisible();
  });

  it("says which of the city's descriptions end with Violation(s), and that it says nothing about a finding", async () => {
    await renderPage();
    const section = sectionOf("What counts as a complaint");

    expect(section).toHaveTextContent(
      `Two of the city's descriptions, for ${CATEGORY_LABEL.structure} and ${CATEGORY_LABEL.landuse}, end with the word "Violation(s)". That is part of the city's name for the type of complaint. It is there whether or not a violation was found.`,
    );
    expect(section).toHaveTextContent(
      "Each complaint counted here is in one of four categories",
    );
    // The full descriptions are not printed beside the categories, where they would read like findings.
    expect(document.body.textContent).not.toContain(
      "Structure Condition Violation(s)",
    );
    expect(document.body.textContent).not.toContain("Land Use Violation(s)");
  });
});

describe("how outcomes are decided", () => {
  it("lists the six rules in the order the site applies them, as a numbered list", async () => {
    await renderPage();
    const rules = within(sectionOf("How outcomes are decided")).getByRole(
      "list",
      { name: "The rules, in order" },
    );

    expect(rules.tagName).toBe("OL");
    const items = within(rules)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(items).toHaveLength(6);
    expect(items[0]).toMatch(/duplicate/i);
    expect(items[0]).toMatch(/not counted/i);
    expect(items[1]).toContain("violation case number");
    expect(items[1]).toContain(OUTCOME_LABEL.violation);
    expect(items[2]).toContain(OUTCOME_LABEL.fixed);
    expect(items[3]).toContain(OUTCOME_LABEL.none);
    expect(items[4]).toContain("has not closed");
    expect(items[4]).toContain(OUTCOME_LABEL.open);
    expect(items[5]).toContain(OUTCOME_LABEL.other);
    expect(sectionOf("How outcomes are decided")).toHaveTextContent(
      "The first rule that fits decides",
    );
  });

  it("says a violation case number always means Violation confirmed, whatever the phrase", async () => {
    await renderPage();
    expect(sectionOf("How outcomes are decided")).toHaveTextContent(
      "A complaint with a violation case number is always Violation confirmed, whatever the city's phrase says.",
    );
  });

  describe("the table of the city's phrases", () => {
    async function renderTable() {
      await renderPage();
      return screen.getByRole("table");
    }

    it("is a real table with a caption and header cells", async () => {
      const table = await renderTable();

      expect(
        within(table).getByText(/City outcome phrases/, {
          selector: "caption",
        }),
      ).toBeVisible();
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((cell) => cell.textContent),
      ).toEqual(["Counted as", "City phrases"]);
      for (const row of within(table).getAllByRole("row").slice(1)) {
        expect(within(row).getAllByRole("rowheader")).toHaveLength(1);
      }
    });

    it("lists every phrase the city is known to use exactly once, as plain text and never as a link", async () => {
      const table = await renderTable();
      const phrases = within(table)
        .getAllByRole("listitem")
        .map((item) => item.textContent);

      expect([...phrases].sort()).toEqual([...KNOWN_CITY_OUTCOMES].sort());
      expect(within(table).queryAllByRole("link")).toHaveLength(0);
    });

    it("puts each phrase under the outcome classify gives a closed complaint with that phrase and no violation case number", async () => {
      const table = await renderTable();

      for (const phrase of KNOWN_CITY_OUTCOMES) {
        const landed = classify({
          cityOutcome: phrase,
          status: "Closed",
          hasViolationCase: false,
        });
        const heading =
          landed === "duplicate" ? NOT_COUNTED : OUTCOME_LABEL[landed];
        const row = within(table)
          .getAllByRole("row")
          .find(
            (candidate) =>
              within(candidate).queryByRole("rowheader")?.textContent ===
              heading,
          );
        expect(row, `${phrase} under ${heading}`).toBeDefined();
        if (!row) continue;
        expect(
          within(row)
            .getAllByRole("listitem")
            .map((item) => item.textContent),
        ).toContain(phrase);
      }
    });

    it("orders the outcomes as the site does and ends with the not counted heading", async () => {
      const table = await renderTable();
      const headings = within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent);

      const expected = [
        ...OUTCOMES.map((outcome) => OUTCOME_LABEL[outcome]),
        NOT_COUNTED,
      ];
      expect(headings).toEqual(
        expected.filter((heading) => headings.includes(heading)),
      );
      expect(headings.at(-1)).toBe(NOT_COUNTED);
      expect(headings).toContain(OUTCOME_LABEL.violation);
    });

    it("has Closed/Duplicate Case under the not counted heading and nowhere else on the page", async () => {
      const table = await renderTable();
      const row = within(table)
        .getAllByRole("row")
        .find(
          (candidate) =>
            within(candidate).queryByRole("rowheader")?.textContent ===
            NOT_COUNTED,
        );

      expect(
        within(row as HTMLElement).getByText("Closed/Duplicate Case"),
      ).toBeVisible();
      expect(
        document.body.textContent?.split("Closed/Duplicate Case"),
      ).toHaveLength(2);
    });

    it("says what a phrase lands on only holds for a closed complaint with no violation case number", async () => {
      await renderTable();
      expect(sectionOf("How outcomes are decided")).toHaveTextContent(
        "The table shows where each phrase lands for a complaint the city has closed and that has no violation case number.",
      );
    });

    it("notes, from the data, the phrases that land without a finding on their own but in practice come with a violation case", async () => {
      await renderPage({
        phrasesUsuallyWithCase: [
          "Closed due to Voluntary Compliance",
          // Confirmed on its own, so the table already puts it where its complaints are counted.
          "CV Violation(s) Found/Inspection Performed",
          "Closed due to Abatement",
          "Legal Action-All Deficiencies Satisfied",
          "Follow-up Inspection",
        ],
      });
      const note = screen.getByText(/^Phrases such as /);
      expect(note).toHaveTextContent(
        'Phrases such as "Closed due to Voluntary Compliance", "Closed due to Abatement" and "Legal Action-All Deficiencies Satisfied" appear under Referred or closed without a finding because the table shows where a phrase lands on its own. In practice nearly every complaint the city closes with one of them carries a violation case number, and so counts as Violation confirmed.',
      );
      expect(note.previousElementSibling).toContainElement(
        screen.getByRole("table"),
      );
    });

    it("leaves the note out when the data names no such phrase", async () => {
      await renderPage({ phrasesUsuallyWithCase: [] });
      expect(screen.queryByText(/^Phrases such as /)).toBeNull();
    });
  });

  it("says nothing about unrecognized phrases when there are none, and how many when there are", async () => {
    await renderPage();
    expect(document.body.textContent).not.toContain("not on this list");

    await renderPage({ unrecognizedOutcomes: 3 });
    expect(
      screen.getByText(
        /3 complaints the city opened in the last 3 years carry a phrase that is not on this list/,
      ),
    ).toBeVisible();
  });

  it("says the outcome words on the filter bar and the cards come from these names", async () => {
    await renderPage();
    const section = sectionOf("How outcomes are decided");

    for (const outcome of OUTCOMES) {
      expect(section).toHaveTextContent(
        `${OUTCOME_CARD_PHRASE[outcome]} means ${OUTCOME_LABEL[outcome]}`,
      );
    }
  });
});

describe("what Violation confirmed means and does not", () => {
  it("says what it is, three things it does not say, and what still open means", async () => {
    await renderPage();
    const section = sectionOf("What Violation confirmed means and does not");

    expect(section).toHaveTextContent(
      "the city opened a formal violation case",
    );
    expect(section).toHaveTextContent(
      "It does not say the violation was serious.",
    );
    expect(section).toHaveTextContent("It does not say who was responsible.");
    expect(section).toHaveTextContent("It does not say the violation remains.");
    expect(section).toHaveTextContent(
      "Still open means the city's record of the complaint was not marked Closed when the data was pulled.",
    );
  });
});

describe("how far back it goes", () => {
  it("gives each period's first day from the data and the rule for counting a complaint in it", async () => {
    await renderPage({
      periodStarts: { m12: "2025-12-02", y2: "2024-12-02", y3: "2023-12-02" },
    });
    const section = sectionOf("How far back it goes");

    expect(section).toHaveTextContent("12 months: from December 2, 2025");
    expect(section).toHaveTextContent("2 years: from December 2, 2024");
    expect(section).toHaveTextContent("3 years: from December 2, 2023");
    expect(section).toHaveTextContent(
      "A complaint is counted in a period when it was opened on or after that day and not after the day the data was pulled.",
    );
    expect(section).toHaveTextContent("November 14, 2026");
  });

  it("says why there is no longer period and that dates follow Austin's calendar", async () => {
    await renderPage();
    const section = sectionOf("How far back it goes");

    expect(section).toHaveTextContent("sparse before November 2023");
    expect(section).toHaveTextContent("Austin's calendar, not UTC");
  });

  it("says open means not closed, among the last 3 years, and why it can differ from Still being looked into", async () => {
    await renderPage();
    const section = sectionOf("How far back it goes");

    expect(section).toHaveTextContent(
      "Open complaints are those the city had not closed when the data was pulled, among the complaints in the 3 years, duplicates left out.",
    );
    expect(section).toHaveTextContent(
      "a complaint with a violation case number is Violation confirmed even while it is open",
    );
  });
});

describe("what is left out", () => {
  it("says how many complaints at these complexes are counted, from the data", async () => {
    await renderPage();
    expect(sectionOf("What is left out")).toHaveTextContent(
      "This copy counts 17,602 complaints at apartment complexes in the last 3 years, with duplicates left out.",
    );
  });

  it("says how many complaints carry an unrecognized description, only when there are some", async () => {
    await renderPage();
    expect(document.body.textContent).not.toContain("does not recognize");

    await renderPage({ uncategorizedCases: 12 });
    expect(
      screen.getByText(
        /12 complaints carry a description this site does not recognize and are not counted\./,
      ),
    ).toBeVisible();
  });
});

describe("recorded problems", () => {
  it("says where they come from, whom they cover and how far back", async () => {
    await renderPage();
    const section = sectionOf(
      "Recorded problems at Repeat Offender properties",
    );

    expect(
      within(section).getByRole("link", {
        name: "Repeat Offender Property Deficiencies",
      }),
    ).toHaveAttribute("href", "https://data.austintexas.gov/d/ge82-ij4h");
    expect(section).toHaveTextContent(
      "published only for properties in the Repeat Offender program",
    );
    expect(section).toHaveTextContent("recorded in the last 3 years");
  });

  it("says what a kind of problem is", async () => {
    await renderPage();
    expect(
      sectionOf("Recorded problems at Repeat Offender properties"),
    ).toHaveTextContent(
      "A kind of problem is the title of the code section the city cited, shown as the city writes it, with the section number when the city gives one, such as Installation (§605.1).",
    );
  });
});

it("describes each of the four ways a building is labelled", async () => {
  await renderPage();

  const labelling = sectionOf("How a building is labelled");
  expect(labelling).toHaveTextContent(
    "a city address point that falls inside the parcel",
  );
  expect(labelling).toHaveTextContent(
    "a whole address is used before a fractional one such as 310 1/2 Comal St, then the lowest street number",
  );
  expect(labelling).toHaveTextContent(
    "the address the city registered it under",
  );
  expect(labelling).toHaveTextContent(
    "its city parcel ID and the nearest address point within 150 meters, such as Parcel 0123456789, near 100 Main St. That address may belong to a neighbor.",
  );
  expect(labelling).toHaveTextContent("the label is the parcel ID alone");
  expect(labelling).not.toHaveTextContent(
    "the city address point inside its parcel, or",
  );
});

it("says parcels sharing an address are shown as one complex, with their complaints counted together", async () => {
  await renderPage();

  const complexes = sectionOf("What counts as a complex");
  expect(complexes).toHaveTextContent(
    "parcels that share an address are shown as one complex",
  );
  expect(complexes).toHaveTextContent("within 250 meters of one another");
  expect(complexes).toHaveTextContent(
    "their complaints are counted together under that address",
  );
  expect(complexes).not.toHaveTextContent("Neighboring parcels are not merged");
});

describe("names, building shapes and photos", () => {
  const named: Meta = {
    ...meta,
    complexCount: 2496,
    namedComplexes: 844,
    namesAsOf: "2026-11-14",
  };

  async function renderNamed(overrides: Partial<Meta> = {}) {
    vi.mocked(readDataFile).mockResolvedValueOnce({ ...named, ...overrides });
    render(await MethodPage());
    const heading = screen.getByRole("heading", {
      name: "Names, building shapes and photos",
    });
    if (!heading.parentElement)
      throw new Error("The section heading has no section");
    return heading.parentElement;
  }

  it("says where names come from, what they may get wrong, and when one is shown", async () => {
    const section = await renderNamed();
    expect(section).toHaveTextContent(
      "Names come from OpenStreetMap, where they are recorded by volunteers and may be out of date.",
    );
    expect(section).toHaveTextContent(
      "A name is shown only when one clear name lies inside the parcel.",
    );
    expect(section).toHaveTextContent(
      "If the property is registered on the city's Repeat Offender list under a different property name, neither name is shown.",
    );
    // A registration in a company's name is not a property name, so it is not held against the name on the sign.
    expect(section).toHaveTextContent(
      "A registration that reads as a company's name is not compared.",
    );
    // A few names come from the city, so the page must not say every name is from OpenStreetMap.
    expect(section).toHaveTextContent(
      "When OpenStreetMap has no name inside the parcel, the name the property is registered under on the city's Repeat Offender list is shown only after a person has checked and approved it, and never when it reads as a company's.",
    );
    expect(section).toHaveTextContent("Names as of November 14, 2026.");
    expect(section).toHaveTextContent(
      "844 of these 2,496 complexes have a name.",
    );
  });

  it("leaves out the snapshot date when there is none", async () => {
    const section = await renderNamed({ namesAsOf: null });
    expect(section).not.toHaveTextContent("Names as of");
    expect(section).toHaveTextContent(
      "844 of these 2,496 complexes have a name.",
    );
  });

  it("says where building shapes and aerial photos come from", async () => {
    const section = await renderNamed();
    expect(section).toHaveTextContent(
      "Building shapes are from the city's 2013 survey of building footprints, with OpenStreetMap shapes for newer buildings and estimated heights where none was measured.",
    );
    expect(section).toHaveTextContent(
      "Aerial photos are from the USGS National Agriculture Imagery Program and are in the public domain.",
    );
  });

  it("links the Open Database License that OpenStreetMap data is under", async () => {
    const section = await renderNamed();
    expect(section).toHaveTextContent(
      "OpenStreetMap data is available under the Open Database License.",
    );
    expect(
      within(section).getByRole("link", { name: "Open Database License" }),
    ).toHaveAttribute("href", "https://opendatacommons.org/licenses/odbl/");
  });
});
