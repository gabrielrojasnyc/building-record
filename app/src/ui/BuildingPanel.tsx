"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { aerialPhotoUrl } from "@/city/aerialPhoto";
import { loadBuildingDetail } from "@/city/buildingDetail";
import { load311Summary, type RequestTypeCount } from "@/city/requests311";
import { formatAcres, formatCount, formatDate } from "@/domain/format";
import {
  DUPLICATES_ONLY_NOTE,
  NO_CASES_CAUTION,
  titleOf,
} from "@/domain/labels";
import {
  PERIODS,
  PERIOD_LABEL,
  PERIOD_PHRASE,
  type Period,
} from "@/domain/periods";
import {
  countFor,
  DEFAULT_VIEW,
  outcomeSplit,
  type CategoryFilter,
  type View,
} from "@/domain/query";
import { spreadSentence, summarize } from "@/domain/summary";
import type { BuildingDetail, Complaint, Complex, Meta } from "@/domain/types";
import { Categories } from "./Categories";
import { ComplaintList } from "./CategoryDetail";
import { Glass } from "./Glass";
import { ListedBlock } from "./ListedBlock";
import { OutcomeSummary } from "./OutcomeSummary";
import { MESSAGE, RecordHeadingLevel, RULED_ROW } from "./panelParts";
import { SummaryRow } from "./SummaryRow";

type Placement =
  /** Over the map screen: loads the building's history itself, can close, and links to the building's own page. */
  | { place: "map"; onClose(): void }
  /** The building's own page: history read from disk at build time, and the title is the page's h1. */
  | { place: "page"; detail: BuildingDetail };

export type BuildingPanelProps = Placement & {
  complex: Complex;
  view: View;
  /** From the data's meta: the first day of each period, for the still-open counts, the month chart and the 311 summary. */
  periodStarts: Meta["periodStarts"];
  /** From the data's meta: how complaint counts spread across the city, for the line under the lead figure. */
  spread: Meta["spread"];
  fetchImpl?: typeof fetch;
};

type LoadState<T> =
  { status: "loading" } | { status: "failed" } | { status: "ready"; value: T };

const LOADING = { status: "loading" } as const;

/*
  On desktop the panel hangs between the filter bar and the count pill, which stands 93 px above
  the bottom (the pill plus the data notice under it). On a phone it is a bottom sheet over the pill.
*/
const MAP_PLACEMENT =
  "building-sheet fixed top-[76px] right-(--gutter) bottom-[97px] z-3 w-[372px] overflow-hidden rounded-[28px] motion-safe:animate-rise phone:top-auto phone:right-0 phone:bottom-0 phone:left-0 phone:z-4 phone:h-[60dvh] phone:w-auto phone:rounded-b-none";
/*
  Contained, so a drag that reaches the top of the sheet never turns into the page's pull to refresh.
  `record-scroller` fades its top band once it is scrolled, from globals.css.
*/
const MAP_SCROLLER =
  "record-scroller h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
/** How far a scroll takes the fade under the close button to full strength, and how tall that faded band is. */
const FADE_PX = 60;

/**
 * Fades the top of the record in step with the scroll: not at all at the top, fully from 60 px down. Set on the
 * element itself, not through state, so scrolling never renders the record again.
 */
function fadeTopOnScroll(scroller: HTMLElement): void {
  const strength = Math.min(scroller.scrollTop / FADE_PX, 1);
  if (strength > 0) {
    scroller.dataset.scrolled = "";
    scroller.style.setProperty("--scrolled", String(strength));
  } else {
    delete scroller.dataset.scrolled;
    scroller.style.removeProperty("--scrolled");
  }
}

/** Loads `source` whenever it changes. A result that arrives after `source` has moved on is dropped. */
function useLoad<S, T>(
  source: S | null,
  load: (source: S) => Promise<T>,
): LoadState<T> {
  const [settled, setSettled] = useState<{
    source: S;
    outcome: LoadState<T>;
  } | null>(null);

  useEffect(() => {
    if (source === null) return;
    let current = true;
    load(source).then(
      (value) => {
        if (current)
          setSettled({ source, outcome: { status: "ready", value } });
      },
      () => {
        if (current) setSettled({ source, outcome: { status: "failed" } });
      },
    );
    return () => {
      current = false;
    };
  }, [source, load]);

  return settled !== null && settled.source === source
    ? settled.outcome
    : LOADING;
}

