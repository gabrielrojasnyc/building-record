import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { forgetBuildingDetails } from "@/city/buildingDetail";
import type { ViewArea } from "@/domain/query";
import type { BuildingDetail, Complex, Counts, Meta } from "@/domain/types";
import type { BuildingMapProps, CameraPadding } from "@/map/BuildingMap";
import { Finder } from "./Finder";

const { mapRenders } = vi.hoisted(() => ({
  mapRenders: [] as BuildingMapProps[],
}));

// MapLibre cannot start here, so the map is a stand-in that records what the screen asks of it on every render.
vi.mock("next/dynamic", () => ({
  default: () =>
    function RecordedMap(props: BuildingMapProps) {
      mapRenders.push(props);
      return <div data-testid="map" />;
    },
}));

const NORMAL_PADDING: CameraPadding = {
  top: 80,
  right: 0,
  bottom: 243,
  left: 0,
};
const SELECTION_PADDING: CameraPadding = {
  top: 110,
  right: 440,
  bottom: 250,
  left: 70,
};

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

function complex(id: string, overrides: Partial<Complex>): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 2,
    cases12: counts(),
    cases: counts(),
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    lastCase: null,
    repeatOffender: null,
    ...overrides,
  };
}

const array = complex("0307050309", {
  address: "2000 Burton Dr",
  name: { text: "Array Apartments", source: "openstreetmap" },
  lon: -97.73,
  lat: 30.23,
  cases12: counts({ property: 3 }),
});
const crest = complex("0304070701", {
  address: "1601 Royal Crest Dr",
  lon: -97.729,
  lat: 30.238,
});
const domain = complex("0250010101", {
  address: "11800 Domain Blvd",
  lon: -97.72,
  lat: 30.4,
});
const everything = [array, crest, domain];

function box(
  west: number,
  south: number,
  east: number,
  north: number,
): ViewArea {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}
const RIVERSIDE = box(-97.75, 30.22, -97.7, 30.25);
const NORTH = box(-97.75, 30.38, -97.7, 30.42);

function detailFor({ id, lon, lat }: Complex): BuildingDetail {
  const ring: [number, number][] = [
    [lon - 0.001, lat - 0.001],
    [lon + 0.001, lat - 0.001],
    [lon + 0.001, lat + 0.001],
    [lon - 0.001, lat - 0.001],
  ];
  return {
    id,
    monthly: [{ month: "2026-11", count: 0 }],
    latest: [],
    complaints: [],
    deficiencies: [],
    outline: [[ring]],
    bbox: [lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001],
  };
}

/** Answers each building file with its detail, or with the status given for it. The city's live APIs are never answered. */
function serveBuildingFiles(failing: Record<string, number> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://")) return new Promise<Response>(() => {});
      const id = /\/data\/buildings\/(.+)\.json$/.exec(url)?.[1];
      const found = everything.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`Unexpected fetch: ${url}`);
      if (failing[found.id])
        return new Response("", { status: failing[found.id] });
      return Response.json(detailFor(found));
    }),
  );
}

function setScreen({
  phone,
  height = 900,
}: {
  phone: boolean;
  height?: number;
}) {
  vi.stubGlobal("innerHeight", height);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: phone && query === "(max-width: 760px)",
    addEventListener() {},
    removeEventListener() {},
  }));
}

const meta: Meta = {
  pulledAt: "2026-11-14",
  since: "2023-11-01",
  complexCount: 3,
  caseCount: 3,
  unmatchedCaseShare: 0.131,
  uncategorizedCases: 0,
  futureDatedCases: 0,
  skippedParcelRows: 0,
  namedComplexes: 1,
  namesAsOf: "2026-11-14",
  periodStarts: { m12: "2025-11-14", y2: "2024-11-14", y3: "2023-11-14" },
  duplicateCases: 0,
  unrecognizedOutcomes: 0,
  skippedDeficiencies: 0,
};

function lastMap(): BuildingMapProps {
  const props = mapRenders.at(-1);
  if (!props) throw new Error("The map has not rendered");
  return props;
}

const reportView = (area: ViewArea) =>
  act(() => lastMap().onViewAreaChange(area));
const cardIds = () =>
  screen.getAllByTestId("card").map((card) => card.dataset.complexId);

async function pick(target: Complex) {
  const card = screen
    .getAllByTestId("card")
    .find((element) => element.dataset.complexId === target.id);
  if (!card) throw new Error(`No card for ${target.id}`);
  await userEvent.click(card);
}

const staged = (target: Complex) =>
  waitFor(() => expect(lastMap().spotlight?.id).toBe(target.id));

function openFinder() {
  render(<Finder complexes={everything} meta={meta} />);
  reportView(RIVERSIDE);
}

beforeEach(() => {
  mapRenders.length = 0;
  forgetBuildingDetails();
  setScreen({ phone: false });
  serveBuildingFiles();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The model and the selection padding travel together: no render has one without the other.
  // Only the selection padding, on a desktop or a phone, keeps room at the sides.
  for (const props of mapRenders) {
    expect(props.padding?.right !== 0).toBe(Boolean(props.spotlight));
  }
});

it("stages a picked building on the map once its outline is known, with the selection padding in the same render, and leaves the camera to the map", async () => {
  openFinder();
  await pick(array);
  await staged(array);

  expect(lastMap().spotlight).toEqual({
    id: array.id,
    title: "Array Apartments",
    lon: array.lon,
    lat: array.lat,
    outline: detailFor(array).outline,
  });
  for (const props of mapRenders) {
    expect(props.padding).toEqual(
      props.spotlight ? SELECTION_PADDING : NORMAL_PADDING,
    );
    expect(props.flyTo).toBeNull();
  }
  expect(document.querySelector(".fog")).toHaveClass("fog-spotlight");
});

