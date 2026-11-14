import type { Meta } from "@/domain/types";
import { Glass } from "./Glass";

const NOT_OFFICIAL =
  "Not an official City of Austin site. Data: City of Austin Development Services and Austin 311, with no warranty.";

/** `2026-11-14` becomes `November 14, 2026`, read as a calendar date so no time zone can shift the day. */
function formatPullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function Notice({ meta }: { meta: Meta }) {
  return (
    <Glass
      as="p"
      className="mx-auto w-fit max-w-full rounded-full bg-ice/60 px-3 py-1 text-center text-[11px] leading-snug text-navy phone:rounded-2xl"
    >
      {NOT_OFFICIAL} Data pulled {formatPullDate(meta.pulledAt)}.
    </Glass>
  );
}
