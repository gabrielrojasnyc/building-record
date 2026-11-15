"use client";

import { useId, useState } from "react";
import { formatCount } from "@/domain/format";
import { CATEGORY_LABEL } from "@/domain/labels";
import type { Period } from "@/domain/periods";
import { countFor, DEFAULT_VIEW, type View } from "@/domain/query";
import type { BuildingDetail, Category, Complaint, Complex } from "@/domain/types";
import { CategoryDetail } from "./CategoryDetail";
import { Section, useSubheadingLevel } from "./panelParts";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

function countsByCategory(complex: Complex, period: Period): Record<Category, number> {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category, countFor(complex, { ...DEFAULT_VIEW, period, category })]),
  ) as Record<Category, number>;
}

/**
 * One row per category, each opening in place to explain itself; one open at a time. A type the map is
 * filtered to starts open, so the number on the card is the first thing found; a later filter change
 * leaves the person's choice alone.
 */
export function Categories(props: {
  complex: Complex;
  view: View;
  complaints: Complaint[] | "loading" | "failed";
  deficiencies: BuildingDetail["deficiencies"];
  stillOpenIn(category: Category): number | null;
}) {
  const { complex, view } = props;
  const inPeriod = countsByCategory(complex, view.period);
  const inThreeYears = countsByCategory(complex, "y3");
  const filtered = view.category;
  const [open, setOpen] = useState<Category | null>(() =>
    filtered !== "all" && inThreeYears[filtered] > 0 ? filtered : null,
  );
  const idPrefix = useId();
  const subheading = useSubheadingLevel();

  // Bars compare the counts on show: the period's, or the 3 years' when the period has none at all.
  const periodIsEmpty = CATEGORIES.every((category) => inPeriod[category] === 0);
  const longest = Math.max(1, ...CATEGORIES.map((category) => (periodIsEmpty ? inThreeYears : inPeriod)[category]));

  return (
    <Section title="What the complaints were about">
      <ul>
        {CATEGORIES.map((category) => {
          const fromThreeYears = inPeriod[category] === 0 && inThreeYears[category] > 0;
          const shown = fromThreeYears ? inThreeYears[category] : inPeriod[category];
          const share = (periodIsEmpty || !fromThreeYears ? shown : 0) / longest;
          const isOpen = open === category;
          const detailId = `${idPrefix}-${category}`;
          const row = (
            <CategoryLine
              label={CATEGORY_LABEL[category]}
              count={shown}
              fromThreeYears={fromThreeYears}
              share={share}
              chevron={inThreeYears[category] > 0 ? (isOpen ? "open" : "closed") : null}
            />
          );

          return (
            <li key={category}>
              {inThreeYears[category] === 0 ? (
                <div className="py-[7px] text-[14px] text-steel">{row}</div>
              ) : (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() => setOpen(isOpen ? null : category)}
                  className="-mx-2 block w-[calc(100%+16px)] cursor-pointer rounded-[12px] px-2 py-[7px] text-left text-[14px] hover:bg-white/30"
                >
                  {row}
                </button>
              )}
              {isOpen && (
                <div id={detailId} className="pt-2 pb-3 pl-[18px] motion-safe:animate-unfold">
                  <CategoryDetail
                    category={category}
                    complex={complex}
                    complaints={props.complaints}
                    deficiencies={props.deficiencies}
                    view={view}
                    isRepeatOffender={complex.repeatOffender !== null}
                    violationsOpen={props.stillOpenIn(category)}
                    heading={subheading}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** A category's name and count on one line, with a chevron when it opens, and its thin bar beneath. */
function CategoryLine(props: {
  label: string;
  count: number;
  /** The period has none of these, so the count is the 3 years'. */
  fromThreeYears: boolean;
  share: number;
  chevron: "open" | "closed" | null;
}) {
  return (
    <>
      <span className="flex items-center gap-2">
        {props.chevron === null ? (
          <span aria-hidden className="size-2.5 flex-none" />
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 10 10"
            className={`size-2.5 flex-none text-steel motion-safe:transition-transform motion-safe:duration-200 ${props.chevron === "open" ? "rotate-90" : ""}`}
          >
            <path
              d="M3.5 1.5 7 5l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span className="flex-1">{props.label}</span>
        <span className="tabular-nums">
          {formatCount(props.count)}
          {props.fromThreeYears && (
            <>
              {" "}
              <span className="text-[12px] text-steel">in 3 years</span>
            </>
          )}
        </span>
      </span>
      <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-deep/12">
        <span
          className="block h-full rounded-full bg-linear-to-r/srgb from-steel to-deep"
          style={{ width: `${props.share * 100}%` }}
        />
      </span>
    </>
  );
}
