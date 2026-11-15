import type { ReactNode, Ref } from "react";
import { formatCount } from "@/domain/format";
import type { View } from "@/domain/query";
import { Glass } from "./Glass";

interface CountPillProps {
  /** The count line's id, so the region around the pill can be named by it. */
  id: string;
  /** The count line, which takes focus when a closed building has no card to go back to. */
  countRef?: Ref<HTMLParagraphElement>;
  total: number;
  /** How many of them have no complaints in the view, said beside the count when there are any. */
  leftOut: number;
  where: "in view" | "in Austin";
  category: View["category"];
  /** A control at the pill's right end, such as the list's order button. */
  children?: ReactNode;
}

/** The glass pill that counts the complexes and how many of them have no complaints. */
export function CountPill({
  id,
  countRef,
  total,
  leftOut,
  where,
  category,
  children,
}: CountPillProps) {
  return (
    <Glass
      className={`flex h-[42px] flex-none items-center gap-2 rounded-full pl-[18px] ${children ? "pr-1.5" : "pr-[18px]"}`}
    >
      {/* Side by side with a rule between them; on a phone the second sits small under the first, so the pill keeps its width. */}
      <div className="flex items-center gap-2 phone:flex-col phone:items-start phone:gap-0">
        <p
          id={id}
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
              {category === "all"
                ? "with no complaints"
                : "with none of this type"}
            </p>
          </>
        )}
      </div>
      {children}
    </Glass>
  );
}
