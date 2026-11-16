import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetBuildingDetails } from "@/city/buildingDetail";
import type { ViewArea } from "@/domain/query";
import type { BuildingDetail, Complex, Meta } from "@/domain/types";
import type { BuildingMapProps, CameraPadding } from "@/map/BuildingMap";
import { Finder } from "./Finder";

const { mapRenders, mapScript } = vi.hoisted(() => ({
  mapRenders: [] as BuildingMapProps[],
  mapScript: {
    /** Like the real map, report this ground at once when the padding changes to the selection's. */
    groundUnderSelectionPadding: null as ViewArea | null,
    /** Press Escape in the commit that stages a model, before React has run that commit's effects. */
    escapeOnStage: false,
  },
}));

// MapLibre cannot start here, so the map is a stand-in that records what the screen asks of it on every render.
vi.mock("next/dynamic", async () => {
  const { useEffect, useLayoutEffect, useRef } = await import("react");
  return {
    default: () =>
      function RecordedMap(props: BuildingMapProps) {
        mapRenders.push(props);
        const sides = props.padding?.right ?? 0;
        const reportedSides = useRef(0);
        useEffect(() => {
          if (sides === reportedSides.current) return;
          reportedSides.current = sides;
          if (sides !== 0 && mapScript.groundUnderSelectionPadding) {
            props.onViewAreaChange(mapScript.groundUnderSelectionPadding);
          }
        });
        // A slow machine can deliver a keypress here: after the staging commit, before its effects.
        useLayoutEffect(() => {
          if (!mapScript.escapeOnStage || !props.spotlight) return;
          mapScript.escapeOnStage = false;
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape" }),
          );
        });
        return <div data-testid="map" />;
      },
  };
});

const NORMAL_PADDING: CameraPadding = {
  top: 80,
  right: 0,
  bottom: 81,
  left: 0,
};
const SELECTION_PADDING: CameraPadding = {
  top: 110,
  right: 440,
  bottom: 88,
  left: 70,
};
const PHONE_PADDING: CameraPadding = {
  top: 170,
  right: 0,
  bottom: 111,
  left: 0,
};

function complex(id: string, overrides: Partial<Complex>): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 2,
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    repeatOffender: null,
    ...overrides,
  };
}

const array = complex("0307050309", {
  address: "2000 Burton Dr",
  name: { text: "Array Apartments", source: "openstreetmap" },
  lon: -97.73,
  lat: 30.23,
  tally: { m12: { property: { none: 3 } }, y2: {}, y3: {} },
});
// Each has a complaint in the default period, since the list without a map gives a card only to a complex that has one.
const crest = complex("0304070701", {
  address: "1601 Royal Crest Dr",
  lon: -97.729,
  lat: 30.238,
  tally: { m12: { structure: { none: 1 } }, y2: {}, y3: {} },
});
const domain = complex("0250010101", {
  address: "11800 Domain Blvd",
  lon: -97.72,
  lat: 30.4,
  tally: { m12: { structure: { violation: 2 } }, y2: {}, y3: {} },
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
    complaints: [],
    deficiencies: [],
    outline: [[ring]],
    bbox: [lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001],
  };
}

interface FileOptions {
  /** Building files answered with this status instead of the detail. */
  failing?: Record<string, number>;
  /** Building files held back until the test lets them through with `release` or `fail`. */
  heldBack?: string[];
}

/**
 * Answers each building file with its detail, or with the status given for it, or holds it back.
 * The city's address search finds nothing; the city's other live APIs are never answered.
 */
function serveBuildingFiles({ failing = {}, heldBack = [] }: FileOptions = {}) {
  const waiting = new Map<string, (response: Response) => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (
        url.startsWith("https://data.austintexas.gov/resource/9s7j-tygf.json")
      )
        return Response.json([]);
      if (url.startsWith("https://")) return new Promise<Response>(() => {});
      const id = /\/data\/buildings\/(.+)\.json$/.exec(url)?.[1];
      const found = everything.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`Unexpected fetch: ${url}`);
      if (heldBack.includes(found.id)) {
        return new Promise<Response>((resolve) =>
          waiting.set(found.id, resolve),
        );
      }
      if (failing[found.id])
        return new Response("", { status: failing[found.id] });
      return Response.json(detailFor(found));
    }),
  );
  const answer = async (id: string, response: () => Response) => {
    const resolve = waiting.get(id);
    if (!resolve) throw new Error(`No request for ${id} is waiting`);
    await act(async () => resolve(response()));
  };
  return {
    release: (target: Complex) =>
      answer(target.id, () => Response.json(detailFor(target))),
    fail: (target: Complex) =>
      answer(target.id, () => new Response("", { status: 503 })),
  };
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
  spread: {
    m12: { noneShare: 0.52, nineInTen: 5 },
    y2: { noneShare: 0.41, nineInTen: 9 },
    y3: { noneShare: 0.35, nineInTen: 14 },
  },
  phrasesUsuallyWithCase: [],
};

