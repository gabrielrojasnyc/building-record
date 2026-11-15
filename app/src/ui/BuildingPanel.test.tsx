import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aerialPhotoUrl } from "@/city/aerialPhoto";
import { forgetBuildingDetails } from "@/city/buildingDetail";
import { DEFAULT_VIEW, type View } from "@/domain/query";
import type { BuildingDetail, Complex, Counts } from "@/domain/types";
import { BuildingPanel } from "./BuildingPanel";

// The building file is shared and remembered, so each test starts from an empty cache.
beforeEach(forgetBuildingDetails);

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

const busy: Complex = {
  id: "0304070701",
  parcelIds: ["0304070701"],
  address: "1601 Royal Crest Dr",
  name: null,
  lon: -97.7287,
  lat: 30.2379,
  acres: 20.5,
  cases12: counts({ structure: 11, landuse: 1 }),
  cases: counts({ structure: 254, property: 24, landuse: 5, permit: 1 }),
  open: 1,
  tally: { m12: {}, y2: {}, y3: {} },
  duplicates: { m12: 0, y2: 0, y3: 0 },
  violationsOpen: 0,
  lastCase: "2026-05-20",
  repeatOffender: {
    name: "Mia Riverside",
    units: 562,
    activeViolations: 0,
    totalViolations: 166,
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
  latest: [
    { opened: "2026-05-20", category: "structure", status: "Active" },
    { opened: "2026-04-28", category: "landuse", status: "Closed" },
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
  cases12: counts(),
  cases: counts(),
  open: 0,
  tally: { m12: {}, y2: {}, y3: {} },
  duplicates: { m12: 0, y2: 0, y3: 0 },
  violationsOpen: 0,
  lastCase: null,
  repeatOffender: null,
};

const cleanDetail: BuildingDetail = {
  id: clean.id,
  monthly: [
    { month: "2026-10", count: 0 },
    { month: "2026-11", count: 0 },
  ],
  latest: [],
  complaints: [],
  deficiencies: [],
  outline: [],
  bbox: [-97.79, 30.456, -97.787, 30.458],
};

const SINCE_2023: View = { ...DEFAULT_VIEW, period: "cases" };

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
      fetchImpl={fetchImpl}
    />,
  );
  return fetchImpl;
}

/** The large figure and its caption, read as one sentence. */
function leadFigure() {
  const period = screen.getByText(
    /^(in the last 12 months|since November 2023)$/,
  );
  const figure = period.closest("p");
  if (!figure)
    throw new Error("The period caption is not inside the lead figure");
  return figure;
}

function barRow(label: string) {
  const bars = screen.getByRole("region", {
    name: "What the cases were about",
  });
  const row = within(bars).getByText(label).parentElement;
  if (!row) throw new Error(`No bar row for ${label}`);
  return row;
}

it("leads with the count for the active period", () => {
  renderPage(busy, busyDetail);
  expect(leadFigure()).toHaveTextContent("12 code cases in the last 12 months");
  expect(screen.getByText("since Nov 2023").parentElement).toHaveTextContent(
    "284",
  );
  expect(barRow("Structure condition")).toHaveTextContent("11");

  cleanup();
  renderPage(busy, busyDetail, { view: SINCE_2023 });
  expect(leadFigure()).toHaveTextContent("284 code cases since November 2023");
  expect(screen.getByText("last 12 months").parentElement).toHaveTextContent(
    "12",
  );
  expect(barRow("Structure condition")).toHaveTextContent("254");
});

it('shows None and "no code cases" for a clean building', () => {
  renderPage(clean, cleanDetail);

  expect(leadFigure()).toHaveTextContent(
    "None no code cases in the last 12 months",
  );
  expect(screen.getByText("No code cases since Nov 2023.")).toBeVisible();
  expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
  expect(screen.queryByText("Latest cases")).toBeNull();
});

