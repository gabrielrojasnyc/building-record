import { describe, expect, it } from "vitest";
import { aerialPhotoUrl } from "./aerialPhoto";

const BOX: [number, number, number, number] = [-97.73, 30.236, -97.725, 30.24];

function parse(url: string) {
  const parsed = new URL(url);
  const bbox = parsed.searchParams.get("bbox")!.split(",").map(Number);
  return { parsed, bbox: bbox as [number, number, number, number] };
}

describe("aerialPhotoUrl", () => {
  it("asks the City of Austin's 2025 aerial imagery for a jpg in the fixed form", () => {
    const { parsed } = parse(aerialPhotoUrl(BOX, 744, 400));
    expect(parsed.origin + parsed.pathname).toBe(
      "https://maps.austintexas.gov/image/rest/services/AerialMosaics/Aerials2025/ImageServer/exportImage",
    );
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
      bboxSR: "4326",
      imageSR: "3857",
      size: "744,400",
      format: "jpg",
      f: "image",
    });
  });

  for (const [width, height] of [[744, 400], [400, 744], [500, 500]]) {
    it(`frames the photo on the box at the ${width} by ${height} image aspect`, () => {
      const { bbox } = parse(aerialPhotoUrl(BOX, width, height));
      const [west, south, east, north] = bbox;
      expect(west).toBeLessThanOrEqual(BOX[0]);
      expect(south).toBeLessThanOrEqual(BOX[1]);
      expect(east).toBeGreaterThanOrEqual(BOX[2]);
      expect(north).toBeGreaterThanOrEqual(BOX[3]);

      const centerLat = (BOX[1] + BOX[3]) / 2;
      const ratio = ((east - west) * Math.cos((centerLat * Math.PI) / 180)) / (north - south);
      expect(Math.abs(ratio / (width / height) - 1)).toBeLessThan(0.01);
    });
  }

  it("pads the longer dimension by 30% and stays centered on the box", () => {
    const { bbox } = parse(aerialPhotoUrl(BOX, 744, 400));
    const [west, south, east, north] = bbox;
    expect((west + east) / 2).toBeCloseTo((BOX[0] + BOX[2]) / 2, 5);
    expect((south + north) / 2).toBeCloseTo((BOX[1] + BOX[3]) / 2, 5);
  });
});
