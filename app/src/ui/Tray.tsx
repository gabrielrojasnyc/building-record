import { useId, useRef, useState, type Ref } from "react";
import { formatCount } from "@/domain/format";
import { CATEGORY_LABEL, OUTCOME_CARD_PHRASE, titleOf } from "@/domain/labels";
import { OUTCOMES, OUTCOME_LABEL, type Outcome } from "@/domain/outcomes";
import { PERIOD_PHRASE } from "@/domain/periods";
import {
  countFor,
  outcomeSplit,
  viewToSearchParams,
  type View,
} from "@/domain/query";
import type { Complex } from "@/domain/types";
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

/** 18 px taller than before outcomes, the height of the line that names them. Finder's camera padding and the panel's bottom grow with it. */
const CARD_SIZE = "h-[166px] rounded-[22px] px-[18px] py-4 phone:h-[154px]";

interface TrayProps {
  complexes: Complex[];
  /** Every complex in Austin as a wrapping list the page scrolls, for a device where the map cannot start. */
  citywide?: boolean;
  /** The map has not yet said what it shows, so the complexes are all of Austin's. */
  awaitingView?: boolean;
  view: View;
  selectedId: string | null;
  hoveredId: string | null;
  /** The count line that heads the tray, which takes focus when a closed building has no card here. */
  countRef?: Ref<HTMLParagraphElement>;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  onToggleOrder(): void;
  onJump(area: Area): void;
}

const complaintsWord = (count: number) =>
  count === 1 ? "complaint" : "complaints";

/** An outcome's full label after a count, in lower case. Only a confirmed violation changes with number. */
function outcomeInFull(outcome: Outcome, count: number): string {
  return outcome === "violation" && count !== 1
    ? "violations confirmed"
    : OUTCOME_LABEL[outcome].toLowerCase();
}

/**
 * The two largest outcomes of a card's complaints, largest first, ties in display order, zeros never shown:
 * in the card's short words for the line itself, and in full for its title.
 */
