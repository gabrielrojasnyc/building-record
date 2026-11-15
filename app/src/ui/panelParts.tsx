import { createContext, useContext, useId, type ReactNode } from "react";

/** A list row under a hairline, as every list in the record panel is drawn. */
export const RULED_ROW = "border-t border-deep/10 py-[9px]";

/** A ruled row of a label and its count, with the counts in one column at the right. */
export const COUNT_ROW = `grid grid-cols-[1fr_auto] items-baseline gap-3 ${RULED_ROW}`;

/** A sentence that stands in for content: loading, failed or nothing to show. */
export const MESSAGE = "text-[13.5px] text-slate";

/** Section headings sit one level under the building's title: h2 under the page's h1, h3 under the panel's h2. */
export const SectionLevel = createContext<"h2" | "h3">("h3");

/** Headings inside a section, one level under the section's own. */
export const useSubheadingLevel = (): "h3" | "h4" =>
  useContext(SectionLevel) === "h2" ? "h3" : "h4";

const SECTION = "mt-[22px]";
const SECTION_HEADING =
  "mb-2.5 font-display text-[20px] leading-none font-normal text-deep";

/** One of the record panel's sections, headed at the level its placement calls for. */
export function Section(props: { title: string; children: ReactNode }) {
  const headingId = useId();
  const level = useContext(SectionLevel);
  const heading = {
    id: headingId,
    className: SECTION_HEADING,
    children: props.title,
  };
  return (
    <section aria-labelledby={headingId} className={SECTION}>
      {level === "h2" ? <h2 {...heading} /> : <h3 {...heading} />}
      {props.children}
    </section>
  );
}
