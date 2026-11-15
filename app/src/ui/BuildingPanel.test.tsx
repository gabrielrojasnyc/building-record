import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aerialPhotoUrl } from "@/city/aerialPhoto";
import { forgetBuildingDetails } from "@/city/buildingDetail";
import { CATEGORY_MEANING } from "@/domain/labels";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { BuildingDetail, Complaint, Complex, Meta } from "@/domain/types";
import { BuildingPanel } from "./BuildingPanel";

// The building file is shared and remembered, so each test starts from an empty cache.
beforeEach(forgetBuildingDetails);
// Spies on prototypes and the console are put back even when an assertion fails, so nothing leaks into later tests.
afterEach(() => {
  vi.restoreAllMocks();
});

const PERIOD_STARTS: Meta["periodStarts"] = {
  m12: "2025-11-14",
  y2: "2024-11-14",
  y3: "2023-11-14",
};

const busy: Complex = {
  id: "0304070701",
  parcelIds: ["0304070701"],
  address: "1601 Royal Crest Dr",
  name: null,
  lon: -97.7287,
  lat: 30.2379,
  acres: 20.5,
  open: 1,
  tally: {
    m12: { structure: { violation: 8, none: 3 }, landuse: { none: 1 } },
    y2: {
      structure: { violation: 50, none: 40 },
      property: { none: 10 },
      landuse: { none: 2 },
    },
    y3: {
      structure: { violation: 150, none: 100, other: 4 },
      property: { none: 24 },
      landuse: { none: 5 },
      permit: { open: 1 },
    },
  },
  duplicates: { m12: 40, y2: 41, y3: 43 },
  violationsOpen: 0,
  repeatOffender: {
    name: "Mia Riverside",
    units: 562,
    activeViolations: 0,
    totalViolations: 166,
    recorded: null,
  },
};

const busyDetail: BuildingDetail = {
  id: busy.id,
  monthly: [
    { month: "2025-08", count: 19 },
    { month: "2025-09", count: 75 },
    { month: "2025-10", count: 1 },
    { month: "2025-11", count: 0 },
  ],
  complaints: [],
  deficiencies: [],
  outline: [],
  bbox: [-97.7308, 30.2361, -97.7277, 30.2408],
};

const clean: Complex = {
  id: "R039648",
  parcelIds: ["R039648"],
  address: "9805 Copper Creek Dr",
  name: null,
  lon: -97.788,
  lat: 30.4572,
  acres: 15,
  open: 0,
  tally: { m12: {}, y2: {}, y3: {} },
  duplicates: { m12: 0, y2: 0, y3: 0 },
  violationsOpen: 0,
  repeatOffender: null,
};

const cleanDetail: BuildingDetail = {
  id: clean.id,
  monthly: [
    { month: "2026-10", count: 0 },
    { month: "2026-11", count: 0 },
  ],
  complaints: [],
  deficiencies: [],
  outline: [],
  bbox: [-97.79, 30.456, -97.787, 30.458],
};

const TWO_YEARS: View = { ...DEFAULT_VIEW, period: "y2" };
const THREE_YEARS: View = { ...DEFAULT_VIEW, period: "y3" };

type Reply = () => Promise<Response>;
const pending: Reply = () => new Promise<Response>(() => {});
const ok =
  (body: unknown): Reply =>
  async () =>
    new Response(JSON.stringify(body));
const status =
  (code: number): Reply =>
  async () =>
    new Response("", { status: code });
const networkFailure: Reply = async () => {
  throw new TypeError("Failed to fetch");
};

/** Answers the city's 311 API with `city`, and each building file by its path. Unanswered by default, so nothing settles unless a test waits for it. */
function fakeFetch({
  city = pending,
  files = {},
}: {
  city?: Reply;
  files?: Record<string, Reply>;
}) {
  return vi.fn<typeof fetch>((input) => {
    const url = String(input);
    if (
      url.startsWith("https://data.austintexas.gov/resource/xwdj-i9he.json")
    ) {
      return city();
    }
    const file = files[url];
    if (!file) throw new Error(`Unexpected fetch: ${url}`);
    return file();
  });
}

function renderPage(
  complex: Complex,
  detail: BuildingDetail,
  { view = DEFAULT_VIEW, city = pending }: { view?: View; city?: Reply } = {},
) {
  const fetchImpl = fakeFetch({ city });
  render(
    <BuildingPanel
      place="page"
      complex={complex}
      detail={detail}
      view={view}
      periodStarts={PERIOD_STARTS}
      fetchImpl={fetchImpl}
    />,
  );
  return fetchImpl;
}

/** The large figure and its caption, read as one sentence. An open category repeats the period phrase further down. */
function leadFigure() {
  const [period] = screen.getAllByText(
    /^in the last (12 months|2 years|3 years)$/,
  );
  const figure = period.closest("p");
  if (!figure)
    throw new Error("The period caption is not inside the lead figure");
  return figure;
}

