"use client";

import { formatCount, formatDate } from "@/domain/format";
import {
  recordWith,
  type Followed,
  type LeftOut,
  type Place,
  type Traced,
} from "@/domain/journey";
import {
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  CITY_CATEGORY_TERM,
} from "@/domain/labels";
import {
  KNOWN_CITY_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOMES,
  RULES_IN_ORDER,
} from "@/domain/outcomes";
import {
  PERIOD_LABEL,
  PERIOD_PHRASE,
  PERIODS,
  type Period,
} from "@/domain/periods";
import { summarize } from "@/domain/summary";
import type { Category, Meta } from "@/domain/types";
import { Choice, Figure, PROMPT, Result, Toggle } from "./journeyParts";

/** What every figure is handed: the complaint, what following it finds, and a way to change it. */
export interface FigureProps {
  followed: Followed;
  traced: Traced;
  set(change: Partial<Followed>): void;
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const LONG_DATE = { month: "long", day: "numeric", year: "numeric" } as const;
const day = (iso: string) => formatDate(iso, LONG_DATE);

/** The site's one curve for things that move to a new place and settle. */
const SETTLE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Why a complaint is in no count, as the page says it. */
export const LEFT_OUT_REASON: Record<LeftOut, string> = {
  "no parcel": "it has no parcel number",
  "not apartments": "its parcel is not apartments",
  duplicate: "the city closed it as a duplicate",
  "too old": "it was opened before the 3 years",
};

/** How the city left the complaint, in the site's words. */
export const outcomeName = ({ outcome }: Traced) =>
  outcome === "duplicate"
    ? "A duplicate of another complaint"
    : OUTCOME_LABEL[outcome];

/** "the last 12 months, 2 years and 3 years", for the periods a complaint is counted in. */
export function sayPeriods(periods: Period[]): string {
  const labels = periods.map((period) => PERIOD_LABEL[period]);
  return labels.length < 2
    ? `the last ${labels.join("")}`
    : `the last ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Step 1. What the complaint is about, and the city's own name for that. */
export function ReportedFigure({ followed, set }: FigureProps) {
  return (
    <Figure>
      <Choice
        legend="Try it: what is this complaint about?"
        name="journey-category"
        options={CATEGORIES.map((category) => ({
          value: category,
          label: CATEGORY_LABEL[category],
        }))}
        value={followed.category}
        onChange={(category) => set({ category })}
      />
      <Result>
        <span
          key={followed.category}
          className="block motion-safe:animate-unfold"
        >
          {CATEGORY_MEANING[followed.category]} In the city&apos;s records, this
          type is {CITY_CATEGORY_TERM[followed.category]}.
        </span>
      </Result>
    </Figure>
  );
}

const PLACES: { value: Place; label: string }[] = [
  { value: "apartments", label: "On an apartment parcel" },
  { value: "elsewhere", label: "On another kind of parcel" },
  { value: "nowhere", label: "It has no parcel number" },
];

/** Where the complaint's dot rests in the plan for each place, in the drawing's own units. */
const DOT_AT: Record<Place, [x: number, y: number]> = {
  apartments: [45, 63],
  elsewhere: [205, 63],
  nowhere: [284, 63],
};

const PLAN_SAYS: Record<Place, string> = {
  apartments:
    "A plan of three plots. The complaint sits on one of two apartment parcels that share an address and are shown as one complex.",
  elsewhere:
    "A plan of three plots. The complaint sits on a parcel that is not apartments, apart from the complex.",
  nowhere:
    "A plan of three plots. The complaint sits outside all of them, with no parcel to place it on.",
};

/** Step 2. Where the parcel number puts the complaint, on a small plan. */
export function PlacedFigure({
  followed,
  set,
  unmatchedShare,
}: FigureProps & { unmatchedShare: number }) {
  const [x, y] = DOT_AT[followed.place];
  const unmatched = Math.round(unmatchedShare * 100);

  return (
    <Figure>
      <Choice
        legend="Try it: where does its parcel number put it?"
        name="journey-place"
        options={PLACES}
        value={followed.place}
        onChange={(place) => set({ place })}
      />
      <svg
        role="img"
        aria-label={PLAN_SAYS[followed.place]}
        viewBox="0 0 320 132"
        className="mt-4 block w-full max-w-[420px]"
      >
        {/* Two apartment parcels with one address: one complex. */}
        <rect
          x="12"
          y="26"
          width="128"
          height="74"
          rx="12"
          className="fill-none stroke-deep/45"
          strokeDasharray="4 4"
        />
        <rect
          x="16"
          y="30"
          width="58"
          height="66"
          rx="8"
          className="fill-white/70 stroke-deep/25"
        />
        <rect
          x="78"
          y="30"
          width="58"
          height="66"
          rx="8"
          className="fill-white/70 stroke-deep/25"
        />
        {/* A parcel the city does not classify as apartments. */}
        <rect
          x="176"
          y="30"
          width="58"
          height="66"
          rx="8"
          className="fill-white/30 stroke-deep/20"
        />
        {/* No parcel at all. */}
        <circle
          cx="284"
          cy="63"
          r="17"
          className="fill-none stroke-deep/25"
          strokeDasharray="3 4"
        />
        <g className="fill-slate text-[10.5px]" textAnchor="middle">
          <text x="76" y="118">
            One complex
          </text>
          <text x="205" y="118">
            Not apartments
          </text>
          <text x="284" y="118">
            No parcel
          </text>
        </g>
        <g
          style={{
            transform: `translate(${x}px, ${y}px)`,
            transition: `transform 520ms ${SETTLE}`,
          }}
          className="motion-reduce:transition-none!"
        >
          <circle r="11" className="fill-deep/15" />
          <circle r="6.5" className="fill-deep stroke-white" strokeWidth="2" />
        </g>
      </svg>
      <Result>
        <span key={followed.place} className="block motion-safe:animate-unfold">
          {followed.place === "apartments" &&
            "It is counted at that complex, with every other complaint on its parcels."}
          {followed.place === "elsewhere" &&
            "It is not shown. This site covers apartment parcels only."}
          {followed.place === "nowhere" &&
            `It is not counted anywhere. About ${unmatched}% of the city's complaints from the last 3 years carry no parcel number.`}
        </span>
      </Result>
    </Figure>
  );
}

