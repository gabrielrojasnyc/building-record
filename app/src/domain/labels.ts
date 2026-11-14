import type { Category } from "./types";

/** Said wherever a count could be read as a verdict on a building. */
export const NO_CASES_CAUTION =
  "No cases means none reached Code Enforcement. It does not mean the building has no problems.";

/** How each complaint category reads on screen, in display order. The order also breaks ties when a card names a building's top categories. */
export const CATEGORY_LABEL: Record<Category, string> = {
  structure: "Structure condition",
  property: "Property upkeep",
  landuse: "Land use",
  permit: "Work without permit",
};
