"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  searchAddresses,
  searchComplexes,
  type AddressMatch,
  type AddressSearchResult,
} from "@/city/addressSearch";
import { ADDRESS_SEARCH_MIN_CHARACTERS } from "@/domain/address";
import type { Complex } from "@/domain/types";
import { Glass } from "./Glass";
import { asksTheCity, CLOSED, suggestionsFor } from "./suggestions";

/** What the field asks for, in full, as its accessible name. */
const LABEL = "Search an address or building name";
/** Shorter, so it shows whole in the desktop field as well as the phone's. */
const PLACEHOLDER = "Address or building name";
const NO_MATCH = "No Austin address or building name matches that.";
const NO_COMPLEX_MATCH =
  "No building name or address starts with or contains that.";
const CITY_UNAVAILABLE =
  "Other Austin addresses could not be loaded right now.";
const LOOKING = "Looking for other Austin addresses";
/** How long typing must stop before the city is asked. The site's own buildings never wait for it. */
const TYPING_PAUSE_MS = 250;

/** What the city added for some text: the site's own matches with its other addresses under them. */
interface CityAnswer extends AddressSearchResult {
  /** The trimmed text these matches answer. A result for older text is never shown. */
  query: string;
}

export function IntroSearch({
  complexes,
  onChoose,
  complexesOnly = false,
}: {
  complexes: Complex[];
  onChoose: (match: AddressMatch) => void;
  /** With no map, an address elsewhere in Austin has nowhere to go, so only complexes are offered. */
  complexesOnly?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [cityAnswer, setCityAnswer] = useState<CityAnswer | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);

  const query = text.trim();
  const searchable = query.length >= ADDRESS_SEARCH_MIN_CHARACTERS;

  // The site's own buildings are already in the browser, so they answer on the key that finds them.
  const ownMatches = useMemo(
    () => (searchable ? searchComplexes(query, complexes) : []),
    [searchable, query, complexes],
  );
  const asksCity = searchable && asksTheCity({ ownMatches, complexesOnly });

  // Other Austin addresses come from the city, which takes its time: asked once typing pauses, and added under.
  useEffect(() => {
    if (!asksCity) return;
    let superseded = false;
    const timer = setTimeout(async () => {
      const result = await searchAddresses(query, complexes);
      if (superseded) return;
      setCityAnswer({ query, ...result });
    }, TYPING_PAUSE_MS);
    return () => {
      superseded = true;
      clearTimeout(timer);
    };
  }, [asksCity, query, complexes]);

  // What the text finds, and then what is on show: the same, unless the person has put the list away.
  const found = suggestionsFor({
    searchable,
    ownMatches,
    asksCity,
    answered: cityAnswer?.query === query ? cityAnswer : null,
  });
  const suggestions = dismissedQuery === query ? CLOSED : found;
  const shown = suggestions.state !== "closed";
  const matches = suggestions.state === "listing" ? suggestions.matches : [];
  const isOpen = matches.length > 0;
  // A suggestion can leave the list under the highlight, as the city's do when the map gives up. The highlight goes with it.
  const active = activeIndex < matches.length ? activeIndex : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (!shown) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setDismissedQuery(query);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [shown, query]);

  const choose = (match: AddressMatch) => {
    setText("");
    onChoose(match);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (!shown) return;
      // The building panel closes on Escape too, from a listener on the document. This one stops here.
      // Next hydrates into the document itself, so React's listener shares that node with the
      // panel's and only stopImmediatePropagation keeps the panel's from running.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      event.preventDefault();
      setDismissedQuery(query);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // What the arrows walk is the list as it would stand open, which Escape may have closed.
      if (found.state !== "listing") return;
      event.preventDefault();
      setDismissedQuery(null);
      const last = found.matches.length - 1;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        current === -1 || current > last
          ? step === 1
            ? 0
            : last
          : (current + step + last + 1) % (last + 1),
      );
      return;
    }
    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      choose(matches[active] ?? matches[0]);
    }
  };

  return (
    <Glass
      as="header"
      className={`fixed top-(--gutter) left-(--gutter) ${shown ? "z-5" : "z-3"} w-[340px] rounded-[28px] px-[22px] pt-[22px] pb-[18px] phone:right-(--gutter) phone:w-auto phone:rounded-3xl phone:px-4 phone:py-3.5`}
    >
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-deep italic phone:text-[28px]">
        Building Record
      </h1>
      <p className="mt-2 mb-4 max-w-[26ch] text-slate phone:hidden">
        Austin apartments, seen through the city&apos;s own complaint files.
      </p>
      <div
        ref={rootRef}
        data-suggestions={suggestions.state}
        className="relative phone:mt-2.5"
      >
        <div className="flex h-11 items-center gap-2.5 rounded-full border border-white/70 bg-white/50 px-4 focus-within:border-white focus-within:bg-white/78 focus-within:outline-[1.5px] focus-within:outline-offset-2 focus-within:outline-deep">
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            className="flex-none text-steel"
          >
            <circle cx="7" cy="7" r="4.6" />
            <path d="m10.6 10.6 3.4 3.4" />
          </svg>
          <input
            type="search"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            aria-activedescendant={
              active >= 0 ? optionId(active) : undefined
            }
            aria-autocomplete="list"
            placeholder={PLACEHOLDER}
            aria-label={LABEL}
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActiveIndex(-1);
              setDismissedQuery(null);
            }}
            onFocus={() => setDismissedQuery(null)}
            onKeyDown={handleKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-steel"
          />
        </div>
        {shown && (
          <div className={SURFACE}>
            {isOpen && (
              <ul id={listId} role="listbox" aria-label="Address and building suggestions">
                {matches.map((match, index) => (
                  <li
                    key={`${match.label}-${match.complexId ?? "city"}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    // Keeps focus in the input so the list survives the press.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(match)}
                    className="flex cursor-pointer items-baseline justify-between gap-3 rounded-xl px-3 py-[9px] text-deep hover:bg-white/70 aria-selected:bg-white/70"
                  >
                    {match.name ? (
                      <span className="min-w-0">
                        {match.name}
                        <span className="block text-[13px] text-slate">
                          {match.label}
                        </span>
                      </span>
                    ) : (
                      <span>{match.label}</span>
                    )}
                    {match.complexId && (
                      <span className="flex-none text-[13px] text-slate">
                        apartments
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Under a list, or alone when there is nothing to list. */}
            {(suggestions.state === "unavailable" ||
              (suggestions.state === "listing" &&
                suggestions.cityUnavailable)) && (
              <p
                role="status"
                className={`px-3 text-[13px] text-steel ${isOpen ? "pt-1.5 pb-1" : "py-2"}`}
              >
                {CITY_UNAVAILABLE}
              </p>
            )}
            {/* Said only while there is nothing else to show: beside a list, the list is the answer so far. */}
            {suggestions.state === "looking" && (
              <p role="status" className="px-3 py-2 text-[13px] text-steel">
                {LOOKING}
              </p>
            )}
            {/* Only true once everyone asked has answered and nothing matched. */}
            {suggestions.state === "none" && (
              <p role="status" className="px-3 py-2 text-slate">
                {complexesOnly ? NO_COMPLEX_MATCH : NO_MATCH}
              </p>
            )}
          </div>
        )}
      </div>
    </Glass>
  );
}

const SURFACE =
  "absolute top-[52px] right-0 left-0 z-10 rounded-[18px] border border-white/70 bg-ice/92 p-1.5 shadow-[0_18px_36px_-18px_color-mix(in_srgb,var(--color-navy)_50%,transparent)]";
