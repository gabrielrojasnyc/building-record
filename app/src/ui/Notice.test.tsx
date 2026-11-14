import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Meta } from "@/domain/types";
import { Notice } from "./Notice";

const meta: Meta = {
  pulledAt: "2026-11-14",
  since: "2023-11-01",
  complexCount: 2498,
  caseCount: 17602,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
  futureDatedCases: 0,
  skippedParcelRows: 0,
  namedComplexes: 0,
  namesAsOf: null,
};

it("says the site is not official, gives the pull date and links to the method page", () => {
  render(<Notice meta={meta} />);

  expect(screen.getByText(/Not an official City of Austin site/)).toBeVisible();
  expect(screen.getByText(/Data pulled November 14, 2026/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Method and sources" })).toHaveAttribute("href", "/method");
});
