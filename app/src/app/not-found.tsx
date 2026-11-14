import Link from "next/link";
import type { Meta } from "@/domain/types";
import { Glass } from "@/ui/Glass";
import { Notice } from "@/ui/Notice";
import { readDataFile } from "./dataFiles";

/** Any unknown address, including a building ID that is not in the data. */
export default async function NotFound() {
  const meta = await readDataFile<Meta>("meta.json");

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
        <Glass className="rounded-[28px] p-[22px]">
          <h1 className="font-display text-[32px] leading-[1.05] font-normal text-deep">
            That page does not exist.
          </h1>
        </Glass>
      </div>
      <div className="relative mt-3">
        <Notice meta={meta} />
      </div>
    </main>
  );
}
