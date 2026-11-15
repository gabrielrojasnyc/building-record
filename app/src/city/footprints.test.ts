import { describe, expect, it, vi } from "vitest";
import type { Outline } from "@/domain/types";
import {
  FALLBACK_HEIGHT_M,
  heightInMetres,
  loadFootprints,
} from "./footprints";

const outline: Outline = [
  [
    [
      [-97.73, 30.236],
      [-97.725, 30.236],
      [-97.725, 30.24],
      [-97.73, 30.24],
      [-97.73, 30.236],
    ],
  ],
];

function square(west: number, south: number, size = 0.0004) {
  const east = west + size;
  const north = south + size;
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

const inside = square(-97.728, 30.238);
const outside = square(-97.7, 30.3);

function fakeCity(rows: unknown[]) {
  return vi.fn<typeof fetch>(async () => Response.json(rows));
}

const urlOf = (fetchImpl: ReturnType<typeof fakeCity>, call: number) =>
  String(fetchImpl.mock.calls[call][0]);

describe("heightInMetres", () => {
  it("converts feet to metres and falls back for the sentinel, zero and absurd values", () => {
    expect(heightInMetres("24.43")).toBeCloseTo(7.446, 2);
    for (const bad of ["-9999999999", "0", "4", "900", undefined, "tall"]) {
      expect(heightInMetres(bad)).toBe(FALLBACK_HEIGHT_M);
    }
    expect(FALLBACK_HEIGHT_M).toBe(9);
  });
});

describe("loadFootprints", () => {
  it("keeps only footprints whose center is inside the outline", async () => {
    const fetchImpl = fakeCity([
      { the_geom: inside, max_height: "20" },
      { the_geom: outside, max_height: "30" },
    ]);
    const shapes = await loadFootprints(outline, fetchImpl);
    expect(shapes.features).toHaveLength(1);
    expect(shapes.features[0].geometry).toEqual(inside);
    expect(shapes.features[0].properties.h).toBeCloseTo(6.096, 3);
  });

  it("reads a MultiPolygon by the outer ring of its first polygon and skips rows with no geometry", async () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [inside.coordinates, outside.coordinates],
    };
    const fetchImpl = fakeCity([
      { the_geom: multi, max_height: "-9999999999" },
      { max_height: "20" },
    ]);
    const shapes = await loadFootprints(outline, fetchImpl);
    expect(shapes.features).toHaveLength(1);
    expect(shapes.features[0].properties.h).toBe(FALLBACK_HEIGHT_M);
  });

  it("asks the city for the outline box and never for more than it needs", async () => {
    const fetchImpl = fakeCity([]);
    await loadFootprints(outline, fetchImpl);
    const url = decodeURIComponent(urlOf(fetchImpl, 0));
    expect(url).toContain(
      "https://data.austintexas.gov/resource/3qcc-8uhz.json",
    );
    expect(url).toContain("$select=the_geom,max_height");
    expect(url).toContain(
      "within_box(the_geom, 30.24, -97.73, 30.236, -97.725)",
    );
    expect(url).toContain("$limit=3000");
    expect(fetchImpl.mock.calls[0][1]).toEqual({
      signal: expect.any(AbortSignal),
    });
  });

  it("gives up on a city that has not answered after 4 seconds, and aborts the request, so the map can fall back", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const neverAnswers = vi.fn<typeof fetch>((_input, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      });
      let settled: "pending" | "rejected" = "pending";
      const loading = loadFootprints(outline, neverAnswers).catch(
        (error: Error) => {
          settled = "rejected";
          return error;
        },
      );

      await vi.advanceTimersByTimeAsync(3_999);
      expect(settled).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe("rejected");
      expect(await loading).toMatchObject({
        message: expect.stringMatching(/4 seconds/),
      });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a body that stops arriving too", async () => {
    vi.useFakeTimers();
    try {
      const stalls = vi.fn<typeof fetch>(
        async () =>
          ({
            ok: true,
            json: () => new Promise(() => {}),
          }) as unknown as Response,
      );
      const loading = loadFootprints(outline, stalls);
      const expectation = expect(loading).rejects.toThrow(/4 seconds/);
      await vi.advanceTimersByTimeAsync(4_000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the city answers with an error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("no", { status: 503 }),
    );
    await expect(loadFootprints(outline, fetchImpl)).rejects.toThrow("503");
  });

  it("rejects when the city cannot be reached", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(loadFootprints(outline, fetchImpl)).rejects.toThrow(
      "Failed to fetch",
    );
  });
});
