import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { Complex, Tally } from "@/domain/types";
import { InViewBar } from "./InViewBar";

function complex(id: string, tally: Tally = {}): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 2.4,
    open: 0,
    tally: { m12: tally, y2: tally, y3: tally },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    repeatOffender: null,
  };
}

const clean = complex("100");
const busy = complex("200", {
  structure: { none: 1 },
  property: { violation: 3 },
});
const single = complex("300", { landuse: { fixed: 1 } });
const sample = [clean, busy, single];

const onJump = vi.fn();

function renderBar(
  complexes: Complex[],
  view: View = DEFAULT_VIEW,
  awaitingView = false,
) {
  render(
    <InViewBar
      complexes={complexes}
      view={view}
      awaitingView={awaitingView}
      onJump={onJump}
    />,
  );
}

it("counts the complexes in view and, beside them, those with no complaints, with no cards and no order", () => {
  renderBar(sample);

  expect(
    screen.getByRole("region", { name: "3 complexes in view" }),
  ).toBeVisible();
  expect(screen.getByText("1 with no complaints")).toBeVisible();
  expect(screen.queryAllByTestId("card")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /first$/ })).toBeNull();
});

it("says nothing about complexes with no complaints when every one in view has one", () => {
  renderBar([busy, single]);
  expect(screen.queryByText(/with no complaints/)).toBeNull();
});

it("under a type filter, counts those with none of that type", () => {
  renderBar(sample, { ...DEFAULT_VIEW, category: "permit" });
  expect(screen.getByText("3 with none of this type")).toBeVisible();
});

it("lets the count speak for an empty view, with no message in place of cards", () => {
  renderBar([]);
  expect(
    screen.getByRole("region", { name: "0 complexes in view" }),
  ).toBeVisible();
  expect(screen.queryByText(/No apartment complexes/)).toBeNull();
});

it("lets the count speak for a view with no complaints, with no message in place of cards", () => {
  renderBar(Array.from({ length: 12 }, (_, index) => complex(String(index))));
  expect(
    screen.getByRole("region", { name: "12 complexes in view" }),
  ).toBeVisible();
  expect(screen.getByText("12 with no complaints")).toBeVisible();
  expect(screen.queryByText(/^No complaints/)).toBeNull();
});

it("names a single complex in the singular", () => {
  renderBar([busy]);
  expect(
    screen.getByRole("region", { name: "1 complex in view" }),
  ).toBeVisible();
});

it("counts every complex in Austin until the map says what it shows", () => {
  renderBar(sample, DEFAULT_VIEW, true);
  expect(
    screen.getByRole("region", { name: "3 complexes in Austin" }),
  ).toBeVisible();
  expect(
    screen.getByRole("navigation", { name: "Jump to an area" }),
  ).toBeVisible();
});

it("reports an area jump, with how close the map should stand over it", async () => {
  renderBar(sample);
  await userEvent.click(screen.getByRole("button", { name: "East Riverside" }));
  expect(onJump).toHaveBeenCalledWith({
    name: "East Riverside",
    lon: -97.725,
    lat: 30.237,
    zoom: 15.3,
  });
});

it("hands the screen its count line, which takes focus only from a script", () => {
  const countRef = createRef<HTMLParagraphElement>();
  render(
    <InViewBar
      complexes={sample}
      view={DEFAULT_VIEW}
      awaitingView={false}
      countRef={countRef}
      onJump={onJump}
    />,
  );
  const region = screen.getByRole("region", { name: "3 complexes in view" });
  expect(countRef.current?.id).toBe(region.getAttribute("aria-labelledby"));
  expect(countRef.current).toHaveAttribute("tabindex", "-1");
});

it("never renders the words score, grade, rating, rank or code case", () => {
  renderBar(sample);
  expect(document.body.textContent).not.toMatch(
    /score|grade|rating|rank|code case/i,
  );
});