/** The three small figures under the lead, each read as its value and label. */
function smallFigures() {
  const open = screen.getByText("open now").parentElement?.parentElement;
  if (!open) throw new Error("No small figures");
  return [...open.children].map((figure) => figure.textContent);
}

function barRow(label: string) {
  const bars = screen.getByRole("region", {
    name: "What the complaints were about",
  });
  const row = within(bars).getByText(label).parentElement;
  if (!row) throw new Error(`No bar row for ${label}`);
  return row;
}

/** The building's outcome rows under "What the city found", each read as its label and count. */
function foundRows() {
  const found = screen.getByRole("region", { name: "What the city found" });
  return within(found)
    .queryAllByRole("listitem")
    .map((row) => row.textContent);
}

/** A category row's button, found by the category's name at its start. */
function categoryButton(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

it("leads with the complaints of the active period, the other two periods and open now beside it", () => {
  renderPage(busy, busyDetail);
  expect(leadFigure()).toHaveTextContent("12 complaints in the last 12 months");
  expect(smallFigures()).toEqual([
    "102last 2 years",
    "284last 3 years",
    "1open nowComplaints from the last 3 years that the city has not closed",
  ]);
  expect(barRow("Building condition")).toHaveTextContent("11");

  cleanup();
  renderPage(busy, busyDetail, { view: TWO_YEARS });
  expect(leadFigure()).toHaveTextContent("102 complaints in the last 2 years");
  expect(smallFigures()).toEqual([
    "12last 12 months",
    "284last 3 years",
    "1open nowComplaints from the last 3 years that the city has not closed",
  ]);
  expect(barRow("Building condition")).toHaveTextContent("90");

  cleanup();
  renderPage(busy, busyDetail, { view: THREE_YEARS });
  expect(leadFigure()).toHaveTextContent("284 complaints in the last 3 years");
  expect(smallFigures()).toEqual([
    "12last 12 months",
    "102last 2 years",
    "1open nowComplaints from the last 3 years that the city has not closed",
  ]);
  expect(barRow("Building condition")).toHaveTextContent("254");
});

it("never counts a duplicate in its figures", () => {
  renderPage(busy, busyDetail, { view: THREE_YEARS });
  // 284 complaints and 43 duplicates: the figure is the complaints alone.
  expect(leadFigure()).toHaveTextContent(/^284 /);
  expect(document.body.textContent).not.toContain("327");
});

it("speaks of one complaint in the singular", () => {
  renderPage(
    { ...clean, tally: { m12: { permit: { open: 1 } }, y2: {}, y3: {} } },
    cleanDetail,
  );
  expect(leadFigure()).toHaveTextContent("1 complaint in the last 12 months");
});

it('shows None and "no complaints" for a clean building', () => {
  renderPage(clean, cleanDetail);

  expect(leadFigure()).toHaveTextContent(
    "None no complaints in the last 12 months",
  );
  expect(smallFigures()).toEqual([
    "0last 2 years",
    "0last 3 years",
    "0open nowComplaints from the last 3 years that the city has not closed",
  ]);
  expect(screen.getByText("No complaints in the last 3 years.")).toBeVisible();
  expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
});

it("shows None and zeros, never NaN or undefined, when the tally has no entry for a period", () => {
  renderPage({ ...clean, tally: {} as Complex["tally"] }, cleanDetail, {
    view: TWO_YEARS,
  });
  expect(leadFigure()).toHaveTextContent(
    "None no complaints in the last 2 years",
  );
  expect(document.body.textContent).not.toMatch(/NaN|undefined/);
});

describe("the header", () => {
  const named: Complex = {
    ...busy,
    name: { text: "Royal Crest Apartments", source: "openstreetmap" },
  };

  /** The line under the header's title. */
  function subline(title: string) {
    const line = screen.getByRole("heading", {
      name: title,
    }).nextElementSibling;
    if (!line) throw new Error(`Nothing under ${title}`);
    return line;
  }

  it("titles a named complex by its name, over its address and acres", () => {
    renderPage(named, busyDetail);
    expect(
      screen.getByRole("heading", { level: 1, name: "Royal Crest Apartments" }),
    ).toBeVisible();
    expect(subline("Royal Crest Apartments")).toHaveTextContent(
      /^1601 Royal Crest Dr, 20\.5 acres$/,
    );
  });

  it("titles an unnamed complex by its address, with the acres alone beneath", () => {
    renderPage(busy, busyDetail);
    expect(subline("1601 Royal Crest Dr")).toHaveTextContent(/^20\.5 acres$/);

    cleanup();
    renderPage(clean, cleanDetail);
    expect(subline("9805 Copper Creek Dr")).toHaveTextContent(/^15 acres$/);
  });

  it("says a sliver parcel is under a tenth of an acre", () => {
    renderPage({ ...clean, acres: 0 }, cleanDetail);
    expect(subline("9805 Copper Creek Dr")).toHaveTextContent(
      /^under 0\.1 acres$/,
    );
  });

  it("says how many parcels a complex covers when parcels sharing an address are shown as one, named or not", () => {
    const merged = { parcelIds: ["0168090512", "R072626"], acres: 13.4 };
    renderPage({ ...clean, ...merged }, cleanDetail);
    expect(subline("9805 Copper Creek Dr")).toHaveTextContent(
      /^Apartment parcels \(2\), 13\.4 acres$/,
    );

    cleanup();
    renderPage({ ...named, ...merged }, busyDetail);
    expect(subline("Royal Crest Apartments")).toHaveTextContent(
      /^1601 Royal Crest Dr, apartment parcels \(2\), 13\.4 acres$/,
    );
  });

  it("keeps the full title in its title attribute, since a long one is cut at two lines", () => {
    const label = "Parcel 0229230206, near 2104 E Anderson Ln SVRD WB";
    renderPage({ ...clean, address: label }, cleanDetail);
    expect(
      screen.getByRole("heading", { level: 1, name: label }),
    ).toHaveAttribute("title", label);
  });

  it("fades in the aerial photo of the parcel once it has loaded, and credits it then", async () => {
    renderPage(named, busyDetail);

    const photo = screen.getByRole("img", {
      name: "Aerial photo of Royal Crest Apartments",
    });
    expect(photo).toHaveAttribute(
      "src",
      aerialPhotoUrl(busyDetail.bbox, 744, 400),
    );
    expect(photo).toHaveAttribute("decoding", "async");
    expect(photo).not.toHaveAttribute("loading", "lazy");
    expect(photo).toHaveAttribute("data-loaded", "false");
    expect(screen.queryByText("Aerial photo: USGS")).toBeNull();

    fireEvent.load(photo);
    expect(photo).toHaveAttribute("data-loaded", "true");
    expect(screen.getByText("Aerial photo: USGS")).toBeVisible();
  });

  it("drops a photo that fails to load, keeping the title over the gradient", () => {
    renderPage(named, busyDetail);

    fireEvent.error(
      screen.getByRole("img", {
        name: "Aerial photo of Royal Crest Apartments",
      }),
    );
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
    expect(screen.queryByText("Aerial photo: USGS")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Royal Crest Apartments" }),
    ).toBeVisible();
  });

  it("takes a photo that finished before the page could listen for it", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    const width = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(744);
    renderPage(named, busyDetail);
    expect(
      screen.getByRole("img", {
        name: "Aerial photo of Royal Crest Apartments",
      }),
    ).toHaveAttribute("data-loaded", "true");

    cleanup();
    width.mockReturnValue(0);
    renderPage(named, busyDetail);
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
  });
});

