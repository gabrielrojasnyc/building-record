"use client";

import { useState, type ReactNode } from "react";
import { formatDate } from "@/domain/format";
import { trace, type Followed, type Place } from "@/domain/journey";
import { CATEGORY_LABEL, NO_CASES_CAUTION } from "@/domain/labels";
import type { Meta } from "@/domain/types";
import { Glass } from "../Glass";
import {
  CountedFigure,
  FoundFigure,
  LEFT_OUT_REASON,
  LimitsFigure,
  outcomeName,
  PlacedFigure,
  RecordedFigure,
  ReportedFigure,
  sayPeriods,
} from "./JourneyFigures";
import { useFurthestStep } from "./journeyParts";

/** The six steps a complaint takes from the city's file to a building's record, in order. */
export const STEP_IDS = [
  "reported",
  "placed",
  "found",
  "counted",
  "recorded",
  "limits",
] as const;
export type StepId = (typeof STEP_IDS)[number];

const TITLE: Record<StepId, string> = {
  reported: "A complaint reaches the city",
  placed: "It is tied to a building",
  found: "The city says what it found",
  counted: "It is counted by the day it was opened",
  recorded: "It joins the building's record",
  limits: "What the record cannot tell you",
};

const PLACE_NAME: Record<Place, string> = {
  apartments: "An apartment complex",
  elsewhere: "A parcel that is not apartments",
  nowhere: "No parcel number",
};

const LONG_DATE = { month: "long", day: "numeric", year: "numeric" } as const;

/** The complaint a reader starts with: counted everywhere, so every step has something to change. */
function startingComplaint(pulledAt: string): Followed {
  const opened = new Date(`${pulledAt}T00:00:00Z`);
  opened.setUTCDate(opened.getUTCDate() - 150);
  return {
    category: "structure",
    place: "apartments",
    phrase: "CV Violation(s) Found/Inspection Performed",
    hasViolationCase: true,
    closed: true,
    opened: opened.toISOString().slice(0, 10),
  };
}

/**
 * The method page as one complaint followed through six steps. Each step says what happens, gives one thing
 * to try, and keeps the full rules folded under it. Beside the steps, a card of the complaint fills in as
 * the reader goes, and changes with whatever they try.
 */
