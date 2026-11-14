const BASE_URL = 'https://data.austintexas.gov/resource';
const PAGE_SIZE = 50_000;
const RETRY_WAITS_MS = [1_000, 3_000, 9_000];

export interface SoqlQuery {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
}

export interface ReadOptions {
  /** Pause between retries. Tests inject an instant one. */
  sleep?: (ms: number) => Promise<void>;
}

export class CityApiError extends Error {
  constructor(
    readonly datasetId: string,
    readonly status: number,
  ) {
    super(`City API request for dataset ${datasetId} failed with status ${status}`);
    this.name = 'CityApiError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryable = (status: number) => status === 429 || status >= 500;

function pageUrl(datasetId: string, query: SoqlQuery, offset: number): string {
  const params = new URLSearchParams();
  if (query.select) params.set('$select', query.select);
  if (query.where) params.set('$where', query.where);
  if (query.group) params.set('$group', query.group);
  params.set('$order', query.order ?? ':id');
  params.set('$limit', String(PAGE_SIZE));
  params.set('$offset', String(offset));
  return `${BASE_URL}/${datasetId}.json?${params}`;
}

/** Status 0 stands for a network failure that never produced a response. */
async function fetchPage<Row>(
  datasetId: string,
  url: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<Row[]> {
  const token = process.env.SOCRATA_APP_TOKEN;
  const init: RequestInit = token ? { headers: { 'X-App-Token': token } } : {};

  for (let attempt = 0; ; attempt++) {
    let failedStatus: number;
    try {
      const response = await fetchImpl(url, init);
      if (response.ok) return (await response.json()) as Row[];
      failedStatus = response.status;
    } catch {
      failedStatus = 0;
    }

    const wait = RETRY_WAITS_MS[attempt];
    const canRetry = failedStatus === 0 || isRetryable(failedStatus);
    if (!canRetry || wait === undefined) throw new CityApiError(datasetId, failedStatus);
    await sleep(wait);
  }
}

/** Reads every row of a dataset, 50,000 per page, ordered for stable paging. */
export async function readAll<Row>(
  datasetId: string,
  query: SoqlQuery,
  fetchImpl: typeof fetch = fetch,
  { sleep = defaultSleep }: ReadOptions = {},
): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage<Row>(datasetId, pageUrl(datasetId, query, offset), fetchImpl, sleep);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}
