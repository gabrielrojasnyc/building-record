import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { KNOWN_CITY_OUTCOMES } from "@/domain/outcomes";
import { ComplaintJourney, STEP_IDS, type StepId } from "./ComplaintJourney";

const META = {
  pulledAt: "2026-11-15",
  periodStarts: { m12: "2025-11-15", y2: "2024-11-15", y3: "2023-11-15" },
  unmatchedCaseShare: 0.131,
};
const SOURCES = [
  {
    name: "Austin Code Complaint Cases",
    href: "https://data.austintexas.gov/d/6wtj-zbtb",
    use: "every complaint.",
  },
];
const RULES = Object.fromEntries(
  STEP_IDS.map((id) => [id, <p key={id}>The rules of {id}</p>]),
) as Record<StepId, React.ReactNode>;

/** Renders the journey and waits until the card holds everything the steps find out. */
async function renderJourney() {
  render(<ComplaintJourney meta={META} sources={SOURCES} rules={RULES} />);
  await screen.findByText("In a record");
}

/** A step, found by its title. */
const step = (title: string) =>
  within(screen.getByRole("heading", { level: 2, name: title }).closest("li")!);

/** What the card says of the complaint, as "term: value" lines. */
function card() {
  const rows = within(
    screen.getByRole("complementary", {
      name: "The complaint you are following",
    }),
  ).getAllByRole("term");
  return rows.map(
    (term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`,
  );
}

/** How far along the line of days a date sits, as the slider counts it. */
const DAY_MS = 86_400_000;
const slideTo = (iso: string) => {
  const first = Date.UTC(2023, 10, 15) / DAY_MS - 183;
  fireEvent.change(
    screen.getByLabelText("Try it: move the day it was opened."),
    {
      target: {
        value: String(Date.parse(`${iso}T00:00:00Z`) / DAY_MS - first),
      },
    },
  );
};

it("walks one complaint through six steps, in order, each with its rules folded under it", async () => {
  await renderJourney();

  const steps = screen
    .getAllByRole("listitem")
    .filter((item) => item.querySelector(":scope > h2"));
  expect(
    steps.map((item) => [
      item.querySelector(":scope > p")?.textContent,
      item.querySelector("h2")?.textContent,
    ]),
  ).toEqual([
    ["Step 1 of 6", "A complaint reaches the city"],
    ["Step 2 of 6", "It is tied to a building"],
    ["Step 3 of 6", "The city says what it found"],
    ["Step 4 of 6", "It is counted by the day it was opened"],
    ["Step 5 of 6", "It joins the building's record"],
    ["Step 6 of 6", "What the record cannot tell you"],
  ]);
  for (const [index, item] of steps.entries()) {
    const folded = item.querySelector("details");
    expect(folded?.open).toBe(false);
    expect(folded).toHaveTextContent(`The rules of ${STEP_IDS[index]}`);
  }
});

it("starts with a complaint that is counted everywhere, and says so on its card", async () => {
  await renderJourney();
  expect(card()).toEqual([
    "About: Building condition",
    "Where: An apartment complex",
    "The city found: Violation confirmed",
    "Opened: June 18, 2026",
    "Counted in: The last 12 months, 2 years and 3 years",
    "In a record: Yes, with 5 others at its building",
  ]);
});

it("says what a type of complaint covers and the city's own name for it", async () => {
  await renderJourney();
  await userEvent.click(
    screen.getByRole("radio", { name: "Trash and grounds" }),
  );

  expect(
    step("A complaint reaches the city").getByText(
      /^The land around them: trash, dumping, overgrowth/,
    ),
  ).toHaveTextContent(
    "In the city's records, this type is Property Abatement.",
  );
  expect(card()[0]).toBe("About: Trash and grounds");
});

it("leaves a complaint with no parcel number, or on a parcel that is not apartments, out of every count", async () => {
  await renderJourney();
  const placed = step("It is tied to a building");

  await userEvent.click(
    screen.getByRole("radio", { name: "It has no parcel number" }),
  );
  expect(
    placed.getByText(
      "It is not counted anywhere. About 13% of the city's complaints from the last 3 years carry no parcel number.",
    ),
  ).toBeVisible();
  expect(placed.getByRole("img")).toHaveAccessibleName(
    /The complaint sits outside all of them/,
  );
  expect(card()).toEqual(
    expect.arrayContaining([
      "Where: No parcel number",
      "Counted in: No period: it has no parcel number",
      "In a record: No: it has no parcel number",
    ]),
  );

  await userEvent.click(
    screen.getByRole("radio", { name: "On another kind of parcel" }),
  );
  expect(
    placed.getByText(
      "It is not shown. This site covers apartment parcels only.",
    ),
  ).toBeVisible();
  expect(card()).toContain("In a record: No: its parcel is not apartments");
});

it("turns the city's phrase into an outcome with the first rule that fits, and names the rule", async () => {
  await renderJourney();
  const found = step("The city says what it found");
  const phrase = screen.getByLabelText("The city's phrase");
  const landed = () => found.getByRole("listitem", { current: true });

  // Every phrase the city is known to use can be tried.
  expect(within(phrase).getAllByRole("option")).toHaveLength(
    KNOWN_CITY_OUTCOMES.length,
  );
  expect(landed()).toHaveTextContent("Violation confirmed");

  // With a violation case, the phrase cannot change the outcome.
  await userEvent.selectOptions(
    phrase,
    "No Violation(s) Found/Inspection Performed",
  );
  expect(landed()).toHaveTextContent("Violation confirmed");
  expect(found.getByText(/^Rule 2 of 6 decides it\./)).toBeVisible();

  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "The city opened a violation case for it",
    }),
  );
  expect(landed()).toHaveTextContent("No violation found");
  expect(found.getByText(/^Rule 4 of 6 decides it\./)).toHaveTextContent(
    "The city's phrase says no violation was found. This is No violation found.",
  );
  expect(card()).toContain("The city found: No violation found");

  await userEvent.selectOptions(phrase, "Investigation in Progress");
  expect(landed()).toHaveTextContent("Referred or closed without a finding");
  await userEvent.click(
    screen.getByRole("checkbox", { name: "The city has closed the complaint" }),
  );
  expect(landed()).toHaveTextContent("Still being looked into");
  expect(found.getByText(/^Rule 5 of 6 decides it\./)).toBeVisible();
});

it("takes a duplicate out of every count, on the card and in the record", async () => {
  await renderJourney();
  await userEvent.selectOptions(
    screen.getByLabelText("The city's phrase"),
    "Closed/Duplicate Case",
  );

  expect(
    step("The city says what it found").getByRole("listitem", {
      current: true,
    }),
  ).toHaveTextContent("Not counted: duplicate report");
  expect(card()).toEqual(
    expect.arrayContaining([
      "The city found: A duplicate of another complaint",
      "Counted in: No period: the city closed it as a duplicate",
      "In a record: No: the city closed it as a duplicate",
    ]),
  );
  const recorded = step("It joins the building's record");
  expect(
    recorded.getByText(
      "The complaint you are following is not in this record: the city closed it as a duplicate.",
    ),
  ).toBeVisible();
  expect(
    recorded.queryByRole("checkbox", {
      name: "Count the complaint you are following",
    }),
  ).toBeNull();
  expect(recorded.getByText("5")).toBeVisible();
});

it("counts the complaint in each period its opening day falls in, and in none before the 3 years", async () => {
  await renderJourney();
  const counted = step("It is counted by the day it was opened");
  expect(
    counted.getByText(
      "Opened June 18, 2026. It is counted in all three periods: the last 12 months, 2 years and 3 years.",
    ),
  ).toBeVisible();
  expect(
    screen.getByLabelText("Try it: move the day it was opened."),
  ).toHaveAttribute("aria-valuetext", "June 18, 2026");

  slideTo("2025-03-01");
  expect(
    counted.getByText(
      "Opened March 1, 2025. It is counted in the last 2 years and 3 years only.",
    ),
  ).toBeVisible();
  expect(card()).toContain("Counted in: The last 2 years and 3 years");

  slideTo("2023-09-01");
  expect(
    counted.getByText(
      "Opened September 1, 2023, before the 3 years begin on November 15, 2023. It is in no count.",
    ),
  ).toBeVisible();
  expect(card()).toContain(
    "Counted in: No period: it was opened before the 3 years",
  );
});

it("says a day falls in a period without counting a complaint that is left out for another reason", async () => {
  await renderJourney();
  await userEvent.click(
    screen.getByRole("radio", { name: "It has no parcel number" }),
  );
  expect(
    step("It is counted by the day it was opened").getByText(
      "Opened June 18, 2026. That day is in the last 12 months, 2 years and 3 years, but this complaint is in no count: it has no parcel number.",
    ),
  ).toBeVisible();
});

it("shows the example building's record with the complaint in it, and without it when it is taken out", async () => {
  await renderJourney();
  const recorded = step("It joins the building's record");
  const sentences = () =>
    recorded.getAllByRole("listitem").map((item) => item.textContent);

  expect(recorded.getByText("6")).toBeVisible();
  expect(sentences()).toEqual([
    "Up from 2 in the 12 months before.",
    "The city confirmed a violation in 4 of them.",
    "1 confirmed violation from the last 3 years is still open.",
    "All 6 were about building condition.",
  ]);

  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "Count the complaint you are following",
    }),
  );
  expect(recorded.getByText("5")).toBeVisible();
  expect(sentences()[1]).toBe("The city confirmed a violation in 3 of them.");
  expect(card()).toContain(
    "In a record: Taken out, to see the record without it",
  );
});

it("shows the record of the shortest period the complaint is in, so what it adds can be seen", async () => {
  await renderJourney();
  slideTo("2025-03-01");
  const recorded = step("It joins the building's record");
  expect(recorded.getByText("in the last 2 years")).toBeVisible();
  expect(recorded.getByText("8")).toBeVisible();
});

it("ends on what a record cannot say, and where every figure can be checked", async () => {
  await renderJourney();
  const limits = step("What the record cannot tell you");
  expect(
    limits.getByText(
      /It does not say how serious a problem was, who was responsible, or whether it remains\. No complaints means none reached Code Enforcement\. It does not mean the building has no problems\./,
    ),
  ).toBeVisible();
  expect(
    limits.getByRole("link", { name: "Austin Code Complaint Cases" }),
  ).toHaveAttribute("href", "https://data.austintexas.gov/d/6wtj-zbtb");
});

it("never scores a building, and uses no long dashes", async () => {
  await renderJourney();
  expect(document.body.textContent).not.toMatch(
    /score|grade|rating|rank|worst|—|--/i,
  );
});
