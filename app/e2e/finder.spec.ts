import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

interface ComplexRecord {
  id: string;
  parcelIds: string[];
  address: string;
  name: { text: string } | null;
  acres: number;
  repeatOffender: object | null;
  tally: Record<"m12" | "y2" | "y3", Record<string, Record<string, number>>>;
}

interface MetaRecord {
  pulledAt: string;
  complexCount: number;
}

/** The same files the build read, so expectations follow whatever data was pulled. */
function readData<T>(name: string): T {
  const file = fileURLToPath(
    new URL(`../public/data/${name}`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const complexes = readData<ComplexRecord[]>("complexes.json");
const meta = readData<MetaRecord>("meta.json");

const pullDate = new Date(`${meta.pulledAt}T12:00:00Z`).toLocaleDateString(
  "en-US",
  {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  },
);

const NOT_OFFICIAL = "Not an official City of Austin site";
const NO_MAP_SENTENCE =
  "The map could not load on this device. You can still browse the list below.";
const CAUTION =
  "No complaints means none reached Code Enforcement. It does not mean the building has no problems.";
const COMPLEX_WITH_RECORD = "0304070701";
const FOOTPRINTS = "https://data.austintexas.gov/resource/3qcc-8uhz.json**";
const AERIAL_PHOTOS = "https://imagery.nationalmap.gov/**";
/** One navy pixel, standing in for the USGS aerial photo. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgFpYHAABqAD4U+VRBAAAAAElFTkSuQmCC",
  "base64",
);

const titleOf = (complex: ComplexRecord) =>
  complex.name?.text ?? complex.address;
/** Every complaint in a period's tally, as the site counts them: duplicates are never in a tally. */
const complaintsIn = (
  complex: ComplexRecord,
  period: keyof ComplexRecord["tally"],
) =>
  Object.values(complex.tally[period])
    .flatMap((outcomes) => Object.values(outcomes))
    .reduce((sum, count) => sum + count, 0);
const formatAcres = (acres: number) =>
  acres < 0.1
    ? "under 0.1 acres"
    : `${acres} ${acres === 1 ? "acre" : "acres"}`;

/** A named complex on one parcel whose name no other complex's name or address contains, so a search for it finds it alone. */
const NAMED = complexes.find((complex) => {
  const name = complex.name?.text.toLowerCase();
  if (!name || complex.parcelIds.length > 1) return false;
  const containing = complexes.filter((other) =>
    [other.name?.text, other.address].some((text) =>
      text?.toLowerCase().includes(name),
    ),
  );
  return containing.length === 1;
});

/** The city's APIs are live and not ours, so every test answers them itself. */
async function stubCity(page: Page) {
  await page.route(
    "https://data.austintexas.gov/resource/9s7j-tygf.json**",
    (route) =>
      route.fulfill({
        json: [
          {
            full_street_name: "100 ZZYZX RD",
            the_geom: { type: "Point", coordinates: [-97.74, 30.27] },
          },
        ],
      }),
  );
  await page.route(
    "https://data.austintexas.gov/resource/xwdj-i9he.json**",
    (route) =>
      route.fulfill({
        json: [{ sr_type_desc: "Street Light Issue", count: "2" }],
      }),
  );
  // No surveyed shapes, so the map stands up whatever buildings its own tiles hold.
  await page.route(FOOTPRINTS, (route) => route.fulfill({ json: [] }));
  await page.route(AERIAL_PHOTOS, (route) =>
    route.fulfill({ contentType: "image/png", body: PHOTO }),
  );
}

async function withoutMap(page: Page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
}

interface Stop {
  kind: "search" | "filter" | "map" | "card" | "other";
  label: string;
  /** An outline or box shadow, on the element or on the wrapper that takes its focus ring. */
  ringed: boolean;
}

/** Presses Tab and describes where focus landed, or null when it left the page's own elements. */
async function pressTab(page: Page): Promise<Stop | null> {
  await page.keyboard.press("Tab");
  return page.evaluate((): Stop | null => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const shows = (target: Element) => {
      const style = getComputedStyle(target);
      const outlined =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      return outlined || style.boxShadow !== "none";
    };
    const wrapper = element.closest("[class*='focus-within']");
    const kind: Stop["kind"] =
      element.getAttribute("role") === "combobox"
        ? "search"
        : element.classList.contains("maplibregl-canvas")
          ? "map"
          : element.getAttribute("data-testid") === "card"
            ? "card"
            : element.hasAttribute("aria-pressed")
              ? "filter"
              : "other";
    return {
      kind,
      label:
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 30) ??
        "",
      ringed: shows(element) || (wrapper !== null && shows(wrapper)),
    };
  });
}

const cards = (page: Page) => page.getByTestId("card");
const panel = (page: Page) => page.getByRole("complementary");
const trayCount = (page: Page) =>
  page.getByRole("region", { name: /complexes? in/ }).locator("strong");

async function readCount(locator: Locator): Promise<number> {
  return Number((await locator.innerText()).replace(/,/g, ""));
}

/** The tray lists every complex until the map reports where it is looking, so a smaller count means the map has started. */
async function waitForMap(page: Page) {
  await expect
    .poll(() => readCount(trayCount(page)))
    .toBeLessThan(meta.complexCount);
}

const onPhone = () => test.info().project.name === "phone";
const search = (page: Page) => page.getByRole("combobox");

const spotlit = (page: Page, id: string) =>
  page.locator(`[data-spotlight="${id}"]`);
const labels = (page: Page) => page.locator(".spotlight-label");
const cardIds = (page: Page) =>
  cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-complex-id")),
  );

