/* ===========================================================================
   The front stack.

   A cabinet front is an ordered list of rows, top to bottom. A row is a pair
   of doors, a drawer, a false front, an open bay or an appliance bay. Any
   cabinet anyone builds is some stack of those, which is why the cabinet is
   now the thing you configure rather than the thing you choose off a list.

   ---------------------------------------------------------------------------
   The reveal accounting, written out because an off by one reveal is the
   easiest bug in this app to ship and the hardest to see.

   Between two fronts there is one gap. Above the top front and below the
   bottom front there may or may not be a gap, and that is a real decision
   about how the kitchen is built, not a constant:

     a base cabinet has a benchtop sitting directly over its top front, so a
     gap there stops the front rubbing as it opens

     the bottom front overhangs a kickboard set back 50mm, so nothing is in
     the way and a gap there is cosmetic

   So the top and the bottom gaps are their own typed settings. They default
   to zero, which is the geometry this app has always produced: fronts filling
   the carcass exactly, with reveals only between them. Set them and the
   equation becomes the general one.

     sum(rowHeights)
       + revealTop
       + revealBottom
       + reveal * (rows - 1)
       = frontOpening

   With revealTop and revealBottom both equal to reveal, that is
   reveal * (rows + 1), the fully gapped case.
   =========================================================================== */

import { round1 } from './mm.js';

export const ROW_TYPES = ['doors', 'drawer', 'false', 'open', 'bay'];

/** What an appliance bay can be left for. A bay emits no part either way. */
export const APPLIANCES = ['oven', 'microwave', 'fridge', 'other'];

/** A row with nothing set, for the row you have just added. */
export const newRow = (type = 'doors', height = 'fill') => {
  const row = { type, height };
  if (type === 'doors') { row.doors = 1; row.hingeSide = 'left'; }
  if (type === 'bay') row.appliance = 'other';
  return row;
};

/** The gaps a stack has to account for, read off the config. */
export function reveals(P) {
  const between = Number(P.reveal) || 0;
  const top = Number(P.revealTop) || 0;
  const bottom = Number(P.revealBottom) || 0;
  return { between, top, bottom };
}

/**
 * The height the fronts have to fill.
 *
 * The carcass height already has the kick and the benchtop taken out of it:
 * a 900 finished base cabinet is a 720 carcass over a 150 kick under a 30
 * benchtop. So the opening is the carcass height, and the subtraction the
 * brief writes out has already happened by the time a unit exists.
 */
export const frontOpening = (unit) => unit.height;

/** How much of the opening the gaps take, for a stack of this many rows. */
export function revealTotal(rowCount, P) {
  if (rowCount <= 0) return 0;
  const r = reveals(P);
  return r.top + r.bottom + r.between * (rowCount - 1);
}

/** The height left for the fronts themselves. */
export const availableHeight = (opening, rowCount, P) =>
  opening - revealTotal(rowCount, P);

const isFill = (h) => h === 'fill';
const numeric = (h) => (typeof h === 'number' && Number.isFinite(h) ? h : null);

/**
 * Resolve a stack against an opening.
 *
 * Returns every row with a real height and a y position measured from the
 * bottom of the carcass, plus anything wrong with it. Nothing is silently
 * adjusted: if the heights do not add up and no row is set to fill, the
 * shortfall is reported and the rows keep the heights they were given, so
 * what you see on the elevation is what you typed.
 *
 * @returns {{rows: object[], warnings: string[], errors: string[], available: number, used: number}}
 */
