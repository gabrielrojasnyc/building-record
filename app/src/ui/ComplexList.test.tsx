import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { Complex, Tally } from "@/domain/types";
import { ComplexList } from "./ComplexList";

function complex(id: string, overrides: Partial<Complex> = {}): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 2.4,
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    repeatOffender: null,
    ...overrides,
  };
}

/** The same tally in all three periods, so a test reads the same whichever period it shows. */
const everyPeriod = (tally: Tally): Complex["tally"] => ({
  m12: tally,
  y2: tally,
  y3: tally,
});

const handlers = {
  onSelect: vi.fn(),
  onToggleOrder: vi.fn(),
};

const clean = complex("100", { address: "1107 W Gibson St" });
const busy = complex("200", {
  address: "909 S Lamar Blvd",
  tally: everyPeriod({ structure: { none: 1 }, property: { violation: 3 } }),
  duplicates: { m12: 40, y2: 40, y3: 40 },
  repeatOffender: {
    name: "Lamar Flats",
    units: 120,
    activeViolations: 4,
    totalViolations: 40,
  },
});
const single = complex("300", {
  tally: everyPeriod({ landuse: { fixed: 1 } }),
});
const sample = [clean, busy, single];

function renderList(complexes: Complex[], view: View = DEFAULT_VIEW) {
  const utils = render(
    <ComplexList
      complexes={complexes}
      {...handlers}
      view={view}
      selectedId={null}
    />,
  );
  return {
    ...utils,
    again: (next: View) =>
      utils.rerender(
        <ComplexList
          complexes={complexes}
          {...handlers}
          view={next}
          selectedId={null}
        />,
      ),
  };
}

function cardElement(text: string) {
  const match = screen
    .getAllByTestId("card")
    .find((element) => element.textContent?.includes(text));
  if (!match) throw new Error(`No card for ${text}`);
  return match;
}

const card = (text: string) => within(cardElement(text));

/** Every piece of text on a card, top to bottom, as a reader meets it. */
const linesOf = (text: string) =>
  [...cardElement(text).querySelectorAll("*")]
    .filter((element) => element.children.length === 0)
    .map((element) => element.textContent ?? "")
    .filter((line) => line !== "");

it("leaves a complex with no complaints out of the cards, and says how many were left out", () => {
  renderList(sample);

  expect(screen.getAllByTestId("card")).toHaveLength(2);
  expect(screen.queryByText("1107 W Gibson St")).toBeNull();
  expect(screen.queryByText("None")).toBeNull();
  // The count line still counts every complex in Austin. Beside it, how many of them have no card.
  expect(
    screen.getByRole("region", { name: "3 complexes in Austin" }),
  ).toBeVisible();
  expect(screen.getByText("1 with no complaints")).toBeVisible();

  expect(card("909 S Lamar Blvd").getByText("4")).toBeVisible();
  expect(card("909 S Lamar Blvd").getByText("complaints")).toBeVisible();
  expect(card("300 Main St").getByText("1")).toBeVisible();
  expect(card("300 Main St").getByText("complaint")).toBeVisible();
});

it("says nothing about complexes left out when every one has a complaint", () => {
  renderList([busy, single]);
  expect(screen.queryByText(/with no complaints/)).toBeNull();
});

it("says so in a note, in place of cards, when no complex in Austin has a complaint under the filters", () => {
  renderList([clean, complex("quiet", { address: "2 Quiet Ln" })]);

  expect(screen.queryAllByTestId("card")).toHaveLength(0);
  expect(
    screen.getByText(
      "No complaints in the last 12 months at the 2 complexes in Austin.",
    ),
  ).toBeVisible();
  expect(screen.getByText("2 with no complaints")).toBeVisible();
});

it("speaks of one complex in the singular in that note", () => {
  renderList([clean]);
  expect(
    screen.getByText(
      "No complaints in the last 12 months at the one complex in Austin.",
    ),
  ).toBeVisible();
});

it("says so in a note when no complex matches the filters", () => {
  renderList([]);

  expect(
    screen.getByRole("region", { name: "0 complexes in Austin" }),
  ).toBeVisible();
  expect(screen.queryAllByTestId("card")).toHaveLength(0);
  expect(
    screen.getByText("No apartment complexes match these filters."),
  ).toBeVisible();
});

