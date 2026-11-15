import type { Outcome } from "./outcomes";
import type { Category, Complex } from "./types";

/** Said wherever a count could be read as a verdict on a building. */
export const NO_CASES_CAUTION =
  "No complaints means none reached Code Enforcement. It does not mean the building has no problems.";

/** Said instead of that caution where complaints did reach the city in the period, but every one was a duplicate. */
export const DUPLICATES_ONLY_NOTE =
  "The city closed every complaint here in this period as a duplicate of another complaint.";

/** How each complaint category reads on screen, in display order. */
export const CATEGORY_LABEL: Record<Category, string> = {
  structure: "Building condition",
  property: "Trash and grounds",
  landuse: "Signs, zoning and use",
  permit: "Work without a permit",
};

/** One word each, as the filter bar's type buttons read, where the full label does not fit. */
export const CATEGORY_BUTTON_LABEL: Record<Category, string> = {
  structure: "Building",
  property: "Grounds",
  landuse: "Zoning",
  permit: "Permits",
};

/** What each category covers, in one line, written from the kinds of problem the city recorded at Repeat Offender properties. */
export const CATEGORY_MEANING: Record<Category, string> = {
  structure:
    "The buildings themselves: electrical, plumbing, roofs, walls, stairs and balconies, heating and appliances, pests.",
  property:
    "The land around them: trash, dumping, overgrowth and other unsanitary conditions.",
  landuse:
    "Site rules: required signs, what the property is used for, and what may be built there.",
  permit:
    "Construction, repair or demolition done without the city permit it needed.",
};

/** The city's own name for each category, so anyone can look it up. */
export const CITY_CATEGORY_TERM: Record<Category, string> = {
  structure: "Structure Condition",
  property: "Property Abatement",
  landuse: "Land Use",
  permit: "Work Without Permit",
};

/** The full text of the city's `description` for each category, exactly as the portal has it. Each includes its term above. */
export const CITY_CATEGORY_DESCRIPTION: Record<Category, string> = {
  structure: "Structure Condition Violation(s)",
  property: "Property Abatement",
  landuse: "Land Use Violation(s)",
  permit: "Work Without Permit",
};

/** Each outcome as it reads after a count on a tray card, where a full label does not fit. */
export const OUTCOME_CARD_PHRASE: Record<Outcome, string> = {
  violation: "confirmed",
  fixed: "fixed at inspection",
  none: "none found",
  other: "no finding",
  open: "being looked into",
};

/** What a complex is called on screen: its name when it has one, otherwise its address. */
export function titleOf(complex: Complex): string {
  return complex.name?.text ?? complex.address;
}
