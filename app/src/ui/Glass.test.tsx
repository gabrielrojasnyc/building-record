import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { Glass } from './Glass';

it('renders its children inside a glass surface', () => {
  render(<Glass>Building Record</Glass>);
  expect(screen.getByText('Building Record').closest('.glass')).not.toBeNull();
});

it('renders as the requested element', () => {
  render(<Glass as="aside">x</Glass>);
  expect(screen.getByText('x').tagName).toBe('ASIDE');
});

it('keeps caller classes alongside the glass surface', () => {
  render(<Glass className="p-4">y</Glass>);
  expect(screen.getByText('y').className).toBe('glass p-4');
});
