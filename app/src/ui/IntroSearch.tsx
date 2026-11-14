"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { searchAddresses, type AddressMatch } from "@/city/addressSearch";
import type { Complex } from "@/domain/types";
import { Glass } from "./Glass";

const PLACEHOLDER = "Search an Austin address";
const NO_MATCH = "No Austin address starts with that.";
const TYPING_PAUSE_MS = 250;
const MIN_CHARACTERS = 3;

interface Suggestions {
  /** The trimmed text these matches answer. A result for older text is never shown. */
  query: string;
  matches: AddressMatch[];
}

export function IntroSearch({
  complexes,
  onChoose,
}: {
  complexes: Complex[];
  onChoose: (match: AddressMatch) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);

  const query = text.trim();

  useEffect(() => {
    if (query.length < MIN_CHARACTERS) return;
    let superseded = false;
    const timer = setTimeout(async () => {
      const matches = await searchAddresses(query, complexes);
      if (superseded) return;
      setSuggestions({ query, matches });
      setActiveIndex(-1);
    }, TYPING_PAUSE_MS);
    return () => {
      superseded = true;
      clearTimeout(timer);
    };
  }, [query, complexes]);

  const shown = suggestions?.query === query && dismissedQuery !== query ? suggestions : null;
  const matches = shown?.matches ?? [];
  const isOpen = matches.length > 0;
  const showsNoMatch = shown !== null && matches.length === 0;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (!shown) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setDismissedQuery(query);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
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
      if (!suggestions || suggestions.query !== query || suggestions.matches.length === 0) return;
      event.preventDefault();
      setDismissedQuery(null);
      const last = suggestions.matches.length - 1;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current === -1 ? (step === 1 ? 0 : last) : (current + step + last + 1) % (last + 1)));
      return;
    }
    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      choose(matches[activeIndex] ?? matches[0]);
    }
  };

  return (
    <Glass
      as="header"
      className={`fixed top-(--gutter) left-(--gutter) ${isOpen || showsNoMatch ? "z-5" : "z-3"} w-[340px] rounded-[28px] px-[22px] pt-[22px] pb-[18px] phone:right-(--gutter) phone:w-auto phone:rounded-3xl phone:px-4 phone:py-3.5`}
    >
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-deep italic phone:text-[28px]">
        Building Record
      </h1>
      <p className="mt-2 mb-4 max-w-[26ch] text-slate phone:hidden">
        Austin apartments, seen through the city&apos;s own complaint files.
      </p>
      <div ref={rootRef} className="relative phone:mt-2.5">
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
            aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            placeholder={PLACEHOLDER}
            aria-label={PLACEHOLDER}
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
        {isOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            className={SURFACE}
          >
            {matches.map((match, index) => (
              <li
                key={`${match.label}-${match.complexId ?? "city"}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Keeps focus in the input so the list survives the press.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(match)}
                className="flex cursor-pointer items-baseline justify-between gap-3 rounded-xl px-3 py-[9px] text-deep hover:bg-white/70 aria-selected:bg-white/70"
              >
                <span>{match.label}</span>
                {match.complexId && <span className="flex-none text-[13px] text-slate">apartments</span>}
              </li>
            ))}
          </ul>
        )}
        {showsNoMatch && (
          <p role="status" className={`${SURFACE} px-[18px] py-3.5 text-slate`}>
            {NO_MATCH}
          </p>
        )}
      </div>
    </Glass>
  );
}

const SURFACE =
  "absolute top-[52px] right-0 left-0 z-10 rounded-[18px] border border-white/70 bg-ice/92 p-1.5 shadow-[0_18px_36px_-18px_color-mix(in_srgb,var(--color-navy)_50%,transparent)]";
