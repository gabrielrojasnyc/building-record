import type { BuildingDetail } from "@/domain/types";

const requests = new Map<string, Promise<BuildingDetail>>();

async function fetchDetail(id: string, fetchImpl: typeof fetch): Promise<BuildingDetail> {
  const response = await fetchImpl(`/data/buildings/${id}.json`);
  if (!response.ok) throw new Error(`The building file for ${id} responded ${response.status}`);
  return (await response.json()) as BuildingDetail;
}

/** One request per building however many callers ask; a failed request is forgotten so a later pick can retry. */
export function loadBuildingDetail(id: string, fetchImpl: typeof fetch = fetch): Promise<BuildingDetail> {
  const known = requests.get(id);
  if (known) return known;

  const request = fetchDetail(id, fetchImpl);
  requests.set(id, request);
  request.catch(() => {
    if (requests.get(id) === request) requests.delete(id);
  });
  return request;
}

/** Empties the cache. For tests that need to start from nothing. */
export function forgetBuildingDetails(): void {
  requests.clear();
}