it("notes a listing on the city's Repeat Offender list with its published figures", () => {
  renderPage(busy, busyDetail);

  const note = screen
    .getByText("On the city's Repeat Offender list")
    .closest("p");
  expect(note).toHaveTextContent(
    "On the city's Repeat Offender list Mia Riverside, 562 units. 0 active of 166 total violations.",
  );
});

it("counts a single registered unit in the singular", () => {
  renderPage(
    {
      ...busy,
      repeatOffender: {
        name: null,
        units: 1,
        activeViolations: 1,
        totalViolations: 1,
        recorded: null,
      },
    },
    busyDetail,
  );
  expect(
    screen.getByText("On the city's Repeat Offender list").closest("p"),
  ).toHaveTextContent(
    "Registered property, 1 unit. 1 active of 1 total violations.",
  );
});

it("keeps the full record whatever complaint type the map is filtered to", () => {
  renderPage(busy, busyDetail, {
    view: { ...DEFAULT_VIEW, category: "permit" },
  });

  expect(leadFigure()).toHaveTextContent("12 complaints in the last 12 months");
  expect(smallFigures()[1]).toBe("284last 3 years");
  expect(foundRows()).toEqual(["Violation confirmed8", "No violation found4"]);
  expect(barRow("Building condition")).toHaveTextContent(
    /^Building condition11$/,
  );
  expect(barRow("Trash and grounds")).toHaveTextContent(
    /^Trash and grounds24 in 3 years$/,
  );
  expect(barRow("Signs, zoning and use")).toHaveTextContent(
    /^Signs, zoning and use1$/,
  );
  expect(barRow("Work without a permit")).toHaveTextContent(
    /^Work without a permit1 in 3 years$/,
  );
});

it("renders one bar per month", () => {
  renderPage(busy, busyDetail);
  expect(screen.getAllByTestId("month-bar")).toHaveLength(
    busyDetail.monthly.length,
  );
  expect(
    screen.getByText("Busiest month: Sep 2025, 75 complaints"),
  ).toBeVisible();
});

