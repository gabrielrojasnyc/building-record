import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount } from "@/domain/format";
import {
  CATEGORY_BUTTON_LABEL,
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  CITY_CATEGORY_DESCRIPTION,
  CITY_CATEGORY_TERM,
  NO_CASES_CAUTION,
  OUTCOME_CARD_PHRASE,
} from "@/domain/labels";
import {
  classify,
  KNOWN_CITY_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOMES,
  type Outcome,
} from "@/domain/outcomes";
import { PERIOD_LABEL, PERIOD_PHRASE, PERIODS } from "@/domain/periods";
import { FAMILY_LABEL, PROBLEM_FAMILIES } from "@/domain/problems";
import type { Category, Meta } from "@/domain/types";
import { Glass } from "@/ui/Glass";
import { formatPullDate, Notice } from "@/ui/Notice";
import { readDataFile } from "../dataFiles";

/** Every family of recorded problem but the catch-all, as they read in a sentence. */
const PLAIN_FAMILIES = PROBLEM_FAMILIES.filter((family) => family !== "other")
  .map((family) => FAMILY_LABEL[family].toLowerCase())
  .join(", ");

export const metadata: Metadata = {
  title: "Method and sources: Building Record",
  description:
    "Where Building Record's numbers come from, what they leave out and what they do not mean.",
};

const PORTAL = "https://data.austintexas.gov/d";

const SOURCES = [
  {
    name: "Land Use Inventory",
    id: "7vsm-dvxg",
    use: "which parcels are apartments, and where their boundaries are.",
  },
  {
    name: "Addresses",
    id: "9s7j-tygf",
    use: "the address points that label each building, and the address search.",
  },
  {
    name: "Austin Code Complaint Cases",
    id: "6wtj-zbtb",
    use: "every complaint, with its category, status, dates, outcome phrase and violation case number.",
  },
  {
    name: "Repeat Offender Registrations",
    id: "86z9-i27i",
    use: "the properties on the city's Repeat Offender list.",
  },
  {
    name: "Repeat Offender Property Deficiencies",
    id: "ge82-ij4h",
    use: "the problems the city recorded at those properties.",
  },
  {
    name: "Austin 311 Public Data",
    id: "xwdj-i9he",
    use: "311 service requests, read live when a building's record opens.",
  },
  {
    name: "Building Footprints Year 2013",
    id: "3qcc-8uhz",
    use: "building shapes and heights for the model a picked building stands up as, read live.",
  },
] as const;

const NAIP =
  "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip";
const ODBL = "https://opendatacommons.org/licenses/odbl/";
/** When every name was last checked against current rental listings. Change it when that check is run again. */
const NAMES_LAST_CHECKED = "November 2026";

const CATEGORIES: Category[] = ["structure", "property", "landuse", "permit"];

/** The table's last heading: the one phrase that leaves a complaint out of every count. */
const NOT_COUNTED = "Not counted: duplicate report";

const COUNT_WORD: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
};

/** The categories whose city description ends with "Violation(s)", worked out from the descriptions, not named here. */
const violationWordCategories = CATEGORIES.filter((category) =>
  CITY_CATEGORY_DESCRIPTION[category].endsWith("Violation(s)"),
);

