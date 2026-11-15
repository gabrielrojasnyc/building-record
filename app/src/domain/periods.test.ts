import { describe, expect, it } from "vitest";
import { PERIODS, PERIOD_LABEL, PERIOD_PHRASE, periodStarts } from "./periods";

describe("periodStarts", () => {
  it("starts each period on the same day N years back", () => {
    expect(periodStarts("2026-11-14")).toEqual({
      m12: "2025-11-14",
      y2: "2024-11-14",
      y3: "2023-11-14",
    });
  });

  it("steps back from 29 February", () => {
    expect(periodStarts("2028-02-29").m12).toBe("2027-02-28");
  });

  it("steps back from 29 February to 28 February in all three periods", () => {
    expect(periodStarts("2032-02-29")).toEqual({
      m12: "2031-02-28",
      y2: "2030-02-28",
      y3: "2029-02-28",
    });
    expect(periodStarts("2036-02-29").y3).toBe("2033-02-28");
  });
});

describe("period names", () => {
  it("lists the periods shortest first, each with a label and a phrase", () => {
    expect(PERIODS).toEqual(["m12", "y2", "y3"]);
    expect(PERIODS.map((p) => PERIOD_LABEL[p])).toEqual([
      "12 months",
      "2 years",
      "3 years",
    ]);
    expect(PERIODS.map((p) => PERIOD_PHRASE[p])).toEqual([
      "in the last 12 months",
      "in the last 2 years",
      "in the last 3 years",
    ]);
  });
});