describe("the header", () => {
  const named: Complex = {
    ...busy,
    name: { text: "Royal Crest Apartments", source: "openstreetmap" },
  };

  /** The line under the header's title. */
  function subline(title: string) {
    const line = screen.getByRole("heading", { name: title }).nextElementSibling;
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
    expect(subline("9805 Copper Creek Dr")).toHaveTextContent(/^under 0\.1 acres$/);
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
    expect(screen.getByRole("heading", { level: 1, name: label })).toHaveAttribute(
      "title",
      label,
    );
  });

  it("fades in the aerial photo of the parcel once it has loaded, and credits it then", async () => {
    renderPage(named, busyDetail);

    const photo = screen.getByRole("img", {
      name: "Aerial photo of Royal Crest Apartments",
    });
    expect(photo).toHaveAttribute("src", aerialPhotoUrl(busyDetail.bbox, 744, 400));
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
      screen.getByRole("img", { name: "Aerial photo of Royal Crest Apartments" }),
    );
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
    expect(screen.queryByText("Aerial photo: USGS")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Royal Crest Apartments" }),
    ).toBeVisible();
  });

  it("takes a photo that finished before the page could listen for it", () => {
    const complete = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    const width = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(744);
    renderPage(named, busyDetail);
    expect(
      screen.getByRole("img", { name: "Aerial photo of Royal Crest Apartments" }),
    ).toHaveAttribute("data-loaded", "true");

    cleanup();
    width.mockReturnValue(0);
    renderPage(named, busyDetail);
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
    complete.mockRestore();
    width.mockRestore();
  });
});

it("notes a listing on the city's Repeat Offender list with its published figures", () => {
  renderPage(busy, busyDetail);

  const note = screen.getByText(
    "On the city's Repeat Offender list",
  ).closest("p");
  expect(note).toHaveTextContent(
    "On the city's Repeat Offender list Mia Riverside, 562 units. 0 active of 166 total violations.",
  );
});

it("counts a single registered unit in the singular", () => {
  renderPage(
    {
      ...busy,
      repeatOffender: { name: null, units: 1, activeViolations: 1, totalViolations: 1 },
    },
    busyDetail,
  );
  expect(
    screen.getByText("On the city's Repeat Offender list").closest("p"),
  ).toHaveTextContent("Registered property, 1 unit. 1 active of 1 total violations.");
});

it("keeps the full record whatever complaint type the map is filtered to", () => {
  renderPage(busy, busyDetail, {
    view: { ...DEFAULT_VIEW, category: "permit" },
  });

  expect(leadFigure()).toHaveTextContent("12 code cases in the last 12 months");
  expect(barRow("Structure condition")).toHaveTextContent("11");
  expect(barRow("Property upkeep")).toHaveTextContent("0");
  expect(barRow("Land use")).toHaveTextContent("1");
  expect(barRow("Work without permit")).toHaveTextContent("0");
});

it("renders one bar per month", () => {
  renderPage(busy, busyDetail);
  expect(screen.getAllByTestId("month-bar")).toHaveLength(
    busyDetail.monthly.length,
  );
  expect(screen.getByText("Busiest month: Sep 2025, 75 cases")).toBeVisible();
});

it("describes the month chart in words, naming the busiest month and its count", () => {
  renderPage(busy, busyDetail);
  expect(
    screen.getByRole("img", {
      name: "Code cases opened each month, Aug 2025 to Nov 2025. Busiest month: Sep 2025, with 75 cases.",
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
  expect(screen.getByText("Busiest month: Sep 2025, 1 case")).toBeVisible();
  expect(
    screen.getByRole("img", {
      name: "Code cases opened each month, Aug 2025 to Oct 2025. Busiest month: Sep 2025, with 1 case.",
    }),
  ).toBeVisible();
});

it("lists the latest cases with their date, type and status", () => {
  renderPage(busy, busyDetail);

  const items = within(
    screen.getByRole("region", { name: "Latest cases" }),
  ).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("May 20, 2026Structure conditionActive");
  expect(items[1]).toHaveTextContent("Apr 28, 2026Land useClosed");
});

it("says so when the 311 lookup fails, and keeps everything else", async () => {
  renderPage(busy, busyDetail, { city: networkFailure });

  expect(
    await screen.findByText(
      "311 requests could not be loaded from the city right now.",
    ),
  ).toBeVisible();
  expect(screen.getByText("What the cases were about")).toBeVisible();
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
      "Counted inside the rectangle around the parcel since Nov 2023, so some may belong to neighbors.",
    ),
  ).toBeVisible();
  expect(decodeURIComponent(String(fetchImpl.mock.calls[0][0]))).toContain(
    "within_box(sr_location_lat_long, 30.2408, -97.7308, 30.2361, -97.7277)",
  );
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
    await screen.findByRole("region", { name: "311 requests around this parcel" }),
  );
  await rows.findAllByText("Unspecified");
  expect(rows.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
    "Unspecified4",
    "Unspecified2",
  ]);
  expect(keyWarnings).not.toHaveBeenCalled();
  keyWarnings.mockRestore();
});