/** "A, B and C", the way the page says a list of words. */
function sayList(words: string[]): string {
  return words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/**
 * Every phrase the city is known to use, under the outcome it gives a closed complaint with no violation case number.
 * Asks the same `classify` the pipeline uses, so the table cannot say something the site does not do.
 */
function phrasesByOutcome(): { heading: string; phrases: string[] }[] {
  const landing = new Map<Outcome | "duplicate", string[]>();
  for (const phrase of KNOWN_CITY_OUTCOMES) {
    const outcome = classify({
      cityOutcome: phrase,
      status: "Closed",
      hasViolationCase: false,
    });
    landing.set(outcome, [...(landing.get(outcome) ?? []), phrase]);
  }
  return [
    ...OUTCOMES.map((outcome) => ({
      heading: OUTCOME_LABEL[outcome],
      phrases: landing.get(outcome) ?? [],
    })),
    { heading: NOT_COUNTED, phrases: landing.get("duplicate") ?? [] },
  ].filter(({ phrases }) => phrases.length > 0);
}

/** At most this many phrases are named in the note under the table. */
const NAMED_IN_NOTE = 3;

/**
 * Phrases the table puts under Referred or closed without a finding whose closed complaints, in the data, nearly all
 * carry a violation case number, and so are counted as Violation confirmed. Most used first.
 */
function phrasesThatComeWithCases(meta: Meta): string[] {
  return meta.phrasesUsuallyWithCase
    .filter(
      (phrase) =>
        classify({
          cityOutcome: phrase,
          status: "Closed",
          hasViolationCase: false,
        }) === "other",
    )
    .slice(0, NAMED_IN_NOTE);
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-deep underline"
    >
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 font-display text-[24px] leading-tight font-normal text-deep">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function PhraseTable() {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-white/60 bg-white/30">
      <table className="w-full border-collapse text-left text-[14px] leading-snug">
        <caption className="px-4 pt-3 pb-2 text-left text-[14px] text-deep">
          City outcome phrases and where each one is counted
        </caption>
        <thead>
          <tr className="text-deep">
            <th scope="col" className="px-4 py-2 font-normal">
              Counted as
            </th>
            <th scope="col" className="px-4 py-2 font-normal">
              City phrases
            </th>
          </tr>
        </thead>
        <tbody>
          {phrasesByOutcome().map(({ heading, phrases }) => (
            <tr key={heading} className="border-t border-white/60 align-top">
              <th
                scope="row"
                className="w-[34%] px-4 py-2.5 font-normal text-deep"
              >
                {heading}
              </th>
              <td className="px-4 py-2.5">
                <ul className="flex flex-col gap-1">
                  {phrases.map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MethodPage() {
  const meta = await readDataFile<Meta>("meta.json");
  const unmatchedPercent = Math.round(meta.unmatchedCaseShare * 100);
  const comeWithCases = phrasesThatComeWithCases(meta);

  return (
    <main className="px-(--gutter) py-6">
      <div aria-hidden className="fog pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex max-w-[44rem] flex-col gap-3">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-[30px] items-center self-start rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
        >
          Back to the map
        </Link>

        <Glass
          as="article"
          className="rounded-[28px] p-[22px] text-[15px] leading-[1.6] text-slate phone:px-[18px]"
        >
          <h1 className="font-display text-[40px] leading-none text-deep phone:text-[32px]">
            Method and sources
          </h1>
          <p className="mt-3 text-[17px] leading-normal text-deep">
            Where the numbers come from, what they leave out and what they do
            not mean.
          </p>

          <Section title="What this site is">
            <p>
              Building Record is an independent reading of public City of Austin
              records. It is not a City of Austin site, and it is not endorsed
              by the City of Austin. The data comes with no warranty, and so
              does this site.
            </p>
            <p>
              It shows counts and sources only. It does not judge a building or
              put buildings in an order of merit.
            </p>
          </Section>

          <Section title="Where the data comes from">
            <ul className="flex flex-col gap-2">
              {SOURCES.map(({ name, id, use }) => (
                <li key={id}>
                  <ExternalLink href={`${PORTAL}/${id}`}>{name}</ExternalLink>:{" "}
                  {use}
                </li>
              ))}
            </ul>
            <p>
              All seven datasets are published by the City of Austin on its open
              data portal. Credit goes to the City of Austin and its Development
              Services and 311 departments.
            </p>
            <p>
              Aerial photos are from the{" "}
              <ExternalLink href={NAIP}>
                USGS National Agriculture Imagery Program
              </ExternalLink>
              . Most building names are from OpenStreetMap contributors.
            </p>
            <p>
              Map data is from OpenStreetMap contributors, delivered through
              OpenMapTiles and OpenFreeMap. See{" "}
              <ExternalLink href="https://www.openstreetmap.org/copyright">
                OpenStreetMap copyright
              </ExternalLink>
              ,{" "}
              <ExternalLink href="https://openmaptiles.org/">
                OpenMapTiles
              </ExternalLink>{" "}
              and{" "}
              <ExternalLink href="https://openfreemap.org/">
                OpenFreeMap
              </ExternalLink>
              .
            </p>
          </Section>

          <Section title="What counts as a complex">
            <p>
              A parcel the city classifies as apartments is one complex, and
              parcels that share an address are shown as one complex: when
              parcels carry the same address, taken from inside the parcel or
              from a Repeat Offender registration, and sit within 250 meters of
              one another, their complaints are counted together under that
              address. This copy has {formatCount(meta.complexCount)} complexes.
              Other neighboring parcels are not merged, so a property that spans
              parcels with different addresses can still show up as several
              complexes. Small multifamily buildings are not included.
            </p>
          </Section>

          <Section title="What counts as a complaint">
            <p>
              A complaint is a record in the city&apos;s Austin Code Complaint
              Cases dataset. This site reads each record&apos;s parcel,
              category, status, dates and the city&apos;s outcome phrase, and
              whether it carries a violation case number.
            </p>
            <p>
              Over the last 3 years,{" "}
              {meta.duplicateCases === 1
                ? "1 complaint at these complexes was closed by the city as a duplicate of another complaint and is not counted."
                : `${formatCount(meta.duplicateCases)} complaints at these complexes were closed by the city as duplicates of another complaint and are not counted.`}
            </p>
            <p>
              Each complaint counted here is in one of four categories. This
              site shows them under these names, with the word the city&apos;s
              description includes for each. The examples come from the kinds of
              problem the city recorded at Repeat Offender properties.
            </p>
            <ul className="list-disc pl-5">
              {CATEGORIES.map((category) => (
                <li key={category}>
                  {CATEGORY_LABEL[category]} (the city&apos;s description
                  includes {CITY_CATEGORY_TERM[category]}).{" "}
                  {CATEGORY_MEANING[category]}
                </li>
              ))}
            </ul>
            {violationWordCategories.length > 0 && (
              <p>
                {COUNT_WORD[violationWordCategories.length]} of the city&apos;s
                descriptions, for{" "}
                {sayList(
                  violationWordCategories.map(
                    (category) => CATEGORY_LABEL[category],
                  ),
                )}
                , end with the word &quot;Violation(s)&quot;. That is part of
                the city&apos;s name for the type of complaint. It is there
                whether or not a violation was found.
              </p>
            )}
            <p>
              The type buttons on the filter bar read{" "}
              {sayList(
                CATEGORIES.map((category) => CATEGORY_BUTTON_LABEL[category]),
              )}
              , short for these four names in that order.
            </p>
            <p>
              The city&apos;s complaint records do not say whether a complaint
              was about pests, mold or anything more specific.
            </p>
          </Section>

          <Section title="How outcomes are decided">
            <p>
              Each complaint is sorted by how the city closed it, or has not.
              The rules run in this order. The first rule that fits decides.
            </p>
            <ol
              aria-label="The rules, in order"
              className="list-decimal pl-5 [&>li]:pl-1"
            >
              <li>
                The city closed it as a duplicate of another complaint. It is
                not counted anywhere.
              </li>
              <li>
                It has a violation case number, or the city&apos;s phrase says a
                violation was found. A phrase that says no violation was found
                does not count. This is {OUTCOME_LABEL.violation}.
              </li>
              <li>
                The city&apos;s phrase says an inspection was performed and the
                problem was fixed: abated by the inspector, abated by Community
                Court, or fixed through voluntary compliance. This is{" "}
                {OUTCOME_LABEL.fixed}.
              </li>
              <li>
                The city&apos;s phrase says no violation was found. This is{" "}
                {OUTCOME_LABEL.none}.
              </li>
              <li>
                None of the rules above fit, and the city has not closed it.
                This is {OUTCOME_LABEL.open}.
              </li>
              <li>
                Anything else: it is closed and none of the rules above fit.
                This is {OUTCOME_LABEL.other}.
              </li>
            </ol>
            <p>
              A complaint with a violation case number is always{" "}
              {OUTCOME_LABEL.violation}, whatever the city&apos;s phrase says.
            </p>
            <p>
              The table shows where each phrase lands for a complaint the city
              has closed and that has no violation case number. A complaint the
              city has not closed is {OUTCOME_LABEL.open} unless one of the
              first four rules fits it first. The phrases are the city&apos;s
              own words, shown exactly as written.
            </p>
            <PhraseTable />
            {comeWithCases.length > 0 && (
              <p>
                Phrases such as{" "}
                {sayList(comeWithCases.map((phrase) => `"${phrase}"`))} appear
                under {OUTCOME_LABEL.other} because the table shows where a
                phrase lands on its own. In practice nearly every complaint the
                city closes with one of them carries a violation case number,
                and so counts as {OUTCOME_LABEL.violation}.
              </p>
            )}
            <p>
              This site shows only these phrases. Any other wording is never
              shown and is treated as if the city had left the phrase blank.
              {meta.unrecognizedOutcomes > 0 &&
                (meta.unrecognizedOutcomes === 1
                  ? " 1 complaint the city opened in the last 3 years carries a phrase that is not on this list."
                  : ` ${formatCount(meta.unrecognizedOutcomes)} complaints the city opened in the last 3 years carry a phrase that is not on this list.`)}
            </p>
            <p>
              On a building&apos;s card, the outcome line uses short forms:{" "}
              {OUTCOMES.map(
                (outcome) =>
                  `${OUTCOME_CARD_PHRASE[outcome]} means ${OUTCOME_LABEL[outcome]}`,
              ).join(", ")}
              .
            </p>
          </Section>

          <Section title="What Violation confirmed means and does not">
            <p>
              Violation confirmed means the city opened a formal violation case
              for the complaint, or its own outcome phrase says a violation was
              found.
            </p>
            <ul className="list-disc pl-5">
              <li>It does not say the violation was serious.</li>
              <li>It does not say who was responsible.</li>
              <li>It does not say the violation remains.</li>
            </ul>
            <p>
              Still open means the city&apos;s record of the complaint was not
              marked Closed when the data was pulled.
            </p>
          </Section>

          <Section title="How far back it goes">
            <p>
              Complaints are counted in three periods, each counted back from
              the day the data was pulled, {formatPullDate(meta.pulledAt)}:
            </p>
            <ul className="list-disc pl-5">
              {PERIODS.map((period) => (
                <li key={period}>
                  {PERIOD_LABEL[period]}: from{" "}
                  {formatPullDate(meta.periodStarts[period])}
                </li>
              ))}
            </ul>
            <p>
              A complaint is counted in a period when it was opened on or after
              that day and not after the day the data was pulled. Dates follow
              Austin&apos;s calendar, not UTC. The city&apos;s data is sparse
              before November 2023, which is why there is no longer period.
            </p>
            <p>
              Open complaints are those the city had not closed when the data
              was pulled, among the complaints in the 3 years, duplicates left
              out. Open is not the same as {OUTCOME_LABEL.open}: a complaint
              with a violation case number is {OUTCOME_LABEL.violation} even
              while it is open.
            </p>
          </Section>

          <Section title="What is left out">
            <p>
              About {unmatchedPercent}% of the city&apos;s complaints from the
              last 3 years carry no parcel number, so they cannot be tied to a
              building and are not counted anywhere. Complaints on parcels that
              are not apartments are not shown either. This copy counts{" "}
              {formatCount(meta.caseCount)} complaints at apartment complexes in
              the last 3 years, with duplicates left out.
              {meta.uncategorizedCases > 0 &&
                (meta.uncategorizedCases === 1
                  ? " 1 complaint carries a description this site does not recognize and is not counted."
                  : ` ${formatCount(meta.uncategorizedCases)} complaints carry a description this site does not recognize and are not counted.`)}
            </p>
          </Section>

          <Section title="Counts, not rates">
            <p>
              Buildings are shown by raw complaint count with the size of their
              parcel, not as complaints per unit. The city does not publish unit
              counts for most of these buildings, so a per-unit rate cannot be
              shown.
            </p>
            <p>
              Under a building&apos;s count, its record says how counts spread
              across the complexes on this site in the same period: the share
              with no complaints, and the count that 9 complexes in 10 are at or
              under. {PERIOD_PHRASE.m12.replace(/^in/, "In")},{" "}
              {Math.round(meta.spread.m12.noneShare * 100)}% of them had no
              complaints and 9 in 10 had {formatCount(meta.spread.m12.nineInTen)}{" "}
              or fewer. The line describes the city and does not place any
              building in it. It is not adjusted for size: a larger complex has
              more people who can complain.
            </p>
          </Section>

          <Section title="How a building is labelled">
            <p>
              Most buildings are labelled with a city address point that falls
              inside the parcel. When several do, a whole address is used before
              a fractional one such as 310 1/2 Comal St, then the lowest street
              number.
            </p>
            <p>
              A property on the Repeat Offender list is labelled with the
              address the city registered it under.
            </p>
            <p>
              When no address point falls inside a parcel, it is labelled with
              its city parcel ID and the nearest address point within 150
              meters, such as Parcel 0123456789, near 100 Main St. That address
              may belong to a neighbor.
            </p>
            <p>
              When no address point is within 150 meters either, the label is
              the parcel ID alone.
            </p>
            <p>
              If two complexes far apart would still share a label, each also
              carries its parcel ID. Any of these labels can differ from the
              address a leasing office uses.
            </p>
          </Section>

          <Section title="Names, building shapes and photos">
            <p>
              Names come from OpenStreetMap, where they are recorded by
              volunteers and may be out of date.
              {meta.namesAsOf &&
                ` Names as of ${formatPullDate(meta.namesAsOf)}.`}{" "}
              A name is shown only when one clear name lies inside the parcel.
              If the property is registered on the city&apos;s Repeat Offender
              list under a different property name, neither name is shown. A
              registration that reads as a company&apos;s name is not compared.
              Names that a check against current rental listings found to be out
              of date, misplaced or misspelled are not shown. The last full
              check was in {NAMES_LAST_CHECKED}. When OpenStreetMap
              has no name inside the parcel, the name the property is registered
              under on the city&apos;s Repeat Offender list is shown only after
              a person has checked and approved it, and never when it reads as a
              company&apos;s. {formatCount(meta.namedComplexes)} of these{" "}
              {formatCount(meta.complexCount)} complexes have a name.
            </p>
            <p>
              Building shapes are from the city&apos;s 2013 survey of building
              footprints, with OpenStreetMap shapes for newer buildings and
              estimated heights where none was measured.
            </p>
            <p>
              Aerial photos are from the USGS National Agriculture Imagery
              Program and are in the public domain.
            </p>
            <p>
              OpenStreetMap data is available under the{" "}
              <ExternalLink href={ODBL}>Open Database License</ExternalLink>.
            </p>
          </Section>

          <Section title="Repeat Offender properties">
            <p>
              A property is marked when it holds an active registration on the
              city&apos;s Repeat Offender list. The violation counts shown with
              it are the city&apos;s own, from that list, and are separate from
              this site&apos;s complaint counts.
            </p>
          </Section>

          <Section title="Recorded problems at Repeat Offender properties">
            <p>
              <ExternalLink href={`${PORTAL}/ge82-ij4h`}>
                Repeat Offender Property Deficiencies
              </ExternalLink>{" "}
              lists the problems the city recorded at properties in its Repeat
              Offender program. It is published only for properties in the
              Repeat Offender program, so no other building has any here.
            </p>
            <p>
              This site reads the problems recorded in the last 3 years. For
              each kind of problem at a property it counts how many entries the
              city lists as cleared and how many it does not.
            </p>
            <p>
              A kind of problem is the title of the code section the city cited,
              shown as the city writes it, with the section number when the city
              gives one, such as Installation (§605.1).
            </p>
            <p>
              A record first says which kinds were recorded most, in plain
              words. Each kind belongs to one family, read from the number of
              the code section it cites, or from its title where the city cites
              no section: {PLAIN_FAMILIES}. A kind this site does not know is
              counted under other, and never guessed at. Under each
              family the record lists the city&apos;s own titles, so
              Installation (§605.1) is found under electrical and lighting.
            </p>
            <p>
              For a problem recorded under the code&apos;s pest sections, the
              city also publishes its inspector&apos;s description. This site
              reads that description for one thing: whether it names roaches,
              rodents, bed bugs, wasps or bees, ants or other insects. Sentences
              quoted from the code are set aside first, because they speak of
              insects and rodents in general. The description is never shown or
              kept, since it can hold a unit number or what a tenant said. The
              reading is cautious: it would sooner miss a name than give a wrong
              one, and a pest the description says was not found is not named.
              When it reads no name, the record says the kind could not be
              read.
            </p>
          </Section>

          <Section title="311 requests">
            <p>
              311 requests are counted inside the rectangle around a parcel, so
              some of them may belong to neighbors.
            </p>
          </Section>

          <Section title="What a record cannot tell you">
            <p className="rounded-[18px] border border-white/60 bg-white/42 px-4 py-3 text-deep">
              {NO_CASES_CAUTION}
            </p>
          </Section>

          <Section title="How fresh it is">
            <p>
              This copy of the data was pulled on{" "}
              {formatPullDate(meta.pulledAt)}.
            </p>
          </Section>
        </Glass>
      </div>
      <div className="relative mt-3">
        <Notice meta={meta} />
      </div>
    </main>
  );
}
