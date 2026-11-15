"use client";

import { useId, type ReactNode } from "react";
import { formatCount, formatDate } from "@/domain/format";
import {
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  CITY_CATEGORY_TERM,
} from "@/domain/labels";
import { OUTCOME_LABEL, restatesOutcome } from "@/domain/outcomes";
import { PERIODS, PERIOD_LABEL, PERIOD_PHRASE } from "@/domain/periods";
import {
  countFor,
  DEFAULT_VIEW,
  outcomeSplit,
  type View,
} from "@/domain/query";
import type { Category, Complaint, Complex } from "@/domain/types";
import { OutcomeSummary } from "./OutcomeSummary";
import { MESSAGE, RULED_ROW, SHOW_ALL, useShowAll } from "./panelParts";

/** The complaints list holds this many until the person asks for the rest. */
const FIRST_COMPLAINTS = 12;

const SUBHEADING =
  "mb-2 font-display text-[17px] leading-none font-normal text-deep";

const DAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/** What follows the outcome label for a confirmed violation: whether its case is still open, or when it closed. */
function caseState({ opened, closed, outcome, stillOpen }: Complaint): string {
  if (outcome !== "violation") return "";
  if (stillOpen) return "still open";
  if (closed === null) return "";
  const sameYear = closed.slice(0, 4) === opened.slice(0, 4);
  return `closed ${formatDate(closed, sameYear ? { month: "short", day: "numeric" } : DAY)}`;
}

/**
 * One complaint category opened in place: what it covers, its complaints in each period, what the
 * city found and the complaints themselves. It loads nothing; the panel hands it what it has.
 */
export function CategoryDetail(props: {
  category: Category;
  complex: Complex;
  /** This building's complaints of every type, or where the building file has got to. */
  complaints: Complaint[] | "loading" | "failed";
  view: View;
  /** Confirmed violations of this type still open in the active period, or null while the building file is not in. */
  violationsOpen: number | null;
  /** One level under the building's title. */
  heading?: "h2" | "h3";
}) {
  const { category, complex, view } = props;
  const Heading = props.heading ?? "h3";
  const inView = { ...DEFAULT_VIEW, period: view.period, category };
  const counted = countFor(complex, inView);

  return (
    <div>
      <p className={MESSAGE}>
        <span>{CATEGORY_MEANING[category]}</span>{" "}
        <span>
          In the city&apos;s records, look for {CITY_CATEGORY_TERM[category]}.
        </span>
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {PERIODS.map((period) => {
          const active = period === view.period;
          return (
            <div
              key={period}
              data-testid="period-figure"
              aria-current={active ? "true" : undefined}
              className={`rounded-[14px] border px-3 py-2 ${active ? "border-white/90 bg-white/70" : "border-white/50 bg-white/28"}`}
            >
              <p
                className={`text-[17px] text-deep tabular-nums ${active ? "font-normal" : ""}`}
              >
                {formatCount(countFor(complex, { ...inView, period }))}
              </p>
              <p className="text-[12px] text-steel">{PERIOD_LABEL[period]}</p>
            </div>
          );
        })}
      </div>

      <Part
        heading={Heading}
        title={
          <>
            What the city found{" "}
            <span className="ml-0.5 font-sans text-[12.5px] text-steel">
              {PERIOD_PHRASE[view.period]}
            </span>
          </>
        }
      >
        {counted > 0 ? (
          <OutcomeSummary
            split={outcomeSplit(complex, inView)}
            violationsOpen={props.violationsOpen}
            duplicates={0}
          />
        ) : (
          <p className={MESSAGE}>
            No complaints of this type {PERIOD_PHRASE[view.period]}.
          </p>
        )}
      </Part>

      <Part
        heading={Heading}
        title="Complaints in the last 3 years, newest first"
      >
        {props.complaints === "loading" ? (
          <p className={MESSAGE}>Loading the complaints</p>
        ) : props.complaints === "failed" ? (
          <p className={MESSAGE}>
            This building&apos;s details could not be loaded right now.
          </p>
        ) : (
          <ComplaintList
            complaints={props.complaints.filter(
              (complaint) => complaint.category === category,
            )}
          />
        )}
      </Part>
    </div>
  );
}

function Part(props: {
  heading: "h2" | "h3";
  title: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const Heading = props.heading;
  return (
    <section aria-labelledby={headingId} className="mt-[18px]">
      <Heading id={headingId} className={SUBHEADING}>
        {props.title}
      </Heading>
      {props.children}
    </section>
  );
}

/**
 * Complaints, newest first, the first twelve until the person asks for the rest. Inside one category a row
 * leads with how the complaint ended; in a list of several types it leads with the type.
 */
export function ComplaintList({
  complaints,
  lead = "outcome",
}: {
  complaints: Complaint[];
  lead?: "outcome" | "type";
}) {
  const { showAll, listRef, reveal } = useShowAll();

  if (complaints.length === 0) {
    return (
      <p className={MESSAGE}>No complaints of this type {PERIOD_PHRASE.y3}.</p>
    );
  }

  const shown = showAll ? complaints : complaints.slice(0, FIRST_COMPLAINTS);

  return (
    <>
      <ul
        ref={listRef}
        tabIndex={-1}
        className="text-[14px] focus-visible:outline-none"
      >
        {shown.map((complaint, index) => {
          const opened = formatDate(complaint.opened, DAY);
          // Left out only beside the outcome it repeats; beside any other it says something the label does not.
          const phrase =
            complaint.cityOutcome !== null &&
            !restatesOutcome(complaint.cityOutcome, complaint.outcome)
              ? complaint.cityOutcome
              : null;
          const { violationCase } = complaint;
          const record =
            violationCase !== null && violationCase.url !== null
              ? { number: violationCase.number, url: violationCase.url }
              : null;
          const state = caseState(complaint);
          return (
            <li
              key={`${index}-${complaint.opened}`}
              className={`grid grid-cols-[84px_1fr] items-baseline gap-x-2.5 ${RULED_ROW}`}
            >
              <span className="text-[13px] whitespace-nowrap text-slate tabular-nums">
                {opened}
              </span>
              <span>
                <span className="block">
                  {lead === "type" ? (
                    CATEGORY_LABEL[complaint.category]
                  ) : (
                    <>
                      {OUTCOME_LABEL[complaint.outcome]}
                      {state !== "" && (
                        <>
                          , <span className="whitespace-nowrap">{state}</span>
                        </>
                      )}
                    </>
                  )}
                </span>
                {/* The city's own words and its record share one quiet line under the outcome, so the outcome keeps the row's width. */}
                {(phrase !== null || record !== null) && (
                  <span className="flex flex-wrap items-baseline gap-x-2.5 text-[12px] leading-snug text-steel">
                    {phrase !== null && <span>{phrase}</span>}
                    {/* Named by its case, so links to complaints opened the same day read apart. */}
                    {record !== null && (
                      <a
                        href={record.url}
                        target="_blank"
                        rel="noopener"
                        aria-label={`City record ${record.number}, for the complaint opened ${opened}`}
                        className="text-[12.5px] whitespace-nowrap text-deep underline"
                      >
                        city record {record.number}
                      </a>
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {!showAll && complaints.length > FIRST_COMPLAINTS && (
        <button type="button" onClick={reveal} className={SHOW_ALL}>
          Show all {formatCount(complaints.length)}
        </button>
      )}
    </>
  );
}
