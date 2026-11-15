import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  FAMILY_LABEL,
  PROBLEM_FAMILIES,
  type ProblemFamily,
} from "@/domain/problems";
import type { Deficiency, RepeatOffender } from "@/domain/types";
import { ListedBlock } from "./ListedBlock";

const listing = (
  families: [ProblemFamily, number, number?][],
  pests: NonNullable<RepeatOffender["recorded"]>["pests"] = {},
): RepeatOffender => ({
  name: "Avalon Palms",
  units: 148,
  activeViolations: 7,
  totalViolations: 123,
  recorded: {
    families: families.map(([family, count, notCleared = 0]) => ({
      family,
      count,
      notCleared,
    })),
    pests,
  },
});

const kind = (name: string, cleared: number, notCleared = 0): Deficiency => ({
  category: "structure",
  kind: name,
  cleared,
  notCleared,
});

/** Opens the line that says what the city recorded, however it reads, and returns what stands behind it. */
const openFirstLine = async () => {
  const [line] = within(
    screen.getByRole("list", { name: "What the listing is about" }),
  ).getAllByRole("button");
  await userEvent.click(line);
  const behind = document.getElementById(
    line.getAttribute("aria-controls") ?? "",
  );
  if (!behind) throw new Error("Nothing opened behind the first line");
  return within(behind);
};

it("says the listing, its units, the kinds recorded most and the pests named, before anything is opened", () => {
  render(
    <ListedBlock
      listing={listing(
        [
          ["electrical", 16],
          ["exterior", 12],
          ["plumbing", 11, 2],
          ["pests", 2],
        ],
        { rodents: 1, insects: 2 },
      )}
      deficiencies="loading"
    />,
  );
  expect(
    screen.getByText("On the city's Repeat Offender list").closest("p"),
  ).toHaveTextContent(/148 units$/);
  expect(
    screen.getAllByRole("listitem").map((row) => row.textContent),
  ).toEqual([
    "Recorded most often: electrical and lighting (16), outside walls and roof (12), plumbing and water (11). 41 problems in the last 3 years, 2 not cleared.",
    "Pests were recorded 2 times. The city's notes name rodents and insects.",
  ]);
  // The pest line has nothing behind it.
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("lists each kind with its count while the building file loads, and adds the city's wording once it is in", async () => {
  const families: [ProblemFamily, number, number?][] = [
    ["electrical", 3, 1],
    ["plumbing", 2],
  ];
  const { rerender } = render(
    <ListedBlock listing={listing(families)} deficiencies="loading" />,
  );
  const behind = await openFirstLine();
  const rows = () =>
    within(behind.getAllByRole("list")[0])
      .getAllByRole("listitem")
      .map((row) => row.textContent);
  expect(rows()).toEqual([
    "Electrical and lighting1 not cleared3",
    "Plumbing and water2",
  ]);
  // It does not promise wording that is not there yet.
  expect(
    behind.getByText(/^Published by the city/),
  ).toHaveTextContent(
    /^Published by the city for Repeat Offender properties only\. Loading the city's own wording for each kind\.$/,
  );

  rerender(
    <ListedBlock
      listing={listing(families)}
      deficiencies={[
        kind("Luminaires (§605.3)", 1),
        kind("Installation (§605.1)", 1, 1),
        kind("General (§504.1)", 2),
      ]}
    />,
  );
  expect(behind.getByText(/^Published by the city/)).toHaveTextContent(
    /Under each line is the city's own wording and the code section it cites\.$/,
  );
  // Most recorded first within a family; the count follows the city's own title for the code section.
  expect(rows()).toEqual([
    "Electrical and lighting1 not cleared3Installation (§605.1) 2, Luminaires (§605.3) 1",
    "Plumbing and water2General (§504.1) 2",
  ]);
});

it("keeps the counts when the building file cannot be loaded, and says the city's wording is missing", async () => {
  render(
    <ListedBlock
      listing={listing([["electrical", 3]])}
      deficiencies="failed"
    />,
  );
  const behind = await openFirstLine();
  expect(behind.getByText("Electrical and lighting")).toBeVisible();
  expect(behind.getByText(/^Published by the city/)).toHaveTextContent(
    "Published by the city for Repeat Offender properties only. The city's own wording for each kind could not be loaded right now. The counts are still current.",
  );
  expect(behind.getByText(/^Registered as Avalon Palms/)).toBeVisible();
});

it("shows six kinds, then all of them in place on request, with focus on the list it opened", async () => {
  const eight = PROBLEM_FAMILIES.slice(0, 8).map(
    (family, index): [ProblemFamily, number] => [family, 20 - index],
  );
  render(<ListedBlock listing={listing(eight)} deficiencies={[]} />);
  const behind = await openFirstLine();
  const list = behind.getAllByRole("list")[0];
  expect(within(list).getAllByRole("listitem")).toHaveLength(6);

  await userEvent.click(
    behind.getByRole("button", { name: "Show all 8 kinds" }),
  );
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((row) => row.textContent?.replace(/\d+$/, "")),
  ).toEqual(eight.map(([family]) => FAMILY_LABEL[family]));
  expect(behind.queryByRole("button", { name: /^Show all/ })).toBeNull();
  expect(list).toHaveFocus();
});

it("needs no button for six kinds or fewer", async () => {
  const six = PROBLEM_FAMILIES.slice(0, 6).map(
    (family): [ProblemFamily, number] => [family, 1],
  );
  render(<ListedBlock listing={listing(six)} deficiencies={[]} />);
  const behind = await openFirstLine();
  expect(behind.queryByRole("button", { name: /^Show all/ })).toBeNull();
});

it("says where the listing's own figures come from, and that they are counted another way", async () => {
  render(
    <ListedBlock
      listing={listing([["electrical", 3]])}
      deficiencies={[]}
    />,
  );
  const behind = await openFirstLine();
  expect(
    behind.getByText(/^Registered as Avalon Palms, 148 units\./),
  ).toHaveTextContent(
    "Registered as Avalon Palms, 148 units. The city's Repeat Offender list shows 7 active of 123 total violations. Those are the list's own figures and do not match the counts here.",
  );
  expect(
    behind.getByRole("link", { name: "city's Repeat Offender list" }),
  ).toHaveAttribute("href", "https://data.austintexas.gov/d/86z9-i27i");
});

it("never calls a recorded problem a score, a grade or a rank", async () => {
  render(
    <ListedBlock
      listing={listing(
        PROBLEM_FAMILIES.map((family): [ProblemFamily, number] => [family, 2]),
        { roaches: 1 },
      )}
      deficiencies={[]}
    />,
  );
  const behind = await openFirstLine();
  await userEvent.click(behind.getByRole("button", { name: /^Show all/ }));
  expect(document.body.textContent).not.toMatch(
    /score|grade|rating|rank|worst|offense/i,
  );
});
