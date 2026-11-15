import { describe, expect, it } from "vitest";
import {
  KNOWN_CITY_OUTCOMES,
  OUTCOMES,
  OUTCOME_LABEL,
  RESTATED_OUTCOME,
  classify,
  restatesOutcome,
} from "./outcomes";

describe("classify", () => {
  it.each([
    [
      {
        cityOutcome: "Closed/Duplicate Case",
        status: "Closed",
        hasViolationCase: false,
      },
      "duplicate",
    ],
    [
      {
        cityOutcome: "Closed due to Voluntary Compliance",
        status: "Closed",
        hasViolationCase: true,
      },
      "violation",
    ],
    [
      {
        cityOutcome: "Follow-up Inspection",
        status: "Active",
        hasViolationCase: true,
      },
      "violation",
    ],
    [
      {
        cityOutcome: "CV Violation(s) Found/Inspection Performed",
        status: "Active",
        hasViolationCase: false,
      },
      "violation",
    ],
    [
      {
        cityOutcome: "City-Owned Property/Violation(s) Found",
        status: "Closed",
        hasViolationCase: false,
      },
      "violation",
    ],
    [
      {
        cityOutcome: "Inspection Performed/Abated by Inspector",
        status: "Closed",
        hasViolationCase: false,
      },
      "fixed",
    ],
    [
      {
        cityOutcome: "Inspection Performed/Abated by Community Court",
        status: "Closed",
        hasViolationCase: false,
      },
      "fixed",
    ],
    [
      {
        cityOutcome: "Inspection Performed/ Voluntary Compliance",
        status: "Closed",
        hasViolationCase: false,
      },
      "fixed",
    ],
    [
      {
        cityOutcome: "No Violation(s) Found/Inspection Performed",
        status: "Closed",
        hasViolationCase: false,
      },
      "none",
    ],
    [
      {
        cityOutcome: "City-Owned Property/No Violation(s) Found",
        status: "Closed",
        hasViolationCase: false,
      },
      "none",
    ],
    [
      {
        cityOutcome: "No Violation(s) Found/Inspection Performed",
        status: "Active",
        hasViolationCase: false,
      },
      "none",
    ],
    [
      {
        cityOutcome: "Inspection Performed",
        status: "Active",
        hasViolationCase: false,
      },
      "open",
    ],
    [{ cityOutcome: null, status: "Pending", hasViolationCase: false }, "open"],
    [{ cityOutcome: null, status: "Closed", hasViolationCase: false }, "other"],
    [
      {
        cityOutcome: "Referred to Appropriate Agency",
        status: "Closed",
        hasViolationCase: false,
      },
      "other",
    ],
    [
      {
        cityOutcome: "Something the city invented yesterday",
        status: "Closed",
        hasViolationCase: false,
      },
      "other",
    ],
  ])("classifies %o as %s", (input, expected) =>
    expect(classify(input)).toBe(expected),
  );

  it("a duplicate with a violation case number is still a duplicate", () => {
    expect(
      classify({
        cityOutcome: "Closed/Duplicate Case",
        status: "Closed",
        hasViolationCase: true,
      }),
    ).toBe("duplicate");
  });

  it("never reads a violation, a clean result or a duplicate out of a phrase the city has not been seen to use", () => {
    const unseen = { status: "Closed", hasViolationCase: false };
    expect(
      classify({ ...unseen, cityOutcome: "Violation(s) Found, see notes" }),
    ).toBe("other");
    expect(
      classify({ ...unseen, cityOutcome: "No Violation(s) Found, reopened" }),
    ).toBe("other");
    expect(
      classify({ ...unseen, cityOutcome: "Closed/Duplicate Case, probably" }),
    ).toBe("other");
    expect(
      classify({
        cityOutcome: "Brand new phrase",
        status: "Active",
        hasViolationCase: true,
      }),
    ).toBe("violation");
  });

  it("matches phrases exactly apart from surrounding whitespace", () => {
    const closed = { status: "Closed", hasViolationCase: false };
    expect(
      classify({
        ...closed,
        cityOutcome: "no violation(s) found/inspection performed",
      }),
    ).toBe("other");
    expect(
      classify({
        ...closed,
        cityOutcome: "  No Violation(s) Found/Inspection Performed ",
      }),
    ).toBe("none");
  });
});

describe("outcome names", () => {
  it("lists outcomes in display order with the exact labels", () => {
    expect(OUTCOMES).toEqual(["violation", "fixed", "none", "other", "open"]);
    expect(OUTCOMES.map((o) => OUTCOME_LABEL[o])).toEqual([
      "Violation confirmed",
      "Fixed at inspection",
      "No violation found",
      "Referred or closed without a finding",
      "Still being looked into",
    ]);
  });
});

describe("KNOWN_CITY_OUTCOMES", () => {
  it("holds the 43 phrases seen on 2026-11-14, each once and already trimmed", () => {
    expect(KNOWN_CITY_OUTCOMES).toHaveLength(43);
    expect(new Set(KNOWN_CITY_OUTCOMES).size).toBe(43);
    expect(
      KNOWN_CITY_OUTCOMES.every(
        (phrase) => phrase === phrase.trim() && phrase !== "",
      ),
    ).toBe(true);
  });

  it("includes every phrase the classification rules name", () => {
    for (const phrase of [
      "Closed/Duplicate Case",
      "Closed due to Voluntary Compliance",
      "Inspection Performed/Abated by Inspector",
      "Inspection Performed/Abated by Community Court",
      "Inspection Performed/ Voluntary Compliance",
      "No Violation(s) Found/Inspection Performed",
      "City-Owned Property/No Violation(s) Found",
      "CV Violation(s) Found/Inspection Performed",
      "City-Owned Property/Violation(s) Found",
    ]) {
      expect(KNOWN_CITY_OUTCOMES).toContain(phrase);
    }
  });
});

describe("restatesOutcome", () => {
  it("says a phrase only repeats the label beside the one outcome it restates", () => {
    expect(restatesOutcome("No Violation(s) Found/Inspection Performed", "none")).toBe(true);
    expect(restatesOutcome("CV Violation(s) Found/Inspection Performed", "violation")).toBe(true);
    expect(restatesOutcome("Inspection Performed/Abated by Inspector", "fixed")).toBe(true);
  });

  it("keeps a phrase that contradicts its label, as when a case number confirms a violation the phrase says was not found", () => {
    // 9024 Northgate Blvd, Building condition, opened 2026-03-02: case 2026 024695-CV, phrase "No Violation(s) Found".
    expect(
      classify({
        cityOutcome: "No Violation(s) Found/Inspection Performed",
        status: "Closed",
        hasViolationCase: true,
      }),
    ).toBe("violation");
    expect(restatesOutcome("No Violation(s) Found/Inspection Performed", "violation")).toBe(false);
  });

  it("keeps every phrase that adds something to its label", () => {
    expect(restatesOutcome("Closed due to Voluntary Compliance", "violation")).toBe(false);
    expect(restatesOutcome("Inspection Performed/Abated by Community Court", "fixed")).toBe(false);
    expect(restatesOutcome("City-Owned Property/No Violation(s) Found", "none")).toBe(false);
  });

  it("names only phrases on the allow-list", () => {
    for (const phrase of RESTATED_OUTCOME.keys()) {
      expect(KNOWN_CITY_OUTCOMES).toContain(phrase);
    }
  });
});
