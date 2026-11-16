import type { AddressMatch, AddressSearchResult } from "@/city/addressSearch";
import { ADDRESS_SEARCH_MOST_SUGGESTIONS } from "@/domain/address";

/** What the search shows under its box. Exactly one of these at a time. */
export type Suggestions =
  /** Nothing: the text is too short to search, or the person has put the list away. */
  | { state: "closed" }
  /** Matches to choose from. `cityUnavailable` adds a line under them: the city could not be asked for other addresses. */
  | { state: "listing"; matches: AddressMatch[]; cityUnavailable: boolean }
  /** The site has no building of its own for the text, and the city has not answered yet. */
  | { state: "looking" }
  /** The site has no building of its own for the text, and the city could not be reached. */
  | { state: "unavailable" }
  /** Everyone asked has answered, and nothing matches. */
  | { state: "none" };

export const CLOSED: Suggestions = { state: "closed" };

/**
 * Whether the city is asked for other addresses. With no map an address elsewhere has nowhere to go, and a list
 * the site's own buildings already fill has no room for one.
 */
export function asksTheCity(search: {
  ownMatches: AddressMatch[];
  complexesOnly: boolean;
}): boolean {
  return (
    !search.complexesOnly &&
    search.ownMatches.length < ADDRESS_SEARCH_MOST_SUGGESTIONS
  );
}

/** What the search shows for some text, as it stands open. Putting the list away is the caller's to remember. */
export function suggestionsFor(search: {
  /** The text is long enough to search. */
  searchable: boolean;
  /** The site's own buildings that match, found in the browser with no wait. */
  ownMatches: AddressMatch[];
  /** The city is asked about this text, as `asksTheCity` says. */
  asksCity: boolean;
  /** The city's answer for this very text, once it is in. */
  answered: AddressSearchResult | null;
}): Suggestions {
  if (!search.searchable) return CLOSED;
  const answered = search.asksCity ? search.answered : null;
  const matches = answered?.matches ?? search.ownMatches;
  const cityUnavailable = answered?.cityUnavailable === true;

  if (matches.length > 0) return { state: "listing", matches, cityUnavailable };
  if (search.asksCity && answered === null) return { state: "looking" };
  return cityUnavailable ? { state: "unavailable" } : { state: "none" };
}