const formatMonth = (yearMonth: string) =>
  formatDate(yearMonth, { month: "short", year: "numeric" });

const complaintsWord = (count: number) =>
  count === 1 ? "complaint" : "complaints";

export function BuildingPanel(props: BuildingPanelProps) {
  const { complex, view, fetchImpl = fetch } = props;
  const onClose = props.place === "map" ? props.onClose : null;
  const headingId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const fetchHistory = useCallback(
    (id: string) => loadBuildingDetail(id, fetchImpl),
    [fetchImpl],
  );
  const requestsSince = props.periodStarts.y3;
  const fetch311 = useCallback(
    (bbox: BuildingDetail["bbox"]) =>
      load311Summary(bbox, requestsSince, fetchImpl),
    [requestsSince, fetchImpl],
  );

  const history = useLoad(
    props.place === "map" ? complex.id : null,
    fetchHistory,
  );
  const detail: LoadState<BuildingDetail> =
    props.place === "page" ? { status: "ready", value: props.detail } : history;
  const requests = useLoad(
    detail.status === "ready" ? detail.value.bbox : null,
    fetch311,
  );

  useEffect(() => {
    if (!onClose) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  // A newly chosen building opens at its header, not wherever the last one was scrolled to.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
    fadeTopOnScroll(scroller);
  }, [complex.id]);

  // Over the map the panel is a new region of the screen, so keyboard and screen reader users start in it.
  const opensOverMap = props.place === "map";
  useEffect(() => {
    if (opensOverMap) panelRef.current?.focus({ preventScroll: true });
  }, [opensOverMap, complex.id]);

  const Heading = props.place === "page" ? "h1" : "h2";

  return (
    <Glass
      as={props.place === "page" ? "article" : "aside"}
      ref={panelRef}
      tabIndex={opensOverMap ? -1 : undefined}
      aria-labelledby={headingId}
      // Said to a screen reader, and to a test or a tool, while the building file is still on its way.
      aria-busy={detail.status === "loading" || undefined}
      className={props.place === "page" ? "rounded-[28px]" : MAP_PLACEMENT}
    >
      {/* On the panel, not in what scrolls, so it stays in reach however far down the record a person has read. */}
      {onClose && (
        <button
          type="button"
          aria-label="Close building details"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-2 size-8 cursor-pointer rounded-full bg-white/72 text-[18px] leading-none text-deep backdrop-blur-[8px] hover:bg-white/85"
        >
          ×
        </button>
      )}
      <RecordHeadingLevel value={props.place === "page" ? "h2" : "h3"}>
        <div
          ref={scrollerRef}
          className={props.place === "page" ? undefined : MAP_SCROLLER}
          onScroll={
            props.place === "page"
              ? undefined
              : (event) => fadeTopOnScroll(event.currentTarget)
          }
        >
          <Header
            complex={complex}
            heading={Heading}
            headingId={headingId}
            photo={detail.status === "ready" ? detail.value.bbox : null}
            underClose={onClose !== null}
          />
          <div className="px-[22px] pt-4 pb-[22px]">
            {complex.repeatOffender && (
              // Keyed by building, as the sentences are, so a newly chosen one opens with every line closed.
              <ListedBlock
                key={`listing-${complex.id}`}
                listing={complex.repeatOffender}
                deficiencies={
                  detail.status === "ready"
                    ? detail.value.deficiencies
                    : detail.status
                }
              />
            )}
            <LeadFigure complex={complex} period={view.period} />
            <p className="mt-3 text-[12.5px] leading-normal text-pretty text-steel">
              {spreadSentence(props.spread[view.period], view.period)}
            </p>
            <Sentences
              key={`sentences-${complex.id}`}
              complex={complex}
              view={view}
              periodStarts={props.periodStarts}
              detail={detail}
              requests={requests}
            />

            <p className="mt-[18px] text-[12.5px] leading-normal text-slate">
              From{" "}
              <a
                href="https://data.austintexas.gov/d/6wtj-zbtb"
                target="_blank"
                rel="noreferrer"
                className="text-deep underline"
              >
                Austin Code Complaint Cases
              </a>{" "}
              and{" "}
              <a
                href="https://data.austintexas.gov/d/xwdj-i9he"
                target="_blank"
                rel="noreferrer"
                className="text-deep underline"
              >
                Austin 311
              </a>
              , City of Austin.{" "}
              {totalFor(complex, view.period) === 0 &&
              (complex.duplicates[view.period] ?? 0) > 0
                ? DUPLICATES_ONLY_NOTE
                : NO_CASES_CAUTION}
            </p>

            {onClose && (
              <Link
                href={`/building/${complex.id}`}
                className="mt-4 inline-flex h-[30px] items-center rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
              >
                Open this building&apos;s page
              </Link>
            )}
          </div>
        </div>
      </RecordHeadingLevel>
    </Glass>
  );
}

