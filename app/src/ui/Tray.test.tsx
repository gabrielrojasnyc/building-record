import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { Complex, Counts } from "@/domain/types";
import { Tray } from "./Tray";

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

function complex(id: string, overrides: Partial<Complex> = {}): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    lon: -97.74,
    lat: 30.27,
    acres: 2.4,
    cases12: counts(),
    cases: counts(),
    open: 0,
    lastCase: null,
    repeatOffender: null,
    ...overrides,
  };
}

const handlers = {
  onSelect: vi.fn(),
  onHover: vi.fn(),
  onToggleOrder: vi.fn(),
  onJump: vi.fn(),
};

const clean = complex("100", { address: "1107 W Gibson St" });
const busy = complex("200", {
  address: "909 S Lamar Blvd",
  cases12: counts({ structure: 1, property: 3 }),
  repeatOffender: {
    name: "Lamar Flats",
    units: 120,
    activeViolations: 4,
    totalViolations: 40,
  },
});
const single = complex("300", { cases12: counts({ landuse: 1 }) });
const sample = [clean, busy, single];

function renderTray(complexes: Complex[], view: View = DEFAULT_VIEW) {
  render(
    <Tray
      complexes={complexes}
      {...handlers}
      view={view}
      selectedId={null}
      hoveredId={null}
    />,
  );
}

function card(address: string) {
  const match = screen
    .getAllByTestId("card")
    .find((element) => element.textContent?.includes(address));
  if (!match) throw new Error(`No card for ${address}`);
  return within(match);
}

it("shows None for a complex with no cases and the count otherwise", () => {
  renderTray(sample);

  expect(card("1107 W Gibson St").getByText("None")).toBeVisible();
  expect(card("1107 W Gibson St").getByText("no cases on file")).toBeVisible();
  expect(card("1107 W Gibson St").getByText("2.4 acres")).toBeVisible();

  expect(card("909 S Lamar Blvd").getByText("4")).toBeVisible();
  expect(card("909 S Lamar Blvd").getByText("code cases")).toBeVisible();
  expect(
    card("909 S Lamar Blvd").getByText("Mostly property upkeep"),
  ).toBeVisible();

  expect(card("300 Main St").getByText("code case")).toBeVisible();
  expect(card("300 Main St").getByText("Mostly land use")).toBeVisible();
});

describe("the line under the address, with every complaint type counted", () => {
  const line = (cases12: Partial<Counts>) => {
    renderTray([complex("1", { address: "1 Mix Ln", cases12: counts(cases12) })]);
    return card("1 Mix Ln");
  };

  it("says Mostly only when one type has more than half the cases", () => {
    expect(line({ property: 5, structure: 1 }).getByText("Mostly property upkeep")).toBeVisible();
  });

  it("names both types, in the fixed order, on a one and one split", () => {
    expect(line({ property: 1, structure: 1 }).getByText("Structure condition and property upkeep")).toBeVisible();
  });

  it("names the two largest types, largest first, when the largest has half or less", () => {
    expect(line({ landuse: 3, permit: 2, property: 2 }).getByText("Land use and property upkeep")).toBeVisible();
    expect(line({ structure: 2, property: 1, landuse: 1 }).queryByText(/^Mostly/)).toBeNull();
  });
});

it("says a sliver parcel is under a tenth of an acre", () => {
  renderTray([complex("1", { address: "1 Sliver Ln", acres: 0 })]);
  expect(card("1 Sliver Ln").getByText("under 0.1 acres")).toBeVisible();
});

it("caps the tray at 40 cards and says how many more are in view", () => {
  renderTray(Array.from({ length: 45 }, (_, index) => complex(String(index))));

  expect(
    screen.getByRole("region", { name: "45 complexes in view" }),
  ).toBeVisible();
  expect(screen.getAllByTestId("card")).toHaveLength(40);
  expect(
    screen.getByText("5 more in view. Zoom in to narrow them down."),
  ).toBeVisible();
});

it("shows the empty message when nothing is in view", () => {
  renderTray([]);

  expect(
    screen.getByRole("region", { name: "0 complexes in view" }),
  ).toBeVisible();
  expect(screen.queryAllByTestId("card")).toHaveLength(0);
  expect(
    screen.getByText(
      "No apartment complexes in this part of the map. Zoom out or jump to an area.",
    ),
  ).toBeVisible();
});

it("tags Repeat Offender properties", () => {
  renderTray(sample);

  expect(card("909 S Lamar Blvd").getByText("Repeat Offender")).toBeVisible();
  expect(card("1107 W Gibson St").queryByText("Repeat Offender")).toBeNull();
});

