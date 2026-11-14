import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countFor, DEFAULT_VIEW } from "@/domain/query";
import type { BuildingDetail, Complex, Meta } from "@/domain/types";
import { BuildingPanel } from "@/ui/BuildingPanel";
import { Notice } from "@/ui/Notice";
import { readDataFile } from "../../dataFiles";

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
  const total = countFor(complex, { ...DEFAULT_VIEW, period: "cases" });
  const cases =
    total === 0
      ? "no code complaint cases"
      : `${total.toLocaleString("en-US")} code complaint ${total === 1 ? "case" : "cases"}`;
  return `${complex.address}: ${cases} since Nov 2023. Data from the City of Austin.`;
}

export async function generateMetadata({
  params,
}: PageProps<"/building/[id]">): Promise<Metadata> {
  const { id } = await params;
  const complex = await findComplex(id);
  if (!complex) notFound();

  return {
    title: `${complex.address}: code complaint record`,
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
          className="inline-flex h-[30px] items-center self-start rounded-full bg-white/55 px-3 text-[13px] font-normal text-deep hover:bg-white/85"
        >
          Back to the map
        </Link>
        <BuildingPanel
          place="page"
          complex={complex}
          detail={detail}
          view={DEFAULT_VIEW}
        />
      </div>
      {/* Outside the reading column, so the notice keeps to one line wherever the screen allows. */}
      <div className="relative mt-3">
        <Notice meta={meta} />
      </div>
    </main>
  );
}
