"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { load311Summary, type RequestTypeCount } from "@/city/requests311";
import { CATEGORY_LABEL } from "@/domain/labels";
import { countFor, DEFAULT_VIEW, type Period, type View } from "@/domain/query";
import type { BuildingDetail, Category, Complex } from "@/domain/types";
import { Glass } from "./Glass";

type Placement =
  /** Over the map screen: loads the building's history itself, can close, and links to the building's own page. */
  | { place: "map"; onClose(): void }
  /** The building's own page: history read from disk at build time, and the address is the page's h1. */
  | { place: "page"; detail: BuildingDetail };

export type BuildingPanelProps = Placement & {
  complex: Complex;
  view: View;
  fetchImpl?: typeof fetch;
};

type Outcome<T> =
  { status: "loading" } | { status: "failed" } | { status: "ready"; value: T };

const LOADING = { status: "loading" } as const;

const PERIOD_CAPTION: Record<Period, string> = {
  cases12: "in the last 12 months",
  cases: "since November 2023",
};

const OTHER_PERIOD: Record<Period, { period: Period; label: string }> = {
  cases12: { period: "cases", label: "since Nov 2023" },
  cases: { period: "cases12", label: "last 12 months" },
};

/*
  On desktop the panel hangs between the filter bar and the tray head, which stands 255 px above
  the bottom (the tray plus the data notice under it). On a phone it is a bottom sheet over the tray.
*/
const MAP_PLACEMENT =
  "building-sheet fixed top-[76px] right-(--gutter) bottom-[259px] z-3 w-[372px] overflow-hidden rounded-[28px] motion-safe:animate-rise phone:top-auto phone:right-0 phone:bottom-0 phone:left-0 phone:z-4 phone:h-[72dvh] phone:w-auto phone:rounded-b-none";
const MAP_SCROLLER =
  "h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const SECTION = "mt-[22px]";
const SECTION_HEADING =
  "mb-2.5 font-display text-[20px] leading-none font-normal text-deep";
const MESSAGE = "text-[13.5px] text-slate";
const LIST_ROW = "items-center border-t border-deep/10 py-[9px]";

