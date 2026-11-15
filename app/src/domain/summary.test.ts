import { describe, expect, it } from "vitest";
import type { Period } from "./periods";
import {
  pestSentence,
  recordedSentence,
  spreadSentence,
  summarize,
} from "./summary";
import type { Complex, RecordedProblems, Tally } from "./types";

/** A complex with these tallies. A period left out has no complaints. */
function complex(
  tally: Partial<Record<Period, Tally>>,
  overrides: Partial<Complex> = {},
): Complex {
  return {
    id: "0243100107",
    parcelIds: ["0243100107"],
    address: "9001 Northgate Blvd",
    name: null,
    lon: -97.7,
    lat: 30.36,
    acres: 13.2,
    open: 0,
    repeatOffender: null,
    tally: { m12: {}, y2: {}, y3: {}, ...tally },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    ...overrides,
  };
}

/** The same complaints in every period: all of them fall in the last 12 months. */
const recent = (tally: Tally, overrides: Partial<Complex> = {}) =>
  complex({ m12: tally, y2: tally, y3: tally }, overrides);

describe("summarize", () => {
  // Avalon Palms Apartments as the city's data had it on November 15, 2026.
  const busy = complex(
    {
      m12: {
        structure: { violation: 36, none: 38, other: 4 },
        property: { violation: 1, none: 2 },
        landuse: { none: 1 },
      },
      y2: {
        structure: { violation: 39, none: 66, other: 4 },
        property: { violation: 1, none: 8, other: 3 },
        landuse: { none: 1 },
      },
      y3: {
        structure: { violation: 46, none: 78, other: 5, fixed: 1 },
        property: { violation: 2, none: 11, other: 2 },
        landuse: { none: 1 },
      },
    },
    { violationsOpen: 5 },
  );

  it("says a busy record in four sentences", () => {
    expect(summarize(busy, "m12")).toEqual({
      total: 82,
      trend: "Up from 40 in the 12 months before.",
      found: "The city confirmed a violation in 37 of them.",
      stillOpen: "5 confirmed violations from the last 3 years are still open.",
      about: "78 of the 82 were about building condition.",
    });
  });

  it("follows the period, and for a longer one says how much of it is recent", () => {
    expect(summarize(busy, "y2")).toMatchObject({
      total: 122,
      trend: "82 of them in the last 12 months.",
      found: "The city confirmed a violation in 40 of them.",
      about: "109 of the 122 were about building condition.",
    });
    expect(summarize(busy, "y3")).toMatchObject({
      total: 146,
      trend: "82 of them in the last 12 months.",
      found: "The city confirmed a violation in 48 of them.",
    });
  });

  describe("the trend", () => {
    const counts = (m12: number, y2: number, y3: number) =>
      complex({
        m12: m12 ? { structure: { none: m12 } } : {},
        y2: y2 ? { structure: { none: y2 } } : {},
        y3: y3 ? { structure: { none: y3 } } : {},
      });

    it.each([
      [counts(10, 185, 246), "Down from 175 in the 12 months before."],
      [counts(7, 14, 20), "The same number as in the 12 months before."],
      [counts(2, 2, 2), "There were none in the 12 months before."],
      [counts(0, 13, 29), "There were 29 in the 2 years before that."],
      [counts(0, 0, 1), "There was 1 in the 2 years before that."],
      [counts(0, 0, 0), "None in the last 3 years either."],
    ])("of the last 12 months: %#", (record, sentence) => {
      expect(summarize(record, "m12").trend).toBe(sentence);
    });

    it.each([
      [counts(0, 13, 29), "y2", "None of them in the last 12 months."],
      [counts(2, 2, 2), "y2", "All of them in the last 12 months."],
      [counts(1, 1, 1), "y3", "It was in the last 12 months."],
      [counts(0, 0, 4), "y2", "There were 4 in the year before that."],
      [counts(0, 0, 1), "y2", "There was 1 in the year before that."],
      [counts(0, 0, 0), "y2", "None in the last 3 years either."],
      [counts(0, 0, 0), "y3", null],
    ] as const)("of a longer period: %#", (record, period, sentence) => {
      expect(summarize(record, period).trend).toBe(sentence);
    });

    it("writes a large count with its thousands separator", () => {
      expect(summarize(counts(10, 1244, 1300), "m12").trend).toBe(
        "Down from 1,234 in the 12 months before.",
      );
    });
  });

  describe("what the city found", () => {
    it.each([
      [{ violation: 1 }, "The city confirmed a violation."],
      [{ fixed: 1 }, "It was fixed at inspection."],
      [{ none: 1 }, "The city found no violation."],
      [{ other: 1 }, "It was referred or closed without a finding."],
      [{ open: 1 }, "The city is still looking into it."],
      [{ violation: 2 }, "The city confirmed a violation in both."],
      [{ violation: 12 }, "The city confirmed a violation in all 12."],
      [
        { violation: 1, none: 3 },
        "The city confirmed a violation in one of them.",
      ],
      [
        { violation: 1, open: 1 },
        "The city confirmed a violation in one of them and is still looking into the other.",
      ],
      [
        { violation: 9, none: 2, open: 1 },
        "The city confirmed a violation in 9 of them and is still looking into one.",
      ],
      [
        { violation: 9, none: 2, open: 3 },
        "The city confirmed a violation in 9 of them and is still looking into 3.",
      ],
      [{ none: 4 }, "The city found no violation in any of them."],
      [{ open: 2 }, "The city is still looking into both."],
      [{ open: 5 }, "The city is still looking into all 5."],
      [
        { none: 2, open: 1 },
        "The city has not confirmed a violation in any of them. 1 is still being looked into.",
      ],
      [
        { fixed: 1, open: 2 },
        "The city has not confirmed a violation in any of them. 2 are still being looked into.",
      ],
      [
        { none: 2, other: 1, fixed: 1 },
        "The city did not confirm a violation in any of them.",
      ],
    ])("%j", (outcomes, sentence) => {
      expect(summarize(recent({ structure: outcomes }), "m12").found).toBe(
        sentence,
      );
    });

    it("counts every type together", () => {
      const mixed = recent({
        structure: { violation: 2 },
        property: { violation: 1, none: 1 },
      });
      expect(summarize(mixed, "m12").found).toBe(
        "The city confirmed a violation in 3 of them.",
      );
    });

    it("says so when every report in the period was closed as a duplicate, and nothing when there were none", () => {
      const duplicated = (count: number) =>
        complex({}, { duplicates: { m12: count, y2: count, y3: count } });
      expect(summarize(duplicated(4), "m12").found).toBe(
        "The city closed 4 reports in this period as duplicates of other complaints.",
      );
      expect(summarize(duplicated(1), "m12").found).toBe(
        "The city closed 1 report in this period as a duplicate of another complaint.",
      );
      expect(summarize(complex({}), "m12").found).toBeNull();
    });
  });

  describe("what is still open", () => {
    const confirmed = { structure: { violation: 3 } };

    it("counts the last 3 years whatever the period, so an older open violation is not lost", () => {
      const quietYear = complex({ y3: confirmed }, { violationsOpen: 2 });
      for (const period of ["m12", "y2", "y3"] as const) {
        expect(summarize(quietYear, period).stillOpen).toBe(
          "2 confirmed violations from the last 3 years are still open.",
        );
      }
    });

    it("speaks of one in the singular", () => {
      expect(
        summarize(complex({ y3: confirmed }, { violationsOpen: 1 }), "m12")
          .stillOpen,
      ).toBe("1 confirmed violation from the last 3 years is still open.");
    });

    it("says none is open when violations were confirmed, and nothing when none ever were", () => {
      expect(summarize(complex({ y3: confirmed }), "m12").stillOpen).toBe(
        "No confirmed violation from the last 3 years is still open.",
      );
      expect(
        summarize(recent({ structure: { none: 3 } }), "m12").stillOpen,
      ).toBeNull();
    });
  });

  describe("what the complaints were about", () => {
    it.each([
      [{ property: { none: 1 } }, "It was about trash and grounds."],
      [{ structure: { none: 2 } }, "Both were about building condition."],
      [{ permit: { open: 3 } }, "All 3 were about work without a permit."],
      [
        { landuse: { none: 3 }, structure: { none: 1 } },
        "3 of the 4 were about signs, zoning and use.",
      ],
      [
        { property: { none: 2 }, structure: { none: 2 } },
        "2 of the 4 were about building condition, and 2 about trash and grounds.",
      ],
      [
        { property: { none: 1 }, structure: { none: 1 } },
        "1 of the 2 was about building condition, and 1 about trash and grounds.",
      ],
      [
        { permit: { open: 1 }, landuse: { none: 1 }, property: { none: 1 } },
        "1 of the 3 was about trash and grounds, and 1 about signs, zoning and use.",
      ],
    ])("%j", (tally, sentence) => {
      expect(summarize(recent(tally), "m12").about).toBe(sentence);
    });

    it("turns to the last 3 years when the period has none, and says so", () => {
      const earlier = (tally: Tally) => complex({ y3: tally });
      expect(
        summarize(
          earlier({ structure: { violation: 25 }, property: { none: 4 } }),
          "m12",
        ).about,
      ).toBe("25 of the 29 in the last 3 years were about building condition.");
      expect(summarize(earlier({ property: { none: 1 } }), "m12").about).toBe(
        "The one in the last 3 years was about trash and grounds.",
      );
      expect(summarize(earlier({ property: { none: 2 } }), "y2").about).toBe(
        "Both in the last 3 years were about trash and grounds.",
      );
      expect(summarize(earlier({ property: { none: 5 } }), "m12").about).toBe(
        "All 5 in the last 3 years were about trash and grounds.",
      );
      expect(
        summarize(
          earlier({ property: { none: 1 }, structure: { none: 1 } }),
          "m12",
        ).about,
      ).toBe(
        "1 of the 2 in the last 3 years was about building condition, and 1 about trash and grounds.",
      );
    });

    it("says nothing for a building with no complaints in 3 years", () => {
      expect(summarize(complex({}), "m12")).toEqual({
        total: 0,
        trend: "None in the last 3 years either.",
        found: null,
        stillOpen: null,
        about: null,
      });
    });
  });

  it("never uses a word that scores or ranks a building", () => {
    const records = [
      busy,
      complex({}),
      complex({ y3: { structure: { violation: 3 } } }, { violationsOpen: 3 }),
      recent({ property: { none: 2, open: 1 } }),
      complex({}, { duplicates: { m12: 2, y2: 2, y3: 2 } }),
    ];
    for (const record of records) {
      for (const period of ["m12", "y2", "y3"] as const) {
        const { total, ...sentences } = summarize(record, period);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(Object.values(sentences).join(" ")).not.toMatch(
          /score|grade|rating|rank|worst|best|worse|better|good|bad|safe|danger/i,
        );
      }
    }
  });
});

