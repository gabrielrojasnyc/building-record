import { describe, expect, it } from 'vitest';
import { formatAddress, formatRegisteredAddress } from './address';

describe('formatAddress', () => {
  it('formats city casing', () => {
    expect(formatAddress('1000 W 26TH ST')).toBe('1000 W 26th St');
    expect(formatAddress('8900 N IH 35 SVRD SB')).toBe('8900 N IH 35 SVRD SB');
  });

  it.each([
    ['2405 MONTOPOLIS DR', '2405 Montopolis Dr'],
    ['1 FM 620 RD N', '1 FM 620 Rd N'],
    ['500 RM 2222', '500 RM 2222'],
    ['3 US HWY 183 NB', '3 US Hwy 183 NB'],
    ['4100 E 51ST ST', '4100 E 51st St'],
    ['210 2ND ST', '210 2nd St'],
    ['77 SH 71 EB', '77 SH 71 EB'],
    ['9 SPRING-WELL WB', '9 Spring-Well WB'],
  ])('%s becomes %s', (raw, expected) => {
    expect(formatAddress(raw)).toBe(expected);
  });
});

describe('formatRegisteredAddress', () => {
  it.each([
    ['1901 (aka 1903, 1905, 1907, 1911, 1913, 1915, 1917, 1919, 1921&) WILLOW CREEK DR', '1901 Willow Creek Dr'],
    ['1515 WICKERSHAM LANE', '1515 Wickersham Ln'],
    ['1157 SALINA STREET', '1157 Salina St'],
    ['8207 SAM RAYBURN DRIVE', '8207 Sam Rayburn Dr'],
    ['6407 SPRINGDALE ROAD', '6407 Springdale Rd'],
    ['8600 N LAMAR BOULEVARD', '8600 N Lamar Blvd'],
    ['303 JOHN NANCE GARNER CIRCLE', '303 John Nance Garner Cir'],
    ['1221 ALGARITA AVENUE', '1221 Algarita Ave'],
    ['8312 FATHOM CIR', '8312 Fathom Cir'],
    ['8900 N IH 35 SVRD SB', '8900 N IH 35 SVRD SB'],
  ])('%s becomes %s', (raw, expected) => {
    expect(formatRegisteredAddress(raw)).toBe(expected);
  });

  it.each([
    ['Court', 'Ct'],
    ['Cove', 'Cv'],
    ['Highway', 'Hwy'],
    ['Parkway', 'Pkwy'],
    ['Place', 'Pl'],
    ['Terrace', 'Ter'],
    ['Trail', 'Trl'],
    ['Way', 'Way'],
  ])('abbreviates a trailing %s to %s, in any case', (word, abbreviation) => {
    expect(formatRegisteredAddress(`10 Oak ${word}`)).toBe(`10 Oak ${abbreviation}`);
    expect(formatRegisteredAddress(`10 OAK ${word.toUpperCase()}`)).toBe(`10 Oak ${abbreviation}`);
  });

  it('abbreviates only the last word, so a street named for a street type keeps its name', () => {
    expect(formatRegisteredAddress('12 PARKWAY PLACE')).toBe('12 Parkway Pl');
    expect(formatRegisteredAddress('8071 N LAMAR BOULEVARD NB')).toBe('8071 N Lamar Boulevard NB');
  });

  it('collapses the space a removed parenthetical leaves behind', () => {
    expect(formatRegisteredAddress('  12  (rear)   ELM   STREET ')).toBe('12 Elm St');
  });
});
