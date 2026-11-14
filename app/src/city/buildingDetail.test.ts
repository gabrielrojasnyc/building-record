import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildingDetail } from "@/domain/types";
import { forgetBuildingDetails, loadBuildingDetail } from "./buildingDetail";

const detail = { id: "0307050309" } as unknown as BuildingDetail;

beforeEach(forgetBuildingDetails);

describe("loadBuildingDetail", () => {
  it("shares one request between two callers and between later calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(detail));
    const [first, second] = await Promise.all([
      loadBuildingDetail("0307050309", fetchImpl),
      loadBuildingDetail("0307050309", fetchImpl),
    ]);
    expect(first).toEqual(detail);
    expect(second).toBe(first);
    await loadBuildingDetail("0307050309", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/data/buildings/0307050309.json");
  });

  it("keeps different buildings apart", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(detail));
    await loadBuildingDetail("a", fetchImpl);
    await loadBuildingDetail("b", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries after a failure instead of remembering it", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("gone", { status: 404 }))
      .mockResolvedValueOnce(Response.json(detail));
    await expect(loadBuildingDetail("x", fetchImpl)).rejects.toThrow("404");
    await expect(loadBuildingDetail("x", fetchImpl)).resolves.toEqual(detail);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries after a network failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(detail));
    await expect(loadBuildingDetail("y", fetchImpl)).rejects.toThrow("Failed to fetch");
    await expect(loadBuildingDetail("y", fetchImpl)).resolves.toEqual(detail);
  });
});
