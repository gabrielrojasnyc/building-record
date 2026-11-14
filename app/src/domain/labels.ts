import type { Category } from "./types";

/** How each complaint category reads on screen, in display order. The order also breaks ties when a card names a building's top category. */
export const CATEGORY_LABEL: Record<Category, string> = {
  structure: "Structure condition",
  property: "Property upkeep",
  landuse: "Land use",
  permit: "Work without permit",
};
