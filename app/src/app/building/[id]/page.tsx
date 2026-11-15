import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PERIOD_PHRASE } from "@/domain/periods";
import { countFor, DEFAULT_VIEW, type View } from "@/domain/query";
import type { BuildingDetail, Complex, Meta } from "@/domain/types";
import { BuildingPanel } from "@/ui/BuildingPanel";
import { Notice } from "@/ui/Notice";
import { readDataFile } from "../../dataFiles";

/**
 * A building's own page is its full record, so it leads with the 3 years, the figure its description gives, with
 * 12 months and 2 years beside it. It has no period control.
 */
const FULL_RECORD: View = { ...DEFAULT_VIEW, period: "y3" };

/** Every complex gets its page at build time, so any other id is not found. */
export const dynamicParams = false;

let complexesById: Promise<Map<string, Complex>> | undefined;

/** Read once per build worker, since every page and its metadata look a complex up. */
function findComplex(id: string): Promise<Complex | undefined> {
  complexesById ??= readDataFile<Complex[]>("complexes.json").then(
    (complexes) => new Map(complexes.map((complex) => [complex.id, complex])),
  );
  return complexesById.then((byId) => byId.get(id));
}

export async function generateStaticParams() {
  const complexes = await readDataFile<Complex[]>("complexes.json");
  return complexes.map(({ id }) => ({ id }));
}

function describeRecord(complex: Complex): string {
  const total = countFor(complex, FULL_RECORD);
  const complaints =
    total === 0
      ? "no complaints"
      : `${total.toLocaleString("en-US")} ${total === 1 ? "complaint" : "complaints"}`;
  return `${complex.address}: ${complaints} ${PERIOD_PHRASE[FULL_RECORD.period]}. Data from the City of Austin.`;
}

export async function generateMetadata({
  params,
}: PageProps<"/building/[id]">): Promise<Metadata> {
  const { id } = await params;
  const complex = await findComplex(id);
  if (!complex) notFound();

  return {
    title: complex.name
      ? `${complex.name.text}, ${complex.address}: code complaint record`
      : `${complex.address}: code complaint record`,
    description: describeRecord(complex),
  };
}

export default async function BuildingPage({
  params,
}: PageProps<"/building/[id]">) {
  const { id } = await params;
  const complex = await findComplex(id);
  if (!complex) notFound();

  const [detail, meta] = await Promise.all([
    readDataFile<BuildingDetail>(`buildings/${complex.id}.json`),
    readDataFile<Meta>("meta.json"),
  ]);

  return (
    <main className="px-(--gutter) py-6">
      <div aria-hidden className="fog pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex max-w-xl flex-col gap-3">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-[30px] items-center self-start rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
        >
          Back to the map
        </Link>
        <BuildingPanel
          place="page"
          complex={complex}
          detail={detail}
          view={FULL_RECORD}
          periodStarts={meta.periodStarts}
        />
      </div>
      {/* Outside the reading column, so the notice keeps to one line wherever the screen allows. */}
      <div className="relative mt-3">
        <Notice meta={meta} />
      </div>
    </main>
  );
}
