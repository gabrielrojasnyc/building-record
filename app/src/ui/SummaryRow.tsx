"use client";

import { useId, useState, type ReactNode } from "react";

/** Points right while its row is closed, and down once it is open. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={`size-2.5 flex-none text-steel motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-90" : ""}`}
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
  );
}

/** A sentence of the summary reads a little larger than a label that only names what it opens. */
const TEXT = {
  sentence: "text-[15.5px] leading-[1.35]",
  label: "text-[14.5px] leading-[1.35]",
};

/** The hairline between rows: the panel's own, or the coral of the Repeat Offender block the row stands in. */
const RULE = {
  plain: "border-deep/10",
  listed: "border-coral/60",
};

/**
 * One line of a building's summary. With something behind it the line is a button that opens it in place,
 * under the line; with nothing behind it the line stands alone, set in from the left like the others.
 */
export function SummaryRow(props: {
  /** What the line says. */
  children: ReactNode;
  /** What stands behind the line. Drawn only while the row is open. */
  detail?: ReactNode;
  startOpen?: boolean;
  kind?: keyof typeof TEXT;
  tone?: keyof typeof RULE;
}) {
  const { kind = "sentence", tone = "plain" } = props;
  const [open, setOpen] = useState(props.startOpen ?? false);
  const detailId = useId();
  const line = `${TEXT[kind]} font-normal text-navy`;

  return (
    <li className={`border-t ${RULE[tone]}`}>
      {props.detail === undefined ? (
        <p className={`${line} py-[11px] pl-5`}>{props.children}</p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen(!open)}
            className={`${line} -mx-2 flex w-[calc(100%+16px)] cursor-pointer items-baseline gap-2.5 rounded-[12px] px-2 py-[11px] text-left hover:bg-white/30`}
          >
            <Chevron open={open} />
            <span className="flex-1">{props.children}</span>
          </button>
          {open && (
            <div id={detailId} className="pb-4 pl-5 motion-safe:animate-unfold">
              {props.detail}
            </div>
          )}
        </>
      )}
    </li>
  );
}
