import { describe, expect, it, vi } from "vitest";
import { load311Summary } from "./requests311";

const BOX: [number, number, number, number] = [
  -97.73, 30.2365, -97.7265, 30.2395,
];

function fakeFetch(reply: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const urlOf = (fetchImpl: ReturnType<typeof fakeFetch>, call: number): string =>
  String(fetchImpl.mock.calls[call][0]);

describe("load311Summary", () => {
  it("queries 311 by the parcel box and the history start date", async () => {
    const fetchImpl = fakeFetch(json([]));
    await load311Summary(BOX, fetchImpl);

    const url = decodeURIComponent(urlOf(fetchImpl, 0));
    expect(url).toContain(
      "https://data.austintexas.gov/resource/xwdj-i9he.json?",
    );
    expect(url).toContain(
      "within_box(sr_location_lat_long, 30.2395, -97.73, 30.2365, -97.7265)",
    );
    expect(url).toContain("sr_created_date >= '2023-11-01'");
  });

  it("asks the city for the six most frequent request types, counted", async () => {
    const fetchImpl = fakeFetch(json([]));
    await load311Summary(BOX, fetchImpl);

    const params = new URL(urlOf(fetchImpl, 0)).searchParams;
    expect(params.get("$select")).toBe("sr_type_desc, count(*) as count");
    expect(params.get("$group")).toBe("sr_type_desc");
    expect(params.get("$order")).toBe("count DESC");
    expect(params.get("$limit")).toBe("6");
  });

  it("returns each type with its count as a number", async () => {
    const fetchImpl = fakeFetch(
      json([
        { sr_type_desc: "DSD - Request Code Officer", count: "262" },
        { sr_type_desc: "APD - Non Emergency Noise/Alarm", count: "63" },
      ]),
    );

    expect(await load311Summary(BOX, fetchImpl)).toEqual([
      { type: "DSD - Request Code Officer", count: 262 },
      { type: "APD - Non Emergency Noise/Alarm", count: 63 },
    ]);
  });

  it("labels a group the city returns with no request type as Unspecified", async () => {
    const fetchImpl = fakeFetch(json([{ count: "4" }, { sr_type_desc: "", count: "2" }]));
    expect(await load311Summary(BOX, fetchImpl)).toEqual([
      { type: "Unspecified", count: 4 },
      { type: "Unspecified", count: 2 },
    ]);
  });

  it("rejects when the city answers with an error status", async () => {
    const fetchImpl = fakeFetch(json({ message: "busy" }, 503));
    await expect(load311Summary(BOX, fetchImpl)).rejects.toThrow("503");
  });

  it("rejects when the network fails", async () => {
    const fetchImpl = fakeFetch(new TypeError("Failed to fetch"));
    await expect(load311Summary(BOX, fetchImpl)).rejects.toThrow(
      "Failed to fetch",
    );
  });
});
