export type Outcome = "violation" | "fixed" | "none" | "other" | "open";

/** Display order. */
export const OUTCOMES: readonly Outcome[] = [
  "violation",
  "fixed",
  "none",
  "other",
  "open",
];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  violation: "Violation confirmed",
  fixed: "Fixed at inspection",
  none: "No violation found",
  other: "Referred or closed without a finding",
  open: "Still being looked into",
};

/**
 * Every `last_update` phrase the city used on complaints opened in the last three years, exactly as written,
 * from one live query on 2026-11-14 (43 phrases, plus blank). It is the only city text the site ever publishes,
 * and a phrase outside it never decides an outcome.
 */
export const KNOWN_CITY_OUTCOMES: readonly string[] = [
  "No Violation(s) Found/Inspection Performed",
  "Closed due to Voluntary Compliance",
  "Closed/Duplicate Case",
  "Inspection Performed/Abated by Inspector",
  "Referred to Appropriate Agency",
  "Closed due to Abatement",
  "Follow-up Inspection",
  "Cancelled",
  "Inspection Performed/Abated by Community Court",
  "Legal Action-All Deficiencies Satisfied",
  "Contact Performed",
  "Inspection Performed/ Voluntary Compliance",
  "Information Update",
  "Inspection Performed",
  "Send CV Notice",
  "Supervisor Review",
  "Closed due to Administrative Reasons",
  "Code Connect Contact",
  "CV Violation(s) Found/Inspection Performed",
  "Posted",
  "Investigation in Progress",
  "AH Review",
  "MC Review",
  "Addendum",
  "Send Graffiti Offer Letter",
  "City-Owned Property/No Violation(s) Found",
  "Extension Granted",
  "Prepare for Cutlist",
  "Closed due to Judicial / Admin Action",
  "All Deficiencies Satisfied",
  "Extension Requested",
  "Door Hanger",
  "BSC Review",
  "Closed due to Justified Conditions - COP",
  "Send CV Notice 1 - City Owned SPOC",
  "Appeal - EBS",
  "Re-Activate Folder",
  "City-Owned Property/Violation(s) Found",
  "Appeal - Property Abatement",
  "Manager/Contact Contacted",
  "CRED Support Review",
  "Mail sent certified",
  "Before Photos",
];

const KNOWN = new Set(KNOWN_CITY_OUTCOMES);

/** True when the trimmed phrase is exactly one the city has been seen to use. */
export const isKnownCityOutcome = (phrase: string): boolean => KNOWN.has(phrase.trim());

const DUPLICATE = "Closed/Duplicate Case";
const FIXED_AT_INSPECTION = new Set([
  "Inspection Performed/Abated by Inspector",
  "Inspection Performed/Abated by Community Court",
  "Inspection Performed/ Voluntary Compliance",
]);
const FOUND = "Violation(s) Found";
const NO_FOUND = "No Violation(s) Found";

/** True when the phrase says a violation was found somewhere not preceded by "No ". */
function saysViolationFound(phrase: string): boolean {
  for (
    let at = phrase.indexOf(FOUND);
    at !== -1;
    at = phrase.indexOf(FOUND, at + 1)
  ) {
    if (!phrase.slice(0, at).endsWith("No ")) return true;
  }
  return false;
}

/**
 * Decides how a complaint ended. First match wins:
 * duplicate, violation, fixed, none, open, other.
 * Text the city has not been seen to use is ignored, as if blank, so unseen wording never
 * calls a complaint a violation or clears one.
 */
export function classify(input: {
  cityOutcome: string | null;
  status: string;
  hasViolationCase: boolean;
}): Outcome | "duplicate" {
  const trimmed = input.cityOutcome?.trim() ?? "";
  const phrase = KNOWN.has(trimmed) ? trimmed : "";

  if (phrase === DUPLICATE) return "duplicate";
  if (input.hasViolationCase || saysViolationFound(phrase)) return "violation";
  if (FIXED_AT_INSPECTION.has(phrase)) return "fixed";
  if (phrase.includes(NO_FOUND)) return "none";
  if (input.status !== "Closed") return "open";
  return "other";
}