it("describes the month chart in words, naming the busiest month and its count", () => {
  renderPage(busy, busyDetail);
  expect(
    screen.getByRole("img", {
      name: "Complaints opened each month, Aug 2025 to Nov 2025. Busiest month: Sep 2025, with 75 complaints.",
    }),
  ).toBeVisible();
});

it("names the most recent of tied busiest months, in the caption and the text alternative alike", () => {
  renderPage(busy, {
    ...busyDetail,
    monthly: [
      { month: "2025-08", count: 1 },
      { month: "2025-09", count: 1 },
      { month: "2025-10", count: 0 },
    ],
  });
  expect(
    screen.getByText("Busiest month: Sep 2025, 1 complaint"),
  ).toBeVisible();
  expect(
    screen.getByRole("img", {
      name: "Complaints opened each month, Aug 2025 to Oct 2025. Busiest month: Sep 2025, with 1 complaint.",
    }),
  ).toBeVisible();
});

it("titles each month's bar with its complaints", () => {
  renderPage(busy, busyDetail);
  expect(screen.getAllByTestId("month-bar")[1]).toHaveAttribute(
    "title",
    "Sep 2025: 75 complaints",
  );
  expect(screen.getAllByTestId("month-bar")[3]).toHaveAttribute(
    "title",
    "Nov 2025: 0 complaints",
  );
});

it("says so when the 311 lookup fails, and keeps everything else", async () => {
  renderPage(busy, busyDetail, { city: networkFailure });

  expect(
    await screen.findByText(
      "311 requests could not be loaded from the city right now.",
    ),
  ).toBeVisible();
  expect(screen.getByText("What the complaints were about")).toBeVisible();
  expect(screen.getAllByTestId("month-bar")).toHaveLength(
    busyDetail.monthly.length,
  );
});

it("lists the 311 request types counted around the parcel", async () => {
  const fetchImpl = renderPage(busy, busyDetail, {
    city: ok([
      { sr_type_desc: "DSD - Request Code Officer", count: "262" },
      { sr_type_desc: "APD - Non Emergency Noise/Alarm", count: "63" },
    ]),
  });

  expect(screen.getByText("Loading from the City of Austin")).toBeVisible();
  const first = await screen.findByText("DSD - Request Code Officer");
  expect(first.parentElement).toHaveTextContent("262");
  expect(
    screen.getByRole("heading", { name: "311 requests around this parcel" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Counted inside the rectangle around the parcel in the last 3 years, so some may belong to neighbors.",
    ),
  ).toBeVisible();
  const asked = decodeURIComponent(String(fetchImpl.mock.calls[0][0]));
  expect(asked).toContain(
    "within_box(sr_location_lat_long, 30.2408, -97.7308, 30.2361, -97.7277)",
  );
  // From the first day of the 3 years, as the data was pulled.
  expect(asked).toContain("sr_created_date >= '2023-11-14'");
});

it("lists 311 rows that share a label, such as two Unspecified types, without mixing them up", async () => {
  const keyWarnings = vi.spyOn(console, "error");
  renderPage(busy, busyDetail, {
    city: ok([
      { sr_type_desc: "Unspecified", count: "4" },
      { sr_type_desc: "Unspecified", count: "2" },
    ]),
  });

  const rows = within(
    await screen.findByRole("region", {
      name: "311 requests around this parcel",
    }),
  );
  await rows.findAllByText("Unspecified");
  expect(rows.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
    "Unspecified4",
    "Unspecified2",
  ]);
  expect(keyWarnings).not.toHaveBeenCalled();
});

it("says when the city has no 311 requests in the area", async () => {
  renderPage(clean, cleanDetail, { city: ok([]) });
  expect(
    await screen.findByText(
      "No 311 requests in this area in the last 3 years.",
    ),
  ).toBeVisible();
});

it("credits both city datasets and says what no complaints means", () => {
  renderPage(clean, cleanDetail);

  expect(
    screen.getByRole("link", { name: "Austin Code Complaint Cases" }),
  ).toHaveAttribute("href", "https://data.austintexas.gov/d/6wtj-zbtb");
  expect(screen.getByRole("link", { name: "Austin 311" })).toHaveAttribute(
    "href",
    "https://data.austintexas.gov/d/xwdj-i9he",
  );
  expect(screen.getByText(/^From .*, City of Austin\./)).toHaveTextContent(
    "From Austin Code Complaint Cases and Austin 311, City of Austin. No complaints means none reached Code Enforcement. It does not mean the building has no problems.",
  );
});

it("links the Repeat Offender note to the city's list, so its figures can be traced", () => {
  renderPage(busy, busyDetail);
  expect(
    screen.getByRole("link", { name: "On the city's Repeat Offender list" }),
  ).toHaveAttribute("href", "https://data.austintexas.gov/d/86z9-i27i");
});

