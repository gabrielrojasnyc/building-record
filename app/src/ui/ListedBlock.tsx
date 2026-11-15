"use client";

import { formatCount } from "@/domain/format";
import { FAMILY_LABEL, familyOf, type ProblemFamily } from "@/domain/problems";
import { pestSentence, recordedSentence } from "@/domain/summary";
import type {
  Deficiency,
  RecordedProblems,
  RepeatOffender,
} from "@/domain/types";
import { SHOW_ALL, useShowAll } from "./panelParts";
import { SummaryRow } from "./SummaryRow";

/** Families shown until the person asks for the rest. */
const FIRST_FAMILIES = 6;

/** Small print inside the coral block: slate, since steel is too faint on coral. */
const SMALL = "text-[12.5px] text-pretty text-slate";

/**
 * The city's own wording for one family's problems, most recorded first: each code section it cited and
 * how many times. Read from the building file, so it is empty until that file is in.
 */
function cityWording(deficiencies: Deficiency[], family: ProblemFamily) {
  return deficiencies
    .filter(({ kind }) => familyOf(kind) === family)
    .map(({ kind, cleared, notCleared }) => ({
      kind,
      count: cleared + notCleared,
    }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
    )
    .map(({ kind, count }) => `${kind} ${formatCount(count)}`)
    .join(", ");
}

/** Where the listing comes from, and its own figures, which are counted another way than everything above them. */
function Registration({ listing }: { listing: RepeatOffender }) {
  return (
    <p className={`mt-3 ${SMALL}`}>
      {listing.name ? `Registered as ${listing.name}, ` : "Registered with "}
      {formatCount(listing.units)} {listing.units === 1 ? "unit" : "units"}. The{" "}
      <a
        href="https://data.austintexas.gov/d/86z9-i27i"
        target="_blank"
        rel="noreferrer"
        className="text-deep underline"
      >
        city&apos;s Repeat Offender list
      </a>{" "}
      shows{" "}
      <span className="tabular-nums">
        {formatCount(listing.activeViolations)}
      </span>{" "}
      active of{" "}
      <span className="tabular-nums">
        {formatCount(listing.totalViolations)}
      </span>{" "}
      total violations. Those are the list&apos;s own figures and do not match
      the counts here.
    </p>
  );
}

/** Every family the city recorded problems in, with its count and, under it, the city's wording. */
function Families(props: {
  recorded: RecordedProblems;
  /** The building file's recorded problems, or where that file has got to. */
  deficiencies: Deficiency[] | "loading" | "failed";
}) {
  const { showAll, listRef, reveal } = useShowAll();
  const { families } = props.recorded;
  const shown = showAll ? families : families.slice(0, FIRST_FAMILIES);
  const deficiencies = Array.isArray(props.deficiencies)
    ? props.deficiencies
    : [];

  return (
    <>
      {/* The counts come with the complex; the city's wording under them comes with the building file. */}
      <p className={`mb-1.5 ${SMALL}`}>
        Published by the city for Repeat Offender properties only.{" "}
        {props.deficiencies === "loading" &&
          "Loading the city's own wording for each kind."}
        {props.deficiencies === "failed" &&
          "The city's own wording for each kind could not be loaded right now. The counts are still current."}
        {Array.isArray(props.deficiencies) &&
          "Under each line is the city's own wording and the code section it cites."}
      </p>
      <ul
        ref={listRef}
        tabIndex={-1}
        className="text-[14px] focus-visible:outline-none"
      >
        {shown.map(({ family, count, notCleared }) => {
          const wording = cityWording(deficiencies, family);
          return (
            <li key={family} className="border-t border-coral/60 py-[9px]">
              <span className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                <span>
                  {FAMILY_LABEL[family]}
                  {notCleared > 0 && (
                    <span className="ml-2 text-[12px] whitespace-nowrap text-slate tabular-nums">
                      {formatCount(notCleared)} not cleared
                    </span>
                  )}
                </span>
                <span className="text-right tabular-nums">
                  {formatCount(count)}
                </span>
              </span>
              {wording !== "" && (
                <span className="block text-[12px] leading-snug text-pretty text-slate">
                  {wording}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!showAll && families.length > FIRST_FAMILIES && (
        <button type="button" onClick={reveal} className={SHOW_ALL}>
          Show all {formatCount(families.length)} kinds
        </button>
      )}
    </>
  );
}

/**
 * The city's Repeat Offender listing, and what the listing is about: the kinds of problem the city recorded
 * most, then the pests its notes name. The first line opens to every kind, in the city's own wording.
 */
export function ListedBlock(props: {
  listing: RepeatOffender;
  /** The building file's recorded problems, or where that file has got to. */
  deficiencies: Deficiency[] | "loading" | "failed";
}) {
  const { listing } = props;
  const { recorded } = listing;
  const pests = recorded ? pestSentence(recorded) : null;

  return (
    <div className="rounded-[18px] border border-coral/55 bg-coral/22 px-3 py-0.5">
      <p className="flex items-center gap-2.5 py-[9px] text-[14px] font-normal text-navy">
        <span
          aria-hidden
          className="size-[9px] flex-none rounded-full bg-coral ring-3 ring-coral/30"
        />
        <span className="flex-1">On the city&apos;s Repeat Offender list</span>
        <span className="text-[12.5px] font-light text-slate tabular-nums">
          {formatCount(listing.units)} {listing.units === 1 ? "unit" : "units"}
        </span>
      </p>
      <ul aria-label="What the listing is about">
        <SummaryRow
          tone="listed"
          detail={
            <>
              {recorded && (
                <Families
                  recorded={recorded}
                  deficiencies={props.deficiencies}
                />
              )}
              <Registration listing={listing} />
            </>
          }
        >
          {recorded
            ? recordedSentence(recorded)
            : "The city has published no recorded problems here for the last 3 years."}
        </SummaryRow>
        {pests && <SummaryRow tone="listed">{pests}</SummaryRow>}
      </ul>
    </div>
  );
}