function recordOf(id: string): ComplexRecord {
  const complex = complexes.find((candidate) => candidate.id === id);
  if (!complex) throw new Error(`${id} is not in the data`);
  return complex;
}

/** Picks a complex from the search box by its name or address; its suggestion carries its address either way. */
async function pickFromSearch(
  page: Page,
  text: string,
  complex: ComplexRecord,
) {
  await page.getByRole("combobox").fill(text);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(complex.address, { exact: true }) })
    .click();
}

async function openFirstCard(page: Page): Promise<string> {
  const id = await cards(page).first().getAttribute("data-complex-id");
  expect(id).not.toBeNull();
  await cards(page).first().click();
  await expect(panel(page)).toBeVisible();
  return id as string;
}

test.beforeEach(async ({ page }) => {
  await stubCity(page);
});

test("pick an area, open a building, see its record", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const before = await readCount(trayCount(page));

  // The area shortcuts are hidden on a phone, where the map is moved by hand.
  const isPhone = (page.viewportSize()?.width ?? 0) <= 760;
  if (!isPhone) {
    await page.getByRole("button", { name: "East Riverside" }).click();
    await expect.poll(() => readCount(trayCount(page))).not.toBe(before);
  }
  await expect(page.getByText(/complexes in view/)).toBeVisible();

  await page.getByRole("button", { name: "Fewest first" }).click();
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();

  const first = cards(page).first();
  const cardText = await first.innerText();
  await first.click();
  await expect(page.getByText("What the complaints were about")).toBeVisible();
  const heading = await panel(page)
    .getByRole("heading", { level: 2 })
    .innerText();
  expect(cardText).toContain(heading);
  await expect(page.locator("body")).not.toContainText(/code case/i);
});

test("a card's figure is its record's lead figure, in each of the three periods", async ({
  page,
}) => {
  for (const [query, phrase] of [
    ["", "in the last 12 months"],
    ["period=2y&", "in the last 2 years"],
    ["period=3y&", "in the last 3 years"],
  ]) {
    await page.goto(`/?${query}order=most`);
    await waitForMap(page);
    const first = cards(page).first();
    const figure = (await first.innerText()).split("\n")[0];
    expect(figure, query).toMatch(/^\d[\d,]*$/);
    await first.click();
    await expect(panel(page).getByText(phrase, { exact: true })).toBeVisible();
    await expect(
      panel(page).getByText(phrase, { exact: true }).locator("xpath=../.."),
    ).toContainText(new RegExp(`^${figure} complaints? `));
  }
});

