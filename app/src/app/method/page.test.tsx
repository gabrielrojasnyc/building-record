import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Complex, Meta } from "@/domain/types";
import MethodPage from "./page";

const meta: Meta = {
  pulledAt: "2026-11-14",
  since: "2023-11-01",
  complexCount: 2498,
  caseCount: 17602,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
};

const counts = { structure: 0, property: 0, landuse: 0, permit: 0 };
const complex = (id: string, units: Complex["units"]): Complex => ({
  id,
  parcelIds: [id],
  address: id,
  lon: 0,
  lat: 0,
  acres: 1,
  cases12: counts,
  cases: counts,
  open: 0,
  lastCase: null,
  repeatOffender: null,
  units,
});
const complexes = [
  complex("a", { count: 100, source: "repeat-offender" }),
  complex("b", null),
  complex("c", { count: 40, source: "affordable-housing" }),
  complex("d", null),
  complex("e", null),
];

vi.mock("../dataFiles", () => ({
  readDataFile: vi.fn(async (name: string) => (name === "meta.json" ? meta : complexes)),
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

it("says how many complexes have a published unit count, from the data", async () => {
  await renderPage();

  expect(
    screen.getByText(/The city publishes a unit count for 2 of these 2,498 complexes, so a per-unit rate cannot be shown for most\./),
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

it("describes each of the four ways a building is labelled", async () => {
  await renderPage();

  const labelling = screen.getByRole("heading", { name: "How a building is labelled" }).parentElement;
  expect(labelling).toHaveTextContent("a city address point that falls inside the parcel");
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
