"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { aerialPhotoUrl } from "@/city/aerialPhoto";
import { loadBuildingDetail } from "@/city/buildingDetail";
import { load311Summary, type RequestTypeCount } from "@/city/requests311";
import { formatAcres, formatCount } from "@/domain/format";
import { CATEGORY_LABEL, NO_CASES_CAUTION, titleOf } from "@/domain/labels";
import { PERIODS, PERIOD_LABEL, PERIOD_PHRASE, type Period } from "@/domain/periods";
import { countFor, DEFAULT_VIEW, type View } from "@/domain/query";
import type { BuildingDetail, Category, Complex, Meta } from "@/domain/types";
import { Glass } from "./Glass";

type Placement =
  /** Over the map screen: loads the building's history itself, can close, and links to the building's own page. */
  | { place: "map"; onClose(): void }
  /** The building's own page: history read from disk at build time, and the title is the page's h1. */
  | { place: "page"; detail: BuildingDetail };

export type BuildingPanelProps = Placement & {
  complex: Complex;
  view: View;
  /** From the data's meta: the 311 summary counts from the first day of the 3 years. */
  periodStarts: Meta["periodStarts"];
  fetchImpl?: typeof fetch;
};

type LoadState<T> =
  { status: "loading" } | { status: "failed" } | { status: "ready"; value: T };

const LOADING = { status: "loading" } as const;

/*
  On desktop the panel hangs between the filter bar and the tray head, which stands 273 px above
  the bottom (the tray plus the data notice under it). On a phone it is a bottom sheet over the tray.
*/
const MAP_PLACEMENT =
  "building-sheet fixed top-[76px] right-(--gutter) bottom-[277px] z-3 w-[372px] overflow-hidden rounded-[28px] motion-safe:animate-rise phone:top-auto phone:right-0 phone:bottom-0 phone:left-0 phone:z-4 phone:h-[60dvh] phone:w-auto phone:rounded-b-none";
const MAP_SCROLLER =
  "h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Section headings sit one level under the building's title: h2 under the page's h1, h3 under the panel's h2. */
const SectionLevel = createContext<"h2" | "h3">("h3");

const SECTION = "mt-[22px]";
const SECTION_HEADING =
  "mb-2.5 font-display text-[20px] leading-none font-normal text-deep";
const MESSAGE = "text-[13.5px] text-slate";
const LIST_ROW = "items-center border-t border-deep/10 py-[9px]";

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

const formatMonth = (yearMonth: string) =>
  formatDate(yearMonth, { month: "short", year: "numeric" });