function outcomeLine(split: Record<Outcome, number>): {
  text: string;
  title: string;
} {
  const largest = OUTCOMES.filter((outcome) => split[outcome] > 0)
    .sort(
      (a, b) =>
        split[b] - split[a] || OUTCOMES.indexOf(a) - OUTCOMES.indexOf(b),
    )
    .slice(0, 2);
  return {
    text: largest
      .map(
        (outcome) =>
          `${formatCount(split[outcome])} ${OUTCOME_CARD_PHRASE[outcome]}`,
      )
      .join(", "),
    title: largest
      .map(
        (outcome) =>
          `${formatCount(split[outcome])} ${outcomeInFull(outcome, split[outcome])}`,
      )
      .join(", "),
  };
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
  const outcomes = outcomeLine(outcomeSplit(complex, view));
  // Under a type filter the figure counts that type alone, and a card with no name has room to say so.
  const onlyType =
    view.category === "all" ? null : `${CATEGORY_LABEL[view.category]} only`;
  const title = titleOf(complex);
  const underTitle = complex.name ? complex.address : onlyType;
  const smallText = `block text-[12.5px] ${selected ? "text-mist" : "text-steel"}`;

  return (
    <button
      type="button"
      data-testid="card"
      data-complex-id={complex.id}
      aria-current={selected ? "true" : undefined}
      data-hovered={hovered ? "" : undefined}
      onClick={() => props.onSelect(complex.id)}
      onMouseEnter={() => props.onHover(complex.id)}
      className={`tray-card glass flex w-[232px] flex-none cursor-pointer snap-start flex-col text-left phone:w-[200px] ${CARD_SIZE}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span
            className={`block text-[46px] leading-[0.9] font-extralight tracking-[-0.03em] tabular-nums ${selected ? "text-ice" : "text-deep"}`}
          >
            {formatCount(count)}
          </span>
        </span>
        {/* On a phone the chip is its coral dot alone, the site's mark for the list, so a three-digit figure keeps clear of it. */}
        {complex.repeatOffender && (
          <span
            title="Repeat Offender"
            className={`inline-flex h-6 flex-none items-center gap-1.5 rounded-full pr-[9px] pl-2 text-[11.5px] font-normal phone:w-6 phone:justify-center phone:pr-0 phone:pl-0 ${selected ? "bg-coral/20 text-ice" : "bg-coral/32 text-navy"}`}
          >
            <span aria-hidden className="size-[7px] rounded-full bg-coral" />
            <span className="phone:sr-only">Repeat Offender</span>
          </span>
        )}
      </span>
      {/* Under the figure's row, not beside the chip, so a caption has the card's whole width. */}
      <span className={`mt-1 ${smallText}`}>{complaintsWord(count)}</span>
      <span title={outcomes.title} className={`truncate ${smallText}`}>
        {outcomes.text}
      </span>
      {/* The card's height is fixed, so the title keeps to one line, and so do the outcomes and an address under a name. */}
      <span className="mt-auto min-w-0 leading-[1.25] font-normal">
        <span title={title} className="block truncate">
          {title}
        </span>
        {underTitle && (
          <small
            title={complex.name ? complex.address : undefined}
            className={`mt-0.5 block text-[12.5px] font-light ${complex.name ? "truncate" : ""} ${selected ? "text-mist" : "text-slate"}`}
          >
            {underTitle}
          </small>
        )}
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
  const { complexes, view, selectedId, hoveredId, countRef } = props;
  const countId = useId();
  const cardsRef = useRef<HTMLDivElement>(null);
  const citywide = props.citywide === true;
  const countsAustin = citywide || props.awaitingView === true;
  const total = complexes.length;
  // A card is for a complex with complaints in the view. The rest stay on the map and in search, and are counted beside the total.
  const listed = complexes.filter((complex) => countFor(complex, view) > 0);
  const leftOut = total - listed.length;
  const where = countsAustin ? "in Austin" : "in view";

  // Pages of 40 apply to the view they were asked for; any other view starts again at one page.
  const viewKey = viewToSearchParams(view).toString();
  const [revealed, setRevealed] = useState({ viewKey, pages: 1 });
  const pages = revealed.viewKey === viewKey ? revealed.pages : 1;
  const shown = citywide
    ? Math.min(listed.length, CARD_LIMIT * pages)
    : Math.min(listed.length, CARD_LIMIT);
  const hidden = listed.length - shown;

  const toggleOrder = () => {
    props.onToggleOrder();
    if (cardsRef.current) cardsRef.current.scrollLeft = 0;
  };

  return (
    <section
      aria-labelledby={countId}
      className={citywide ? "flex min-h-0 flex-1 flex-col" : undefined}
    >
      <div className="flex items-center gap-2.5 px-(--gutter) pb-2.5">
        <Glass className="flex h-[42px] flex-none items-center gap-2 rounded-full pr-1.5 pl-[18px]">
          {/* Side by side with a rule between them; on a phone the second sits small under the first, so the pill keeps its width. */}
          <div className="flex items-center gap-2 phone:flex-col phone:items-start phone:gap-0">
            <p
              id={countId}
              ref={countRef}
              tabIndex={-1}
              className="flex items-center gap-2"
            >
              <strong className="font-display text-2xl leading-none font-normal text-deep tabular-nums">
                {total.toLocaleString("en-US")}
              </strong>{" "}
              <span className="text-sm text-slate">
                {total === 1 ? "complex" : "complexes"} {where}
              </span>
            </p>
            {leftOut > 0 && (
              <>
                <span
                  aria-hidden
                  className="h-5 w-px flex-none bg-deep/16 phone:hidden"
                />
                <p className="text-[13px] whitespace-nowrap text-steel phone:text-[11px] phone:leading-none">
                  {formatCount(leftOut)}{" "}
                  {view.category === "all"
                    ? "with no complaints"
                    : "with none of this type"}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={toggleOrder}
            className="ml-1.5 h-[30px] cursor-pointer rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
          >
            {view.order === "fewest" ? "Fewest first" : "Most first"}
          </button>
        </Glass>
        {!citywide && (
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
        )}
      </div>
      <div
        ref={cardsRef}
        onMouseLeave={() => props.onHover(null)}
        className={
          citywide
            ? "flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto px-(--gutter) pt-2 pb-1.5"
            : "flex snap-x snap-proximity scroll-px-(--gutter) gap-3 overflow-x-auto px-(--gutter) pt-2 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        }
      >
        {listed.slice(0, shown).map((complex) => (
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
            {citywide
              ? "No apartment complexes match these filters."
              : "No apartment complexes in this part of the map. Zoom out or jump to an area."}
          </TrayNote>
        )}
        {total > 0 && listed.length === 0 && (
          <TrayNote>
            {`No ${view.category === "all" ? "" : `${CATEGORY_LABEL[view.category].toLowerCase()} `}complaints ${PERIOD_PHRASE[view.period]} at the ${total === 1 ? "one complex" : `${formatCount(total)} complexes`} ${where}.`}
          </TrayNote>
        )}
        {!citywide && hidden > 0 && (
          <TrayNote>
            {countsAustin
              ? `${hidden.toLocaleString("en-US")} more in Austin.`
              : `${hidden.toLocaleString("en-US")} more in view. Zoom in to narrow them down.`}
          </TrayNote>
        )}
        {citywide && listed.length > CARD_LIMIT && (
          <div className="flex w-full items-center gap-3 pt-1 pb-1 text-[13px] text-slate">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setRevealed({ viewKey, pages: pages + 1 })}
                className="h-[30px] cursor-pointer rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
              >
                {`Show ${CARD_LIMIT} more`}
              </button>
            )}
            <span>
              {hidden > 0
                ? `Showing ${formatCount(shown)} of ${formatCount(listed.length)}`
                : `Showing all ${formatCount(listed.length)}`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
