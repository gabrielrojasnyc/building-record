import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DEFAULT_VIEW } from "@/domain/query";
import { Filters } from "./Filters";

it("offers the three periods, shortest first, and marks the active one", () => {
  render(
    <Filters view={{ ...DEFAULT_VIEW, period: "y2" }} onChange={vi.fn()} />,
  );
  const periods = within(screen.getByRole("group", { name: "Period" }));
  expect(
    periods.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["12 months", "2 years", "3 years"]);
  expect(periods.getByRole("button", { name: "2 years" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(periods.getByRole("button", { name: "12 months" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("reports a change of period", async () => {
  const onChange = vi.fn();
  render(<Filters view={DEFAULT_VIEW} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "3 years" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, period: "y3" });
  await userEvent.click(screen.getByRole("button", { name: "2 years" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, period: "y2" });
});

it("reports a complaint type and keeps the rest of the view", async () => {
  const onChange = vi.fn();
  const view = {
    ...DEFAULT_VIEW,
    period: "y3" as const,
    order: "most" as const,
  };
  render(<Filters view={view} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "Permits" }));
  expect(onChange).toHaveBeenCalledWith({ ...view, category: "permit" });
});

it("names each complaint type in one word, and gives its full name and what it covers on hover", () => {
  render(<Filters view={DEFAULT_VIEW} onChange={vi.fn()} />);
  const types = within(screen.getByRole("group", { name: "Complaint type" }));
  expect(types.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "All",
    "Building",
    "Grounds",
    "Zoning",
    "Permits",
  ]);
  expect(types.getByRole("button", { name: "All" })).not.toHaveAttribute("title");
  expect(types.getByRole("button", { name: "Grounds" })).toHaveAttribute(
    "title",
    "Trash and grounds: The land around them: trash, dumping, overgrowth and other unsanitary conditions.",
  );
  expect(types.getByRole("button", { name: "Building" })).toHaveAttribute(
    "title",
    expect.stringMatching(/^Building condition: The buildings themselves: /),
  );
  expect(types.getByRole("button", { name: "Zoning" })).toHaveAttribute(
    "title",
    expect.stringMatching(/^Signs, zoning and use: Site rules: /),
  );
  expect(types.getByRole("button", { name: "Permits" })).toHaveAttribute(
    "title",
    expect.stringMatching(/^Work without a permit: Construction, repair or demolition /),
  );
});

it("toggles Repeat Offenders only", async () => {
  const onChange = vi.fn();
  const view = { ...DEFAULT_VIEW, repeatOffendersOnly: true };
  render(<Filters view={view} onChange={onChange} />);
  const toggle = screen.getByRole("button", { name: "Repeat Offenders" });
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(toggle);
  expect(onChange).toHaveBeenCalledWith({
    ...view,
    repeatOffendersOnly: false,
  });
});

it("never says code case, and no longer offers Since Nov 2023", () => {
  render(<Filters view={DEFAULT_VIEW} onChange={vi.fn()} />);
  expect(document.body.textContent).not.toMatch(/code case|since/i);
});
