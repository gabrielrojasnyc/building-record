import {
  createContext,
  useEffect,
  useRef,
  useState,
} from "react";

/** A list row under a hairline, as every list in the record panel is drawn. */
export const RULED_ROW = "border-t border-deep/10 py-[9px]";

/** A ruled row of a label and its count, with the counts in one column at the right. */
export const COUNT_ROW = `grid grid-cols-[1fr_auto] items-baseline gap-3 ${RULED_ROW}`;

/** A sentence that stands in for content: loading, failed or nothing to show. */
export const MESSAGE = "text-[13.5px] text-slate";

/** Headings inside the record sit one level under the building's title: h2 under the page's h1, h3 under the panel's h2. */
export const RecordHeadingLevel = createContext<"h2" | "h3">("h3");

/** The button that opens the rest of a list in place. */
export const SHOW_ALL =
  "mt-2.5 inline-flex h-[30px] cursor-pointer items-center rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85";

/** Whether a list shows all of itself yet, and the list to move focus to once it does, since the button that asked goes. */
export function useShowAll() {
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (showAll) listRef.current?.focus({ preventScroll: true });
  }, [showAll]);
  return { showAll, listRef, reveal: () => setShowAll(true) };
}