it("says when the city has no 311 requests in the area", async () => {
  renderPage(clean, cleanDetail, { city: ok([]) });
  expect(
    await screen.findByText("No 311 requests in this area since Nov 2023."),
  ).toBeVisible();
});

it("credits both city datasets and says what no cases means", () => {
  renderPage(clean, cleanDetail);

  expect(
    screen.getByRole("link", { name: "Austin Code Complaint Cases" }),
  ).toHaveAttribute("href", "https://data.austintexas.gov/d/6wtj-zbtb");
  expect(screen.getByRole("link", { name: "Austin 311" })).toHaveAttribute(
    "href",
    "https://data.austintexas.gov/d/xwdj-i9he",
  );
  expect(screen.getByText(/^From .*, City of Austin\./)).toHaveTextContent(
    "From Austin Code Complaint Cases and Austin 311, City of Austin. No cases means none reached Code Enforcement. It does not mean the building has no problems.",
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
    screen.getByRole("heading", { level: 2, name: "What the cases were about" }),
  ).toBeVisible();
  expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
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

it("never renders the words score, grade, rating or rank", async () => {
  renderPage(busy, busyDetail, {
    city: ok([{ sr_type_desc: "DSD - Request Code Officer", count: "262" }]),
  });
  await screen.findByText("DSD - Request Code Officer");
  expect(document.body.textContent).not.toMatch(/score|grade|rating|rank/i);
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
      "12 code cases in the last 12 months",
    );
    expect(
      screen.getByText("On the city's Repeat Offender list"),
    ).toBeVisible();
    expect(screen.getByText("open now").parentElement).toHaveTextContent("1");
    expect(screen.getByText("What the cases were about")).toBeVisible();
    expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
    expect(screen.queryByText("Latest cases")).toBeNull();
    expect(screen.getByText("Loading from the City of Austin")).toBeVisible();
  });

  it("heads the panel with the title over the gradient from the first moment, and adds the photo once the building file arrives", async () => {
    const { select } = renderOnMap(
      { ...busy, name: { text: "Royal Crest Apartments", source: "openstreetmap" } },
      { [HISTORY]: ok(busyDetail), "/data/buildings/R039648.json": pending },
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Royal Crest Apartments" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close building details" }),
    ).toBeVisible();

    expect(
      await screen.findByRole("img", { name: "Aerial photo of Royal Crest Apartments" }),
    ).toHaveAttribute("src", aerialPhotoUrl(busyDetail.bbox, 744, 400));

    select(clean);
    expect(
      screen.getByRole("heading", { level: 2, name: "9805 Copper Creek Dr" }),
    ).toBeVisible();
    expect(screen.queryByRole("img", { name: /^Aerial photo/ })).toBeNull();
  });

  it("draws the months and latest cases once the history arrives", async () => {
    renderOnMap(busy, { [HISTORY]: ok(busyDetail) });

    expect(await screen.findAllByTestId("month-bar")).toHaveLength(
      busyDetail.monthly.length,
    );
    expect(screen.getByText("Latest cases")).toBeVisible();
  });

  it("says the history could not be loaded and keeps the counts", async () => {
    const { fetchImpl } = renderOnMap(busy, { [HISTORY]: status(404) });

    expect(
      await screen.findByText(
        "This building's history could not be loaded. The counts above are still current.",
      ),
    ).toBeVisible();
    expect(leadFigure()).toHaveTextContent(
      "12 code cases in the last 12 months",
    );
    expect(screen.getByText("What the cases were about")).toBeVisible();
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
      await screen.findByText("No code cases since Nov 2023."),
    ).toBeVisible();

    await act(async () =>
      finishFirst(new Response(JSON.stringify(busyDetail))),
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "9805 Copper Creek Dr",
    );
    expect(screen.queryAllByTestId("month-bar")).toHaveLength(0);
    expect(screen.getByText("No code cases since Nov 2023.")).toBeVisible();
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
      screen.getByRole("heading", { level: 3, name: "What the cases were about" }),
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
