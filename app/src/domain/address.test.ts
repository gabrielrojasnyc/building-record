import { describe, expect, it } from 'vitest';
import { formatAddress } from './address';

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