it("puts its section headings one level under the page's h1", () => {
  renderPage(busy, busyDetail);
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "What the complaints were about",
    }),
  ).toBeVisible();
  expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
});

it("says, in place of the caution about no complaints, that every complaint in the period was a duplicate when that is so", () => {
  const caution =
    "No complaints means none reached Code Enforcement. It does not mean the building has no problems.";
  const duplicatesOnly: Complex = {
    ...clean,
    tally: { m12: {}, y2: {}, y3: { structure: { none: 25 } } },
    duplicates: { m12: 4, y2: 4, y3: 6 },
  };
  renderPage(duplicatesOnly, cleanDetail);
  expect(
    screen.getByText(
      /The city closed every complaint here in this period as a duplicate of another complaint\./,
    ),
  ).toBeVisible();
  expect(document.body.textContent).not.toContain(caution);

  // Over 3 years it has complaints, so the caution is back.
  cleanup();
  renderPage(duplicatesOnly, cleanDetail, { view: THREE_YEARS });
  expect(document.body.textContent).toContain(caution);
  expect(document.body.textContent).not.toContain(
    "as a duplicate of another complaint.",
  );

  // With no complaints and no duplicates, the caution stands as before.
  cleanup();
  renderPage(clean, cleanDetail);
  expect(document.body.textContent).toContain(caution);
});

