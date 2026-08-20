/* ===========================================================================
   What a half typed number means.

   Every typed number in this app has a range, because a 6mm wide cabinet is
   not a cabinet and nothing downstream should ever be handed one. The range
   used to be applied on every keystroke, and that made the fields close to
   unusable: clearing 600 to type 800 goes 60, then 6, then nothing, and each
   of those was snapped up to the minimum and written back into the box under
   your fingers. You could never get a field empty, so you could never start a
   number from scratch, and 0 was not a thing you could type at all.

   The fix is to separate the two questions. While you are typing, the only
   question is whether what is in the box is a number the rest of the app can
   act on yet. When you leave the field, the question is what you meant, and
   that is where the range is applied.

   It lives here rather than in the field component so it can be tested
   without a browser, and so there is one answer rather than one per screen.
   =========================================================================== */

/** Only the characters a number is made of. */
export const digitsOnly = (text) => String(text ?? '').replace(/[^0-9.]/g, '');

/**
 * What to do with a keystroke.
 *
 * @param {string} text what is now in the box
 * @param {{min?:number, max?:number}} range
 * @returns {{draft:string, value:number|undefined}} draft is what the box
 *   shows, value is what to send on, undefined meaning send nothing yet.
 */
export function typeNumber(text, { min, max } = {}) {
  const draft = digitsOnly(text);
  if (draft === '') return { draft, value: undefined };

  const v = parseFloat(draft);
  if (!Number.isFinite(v)) return { draft, value: undefined };

  /* Out of range is a number half typed, not a number to act on. Typing 8
     toward 800 passes through 8, and 8 is not a cabinet width, but neither is
     it a mistake worth correcting while the finger is still moving. */
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  if (v < lo || v > hi) return { draft, value: undefined };

  return { draft, value: v };
}

/**
 * What the box meant once you have left it.
 *
 * @param {string|null} draft what was typed, or null if it was never touched
 * @param {{min?:number, max?:number, whenEmpty?:*}} range whenEmpty is what an
 *   empty box means: undefined for a setting whose caller puts a default back,
 *   0 for a price, where nothing is a real answer.
 * @returns {{touched:boolean, value:*}}
 */
export function settleNumber(draft, { min, max, whenEmpty } = {}) {
  if (draft === null || draft === undefined) return { touched: false, value: undefined };
  if (draft === '') return { touched: true, value: whenEmpty };

  const v = parseFloat(draft);
  if (!Number.isFinite(v)) return { touched: true, value: whenEmpty };

  const lo = min ?? 0;
  const hi = max ?? Infinity;
  return { touched: true, value: Math.min(hi, Math.max(lo, v)) };
}