it("on a phone, frames the model above a record sheet 60% of the screen tall, as tall as the screen is now", async () => {
  setScreen({ phone: true, height: 812 });
  openFinder();
  await pick(array);
  await staged(array);
  expect(lastMap().padding).toEqual({ top: 190, right: 30, bottom: 507, left: 30 });

  // Turned to landscape, or a window made shorter: the map frames the model again in the new strip.
  vi.stubGlobal("innerHeight", 700);
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(lastMap().padding).toEqual({ top: 190, right: 30, bottom: 440, left: 30 });
});

it("keeps the tray on the ground it was counting while a building is open, and until the camera is back from it", async () => {
  openFinder();
  expect(cardIds()).toEqual([crest.id, array.id]);
  await pick(array);
  await staged(array);

  // The turning camera keeps reporting new ground.
  reportView(NORTH);
  expect(cardIds()).toEqual([crest.id, array.id]);
  expect(
    screen.getByRole("region", { name: "2 complexes in view" }),
  ).toBeVisible();

  // Closing, the camera eases back from the model's ground to where it was, and only then does the tray follow the map.
  await userEvent.keyboard("{Escape}");
  reportView(NORTH);
  expect(cardIds()).toEqual([crest.id, array.id]);
  expect(screen.getAllByTestId("card")[1]).toHaveFocus();
  reportView(RIVERSIDE);
  reportView(NORTH);
  expect(cardIds()).toEqual([domain.id]);
  expect(
    screen.getByRole("region", { name: "1 complex in view" }),
  ).toBeVisible();
});

it("lets the tray follow the map once someone moves it themselves, before the camera is back", async () => {
  openFinder();
  await pick(array);
  await staged(array);
  await userEvent.keyboard("{Escape}");

  fireEvent.pointerDown(screen.getByTestId("map"));
  reportView(NORTH);
  expect(cardIds()).toEqual([domain.id]);
});

it("lets the tray follow the map at once when a building with no model closes", async () => {
  serveBuildingFiles({ [array.id]: 503 });
  openFinder();
  await pick(array);
  await waitFor(() => expect(lastMap().flyTo).not.toBeNull());

  await userEvent.keyboard("{Escape}");
  reportView(NORTH);
  expect(cardIds()).toEqual([domain.id]);
});

it("still applies a filter changed while a building is open, to the ground the tray was counting", async () => {
  openFinder();
  await pick(array);
  await staged(array);
  reportView(NORTH);

  await userEvent.click(screen.getByRole("button", { name: "Fewest first" }));
  expect(cardIds()).toEqual([array.id, crest.id]);
});

it("clears the model and restores the padding in one render when the building closes", async () => {
  openFinder();
  await pick(array);
  await staged(array);

  const before = mapRenders.length;
  await userEvent.keyboard("{Escape}");
  const cleared = mapRenders.slice(before).find((props) => props.spotlight === null);
  expect(cleared?.padding).toEqual(NORMAL_PADDING);
  expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("switches the model straight to another building picked while one is open", async () => {
  openFinder();
  await pick(array);
  await staged(array);

  const before = mapRenders.length;
  await pick(crest);
  await staged(crest);
  expect(
    mapRenders.slice(before).every((props) => props.spotlight !== null),
  ).toBe(true);
  expect(lastMap().spotlight?.title).toBe("1601 Royal Crest Dr");
});

it("flies to the building's point, with no model, when its file cannot be loaded, and still opens its record", async () => {
  serveBuildingFiles({ [array.id]: 503 });
  openFinder();
  await pick(array);

  await waitFor(() =>
    expect(lastMap().flyTo).toEqual({
      lon: array.lon,
      lat: array.lat,
      zoom: 14.6,
    }),
  );
  expect(
    mapRenders.every(
      (props) => props.spotlight === null || props.spotlight === undefined,
    ),
  ).toBe(true);
  expect(
    screen.getByRole("heading", { level: 2, name: "Array Apartments" }),
  ).toBeVisible();
  expect(await screen.findByText(/history could not be loaded/)).toBeVisible();
});

it("asks for the fallback fly in the same render as an earlier model leaves, so the map hands the camera to it", async () => {
  serveBuildingFiles({ [crest.id]: 503 });
  openFinder();
  await pick(array);
  await staged(array);
  const before = mapRenders.length;

  await pick(crest);
  await waitFor(() => expect(lastMap().spotlight).toBeNull());
  const leaving = mapRenders.slice(before).find((props) => props.spotlight === null);
  expect(leaving?.flyTo).toEqual({ lon: crest.lon, lat: crest.lat, zoom: 14.6 });
});

it("leaves for an area in one render, with the fly, and the tray follows the map from there", async () => {
  openFinder();
  await pick(array);
  await staged(array);
  const before = mapRenders.length;

  await userEvent.click(screen.getByRole("button", { name: "Downtown" }));
  const leaving = mapRenders.slice(before).find((props) => props.spotlight === null);
  expect(leaving?.flyTo).toEqual({ lon: -97.7431, lat: 30.268, zoom: 13.9 });
  expect(leaving?.selectedId).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();

  reportView(NORTH);
  expect(cardIds()).toEqual([domain.id]);
});

it("without a map, opens a picked building's record with its photo and stages nothing", async () => {
  openFinder();
  act(() => lastMap().onUnavailable());
  await pick(array);

  expect(
    await screen.findByRole("img", {
      name: "Aerial photo of Array Apartments",
    }),
  ).toBeVisible();
  expect(mapRenders.every((props) => !props.spotlight)).toBe(true);
  expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
});