function lastMap(): BuildingMapProps {
  const props = mapRenders.at(-1);
  if (!props) throw new Error("The map has not rendered");
  return props;
}

const reportView = (area: ViewArea) =>
  act(() => lastMap().onViewAreaChange(area));

/** The count line's region, by what it says: "2 complexes in view". */
const counting = (name: string) => screen.getByRole("region", { name });

/** The count line itself, which takes focus when a closed building has no card to go back to. */
function countLine(): HTMLElement {
  const region = screen.getByRole("region", { name: /complex(es)? in / });
  const line = document.getElementById(
    region.getAttribute("aria-labelledby") ?? "",
  );
  if (!line) throw new Error("The count has no line");
  return line;
}

/** Picks a building by its pin, as the map reports a click on one. */
function pickOnMap(target: Complex) {
  act(() => lastMap().onSelect(target.id));
}

/** A building's card in the list shown when the map cannot start. */
const cardOf = (target: Complex) =>
  screen
    .getAllByTestId("card")
    .find((card) => card.dataset.complexId === target.id);
const cardIds = () =>
  screen.getAllByTestId("card").map((card) => card.dataset.complexId);

async function pickFromList(target: Complex) {
  const card = cardOf(target);
  if (!card) throw new Error(`No card for ${target.id}`);
  await userEvent.click(card);
}

/** Opens the screen and lets the map give up, so the list of every complex in Austin stands in for it. */
function openWithoutMap() {
  openFinder();
  act(() => lastMap().onUnavailable());
}

const staged = (target: Complex) =>
  waitFor(() => expect(lastMap().spotlight?.id).toBe(target.id));

/** The search box and the filter bar, inside the wrapper that steps them aside on a phone. */
const controls = () => {
  const wrapper = screen.getByRole("combobox").closest("main > div:not(.fog)");
  if (!wrapper) throw new Error("No wrapper around the search and filters");
  return wrapper;
};

async function pickFromSearch(text: string, target: Complex) {
  await userEvent.type(screen.getByRole("combobox"), text);
  await userEvent.click(
    await screen.findByRole("option", { name: new RegExp(target.address) }),
  );
}

function openFinder() {
  render(<Finder complexes={everything} meta={meta} />);
  reportView(RIVERSIDE);
}

beforeEach(() => {
  // The view lives in the query string, so a filter one test sets would carry into the next.
  window.history.replaceState(null, "", "/");
  mapRenders.length = 0;
  mapScript.groundUnderSelectionPadding = null;
  mapScript.escapeOnStage = false;
  forgetBuildingDetails();
  setScreen({ phone: false });
  serveBuildingFiles();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  // The model and the selection padding travel together: no render has one without the other.
  // Only the selection padding, on a desktop or a phone, keeps room at the sides.
  for (const props of mapRenders) {
    expect(props.padding?.right !== 0).toBe(Boolean(props.spotlight));
  }
});

it("on the map, shows only the count and the area shortcuts at the bottom: no cards and no order", () => {
  openFinder();
  expect(counting("2 complexes in view")).toBeVisible();
  expect(
    screen.getByRole("navigation", { name: "Jump to an area" }),
  ).toBeVisible();
  expect(screen.queryAllByTestId("card")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /first$/ })).toBeNull();
});

it("without a map, lists every complex in Austin as cards in the order asked for, with no area shortcuts", async () => {
  openWithoutMap();
  expect(counting("3 complexes in Austin")).toBeVisible();
  expect(cardIds()).toEqual([crest.id, domain.id, array.id]);
  expect(
    screen.queryByRole("navigation", { name: "Jump to an area" }),
  ).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Fewest first" }));
  expect(cardIds()).toEqual([array.id, domain.id, crest.id]);
});

