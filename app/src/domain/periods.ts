export type Period = "m12" | "y2" | "y3";

/** Shortest first. */
export const PERIODS: readonly Period[] = ["m12", "y2", "y3"];

export const PERIOD_LABEL: Record<Period, string> = {
  m12: "12 months",
  y2: "2 years",
  y3: "3 years",
};

export const PERIOD_PHRASE: Record<Period, string> = {
  m12: "in the last 12 months",
  y2: "in the last 2 years",
  y3: "in the last 3 years",
};

const YEARS_BACK: Record<Period, number> = { m12: 1, y2: 2, y3: 3 };

const pad = (n: number) => String(n).padStart(2, "0");

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Same day of the month `years` earlier, clamped so 29 February becomes 28 February. */
function yearsBefore(date: string, years: number): string {
  const year = Number(date.slice(0, 4)) - years;
  const month = Number(date.slice(5, 7));
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** First day of each period for a pull date (YYYY-MM-DD in, YYYY-MM-DD out). 29 Feb steps back to 28 Feb. */
export function periodStarts(pulledAt: string): Record<Period, string> {
  return {
    m12: yearsBefore(pulledAt, YEARS_BACK.m12),
    y2: yearsBefore(pulledAt, YEARS_BACK.y2),
    y3: yearsBefore(pulledAt, YEARS_BACK.y3),
  };
}