export function resolveStack(stack, opening, P) {
  const warnings = [];
  const errors = [];
  const rows = (Array.isArray(stack) ? stack : []).filter((r) => r && ROW_TYPES.includes(r.type));

  if (!rows.length) {
    return { rows: [], warnings, errors, available: 0, used: 0, opening };
  }

  const r = reveals(P);
  /* Heights and positions keep their full precision here. Rounding happens
     once, in mkPart, when a part is actually made. Rounding a row height to
     a tenth and then stacking the rounded values accumulates the error down
     the cabinet: four equal drawers in a 720 opening are 177.75 each, and
     rounding each to 177.8 left the bottom drawer 0.2mm below the carcass.
     Only the figures reported back for display are rounded. */
  const available = availableHeight(opening, rows.length, P);

  const fills = rows.filter((row) => isFill(row.height));
  if (fills.length > 1) {
    errors.push(`${fills.length} rows are set to fill. Only one row can take what is left over.`);
  }

  const fixed = rows.reduce((a, row) => a + (isFill(row.height) ? 0 : (numeric(row.height) ?? 0)), 0);

  let out;
  if (fills.length >= 1) {
    /* One row takes the remainder. If more than one is set to fill, the
       first takes it and the rest collapse to nothing, which is visible on
       the drawing and already reported as an error above. */
    const share = available - fixed;
    let given = false;
    out = rows.map((row) => {
      if (!isFill(row.height)) return { ...row, height: numeric(row.height) ?? 0 };
      if (given) return { ...row, height: 0 };
      given = true;
      return { ...row, height: share, filled: true };
    });
    if (share < 0) {
      errors.push(`The rows with a set height come to ${round1(fixed)}mm, which is ${round1(-share)}mm more than the ${available}mm available.`);
    }
  } else {
    out = rows.map((row) => ({ ...row, height: numeric(row.height) ?? 0 }));
    const over = round1(fixed - available);
    if (over > 0.05) {
      errors.push(`The rows come to ${round1(fixed)}mm in a ${available}mm opening. That is ${over}mm too tall.`);
    } else if (over < -0.05) {
      warnings.push(`The rows come to ${round1(fixed)}mm in a ${available}mm opening, leaving ${round1(-over)}mm unused. Set a row to fill, or press Make equal.`);
    }
  }

  /* Positions, top down. y is the bottom edge of a row, measured from the
     bottom of the carcass, which is the same reference every part uses. */
  let top = opening - r.top;
  out = out.map((row) => {
    const y = top - row.height;
    const placed = { ...row, y, top };
    top = y - r.between;
    return placed;
  });

  const used = out.reduce((a, row) => a + row.height, 0);
  return { rows: out, warnings, errors, available, used, opening };
}

/**
 * Divide the opening evenly across the rows.
 *
 * Every row gets a set height rather than one row being left to fill, because
 * "equal" is a statement about all of them. The last row absorbs the rounding
 * so the stack still adds up exactly.
 */
export function makeEqual(stack, opening, P) {
  const rows = (Array.isArray(stack) ? stack : []).filter((r) => r && ROW_TYPES.includes(r.type));
  if (!rows.length) return [];

  const available = availableHeight(opening, rows.length, P);
  const each = round1(available / rows.length);

  return rows.map((row, i) => ({
    ...row,
    height: i === rows.length - 1 ? round1(available - each * (rows.length - 1)) : each,
  }));
}

/* --- row operations, all of them pure ------------------------------------ */

export const addRow = (stack, index, row) => {
  const next = [...(stack || [])];
  next.splice(Math.max(0, Math.min(next.length, index)), 0, row);
  return next;
};

export const removeRow = (stack, index) =>
  (stack || []).filter((_, i) => i !== index);

export function moveRow(stack, index, direction) {
  const next = [...(stack || [])];
  const to = index + direction;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  const [row] = next.splice(index, 1);
  next.splice(to, 0, row);
  return next;
}

export const setRow = (stack, index, patch) =>
  (stack || []).map((row, i) => (i === index ? { ...row, ...patch } : row));

/* --- validation, used on load and by the checks screen -------------------- */

/**
 * Clean a stack arriving from a file. Anything unrecognised is dropped rather
 * than trusted, and more than one fill row is left in place so the user is
 * told about it instead of having it quietly fixed behind them.
 */
export function cleanStack(stack) {
  if (!Array.isArray(stack)) return null;

  const rows = stack
    .filter((r) => r && typeof r === 'object' && ROW_TYPES.includes(r.type))
    .map((r) => {
      const row = { type: r.type };

      row.height = (r.height === 'fill') ? 'fill'
        : (Number.isFinite(Number(r.height)) && Number(r.height) >= 0) ? Number(r.height)
          : 'fill';

      if (r.type === 'doors') {
        row.doors = (r.doors === 2) ? 2 : 1;
        row.hingeSide = ['left', 'right', 'pair'].includes(r.hingeSide) ? r.hingeSide
          : (row.doors === 2 ? 'pair' : 'left');
      }
      if (r.type === 'drawer') {
        if (Number.isFinite(Number(r.boxHeight)) && Number(r.boxHeight) > 0) {
          row.boxHeight = Number(r.boxHeight);
        }
        /* A bin runs on a bought carrier, so no wooden box is cut for it.
           Carried through a save, or a bin unit reopens as a drawer with a
           box that nobody is going to build. */
        if (r.bin) row.bin = true;
      }
      if (r.type === 'bay') {
        row.appliance = APPLIANCES.includes(r.appliance) ? r.appliance : 'other';
      }
      return row;
    });

  return rows.length ? rows : null;
}

/** Every problem with a stack, for the checks screen. */
export function stackProblems(stack, opening, P) {
  const { warnings, errors } = resolveStack(stack, opening, P);
  return [
    ...errors.map((text) => ({ level: 'error', text })),
    ...warnings.map((text) => ({ level: 'warn', text })),
  ];
}
