import { useId, useState, type Ref } from "react";
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
import { CountPill } from "./CountPill";
import { Glass } from "./Glass";

const PAGE_SIZE = 40;

/** One fixed height for every card and note, whatever their lines, so the rows of the list line up. */
const CARD_SIZE = "h-[166px] rounded-[22px] px-[18px] py-4 phone:h-[154px]";

interface ComplexListProps {
  /** Every complex in Austin under the filters, in the view's order. */
  complexes: Complex[];
  view: View;
  selectedId: string | null;
  /** The count line, which takes focus when a closed building has no card here. */
  countRef?: Ref<HTMLParagraphElement>;
  onSelect(id: string): void;
  onToggleOrder(): void;
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

function ComplexCard(props: {
  complex: Complex;
  view: View;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const { complex, view, selected } = props;
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
      onClick={() => props.onSelect(complex.id)}
      className={`complex-card glass flex w-[232px] flex-none cursor-pointer flex-col text-left phone:w-[200px] ${CARD_SIZE}`}
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

function ListNote({ children }: { children: string }) {
  return (
    <Glass
      className={`flex w-[280px] flex-none flex-col justify-center text-slate ${CARD_SIZE}`}
    >
      {children}
    </Glass>
  );
}

/**
 * Every complex in Austin as a wrapping list the page scrolls, for a device where the map cannot start.
 * A card is for a complex with complaints in the view; the rest are counted beside the total, and found by search.
 */
export function ComplexList(props: ComplexListProps) {
  const { complexes, view, selectedId } = props;
  const countId = useId();
  const total = complexes.length;
  const listed = complexes.filter((complex) => countFor(complex, view) > 0);

  // Pages of 40 apply to the view they were asked for; any other view starts again at one page.
  const viewKey = viewToSearchParams(view).toString();
  const [revealed, setRevealed] = useState({ viewKey, pages: 1 });
  const pages = revealed.viewKey === viewKey ? revealed.pages : 1;
  const shown = Math.min(listed.length, PAGE_SIZE * pages);
  const hidden = listed.length - shown;

  return (
    <section aria-labelledby={countId} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 px-(--gutter) pb-2.5">
        <CountPill
          id={countId}
          countRef={props.countRef}
          total={total}
          leftOut={total - listed.length}
          where="in Austin"
          category={view.category}
        >
          <button
            type="button"
            onClick={props.onToggleOrder}
            className="ml-1.5 h-[30px] cursor-pointer rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
          >
            {view.order === "fewest" ? "Fewest first" : "Most first"}
          </button>
        </CountPill>
      </div>
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto px-(--gutter) pt-2 pb-1.5">
        {listed.slice(0, shown).map((complex) => (
          <ComplexCard
            key={complex.id}
            complex={complex}
            view={view}
            selected={complex.id === selectedId}
            onSelect={props.onSelect}
          />
        ))}
        {total === 0 && (
          <ListNote>No apartment complexes match these filters.</ListNote>
        )}
        {total > 0 && listed.length === 0 && (
          <ListNote>
            {`No ${view.category === "all" ? "" : `${CATEGORY_LABEL[view.category].toLowerCase()} `}complaints ${PERIOD_PHRASE[view.period]} at the ${total === 1 ? "one complex" : `${formatCount(total)} complexes`} in Austin.`}
          </ListNote>
        )}
        {listed.length > PAGE_SIZE && (
          <div className="flex w-full items-center gap-3 pt-1 pb-1 text-[13px] text-slate">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setRevealed({ viewKey, pages: pages + 1 })}
                className="h-[30px] cursor-pointer rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
              >
                {`Show ${PAGE_SIZE} more`}
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
