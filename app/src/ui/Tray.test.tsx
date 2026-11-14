import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DEFAULT_VIEW } from "@/domain/query";
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
    address: `${id} Main St`,
    lon: -97.74,
    lat: 30.27,
    acres: 2.4,
    cases12: counts(),
    cases: counts(),
    open: 0,
    lastCase: null,
    repeatOffender: null,
    units: null,
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

function renderTray(complexes: Complex[]) {
  render(
    <Tray
      complexes={complexes}
      {...handlers}
      view={DEFAULT_VIEW}
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
