import { describe, expect, it } from 'vitest';
import { fmtFeet, fmtLen, fmtMoney, fmtMoneyExact, pct } from '../format.js';

describe('fmtLen', () => {
  it('renders inches with the inch mark', () => {
    expect(fmtLen(30, 'in')).toBe('30″');
  });

  it('trims trailing zeros', () => {
    expect(fmtLen(34.5, 'in')).toBe('34.5″');
    expect(fmtLen(30.0, 'in')).toBe('30″');
  });

  it('converts to centimetres', () => {
    expect(fmtLen(12, 'cm')).toBe('30.48 cm');
  });

  it('rounds to two decimals rather than running on', () => {
    expect(fmtLen(30, 'cm')).toBe('76.2 cm');
    expect(fmtLen(7, 'cm')).toBe('17.78 cm');
  });
});

describe('fmtFeet', () => {
  it('reports linear feet in inch mode', () => {
    expect(fmtFeet(144, 'in')).toBe('12 lf');
    expect(fmtFeet(66, 'in')).toBe('5.5 lf');
  });

  it('reports metres in centimetre mode', () => {
    expect(fmtFeet(144, 'cm')).toBe('3.66 m');
  });

  it('handles zero without a sign or a fraction', () => {
    expect(fmtFeet(0, 'in')).toBe('0 lf');
  });
});

describe('money', () => {
  it('rounds to whole dollars by default', () => {
    expect(fmtMoney(1234.56)).toBe('$1,235');
    expect(fmtMoney(0)).toBe('$0');
  });

  it('keeps cents on the exact formatter', () => {
    expect(fmtMoneyExact(1234.5)).toBe('$1,234.50');
  });
});

describe('pct', () => {
  it('keeps the decimals that matter', () => {
    expect(pct(0.0825)).toBe('8.25%');
    expect(pct(0.18)).toBe('18%');
    expect(pct(0)).toBe('0%');
  });
});
