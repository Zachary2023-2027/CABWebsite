/* ===========================================================================
   Millimetres.

   Every length in this application is a millimetre. There are no inches, no
   centimetres and no metres, except where a per metre price is displayed and
   labelled as such. This module is the only place that rounds a length or
   turns one into a string, so that the cut list, the nest, the drilling
   schedule, the 3D view and the print pack cannot quote the same part
   differently.

   The rule is one rounding, at the point a part is made. Rounding again
   downstream is how two screens end up disagreeing by a tenth, and a tenth
   is enough to make a user check the whole app rather than trust it.
   =========================================================================== */

/* import.meta.env exists under Vite and under Vitest, and is undefined when a
   module is pulled into plain node. Read it defensively so this file can be
   imported anywhere, including from a bare node script. */
const DEV = (() => {
  try {
    return import.meta.env ? import.meta.env.DEV !== false : true;
  } catch {
    return true;
  }
})();

/** The finest resolution the app works to. Far below any saw kerf. */
export const MM_PRECISION = 0.1;

/**
 * Round a length to a tenth of a millimetre.
 *
 * This is the single rounding function. `mkPart` calls it once when a part is
 * built. Nothing downstream rounds again.
 *
 * A tenth is chosen because it is finer than any saw and well below the
 * 3.2mm kerf, so it cannot move a part into or out of a sheet, while being
 * coarse enough to kill the float noise that arithmetic on a typed thickness
 * like 18.2 produces: 190.60000000000002 is not a number anyone cuts to.
 */
export const round1 = (value) =>
  (typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : value);

/**
 * Round to a whole millimetre.
 *
 * For values that are inherently whole: hole positions, hole counts, sheet
 * counts, hardware counts. A hole at 37.5 is a hole nobody can set out with a
 * tape, and half a hinge cannot be bought.
 */
export const whole = (value) =>
  (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : value);

/**
 * The display string for a length.
 *
 * At most one decimal place, trailing zero dropped, never exponential. A
 * number rendered as 1.9e-7 or 190.60000000000002 on a workshop screen is
 * worse than no number at all.
 */
export function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  // `|| 0` normalises negative zero, which prints as "-0".
  const r = (Math.round(n * 10) / 10) || 0;
  /* Intl rather than toString or toFixed. Both of those switch to exponential
     notation at the extremes, and 1e+21 on a workshop screen is not a number
     anyone can set a saw to. No such value can arise from a real kitchen, but
     a corrupted file can carry one, and the answer to that is a long ugly
     string of digits rather than something that looks like a different unit. */
  return r.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 1 });
}

/** A usable millimetre value: a real number, not negative. */
export const isMm = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Guard a millimetre value at a module boundary.
 *
 * Throws while developing and in tests, where a bad number is a bug worth
 * stopping for. Stays quiet in a built app, where throwing would take the
 * whole planner down over one malformed cabinet and lose the user's work.
 */
export function assertMm(value, label) {
  if (isMm(value)) return value;
  const message = `${label} must be a millimetre value, got ${JSON.stringify(value)}`;
  if (DEV) throw new TypeError(message);
  // eslint-disable-next-line no-console
  console.warn(message);
  return value;
}