test("a filtered view survives a reload", async ({ page }) => {
  await page.goto("/?period=3y&order=most");
  await expect(page.getByRole("button", { name: "3 years" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "3 years" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();
});

test("the address bar names 2 and 3 years, and a retired period falls back to 12 months and is dropped on the next change", async ({
  page,
}) => {
  await page.goto("/?period=cases&order=most");
  await expect(page.getByRole("button", { name: "12 months" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();

  await page.getByRole("button", { name: "2 years" }).click();
  await expect(page).toHaveURL(/\/\?period=2y&order=most$/);
  await page.getByRole("button", { name: "3 years" }).click();
  await expect(page).toHaveURL(/\/\?period=3y&order=most$/);
  await page.getByRole("button", { name: "12 months" }).click();
  await expect(page).toHaveURL(/\/\?order=most$/);
});

test("the building panel takes focus, closes on Escape and hands focus back to its card", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMap(page);

  const id = await openFirstCard(page);
  await expect(panel(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(
    page.locator(`[data-testid="card"][data-complex-id="${id}"]`),
  ).toBeFocused();
});

test("with suggestions open, the first Escape closes only the suggestions", async ({
  page,
}) => {
  test.skip(
    onPhone(),
    "On a phone the search steps aside while a building is open.",
  );
  await page.goto("/");
  await waitForMap(page);
  await openFirstCard(page);

  await page.getByRole("combobox").fill("Zzyzx");
  await expect(
    page.getByRole("option", { name: /100 Zzyzx Rd/i }),
  ).toBeVisible();

  // Both the search and the panel listen on the document. The panel must not hear this one.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
});

test("a building page is reachable directly", async ({ page }) => {
  const complex = complexes.find(({ id }) => id === COMPLEX_WITH_RECORD);
  expect(complex, `${COMPLEX_WITH_RECORD} is in the data`).toBeDefined();

  await page.goto(`/building/${COMPLEX_WITH_RECORD}`);
  if (!complex) return;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    titleOf(complex),
  );
  await expect(page).toHaveTitle(
    complex.name
      ? `${complex.name.text}, ${complex.address}: code complaint record`
      : `${complex.address}: code complaint record`,
  );
  await expect(
    page.getByRole("link", { name: "Back to the map" }),
  ).toHaveAttribute("href", "/");
  await expect(page.getByText("What the complaints were about")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/code case/i);

  // The stubbed photo answers at once, often before the page is hydrated, and must still be taken.
  const photo = page.getByRole("img", { name: /^Aerial photo of / });
  await expect(photo).toHaveAttribute("data-loaded", "true");
  // With no close button on the page, the credit sits in the header's corner.
  const header = await photo.locator("..").boundingBox();
  const credit = await page.getByText("Aerial photo: USGS").boundingBox();
  expect(credit && header && credit.y - header.y).toBe(14);
});

test("an unknown building id is a 404 that leads back to the map", async ({
  page,
}) => {
  const response = await page.goto("/building/0000000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "That page does not exist.",
  );
  await expect(
    page.getByRole("link", { name: "Back to the map" }),
  ).toHaveAttribute("href", "/");
  await expect(page.getByText(NOT_OFFICIAL)).toBeVisible();
});

test("a property listed under several parcels has one suggestion and one record", async ({
  page,
}) => {
  const merged = complexes.find(({ parcelIds }) => parcelIds.length > 1);
  expect(merged, "the data has a complex of several parcels").toBeDefined();
  if (!merged) return;
  const others = merged.parcelIds.filter((id) => id !== merged.id);

  await page.goto("/");
  await waitForMap(page);
  await page.getByRole("combobox").fill(merged.address);
  const suggestions = page
    .getByRole("option")
    .filter({ hasText: "apartments" });
  await expect(suggestions.first()).toBeVisible();
  await expect(suggestions.filter({ hasText: merged.address })).toHaveCount(1);

  const response = await page.goto(`/building/${others[0]}`);
  expect(response?.status(), "a member parcel has no page of its own").toBe(
    404,
  );
});

test("the method page states the caution and links back to the map", async ({
  page,
}) => {
  await page.goto("/method");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Method and sources",
  );
  await expect(page.getByText(CAUTION)).toBeVisible();
  await expect(
    page.getByText(`This copy of the data was pulled on ${pullDate}.`),
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Building Record" }),
  ).toBeVisible();
});

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
]) {
  test(`the method page shows the outcome table and does not scroll sideways on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/method");

    const table = page.getByRole("table", { name: /City outcome phrases/ });
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("rowheader", { name: "Violation confirmed" }),
    ).toBeVisible();
    await expect(
      table.getByRole("rowheader", { name: "Not counted: duplicate report" }),
    ).toBeVisible();
    await expect(
      table
        .getByRole("listitem")
        .filter({ hasText: /^Closed\/Duplicate Case$/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "How far back it goes" }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `the method page overflows by ${overflow}px`,
    ).toBeLessThanOrEqual(0);
  });
}

test("every page carries the not-official notice, the pull date and the way to the method page", async ({
  page,
}) => {
  for (const path of ["/", `/building/${COMPLEX_WITH_RECORD}`, "/method"]) {
    await page.goto(path);
    const notice = page.getByText(NOT_OFFICIAL);
    await expect(notice, path).toBeVisible();
    await expect(notice, path).toContainText(`Data pulled ${pullDate}`);
    await expect(
      notice.getByRole("link", { name: "Method and sources" }),
      path,
    ).toHaveAttribute("href", "/method");
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a Repeat Offender card with a three-digit figure keeps its figure and chip apart and inside the card", async ({
    page,
  }) => {
    const busiest = complexes
      .filter((complex) => complex.repeatOffender !== null)
      .sort((a, b) => complaintsIn(b, "y3") - complaintsIn(a, "y3"))[0];
    expect(
      complaintsIn(busiest, "y3"),
      "the busiest Repeat Offender has a three-digit figure",
    ).toBeGreaterThanOrEqual(100);

    // Without the map the list holds every complex in Austin, so the busiest one is first.
    await withoutMap(page);
    await page.goto("/?period=3y&order=most&ro=1");
    const card = page.locator(
      `[data-testid="card"][data-complex-id="${busiest.id}"]`,
    );
    await expect(card).toContainText(String(complaintsIn(busiest, "y3")));

    const chip = card.getByTitle("Repeat Offender");
    await expect(chip).toContainText("Repeat Offender");
    const [cardBox, chipBox, figureBox] = await Promise.all([
      card.boundingBox(),
      chip.boundingBox(),
      card
        .getByText(String(complaintsIn(busiest, "y3")), { exact: true })
        .boundingBox(),
    ]);
    if (!cardBox || !chipBox || !figureBox)
      throw new Error("The card is not on screen");
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width,
    );
    expect(chipBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(figureBox.x + figureBox.width).toBeLessThan(chipBox.x);

    // Every card keeps one height, whatever its lines.
    const heights = await cards(page).evaluateAll((elements) =>
      elements
        .slice(0, 12)
        .map((element) => element.getBoundingClientRect().height),
    );
    expect(new Set(heights).size).toBe(1);
  });

  test("nothing scrolls sideways", async ({ page }) => {
    for (const path of ["/", `/building/${COMPLEX_WITH_RECORD}`, "/method"]) {
      await page.goto(path);
      await expect(page.getByText(NOT_OFFICIAL), path).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `${path} overflows sideways by ${overflow}px`,
      ).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("when the map cannot start", () => {
  test.beforeEach(async ({ page }) => {
    await withoutMap(page);
  });

  test("the tray and building pages work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(NO_MAP_SENTENCE)).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Downtown" })).toHaveCount(0);

    await page.goto(`/building/${COMPLEX_WITH_RECORD}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the list starts under the title block and filters and ends above the notice", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(NO_MAP_SENTENCE)).toBeVisible();
    await expect(cards(page).first()).toBeVisible();

    const viewport = page.viewportSize();
    const intro = await page.locator("header").boundingBox();
    const sentence = await page.getByText(NO_MAP_SENTENCE).boundingBox();
    const card = await cards(page).first().boundingBox();
    const notice = await page.getByText(NOT_OFFICIAL).boundingBox();
    if (!viewport || !intro || !sentence || !card || !notice)
      throw new Error("Something is not on screen");

    expect(sentence.y).toBeGreaterThanOrEqual(intro.y + intro.height);
    expect(card.y).toBeLessThan(sentence.y + sentence.height + 120);
    // The list scrolls inside the space above the notice, and a second row is already in sight on a desktop.
    expect(card.y + card.height).toBeLessThanOrEqual(notice.y);
    if (viewport.width > 760) {
      const second = await cards(page).nth(10).boundingBox();
      expect(second && second.y + second.height).toBeLessThanOrEqual(notice.y);
    }
  });

  test("Show 40 more reveals more cards, and filters and order still apply", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(cards(page)).toHaveCount(40);
    await expect(
      page.getByText(
        `Showing 40 of ${meta.complexCount.toLocaleString("en-US")}`,
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show 40 more" }).click();
    await expect(cards(page)).toHaveCount(80);

    // A new order starts again at 40.
    await page.getByRole("button", { name: "Fewest first" }).click();
    await expect(
      page.getByRole("button", { name: "Most first" }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(40);

    await page.getByRole("button", { name: "Grounds", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Grounds", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page).first()).toBeVisible();
  });

  test("a card opens its record, and search offers complexes only", async ({
    page,
  }) => {
    const askedTheCity: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("9s7j-tygf")) askedTheCity.push(request.url());
    });

    await page.goto("/");
    await expect(page.getByText(NO_MAP_SENTENCE)).toBeVisible();

    const wanted = complexes[0].address.slice(0, 4);
    await page.getByRole("combobox").fill(wanted);
    await expect(page.getByRole("option").first()).toBeVisible();
    await expect(
      page.getByRole("option").filter({ hasNotText: "apartments" }),
    ).toHaveCount(0);
    expect(askedTheCity).toEqual([]);

    await page.getByRole("combobox").fill("");
    await cards(page).first().click();
    await expect(
      page.getByText("What the complaints were about"),
    ).toBeVisible();
    await expect(panel(page)).toBeFocused();
    // No map, so nothing is staged, but the record still has its photo.
    await expect(
      panel(page).getByRole("img", { name: /^Aerial photo of / }),
    ).toHaveAttribute("data-loaded", "true");
    await expect(page.locator("[data-spotlight]")).toHaveCount(0);
  });

  test("Tab runs search, filters, order, cards, Show 40 more and the method link, each with a focus indicator", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(NO_MAP_SENTENCE)).toBeVisible();
    await expect(cards(page).first()).toBeVisible();

    const labels: string[] = [];
    for (let press = 0; press < 120; press += 1) {
      const stop = await pressTab(page);
      if (!stop) continue;
      expect(stop.ringed, `"${stop.label}" shows a focus indicator`).toBe(true);
      labels.push(stop.kind === "card" ? "card" : stop.label);
      if (stop.label === "Method and sources") break;
    }

    const at = (label: string) => labels.indexOf(label);
    expect(at("Search an Austin address"), "search comes first").toBe(0);
    expect(at("12 months")).toBeGreaterThan(at("Search an Austin address"));
    expect(at("Fewest first")).toBeGreaterThan(at("12 months"));
    expect(at("card")).toBeGreaterThan(at("Fewest first"));
    expect(at("Show 40 more")).toBeGreaterThan(at("card"));
    expect(at("Method and sources")).toBeGreaterThan(at("Show 40 more"));
  });
});

test("with the map running, Tab goes search, filters, map, then the first card, each with a focus indicator", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMap(page);

  const stops: Stop[] = [];
  for (let press = 0; press < 60; press += 1) {
    const stop = await pressTab(page);
    if (!stop) continue;
    stops.push(stop);
    if (stop.kind === "card") break;
  }

  const first = (kind: Stop["kind"]) =>
    stops.findIndex((stop) => stop.kind === kind);
  const search = first("search");
  const filter = first("filter");
  const map = first("map");
  const card = first("card");
  expect(search, "the first Tab lands on the search box").toBe(0);
  expect(filter).toBeGreaterThan(search);
  expect(map).toBeGreaterThan(filter);
  expect(card).toBeGreaterThan(map);

  for (const index of [search, filter, map, card]) {
    expect(
      stops[index].ringed,
      `"${stops[index].label}" shows a focus indicator`,
    ).toBe(true);
  }
});

