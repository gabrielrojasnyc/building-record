import type { ReactNode } from "react";
import type { CategoryFilter, Period, View } from "@/domain/query";
import { Glass } from "./Glass";

const PERIODS: { value: Period; label: string }[] = [
  { value: "cases12", label: "12 months" },
  { value: "cases", label: "Since 2023" },
];

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "structure", label: "Structure" },
  { value: "property", label: "Property" },
  { value: "landuse", label: "Land use" },
  { value: "permit", label: "Permits" },
];

function FilterButton(props: {
  pressed: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
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
        {PERIODS.map(({ value, label }) => (
          <FilterButton
            key={value}
            pressed={view.period === value}
            onClick={() => onChange({ ...view, period: value })}
          >
            {label}
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