it("stages a picked building on the map once its outline is known, with the selection padding in the same render, and leaves the camera to the map", async () => {
  openFinder();
  pickOnMap(array);
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
  expect(lastMap().padding).toEqual(PHONE_PADDING);
  pickOnMap(array);
  await staged(array);
  expect(lastMap().padding).toEqual({
    top: 90,
    right: 30,
    bottom: 507,
    left: 30,
  });

  // Turned to landscape, or a window made shorter: the map frames the model again in the new strip.
  vi.stubGlobal("innerHeight", 700);
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(lastMap().padding).toEqual({
    top: 90,
    right: 30,
    bottom: 440,
    left: 30,
  });
});

it("keeps the count on the ground it was counting while a building is open, and until the camera is back from it", async () => {
  openFinder();
  expect(counting("2 complexes in view")).toBeVisible();
  pickOnMap(array);
  await staged(array);

  // The turning camera keeps reporting new ground.
  reportView(NORTH);
  expect(counting("2 complexes in view")).toBeVisible();

  // Closing, the camera eases back from the model's ground to where it was, and only then does the count follow the map.
  await userEvent.keyboard("{Escape}");
  reportView(NORTH);
  expect(counting("2 complexes in view")).toBeVisible();
  expect(countLine()).toHaveFocus();
  reportView(RIVERSIDE);
  reportView(NORTH);
  expect(counting("1 complex in view")).toBeVisible();
});

it("lets the count follow the map once someone moves it themselves, before the camera is back", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);
  await userEvent.keyboard("{Escape}");

  fireEvent.pointerDown(screen.getByTestId("map"));
  reportView(NORTH);
  expect(counting("1 complex in view")).toBeVisible();
});

it("with no model, closing hands focus to the count line, and the count follows the map once the hold ends", async () => {
  serveBuildingFiles({ failing: { [array.id]: 503 } });
  openFinder();
  pickOnMap(array);
  await waitFor(() => expect(lastMap().flyTo).not.toBeNull());

  await userEvent.keyboard("{Escape}");
  expect(countLine()).toHaveFocus();
  fireEvent.pointerDown(screen.getByTestId("map"));
  reportView(NORTH);
  expect(counting("1 complex in view")).toBeVisible();
});

it("keeps the count, and hands focus to the count line, when Escape lands after the model is staged but before the screen has run that render's effects", async () => {
  // The map reports the smaller ground under the selection padding as soon as that padding arrives.
  mapScript.groundUnderSelectionPadding = NORTH;
  mapScript.escapeOnStage = true;
  openFinder();
  pickOnMap(array);

  await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  expect(counting("2 complexes in view")).toBeVisible();
  expect(countLine()).toHaveFocus();
});

it("still applies a filter changed while a building is open, to the ground the count was on", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);
  reportView(NORTH);

  await userEvent.click(screen.getByRole("button", { name: "Grounds" }));
  expect(counting("2 complexes in view")).toBeVisible();
  expect(screen.getByText("1 with none of this type")).toBeVisible();
});

it("clears the model and restores the padding in one render when the building closes", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);

  const before = mapRenders.length;
  await userEvent.keyboard("{Escape}");
  const cleared = mapRenders
    .slice(before)
    .find((props) => props.spotlight === null);
  expect(cleared?.padding).toEqual(NORMAL_PADDING);
  expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("switches the model straight to another building picked while one is open", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);

  const before = mapRenders.length;
  pickOnMap(crest);
  await staged(crest);
  expect(
    mapRenders.slice(before).every((props) => props.spotlight !== null),
  ).toBe(true);
  expect(lastMap().spotlight?.title).toBe("1601 Royal Crest Dr");
});

it("flies to the building's point, with no model, when its file cannot be loaded, and still opens its record", async () => {
  serveBuildingFiles({ failing: { [array.id]: 503 } });
  openFinder();
  pickOnMap(array);

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
  // The record's sentences stand without the file. The 311 line, which needs the parcel's box from it, goes.
  const record = within(
    screen.getByRole("list", { name: "What the record shows" }),
  );
  await waitFor(() =>
    expect(record.queryByText("311 requests around this parcel")).toBeNull(),
  );
  expect(record.getByText("All 3 were about trash and grounds.")).toBeVisible();
});