it("counts every complex in Austin until the map says what it shows", () => {
  render(
    <Tray
      awaitingView
      complexes={sample}
      {...handlers}
      view={DEFAULT_VIEW}
      selectedId={null}
      hoveredId={null}
    />,
  );
  expect(screen.getByRole("region", { name: "3 complexes in Austin" })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Jump to an area" })).toBeVisible();
});

it("names a single complex in the singular", () => {
  renderTray([busy]);

  expect(
    screen.getByRole("region", { name: "1 complex in view" }),
  ).toBeVisible();
});

it("reports a chosen card, the order toggle and an area jump", async () => {
  renderTray(sample);

  await userEvent.click(screen.getAllByTestId("card")[1]);
  expect(handlers.onSelect).toHaveBeenCalledWith("200");

  await userEvent.click(screen.getByRole("button", { name: "Fewest first" }));
  expect(handlers.onToggleOrder).toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "East Riverside" }));
  expect(handlers.onJump).toHaveBeenCalledWith({
    name: "East Riverside",
    lon: -97.725,
    lat: 30.237,
  });
});

describe("with one complaint type selected", () => {
  const permitsOnly: View = { ...DEFAULT_VIEW, category: "permit" };

  it("counts that type and names it as the only one counted", () => {
    renderTray(
      [
        complex("1", { address: "1 Permit Ln", cases12: counts({ permit: 3, property: 10 }) }),
        complex("2", { address: "2 Permit Ln", cases12: counts({ permit: 1 }) }),
      ],
      permitsOnly,
    );

    expect(card("1 Permit Ln").getByText("3")).toBeVisible();
    expect(card("1 Permit Ln").getByText("code cases")).toBeVisible();
    expect(card("1 Permit Ln").getByText("Work without permit only")).toBeVisible();
    expect(card("2 Permit Ln").getByText("code case")).toBeVisible();
    expect(card("2 Permit Ln").getByText("Work without permit only")).toBeVisible();
  });

  it("shows None for that type and how many cases of other types remain", () => {
    renderTray(
      [
        complex("1", { address: "1 Upkeep Ln", cases12: counts({ property: 2, landuse: 1 }) }),
        complex("2", { address: "2 Upkeep Ln", cases12: counts({ structure: 1 }) }),
      ],
      permitsOnly,
    );

    expect(card("1 Upkeep Ln").getByText("None")).toBeVisible();
    expect(card("1 Upkeep Ln").getByText("no work without permit cases")).toBeVisible();
    expect(card("1 Upkeep Ln").getByText("3 other cases")).toBeVisible();
    expect(card("2 Upkeep Ln").getByText("1 other case")).toBeVisible();
  });

  it("falls back to acres when the building has no cases at all", () => {
    renderTray([clean], permitsOnly);

    expect(card("1107 W Gibson St").getByText("None")).toBeVisible();
    expect(card("1107 W Gibson St").getByText("no work without permit cases")).toBeVisible();
    expect(card("1107 W Gibson St").getByText("2.4 acres")).toBeVisible();
  });

  it("counts other types in the selected period only", () => {
    renderTray(
      [complex("1", { address: "1 Old Case Ln", cases: counts({ property: 4 }) })],
      permitsOnly,
    );

    expect(card("1 Old Case Ln").getByText("2.4 acres")).toBeVisible();
  });
});

it("never renders the words score, grade, rating or rank", () => {
  render(
    <Tray
      complexes={sample}
      {...handlers}
      view={DEFAULT_VIEW}
      selectedId={null}
      hoveredId={null}
    />,
  );
  expect(document.body.textContent).not.toMatch(/score|grade|rating|rank/i);
});

describe("as a citywide list, for a device with no map", () => {
  const many = Array.from({ length: 95 }, (_, index) => complex(String(index)));

  function renderList(complexes: Complex[], view: View = DEFAULT_VIEW) {
    const utils = render(
      <Tray
        citywide
        complexes={complexes}
        {...handlers}
        view={view}
        selectedId={null}
        hoveredId={null}
      />,
    );
    return {
      ...utils,
      again: (next: View) =>
        utils.rerender(
          <Tray
            citywide
            complexes={complexes}
            {...handlers}
            view={next}
            selectedId={null}
            hoveredId={null}
          />,
        ),
    };
  }

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

  it("drops the area shortcuts and names the whole city", () => {
    renderList(sample);
    expect(screen.queryByRole("navigation", { name: "Jump to an area" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Downtown" })).toBeNull();
    expect(screen.getByRole("region", { name: "3 complexes in Austin" })).toBeVisible();
  });
});