const recorded = (
  families: RecordedProblems["families"],
  pests: RecordedProblems["pests"] = {},
): RecordedProblems => ({ families, pests });

describe("recordedSentence", () => {
  const counts = (
    ...families: [RecordedProblems["families"][number]["family"], number][]
  ) =>
    recorded(
      families.map(([family, count]) => ({ family, count, notCleared: 0 })),
    );

  it("names the three families recorded most, then the total and how many are not cleared", () => {
    expect(
      recordedSentence(
        recorded([
          { family: "electrical", count: 16, notCleared: 0 },
          { family: "exterior", count: 12, notCleared: 0 },
          { family: "plumbing", count: 11, notCleared: 2 },
          { family: "stairs", count: 9, notCleared: 0 },
          { family: "fire", count: 2, notCleared: 1 },
        ]),
      ),
    ).toBe(
      "Recorded most often: electrical and lighting (16), outside walls and roof (12), plumbing and water (11). 50 problems in the last 3 years, 3 not cleared.",
    );
  });

  it("names a family that ties with the third as well, so none it names was recorded less than one it leaves out", () => {
    expect(
      recordedSentence(
        counts(
          ["electrical", 16],
          ["exterior", 12],
          ["plumbing", 11],
          ["stairs", 11],
          ["vents", 7],
        ),
      ),
    ).toBe(
      "Recorded most often: electrical and lighting (16), outside walls and roof (12), plumbing and water (11), stairs and railings (11). 57 problems in the last 3 years.",
    );
  });

  it("stops before a tie too wide to name, and names no family when all of them tie", () => {
    expect(
      recordedSentence(
        counts(
          ["electrical", 5],
          ["exterior", 1],
          ["plumbing", 1],
          ["stairs", 1],
          ["openings", 1],
          ["grounds", 1],
          ["trash", 1],
        ),
      ),
    ).toBe(
      "Recorded most often: electrical and lighting (5). 11 problems in the last 3 years.",
    );
    expect(
      recordedSentence(
        recorded([
          { family: "electrical", count: 1, notCleared: 1 },
          { family: "exterior", count: 1, notCleared: 0 },
          { family: "plumbing", count: 1, notCleared: 0 },
          { family: "stairs", count: 1, notCleared: 0 },
          { family: "openings", count: 1, notCleared: 0 },
          { family: "grounds", count: 1, notCleared: 0 },
        ]),
      ),
    ).toBe("6 problems recorded in the last 3 years, of 6 kinds, 1 not cleared.");
  });

  it("names every family when there are three or fewer", () => {
    expect(recordedSentence(counts(["pests", 1]))).toBe(
      "Recorded most often: pests (1). 1 problem in the last 3 years.",
    );
    expect(recordedSentence(counts(["signs", 2], ["fire", 2]))).toBe(
      "Recorded most often: required signs (2), fire safety (2). 4 problems in the last 3 years.",
    );
  });

  it("counts the kinds it has no plain name for like any other, as other kinds", () => {
    expect(recordedSentence(counts(["other", 9], ["signs", 2]))).toBe(
      "Recorded most often: other kinds (9), required signs (2). 11 problems in the last 3 years.",
    );
  });

  it("writes large counts with their thousands separator", () => {
    expect(
      recordedSentence(
        recorded([{ family: "electrical", count: 1234, notCleared: 1001 }]),
      ),
    ).toBe(
      "Recorded most often: electrical and lighting (1,234). 1,234 problems in the last 3 years, 1,001 not cleared.",
    );
  });
});