test.describe("a picked building", () => {
  test.beforeAll(() => {
    expect(
      NAMED,
      "the data has a complex with a name only it carries",
    ).toBeDefined();
  });

  test("stands forward on the map, and its record is headed by its name, address and aerial photo", async ({
    page,
  }) => {
    if (!NAMED?.name) return;
    await page.goto("/");
    await waitForMap(page);
    await pickFromSearch(page, NAMED.address, NAMED);

    await expect(spotlit(page, NAMED.id)).toBeAttached();
    await expect(labels(page)).toHaveText(NAMED.name.text);
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
      NAMED.name.text,
    );
    await expect(
      panel(page).getByText(`${NAMED.address}, ${formatAcres(NAMED.acres)}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("img", {
        name: `Aerial photo of ${NAMED.name.text}`,
      }),
    ).toHaveAttribute("data-loaded", "true");
    await expect(panel(page).getByText("Aerial photo: USGS")).toBeVisible();
  });

  test("is found by its name", async ({ page }) => {
    if (!NAMED?.name) return;
    await page.goto("/");
    await waitForMap(page);
    await page.getByRole("combobox").fill(NAMED.name.text);

    const suggestion = page
      .getByRole("option")
      .filter({ hasText: NAMED.address });
    await expect(suggestion).toContainText(NAMED.name.text);
    await expect(suggestion).toContainText("apartments");
    await suggestion.click();
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
      NAMED.name.text,
    );
    await expect(spotlit(page, NAMED.id)).toBeAttached();
  });

  test("leaves on Escape: the model goes, the tray counts what it did before the pick, then follows the map again", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForMap(page);
    const before = await trayCount(page).innerText();

    const id = await openFirstCard(page);
    await expect(spotlit(page, id)).toBeAttached();
    await page.keyboard.press("Escape");

    await expect(page.locator("[data-spotlight]")).toHaveCount(0);
    await expect(labels(page)).toHaveCount(0);
    await expect(trayCount(page)).toHaveText(before);

    // A tray still holding would not follow a camera move the screen did not ask for, such as a smaller window.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height - 220,
    });
    await expect(trayCount(page)).not.toHaveText(before);
    await page.setViewportSize(viewport);

    if (!onPhone()) {
      const settled = await trayCount(page).innerText();
      await page.getByRole("button", { name: "Downtown" }).click();
      await expect(trayCount(page)).not.toHaveText(settled);
    }
  });

  test("hands focus back to the search on closing, when the tray has no card for the building", async ({
    page,
  }) => {
    if (!NAMED) return;
    await page.goto("/");
    await waitForMap(page);
    expect(await cardIds(page)).not.toContain(NAMED.id);

    await pickFromSearch(page, NAMED.address, NAMED);
    await expect(spotlit(page, NAMED.id)).toBeAttached();
    await expect(panel(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(search(page)).toBeFocused();
  });

  test("on a phone steps the search and filters aside while it is open, and on a desktop leaves them", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForMap(page);
    const period = page.getByRole("button", { name: "12 months" });

    await openFirstCard(page);
    await expect(panel(page)).toBeFocused();
    if (onPhone()) {
      await expect(search(page)).toBeHidden();
      await expect(period).toBeHidden();
      // Not reachable by Tab either: from the panel, Shift+Tab never lands in them. Found by CSS, since a hidden box has no role.
      await page.keyboard.press("Shift+Tab");
      const searchBox = page.locator('input[type="search"]');
      expect(
        await searchBox.evaluate((input) => input === document.activeElement),
      ).toBe(false);
    } else {
      await expect(search(page)).toBeVisible();
      await expect(period).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(search(page)).toBeVisible();
    await expect(period).toBeVisible();
  });

  test("keeps the tray's cards while it is open, though the camera moves", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForMap(page);
    const before = {
      ids: await cardIds(page),
      count: await trayCount(page).innerText(),
    };

    const id = await openFirstCard(page);
    await expect(spotlit(page, id)).toBeAttached();
    // Unchanging is only shown over time: let the camera fly in and start to turn.
    await page.waitForTimeout(3_000);

    expect(await cardIds(page)).toEqual(before.ids);
    await expect(trayCount(page)).toHaveText(before.count);
  });

  test("picked and then replaced straight away leaves one label, for the second", async ({
    page,
  }) => {
    test.skip(
      onPhone(),
      "On a phone the record sheet covers the tray and the search steps aside, so no second pick is in reach.",
    );
    await page.goto("/");
    await waitForMap(page);
    const [, secondId] = await cardIds(page);
    expect(secondId).toBeTruthy();
    const second = recordOf(secondId ?? "");

    await cards(page).first().click();
    await cards(page).nth(1).click();

    await expect(spotlit(page, second.id)).toBeAttached();
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toHaveText(titleOf(second));
  });

  test("still opens its full record and stands forward when the city's building footprints fail", async ({
    page,
  }) => {
    await page.route(FOOTPRINTS, (route) => route.fulfill({ status: 500 }));
    await page.goto("/");
    await waitForMap(page);

    const askedForFootprints = page.waitForRequest(/3qcc-8uhz/);
    const id = await openFirstCard(page);
    await askedForFootprints;

    await expect(spotlit(page, id)).toBeAttached();
    await expect(
      panel(page).getByText("What the complaints were about"),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("region", { name: "Month by month" }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Loading from the City of Austin"),
    ).toHaveCount(0);
  });

  test("keeps its name over the header's gradient, with no image, when the aerial photo fails", async ({
    page,
  }) => {
    if (!NAMED?.name) return;
    await page.route(AERIAL_PHOTOS, (route) => route.fulfill({ status: 500 }));
    await page.goto("/");
    await waitForMap(page);

    const photoAnswered = page.waitForResponse(/imagery\.nationalmap\.gov/);
    await pickFromSearch(page, NAMED.address, NAMED);
    await photoAnswered;

    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
      NAMED.name.text,
    );
    await expect(panel(page).locator("img")).toHaveCount(0);
    await expect(panel(page).getByText("Aerial photo: USGS")).toHaveCount(0);
  });

  test("fades its photo in, and not for someone who asked for less motion", async ({
    page,
  }) => {
    if (!NAMED) return;
    await page.goto("/");
    await waitForMap(page);
    await pickFromSearch(page, NAMED.address, NAMED);

    const photo = panel(page).getByRole("img", { name: /^Aerial photo of / });
    await expect(photo).toHaveAttribute("data-loaded", "true");
    const fade = () =>
      photo.evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(await fade()).toBe("0.7s");

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await fade()).toBe("0s");
  });
});