describe("the outcome line under the figure", () => {
  const lineFor = (tally: Tally, view: View = DEFAULT_VIEW) => {
    renderList(
      [complex("1", { address: "1 Mix Ln", tally: everyPeriod(tally) })],
      view,
    );
    return card("1 Mix Ln");
  };

  it("names the two largest outcomes, largest first, in the card's short words", () => {
    const outcomes = lineFor({
      structure: { violation: 119, none: 78, fixed: 1, other: 3 },
    });
    expect(outcomes.getByText("119 confirmed, 78 none found")).toBeVisible();
  });

  it("carries both outcomes in full, in the right number, in its title", () => {
    const outcomes = lineFor({ structure: { violation: 119, none: 78 } });
    expect(outcomes.getByText("119 confirmed, 78 none found")).toHaveAttribute(
      "title",
      "119 violations confirmed, 78 no violation found",
    );
  });

  it("speaks of one violation in the singular", () => {
    const outcomes = lineFor({ structure: { violation: 1, other: 1 } });
    // A tie goes to the display order: violation before other.
    expect(outcomes.getByText("1 confirmed, 1 no finding")).toHaveAttribute(
      "title",
      "1 violation confirmed, 1 referred or closed without a finding",
    );
  });

  it("shows one outcome alone when only one is present, and never a zero", () => {
    const outcomes = lineFor({ property: { none: 3 } });
    expect(outcomes.getByText("3 none found")).toHaveAttribute(
      "title",
      "3 no violation found",
    );
    expect(cardElement("1 Mix Ln").textContent).not.toMatch(/\b0 /);
  });

  it("breaks a tie by the display order of outcomes", () => {
    const outcomes = lineFor({ structure: { open: 5, fixed: 5, none: 2 } });
    expect(
      outcomes.getByText("5 fixed at inspection, 5 being looked into"),
    ).toHaveAttribute(
      "title",
      "5 fixed at inspection, 5 still being looked into",
    );
  });

  it("adds the categories together under All", () => {
    const outcomes = lineFor({
      structure: { violation: 2 },
      property: { violation: 1, none: 4 },
    });
    expect(outcomes.getByText("4 none found, 3 confirmed")).toBeVisible();
  });
});

describe("a card's lines", () => {
  const array = complex("1", {
    address: "2000 Burton Dr",
    name: { text: "Array Apartments", source: "openstreetmap" },
    tally: everyPeriod({ structure: { violation: 119, none: 78 } }),
  });

  it("for a named complex: the figure, the noun, the outcomes, the name and its address", () => {
    renderList([array]);
    expect(linesOf("Array Apartments")).toEqual([
      "197",
      "complaints",
      "119 confirmed, 78 none found",
      "Array Apartments",
      "2000 Burton Dr",
    ]);
  });

  it("for a complex with no name: the same with the address as the title and nothing under it", () => {
    renderList([
      complex("2", {
        address: "909 S Lamar Blvd",
        tally: everyPeriod({ property: { none: 2 } }),
      }),
    ]);
    expect(linesOf("909 S Lamar Blvd")).toEqual([
      "2",
      "complaints",
      "2 none found",
      "909 S Lamar Blvd",
    ]);
  });

  it("keeps the full text of a long title, and of the address under a name, in their title attributes, since the card cuts them short", () => {
    const label = "Parcel 0229230206, near 2104 E Anderson Ln SVRD WB";
    const tally = everyPeriod({ structure: { none: 1 } });
    renderList([
      complex("1", { address: label, tally }),
      complex("2", {
        address: label.replace("0229230206", "0229230207"),
        tally,
        name: {
          text: "Foundation Communities: Lakeline Station Apts",
          source: "openstreetmap",
        },
      }),
    ]);
    expect(screen.getByTitle(label)).toHaveTextContent(label);
    expect(
      screen.getByTitle("Foundation Communities: Lakeline Station Apts"),
    ).toHaveTextContent("Foundation Communities: Lakeline Station Apts");
    expect(
      screen.getByTitle("Parcel 0229230207, near 2104 E Anderson Ln SVRD WB"),
    ).toBeVisible();
  });
});

