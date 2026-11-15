import { useId, type Ref } from "react";
import { AREAS, type Area } from "@/domain/areas";
import { countFor, type View } from "@/domain/query";
import type { Complex } from "@/domain/types";
import { CountPill } from "./CountPill";

interface InViewBarProps {
  complexes: Complex[];
  /** The map has not yet said what it shows, so the complexes are all of Austin's. */
  awaitingView: boolean;
  view: View;
  /** The count line, which takes focus when a building closes. */
  countRef?: Ref<HTMLParagraphElement>;
  onJump(area: Area): void;
}

/** The map screen's bottom row: how many complexes are in view, and the area shortcuts beside them. */
export function InViewBar(props: InViewBarProps) {
  const { complexes, view } = props;
  const countId = useId();
  const leftOut = complexes.filter(
    (complex) => countFor(complex, view) === 0,
  ).length;

  return (
    <section aria-labelledby={countId}>
      <div className="flex items-center gap-2.5 px-(--gutter) pb-2.5">
        <CountPill
          id={countId}
          countRef={props.countRef}
          total={complexes.length}
          leftOut={leftOut}
          where={props.awaitingView ? "in Austin" : "in view"}
          category={view.category}
        />
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
    </section>
  );
}