/** Loads `source` whenever it changes. A result that arrives after `source` has moved on is dropped. */
function useLoad<S, T>(
  source: S | null,
  load: (source: S) => Promise<T>,
): Outcome<T> {
  const [settled, setSettled] = useState<{
    source: S;
    outcome: Outcome<T>;
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

async function loadHistory(
  id: string,
  fetchImpl: typeof fetch,
): Promise<BuildingDetail> {
  const response = await fetchImpl(`/data/buildings/${id}.json`);
  if (!response.ok)
    throw new Error(`The history for ${id} responded ${response.status}`);
  return (await response.json()) as BuildingDetail;
}

/** Calendar dates from the data, formatted in UTC so no time zone can shift the day. */
function formatDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const [year, month, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}

const formatDay = (isoDate: string) =>
  formatDate(isoDate, { month: "short", day: "numeric", year: "numeric" });
const formatMonth = (yearMonth: string) =>
  formatDate(yearMonth, { month: "short", year: "numeric" });

const formatCount = (count: number) => count.toLocaleString("en-US");
const casesWord = (count: number) => (count === 1 ? "case" : "cases");

export function BuildingPanel(props: BuildingPanelProps) {
  const { complex, view, fetchImpl = fetch } = props;
  const onClose = props.place === "map" ? props.onClose : null;
  const headingId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const fetchHistory = useCallback(
    (id: string) => loadHistory(id, fetchImpl),
    [fetchImpl],
  );
  const fetch311 = useCallback(
    (bbox: BuildingDetail["bbox"]) => load311Summary(bbox, fetchImpl),
    [fetchImpl],
  );

  const history = useLoad(
    props.place === "map" ? complex.id : null,
    fetchHistory,
  );
  const detail: Outcome<BuildingDetail> =
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

  // A newly chosen building opens at its address, not wherever the last one was scrolled to.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
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
      className={props.place === "page" ? "rounded-[28px]" : MAP_PLACEMENT}
    >
      <div
        ref={scrollerRef}
        className={
          props.place === "page" ? "p-[22px]" : `${MAP_SCROLLER} p-[22px]`
        }
      >
        {onClose && (
          <button
            type="button"
            aria-label="Close building details"
            onClick={onClose}
            className="float-right size-8 cursor-pointer rounded-full bg-white/50 text-[18px] leading-none text-deep hover:bg-white/85"
          >
            ×
          </button>
        )}
        <Heading
          id={headingId}
          className="mr-10 mb-0.5 font-display text-[32px] leading-[1.05] font-normal text-deep"
        >
          {complex.address}
        </Heading>
        <p className={MESSAGE}>
          Apartment parcel, {complex.acres} acres
          {complex.units && `, ${formatCount(complex.units.count)} units`}
        </p>

        {complex.repeatOffender && (
          <RepeatOffenderNote listing={complex.repeatOffender} />
        )}
        <LeadFigure complex={complex} period={view.period} />
        <Figures complex={complex} period={view.period} />
        <CategoryBars counts={complex[view.period]} />

        {detail.status === "failed" ? (
          <Section title="Month by month">
            <p className={MESSAGE}>
              This building&apos;s history could not be loaded. The counts above
              are still current.
            </p>
          </Section>
        ) : (
          detail.status === "ready" && (
            <>
              <MonthChart monthly={detail.value.monthly} />
              <LatestCases latest={detail.value.latest} />
            </>
          )
        )}
        {detail.status !== "failed" && <Requests311 outcome={requests} />}

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
          , City of Austin. No cases means none reached Code Enforcement. It
          does not mean the building has no problems.
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
    </Glass>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={SECTION}>
      <h3 id={headingId} className={SECTION_HEADING}>
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function RepeatOffenderNote({
  listing,
}: {
  listing: NonNullable<Complex["repeatOffender"]>;
}) {
  return (
    <div className="mt-4 flex gap-2.5 rounded-[18px] border border-coral/50 bg-coral/28 px-3.5 py-3 text-[13.5px] text-navy">
      <span
        aria-hidden
        className="mt-1.5 size-[9px] flex-none rounded-full bg-coral ring-3 ring-coral/30"
      />
      <p>
        <strong className="block font-medium">
          On the city&apos;s Repeat Offender list
        </strong>{" "}
        {listing.name ?? "Registered property"}, {formatCount(listing.units)}{" "}
        units.{" "}
        <span className="tabular-nums">
          {formatCount(listing.activeViolations)}
        </span>{" "}
        active of{" "}
        <span className="tabular-nums">
          {formatCount(listing.totalViolations)}
        </span>{" "}
        total violations.
      </p>
    </div>
  );
}

/** Every category counts here: the panel is the building's full record, whatever type the map is filtered to. */
function totalFor(complex: Complex, period: Period): number {
  return countFor(complex, { ...DEFAULT_VIEW, period });
}

function LeadFigure({ complex, period }: { complex: Complex; period: Period }) {
  const total = totalFor(complex, period);
  return (
    <p className="mt-5 flex items-end gap-3.5">
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
          {total === 0 ? "no code cases" : `code ${casesWord(total)}`}
        </span>{" "}
        <span className="block">{PERIOD_CAPTION[period]}</span>
      </span>
    </p>
  );
}

function Figures({ complex, period }: { complex: Complex; period: Period }) {
  const other = OTHER_PERIOD[period];
  const figures = [
    { value: formatCount(totalFor(complex, other.period)), label: other.label },
    { value: formatCount(complex.open), label: "open now" },
    complex.lastCase
      ? {
          value: formatDate(complex.lastCase, {
            month: "short",
            day: "numeric",
          }),
          label: `latest, ${complex.lastCase.slice(0, 4)}`,
        }
      : { value: "None", label: "latest case" },
  ];

  return (
    <div className="mt-[18px] grid grid-cols-3 gap-2">
      {figures.map(({ value, label }) => (
        <div
          key={label}
          className="rounded-[18px] border border-white/60 bg-white/42 p-3"
        >
          <p className="text-[20px] text-deep tabular-nums">{value}</p>
          <p className="text-[12px] text-steel">{label}</p>
        </div>
      ))}
    </div>
  );
}

function CategoryBars({ counts }: { counts: Record<Category, number> }) {
  const categories = Object.keys(CATEGORY_LABEL) as Category[];
  const longest = Math.max(
    1,
    ...categories.map((category) => counts[category]),
  );

  return (
    <Section title="What the cases were about">
      {categories.map((category) => (
        <div
          key={category}
          className="grid grid-cols-[128px_1fr_30px] items-center gap-2.5 py-[5px] text-[14px]"
        >
          <span>{CATEGORY_LABEL[category]}</span>
          <span
            aria-hidden
            className="h-1.5 overflow-hidden rounded-full bg-deep/12"
          >
            <span
              className="block h-full rounded-full bg-linear-to-r/srgb from-steel to-deep"
              style={{ width: `${(counts[category] / longest) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {formatCount(counts[category])}
          </span>
        </div>
      ))}
    </Section>
  );
}

function MonthChart({ monthly }: { monthly: BuildingDetail["monthly"] }) {
  const peak = Math.max(0, ...monthly.map(({ count }) => count));
  if (peak === 0) {
    return (
      <Section title="Month by month">
        <p className={MESSAGE}>No code cases since Nov 2023.</p>
      </Section>
    );
  }

  const first = formatMonth(monthly[0].month);
  const last = formatMonth(monthly[monthly.length - 1].month);
  const busiest = monthly.find(({ count }) => count === peak);
  const summary = `Code cases opened each month, ${first} to ${last}. Busiest month: ${busiest ? formatMonth(busiest.month) : first}, with ${peak} ${casesWord(peak)}.`;

  return (
    <Section title="Month by month">
      <div
        role="img"
        aria-label={summary}
        className="flex h-[68px] items-end gap-[3px]"
      >
        {monthly.map(({ month, count }) => (
          <span
            key={month}
            data-testid="month-bar"
            title={`${formatMonth(month)}: ${count} ${casesWord(count)}`}
            className={`min-h-[3px] flex-1 rounded-[3px] ${count > 0 ? "bg-linear-to-b/srgb from-deep to-steel" : "bg-deep/14"}`}
            style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-[12px] text-steel">
        <span>{first}</span>
        <span>Busiest month: {peak}</span>
        <span>{last}</span>
      </p>
    </Section>
  );
}

function LatestCases({ latest }: { latest: BuildingDetail["latest"] }) {
  if (latest.length === 0) return null;

  return (
    <Section title="Latest cases">
      <ul className="text-[14px]">
        {latest.map(({ opened, category, status }, index) => (
          <li
            key={`${opened}-${index}`}
            className={`grid grid-cols-[92px_1fr_auto] gap-2 ${LIST_ROW}`}
          >
            <span className="text-steel tabular-nums">{formatDay(opened)}</span>
            <span>{CATEGORY_LABEL[category]}</span>
            <span
              className={`rounded-full px-[9px] py-0.5 text-[12px] ${status === "Closed" ? "bg-white/50 text-slate" : "bg-deep text-ice"}`}
            >
              {status}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Requests311({ outcome }: { outcome: Outcome<RequestTypeCount[]> }) {
  return (
    <Section title="311 requests around this parcel">
      <p className={`${MESSAGE} mb-2`}>
        Counted inside the rectangle around the parcel since Nov 2023, so some
        may belong to neighbors.
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
            No 311 requests in this area since Nov 2023.
          </p>
        ) : (
          <ul className="text-[14px]">
            {outcome.value.map(({ type, count }) => (
              <li
                key={type}
                className={`grid grid-cols-[1fr_auto] gap-3 ${LIST_ROW}`}
              >
                <span>{type}</span>
                <span className="text-right tabular-nums">
                  {formatCount(count)}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}
