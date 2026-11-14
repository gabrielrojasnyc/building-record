import { useId, useRef } from "react";
import { countFor, type View } from "@/domain/query";
import type { Category, Complex, Counts } from "@/domain/types";
import { Glass } from "./Glass";

export interface Area {
  name: string;
  lon: number;
  lat: number;
}

export const AREAS: Area[] = [
  { name: "Downtown", lon: -97.7431, lat: 30.268 },
  { name: "The Domain", lon: -97.722, lat: 30.402 },
  { name: "East Riverside", lon: -97.725, lat: 30.237 },
  { name: "South Lamar", lon: -97.77, lat: 30.248 },
  { name: "Rundberg", lon: -97.703, lat: 30.362 },
  { name: "Mueller", lon: -97.705, lat: 30.298 },
];

const CARD_LIMIT = 40;

/** Listed in the order that breaks ties when a building's top category is chosen. */
const CATEGORY_LABEL: Record<Category, string> = {
  structure: "Structure condition",
  property: "Property upkeep",
  landuse: "Land use",
  permit: "Work without permit",
};

const CARD_SIZE = "h-[148px] rounded-[22px] px-[18px] py-4 phone:h-[136px]";

interface TrayProps {
  complexes: Complex[];
  view: View;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  onToggleOrder(): void;
  onJump(area: Area): void;
}

function topCategory(counts: Counts): Category {
  const categories = Object.keys(CATEGORY_LABEL) as Category[];
  return categories.reduce((top, category) =>
    counts[category] > counts[top] ? category : top,
  );
}

function caseCaption(count: number): string {
  if (count === 0) return "no cases on file";
  return count === 1 ? "code case" : "code cases";
}

function TrayCard(props: {
  complex: Complex;
  view: View;
  selected: boolean;
  hovered: boolean;
  onSelect(id: string): void;
  onHover(id: string): void;
}) {
  const { complex, view, selected, hovered } = props;
  const count = countFor(complex, view);
  const detail =
    count === 0
      ? `${complex.acres} acres`
      : `Mostly ${CATEGORY_LABEL[topCategory(complex[view.period])].toLowerCase()}`;

  return (
    <button
      type="button"
      data-testid="card"
      aria-current={selected ? "true" : undefined}
      data-hovered={hovered ? "" : undefined}
      onClick={() => props.onSelect(complex.id)}
      onMouseEnter={() => props.onHover(complex.id)}
      className={`tray-card glass flex w-[232px] flex-none cursor-pointer snap-start flex-col text-left phone:w-[200px] ${CARD_SIZE}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          {count === 0 ? (
            <span
              className={`block font-display text-[34px] leading-[1.1] italic ${selected ? "text-ice" : "text-deep"}`}
            >
              None
            </span>
          ) : (
            <span
              className={`block text-[46px] leading-[0.9] font-extralight tracking-[-0.03em] tabular-nums ${selected ? "text-ice" : "text-deep"}`}
            >
              {count}
            </span>
          )}
          <span
            className={`mt-1 block text-[12.5px] ${selected ? "text-mist" : "text-steel"}`}
          >
            {caseCaption(count)}
          </span>
        </span>
        {complex.repeatOffender && (
          <span
            className={`inline-flex h-6 flex-none items-center gap-1.5 rounded-full bg-coral/32 pr-[9px] pl-2 text-[11.5px] font-normal ${selected ? "text-ice" : "text-navy"}`}
          >
            <span aria-hidden className="size-[7px] rounded-full bg-coral" />
            Repeat Offender
          </span>
        )}
      </span>
      <span className="mt-auto leading-[1.25] font-normal">
        {complex.address}
        <small
          className={`mt-0.5 block text-[12.5px] font-light ${selected ? "text-mist" : "text-slate"}`}
        >
          {detail}
        </small>
      </span>
    </button>
  );
}

function TrayNote({ children }: { children: string }) {
  return (
    <Glass
      className={`flex w-[280px] flex-none snap-start flex-col justify-center text-slate ${CARD_SIZE}`}
    >
      {children}
    </Glass>
  );
}

export function Tray(props: TrayProps) {
  const { complexes, view, selectedId, hoveredId } = props;
  const countId = useId();
  const cardsRef = useRef<HTMLDivElement>(null);
  const total = complexes.length;
  const hidden = total - CARD_LIMIT;

  const toggleOrder = () => {
    props.onToggleOrder();
    if (cardsRef.current) cardsRef.current.scrollLeft = 0;
  };

  return (
    <section aria-labelledby={countId}>
      <div className="flex items-center gap-2.5 px-(--gutter) pb-2.5">
        <Glass className="flex h-[42px] flex-none items-center gap-2 rounded-full pr-1.5 pl-[18px]">
          <p id={countId} className="flex items-center gap-2">
            <strong className="font-display text-2xl leading-none font-normal text-deep tabular-nums">
              {total.toLocaleString("en-US")}
            </strong>{" "}
            <span className="text-sm text-slate">
              {total === 1 ? "complex in view" : "complexes in view"}
            </span>
          </p>
          <button
            type="button"
            onClick={toggleOrder}
            className="ml-1.5 h-[30px] cursor-pointer rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
          >
            {view.order === "fewest" ? "Fewest first" : "Most first"}
          </button>
        </Glass>
        <nav
          aria-label="Jump to an area"
          className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] phone:hidden [&::-webkit-scrollbar]:hidden"
        >
          {AREAS.map((area) => (
            <button
              key={area.name}
              type="button"
              onClick={() => props.onJump(area)}
              className="h-[30px] flex-none cursor-pointer rounded-full border border-ice/50 bg-deep/28 px-[13px] text-[13px] font-normal text-ice backdrop-blur-[10px] hover:bg-deep/50"
            >
              {area.name}
            </button>
          ))}
        </nav>
      </div>
      <div
        ref={cardsRef}
        onMouseLeave={() => props.onHover(null)}
        className="flex snap-x snap-proximity scroll-px-(--gutter) gap-3 overflow-x-auto px-(--gutter) pt-2 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {complexes.slice(0, CARD_LIMIT).map((complex) => (
          <TrayCard
            key={complex.id}
            complex={complex}
            view={view}
            selected={complex.id === selectedId}
            hovered={complex.id === hoveredId}
            onSelect={props.onSelect}
            onHover={props.onHover}
          />
        ))}
        {total === 0 && (
          <TrayNote>
            No apartment complexes in this part of the map. Zoom out or jump to
            an area.
          </TrayNote>
        )}
        {hidden > 0 && (
          <TrayNote>{`${hidden.toLocaleString("en-US")} more in view. Zoom in to narrow them down.`}</TrayNote>
        )}
      </div>
    </section>
  );
}
