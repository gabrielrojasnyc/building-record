import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Outcome } from "@/domain/outcomes";
import { OutcomeSummary } from "./OutcomeSummary";

const NONE: Record<Outcome, number> = {
  violation: 0,
  fixed: 0,
  none: 0,
  other: 0,
  open: 0,
};

const rows = () =>
  screen.queryAllByRole("listitem").map((row) => row.textContent);

describe("OutcomeSummary", () => {
  it("lists each outcome with complaints, in the city's order, and leaves out the empty ones", () => {
    render(
      <OutcomeSummary
        split={{ violation: 119, fixed: 1, none: 78, other: 3, open: 0 }}
        violationsOpen={0}
        duplicates={0}
      />,
    );
    expect(rows()).toEqual([
      "Violation confirmed119",
      "Fixed at inspection1",
      "No violation found78",
      "Referred or closed without a finding3",
    ]);
  });

  it("says how many confirmed violations are still open, only when some are", () => {
    render(
      <OutcomeSummary
        split={{ ...NONE, violation: 119, none: 2 }}
        violationsOpen={19}
        duplicates={0}
      />,
    );
    expect(rows()[0]).toBe("Violation confirmed19 still open119");
  });

  it("says nothing about open violations while that is not known", () => {
    render(
      <OutcomeSummary
        split={{ ...NONE, violation: 4 }}
        violationsOpen={null}
        duplicates={0}
      />,
    );
    expect(rows()).toEqual(["Violation confirmed4"]);
  });

  it("separates thousands in its counts", () => {
    render(
      <OutcomeSummary
        split={{ ...NONE, none: 1234 }}
        violationsOpen={0}
        duplicates={0}
      />,
    );
    expect(rows()).toEqual(["No violation found1,234"]);
  });

  it("says how many duplicate reports were left out, in the singular for one", () => {
    render(
      <OutcomeSummary
        split={{ ...NONE, none: 2 }}
        violationsOpen={0}
        duplicates={43}
      />,
    );
    expect(screen.getByText("43 duplicate reports not counted")).toBeVisible();

    render(
      <OutcomeSummary
        split={{ ...NONE, none: 2 }}
        violationsOpen={0}
        duplicates={1}
      />,
    );
    expect(screen.getByText("1 duplicate report not counted")).toBeVisible();
  });

  it("with only duplicates, says so without an empty list", () => {
    render(<OutcomeSummary split={NONE} violationsOpen={0} duplicates={3} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("3 duplicate reports not counted")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("draws nothing at all when there is nothing to say", () => {
    const { container } = render(
      <OutcomeSummary split={NONE} violationsOpen={null} duplicates={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
