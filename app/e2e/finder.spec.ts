import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

interface ComplexRecord {
  id: string;
  parcelIds: string[];
  address: string;
  name: { text: string } | null;
  acres: number;
  repeatOffender: {
    recorded: {
      families: { family: string; count: number; notCleared: number }[];
    } | null;
  } | null;
  tally: Record<"m12" | "y2" | "y3", Record<string, Record<string, number>>>;
}

interface BuildingRecord {
  complaints: {
    category: string;
    violationCase: { number: string; url: string | null } | null;
  }[];
  deficiencies: { category: string }[];
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
/** An unnamed complex whose label is long: "Parcel 0201520114, near 4612 Sojourner St". */
const LONG_LABEL = "0201520114";
const FOOTPRINTS = "https://data.austintexas.gov/resource/3qcc-8uhz.json**";
const AERIAL_PHOTOS = "https://maps.austintexas.gov/image/**";
/** One navy pixel, standing in for the city's aerial photo. */
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
/** Complaints of one type in a period's tally. */
const complaintsOfType = (
  complex: ComplexRecord,
  period: keyof ComplexRecord["tally"],
  category: string,
) =>
  Object.values(complex.tally[period][category] ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
const formatAcres = (acres: number) =>
  acres < 0.1
    ? "under 0.1 acres"
    : `${acres} ${acres === 1 ? "acre" : "acres"}`;

/** The complex with the longest title in the data. */
const LONGEST_TITLE = complexes.reduce((longest, complex) =>
  titleOf(complex).length > titleOf(longest).length ? complex : longest,
);

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

/** The count takes in every complex until the map reports where it is looking, so a smaller count means the map has started. */
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

/** Where a pin with complaints is in the open middle of the map: the pointer there turns to a hand and opens the pin's tooltip. */
function findPin(page: Page) {
  return page.evaluate(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>(".maplibregl-canvas");
    if (!canvas) return null;
    const { innerWidth: width, innerHeight: height } = window;
    for (let y = Math.round(height * 0.35); y < height * 0.7; y += 6) {
      for (let x = 40; x < width - 40; x += 6) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        canvas.dispatchEvent(
          new MouseEvent("mousemove", {
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
        const said = document.querySelector(".pin-tooltip")?.textContent ?? "";
        if (
          canvas.style.cursor === "pointer" &&
          !said.endsWith("no complaints")
        )
          return { x, y };
      }
    }
    return null;
  });
}

/**
 * Picks a building by its pin, and returns what the pin's tooltip said: "address: N complaints". The pins draw a
 * moment after the map first reports, and the camera may still be easing back from a building, so it looks again
 * until a pick takes.
 */
async function pickFromMap(page: Page): Promise<string> {
  let said = "";
  await expect(async () => {
    const pin = await findPin(page);
    expect(
      pin,
      "a pin with complaints in the open part of the map",
    ).not.toBeNull();
    if (!pin) return;
    await page.mouse.move(pin.x, pin.y);
    said = (await page.locator(".pin-tooltip").innerText()).trim();
    await page.mouse.click(pin.x, pin.y);
    await expect(panel(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return said;
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

test("pick an area, open a building from its pin, see its record", async ({
  page,
}) => {
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

  const said = await pickFromMap(page);
  await expect(
    panel(page).getByRole("list", { name: "What the record shows" }),
  ).toBeVisible();
  // The tooltip names the pin's address, and the record gives it under its title.
  await expect(panel(page)).toContainText(said.slice(0, said.lastIndexOf(":")));
  await expect(page.locator("body")).not.toContainText(/code case/i);
});

test("the map screen has no cards: its count says how many in view have no complaints, with the area shortcuts beside it on a desktop", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMap(page);

  const leftOut = page.getByText(/^[\d,]+ with no complaints$/);
  await expect(leftOut).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(Fewest|Most) first$/ }),
  ).toHaveCount(0);

  const shortcuts = page.getByRole("navigation", { name: "Jump to an area" });
  if (onPhone()) {
    await expect(shortcuts).toBeHidden();
    return;
  }
  const [note, downtown, notice] = await Promise.all([
    leftOut.boundingBox(),
    shortcuts.getByRole("button", { name: "Downtown" }).boundingBox(),
    page.getByText(NOT_OFFICIAL).boundingBox(),
  ]);
  if (!note || !downtown || !notice)
    throw new Error("Something is not on screen");
  // On one row, the shortcuts after the pill, and the notice below them both.
  expect(downtown.x).toBeGreaterThan(note.x + note.width);
  expect(
    Math.abs(downtown.y + downtown.height / 2 - (note.y + note.height / 2)),
  ).toBeLessThan(4);
  expect(notice.y).toBeGreaterThan(downtown.y + downtown.height);
});

test("hands focus back to the search even when Escape lands in the commit that stages the model", async ({
  page,
}) => {
  // The map's wrapper gets data-spotlight in that commit. A MutationObserver runs right after it and before
  // React has run its effects, which is where a busy machine can deliver a keypress.
  await page.addInitScript(() => {
    const observer = new MutationObserver((records) => {
      if (
        !records.some((record) =>
          (record.target as Element).hasAttribute("data-spotlight"),
        )
      )
        return;
      observer.disconnect();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    document.addEventListener("DOMContentLoaded", () =>
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-spotlight"],
        subtree: true,
      }),
    );
  });
  const complex = recordOf(COMPLEX_WITH_RECORD);
  await page.goto("/");
  await waitForMap(page);

  await pickFromSearch(page, complex.address, complex);
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("[data-spotlight]")).toHaveCount(0);
  await expect(search(page)).toBeFocused();
});

test("with suggestions open, the first Escape closes only the suggestions", async ({
  page,
}) => {
  test.skip(
    onPhone(),
    "On a phone the search steps aside while a building is open.",
  );
  const complex = recordOf(COMPLEX_WITH_RECORD);
  await page.goto("/");
  await waitForMap(page);
  await pickFromSearch(page, complex.address, complex);
  await expect(panel(page)).toBeVisible();

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
  await expect(
    page.getByRole("list", { name: "What the record shows" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/code case/i);
  // The page is the building's full record, so it leads with the 3 years.
  await expect(
    page
      .getByText("in the last 3 years", { exact: true })
      .locator("xpath=../.."),
  ).toContainText(complaintsIn(complex, "y3").toLocaleString("en-US"));
  // Under the figure, how the whole city's counts spread over the same 3 years.
  await expect(
    page.getByText(
      /^Across Austin, \d+% of apartment complexes had no complaints in the last 3 years, and 9 in 10 had \d+ or fewer\.$/,
    ),
  ).toBeVisible();

  // The stubbed photo answers at once, often before the page is hydrated, and must still be taken.
  const photo = page.getByRole("img", { name: /^Aerial photo of / });
  await expect(photo).toHaveAttribute("data-loaded", "true");
  // With no close button on the page, the credit sits in the header's corner.
  const header = await photo.locator("..").boundingBox();
  const credit = await page.getByText("Aerial photo: City of Austin").boundingBox();
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

/** A step of the method page, found by its title. */
const methodStep = (page: Page, title: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) });

/** Opens the full rules folded under a step of the method page. */
async function openRules(page: Page, title: string) {
  await methodStep(page, title)
    .getByText("The full rules for this step")
    .click();
}

test("the method page states the caution and links back to the map", async ({
  page,
}) => {
  await page.goto("/method");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Method and sources",
  );
  // Said in the last step itself, before any rules are opened.
  await expect(
    methodStep(page, "What the record cannot tell you")
      .getByText(CAUTION)
      .first(),
  ).toBeVisible();
  await openRules(page, "It is counted by the day it was opened");
  await expect(
    page.getByText(`This copy of the data was pulled on ${pullDate}.`),
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Building Record" }),
  ).toBeVisible();
});

test("the method page follows one complaint: its card fills in as the steps are reached, and changes with what is tried", async ({
  page,
}) => {
  await page.goto("/method");
  const card = page.getByRole("complementary", {
    name: "The complaint you are following",
  });
  await expect(card).toContainText("Building condition");
  await expect(card).toContainText("Step 1 of 6");
  // What a later step finds out is not on the card yet.
  await expect(card.getByText("The city found")).toHaveCount(0);

  const found = methodStep(page, "The city says what it found");
  await found.scrollIntoViewIfNeeded();
  await found.getByLabel("The city's phrase").scrollIntoViewIfNeeded();
  await expect(card.getByText("Violation confirmed")).toBeVisible();

  // Trying something changes the complaint everywhere it is shown.
  await found
    .getByLabel("The city's phrase")
    .selectOption("Closed/Duplicate Case");
  await expect(found.getByText(/^Rule 1 of 6 decides it\./)).toBeVisible();
  await expect(
    card.getByText("A duplicate of another complaint"),
  ).toBeVisible();

  const recorded = methodStep(page, "It joins the building's record");
  await recorded.scrollIntoViewIfNeeded();
  await expect(
    recorded.getByText(
      "The complaint you are following is not in this record: the city closed it as a duplicate.",
    ),
  ).toBeVisible();
  await methodStep(page, "What the record cannot tell you")
    .getByRole("link", { name: "Austin Code Complaint Cases" })
    .scrollIntoViewIfNeeded();
  await expect(
    card.getByText("No: the city closed it as a duplicate"),
  ).toBeVisible();
  await expect(card).toContainText("Step 6 of 6");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the method page holds still for a reader who asked for less motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/method");
  const figure = page.locator(".journey-figure").first();
  await expect(figure).toBeVisible();
  expect(
    await figure.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await expect(page.locator(".journey-progress")).toBeHidden();
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

    // The table is part of the full rules, which stay folded until a reader opens them.
    const table = page.getByRole("table", { name: /City outcome phrases/ });
    await expect(table).toBeHidden();
    await openRules(page, "The city says what it found");
    await openRules(page, "It is counted by the day it was opened");
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
    // The list gives a card only to a complex with complaints in the period, and says how many have none.
    const withComplaints = complexes.filter(
      (complex) => complaintsIn(complex, "m12") > 0,
    ).length;
    await page.goto("/");
    await expect(cards(page)).toHaveCount(40);
    await expect(
      page.getByText(`Showing 40 of ${withComplaints.toLocaleString("en-US")}`),
    ).toBeVisible();
    await expect(
      page.getByText(
        `${(meta.complexCount - withComplaints).toLocaleString("en-US")} with no complaints`,
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
    // The fewest-first card may have no complaints at all, and then the record lists no types, so its lead is what is sure to be there.
    await expect(
      panel(page).getByText("in the last 12 months", { exact: true }),
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
    expect(at("Search an address or building name"), "search comes first").toBe(
      0,
    );
    expect(at("12 months")).toBeGreaterThan(
      at("Search an address or building name"),
    );
    expect(at("Fewest first")).toBeGreaterThan(at("12 months"));
    expect(at("card")).toBeGreaterThan(at("Fewest first"));
    expect(at("Show 40 more")).toBeGreaterThan(at("card"));
    expect(at("Method and sources")).toBeGreaterThan(at("Show 40 more"));
  });
  test("the list gives a card only to a complex with complaints", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(cards(page).first()).toBeVisible();

    // No card stands for a complex with nothing on file: every card leads with a number above zero.
    const figures = await cards(page).evaluateAll((elements) =>
      elements.map((element) =>
        Number(
          (element.textContent ?? "").replace(/,/g, "").match(/^\d+/)?.[0],
        ),
      ),
    );
    expect(figures.length).toBeGreaterThan(0);
    expect(figures.every((figure) => figure > 0)).toBe(true);
    await expect(page.getByText("no complaints on file")).toHaveCount(0);
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
      await expect(page.getByText(NO_MAP_SENTENCE)).toBeVisible();
      const first = cards(page).first();
      const figure = (await first.innerText()).split("\n")[0];
      expect(figure, query).toMatch(/^\d[\d,]*$/);
      await first.click();
      await expect(
        panel(page).getByText(phrase, { exact: true }),
      ).toBeVisible();
      await expect(
        panel(page).getByText(phrase, { exact: true }).locator("xpath=../.."),
      ).toContainText(new RegExp(`^${figure} complaints? `));
    }
  });

  test("a filtered view survives a reload", async ({ page }) => {
    await page.goto("/?period=3y&order=most");
    await expect(
      page.getByRole("button", { name: "3 years", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Most first" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: "3 years", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Most first" }),
    ).toBeVisible();
  });

  test("the address bar names 2 and 3 years, and a retired period falls back to 12 months and is dropped on the next change", async ({
    page,
  }) => {
    await page.goto("/?period=cases&order=most");
    await expect(
      page.getByRole("button", { name: "12 months", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Most first" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "2 years", exact: true }).click();
    await expect(page).toHaveURL(/\/\?period=2y&order=most$/);
    await page.getByRole("button", { name: "3 years", exact: true }).click();
    await expect(page).toHaveURL(/\/\?period=3y&order=most$/);
    await page.getByRole("button", { name: "12 months", exact: true }).click();
    await expect(page).toHaveURL(/\/\?order=most$/);
  });

  test("the building panel takes focus, closes on Escape and hands focus back to its card", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(cards(page).first()).toBeVisible();

    const id = await openFirstCard(page);
    await expect(panel(page)).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(
      page.locator(`[data-testid="card"][data-complex-id="${id}"]`),
    ).toBeFocused();
  });
});

test("with the map running, Tab goes search, filters, map, the area shortcuts on a desktop and the method link, never a card, each with a focus indicator", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMap(page);

  const stops: Stop[] = [];
  for (let press = 0; press < 60; press += 1) {
    const stop = await pressTab(page);
    if (!stop) continue;
    stops.push(stop);
    if (stop.label === "Method and sources") break;
  }

  const first = (kind: Stop["kind"]) =>
    stops.findIndex((stop) => stop.kind === kind);
  const at = (label: string) => stops.findIndex((stop) => stop.label === label);
  const search = first("search");
  const filter = first("filter");
  const map = first("map");
  const downtown = at("Downtown");
  const method = at("Method and sources");
  expect(search, "the first Tab lands on the search box").toBe(0);
  expect(filter).toBeGreaterThan(search);
  expect(map).toBeGreaterThan(filter);
  expect(first("card"), "no card on the map screen").toBe(-1);
  if (onPhone()) {
    expect(downtown, "the area shortcuts are hidden on a phone").toBe(-1);
  } else {
    expect(downtown).toBeGreaterThan(map);
  }
  expect(method).toBeGreaterThan(Math.max(map, downtown));

  for (const index of [search, filter, map, downtown, method]) {
    if (index === -1) continue;
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
    await expect(panel(page).getByText("Aerial photo: City of Austin")).toBeVisible();
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

  test("leaves on Escape: the model goes, the count is what it was before the pick, then follows the map again", async ({
    page,
  }) => {
    const complex = recordOf(COMPLEX_WITH_RECORD);
    await page.goto("/");
    await waitForMap(page);
    const before = await trayCount(page).innerText();

    await pickFromSearch(page, complex.address, complex);
    await expect(spotlit(page, complex.id)).toBeAttached();
    await page.keyboard.press("Escape");

    await expect(page.locator("[data-spotlight]")).toHaveCount(0);
    await expect(labels(page)).toHaveCount(0);
    await expect(trayCount(page)).toHaveText(before);

    // A count still holding would not follow a camera move the screen did not ask for, such as a smaller window.
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

  test("hands focus back to the search on closing, when it was picked there", async ({
    page,
  }) => {
    if (!NAMED) return;
    await page.goto("/");
    await waitForMap(page);

    await pickFromSearch(page, NAMED.address, NAMED);
    await expect(spotlit(page, NAMED.id)).toBeAttached();
    await expect(panel(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(search(page)).toBeFocused();
  });

  test("hands focus to the count line, never an input, when it was picked from a pin", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForMap(page);
    await pickFromMap(page);

    const countLine = page
      .locator('p[tabindex="-1"]')
      .filter({ hasText: /complex(es)? in / });
    const ring = () =>
      countLine.evaluate((line) => {
        const style = getComputedStyle(line);
        return `${style.outlineStyle} ${style.outlineWidth}`;
      });

    // Closed from the keyboard, the count line shows the site's focus ring, so a keyboard user sees where focus went.
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(countLine).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "INPUT",
    );
    expect(await ring()).toMatch(/^solid [1-9]/);

    // Closed with a press, it takes focus with no ring.
    await pickFromMap(page);
    await page.getByRole("button", { name: "Close building details" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(countLine).toBeFocused();
    expect(await ring()).toMatch(/^none /);
  });

  test("on a phone steps the search and filters aside while it is open, and on a desktop leaves them", async ({
    page,
  }) => {
    const complex = recordOf(COMPLEX_WITH_RECORD);
    await page.goto("/");
    await waitForMap(page);
    // By its whole name: a sentence of the record can speak of 12 months too.
    const period = page.getByRole("button", { name: "12 months", exact: true });

    await pickFromSearch(page, complex.address, complex);
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

  test("keeps the count while it is open, though the camera moves", async ({
    page,
  }) => {
    const complex = recordOf(COMPLEX_WITH_RECORD);
    await page.goto("/");
    await waitForMap(page);
    const count = page.getByRole("region", { name: /complexes? in/ });
    const before = await count.innerText();

    await pickFromSearch(page, complex.address, complex);
    await expect(spotlit(page, complex.id)).toBeAttached();
    // Unchanging is only shown over time: let the camera fly in and start to turn.
    await page.waitForTimeout(3_000);

    expect(await count.innerText()).toBe(before);
  });

  test("picked and then replaced straight away leaves one label, for the second", async ({
    page,
  }) => {
    test.skip(
      onPhone(),
      "On a phone the search steps aside while a building is open, so no second pick is in reach.",
    );
    const first = recordOf(COMPLEX_WITH_RECORD);
    const second = recordOf(LONG_LABEL);
    await page.goto("/");
    await waitForMap(page);

    await pickFromSearch(page, first.address, first);
    await pickFromSearch(page, second.address, second);

    await expect(spotlit(page, second.id)).toBeAttached();
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toHaveText(titleOf(second));
  });

  test("keeps a long name's map label inside a phone's screen, and shows a shorter long one in full on a desktop", async ({
    page,
  }) => {
    // On a phone the longest title of all, so the label's width limit has to cut it.
    const complex = onPhone() ? LONGEST_TITLE : recordOf(LONG_LABEL);
    await page.goto("/");
    await waitForMap(page);
    await pickFromSearch(page, complex.id, complex);
    await expect(spotlit(page, complex.id)).toBeAttached();
    await expect(labels(page)).toHaveText(titleOf(complex));

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    const label = labels(page);
    const cut = () =>
      label.evaluate((pill) => {
        const name = pill.firstElementChild ?? pill;
        return name.scrollWidth > name.clientWidth;
      });
    if (onPhone()) {
      expect(await cut(), "the name is cut with an ellipsis").toBe(true);
      // Once the camera has flown in (under two seconds) and through the start of the turn, the pill stays on screen.
      await page.waitForTimeout(2_500);
      for (let sample = 0; sample < 4; sample += 1) {
        await page.waitForTimeout(1_000);
        const box = await label.boundingBox();
        expect(box, "the label is on screen").not.toBeNull();
        if (!box) return;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    } else {
      expect(await cut(), "the whole name fits").toBe(false);
    }
  });

  test("still opens its full record and stands forward when the city's building footprints fail", async ({
    page,
  }) => {
    const complex = recordOf(COMPLEX_WITH_RECORD);
    await page.route(FOOTPRINTS, (route) => route.fulfill({ status: 500 }));
    await page.goto("/");
    await waitForMap(page);

    const askedForFootprints = page.waitForRequest(/3qcc-8uhz/);
    await pickFromSearch(page, complex.address, complex);
    await askedForFootprints;

    await expect(spotlit(page, complex.id)).toBeAttached();
    await expect(
      panel(page).getByText("in the last 12 months", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("list", { name: "What the record shows" }),
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

    const photoAnswered = page.waitForResponse(/maps\.austintexas\.gov\/image/);
    await pickFromSearch(page, NAMED.address, NAMED);
    await photoAnswered;

    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
      NAMED.name.text,
    );
    await expect(panel(page).locator("img")).toHaveCount(0);
    await expect(panel(page).getByText("Aerial photo: City of Austin")).toHaveCount(0);
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

test.describe("a building's complaint types", () => {
  const BUILDING_CONDITION =
    "The buildings themselves: electrical, plumbing, roofs, walls, stairs and balconies, heating and appliances, pests.";
  const typeRow = (page: Page, label: string) =>
    panel(page).getByRole("button", { name: new RegExp(`^${label}`) });
  /** The line that says what the complaints were about. The types stand behind it. */
  const aboutLine = (scope: Page | Locator) =>
    scope.getByRole("button", { name: /(were|was) about / });
  async function openTypes(page: Page) {
    const line = aboutLine(panel(page));
    if ((await line.getAttribute("aria-expanded")) !== "true")
      await line.click();
  }

  test("open in place, one at a time, from the keyboard, with what each covers and its complaints", async ({
    page,
  }) => {
    const busiest = complexes
      .filter(
        (complex) =>
          complaintsOfType(complex, "y3", "structure") > 0 &&
          complaintsOfType(complex, "y3", "property") > 0,
      )
      .sort((a, b) => complaintsIn(b, "y3") - complaintsIn(a, "y3"))[0];
    expect(
      busiest,
      "the data has a complex with both building and grounds complaints",
    ).toBeDefined();

    // Without the map the list holds every complex in Austin, so the busiest one is in it.
    await withoutMap(page);
    await page.goto("/?period=3y&order=most");
    await page
      .locator(`[data-testid="card"][data-complex-id="${busiest.id}"]`)
      .click();

    await openTypes(page);
    const building = typeRow(page, "Building condition");
    await expect(building).toHaveAttribute("aria-expanded", "false");
    await building.focus();
    await page.keyboard.press("Enter");
    await expect(building).toHaveAttribute("aria-expanded", "true");
    await expect(building).toBeFocused();
    await expect(panel(page).getByText(BUILDING_CONDITION)).toBeVisible();
    await expect(
      panel(page)
        .getByRole("region", {
          name: "Complaints in the last 3 years, newest first",
        })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();

    await typeRow(page, "Trash and grounds").click();
    await expect(building).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page).getByText(BUILDING_CONDITION)).toHaveCount(0);
  });

  test("at a Repeat Offender property, say what the city recorded, in plain kinds over its own wording, and link each case to the city's record", async ({
    page,
  }) => {
    const listed = complexes
      .filter((complex) => complex.repeatOffender?.recorded)
      .map((complex) => ({
        complex,
        record: readData<BuildingRecord>(`buildings/${complex.id}.json`),
      }))
      .find(
        ({ record }) =>
          record.deficiencies.some(
            ({ category }) => category === "structure",
          ) &&
          record.complaints.some(
            ({ category, violationCase }) =>
              category === "structure" && violationCase?.url,
          ),
      );
    expect(
      listed,
      "the data has a Repeat Offender property with building problems and a linked case",
    ).toBeDefined();
    if (!listed) return;
    const families = listed.complex.repeatOffender?.recorded?.families ?? [];
    const total = families.reduce((sum, { count }) => sum + count, 0);

    await page.goto(`/building/${listed.complex.id}`);
    await expect(
      page.getByText("On the city's Repeat Offender list"),
    ).toBeVisible();
    // The listing says what it is about before anything is opened.
    const listing = page.getByRole("list", {
      name: "What the listing is about",
    });
    const first = listing.getByRole("button", {
      name: /^Recorded most often: /,
    });
    await expect(first).toContainText(
      `${total.toLocaleString("en-US")} ${total === 1 ? "problem" : "problems"} in the last 3 years`,
    );

    // Behind it, every kind with its count, and under each the city's own wording, code section and all.
    await first.click();
    const more = listing.getByRole("button", { name: /^Show all \d+ kinds$/ });
    if ((await more.count()) > 0) await more.click();
    const kinds = listing.locator("li li");
    await expect(kinds).toHaveCount(families.length);
    await expect(kinds.filter({ hasText: /\(§\d{3}/ }).first()).toBeVisible();
    await expect(
      listing.getByRole("link", { name: "city's Repeat Offender list" }),
    ).toHaveAttribute("href", "https://data.austintexas.gov/d/86z9-i27i");

    await aboutLine(page).click();
    await page.getByRole("button", { name: /^Building condition/ }).click();

    const complaints = page.getByRole("region", {
      name: "Complaints in the last 3 years, newest first",
    });
    const showAll = complaints.getByRole("button", { name: /^Show all/ });
    if ((await showAll.count()) > 0) await showAll.click();
    const links = complaints.getByRole("link", {
      name: /^City record \S+ \S+, for the complaint opened /,
    });
    const linked = listed.record.complaints.filter(
      ({ category, violationCase }) =>
        category === "structure" && violationCase?.url,
    );
    expect(
      await links.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")),
      ),
    ).toEqual(linked.map(({ violationCase }) => violationCase?.url));
    // Each link names its own case, so links from the same day still read apart.
    expect(await links.allInnerTexts()).toEqual(
      linked.map(({ violationCase }) => `city record ${violationCase?.number}`),
    );
    await expect(links.first()).toHaveAttribute("target", "_blank");
  });

  /** The one-parcel complex with the longest list of building complaints, so its record scrolls a long way. */
  const longestBuildingRecord = () =>
    complexes
      .filter((complex) => complex.parcelIds.length === 1)
      .sort(
        (a, b) =>
          complaintsOfType(b, "y3", "structure") -
          complaintsOfType(a, "y3", "structure"),
      )[0];

  test("a link brought into view at the top of a scrolled record lands below the band that fades", async ({
    page,
  }) => {
    const longest = longestBuildingRecord();
    await page.goto("/");
    await waitForMap(page);
    await pickFromSearch(page, longest.address, longest);
    await openTypes(page);
    await typeRow(page, "Building condition").click();
    const complaints = panel(page).getByRole("region", {
      name: "Complaints in the last 3 years, newest first",
    });
    await complaints.getByRole("button", { name: /^Show all/ }).click();
    const scroller = panel(page).locator(".record-scroller");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    // Shift+Tab to a link far above scrolls it into view. Chromium centres a focused element; other browsers bring
    // it to the nearest edge, which is what `nearest` asks for here: the link arrives at the top of what scrolls.
    const record = complaints
      .getByRole("link", { name: /^City record/ })
      .first();
    await record.evaluate((element) =>
      element.scrollIntoView({ block: "nearest" }),
    );
    const [link, record_scroller] = await Promise.all([
      record.boundingBox(),
      scroller.boundingBox(),
    ]);
    // The top 66 px of a scrolled record fade out under the close button; a focused link must sit below them.
    // To the nearest pixel: lines of fractional height leave the scroll position a hair off a whole one.
    expect(Math.round(link!.y - record_scroller!.y)).toBeGreaterThanOrEqual(66);
  });

  test("on a phone, the close button stays in reach at the end of a long record, and closes it", async ({
    page,
  }) => {
    test.skip(
      !onPhone(),
      "The phone's record sheet is the one a long record scrolls out from under.",
    );
    const longest = longestBuildingRecord();
    expect(
      complaintsOfType(longest, "y3", "structure"),
      "the data has a long list of building complaints",
    ).toBeGreaterThan(12);

    await page.goto("/");
    await waitForMap(page);
    await pickFromSearch(page, longest.address, longest);
    await openTypes(page);
    await typeRow(page, "Building condition").click();
    const complaints = panel(page).getByRole("region", {
      name: "Complaints in the last 3 years, newest first",
    });
    await complaints.getByRole("button", { name: /^Show all/ }).click();

    const scroller = panel(page).locator(".overflow-y-auto");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    // The record's last line, under every sentence and the complaints opened from one of them.
    await expect(
      panel(page).getByRole("link", { name: "Open this building's page" }),
    ).toBeInViewport();
    await expect(
      panel(page).getByRole("heading", { level: 2 }),
    ).not.toBeInViewport();

    const close = page.getByRole("button", { name: "Close building details" });
    await expect(close).toBeInViewport({ ratio: 1 });

    // Scrolled, the top of the record fades under the button, for someone who asked for less motion too; at the top it does not.
    const mask = () =>
      scroller.evaluate((element) => getComputedStyle(element).maskImage);
    expect(await mask()).toContain("linear-gradient");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await mask()).toContain("linear-gradient");
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect.poll(mask).toBe("none");

    await close.click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("with a type filter on, the panel opens at that type", async ({
    page,
  }) => {
    await withoutMap(page);
    for (const [category, label] of [
      ["permit", "Work without a permit"],
      ["structure", "Building condition"],
    ]) {
      await page.goto(`/?period=3y&category=${category}&order=most`);
      await cards(page).first().click();
      await expect(typeRow(page, label), category).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
  });
});
