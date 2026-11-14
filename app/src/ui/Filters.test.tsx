import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DEFAULT_VIEW } from "@/domain/query";
import { Filters } from "./Filters";

it("marks the active period and reports a change", async () => {
  const onChange = vi.fn();
  render(<Filters view={DEFAULT_VIEW} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "Since Nov 2023" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, period: "cases" });
});

it("reports a complaint type and keeps the rest of the view", async () => {
  const onChange = vi.fn();
  const view = {
    ...DEFAULT_VIEW,
    period: "cases" as const,
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
