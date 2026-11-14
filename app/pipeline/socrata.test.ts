import { afterEach, describe, expect, it, vi } from "vitest";
import { CityApiError, readAll } from "./socrata";

type Reply = Response | Error;

const rows = (count: number): Response =>
  Response.json(Array.from({ length: count }, (_, i) => ({ n: i })));

const status = (code: number): Response => new Response("", { status: code });

function fakeFetch(replies: Reply[]) {
  let next = 0;
  return vi.fn<typeof fetch>(async () => {
    const reply = replies[next++];
    if (reply === undefined) throw new Error("fakeFetch ran out of replies");
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

const urlOf = (fetchImpl: ReturnType<typeof fakeFetch>, call: number): string =>
  String(fetchImpl.mock.calls[call][0]);

const headersOf = (
  fetchImpl: ReturnType<typeof fakeFetch>,
  call: number,
): Headers => new Headers(fetchImpl.mock.calls[call][1]?.headers);

const instant = { sleep: async () => {} };

describe("readAll", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pages until a short page arrives", async () => {
    const fetchImpl = fakeFetch([rows(50000), rows(50000), rows(12)]);
    expect(
      await readAll("6wtj-zbtb", { order: "case_id" }, fetchImpl, instant),
    ).toHaveLength(100012);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(urlOf(fetchImpl, 2)).toContain("%24offset=100000");
    expect(urlOf(fetchImpl, 0)).toContain(
      "https://data.austintexas.gov/resource/6wtj-zbtb.json",
    );
    expect(urlOf(fetchImpl, 0)).toContain("%24limit=50000");
  });

  it("stops after one page when it is short", async () => {
    const fetchImpl = fakeFetch([rows(0)]);
    expect(await readAll("x", {}, fetchImpl, instant)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes the query clauses and orders by :id when no order is given", async () => {
    const fetchImpl = fakeFetch([rows(1), rows(1)]);
    await readAll(
      "x",
      { select: "a", where: "b = 'c'", group: "a" },
      fetchImpl,
      instant,
    );
    const params = new URL(urlOf(fetchImpl, 0)).searchParams;
    expect(params.get("$select")).toBe("a");
    expect(params.get("$where")).toBe("b = 'c'");
    expect(params.get("$group")).toBe("a");
    expect(params.get("$order")).toBe(":id");

    const ordered = fakeFetch([rows(1)]);
    await readAll("x", { order: "case_id" }, ordered, instant);
    expect(new URL(urlOf(ordered, 0)).searchParams.get("$order")).toBe(
      "case_id",
    );
  });

  it("retries a 429 up to three times, then succeeds", async () => {
    const fetchImpl = fakeFetch([status(429), status(429), rows(3)]);
    expect(await readAll("x", {}, fetchImpl, instant)).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("waits 1 s, 3 s, then 9 s between attempts", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchImpl = fakeFetch([
      status(503),
      status(500),
      status(429),
      rows(1),
    ]);
    await readAll("x", {}, fetchImpl, { sleep });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 3000, 9000]);
  });

  it("retries a network failure like a 5xx", async () => {
    const fetchImpl = fakeFetch([new TypeError("fetch failed"), rows(2)]);
    expect(await readAll("x", {}, fetchImpl, instant)).toHaveLength(2);
  });

  it("throws CityApiError after the fourth failure", async () => {
    const fetchImpl = fakeFetch([
      status(503),
      status(503),
      status(503),
      status(503),
    ]);
    const failure = await readAll("x", {}, fetchImpl, instant).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(CityApiError);
    expect(failure).toMatchObject({ message: expect.stringContaining("x") });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not retry a client error other than 429", async () => {
    const fetchImpl = fakeFetch([status(404)]);
    await expect(readAll("x", {}, fetchImpl, instant)).rejects.toBeInstanceOf(
      CityApiError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the app token only when SOCRATA_APP_TOKEN is set", async () => {
    vi.stubEnv("SOCRATA_APP_TOKEN", "secret-token");
    const withToken = fakeFetch([rows(1)]);
    await readAll("x", {}, withToken, instant);
    expect(headersOf(withToken, 0).get("X-App-Token")).toBe("secret-token");

    vi.stubEnv("SOCRATA_APP_TOKEN", "");
    const withoutToken = fakeFetch([rows(1)]);
    await readAll("x", {}, withoutToken, instant);
    expect(headersOf(withoutToken, 0).has("X-App-Token")).toBe(false);
  });
});