/** The outcomes a complaint can land on, in the order the site lists them, then the one that is left out. */
const LANDINGS = [...OUTCOMES, "duplicate"] as const;
const LANDING_LABEL = (landing: (typeof LANDINGS)[number]) =>
  landing === "duplicate"
    ? "Not counted: duplicate report"
    : OUTCOME_LABEL[landing];
/** Each outcome's row is this tall, so the marker can glide a whole number of rows. */
const ROW_PX = 34;

/** Step 3. The city's phrase, and the outcome the six rules turn it into. */
export function FoundFigure({ followed, traced, set }: FigureProps) {
  const landed = LANDINGS.indexOf(traced.outcome);

  return (
    <Figure>
      <p className={PROMPT}>Try it: change how the city left it.</p>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1 text-[13px] text-slate">
          The city&apos;s phrase
          <select
            value={followed.phrase}
            onChange={(event) => set({ phrase: event.target.value })}
            className="h-10 w-full cursor-pointer rounded-full border border-white/70 bg-white/60 px-3.5 text-[14px] text-navy"
          >
            {KNOWN_CITY_OUTCOMES.map((phrase) => (
              <option key={phrase}>{phrase}</option>
            ))}
          </select>
        </label>
        <Toggle
          label="The city opened a violation case for it"
          checked={followed.hasViolationCase}
          onChange={(hasViolationCase) => set({ hasViolationCase })}
        />
        <Toggle
          label="The city has closed the complaint"
          checked={followed.closed}
          onChange={(closed) => set({ closed })}
        />
      </div>

      <ul className="relative mt-4 text-[14px]">
        <li
          aria-hidden
          style={{
            height: ROW_PX,
            transform: `translateY(${landed * ROW_PX}px)`,
            transition: `transform 320ms ${SETTLE}`,
          }}
          className="absolute inset-x-0 top-0 rounded-full bg-deep motion-reduce:transition-none!"
        />
        {LANDINGS.map((landing, index) => (
          <li
            key={landing}
            aria-current={index === landed ? "true" : undefined}
            style={{ height: ROW_PX }}
            className={`relative flex items-center px-3.5 motion-safe:transition-colors motion-safe:duration-300 ${index === landed ? "font-normal text-ice" : "text-slate"}`}
          >
            {LANDING_LABEL(landing)}
          </li>
        ))}
      </ul>
      <Result>
        <span key={traced.rule} className="block motion-safe:animate-unfold">
          Rule {traced.rule} of {RULES_IN_ORDER.length} decides it.{" "}
          {RULES_IN_ORDER[traced.rule - 1]}
        </span>
      </Result>
    </Figure>
  );
}

const DAY_MS = 86_400_000;
const toDays = (iso: string) =>
  Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  ) / DAY_MS;
const fromDays = (days: number) =>
  new Date(days * DAY_MS).toISOString().slice(0, 10);
/** The line runs from this many days before the 3 years, so a date too old to count can be tried too. */
const DAYS_BEFORE = 183;