it("names the building as the page's h1 on its own page", () => {
  renderPage(busy, busyDetail);

  expect(
    screen.getByRole("heading", { level: 1, name: "1601 Royal Crest Dr" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Close building details" }),
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Open this building's page" }),
  ).toBeNull();
});

it("never renders the words score, grade, rating, rank or code case", async () => {
  renderPage(busy, busyDetail, {
    city: ok([{ sr_type_desc: "DSD - Request Code Officer", count: "262" }]),
  });
  await screen.findByText("DSD - Request Code Officer");
  expect(document.body.textContent).not.toMatch(
    /score|grade|rating|rank|code case/i,
  );
  expect(screen.queryByText(/^Latest cases$/)).toBeNull();
});

describe("over the map", () => {
  const HISTORY = "/data/buildings/0304070701.json";

  function renderOnMap(
    complex: Complex,
    files: Record<string, Reply>,
    city: Reply = pending,
  ) {
    const fetchImpl = fakeFetch({ city, files });
    const onClose = vi.fn();
    const panelFor = (selected: Complex) => (
      <BuildingPanel
        place="map"
        complex={selected}
        view={DEFAULT_VIEW}
        periodStarts={PERIOD_STARTS}
        onClose={onClose}
        fetchImpl={fetchImpl}
      />
    );
    const { rerender } = render(panelFor(complex));
    return {
      fetchImpl,
      onClose,
      select: (next: Complex) => rerender(panelFor(next)),
    };
  }

  it("shows what it already knows while the building's history loads", () => {
    const { fetchImpl } = renderOnMap(busy, { [HISTORY]: pending });

    expect(fetchImpl).toHaveBeenCalledWith(HISTORY);
    expect(
      screen.getByRole("heading", { level: 2, name: "1601 Royal Crest Dr" }),
    ).toBeVisible();
    expect(leadFigure()).toHaveTextContent(
      "12 complaints in the last 12 months",
    );
    expect(
      screen.getByText("On the city's Repeat Offender list"),
    ).toBeVisible();
    expect(screen.getByText("open now").parentElement).toHaveTextContent("1");
    expect(screen.getByText("What the complaints were about")).toBeVisible();
    expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
    expect(screen.getByText("Loading from the City of Austin")).toBeVisible();
  });

  it("heads the panel with the title over the gradient from the first moment, and adds the photo once the building file arrives", async () => {
    const { select } = renderOnMap(
      {
        ...busy,
        name: { text: "Royal Crest Apartments", source: "openstreetmap" },
      },
      { [HISTORY]: ok(busyDetail), "/data/buildings/R039648.json": pending },
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Royal Crest Apartments" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close building details" }),
    ).toBeVisible();

    expect(
      await screen.findByRole("img", {
        name: "Aerial photo of Royal Crest Apartments",
      }),
    ).toHaveAttribute("src", aerialPhotoUrl(busyDetail.bbox, 744, 400));

    select(clean);
    expect(
      screen.getByRole("heading", { level: 2, name: "9805 Copper Creek Dr" }),
    ).toBeVisible();
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
  });

  it("draws the months once the history arrives", async () => {
    renderOnMap(busy, { [HISTORY]: ok(busyDetail) });

    expect(await screen.findAllByTestId("month-bar")).toHaveLength(
      busyDetail.monthly.length,
    );
  });

  it("says the history could not be loaded and keeps the counts", async () => {
    const { fetchImpl } = renderOnMap(busy, { [HISTORY]: status(404) });

    expect(
      await screen.findByText(
        "This building's history could not be loaded. The counts above are still current.",
      ),
    ).toBeVisible();
    expect(leadFigure()).toHaveTextContent(
      "12 complaints in the last 12 months",
    );
    expect(screen.getByText("What the complaints were about")).toBeVisible();
    expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
    // Without the parcel's box there is nothing to ask the city about.
    expect(screen.queryByText("311 requests around this parcel")).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores a history that arrives after another building was chosen", async () => {
    let finishFirst: (response: Response) => void = () => {};
    const slow: Reply = () =>
      new Promise<Response>((resolve) => {
        finishFirst = resolve;
      });
    const { select } = renderOnMap(busy, {
      [HISTORY]: slow,
      "/data/buildings/R039648.json": ok(cleanDetail),
    });

    select(clean);
    expect(
      await screen.findByText("No complaints in the last 3 years."),
    ).toBeVisible();

    await act(async () =>
      finishFirst(new Response(JSON.stringify(busyDetail))),
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "9805 Copper Creek Dr",
    );
    expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
    expect(
      screen.getByText("No complaints in the last 3 years."),
    ).toBeVisible();
  });

  it("keeps its close button on the panel itself, outside the part that scrolls, and first in the Tab order", () => {
    renderOnMap(busy, { [HISTORY]: pending });
    const panel = screen.getByRole("complementary");
    const close = screen.getByRole("button", {
      name: "Close building details",
    });
    const scroller = screen
      .getByRole("heading", { level: 2 })
      .closest<HTMLElement>(".overflow-y-auto");

    expect(scroller).not.toBeNull();
    expect(panel).toContainElement(scroller);
    expect(scroller).not.toContainElement(close);
    expect(close.parentElement).toBe(panel);
    expect(scroller).toHaveClass("overscroll-contain");
    expect(within(panel).getAllByRole("button")[0]).toBe(close);
  });

  it("says what open now counts, to the eye on hover and to a screen reader", () => {
    renderOnMap(busy, { [HISTORY]: pending });
    const tile = screen.getByText("open now").parentElement as HTMLElement;
    const scope =
      "Complaints from the last 3 years that the city has not closed";
    expect(tile).toHaveAttribute("title", scope);
    expect(within(tile).getByText(scope)).toHaveClass("sr-only");
    expect(tile).toHaveTextContent(/^1open now/);
  });

  it("fades the top of the record under the pinned close button once it is scrolled, in step with the scroll, and not at the top", () => {
    const { select } = renderOnMap(busy, {
      [HISTORY]: pending,
      "/data/buildings/R039648.json": pending,
    });
    const scroller = screen
      .getByRole("heading", { level: 2 })
      .closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) throw new Error("The record has no scroller");
    const scrollTo = (top: number) => {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    };
    const fade = () =>
      scroller.hasAttribute("data-scrolled")
        ? scroller.style.getPropertyValue("--scrolled")
        : "none";

    expect(scroller).toHaveClass("record-scroller");
    expect(fade()).toBe("none");
    scrollTo(30);
    expect(fade()).toBe("0.5");
    scrollTo(400);
    expect(fade()).toBe("1");
    scrollTo(0);
    expect(fade()).toBe("none");

    // A newly chosen building opens at its top, with nothing faded.
    scrollTo(400);
    select(clean);
    expect(scroller.scrollTop).toBe(0);
    expect(fade()).toBe("none");
  });

  it("closes from its button and from the Escape key", async () => {
    const { onClose } = renderOnMap(busy, { [HISTORY]: pending });

    await userEvent.click(
      screen.getByRole("button", { name: "Close building details" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes focus when it opens over the map, and not on the building's own page", () => {
    renderOnMap(busy, { [HISTORY]: pending });
    expect(
      screen.getByRole("complementary", { name: "1601 Royal Crest Dr" }),
    ).toHaveFocus();

    cleanup();
    renderPage(busy, busyDetail);
    expect(document.body).toHaveFocus();
  });

  it("puts its section headings one level under its own h2", () => {
    renderOnMap(busy, { [HISTORY]: pending });
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "What the complaints were about",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("links to the building's own page", () => {
    renderOnMap(busy, { [HISTORY]: pending });
    expect(
      screen.getByRole("link", { name: "Open this building's page" }),
    ).toHaveAttribute("href", "/building/0304070701");
  });
});

function complaint(overrides: Partial<Complaint>): Complaint {
  return {
    opened: "2026-03-01",
    closed: null,
    category: "structure",
    outcome: "violation",
    stillOpen: true,
    cityOutcome: null,
    violationCase: null,
    ...overrides,
  };
}

/** Confirmed violations still open: two since the 12 months began (on its first day included), one before. */
const withOpenViolations: BuildingDetail = {
  ...busyDetail,
  complaints: [
    complaint({ opened: "2026-03-01" }),
    complaint({ opened: "2025-11-14", category: "landuse" }),
    complaint({ opened: "2025-11-13" }),
    complaint({ opened: "2026-02-01", stillOpen: false, closed: "2026-02-20" }),
    complaint({ opened: "2026-02-01", outcome: "open" }),
  ],
};

const FILTERED_TO_BUILDING: View = { ...DEFAULT_VIEW, category: "structure" };

describe("what the city found", () => {
  it("splits the active period's complaints of every type by outcome, and says how many duplicates were left out", () => {
    renderPage(busy, busyDetail, { view: THREE_YEARS });
    expect(foundRows()).toEqual([
      "Violation confirmed150",
      "No violation found129",
      "Referred or closed without a finding4",
      "Still being looked into1",
    ]);
    expect(screen.getByText("43 duplicate reports not counted")).toBeVisible();
  });

  it("counts the violations still open in the period shown, from the building's complaints", () => {
    renderPage(busy, withOpenViolations);
    expect(foundRows()[0]).toBe("Violation confirmed2 still open8");

    cleanup();
    renderPage(busy, withOpenViolations, { view: TWO_YEARS });
    expect(foundRows()[0]).toBe("Violation confirmed3 still open50");

    cleanup();
    renderPage(busy, withOpenViolations, { view: FILTERED_TO_BUILDING });
    const building = within(
      screen.getByRole("region", {
        name: "What the city found in the last 12 months",
      }),
    );
    expect(building.getAllByRole("listitem")[0]).toHaveTextContent(
      /^Violation confirmed1 still open8$/,
    );
  });

  it("for a building with no complaints in three years, shows no outcome list and no category rows", () => {
    renderPage(clean, cleanDetail, { view: THREE_YEARS });
    expect(leadFigure()).toHaveTextContent(
      "None no complaints in the last 3 years",
    );
    expect(
      screen.queryByRole("region", { name: "What the city found" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "What the complaints were about" }),
    ).toBeNull();
    expect(screen.queryByText(/duplicate/)).toBeNull();
  });

  it("for a building whose complaints were all duplicates, shows None and how many were left out", () => {
    renderPage({ ...clean, duplicates: { m12: 2, y2: 4, y3: 5 } }, cleanDetail);
    expect(leadFigure()).toHaveTextContent(
      "None no complaints in the last 12 months",
    );
    expect(screen.getByText("2 duplicate reports not counted")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "What the city found" }),
    ).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("for a building with nothing but duplicates in the period, shows None, the duplicates, and every type by its three-year count", () => {
    const quiet: Complex = {
      ...busy,
      tally: { ...busy.tally, m12: {} },
      duplicates: { m12: 1, y2: 41, y3: 43 },
    };
    renderPage(quiet, busyDetail);
    expect(leadFigure()).toHaveTextContent(
      "None no complaints in the last 12 months",
    );
    expect(screen.getByText("1 duplicate report not counted")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "What the city found" }),
    ).toBeNull();
    expect(barRow("Building condition")).toHaveTextContent(
      /^Building condition254 in 3 years$/,
    );
    expect(barRow("Work without a permit")).toHaveTextContent(
      /^Work without a permit1 in 3 years$/,
    );
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("the categories", () => {
  it("opens no category while every type is shown", () => {
    renderPage(busy, busyDetail);
    for (const label of [
      "Building condition",
      "Trash and grounds",
      "Signs, zoning and use",
      "Work without a permit",
    ]) {
      expect(categoryButton(label)).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("opens the category the map is filtered to, so the card's number is the first thing found", () => {
    renderPage(busy, busyDetail, { view: FILTERED_TO_BUILDING });
    expect(categoryButton("Building condition")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(CATEGORY_MEANING.structure)).toBeVisible();
  });

  it("keeps a category the person opened when the filter changes, and opens the filtered one for the next building", async () => {
    const fetchImpl = fakeFetch({});
    const panelFor = (complex: Complex, view: View) => (
      <BuildingPanel
        place="page"
        complex={complex}
        detail={busyDetail}
        view={view}
        periodStarts={PERIOD_STARTS}
        fetchImpl={fetchImpl}
      />
    );
    const { rerender } = render(panelFor(busy, DEFAULT_VIEW));
    await userEvent.click(categoryButton("Trash and grounds"));

    rerender(panelFor(busy, FILTERED_TO_BUILDING));
    expect(categoryButton("Trash and grounds")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(categoryButton("Building condition")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    rerender(panelFor({ ...busy, id: "0304070702" }, FILTERED_TO_BUILDING));
    expect(categoryButton("Building condition")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(categoryButton("Trash and grounds")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens one category at a time, with Enter or Space, and keeps focus on its row", async () => {
    renderPage(busy, busyDetail);
    const building = categoryButton("Building condition");
    building.focus();
    await userEvent.keyboard("{Enter}");
    expect(building).toHaveAttribute("aria-expanded", "true");
    expect(building).toHaveFocus();
    expect(
      screen.getByText("In the city's records, look for Structure Condition."),
    ).toBeVisible();

    const signs = categoryButton("Signs, zoning and use");
    signs.focus();
    await userEvent.keyboard(" ");
    expect(signs).toHaveAttribute("aria-expanded", "true");
    expect(building).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(
        "In the city's records, look for Structure Condition.",
      ),
    ).toBeNull();
    expect(
      screen.getByText("In the city's records, look for Land Use."),
    ).toBeVisible();

    await userEvent.keyboard("{Enter}");
    expect(signs).toHaveAttribute("aria-expanded", "false");
    expect(signs).toHaveFocus();
  });

  it("names its open detail as the region its row controls", async () => {
    renderPage(busy, busyDetail);
    const building = categoryButton("Building condition");
    await userEvent.click(building);
    const controlled = document.getElementById(
      building.getAttribute("aria-controls") ?? "",
    );
    expect(controlled).toHaveTextContent(CATEGORY_MEANING.structure);
  });

  it("shows a type with no complaints in three years without a way to open it", () => {
    const noPermits: Complex = {
      ...busy,
      tally: {
        ...busy.tally,
        y3: {
          structure: { violation: 150, none: 100, other: 4 },
          property: { none: 24 },
          landuse: { none: 5 },
        },
      },
    };
    renderPage(noPermits, busyDetail);
    expect(
      screen.queryByRole("button", { name: /^Work without a permit/ }),
    ).toBeNull();
    expect(barRow("Work without a permit")).toHaveTextContent(
      /^Work without a permit0$/,
    );
  });

  it("shows a type with no complaints in the period by its three-year count, and opens it", async () => {
    renderPage(busy, busyDetail);
    expect(barRow("Trash and grounds")).toHaveTextContent(
      /^Trash and grounds24 in 3 years$/,
    );
    await userEvent.click(categoryButton("Trash and grounds"));
    expect(screen.getByText(CATEGORY_MEANING.property)).toBeVisible();
    expect(
      screen.getByText("No complaints of this type in the last 12 months."),
    ).toBeVisible();
  });

  it("shows the problems the city recorded only in a category where a Repeat Offender property has some", async () => {
    renderPage(
      busy,
      {
        ...busyDetail,
        deficiencies: [
          {
            category: "property",
            kind: "Unsanitary Conditions",
            cleared: 9,
            notCleared: 0,
          },
        ],
      },
      { view: FILTERED_TO_BUILDING },
    );
    expect(screen.queryByText("Problems the city recorded here")).toBeNull();

    await userEvent.click(categoryButton("Trash and grounds"));
    expect(
      screen.getByRole("region", { name: "Problems the city recorded here" }),
    ).toHaveTextContent("Unsanitary Conditionsall cleared9");
  });

  it("lists a category's complaints once the building file arrives, and says so when it cannot", async () => {
    const fetchImpl = fakeFetch({
      files: {
        "/data/buildings/0304070701.json": ok(withOpenViolations),
        "/data/buildings/R039648.json": status(404),
      },
    });
    const panelFor = (complex: Complex) => (
      <BuildingPanel
        place="map"
        complex={complex}
        view={FILTERED_TO_BUILDING}
        periodStarts={PERIOD_STARTS}
        onClose={() => {}}
        fetchImpl={fetchImpl}
      />
    );
    const { rerender } = render(panelFor(busy));
    expect(screen.getByText("Loading the complaints")).toBeVisible();
    expect(foundRows()[0]).toBe("Violation confirmed8");

    const listed = within(
      await screen.findByRole("region", {
        name: "Complaints in the last 3 years, newest first",
      }),
    );
    expect(
      listed
        .getAllByRole("listitem")
        .filter((row) =>
          row.textContent?.endsWith("Violation confirmed, still open"),
        ),
    ).toHaveLength(2);
    expect(foundRows()[0]).toBe("Violation confirmed2 still open8");

    const failing = { ...busy, id: "R039648" };
    rerender(panelFor(failing));
    expect(
      await screen.findByText(
        "This building's details could not be loaded right now.",
      ),
    ).toBeVisible();
    expect(foundRows()[0]).toBe("Violation confirmed8");
  });
});

it("says under the month chart's title where its rolling window starts, and that duplicates are not in it", () => {
  renderPage(busy, busyDetail);
  const months = within(screen.getByRole("region", { name: "Month by month" }));
  expect(
    months.getByText(
      "Complaints opened since November 14, 2023. Duplicate reports are not counted.",
    ),
  ).toBeVisible();
});
