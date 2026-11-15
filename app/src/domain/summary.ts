import { formatCount } from "./format";
import { CATEGORY_LABEL } from "./labels";
import type { Outcome } from "./outcomes";
import { PERIOD_PHRASE, type Period } from "./periods";
import { FAMILY_LABEL, PESTS, type Pest } from "./problems";
import { countFor, DEFAULT_VIEW, outcomeSplit } from "./query";
import type { Category, Complex, CountSpread, RecordedProblems } from "./types";

/**
 * A building's record said in plain sentences, each one a count read from the record and nothing more:
 * no judgment, and no word the city's own outcomes do not carry. A sentence is null when it has nothing to say.
 */
export interface RecordSummary {
  /** Complaints in the period, of every type. */
  total: number;
  /** Where that count stands against the time around it. */
  trend: string | null;
  /** What the city found, led by the violations it confirmed, or that every report was a duplicate. */
  found: string | null;
  /** The confirmed violations of the last 3 years still open, whatever the period. */
  stillOpen: string | null;
  /** The type most of the complaints were. */
  about: string | null;
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

const said = formatCount;
const one = <T>(count: number, single: T, many: T): T =>
  count === 1 ? single : many;

/** Every type counts: the summary is of the building's whole record, whatever the map is filtered to. */
const totalIn = (complex: Complex, period: Period) =>
  countFor(complex, { ...DEFAULT_VIEW, period });

function trend(complex: Complex, period: Period, total: number): string | null {
  const last12 = totalIn(complex, "m12");
  const last3 = totalIn(complex, "y3");

  if (period === "m12") {
    if (total === 0) {
      const earlier = last3 - last12;
      return earlier === 0
        ? "None in the last 3 years either."
        : `There ${one(earlier, "was", "were")} ${said(earlier)} in the 2 years before that.`;
    }
    const before = totalIn(complex, "y2") - last12;
    if (before === 0) return "There were none in the 12 months before.";
    if (before === total) return "The same number as in the 12 months before.";
    return `${total > before ? "Up" : "Down"} from ${said(before)} in the 12 months before.`;
  }

  if (total === 0) {
    if (period === "y3") return null;
    const earlier = last3 - total;
    return earlier === 0
      ? "None in the last 3 years either."
      : `There ${one(earlier, "was", "were")} ${said(earlier)} in the year before that.`;
  }
  if (last12 === 0) return "None of them in the last 12 months.";
  if (last12 === total)
    return total === 1
      ? "It was in the last 12 months."
      : "All of them in the last 12 months.";
  return `${said(last12)} of them in the last 12 months.`;
}

const all = (total: number) => (total === 2 ? "both" : `all ${said(total)}`);

function found(total: number, split: Record<Outcome, number>): string {
  const { violation, fixed, none, other, open } = split;
  if (total === 1) {
    if (violation) return "The city confirmed a violation.";
    if (fixed) return "It was fixed at inspection.";
    if (none) return "The city found no violation.";
    if (other) return "It was referred or closed without a finding.";
    return "The city is still looking into it.";
  }
  if (violation === total)
    return `The city confirmed a violation in ${all(total)}.`;
  if (violation > 0) {
    const confirmed = `The city confirmed a violation in ${violation === 1 ? "one" : said(violation)} of them`;
    if (open === 0) return `${confirmed}.`;
    const rest = total === 2 ? "the other" : open === 1 ? "one" : said(open);
    return `${confirmed} and is still looking into ${rest}.`;
  }
  if (none === total) return "The city found no violation in any of them.";
  if (open === total) return `The city is still looking into ${all(total)}.`;
  return open > 0
    ? `The city has not confirmed a violation in any of them. ${said(open)} ${one(open, "is", "are")} still being looked into.`
    : "The city did not confirm a violation in any of them.";
}

function duplicatesOnly(duplicates: number): string {
  return duplicates === 1
    ? "The city closed 1 report in this period as a duplicate of another complaint."
    : `The city closed ${said(duplicates)} reports in this period as duplicates of other complaints.`;
}

function stillOpen(complex: Complex): string | null {
  const open = complex.violationsOpen;
  if (open > 0)
    return `${said(open)} confirmed ${one(open, "violation", "violations")} from the last 3 years ${one(open, "is", "are")} still open.`;
  const confirmed = outcomeSplit(complex, { ...DEFAULT_VIEW, period: "y3" });
  return confirmed.violation > 0
    ? "No confirmed violation from the last 3 years is still open."
    : null;
}

/** Each type's complaints in a period, the most first, and on a tie in display order. Types with none are left out. */
function typesByCount(complex: Complex, period: Period) {
  return CATEGORIES.map((category) => ({
    type: CATEGORY_LABEL[category].toLowerCase(),
    count: countFor(complex, { ...DEFAULT_VIEW, period, category }),
  }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * What the complaints of a period were mostly about. `when` places them when they are not the period's own.
 * When two types share the lead, both are named, so the sentence never picks one of them on its own.
 */
function about(complex: Complex, period: Period, when = ""): string {
  const total = totalIn(complex, period);
  const [first, second] = typesByCount(complex, period);
  if (total === 1)
    return when
      ? `The one${when} was about ${first.type}.`
      : `It was about ${first.type}.`;
  if (first.count === total)
    return `${total === 2 ? "Both" : `All ${said(total)}`}${when} were about ${first.type}.`;
  const lead = `${said(first.count)} of the ${said(total)}${when} ${one(first.count, "was", "were")} about ${first.type}`;
  return second.count === first.count
    ? `${lead}, and ${said(second.count)} about ${second.type}.`
    : `${lead}.`;
}

export function summarize(complex: Complex, period: Period): RecordSummary {
  const total = totalIn(complex, period);
  const duplicates = complex.duplicates[period] ?? 0;
  const everHad = totalIn(complex, "y3") > 0;

  return {
    total,
    trend: trend(complex, period, total),
    found:
      total > 0
        ? found(total, outcomeSplit(complex, { ...DEFAULT_VIEW, period }))
        : duplicates > 0
          ? duplicatesOnly(duplicates)
          : null,
    stillOpen: stillOpen(complex),
    about:
      total > 0
        ? about(complex, period)
        : everHad
          ? about(complex, "y3", ` ${PERIOD_PHRASE.y3}`)
          : null,
  };
}

const listed = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** How many families the sentence names, unless a tie with the last of them adds more. */
const NAMED_FAMILIES = 3;
/** Past this many, a tie is too wide to name, and the sentence stops before it. */
const MOST_NAMED = 5;

/**
 * How many of the families, most recorded first, the sentence names: three, and any that tie with the
 * third, so that no family it names was recorded less often than one it leaves out. A tie too wide to
 * name is left out whole, which can leave none.
 */
function familiesToName(counts: number[]): number {
  if (counts.length <= NAMED_FAMILIES) return counts.length;
  const last = counts[NAMED_FAMILIES - 1];
  const withTies = counts.filter((count) => count >= last).length;
  return withTies <= MOST_NAMED
    ? withTies
    : counts.filter((count) => count > last).length;
}

/**
 * What the city recorded at a Repeat Offender property, in one line: the families recorded most, then how
 * many problems in all and how many it has not cleared.
 */
export function recordedSentence(recorded: RecordedProblems): string {
  const { families } = recorded;
  const total = families.reduce((sum, { count }) => sum + count, 0);
  const notCleared = families.reduce(
    (sum, family) => sum + family.notCleared,
    0,
  );
  const open = notCleared > 0 ? `, ${said(notCleared)} not cleared` : "";
  const problems = `${said(total)} ${one(total, "problem", "problems")}`;

  const most = families
    .slice(0, familiesToName(families.map(({ count }) => count)))
    .map(({ family, count }) => {
      const name =
        family === "other" ? "other kinds" : FAMILY_LABEL[family].toLowerCase();
      return `${name} (${said(count)})`;
    });
  return most.length === 0
    ? `${problems} recorded ${PERIOD_PHRASE.y3}, of ${said(families.length)} kinds${open}.`
    : `Recorded most often: ${most.join(", ")}. ${problems} ${PERIOD_PHRASE.y3}${open}.`;
}

const PEST_NAME: Record<Pest, string> = {
  roaches: "roaches",
  rodents: "rodents",
  bedBugs: "bed bugs",
  wasps: "wasps or bees",
  ants: "ants",
  insects: "other insects",
};

/**
 * How often pests were recorded, and which the city's notes name: the most named first, with the catch-all
 * last. It says what the notes name and no more, since a note can name several pests and some name none.
 * When this site read no name, it says so of itself: its reading would sooner miss a name than get one wrong.
 */
export function pestSentence(recorded: RecordedProblems): string | null {
  const pests = recorded.families.find(({ family }) => family === "pests");
  if (!pests) return null;

  const specific = PESTS.filter(
    (pest) => pest !== "insects" && (recorded.pests[pest] ?? 0) > 0,
  ).sort((a, b) => (recorded.pests[b] ?? 0) - (recorded.pests[a] ?? 0));
  const names = specific.map((pest) => PEST_NAME[pest]);
  if ((recorded.pests.insects ?? 0) > 0) {
    // "Other insects" only after an insect has been named; after rodents alone, or alone, it is "insects".
    const insectNamed = specific.some((pest) => pest !== "rodents");
    names.push(insectNamed ? PEST_NAME.insects : "insects");
  }

  const times = `Pests were recorded ${said(pests.count)} ${one(pests.count, "time", "times")}.`;
  return names.length === 0
    ? `${times} The kind could not be read from the city's notes.`
    : `${times} The city's notes name ${listed(names)}.`;
}

/**
 * How the whole city's counts spread in a period, so one building's count has something to stand against:
 * the share of complexes with none, and the count nine in ten are at or under. Either half is left out when
 * it would say nothing: no share to speak of with none, or nine in ten with none at all.
 */
export function spreadSentence(spread: CountSpread, period: Period): string {
  const none = Math.round(spread.noneShare * 100);
  const when = PERIOD_PHRASE[period];
  if (none === 0)
    return `Across Austin, 9 in 10 apartment complexes had ${said(spread.nineInTen)} or fewer complaints ${when}.`;
  const share = `Across Austin, ${none}% of apartment complexes had no complaints ${when}`;
  return spread.nineInTen === 0
    ? `${share}.`
    : `${share}, and 9 in 10 had ${said(spread.nineInTen)} or fewer.`;
}
