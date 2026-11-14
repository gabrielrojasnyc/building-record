import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Meta } from "@/domain/types";
import MethodPage from "./page";

const meta: Meta = {
  pulledAt: "2026-11-14",
  since: "2023-11-01",
  complexCount: 2498,
  caseCount: 17602,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
};

vi.mock("../dataFiles", () => ({ readDataFile: vi.fn(async () => meta) }));

async function renderPage() {
  render(await MethodPage());
}

it("starts with a way back to the map and has one h1 over a plain heading order", async () => {
  await renderPage();

  expect(screen.getAllByRole("link")[0]).toHaveTextContent("Back to the map");
  expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Method and sources");
  expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
});

it("reads the numbers it names from the data", async () => {
  await renderPage();

  expect(screen.getByText(/2,498 complexes/)).toBeVisible();
  expect(screen.getByText(/About 13% of the city's cases/)).toBeVisible();
  expect(screen.getByText(/17,602 cases/)).toBeVisible();
  expect(screen.getByText("This copy of the data was pulled on November 14, 2026.")).toBeVisible();
});

it("links and names every source, with the license and the map credit", async () => {
  await renderPage();

  const sources = {
    "Land Use Inventory": "https://data.austintexas.gov/d/7vsm-dvxg",
    Addresses: "https://data.austintexas.gov/d/9s7j-tygf",
    "Austin Code Complaint Cases": "https://data.austintexas.gov/d/6wtj-zbtb",
    "Repeat Offender Registrations": "https://data.austintexas.gov/d/86z9-i27i",
    "Affordable Housing Inventory": "https://data.austintexas.gov/d/ifzc-3xz8",
    "Austin 311 Public Data": "https://data.austintexas.gov/d/xwdj-i9he",
  };
  for (const [name, href] of Object.entries(sources)) {
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by-sa/4.0/",
  );
  expect(
    screen.getByText(/Map data is from OpenStreetMap contributors, delivered through OpenMapTiles and OpenFreeMap/),
  ).toBeVisible();
});

it("carries the caution and says what the site is not", async () => {
  await renderPage();

  expect(
    screen.getByText("No cases means none reached Code Enforcement. It does not mean the building has no problems."),
  ).toBeVisible();
  expect(screen.getByText(/not a City of Austin site/i)).toBeVisible();
  expect(screen.getByText(/do not say whether a case was about pests, mold/)).toBeVisible();
  expect(screen.getByText(/The data comes with no warranty/)).toBeVisible();
});

it("uses no score language, em dashes or double dashes", async () => {
  await renderPage();

  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/score|grade|rating|rank/i);
  expect(text).not.toMatch(/—|--/);
});
