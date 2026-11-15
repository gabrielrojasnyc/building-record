import type { ReactNode } from "react";
import {
  CATEGORY_BUTTON_LABEL,
  CATEGORY_LABEL,
  CATEGORY_MEANING,
} from "@/domain/labels";
import { PERIODS, PERIOD_LABEL } from "@/domain/periods";
import type { CategoryFilter, View } from "@/domain/query";
import { Glass } from "./Glass";

/** One word each, so the bar fits beside the title block on a 1280 px screen; the title gives the full name and what it covers. */
const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "structure", label: CATEGORY_BUTTON_LABEL.structure },
  { value: "property", label: CATEGORY_BUTTON_LABEL.property },
  { value: "landuse", label: CATEGORY_BUTTON_LABEL.landuse },
  { value: "permit", label: CATEGORY_BUTTON_LABEL.permit },
];

function FilterButton(props: {
  pressed: boolean;
  onClick(): void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className="flex h-[34px] cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-normal whitespace-nowrap text-slate motion-safe:transition-[background-color,color] motion-safe:duration-200 not-aria-pressed:hover:bg-white/40 aria-pressed:bg-deep aria-pressed:text-ice aria-pressed:inset-shadow-2xs aria-pressed:inset-shadow-white/18"
    >
      {props.children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="h-5 w-px flex-none bg-deep/16" />;
}

export function Filters({
  view,
  onChange,
}: {
  view: View;
  onChange(view: View): void;
}) {
  return (
    <Glass className="fixed top-(--gutter) left-[calc(340px+var(--gutter)*2)] z-3 flex max-w-[calc(100vw-340px-var(--gutter)*3-52px)] items-center gap-1.5 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] phone:right-(--gutter) phone:left-(--gutter) phone:top-[124px] phone:max-w-none [&::-webkit-scrollbar]:hidden">
      <div role="group" aria-label="Period" className="flex flex-none gap-0.5">
        {PERIODS.map((period) => (
          <FilterButton
            key={period}
            pressed={view.period === period}
            onClick={() => onChange({ ...view, period })}
          >
            {PERIOD_LABEL[period]}
          </FilterButton>
        ))}
      </div>
      <Divider />
      <div
        role="group"
        aria-label="Complaint type"
        className="flex flex-none gap-0.5"
      >
        {CATEGORIES.map(({ value, label }) => (
          <FilterButton
            key={value}
            pressed={view.category === value}
            onClick={() => onChange({ ...view, category: value })}
            title={
              value === "all"
                ? undefined
                : `${CATEGORY_LABEL[value]}: ${CATEGORY_MEANING[value]}`
            }
          >
            {label}
          </FilterButton>
        ))}
      </div>
      <Divider />
      <div className="flex flex-none">
        <FilterButton
          pressed={view.repeatOffendersOnly}
          onClick={() =>
            onChange({
              ...view,
              repeatOffendersOnly: !view.repeatOffendersOnly,
            })
          }
        >
          <span
            aria-hidden
            className="size-[9px] rounded-full bg-coral ring-3 ring-coral/30"
          />
          Repeat Offenders
        </FilterButton>
      </div>
    </Glass>
  );
}
