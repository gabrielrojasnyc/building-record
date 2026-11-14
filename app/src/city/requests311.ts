import type { BuildingDetail, Meta } from "@/domain/types";

export interface RequestTypeCount {
  type: string;
  count: number;
}

const REQUESTS_311 = "https://data.austintexas.gov/resource/xwdj-i9he.json";

/** The same start as the code case history, so both sections cover the same months. */
const HISTORY_START: Meta["since"] = "2023-11-01";

const TOP_TYPES = 6;

interface TypeCountRow {
  sr_type_desc: string;
  count: string;
}

/** Spaces stay `%20`, not URLSearchParams' `+`, so the clauses read back exactly as written. */
function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

/**
 * The most frequent 311 request types inside a parcel's bounding box since the history start,
 * read live from the city. Rejects when the city answers with an error or cannot be reached.
 */
export async function load311Summary(
  bbox: BuildingDetail["bbox"],
  fetchImpl: typeof fetch = fetch,
): Promise<RequestTypeCount[]> {
  const [west, south, east, north] = bbox;
  const query = toQueryString({
    $select: "sr_type_desc, count(*) as count",
    $where: `sr_created_date >= '${HISTORY_START}' AND within_box(sr_location_lat_long, ${north}, ${west}, ${south}, ${east})`,
    $group: "sr_type_desc",
    $order: "count DESC",
    $limit: String(TOP_TYPES),
  });

  const response = await fetchImpl(`${REQUESTS_311}?${query}`);
  if (!response.ok) {
    throw new Error(`The 311 dataset responded ${response.status}`);
  }

  const rows = (await response.json()) as TypeCountRow[];
  return rows.map((row) => ({
    type: row.sr_type_desc,
    count: Number(row.count),
  }));
}