/** Step 4. The day the complaint was opened, against the three periods. */
export function CountedFigure({
  followed,
  traced,
  set,
  periodStarts,
  pulledAt,
}: FigureProps & Pick<Meta, "periodStarts" | "pulledAt">) {
  const first = toDays(periodStarts.y3) - DAYS_BEFORE;
  const last = toDays(pulledAt);
  const along = (iso: string) =>
    `${((toDays(iso) - first) / (last - first)) * 100}%`;
  // Longest first, so the shorter periods sit inside it, one under the other.
  const bars = [...PERIODS].reverse();

  return (
    <Figure>
      <label className={`block ${PROMPT}`} htmlFor="journey-opened">
        Try it: move the day it was opened.
      </label>
      <input
        id="journey-opened"
        type="range"
        min={0}
        max={last - first}
        step={1}
        value={toDays(followed.opened) - first}
        aria-valuetext={day(followed.opened)}
        onChange={(event) =>
          set({ opened: fromDays(first + Number(event.target.value)) })
        }
        className="w-full cursor-pointer accent-deep"
      />
      <div aria-hidden className="relative mt-3 flex flex-col gap-1.5 py-1">
        {bars.map((period) => {
          const counted = traced.periods.includes(period);
          return (
            <div
              key={period}
              style={{ marginLeft: along(periodStarts[period]) }}
              className={`flex h-[22px] items-center rounded-full px-2.5 text-[12px] whitespace-nowrap motion-safe:transition-colors motion-safe:duration-200 ${counted ? "bg-deep text-ice" : "bg-white/55 text-steel"}`}
            >
              {PERIOD_LABEL[period]}
            </div>
          );
        })}
        <span
          style={{ left: along(followed.opened) }}
          className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-navy before:absolute before:-top-1 before:left-1/2 before:size-2.5 before:-translate-x-1/2 before:rounded-full before:bg-navy"
        />
      </div>
      <p
        aria-hidden
        className="mt-1 flex justify-between text-[12px] text-steel"
      >
        <span>
          {formatDate(fromDays(first), { month: "short", year: "numeric" })}
        </span>
        <span>
          Data pulled{" "}
          {formatDate(pulledAt, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </p>
      <Result>
        Opened {day(followed.opened)}
        {traced.periods.length === 0
          ? `, before the 3 years begin on ${day(periodStarts.y3)}. It is in no count.`
          : // The day decides the periods, but a complaint left out for another reason is in none of them.
            traced.leftOut !== null
            ? `. That day is in ${sayPeriods(traced.periods)}, but this complaint is in no count: ${LEFT_OUT_REASON[traced.leftOut]}.`
            : traced.periods.length === PERIODS.length
              ? `. It is counted in all three periods: ${sayPeriods(traced.periods)}.`
              : `. It is counted in ${sayPeriods(traced.periods)} only.`}
      </Result>
    </Figure>
  );
}

/** Step 5. An example building's record, with the complaint in it or taken out. */
export function RecordedFigure({
  followed,
  traced,
  included,
  setIncluded,
}: FigureProps & { included: boolean; setIncluded(included: boolean): void }) {
  // The record of the shortest period the complaint is in, so what it adds can be seen.
  const period = traced.periods[0] ?? "m12";
  const summary = summarize(recordWith(followed, traced, included), period);
  const sentences = [
    summary.trend,
    summary.found,
    summary.stillOpen,
    summary.about,
  ].filter((sentence): sentence is string => sentence !== null);

  return (
    <Figure>
      <p className={PROMPT}>
        Try it: take the complaint out of the record, and put it back.
      </p>
      {traced.leftOut === null ? (
        <Toggle
          label="Count the complaint you are following"
          checked={included}
          onChange={setIncluded}
        />
      ) : (
        <p className="text-[14px] text-navy">
          The complaint you are following is not in this record:{" "}
          {LEFT_OUT_REASON[traced.leftOut]}.
        </p>
      )}

      <div
        aria-live="polite"
        className="mt-4 rounded-[18px] border border-white/70 bg-white/50 px-4 pt-3.5 pb-1"
      >
        <p className="flex items-end gap-3">
          <span
            key={summary.total}
            className="text-[64px] leading-[0.82] font-extralight tracking-[-0.05em] text-deep tabular-nums motion-safe:animate-unfold"
          >
            {formatCount(summary.total)}
          </span>
          <span className="pb-1 leading-[1.3] text-slate">
            <span className="block">
              {summary.total === 1 ? "complaint" : "complaints"}
            </span>
            <span className="block">{PERIOD_PHRASE[period]}</span>
          </span>
        </p>
        <ul className="mt-3">
          {sentences.map((sentence) => (
            <li
              key={sentence}
              className="border-t border-deep/10 py-2 text-[14.5px] font-normal text-navy motion-safe:animate-unfold"
            >
              {sentence}
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  );
}

/** Step 6. Where every figure on the site can be checked: the city's own data. */
export function LimitsFigure({
  sources,
}: {
  sources: { name: string; href: string; use: string }[];
}) {
  return (
    <Figure>
      <p className={PROMPT}>
        Try it: check a figure against the city&apos;s own data.
      </p>
      <ul className="flex flex-col gap-1.5 text-[14px]">
        {sources.map(({ name, href, use }) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-deep underline"
            >
              {name}
            </a>
            : {use}
          </li>
        ))}
      </ul>
    </Figure>
  );
}
