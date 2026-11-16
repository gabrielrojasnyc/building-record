import { classify, type Outcome } from "./outcomes";
import { PERIODS, type Period } from "./periods";
import type { Category, Complex, Meta, Tally } from "./types";

/** Where the parcel number on the city's record puts a complaint. */
export type Place = "apartments" | "elsewhere" | "nowhere";

/** One complaint as the method page lets a reader set it, to follow it from the city's file to a record. */
export interface Followed {
  category: Category;
  place: Place;
  /** The city's outcome phrase, one of those it is known to use. */
  phrase: string;
  /** The city opened a formal violation case for it. */
  hasViolationCase: boolean;
  /** The city has marked the complaint Closed. */
  closed: boolean;
  /** The day the city opened it, YYYY-MM-DD. */
  opened: string;
}

/** Why a complaint is in no count, in the order the reasons are met along the way. */
export type LeftOut = "no parcel" | "not apartments" | "duplicate" | "too old";

/** What following a complaint finds: how the city left it, when it counts, and whether it counts at all. */
export interface Traced {
  outcome: Outcome | "duplicate";
  /** Which of the six rules decided the outcome, 1 to 6, in the order the site applies them. */
  rule: number;
  /** The periods it was opened in, shortest first. */
  periods: Period[];
  /** Why it is in no count, or null when it is counted. */
  leftOut: LeftOut | null;
}

/** The outcomes in the order their rules run: the first rule that fits decides. */
const RULE_ORDER: Traced["outcome"][] = [
  "duplicate",
  "violation",
  "fixed",
  "none",
  "open",
  "other",
];

/** Follows a complaint with the same rules the build applies to every complaint the city publishes. */
export function trace(
  followed: Followed,
  periodStarts: Meta["periodStarts"],
  pulledAt: string,
): Traced {
  const outcome = classify({
    cityOutcome: followed.phrase,
    status: followed.closed ? "Closed" : "Active",
    hasViolationCase: followed.hasViolationCase,
  });
  const periods = PERIODS.filter(
    (period) =>
      followed.opened >= periodStarts[period] && followed.opened <= pulledAt,
  );
  const leftOut: LeftOut | null =
    followed.place === "nowhere"
      ? "no parcel"
      : followed.place === "elsewhere"
        ? "not apartments"
        : outcome === "duplicate"
          ? "duplicate"
          : periods.length === 0
            ? "too old"
            : null;
  return { outcome, rule: RULE_ORDER.indexOf(outcome) + 1, periods, leftOut };
}

/** The complaints the example building already has, before the one being followed joins them. */
const ALREADY_THERE: Record<Period, Tally> = {
  m12: { structure: { violation: 3, none: 2 } },
  y2: { structure: { violation: 3, none: 4 } },
  y3: { structure: { violation: 3, none: 4 }, property: { none: 1 } },
};
/** One of the example building's own confirmed violations is still open. */
const ALREADY_OPEN = 1;

/**
 * An example building's record with the followed complaint in it, or without it when it is left out or
 * `included` is false. Built as a real complex, so the record's sentences are the ones the site would say.
 */
export function recordWith(
  followed: Followed,
  traced: Traced,
  included = true,
): Complex {
  const joins = included && traced.leftOut === null;
  const outcome = traced.outcome === "duplicate" ? null : traced.outcome;
  const tally = Object.fromEntries(
    PERIODS.map((period) => {
      const cells: Tally = structuredClone(ALREADY_THERE[period]);
      if (joins && outcome && traced.periods.includes(period)) {
        const cell = (cells[followed.category] ??= {});
        cell[outcome] = (cell[outcome] ?? 0) + 1;
      }
      return [period, cells];
    }),
  ) as Record<Period, Tally>;
  const stillOpen = joins && outcome === "violation" && !followed.closed;

  return {
    id: "example",
    parcelIds: ["example"],
    address: "An example building",
    name: null,
    lon: 0,
    lat: 0,
    acres: 1,
    open: 0,
    repeatOffender: null,
    tally,
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: ALREADY_OPEN + (stillOpen ? 1 : 0),
  };
}
