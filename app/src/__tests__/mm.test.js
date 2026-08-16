import { describe, expect, it } from 'vitest';
import { assertMm, fmt, isMm, round1, whole } from '../mm.js';

describe('round1', () => {
  it('kills the float noise a typed thickness produces', () => {
    expect(round1(190.60000000000002)).toBe(190.6);
    expect(round1(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds to a tenth, half away from zero', () => {
    expect(round1(3.24)).toBe(3.2);
    expect(round1(3.25)).toBe(3.3);
    expect(round1(568)).toBe(568);
  });

  it('leaves anything that is not a finite number alone', () => {
    expect(round1(undefined)).toBeUndefined();
    expect(round1('568')).toBe('568');
    expect(round1(NaN)).toBeNaN();
  });
});

describe('whole', () => {
  it('rounds a hole position to a millimetre', () => {
    expect(whole(37.5)).toBe(38);
    expect(whole(36.4)).toBe(36);
    expect(whole(280)).toBe(280);
  });
});

describe('fmt', () => {
  it('drops a trailing zero', () => {
    expect(fmt(568)).toBe('568');
    expect(fmt(568.0)).toBe('568');
  });

  it('never shows more than one decimal place', () => {
    expect(fmt(190.60000000000002)).toBe('190.6');
    expect(fmt(1234.56)).toBe('1234.6');
    expect(fmt(0.04)).toBe('0');
  });

  it('never goes exponential, at either extreme', () => {
    for (const n of [1e21, 1e-7, -1e21, Number.MAX_SAFE_INTEGER]) {
      expect(fmt(n)).not.toMatch(/e/i);
    }
  });

  it('never prints a negative zero', () => {
    expect(fmt(-0)).toBe('0');
    expect(fmt(-0.001)).toBe('0');
  });

  it('gives a number rather than a word for a bad value', () => {
    expect(fmt(NaN)).toBe('0');
    expect(fmt(undefined)).toBe('0');
    expect(fmt(Infinity)).toBe('0');
  });
});

describe('isMm', () => {
  it('accepts a real, non negative number', () => {
    expect(isMm(0)).toBe(true);
    expect(isMm(568.4)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const bad of [-1, NaN, Infinity, '568', null, undefined, {}]) {
      expect(isMm(bad)).toBe(false);
    }
  });
});

describe('assertMm', () => {
  it('passes a good value straight through', () => {
    expect(assertMm(600, 'width')).toBe(600);
  });

  it('throws in development, naming the value', () => {
    expect(() => assertMm(-1, 'width')).toThrow(/width/);
    expect(() => assertMm(NaN, 'height')).toThrow(/height/);
  });
});
