import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  searchAddresses,
  searchComplexes,
  type AddressMatch,
} from "@/city/addressSearch";
import type { Complex } from "@/domain/types";
import { IntroSearch } from "./IntroSearch";

vi.mock("@/city/addressSearch", () => ({
  searchAddresses: vi.fn(),
  searchComplexes: vi.fn(),
}));
const search = vi.mocked(searchAddresses);
const searchLocal = vi.mocked(searchComplexes);

const apartments: AddressMatch = {
  label: "1601 Royal Crest Dr",
  name: null,
  lon: -97.7,
  lat: 30.2,
  complexId: "a",
};
const street: AddressMatch = {
  label: "1601 Royal Oak Ln",
  name: null,
  lon: -97.8,
  lat: 30.3,
  complexId: null,
};
const named: AddressMatch = {
  label: "2000 Burton Dr",
  name: "Array Apartments",
  lon: -97.73,
  lat: 30.23,
  complexId: "b",
};
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
  search.mockResolvedValue({
    matches: [apartments, street],
    cityUnavailable: false,
  });
  // No building of the site's own matches unless a test says so.
  searchLocal.mockReset();
  searchLocal.mockReturnValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IntroSearch", () => {
  it("marks the state of what it shows under the box, for a test or a tool to read", async () => {
    search.mockResolvedValue({ matches: [], cityUnavailable: false });
    const { user, input } = setup();
    const surface = () =>
      input.closest("[data-suggestions]")?.getAttribute("data-suggestions");
    expect(surface()).toBe("closed");

    await user.type(input, "zzzz");
    expect(surface()).toBe("looking");
    await settle();
    expect(surface()).toBe("none");

    search.mockResolvedValue({ matches: [street], cityUnavailable: false });
    await user.type(input, "z");
    await settle();
    expect(surface()).toBe("listing");

    await user.keyboard("{Escape}");
    expect(surface()).toBe("closed");
  });

  it("drops the highlight when the suggestion it was on leaves the list, and never points at one that is gone", async () => {
    searchLocal.mockReturnValue([apartments]);
    const onChoose = vi.fn();
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(
      <IntroSearch complexes={complexes} onChoose={onChoose} />,
    );
    const input = screen.getByRole("combobox");
    await user.type(input, "1601");
    await settle();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Royal Oak/ }).id,
    );

    // The map gives up while the list is open: addresses elsewhere have nowhere to go, so the city's leave it.
    rerender(
      <IntroSearch complexes={complexes} onChoose={onChoose} complexesOnly />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("option")).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith(apartments);
  });

  it("asks for an address or a building name in a placeholder short enough for the field, and is named in full", () => {
    setup();
    const input = screen.getByRole("combobox", {
      name: "Search an address or building name",
    });
    expect(input).toHaveAttribute("placeholder", "Address or building name");
  });

  it("lists the site's own buildings at once, on the key that finds them, before the city is even asked", async () => {
    searchLocal.mockReturnValue([apartments]);
    const { user, input } = setup();
    await user.type(input, "1601");

    expect(search).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["1601 Royal Crest Drapartments"]);

    // The city's other addresses join them under, once it has answered.
    await settle();
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);
  });

  it("chooses the first of its own buildings on Enter without waiting for the city", async () => {
    searchLocal.mockReturnValue([apartments]);
    const { user, input, onChoose } = setup();
    await user.type(input, "1601{Enter}");
    expect(onChoose).toHaveBeenCalledWith(apartments);
    expect(search).not.toHaveBeenCalled();
  });

  it("says it is looking for other addresses while the city has not answered and no building matches", async () => {
    search.mockResolvedValue({ matches: [], cityUnavailable: false });
    const { user, input } = setup();
    await user.type(input, "zzzz");

    expect(
      screen.getByText("Looking for other Austin addresses"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No Austin address or building name matches that."),
    ).not.toBeInTheDocument();

    await settle();
    expect(
      screen.queryByText("Looking for other Austin addresses"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No Austin address or building name matches that."),
    ).toBeInTheDocument();
  });

  it("asks the city 250 ms after typing stops, not on every key", async () => {
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
    expect(options.map((option) => option.textContent)).toEqual([
      "1601 Royal Crest Dr" + "apartments",
      "1601 Royal Oak Ln",
    ]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute(
      "aria-controls",
      screen.getByRole("listbox").id,
    );
    // The list offers buildings by name as well as addresses, and says so to a screen reader.
    expect(
      screen.getByRole("listbox", { name: "Address and building suggestions" }),
    ).toBeVisible();
  });

  it("shows a named complex by its name, with its address under it and the apartments tag", async () => {
    search.mockResolvedValue({
      matches: [named, street],
      cityUnavailable: false,
    });
    const { user, onChoose, input } = setup();
    await user.type(input, "Array");
    await settle();

    const [option] = screen.getAllByRole("option");
    expect(option).toHaveTextContent(
      "Array Apartments2000 Burton Drapartments",
    );
    expect(within(option).getByText("Array Apartments")).toBeVisible();
    expect(within(option).getByText("2000 Burton Dr")).toBeVisible();
    expect(within(option).getByText("apartments")).toBeVisible();

    await user.click(option);
    expect(onChoose).toHaveBeenCalledWith(named);
  });

  it("ignores a response that arrives after the text has changed", async () => {
    let answerFirst: (matches: AddressMatch[]) => void = () => {};
    search.mockImplementationOnce(
      () =>
        new Promise(
          (resolve) =>
            (answerFirst = (matches) =>
              resolve({ matches, cityUnavailable: false })),
        ),
    );
    search.mockResolvedValueOnce({ matches: [street], cityUnavailable: false });
    const { user, input } = setup();

    await user.type(input, "1601");
    await settle();
    await user.type(input, "0");
    await settle();
    await act(async () => answerFirst([apartments]));

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["1601 Royal Oak Ln"]);
  });

  it("moves with the arrow keys and chooses the active option on Enter", async () => {
    const { user, onChoose, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[1].id,
    );
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

  it("says so when the city answered and nothing starts with the text", async () => {
    search.mockResolvedValue({ matches: [], cityUnavailable: false });
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();

    expect(
      screen.getByText("No Austin address or building name matches that."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("lists the complexes it found and says other addresses could not be loaded when the city is unreachable", async () => {
    search.mockResolvedValue({ matches: [apartments], cityUnavailable: true });
    const { user, input } = setup();
    await user.type(input, "1601 Roy");
    await settle();

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["1601 Royal Crest Dr" + "apartments"]);
    expect(
      screen.getByText("Other Austin addresses could not be loaded right now."),
    ).toBeVisible();
    expect(
      screen.queryByText("No Austin address or building name matches that."),
    ).not.toBeInTheDocument();
  });

  it("says only that other addresses could not be loaded when the city is unreachable and no complex matches", async () => {
    search.mockResolvedValue({ matches: [], cityUnavailable: true });
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();

    expect(
      screen.getByText("Other Austin addresses could not be loaded right now."),
    ).toBeVisible();
    expect(
      screen.queryByText("No Austin address or building name matches that."),
    ).not.toBeInTheDocument();
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
    search.mockResolvedValue({ matches: [], cityUnavailable: false });
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();
    onDocumentKey.mockClear();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByText("No Austin address or building name matches that."),
    ).not.toBeInTheDocument();
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
    render(
      <IntroSearch complexes={complexes} onChoose={vi.fn()} complexesOnly />,
    );
    await user.type(screen.getByRole("combobox"), "1601 Roy");
    await settle();

    expect(searchLocal).toHaveBeenCalledWith("1601 Roy", complexes);
    expect(search).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["1601 Royal Crest Dr" + "apartments"]);
  });

  it("says no complex matches when none does", async () => {
    searchLocal.mockReturnValue([]);
    const user = userEvent.setup({ delay: null });
    render(
      <IntroSearch complexes={complexes} onChoose={vi.fn()} complexesOnly />,
    );
    await user.type(screen.getByRole("combobox"), "zzzz");
    await settle();

    expect(
      screen.getByText(
        "No building name or address starts with or contains that.",
      ),
    ).toBeInTheDocument();
  });
});
