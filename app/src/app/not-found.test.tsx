import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Meta } from "@/domain/types";
import NotFound from "./not-found";

const meta: Meta = {
  pulledAt: "2026-11-14",
  since: "2023-11-01",
  complexCount: 2420,
  caseCount: 17602,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
  futureDatedCases: 0,
  skippedParcelRows: 0,
};

vi.mock("./dataFiles", () => ({ readDataFile: vi.fn(async () => meta) }));

it("says the page does not exist, leads back to the map and carries the notice", async () => {
  render(await NotFound());

  expect(screen.getByRole("heading", { level: 1, name: "That page does not exist." })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to the map" })).toHaveAttribute("href", "/");
  expect(screen.getByText(/Not an official City of Austin site/)).toBeVisible();
  expect(screen.getByText(/Data pulled November 14, 2026/)).toBeVisible();
});
