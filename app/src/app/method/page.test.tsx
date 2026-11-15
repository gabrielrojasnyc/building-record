import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Meta } from "@/domain/types";
import { readDataFile } from "../dataFiles";
import MethodPage from "./page";

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
  periodStarts: { m12: "2025-11-14", y2: "2024-11-14", y3: "2023-11-14" },
  duplicateCases: 0,
  unrecognizedOutcomes: 0,
  skippedDeficiencies: 0,
};

vi.mock("../dataFiles", () => ({
  readDataFile: vi.fn(async () => meta),
}));

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

  expect(screen.getByText(/This copy has 2,498 complexes/)).toBeVisible();
  expect(screen.getByText(/About 13% of the city's cases/)).toBeVisible();
  expect(screen.getByText(/17,602 cases/)).toBeVisible();
  expect(screen.getByText("This copy of the data was pulled on November 14, 2026.")).toBeVisible();
});

it("links and names all five sources, with the map credit", async () => {
  await renderPage();

  const sources = {
    "Land Use Inventory": "https://data.austintexas.gov/d/7vsm-dvxg",
    Addresses: "https://data.austintexas.gov/d/9s7j-tygf",
    "Austin Code Complaint Cases": "https://data.austintexas.gov/d/6wtj-zbtb",
    "Repeat Offender Registrations": "https://data.austintexas.gov/d/86z9-i27i",
    "Austin 311 Public Data": "https://data.austintexas.gov/d/xwdj-i9he",
  };
  for (const [name, href] of Object.entries(sources)) {
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  expect(screen.getByText(/All five datasets are published by the City of Austin/)).toBeVisible();
  expect(document.body.textContent).not.toMatch(/Affordable Housing|CC BY-SA|six datasets/);
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

it("explains why counts are not shown per unit", async () => {
  await renderPage();

  expect(
    screen.getByText(
      "Buildings are shown by raw case count with the size of their parcel, not as cases per unit. The city does not publish unit counts for most of these buildings, so a per-unit rate cannot be shown.",
    ),
  ).toBeVisible();
});

it("gives the city's own term for all four categories", async () => {
  await renderPage();

  for (const line of [
    "Structure condition (the city's term is Structure Condition Violation)",
    "Property upkeep (the city's term is Property Abatement)",
    "Land use (the city's term is Land Use Violation)",
    "Work without permit (the city's term is Work Without Permit)",
  ]) {
    expect(screen.getByText(line)).toBeVisible();
  }
});

it("makes only the claims the data supports", async () => {
  await renderPage();

  const text = document.body.textContent ?? "";
  expect(text).toContain("not endorsed by the City of Austin");
  for (const removed of [
    "has not reviewed",
    "reported or found",
    "closest match",
    "who was at fault",
    "whether the problem was real",
    "unreliable for the rest",
  ]) {
    expect(text).not.toContain(removed);
  }
});

it("says the open figure covers the same history as everything else", async () => {
  await renderPage();
  expect(screen.getByText(/The "open now" figure counts only cases opened since November 2023\./)).toBeVisible();
});

it("describes each of the four ways a building is labelled", async () => {
  await renderPage();

  const labelling = screen.getByRole("heading", { name: "How a building is labelled" }).parentElement;
  expect(labelling).toHaveTextContent("a city address point that falls inside the parcel");
  expect(labelling).toHaveTextContent("a whole address is used before a fractional one such as 310 1/2 Comal St, then the lowest street number");
  expect(labelling).toHaveTextContent("the address the city registered it under");
  expect(labelling).toHaveTextContent(
    "its city parcel ID and the nearest address point within 150 meters, such as Parcel 0123456789, near 100 Main St. That address may belong to a neighbor.",
  );
  expect(labelling).toHaveTextContent("the label is the parcel ID alone");
  expect(labelling).not.toHaveTextContent("the city address point inside its parcel, or");
});

it("says parcels sharing an address are shown as one complex", async () => {
  await renderPage();

  const complexes = screen.getByRole("heading", { name: "What counts as a complex" }).parentElement;
  expect(complexes).toHaveTextContent("parcels that share an address are shown as one complex");
  expect(complexes).toHaveTextContent("within 250 meters of one another");
  expect(complexes).not.toHaveTextContent("Neighboring parcels are not merged");
});

it("says how many cases carry an unrecognized description, only when there are some", async () => {
  await renderPage();
  expect(document.body.textContent).not.toContain("does not recognize");

  vi.mocked(readDataFile).mockResolvedValueOnce({ ...meta, uncategorizedCases: 12 });
  render(await MethodPage());
  expect(
    screen.getByText(/12 cases carry a description this site does not recognize and are not counted\./),
  ).toBeVisible();
});