export function ComplaintJourney(props: {
  meta: Pick<Meta, "pulledAt" | "periodStarts" | "unmatchedCaseShare">;
  sources: { name: string; href: string; use: string }[];
  /** The full rules behind each step, written on the server. */
  rules: Record<StepId, ReactNode>;
}) {
  const { meta } = props;
  const [followed, setFollowed] = useState(() =>
    startingComplaint(meta.pulledAt),
  );
  const [included, setIncluded] = useState(true);
  const { furthest, watch } = useFurthestStep(STEP_IDS.length);

  const traced = trace(followed, meta.periodStarts, meta.pulledAt);
  const set = (change: Partial<Followed>) =>
    setFollowed((current) => ({ ...current, ...change }));
  const figure = { followed, traced, set };
  const pulled = formatDate(meta.pulledAt, LONG_DATE);

  const steps: Record<StepId, { says: string; tries: ReactNode }> = {
    reported: {
      says: "Someone reports a problem at a building, through 311 or to the city's code department, and the city opens a complaint. It publishes each one as a row of its Austin Code Complaint Cases data. This site reads what kind of problem it was, the day it was opened, the parcel it is on and how the city left it. It never reads the inspector's name, which the city also publishes.",
      tries: <ReportedFigure {...figure} />,
    },
    placed: {
      says: "Each row carries a parcel number: the plot of land the complaint is about. This site keeps the complaints on parcels the city classifies as apartments, and shows parcels that share an address as one complex.",
      tries: (
        <PlacedFigure {...figure} unmatchedShare={meta.unmatchedCaseShare} />
      ),
    },
    found: {
      says: "The city says how it left each complaint in a short phrase of its own. Six rules, run in order, turn that phrase into one of five outcomes. The first rule that fits decides, and nothing else does.",
      tries: <FoundFigure {...figure} />,
    },
    counted: {
      says: `A complaint is counted in a period when it was opened on or after the period's first day. All three periods end on ${pulled}, the day the data was pulled.`,
      tries: (
        <CountedFigure
          {...figure}
          periodStarts={meta.periodStarts}
          pulledAt={meta.pulledAt}
        />
      ),
    },
    recorded: {
      says: "A building's record is its complaints, counted. Every sentence in it is built from those counts and nothing else. This example building has five complaints of its own in the last 12 months, and the one you are following.",
      tries: (
        <RecordedFigure
          {...figure}
          included={included}
          setIncluded={setIncluded}
        />
      ),
    },
    limits: {
      says: `A record counts what reached the city and how the city left it. It does not say how serious a problem was, who was responsible, or whether it remains. ${NO_CASES_CAUTION}`,
      tries: <LimitsFigure sources={props.sources} />,
    },
  };

  // What the card knows of the complaint by each step, in the order the steps find it out.
  const known: { term: string; value: string }[][] = [
    [{ term: "About", value: CATEGORY_LABEL[followed.category] }],
    [{ term: "Where", value: PLACE_NAME[followed.place] }],
    [{ term: "The city found", value: outcomeName(traced) }],
    [
      { term: "Opened", value: formatDate(followed.opened, LONG_DATE) },
      {
        term: "Counted in",
        value:
          traced.leftOut !== null
            ? `No period: ${LEFT_OUT_REASON[traced.leftOut]}`
            : sayPeriods(traced.periods).replace(/^the last/, "The last"),
      },
    ],
    [
      {
        term: "In a record",
        value:
          traced.leftOut !== null
            ? `No: ${LEFT_OUT_REASON[traced.leftOut]}`
            : included
              ? "Yes, with 5 others at its building"
              : "Taken out, to see the record without it",
      },
    ],
  ];

  return (
    <div className="relative mx-auto mt-3 grid max-w-[64rem] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <div aria-hidden className="journey-progress" />
      <Glass
        as="article"
        className="rounded-[28px] px-[22px] pt-6 pb-4 text-[15px] leading-[1.6] text-slate phone:px-[18px]"
      >
        <ol>
          {STEP_IDS.map((id, index) => (
            <li
              key={id}
              ref={watch(index)}
              className="relative scroll-mt-4 border-l border-deep/15 pb-10 pl-6 last:pb-2 max-lg:scroll-mt-24 phone:pl-5"
            >
              <span
                aria-hidden
                data-reached={index < furthest}
                className="absolute top-[7px] -left-[5.5px] size-2.5 rounded-full border-[1.5px] border-deep bg-ice data-[reached=true]:bg-deep motion-safe:transition-colors motion-safe:duration-500"
              />
              <p className="text-[13px] leading-none text-steel">
                Step {index + 1} of {STEP_IDS.length}
              </p>
              <h2 className="mt-1.5 font-display text-[28px] leading-[1.1] font-normal text-balance text-deep phone:text-[25px]">
                {TITLE[id]}
              </h2>
              <p className="mt-2 text-pretty">{steps[id].says}</p>
              {steps[id].tries}
              <details className="group mt-3">
                <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2.5 rounded-[12px] px-2 py-2 text-[14.5px] font-normal text-deep hover:bg-white/30 [&::-webkit-details-marker]:hidden">
                  <svg
                    aria-hidden
                    viewBox="0 0 10 10"
                    className="size-2.5 flex-none text-steel group-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200"
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
                  The full rules for this step
                </summary>
                <div className="pb-2">{props.rules[id]}</div>
              </details>
            </li>
          ))}
        </ol>
      </Glass>

      <Glass
        as="aside"
        aria-label="The complaint you are following"
        className="sticky rounded-[24px] p-[18px] max-lg:top-2 max-lg:z-4 max-lg:order-first max-lg:rounded-[20px] max-lg:bg-ice/85 max-lg:px-4 max-lg:py-2.5 lg:top-4"
      >
        <h2 className="font-display text-[22px] leading-none font-normal text-deep max-lg:text-[17px]">
          The complaint
        </h2>
        <p className="mt-1.5 text-[12.5px] text-steel max-lg:hidden">
          It fills in as you go, and changes with what you try.
        </p>
        {/* Below the two-column width only the newest line shows, so the card stays one line tall over the steps. */}
        <dl className="mt-3 max-lg:mt-1">
          {known
            .slice(0, furthest)
            .flat()
            .map(({ term, value }) => (
              <div
                key={term}
                className="border-t border-deep/10 py-2 max-lg:flex max-lg:items-baseline max-lg:gap-2 max-lg:border-0 max-lg:py-0 max-lg:not-last:hidden motion-safe:animate-rise"
              >
                <dt className="flex-none text-[12px] text-steel">{term}</dt>
                <dd
                  key={value}
                  className="text-[14.5px] leading-snug font-normal text-navy motion-safe:animate-unfold"
                >
                  {value}
                </dd>
              </div>
            ))}
        </dl>
        <p className="mt-2 flex items-center gap-2 text-[12px] text-steel max-lg:mt-1.5">
          <span className="flex flex-1 gap-1">
            {STEP_IDS.map((id, index) => (
              <span
                key={id}
                aria-hidden
                className={`h-1 flex-1 rounded-full motion-safe:transition-colors motion-safe:duration-500 ${index < furthest ? "bg-deep" : "bg-deep/15"}`}
              />
            ))}
          </span>
          Step {furthest} of {STEP_IDS.length}
        </p>
      </Glass>
    </div>
  );
}
