import type { Deficiency } from "./types";

/**
 * Plain families for the kinds of problem the city records at Repeat Offender properties. The city names
 * each kind by the code section it cites, such as "Installation (§605.1)"; a family says what that is about.
 * Listed in the order that settles a tie between counts: most recorded citywide first.
 */
export const PROBLEM_FAMILIES = [
  "electrical",
  "exterior",
  "plumbing",
  "stairs",
  "openings",
  "grounds",
  "trash",
  "interior",
  "appliances",
  "signs",
  "vents",
  "pests",
  "permit",
  "fire",
  "unsafe",
  "other",
] as const;

export type ProblemFamily = (typeof PROBLEM_FAMILIES)[number];

export const FAMILY_LABEL: Record<ProblemFamily, string> = {
  electrical: "Electrical and lighting",
  exterior: "Outside walls and roof",
  plumbing: "Plumbing and water",
  stairs: "Stairs and railings",
  openings: "Windows and doors",
  grounds: "Grounds and fences",
  appliances: "Heating and appliances",
  trash: "Trash and unsanitary conditions",
  interior: "Inside walls and floors",
  signs: "Required signs",
  vents: "Vents and ducts",
  pests: "Pests",
  permit: "Work without a permit",
  fire: "Fire safety",
  unsafe: "Unsafe structure",
  other: "Other",
};

/** The pests a city note can name. `insects` is any insect that is not one of the others. */
export const PESTS = [
  "roaches",
  "rodents",
  "bedBugs",
  "wasps",
  "ants",
  "insects",
] as const;

export type Pest = (typeof PESTS)[number];

/** How many problems of one family the city recorded, and how many of them it has not cleared. */
export interface FamilyCount {
  family: ProblemFamily;
  count: number;
  notCleared: number;
}

/** The section of the property maintenance code a kind cites: "(§304.13.1)" is section 304, part 13. */
const SECTION = /§\s*(\d+)(?:\.(\d+))?/;

/** A kind the city names without a code section, by a word in its title. */
function familyByTitle(kind: string): ProblemFamily {
  const title = kind.toLowerCase();
  if (title.startsWith("signs")) return "signs";
  if (title.includes("unsanitary") || title.includes("dumping")) return "trash";
  if (title.includes("permit")) return "permit";
  if (
    title.includes("graffiti") ||
    title.includes("fence") ||
    title.includes("spiked")
  )
    return "grounds";
  if (title.includes("lighting")) return "electrical";
  return "other";
}

/** Chapter 3 of the code: the outside of the property, section by section. */
function familyInChapter3(section: number, part: number): ProblemFamily {
  switch (section) {
    case 301:
      return part === 4 ? "permit" : "other";
    case 302:
      if (part === 1) return "trash";
      if (part === 5) return "pests";
      return part === 6 ? "vents" : "grounds";
    case 303:
      return "grounds";
    case 304:
      if (part === 3) return "signs";
      if (part === 10 || part === 12) return "stairs";
      if (part >= 13 && part <= 18) return "openings";
      return part === 19 ? "grounds" : "exterior";
    case 305:
      if (part === 4 || part === 5) return "stairs";
      return part === 6 ? "openings" : "interior";
    case 306:
      return "exterior";
    case 307:
      return "stairs";
    case 308:
      return "trash";
    case 309:
      return "pests";
    default:
      return "other";
  }
}

/**
 * The family a kind of problem belongs to, read from the code section the city cites. A kind this site has
 * not seen, or one whose section it does not know, is "other": it is counted, and never guessed at.
 */
export function familyOf(kind: string): ProblemFamily {
  const cited = SECTION.exec(kind);
  if (!cited) return familyByTitle(kind);

  const section = Number(cited[1]);
  const part = Number(cited[2] ?? 0);
  if (section === 109 || section === 111) return "unsafe";
  if (section >= 300 && section < 400) return familyInChapter3(section, part);
  if (section === 402) return "electrical";
  if (section === 403) return "vents";
  if (section >= 500 && section < 600) return "plumbing";
  if (section >= 601 && section <= 603) return "appliances";
  if (section === 604 || section === 605) return "electrical";
  if (section === 607) return "vents";
  if (section >= 700 && section < 800) return "fire";
  return "other";
}

/** Recorded problems counted by family: most recorded first, and on a tie in the families' own order. */
export function countFamilies(deficiencies: Deficiency[]): FamilyCount[] {
  const counts = new Map<ProblemFamily, FamilyCount>();
  for (const { kind, cleared, notCleared } of deficiencies) {
    const family = familyOf(kind);
    const entry = counts.get(family) ?? { family, count: 0, notCleared: 0 };
    counts.set(family, entry);
    entry.count += cleared + notCleared;
    entry.notCleared += notCleared;
  }
  return [...counts.values()]
    .filter(({ count }) => count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        PROBLEM_FAMILIES.indexOf(a.family) - PROBLEM_FAMILIES.indexOf(b.family),
    );
}
