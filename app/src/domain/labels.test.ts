import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  CITY_CATEGORY_TERM,
  NO_CASES_CAUTION,
  OUTCOME_CARD_PHRASE,
  titleOf,
} from './labels';
import type { Complex } from './types';

const complex = (name: Complex['name']) => ({ address: '2000 Burton Dr', name }) as Complex;

describe('titleOf', () => {
  it('is the name when the complex has one', () => {
    expect(titleOf(complex({ text: 'Array Apartments', source: 'openstreetmap' }))).toBe('Array Apartments');
  });

  it('is the address when it has none', () => {
    expect(titleOf(complex(null))).toBe('2000 Burton Dr');
  });
});

describe('the categories', () => {
  it('read as plain names, in display order', () => {
    expect(CATEGORY_LABEL).toEqual({
      structure: 'Building condition',
      property: 'Trash and grounds',
      landuse: 'Signs, zoning and use',
      permit: 'Work without a permit',
    });
    expect(Object.keys(CATEGORY_LABEL)).toEqual(['structure', 'property', 'landuse', 'permit']);
  });

  it('each say in one line what they cover', () => {
    expect(CATEGORY_MEANING).toEqual({
      structure:
        'The buildings themselves: electrical, plumbing, roofs, walls, stairs and balconies, heating and appliances, pests.',
      property: 'The land around them: trash, dumping, overgrowth and other unsanitary conditions.',
      landuse: 'Site rules: required signs, what the property is used for, and what may be built there.',
      permit: 'Construction, repair or demolition done without the city permit it needed.',
    });
  });

  it("carry the city's own term, so anyone can look it up", () => {
    expect(CITY_CATEGORY_TERM).toEqual({
      structure: 'Structure Condition',
      property: 'Property Abatement',
      landuse: 'Land Use',
      permit: 'Work Without Permit',
    });
  });
});

it('gives every outcome a short phrase for a card', () => {
  expect(OUTCOME_CARD_PHRASE).toEqual({
    violation: 'confirmed',
    fixed: 'fixed at inspection',
    none: 'none found',
    other: 'no finding',
    open: 'being looked into',
  });
});

it('says what no complaints means, in the word the site uses', () => {
  expect(NO_CASES_CAUTION).toBe(
    'No complaints means none reached Code Enforcement. It does not mean the building has no problems.',
  );
});
