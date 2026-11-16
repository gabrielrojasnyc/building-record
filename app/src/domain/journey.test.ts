import { describe, expect, it } from "vitest";
import { recordWith, trace, type Followed } from "./journey";
import { countFor, DEFAULT_VIEW } from "./query";
import { summarize } from "./summary";

const STARTS = { m12: "2025-11-15", y2: "2024-11-15", y3: "2023-11-15" };
const PULLED = "2026-11-15";

const followed = (overrides: Partial<Followed> = {}): Followed => ({
  category: "structure",
  place: "apartments",
  phrase: "CV Violation(s) Found/Inspection Performed",
  hasViolationCase: false,
  closed: true,
  opened: "2026-06-01",
  ...overrides,
});

const traced = (overrides: Partial<Followed> = {}) =>
  trace(followed(overrides), STARTS, PULLED);

describe("trace", () => {
  it("decides the outcome with the first rule that fits, and says which rule that was", () => {
    expect(traced({ phrase: "Closed/Duplicate Case" })).toMatchObject({
      outcome: "duplicate",
      rule: 1,
    });
    expect(traced()).toMatchObject({ outcome: "violation", rule: 2 });
    expect(
      traced({ phrase: "Inspection Performed/Abated by Inspector" }),
    ).toMatchObject({ outcome: "fixed", rule: 3 });
    expect(
      traced({ phrase: "No Violation(s) Found/Inspection Performed" }),
    ).toMatchObject({ outcome: "none", rule: 4 });
    expect(
      traced({ phrase: "Investigation in Progress", closed: false }),
    ).toMatchObject({ outcome: "open", rule: 5 });
    expect(traced({ phrase: "Referred to Appropriate Agency" })).toMatchObject({
      outcome: "other",
      rule: 6,
    });
  });

  it("calls any complaint with a violation case a confirmed violation, whatever the phrase says", () => {
    expect(
      traced({
        phrase: "No Violation(s) Found/Inspection Performed",
        hasViolationCase: true,
      }),
    ).toMatchObject({ outcome: "violation", rule: 2 });
    // But a duplicate is a duplicate first.
    expect(
      traced({ phrase: "Closed/Duplicate Case", hasViolationCase: true }),
    ).toMatchObject({ outcome: "duplicate", rule: 1 });
  });

  it("counts a complaint in every period it was opened in, the first day included", () => {
    expect(traced({ opened: "2026-06-01" }).periods).toEqual([
      "m12",
      "y2",
      "y3",
    ]);
    expect(traced({ opened: "2025-11-15" }).periods).toEqual([
      "m12",
      "y2",
      "y3",
    ]);
    expect(traced({ opened: "2025-11-14" }).periods).toEqual(["y2", "y3"]);
    expect(traced({ opened: "2024-01-10" }).periods).toEqual(["y3"]);
    expect(traced({ opened: "2023-11-14" }).periods).toEqual([]);
    // Nothing opened after the pull is counted.
    expect(traced({ opened: "2026-11-16" }).periods).toEqual([]);
  });

  it("says why a complaint is in no count, by the first reason it meets along the way", () => {
    expect(traced().leftOut).toBeNull();
    expect(traced({ place: "nowhere" }).leftOut).toBe("no parcel");
    expect(traced({ place: "elsewhere" }).leftOut).toBe("not apartments");
    expect(traced({ phrase: "Closed/Duplicate Case" }).leftOut).toBe(
      "duplicate",
    );
    expect(traced({ opened: "2023-01-01" }).leftOut).toBe("too old");
    expect(
      traced({ place: "nowhere", phrase: "Closed/Duplicate Case" }).leftOut,
    ).toBe("no parcel");
  });
});

describe("recordWith", () => {
  const total = (complaint: Followed, included = true) =>
    countFor(
      recordWith(complaint, trace(complaint, STARTS, PULLED), included),
      {
        ...DEFAULT_VIEW,
        period: "m12",
      },
    );

  it("adds the complaint to the example building's five, under its type and outcome, in each of its periods", () => {
    const complaint = followed({ category: "property" });
    const record = recordWith(complaint, trace(complaint, STARTS, PULLED));
    expect(record.tally.m12).toEqual({
      structure: { violation: 3, none: 2 },
      property: { violation: 1 },
    });
    expect(record.tally.y3.property).toEqual({ none: 1, violation: 1 });
    expect(total(complaint)).toBe(6);
  });

  it("leaves it out of a period it was not opened in", () => {
    const older = followed({ opened: "2025-03-01" });
    const record = recordWith(older, trace(older, STARTS, PULLED));
    expect(record.tally.m12.structure).toEqual({ violation: 3, none: 2 });
    expect(record.tally.y2.structure).toEqual({ violation: 4, none: 4 });
  });

  it("leaves a complaint that is not counted, or one taken out, out of the record altogether", () => {
    expect(total(followed({ phrase: "Closed/Duplicate Case" }))).toBe(5);
    expect(total(followed({ place: "nowhere" }))).toBe(5);
    expect(total(followed(), false)).toBe(5);
  });

  it("counts a confirmed violation the city has not closed among those still open", () => {
    const open = followed({ closed: false });
    expect(recordWith(open, trace(open, STARTS, PULLED)).violationsOpen).toBe(
      2,
    );
    expect(
      recordWith(followed(), trace(followed(), STARTS, PULLED)).violationsOpen,
    ).toBe(1);
  });

  it("gives a record the site's own sentences can be said of", () => {
    const complaint = followed();
    const record = recordWith(complaint, trace(complaint, STARTS, PULLED));
    expect(summarize(record, "m12")).toEqual({
      total: 6,
      trend: "Up from 2 in the 12 months before.",
      found: "The city confirmed a violation in 4 of them.",
      stillOpen: "1 confirmed violation from the last 3 years is still open.",
      about: "All 6 were about building condition.",
    });
  });
});