it("asks for the fallback fly in the same render as an earlier model leaves, so the map hands the camera to it", async () => {
  serveBuildingFiles({ failing: { [crest.id]: 503 } });
  openFinder();
  pickOnMap(array);
  await staged(array);
  const before = mapRenders.length;

  pickOnMap(crest);
  await waitFor(() => expect(lastMap().spotlight).toBeNull());
  const leaving = mapRenders
    .slice(before)
    .find((props) => props.spotlight === null);
  expect(leaving?.flyTo).toEqual({
    lon: crest.lon,
    lat: crest.lat,
    zoom: 14.6,
  });
});

it("leaves for an area in one render, with the fly, and the count follows the map from there", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);
  const before = mapRenders.length;

  await userEvent.click(screen.getByRole("button", { name: "Downtown" }));
  const leaving = mapRenders
    .slice(before)
    .find((props) => props.spotlight === null);
  // Close enough that the area's buildings stand, as they do when the site opens.
  expect(leaving?.flyTo).toEqual({ lon: -97.7431, lat: 30.268, zoom: 14.8 });
  expect(leaving?.selectedId).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();

  reportView(NORTH);
  expect(counting("1 complex in view")).toBeVisible();
});

it("flies closer to an area of low buildings than to downtown's towers, so they stand too", async () => {
  openFinder();
  const before = mapRenders.length;
  await userEvent.click(screen.getByRole("button", { name: "Rundberg" }));
  const leaving = mapRenders.slice(before).find((props) => props.flyTo);
  expect(leaving?.flyTo).toEqual({ lon: -97.703, lat: 30.362, zoom: 15.3 });
});

it("without a map, opens a picked building's record with its photo and stages nothing", async () => {
  openWithoutMap();
  await pickFromList(array);

  expect(
    await screen.findByRole("img", {
      name: "Aerial photo of Array Apartments",
    }),
  ).toBeVisible();
  expect(mapRenders.every((props) => !props.spotlight)).toBe(true);
  expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
});

it("without a map, closing hands focus back to the building's card in the list", async () => {
  openWithoutMap();
  await pickFromList(array);
  expect(screen.getByRole("complementary")).toHaveFocus();

  await userEvent.keyboard("{Escape}");
  expect(cardOf(array)).toHaveFocus();
});

it("reads the period from the address bar, and rewrites a retired or unknown one away on the next change", async () => {
  // The order has its button only in the list shown without a map.
  window.history.replaceState(null, "", "/?period=cases&order=most");
  openWithoutMap();
  expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await userEvent.click(screen.getByRole("button", { name: "Most first" }));
  expect(window.location.search).toBe("");

  await userEvent.click(screen.getByRole("button", { name: "3 years" }));
  expect(window.location.search).toBe("?period=3y");
  await userEvent.click(screen.getByRole("button", { name: "2 years" }));
  expect(window.location.search).toBe("?period=2y");
});
it("asks the city for a picked building's 311 requests from the first day of the 3 years in the data", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(([input]) => decodeURIComponent(String(input)))
        .find((url) => url.includes("xwdj-i9he")),
    ).toContain("sr_created_date >= '2023-11-14'"),
  );
});

it("a pick made before the map has reported holds the count it was picked from, all of Austin", async () => {
  render(<Finder complexes={everything} meta={meta} />);
  expect(counting("3 complexes in Austin")).toBeVisible();
  pickOnMap(domain);
  await staged(domain);

  // The map's first report shows ground without that building; the count stays the one it was picked from.
  reportView(RIVERSIDE);
  reportView(NORTH);
  expect(counting("3 complexes in Austin")).toBeVisible();

  await userEvent.keyboard("{Escape}");
  expect(countLine()).toHaveFocus();
});

it("lets go of the count 1.5 seconds after a building closes, when the camera never comes back to the same ground", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);
  await userEvent.keyboard("{Escape}");

  // A rotation while the building was open: the camera returns, but to ground that no longer matches.
  reportView(NORTH);
  expect(counting("2 complexes in view")).toBeVisible();
  await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
  expect(counting("2 complexes in view")).toBeVisible();
  await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
  expect(counting("1 complex in view")).toBeVisible();
});

