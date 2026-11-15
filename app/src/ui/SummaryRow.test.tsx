import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { SummaryRow } from "./SummaryRow";

const rows = (children: React.ReactNode) => render(<ul>{children}</ul>);

it("is a button that opens what stands behind it, in place, and closes it again", async () => {
  rows(
    <SummaryRow detail={<p>The figures</p>}>
      Up from 40 in the 12 months before.
    </SummaryRow>,
  );
  const line = screen.getByRole("button", {
    name: "Up from 40 in the 12 months before.",
  });
  expect(line).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("The figures")).toBeNull();

  await userEvent.click(line);
  expect(line).toHaveAttribute("aria-expanded", "true");
  expect(
    document.getElementById(line.getAttribute("aria-controls") ?? ""),
  ).toHaveTextContent("The figures");

  await userEvent.click(line);
  expect(line).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("The figures")).toBeNull();
});

it("opens from the keyboard, with Enter or Space, and keeps focus on the line", async () => {
  rows(<SummaryRow detail={<p>The figures</p>}>A sentence.</SummaryRow>);
  const line = screen.getByRole("button", { name: "A sentence." });
  line.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByText("The figures")).toBeVisible();
  expect(line).toHaveFocus();
  await userEvent.keyboard(" ");
  expect(screen.queryByText("The figures")).toBeNull();
  expect(line).toHaveFocus();
});

it("can start open", () => {
  rows(
    <SummaryRow startOpen detail={<p>The figures</p>}>
      A sentence.
    </SummaryRow>,
  );
  expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("The figures")).toBeVisible();
});

it("stands as plain text, not a button, when nothing is behind it", () => {
  rows(<SummaryRow>None in the last 3 years either.</SummaryRow>);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("None in the last 3 years either.").tagName).toBe(
    "P",
  );
  expect(screen.getByRole("listitem")).toBeVisible();
});

it("opens each line on its own, leaving the others as they were", async () => {
  rows(
    <>
      <SummaryRow detail={<p>First figures</p>}>First.</SummaryRow>
      <SummaryRow detail={<p>Second figures</p>}>Second.</SummaryRow>
    </>,
  );
  await userEvent.click(screen.getByRole("button", { name: "First." }));
  await userEvent.click(screen.getByRole("button", { name: "Second." }));
  expect(screen.getByText("First figures")).toBeVisible();
  expect(screen.getByText("Second figures")).toBeVisible();
});
