import { describe, expect, it } from "vitest";
import parcelRows from "./fixtures/parcels.json";
import { loadApartmentParcels, toAcres } from "./parcels";

const square = (west: number, south: number, size: number): number[][] => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];

const row = (id: string, area: string, ...rings: number[][][]) => ({
  parcel_id_10: id,
  shape_area: area,
  the_geom: { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) },
});

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

describe("toAcres", () => {
  it("converts shape_area square feet to acres rounded to one decimal", () => {
    expect(toAcres(453755.49)).toBe(10.4);
  });
});

describe("loadApartmentParcels", () => {
  it("asks the land use dataset for apartment rows only", async () => {
    const { impl, urls } = fakeFetch([]);
    await loadApartmentParcels(impl);

    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/resource/7vsm-dvxg.json");
    expect(url.searchParams.get("$where")).toBe("land_use = '220'");
  });

  it("merges rows that share a parcel ID into one parcel and sums the area", async () => {
    const parcels = await loadApartmentParcels(fakeFetch(parcelRows).impl);
    const merged = parcels.find((parcel) => parcel.id === "0312130115");

    expect(parcels.map((parcel) => parcel.id)).toHaveLength(
      new Set(parcels.map((p) => p.id)).size,
    );
    expect(merged?.polygon.coordinates).toHaveLength(2);
    expect(merged?.acres).toBe(14.4);
  });

  it("puts the centroid at the mean of the largest ring and the bbox around every ring", async () => {
    const small = square(-97.0, 30.0, 0.0002);
    const large = square(-97.001, 30.001, 0.001);
    const { impl } = fakeFetch([row("0000000001", "43560", small, large)]);

    const [parcel] = await loadApartmentParcels(impl);

    expect(parcel.lon).toBeCloseTo(-97.0005, 6);
    expect(parcel.lat).toBeCloseTo(30.0015, 6);
    [-97.001, 30.0, -96.9998, 30.002].forEach((edge, i) =>
      expect(parcel.bbox[i]).toBeCloseTo(edge, 6),
    );
    expect(parcel.acres).toBe(1);
  });

  it("keeps the real parcels from the city fixture whole", async () => {
    const parcels = await loadApartmentParcels(fakeFetch(parcelRows).impl);
    const burton = parcels.find((parcel) => parcel.id === "0304070701");

    expect(parcels).toHaveLength(6);
    expect(burton?.acres).toBe(20.5);
    expect(burton?.lon).toBeCloseTo(-97.7288, 3);
    expect(burton?.lat).toBeCloseTo(30.2379, 3);
  });

  it("keeps R-prefixed Williamson County IDs and skips rows with no ID", async () => {
    const ring = square(-97, 30, 0.001);
    const { impl } = fakeFetch([
      row("R485525", "5000", ring),
      { shape_area: "5000", the_geom: row("x", "1", ring).the_geom },
      row("  ", "5000", ring),
      row("0000000002", "5000", ring),
    ]);

    const parcels = await loadApartmentParcels(impl);

    expect(parcels.map((parcel) => parcel.id)).toEqual(["R485525", "0000000002"]);
  });

  it("keeps a real R-prefixed parcel from the city fixture", async () => {
    const parcels = await loadApartmentParcels(fakeFetch(parcelRows).impl);
    expect(parcels.map((parcel) => parcel.id)).toContain("R056943");
  });
});

describe("domain types", () => {
  it("resolve through the @/ alias", async () => {
    await expect(import("@/domain/types")).resolves.toBeDefined();
  });
});
