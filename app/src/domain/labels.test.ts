import { describe, expect, it } from 'vitest';
import { titleOf } from './labels';
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
