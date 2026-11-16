import { describe, expect, it } from "vitest";
import type { AddressMatch } from "@/city/addressSearch";
import { ADDRESS_SEARCH_MOST_SUGGESTIONS } from "@/domain/address";
import { asksTheCity, suggestionsFor } from "./suggestions";

const match = (label: string, complexId: string | null): AddressMatch => ({
  label,
  name: null,
  lon: -97.7,
  lat: 30.2,
  complexId,
});
const own = match("1601 Royal Crest Dr", "a");
const street = match("1601 Royal Oak Ln", null);
const fullList = Array.from(
  { length: ADDRESS_SEARCH_MOST_SUGGESTIONS },
  (_, index) => match(`${index} Main St`, String(index)),
);

describe("whether the city is asked about some text", () => {
  it("is asked while the list has room for another address", () => {
    expect(asksTheCity({ ownMatches: [own], complexesOnly: false })).toBe(true);
    expect(asksTheCity({ ownMatches: [], complexesOnly: false })).toBe(true);
  });

  it("is not asked once the site's own buildings fill the list", () => {
    expect(asksTheCity({ ownMatches: fullList, complexesOnly: false })).toBe(
      false,
    );
  });

  it("is never asked with no map, where an address elsewhere has nowhere to go", () => {
    expect(asksTheCity({ ownMatches: [], complexesOnly: true })).toBe(false);
  });
});

describe("what the search shows under its box", () => {
  const asked = { searchable: true, asksCity: true } as const;

  it("shows nothing for text too short to search", () => {
    expect(
      suggestionsFor({
        searchable: false,
        ownMatches: [],
        asksCity: false,
        answered: null,
      }),
    ).toEqual({ state: "closed" });
  });

  it("lists the site's own buildings at once, before the city has answered", () => {
    expect(
      suggestionsFor({ ...asked, ownMatches: [own], answered: null }),
    ).toEqual({ state: "listing", matches: [own], cityUnavailable: false });
  });

  it("lists what the city sent once it has answered: the site's own with the city's under them", () => {
    expect(
      suggestionsFor({
        ...asked,
        ownMatches: [own],
        answered: { matches: [own, street], cityUnavailable: false },
      }),
    ).toEqual({
      state: "listing",
      matches: [own, street],
      cityUnavailable: false,
    });
  });

  it("keeps the site's own in the list, and says so, when the city could not be reached", () => {
    expect(
      suggestionsFor({
        ...asked,
        ownMatches: [own],
        answered: { matches: [own], cityUnavailable: true },
      }),
    ).toEqual({ state: "listing", matches: [own], cityUnavailable: true });
  });

  it("says it is looking while the city has not answered and the site has nothing of its own", () => {
    expect(
      suggestionsFor({ ...asked, ownMatches: [], answered: null }),
    ).toEqual({ state: "looking" });
  });

  it("says the city could not be reached when that leaves nothing to list", () => {
    expect(
      suggestionsFor({
        ...asked,
        ownMatches: [],
        answered: { matches: [], cityUnavailable: true },
      }),
    ).toEqual({ state: "unavailable" });
  });

  it("says nothing matches only once everyone asked has answered", () => {
    expect(
      suggestionsFor({
        ...asked,
        ownMatches: [],
        answered: { matches: [], cityUnavailable: false },
      }),
    ).toEqual({ state: "none" });
  });

  it("says nothing matches at once when the city is not asked at all", () => {
    expect(
      suggestionsFor({
        searchable: true,
        ownMatches: [],
        asksCity: false,
        answered: null,
      }),
    ).toEqual({ state: "none" });
  });

  it("never waits on a city it does not ask, and never reads an answer it did not ask for", () => {
    expect(
      suggestionsFor({
        searchable: true,
        ownMatches: fullList,
        asksCity: false,
        answered: { matches: [street], cityUnavailable: true },
      }),
    ).toEqual({ state: "listing", matches: fullList, cityUnavailable: false });
  });
});