it("tags Repeat Offender properties, keeping the words in the chip and in its title for when a phone shows only the dot", () => {
  renderList(sample);

  const chip = card("909 S Lamar Blvd").getByTitle("Repeat Offender");
  expect(chip).toHaveTextContent("Repeat Offender");
  expect(
    card("909 S Lamar Blvd").getByText("Repeat Offender"),
  ).toBeInTheDocument();
  expect(card("300 Main St").queryByText("Repeat Offender")).toBeNull();
  expect(card("300 Main St").queryByTitle("Repeat Offender")).toBeNull();
});

it("reports a chosen card and the order toggle", async () => {
  renderList(sample);

  await userEvent.click(screen.getAllByTestId("card")[0]);
  expect(handlers.onSelect).toHaveBeenCalledWith("200");

  await userEvent.click(screen.getByRole("button", { name: "Fewest first" }));
  expect(handlers.onToggleOrder).toHaveBeenCalled();
});

describe("in each period", () => {
  const spread = complex("1", {
    address: "1 Spread Ln",
    tally: {
      m12: { structure: { violation: 2 } },
      y2: { structure: { violation: 5, none: 1 } },
      y3: { structure: { violation: 9, none: 12 } },
    },
  });

  it("counts the complaints and their outcomes of the period the view asks for", () => {
    renderList([spread], { ...DEFAULT_VIEW, period: "y3" });
    expect(card("1 Spread Ln").getByText("21")).toBeVisible();
    expect(
      card("1 Spread Ln").getByText("12 none found, 9 confirmed"),
    ).toBeVisible();
  });

  it("reads the 2 year tally for 2 years", () => {
    renderList([spread], { ...DEFAULT_VIEW, period: "y2" });
    expect(card("1 Spread Ln").getByText("6")).toBeVisible();
    expect(
      card("1 Spread Ln").getByText("5 confirmed, 1 none found"),
    ).toBeVisible();
  });
});

describe("with one complaint type selected", () => {
  const permitsOnly: View = { ...DEFAULT_VIEW, category: "permit" };

  it("narrows the figure and the outcome line together, and names the type as the only one counted", () => {
    renderList(
      [
        complex("1", {
          address: "1 Permit Ln",
          tally: everyPeriod({
            permit: { none: 3 },
            structure: { violation: 10, none: 2 },
          }),
        }),
        complex("2", {
          address: "2 Permit Ln",
          tally: everyPeriod({ permit: { violation: 1 } }),
        }),
      ],
      permitsOnly,
    );

    expect(linesOf("1 Permit Ln")).toEqual([
      "3",
      "complaints",
      "3 none found",
      "1 Permit Ln",
      "Work without a permit only",
    ]);
    expect(card("2 Permit Ln").getByText("complaint")).toBeVisible();
    expect(card("2 Permit Ln").getByText("1 confirmed")).toHaveAttribute(
      "title",
      "1 violation confirmed",
    );
    expect(
      card("2 Permit Ln").getByText("Work without a permit only"),
    ).toBeVisible();
  });

  it("counts every type again under All", () => {
    renderList([
      complex("1", {
        address: "1 Permit Ln",
        tally: everyPeriod({
          permit: { none: 3 },
          structure: { violation: 10, none: 2 },
        }),
      }),
    ]);
    expect(card("1 Permit Ln").getByText("15")).toBeVisible();
    expect(
      card("1 Permit Ln").getByText("10 confirmed, 5 none found"),
    ).toBeVisible();
  });

  it("leaves out a complex with none of that type, whatever else it has, and says how many", () => {
    renderList(
      [
        complex("1", {
          address: "1 Upkeep Ln",
          tally: everyPeriod({ property: { none: 2 }, landuse: { other: 1 } }),
        }),
        complex("2", {
          address: "2 Permit Ln",
          tally: everyPeriod({ permit: { violation: 1 } }),
        }),
        clean,
      ],
      permitsOnly,
    );

    expect(screen.getAllByTestId("card")).toHaveLength(1);
    expect(card("2 Permit Ln").getByText("1")).toBeVisible();
    expect(screen.queryByText("1 Upkeep Ln")).toBeNull();
    expect(screen.getByText("2 with none of this type")).toBeVisible();
  });

  it("says so in a note when no complex in Austin has a complaint of that type in the period", () => {
    renderList(
      [
        complex("1", {
          address: "1 Old Case Ln",
          tally: { m12: {}, y2: {}, y3: { permit: { none: 4 } } },
        }),
      ],
      permitsOnly,
    );

    expect(screen.queryAllByTestId("card")).toHaveLength(0);
    expect(
      screen.getByText(
        "No work without a permit complaints in the last 12 months at the one complex in Austin.",
      ),
    ).toBeVisible();
  });
});