const complaintsWord = (count: number) => (count === 1 ? "complaint" : "complaints");

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
    (bbox: BuildingDetail["bbox"]) => load311Summary(bbox, requestsSince, fetchImpl),
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
      <SectionLevel value={props.place === "page" ? "h2" : "h3"}>
      <div ref={scrollerRef} className={props.place === "page" ? undefined : MAP_SCROLLER}>
        <Header
          complex={complex}
          heading={Heading}
          headingId={headingId}
          photo={detail.status === "ready" ? detail.value.bbox : null}
          onClose={onClose}
        />
        <div className="px-[22px] pt-4 pb-[22px]">
          {complex.repeatOffender && (
            <RepeatOffenderNote listing={complex.repeatOffender} />
          )}
          <LeadFigure complex={complex} period={view.period} />
          <Figures complex={complex} period={view.period} />
          <CategoryBars counts={countsByCategory(complex, view.period)} />

          {detail.status === "failed" ? (
            <Section title="Month by month">
              <p className={MESSAGE}>
                This building&apos;s history could not be loaded. The counts above
                are still current.
              </p>
            </Section>
          ) : (
            detail.status === "ready" && (
              <MonthChart monthly={detail.value.monthly} />
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
            , City of Austin. {NO_CASES_CAUTION}
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
      </SectionLevel>
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
 * moment; USGS can take seconds, so the photo fades in over them once it has loaded, and a photo
 * that fails is dropped, never shown as a broken image.
 */
function Header(props: {
  complex: Complex;
  heading: "h1" | "h2";
  headingId: string;
  /** The parcel's box, once the building file has arrived. */
  photo: BuildingDetail["bbox"] | null;
  onClose: (() => void) | null;
}) {
  const { complex, heading: Heading } = props;
  const title = titleOf(complex);
  const src = props.photo ? aerialPhotoUrl(props.photo, 744, 400) : null;

  const [settled, setSettled] = useState<{ src: string; status: PhotoStatus } | null>(null);
  const status: PhotoStatus = settled !== null && settled.src === src ? settled.status : "loading";

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
        // A plain img: the photo comes straight from USGS in the browser, never through this site's server.
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
          className={`pointer-events-none absolute ${props.onClose ? "top-[58px]" : "top-3.5"} right-3.5 z-1 text-[10.5px] text-ice opacity-80 ${PHOTO_TEXT_SHADOW}`}
        >
          Aerial photo: USGS
        </span>
      )}
      {props.onClose && (
        <button
          type="button"
          aria-label="Close building details"
          onClick={props.onClose}
          className="absolute top-3.5 right-3.5 z-2 size-8 cursor-pointer rounded-full bg-white/72 text-[18px] leading-none text-deep backdrop-blur-[8px] hover:bg-white/85"
        >
          ×
        </button>
      )}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  const headingId = useId();
  const level = useContext(SectionLevel);
  const heading = { id: headingId, className: SECTION_HEADING, children: props.title };
  return (
    <section aria-labelledby={headingId} className={SECTION}>
      {level === "h2" ? <h2 {...heading} /> : <h3 {...heading} />}
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
    <div className="flex gap-2.5 rounded-[18px] border border-coral/50 bg-coral/28 px-3.5 py-3 text-[13.5px] text-navy">
      <span
        aria-hidden
        className="mt-1.5 size-[9px] flex-none rounded-full bg-coral ring-3 ring-coral/30"
      />
      <p>
        <strong className="block font-medium">
          <a
            href="https://data.austintexas.gov/d/86z9-i27i"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            On the city&apos;s Repeat Offender list
          </a>
        </strong>{" "}
        {listing.name ?? "Registered property"}, {formatCount(listing.units)}{" "}
        {listing.units === 1 ? "unit" : "units"}.{" "}
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

function countsByCategory(complex: Complex, period: Period): Record<Category, number> {
  const categories = Object.keys(CATEGORY_LABEL) as Category[];
  return Object.fromEntries(
    categories.map((category) => [category, countFor(complex, { ...DEFAULT_VIEW, period, category })]),
  ) as Record<Category, number>;
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

/** The two periods the lead figure is not showing, shortest first, then the complaints still open. */
function Figures({ complex, period }: { complex: Complex; period: Period }) {
  const figures = [
    ...PERIODS.filter((other) => other !== period).map((other) => ({
      value: formatCount(totalFor(complex, other)),
      label: `last ${PERIOD_LABEL[other]}`,
    })),
    { value: formatCount(complex.open), label: "open now" },
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
    <Section title="What the complaints were about">
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
        <p className={MESSAGE}>No complaints {PERIOD_PHRASE.y3}.</p>
      </Section>
    );
  }

  const first = formatMonth(monthly[0].month);
  const last = formatMonth(monthly[monthly.length - 1].month);
  // On a tie, the most recent of the busiest months.
  const busiest = formatMonth(monthly.findLast(({ count }) => count === peak)?.month ?? monthly[0].month);
  const peakComplaints = `${peak} ${complaintsWord(peak)}`;
  const summary = `Complaints opened each month, ${first} to ${last}. Busiest month: ${busiest}, with ${peakComplaints}.`;

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
            title={`${formatMonth(month)}: ${count} ${complaintsWord(count)}`}
            className={`min-h-[3px] flex-1 rounded-[3px] ${count > 0 ? "bg-linear-to-b/srgb from-deep to-steel" : "bg-deep/14"}`}
            style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-[12px] text-steel">
        <span>{first}</span>
        <span>
          Busiest month: {busiest}, {peakComplaints}
        </span>
        <span>{last}</span>
      </p>
    </Section>
  );
}

function Requests311({ outcome }: { outcome: LoadState<RequestTypeCount[]> }) {
  return (
    <Section title="311 requests around this parcel">
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