/** What the line under the title says: the address when a name is the title, how many parcels a merged complex covers, and the acres. */
function headerLine(complex: Complex): string {
  const acres = formatAcres(complex.acres);
  const parcels = complex.parcelIds.length;
  if (complex.name) {
    return parcels > 1
      ? `${complex.address}, apartment parcels (${parcels}), ${acres}`
      : `${complex.address}, ${acres}`;
  }
  return parcels > 1 ? `Apartment parcels (${parcels}), ${acres}` : acres;
}

type PhotoStatus = "loading" | "loaded" | "failed";

/** Lifts ice text off a photo, and off the steel ground while there is none. */
const PHOTO_TEXT_SHADOW =
  "[text-shadow:0_1px_2px_color-mix(in_srgb,var(--color-navy)_70%,transparent)]";

/**
 * The building's title over its aerial photo. A steel ground and the title stand from the first
 * moment; the city can take seconds, so the photo fades in over them once it has loaded, and a photo
 * that fails is dropped, never shown as a broken image.
 */
function Header(props: {
  complex: Complex;
  heading: "h1" | "h2";
  headingId: string;
  /** The parcel's box, once the building file has arrived. */
  photo: BuildingDetail["bbox"] | null;
  /** Over the map the panel's close button stands in the header's top corner. */
  underClose: boolean;
}) {
  const { complex, heading: Heading } = props;
  const title = titleOf(complex);
  const src = props.photo ? aerialPhotoUrl(props.photo, 744, 400) : null;

  const [settled, setSettled] = useState<{
    src: string;
    status: PhotoStatus;
  } | null>(null);
  const status: PhotoStatus =
    settled !== null && settled.src === src ? settled.status : "loading";

  // A photo can finish before the page is hydrated and listening for it, so the element is asked where it got to.
  const readFinishedPhoto = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image?.complete || src === null) return;
      setSettled({ src, status: image.naturalWidth > 0 ? "loaded" : "failed" });
    },
    [src],
  );

  return (
    <div className="relative h-[204px] overflow-hidden rounded-t-[27px] bg-linear-to-b/srgb from-steel to-slate phone:h-[170px]">
      {src !== null && status !== "failed" && (
        // A plain img: the photo comes straight from the city in the browser, never through this site's server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={readFinishedPhoto}
          src={src}
          alt={`Aerial photo of ${title}`}
          decoding="async"
          data-loaded={status === "loaded"}
          onLoad={() => setSettled({ src, status: "loaded" })}
          onError={() => setSettled({ src, status: "failed" })}
          className="absolute inset-0 size-full scale-[1.06] object-cover opacity-0 data-[loaded=true]:scale-100 data-[loaded=true]:opacity-100 motion-safe:transition-[opacity,scale] motion-safe:duration-700 motion-safe:ease-out"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-b/srgb from-transparent from-42% to-navy/82"
      />
      <div className="absolute right-[22px] bottom-4 left-[22px] z-1 text-ice">
        <Heading
          id={props.headingId}
          title={title}
          className={`line-clamp-2 font-display text-[30px] leading-[1.02] font-normal text-balance ${PHOTO_TEXT_SHADOW}`}
        >
          {title}
        </Heading>
        <p className="mt-1 text-[13px] opacity-88">{headerLine(complex)}</p>
      </div>
      {status === "loaded" && (
        // Under the close button over the map; in the corner on the building's own page, which has none.
        <span
          className={`pointer-events-none absolute ${props.underClose ? "top-[58px]" : "top-3.5"} right-3.5 z-1 text-[10.5px] text-ice opacity-80 ${PHOTO_TEXT_SHADOW}`}
        >
          Aerial photo: City of Austin
        </span>
      )}
    </div>
  );
}

/** Every category counts here: the panel is the building's full record, whatever type the map is filtered to. */
function totalFor(complex: Complex, period: Period): number {
  return countFor(complex, { ...DEFAULT_VIEW, period });
}

/**
 * Confirmed violations whose case is not closed, opened on or after `since`, of one type or every type.
 * Counted from the building's complaints, since the complex carries this for the 3 years only.
 */
function violationsStillOpen(
  complaints: Complaint[],
  since: string,
  category: CategoryFilter,
): number {
  return complaints.filter(
    (complaint) =>
      complaint.outcome === "violation" &&
      complaint.stillOpen &&
      complaint.opened >= since &&
      (category === "all" || complaint.category === category),
  ).length;
}

function LeadFigure({ complex, period }: { complex: Complex; period: Period }) {
  const total = totalFor(complex, period);
  return (
    <p className="mt-[18px] flex items-end gap-3.5">
      {total === 0 ? (
        <span className="font-display text-[60px] leading-none text-deep italic">
          None
        </span>
      ) : (
        <span className="text-[88px] leading-[0.82] font-extralight tracking-[-0.05em] text-deep tabular-nums">
          {formatCount(total)}
        </span>
      )}{" "}
      <span className="pb-1.5 leading-[1.3] text-slate">
        <span className="block">
          {total === 0 ? "no complaints" : complaintsWord(total)}
        </span>{" "}
        <span className="block">{PERIOD_PHRASE[period]}</span>
      </span>
    </p>
  );
}

/**
 * The record said in sentences, each opening to the figures behind it: where the count stands against the
 * time around it, what the city found, what is still open, what the complaints were about, and the 311
 * requests nearby. A sentence with nothing behind it stands alone.
 */
function Sentences(props: {
  complex: Complex;
  view: View;
  periodStarts: Meta["periodStarts"];
  detail: LoadState<BuildingDetail>;
  requests: LoadState<RequestTypeCount[]>;
}) {
  const { complex, view, detail } = props;
  const { period } = view;
  const summary = summarize(complex, period);
  const complaints =
    detail.status === "ready" ? detail.value.complaints : detail.status;
  const periodStart = props.periodStarts[period];
  const stillOpenIn = (category: CategoryFilter) =>
    Array.isArray(complaints)
      ? violationsStillOpen(complaints, periodStart, category)
      : null;
  // A type the map is filtered to opens with its row, so the number on the map is the first thing found.
  const filteredType =
    view.category !== "all" && countFor(complex, { ...view, period: "y3" }) > 0;

  return (
    <ul
      aria-label="What the record shows"
      className="mt-[18px] border-b border-deep/10"
    >
      {summary.trend && (
        <SummaryRow
          detail={
            totalFor(complex, "y3") > 0 ? (
              <History
                complex={complex}
                period={period}
                detail={detail}
                since={props.periodStarts.y3}
              />
            ) : undefined
          }
        >
          {summary.trend}
        </SummaryRow>
      )}
      {summary.found && (
        <SummaryRow
          detail={
            summary.total > 0 ? (
              <OutcomeSummary
                split={outcomeSplit(complex, { ...DEFAULT_VIEW, period })}
                violationsOpen={stillOpenIn("all")}
                duplicates={complex.duplicates[period] ?? 0}
              />
            ) : undefined
          }
        >
          {summary.found}
        </SummaryRow>
      )}
      {summary.stillOpen && (
        <SummaryRow
          detail={
            complex.violationsOpen > 0 ? (
              <OpenViolations complaints={complaints} />
            ) : undefined
          }
        >
          {summary.stillOpen}
        </SummaryRow>
      )}
      {summary.about && (
        <SummaryRow
          startOpen={filteredType}
          detail={
            <Categories
              complex={complex}
              view={view}
              complaints={complaints}
              stillOpenIn={stillOpenIn}
            />
          }
        >
          {summary.about}
        </SummaryRow>
      )}
      {detail.status !== "failed" && (
        <SummaryRow
          kind="label"
          detail={<Requests311 outcome={props.requests} />}
        >
          311 requests around this parcel
        </SummaryRow>
      )}
    </ul>
  );
}

/** The three periods side by side, the active one marked, then the months. */
function History(props: {
  complex: Complex;
  period: Period;
  detail: LoadState<BuildingDetail>;
  since: string;
}) {
  const { detail } = props;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {PERIODS.map((period) => {
          const active = period === props.period;
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
                {formatCount(totalFor(props.complex, period))}
              </p>
              <p className="text-[12px] text-steel">{PERIOD_LABEL[period]}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3.5">
        {detail.status === "loading" && (
          <p className={MESSAGE}>Loading the months</p>
        )}
        {detail.status === "failed" && (
          <p className={MESSAGE}>
            This building&apos;s history could not be loaded. The counts above
            are still current.
          </p>
        )}
        {detail.status === "ready" && (
          <MonthChart monthly={detail.value.monthly} since={props.since} />
        )}
      </div>
    </>
  );
}

/** The confirmed violations the city has not closed, newest first, each with its type and its city record. */
function OpenViolations({
  complaints,
}: {
  complaints: Complaint[] | "loading" | "failed";
}) {
  if (complaints === "loading")
    return <p className={MESSAGE}>Loading the complaints</p>;
  if (complaints === "failed")
    return (
      <p className={MESSAGE}>
        This building&apos;s details could not be loaded right now.
      </p>
    );
  return (
    <ComplaintList
      lead="type"
      complaints={complaints.filter(
        ({ outcome, stillOpen }) => outcome === "violation" && stillOpen,
      )}
    />
  );
}

function MonthChart({
  monthly,
  since,
}: {
  monthly: BuildingDetail["monthly"];
  since: string;
}) {
  const peak = Math.max(0, ...monthly.map(({ count }) => count));
  if (peak === 0)
    return <p className={MESSAGE}>No complaints {PERIOD_PHRASE.y3}.</p>;

  const first = formatMonth(monthly[0].month);
  const last = formatMonth(monthly[monthly.length - 1].month);
  // On a tie, the most recent of the busiest months.
  const busiest = formatMonth(
    monthly.findLast(({ count }) => count === peak)?.month ?? monthly[0].month,
  );
  const peakComplaints = `${peak} ${complaintsWord(peak)}`;
  const summary = `Complaints opened each month, ${first} to ${last}. Busiest month: ${busiest}, with ${peakComplaints}.`;

  return (
    <>
      {/* The window rolls, so its first and last months are partial; the start date says so. */}
      <p className={`${MESSAGE} mb-2`}>
        Complaints opened since{" "}
        {formatDate(since, { month: "long", day: "numeric", year: "numeric" })}.
        Duplicate reports are not counted.
      </p>
      <div
        role="img"
        aria-label={summary}
        className="flex h-[68px] items-end gap-[3px]"
      >
        {monthly.map(({ month, count }) => (
          <span
            key={month}
            data-testid="month-bar"
            title={`${formatMonth(month)}: ${count} ${complaintsWord(count)}`}
            className={`min-h-[3px] flex-1 rounded-[3px] ${count > 0 ? "bg-linear-to-b/srgb from-deep to-steel" : "bg-deep/14"}`}
            style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
          />
        ))}
      </div>
      {/* The first and last months under the ends of the chart, and the busiest on a line of its own: the three do not fit in one. */}
      <p className="mt-1.5 flex justify-between text-[12px] text-steel">
        <span>{first}</span>
        <span>{last}</span>
      </p>
      <p className="text-[12px] text-steel">
        Busiest month: {busiest}, {peakComplaints}
      </p>
    </>
  );
}

function Requests311({ outcome }: { outcome: LoadState<RequestTypeCount[]> }) {
  return (
    <>
      <p className={`${MESSAGE} mb-2`}>
        Counted inside the rectangle around the parcel {PERIOD_PHRASE.y3}, so
        some may belong to neighbors.
      </p>
      {outcome.status === "loading" && (
        <p className={MESSAGE}>Loading from the City of Austin</p>
      )}
      {outcome.status === "failed" && (
        <p className={MESSAGE}>
          311 requests could not be loaded from the city right now.
        </p>
      )}
      {outcome.status === "ready" &&
        (outcome.value.length === 0 ? (
          <p className={MESSAGE}>
            No 311 requests in this area {PERIOD_PHRASE.y3}.
          </p>
        ) : (
          <ul className="text-[14px]">
            {/* The city can return one label for several types, such as two Unspecified rows. */}
            {outcome.value.map(({ type, count }, index) => (
              <li
                key={`${index}-${type}`}
                className={`grid grid-cols-[1fr_auto] items-center gap-3 ${RULED_ROW}`}
              >
                <span>{type}</span>
                <span className="text-right tabular-nums">
                  {formatCount(count)}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}
