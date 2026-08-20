/* ===========================================================================
   Typing a number.

   Every field in the app clamped on every keystroke, so a field with a
   minimum of 50 could never be emptied: backspace 600 to 60, to 6, to
   nothing, and each step was snapped back up to 50 and written into the box.
   You could not clear a field and type your own number, and you could not
   type 0 anywhere.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import { digitsOnly, settleNumber, typeNumber } from '../numfield.js';

/* Backspacing a field to nothing and typing a new number, one keystroke at a
   time, the way a finger actually does it. */
const keystrokes = (start, range) => {
  const seen = [];
  let text = start;
  while (text.length) {
    text = text.slice(0, -1);
    seen.push(typeNumber(text, range));
  }
  return seen;
};

describe('what the box shows while you type', () => {
  const range = { min: 50, max: 1400 };

  it('lets a field be emptied all the way', () => {
    const steps = keystrokes('600', range);
    expect(steps.map((s) => s.draft)).toEqual(['60', '6', '']);
  });

  it('never rewrites what you typed', () => {
    for (const s of keystrokes('600', range)) {
      expect(s.draft).not.toMatch(/50/);
    }
    expect(typeNumber('6', range).draft).toBe('6');
    expect(typeNumber('0', range).draft).toBe('0');
    expect(typeNumber('', range).draft).toBe('');
  });

  it('sends nothing on while the number is half typed', () => {
    expect(typeNumber('', range).value).toBeUndefined();
    expect(typeNumber('6', range).value).toBeUndefined();
    expect(typeNumber('9999', range).value).toBeUndefined();
  });

  it('sends the number on as soon as it is one that works', () => {
    expect(typeNumber('80', range).value).toBe(80);
    expect(typeNumber('800', range).value).toBe(800);
  });

  /* The whole point of the change: a number can start at nothing. */
  it('lets 0 be typed where 0 is allowed', () => {
    expect(typeNumber('0', { min: 0, max: 600 })).toEqual({ draft: '0', value: 0 });
  });

  it('keeps a trailing point so a decimal can be typed', () => {
    const r = { min: 0 };
    expect(typeNumber('12.', r).draft).toBe('12.');
    expect(typeNumber('12.5', r).value).toBe(12.5);
  });

  it('drops anything that is not part of a number', () => {
    expect(digitsOnly('1 2a3mm')).toBe('123');
    expect(typeNumber('$4.50', { min: 0 }).value).toBe(4.5);
  });
});

describe('what the box means once you leave it', () => {
  const range = { min: 50, max: 1400 };

  it('does nothing at all if you never touched it', () => {
    expect(settleNumber(null, range)).toEqual({ touched: false, value: undefined });
  });

  it('applies the range once, at the end', () => {
    expect(settleNumber('6', range).value).toBe(50);
    expect(settleNumber('9999', range).value).toBe(1400);
    expect(settleNumber('800', range).value).toBe(800);
  });

  it('lets an empty field mean the caller default', () => {
    expect(settleNumber('', range)).toEqual({ touched: true, value: undefined });
  });

  it('lets an empty field mean zero where zero is the answer', () => {
    expect(settleNumber('', { min: 0, whenEmpty: 0 })).toEqual({ touched: true, value: 0 });
  });

  it('treats a box holding only a point as empty', () => {
    expect(settleNumber('.', { min: 0, whenEmpty: 0 }).value).toBe(0);
  });

  /* The two halves agree: anything typeNumber was willing to send on is
     something settleNumber leaves exactly as it is. */
  it('never moves a number it already accepted', () => {
    for (const text of ['50', '51', '600', '800', '1399', '1400']) {
      const typed = typeNumber(text, range);
      expect(typed.value).not.toBeUndefined();
      expect(settleNumber(typed.draft, range).value).toBe(typed.value);
    }
  });
});