describe("pestSentence", () => {
  const pests = (count: number) => [
    { family: "electrical" as const, count: 4, notCleared: 0 },
    { family: "pests" as const, count, notCleared: 0 },
  ];

  it("says nothing when no pest problem was recorded", () => {
    expect(
      pestSentence(
        recorded([{ family: "electrical", count: 4, notCleared: 0 }]),
      ),
    ).toBeNull();
  });

  it("names the pests the notes name, the most named first", () => {
    expect(
      pestSentence(recorded(pests(9), { rodents: 2, roaches: 5, bedBugs: 1 })),
    ).toBe(
      "Pests were recorded 9 times. The city's notes name roaches, rodents and bed bugs.",
    );
    expect(pestSentence(recorded(pests(1), { wasps: 1 }))).toBe(
      "Pests were recorded 1 time. The city's notes name wasps or bees.",
    );
  });

  it("keeps the catch-all last, as other insects after a named insect and insects otherwise", () => {
    expect(pestSentence(recorded(pests(4), { insects: 3, roaches: 1 }))).toBe(
      "Pests were recorded 4 times. The city's notes name roaches and other insects.",
    );
    expect(pestSentence(recorded(pests(2), { insects: 2, rodents: 1 }))).toBe(
      "Pests were recorded 2 times. The city's notes name rodents and insects.",
    );
    expect(pestSentence(recorded(pests(1), { insects: 1 }))).toBe(
      "Pests were recorded 1 time. The city's notes name insects.",
    );
  });

  it("says the kind could not be read when no note gives this site a name", () => {
    // Not "the notes do not say": this site reads only the words it is sure of, and can miss one.
    expect(pestSentence(recorded(pests(3)))).toBe(
      "Pests were recorded 3 times. The kind could not be read from the city's notes.",
    );
  });
});

describe("spreadSentence", () => {
  it("says how the city's counts spread in the period, without placing any building in it", () => {
    expect(spreadSentence({ noneShare: 0.52, nineInTen: 5 }, "m12")).toBe(
      "Across Austin, 52% of apartment complexes had no complaints in the last 12 months, and 9 in 10 had 5 or fewer.",
    );
    expect(spreadSentence({ noneShare: 0.35, nineInTen: 14 }, "y3")).toBe(
      "Across Austin, 35% of apartment complexes had no complaints in the last 3 years, and 9 in 10 had 14 or fewer.",
    );
  });

  it("says only the share with none when nine in ten had none", () => {
    expect(spreadSentence({ noneShare: 0.93, nineInTen: 0 }, "m12")).toBe(
      "Across Austin, 93% of apartment complexes had no complaints in the last 12 months.",
    );
  });

  it("says only the nine in ten when the share with none rounds to nothing", () => {
    expect(spreadSentence({ noneShare: 0.004, nineInTen: 12 }, "y2")).toBe(
      "Across Austin, 9 in 10 apartment complexes had 12 or fewer complaints in the last 2 years.",
    );
  });
});