it("leaves out a complex whose complaints in the period were all closed as duplicates", () => {
  const duplicatesOnly = complex("400", {
    address: "2606 Wheless Ln",
    tally: { m12: {}, y2: {}, y3: { structure: { none: 25 } } },
    duplicates: { m12: 4, y2: 4, y3: 6 },
  });
  renderList([duplicatesOnly, busy]);

  expect(screen.queryByText("2606 Wheless Ln")).toBeNull();
  expect(screen.getByText("1 with no complaints")).toBeVisible();
});

it("leaves out, and counts, a complex whose tally has nothing for the period, with no NaN or undefined", () => {
  renderList([
    complex("1", { address: "1 Empty Ln" }),
    complex("2", { address: "2 Missing Ln", tally: {} as Complex["tally"] }),
    busy,
  ]);

  expect(screen.getAllByTestId("card")).toHaveLength(1);
  expect(screen.getByText("2 with no complaints")).toBeVisible();
  expect(document.body.textContent).not.toMatch(/NaN|undefined/);
});

it("never renders the words score, grade, rating, rank or code case", () => {
  renderList(sample);
  expect(document.body.textContent).not.toMatch(
    /score|grade|rating|rank|code case/i,
  );
});

describe("in pages of 40", () => {
  const many = Array.from({ length: 95 }, (_, index) =>
    complex(String(index), { tally: everyPeriod({ structure: { none: 1 } }) }),
  );

  it("shows 40 cards and reveals 40 more each time Show 40 more is pressed", async () => {
    renderList(many);
    expect(screen.getAllByTestId("card")).toHaveLength(40);
    expect(screen.getByText("Showing 40 of 95")).toBeVisible();
    expect(screen.queryByText(/zoom in/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show 40 more" }));
    expect(screen.getAllByTestId("card")).toHaveLength(80);

    await userEvent.click(screen.getByRole("button", { name: "Show 40 more" }));
    expect(screen.getAllByTestId("card")).toHaveLength(95);
    expect(screen.queryByRole("button", { name: "Show 40 more" })).toBeNull();
    expect(screen.getByText("Showing all 95")).toBeVisible();
  });

  it("pages through complexes with complaints only, and says how many in Austin have none", () => {
    renderList([...many, clean, complex("quiet", { address: "2 Quiet Ln" })]);

    expect(
      screen.getByRole("region", { name: "97 complexes in Austin" }),
    ).toBeVisible();
    expect(screen.getByText("Showing 40 of 95")).toBeVisible();
    expect(screen.getByText("2 with no complaints")).toBeVisible();
  });

  it("offers no more when everything already fits", () => {
    renderList(sample);
    expect(screen.queryByRole("button", { name: "Show 40 more" })).toBeNull();
  });

  it("starts again at 40 when the filters or order change", async () => {
    const { again } = renderList(many);
    await userEvent.click(screen.getByRole("button", { name: "Show 40 more" }));
    expect(screen.getAllByTestId("card")).toHaveLength(80);

    again({ ...DEFAULT_VIEW, order: "most" });
    expect(screen.getAllByTestId("card")).toHaveLength(40);
  });
});

it("has no area shortcuts and names the whole city", () => {
  renderList(sample);
  expect(
    screen.queryByRole("navigation", { name: "Jump to an area" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Downtown" })).toBeNull();
  expect(
    screen.getByRole("region", { name: "3 complexes in Austin" }),
  ).toBeVisible();
});

it("separates thousands in a card's figure and outcome line, as the record panel does", () => {
  renderList([
    complex("1", {
      address: "1 Busy Ln",
      tally: everyPeriod({ structure: { violation: 1200, none: 34 } }),
    }),
  ]);
  expect(card("1 Busy Ln").getByText("1,234")).toBeVisible();
  expect(
    card("1 Busy Ln").getByText("1,200 confirmed, 34 none found"),
  ).toHaveAttribute(
    "title",
    "1,200 violations confirmed, 34 no violation found",
  );
});