it("drops a model whose map gave up after it was staged: no model, no selection padding, no spotlight fog", async () => {
  openFinder();
  pickOnMap(array);
  await staged(array);

  act(() => lastMap().onUnavailable());
  expect(lastMap().spotlight).toBeNull();
  expect(lastMap().padding).toEqual(NORMAL_PADDING);
  expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
  expect(
    screen.getByRole("heading", { level: 2, name: "Array Apartments" }),
  ).toBeVisible();
});

it("returns focus to the search when the closed building was picked through the search", async () => {
  openFinder();
  await pickFromSearch("11800", domain);
  await staged(domain);

  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("combobox")).toHaveFocus();
});

it("hands focus to the count line, never an input, when a building picked on the map closes", async () => {
  openFinder();
  pickOnMap(domain);
  await staged(domain);

  await userEvent.click(
    screen.getByRole("button", { name: "Close building details" }),
  );
  expect(countLine()).toHaveFocus();
  expect(countLine()).toHaveAttribute("tabindex", "-1");
  expect(document.activeElement?.tagName).not.toBe("INPUT");
});

it("goes by the latest pick: a search pick replaced by a pick on the map hands focus to the count line", async () => {
  openFinder();
  await pickFromSearch("2000 Burton", array);
  await staged(array);
  pickOnMap(domain);
  await staged(domain);

  await userEvent.keyboard("{Escape}");
  expect(countLine()).toHaveFocus();
});

describe("a building file that settles after the pick has moved on", () => {
  it("leaves no model, fog or fly when it arrives after the building closed", async () => {
    const files = serveBuildingFiles({ heldBack: [array.id] });
    openFinder();
    pickOnMap(array);
    await userEvent.keyboard("{Escape}");

    await files.release(array);
    expect(
      mapRenders.every((props) => !props.spotlight && props.flyTo === null),
    ).toBe(true);
    expect(document.querySelector(".fog")).not.toHaveClass("fog-spotlight");
  });

  it("leaves no fly when it fails after the building closed", async () => {
    const files = serveBuildingFiles({ heldBack: [array.id] });
    openFinder();
    pickOnMap(array);
    await userEvent.keyboard("{Escape}");

    await files.fail(array);
    expect(
      mapRenders.every((props) => !props.spotlight && props.flyTo === null),
    ).toBe(true);
  });

  it("shows only the second building when the first's file arrives after it", async () => {
    const files = serveBuildingFiles({ heldBack: [array.id] });
    openFinder();
    pickOnMap(array);
    pickOnMap(crest);
    await staged(crest);

    await files.release(array);
    expect(lastMap().spotlight?.id).toBe(crest.id);
    expect(mapRenders.some((props) => props.spotlight?.id === array.id)).toBe(
      false,
    );
  });
});

describe("on a phone", () => {
  beforeEach(() => setScreen({ phone: true, height: 812 }));

  it("steps the search and filters out of the way while a building is open, and brings them back when it closes", async () => {
    openFinder();
    expect(controls()).not.toHaveAttribute("inert");

    pickOnMap(array);
    expect(controls()).toHaveAttribute("inert");
    expect(screen.getByRole("complementary")).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(controls()).not.toHaveAttribute("inert");
  });

  it("moves focus from the search into the record when a pick made there steps the search aside", async () => {
    openFinder();
    await pickFromSearch("11800", domain);

    expect(controls()).toHaveAttribute("inert");
    expect(screen.getByRole("complementary")).toHaveFocus();
    expect(controls()).not.toContainElement(
      document.activeElement as HTMLElement,
    );

    // Picked through the search, so closing hands focus back to the search, which is back by then.
    await staged(domain);
    await userEvent.keyboard("{Escape}");
    expect(controls()).not.toHaveAttribute("inert");
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("closing a building picked from a pin puts focus on the count line, so no keyboard opens", async () => {
    openFinder();
    pickOnMap(domain);
    await staged(domain);

    await userEvent.click(
      screen.getByRole("button", { name: "Close building details" }),
    );
    expect(controls()).not.toHaveAttribute("inert");
    expect(countLine()).toHaveFocus();
    expect(screen.getByRole("combobox")).not.toHaveFocus();
  });

  it("keeps the search and filters where they are without a map", async () => {
    openWithoutMap();
    await pickFromList(array);
    expect(controls()).not.toHaveAttribute("inert");
  });
});

it("keeps the search and filters where they are on a desktop while a building is open", async () => {
  openFinder();
  pickOnMap(array);
  expect(controls()).not.toHaveAttribute("inert");
});
