import { PESTS, type Pest } from "@/domain/problems";

/**
 * The words that name each pest in a city note, read only after the code's own wording is set aside. Whole
 * words, so "approached" is no roach and "insecticide" no insect; and "Bee Cave" and "Bee Creek" are streets.
 */
const NAMED_BY: Record<Pest, RegExp> = {
  roaches: /\b(?:cock)?roach(?:es)?\b/gi,
  rodents: /\brodents?\b|\brats?\b|\bmice\b|\bmouse\b/gi,
  bedBugs: /\bbed ?bugs?\b/gi,
  wasps: /\bwasps?\b|\bbees?\b(?! (?:caves?|creek)\b)|\bhornets?\b/gi,
  ants: /\bants?\b/gi,
  insects:
    /\binsects?\b|\bgnats?\b|\bfleas?\b|\btermites?\b|\bmosquito(?:e?s)?\b|(?<!bed )\bbugs?\b/gi,
};

/** A sentence quoted from the code, not written about this property: the code says "shall" and states exceptions. */
const FROM_THE_CODE = /\bshall\b|^exception\b/i;

/** Phrases of the code that name pests in general, wherever a note repeats them. */
const CODE_PHRASES =
  /insects? (?:and|or) rodents?(?: infestation)?|rodent and pest-free/gi;

/** Words that say a pest was not there, when they stand just before its name. */
const DENIED = /\b(?:no|not|none|without|never|free (?:of|from))\b|n't\b/i;
/** How many words before a pest's name can deny it: "no evidence of bed bugs" is four back. */
const WORDS_BEFORE = 4;

/** True when the text names the pest somewhere without denying it there. */
function names(text: string, words: RegExp): boolean {
  for (const found of text.matchAll(words)) {
    const before = text
      .slice(0, found.index)
      .split(" ")
      .filter(Boolean)
      .slice(-WORDS_BEFORE)
      .join(" ");
    if (!DENIED.test(before)) return true;
  }
  return false;
}

/**
 * The pests a city note names. The city often pastes the code section into the note, and that text speaks of
 * insects, rodents and bees in general, so sentences from the code are set aside first. A pest the note
 * says was not found is not named. The rule would sooner miss a name than give a wrong one. The note is only
 * read here: what leaves is a list of names from a fixed set, never any of its words.
 */
export function pestsNamed(note: string): Pest[] {
  const written = note
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !FROM_THE_CODE.test(sentence.trim()))
    .join(" ")
    .replace(CODE_PHRASES, " ")
    .replace(/\s+/g, " ");
  return PESTS.filter((pest) => names(written, NAMED_BY[pest]));
}
