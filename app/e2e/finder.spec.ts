import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

interface ComplexRecord {
  id: string;
  address: string;
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
  "No cases means none reached Code Enforcement. It does not mean the building has no problems.";
const COMPLEX_WITH_RECORD = "0304070701";

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
}

async function withoutMap(page: Page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
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
  await expect(page.getByText("What the cases were about")).toBeVisible();
  const heading = await panel(page).getByRole("heading", { level: 2 }).innerText();
  expect(cardText).toContain(heading);
});

test("a filtered view survives a reload", async ({ page }) => {
  await page.goto("/?period=cases&order=most");
  await expect(
    page.getByRole("button", { name: "Since 2023" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Since 2023" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Most first" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    complex?.address ?? "",
  );
  await expect(
    page.getByRole("link", { name: "Back to the map" }),
  ).toHaveAttribute("href", "/");
});

test("an unknown building id is a 404", async ({ page }) => {
  const response = await page.goto("/building/0000000000");
  expect(response?.status()).toBe(404);
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

    await page.getByRole("button", { name: "Property", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Property", exact: true }),
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
    await expect(page.getByText("What the cases were about")).toBeVisible();
    await expect(panel(page)).toBeFocused();
  });

  test("every control can be reached by Tab, in reading order, with a visible focus ring", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(cards(page).first()).toBeVisible();

    const stops: string[] = [];
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        const wrapper = element.closest("[class*='focus-within']");
        const ring = wrapper ? getComputedStyle(wrapper) : style;
        const outlined =
          ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth) > 0;
        return {
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 30) ??
            "",
          testId: element.getAttribute("data-testid"),
          outlined,
        };
      });
      if (!stop) continue;
      expect(stop.outlined, `"${stop.label}" shows a focus ring`).toBe(true);
      stops.push(stop.testId === "card" ? "card" : stop.label);
      if (stop.testId === "card") break;
    }

    const search = stops.indexOf("Search an Austin address");
    const period = stops.indexOf("12 months");
    const order = stops.indexOf("Fewest first");
    const firstCard = stops.indexOf("card");
    expect(search, "search comes first").toBe(0);
    expect(period).toBeGreaterThan(search);
    expect(order).toBeGreaterThan(period);
    expect(firstCard).toBeGreaterThan(order);
  });
});
