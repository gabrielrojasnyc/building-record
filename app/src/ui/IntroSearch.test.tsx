import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchAddresses, searchComplexes, type AddressMatch } from "@/city/addressSearch";
import type { Complex } from "@/domain/types";
import { IntroSearch } from "./IntroSearch";

vi.mock("@/city/addressSearch", () => ({ searchAddresses: vi.fn(), searchComplexes: vi.fn() }));
const search = vi.mocked(searchAddresses);
const searchLocal = vi.mocked(searchComplexes);

const apartments: AddressMatch = { label: "1601 Royal Crest Dr", lon: -97.7, lat: 30.2, complexId: "a" };
const street: AddressMatch = { label: "1601 Royal Oak Ln", lon: -97.8, lat: 30.3, complexId: null };
const complexes: Complex[] = [];

function setup() {
  const onChoose = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(<IntroSearch complexes={complexes} onChoose={onChoose} />);
  return { user, onChoose, input: screen.getByRole("combobox") };
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(250));

beforeEach(() => {
  vi.useFakeTimers();
  // Testing Library only waits through fake timers when it sees Jest's; this hands it Vitest's.
  vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
  search.mockReset();
  search.mockResolvedValue([apartments, street]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IntroSearch", () => {
  it("searches 250 ms after typing stops, not on every key", async () => {
    const { user, input } = setup();
    await user.type(input, "1601");
    expect(search).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(search).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("1601", complexes);
  });

  it("lists suggestions, tagging complexes as apartments", async () => {
    const { user, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["1601 Royal Crest Dr" + "apartments", "1601 Royal Oak Ln"]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  it("ignores a response that arrives after the text has changed", async () => {
    let answerFirst: (matches: AddressMatch[]) => void = () => {};
    search.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    search.mockResolvedValueOnce([street]);
    const { user, input } = setup();

    await user.type(input, "1601");
    await settle();
    await user.type(input, "0");
    await settle();
    await act(async () => answerFirst([apartments]));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["1601 Royal Oak Ln"]);
  });

  it("moves with the arrow keys and chooses the active option on Enter", async () => {
    const { user, onChoose, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);
    await user.keyboard("{ArrowUp}{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onChoose).toHaveBeenCalledWith(street);
  });

  it("chooses the first option on Enter when none is active, then clears and closes", async () => {
    const { user, onChoose, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();
    await user.keyboard("{Enter}");

    expect(onChoose).toHaveBeenCalledWith(apartments);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("chooses an option on click", async () => {
    const { user, onChoose } = setup();
    await user.type(screen.getByRole("combobox"), "1601 Roy");
    await settle();
    await user.click(screen.getByRole("option", { name: /Royal Oak/ }));

    expect(onChoose).toHaveBeenCalledWith(street);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says so when nothing starts with the text", async () => {
    search.mockResolvedValue([]);
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();

    expect(screen.getByText("No Austin address starts with that.")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not search for fewer than 3 characters", async () => {
    const { user, input } = setup();
    await user.type(input, "16");
    await settle();
    expect(search).not.toHaveBeenCalled();
  });

  it("closes on Escape without the event reaching the document", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    const { user, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();
    onDocumentKey.mockClear();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onDocumentKey).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onDocumentKey).toHaveBeenCalledOnce();
    document.removeEventListener("keydown", onDocumentKey);
  });

  it("closes the no-match message on Escape without the event reaching the document", async () => {
    search.mockResolvedValue([]);
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();
    onDocumentKey.mockClear();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("No Austin address starts with that.")).not.toBeInTheDocument();
    expect(onDocumentKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKey);
  });

  it("shows suggestions again when the same text is retyped after Escape", async () => {
    const { user, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();
    await user.keyboard("{Escape}");
    await user.clear(input);
    await user.type(input, "1601 Roy");
    await settle();

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes when the page is pressed outside the search", async () => {
    const { user, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();
    await user.click(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});

describe("IntroSearch without a map", () => {
  it("offers matching complexes only and never asks the city for other addresses", async () => {
    searchLocal.mockReturnValue([apartments]);
    const user = userEvent.setup({ delay: null });
    render(<IntroSearch complexes={complexes} onChoose={vi.fn()} complexesOnly />);
    await user.type(screen.getByRole("combobox"), "1601 Roy");
    await settle();

    expect(searchLocal).toHaveBeenCalledWith("1601 Roy", complexes);
    expect(search).not.toHaveBeenCalled();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["1601 Royal Crest Dr" + "apartments"]);
  });

  it("says no complex matches when none does", async () => {
    searchLocal.mockReturnValue([]);
    const user = userEvent.setup({ delay: null });
    render(<IntroSearch complexes={complexes} onChoose={vi.fn()} complexesOnly />);
    await user.type(screen.getByRole("combobox"), "zzzz");
    await settle();

    expect(screen.getByText("No apartment complex address starts with or contains that.")).toBeInTheDocument();
  });
});
