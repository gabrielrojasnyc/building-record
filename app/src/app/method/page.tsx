import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORY_LABEL } from "@/domain/labels";
import type { Category, Complex, Meta } from "@/domain/types";
import { Glass } from "@/ui/Glass";
import { formatPullDate, Notice } from "@/ui/Notice";
import { readDataFile } from "../dataFiles";

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
    use: "every code case, with its category, status and date.",
  },
  {
    name: "Repeat Offender Registrations",
    id: "86z9-i27i",
    use: "the properties on the city's Repeat Offender list.",
  },
  {
    name: "Affordable Housing Inventory",
    id: "ifzc-3xz8",
    use: "unit counts for the buildings it lists.",
  },
  {
    name: "Austin 311 Public Data",
    id: "xwdj-i9he",
    use: "311 service requests, read live when a building's record opens.",
  },
] as const;

const CITY_TERMS: { category: Category; term: string }[] = [
  { category: "structure", term: "Structure Condition Violation" },
  { category: "property", term: "Property Abatement" },
  { category: "landuse", term: "Land Use Violation" },
  { category: "permit", term: "Work Without Permit" },
];

const CAUTION =
  "No cases means none reached Code Enforcement. It does not mean the building has no problems.";

const formatCount = (count: number) => count.toLocaleString("en-US");

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-deep underline">
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

export default async function MethodPage() {
  const [meta, complexes] = await Promise.all([
    readDataFile<Meta>("meta.json"),
    readDataFile<Complex[]>("complexes.json"),
  ]);
  const withUnitCounts = complexes.filter(({ units }) => units !== null).length;
  const unmatchedPercent = Math.round(meta.unmatchedCaseShare * 100);

  return (
    <main className="px-(--gutter) py-6">
      <div aria-hidden className="fog pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex max-w-[44rem] flex-col gap-3">
        <Link
          href="/"
          className="inline-flex h-[30px] items-center self-start rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
        >
          Back to the map
        </Link>

        <Glass as="article" className="rounded-[28px] p-[22px] text-[15px] leading-[1.6] text-slate phone:px-[18px]">
          <h1 className="font-display text-[40px] leading-none text-deep phone:text-[32px]">
            Method and sources
          </h1>
          <p className="mt-3 text-[17px] leading-normal text-deep">
            Where the numbers come from, what they leave out and what they do not mean.
          </p>

          <Section title="What this site is">
            <p>
              Building Record is an independent reading of public City of Austin records. It is
              not a City of Austin site, and it is not endorsed by the City of Austin. The data comes with no
              warranty, and so does this site.
            </p>
            <p>
              It shows counts and sources only. It does not judge a building or put buildings in
              an order of merit.
            </p>
          </Section>

          <Section title="Where the data comes from">
            <ul className="flex flex-col gap-2">
              {SOURCES.map(({ name, id, use }) => (
                <li key={id}>
                  <ExternalLink href={`${PORTAL}/${id}`}>{name}</ExternalLink>: {use}
                </li>
              ))}
            </ul>
            <p>
              All six datasets are published by the City of Austin on its open data portal. Credit
              goes to the City of Austin and its Development Services, Housing and 311
              departments.
            </p>
            <p>
              The Affordable Housing Inventory is licensed{" "}
              <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">
                CC BY-SA 4.0
              </ExternalLink>
              . The unit counts taken from it are shared here under the same license.
            </p>
            <p>
              Map data is from OpenStreetMap contributors, delivered through OpenMapTiles and
              OpenFreeMap. See{" "}
              <ExternalLink href="https://www.openstreetmap.org/copyright">
                OpenStreetMap copyright
              </ExternalLink>
              ,{" "}
              <ExternalLink href="https://openmaptiles.org/">OpenMapTiles</ExternalLink> and{" "}
              <ExternalLink href="https://openfreemap.org/">OpenFreeMap</ExternalLink>.
            </p>
          </Section>

          <Section title="What counts as a complex">
            <p>
              A parcel the city classifies as apartments is one complex. This copy has{" "}
              {formatCount(meta.complexCount)} complexes. Neighboring parcels are not merged, so a
              property that spans several parcels shows up as several complexes. Small multifamily
              buildings are not included.
            </p>
          </Section>

          <Section title="What a code case is">
            <p>
              A code case is a record in the city&apos;s Code Complaint Cases dataset, each with a
              category, a status and the date it was opened. This site shows the four categories
              under these names, with the city&apos;s own term for each:
            </p>
            <ul className="list-disc pl-5">
              {CITY_TERMS.map(({ category, term }) => (
                <li key={category}>
                  {CATEGORY_LABEL[category]} (the city&apos;s term is {term})
                </li>
              ))}
            </ul>
            <p>
              The city&apos;s records do not say whether a case was about pests, mold or anything
              more specific. This site reads only each case&apos;s category, status and opening date. It
              does not show what an inspector found or how a case was resolved.
            </p>
          </Section>

          <Section title="How far back it goes">
            <p>
              History starts on November 1, 2023, because the city&apos;s dataset is sparse before
              then. Two periods are offered: the last 12 months, counted back from the date the
              data was pulled, and everything since November 2023. Dates follow
              Austin&apos;s calendar, not UTC.
            </p>
          </Section>

          <Section title="What is left out">
            <p>
              About {unmatchedPercent}% of the city&apos;s cases carry no parcel number, so they
              cannot be tied to a building and are not counted anywhere. Cases on parcels that are
              not apartments are not shown either. This copy counts{" "}
              {formatCount(meta.caseCount)} cases matched to apartment parcels since November
              2023.
            </p>
          </Section>

          <Section title="Counts, not rates">
            <p>
              Buildings are shown by raw case count with the size of their parcel, not as cases per
              unit. The city publishes a unit count for {formatCount(withUnitCounts)} of these{" "}
              {formatCount(meta.complexCount)} complexes, so a per-unit rate cannot be shown for
              most. Unit counts appear where the city publishes them.
            </p>
          </Section>

          <Section title="How a building is labelled">
            <p>
              A building is labelled with the city address point inside its parcel, or with the
              city&apos;s registered address for properties on the Repeat Offender list. That can
              differ from the address a leasing office uses.
            </p>
          </Section>

          <Section title="Repeat Offender properties">
            <p>
              A property is marked when it holds an active registration on the city&apos;s Repeat
              Offender list. The violation counts shown with it are the city&apos;s own.
            </p>
          </Section>

          <Section title="311 requests">
            <p>
              311 requests are counted inside the rectangle around a parcel, so some of them may
              belong to neighbors.
            </p>
          </Section>

          <Section title="What a record cannot tell you">
            <p className="rounded-[18px] border border-white/60 bg-white/42 px-4 py-3 text-deep">
              {CAUTION}
            </p>
          </Section>

          <Section title="How fresh it is">
            <p>This copy of the data was pulled on {formatPullDate(meta.pulledAt)}.</p>
          </Section>
        </Glass>
      </div>
      <div className="relative mt-3">
        <Notice meta={meta} />
      </div>
    </main>
  );
}
