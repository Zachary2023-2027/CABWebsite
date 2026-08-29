/* ===========================================================================
   Annotating a drilled panel.

   The drilling drawings had one size of text and one rule for what to label,
   and both were wrong in opposite directions depending on the panel. On a
   720mm door the numbers were readable. On a 100mm top rail the same numbers
   were a third of the panel and ran off the page. And a side panel with a
   ladder of eighteen shelf pin holes 32mm apart got eighteen numbers stacked
   on top of each other, which is not a dimension, it is a smudge.

   Two ideas fix it, and both of them are what a real setting out sheet does:

     Size the text off the panel. A drawing is scaled to fit its box, so a
     number written in millimetres of drawing has to be a fraction of the
     panel or it is a different size on every card.

     Do not write a number you cannot read, and do not write eighteen numbers
     when the fact is one. A run of holes at an even pitch is "12 at 32 from
     96", said once. The exact positions belong in a table beside the drawing,
     which is where you read numbers off anyway: nobody measures off a screen.

   Pure. No React, no DOM, no SVG.
   =========================================================================== */

/** Hole positions on one axis, whole millimetres, in order, no duplicates. */
export const axisValues = (holes, key) =>
  [...new Set((holes || []).map((h) => Math.round(h[key])))].sort((a, b) => a - b);

/**
 * How big the text on a panel drawing should be, in millimetres of drawing.
 *
 * A fixed fraction of the panel's long side, so a 2100mm door and a 100mm
 * rail come out the same size on screen. Held between a floor and a ceiling
 * so a very long thin panel does not end up with text taller than it is.
 *
 * @param {number} w  panel width as drawn
 * @param {number} h  panel height as drawn
 */
export function textSize(w, h) {
  const long = Math.max(w, h, 1);
  const short = Math.max(Math.min(w, h), 1);
  return Math.max(8, Math.min(long / 30, short / 8));
}

/**
 * Which positions on an axis get a number written against them.
 *
 * The two ends always, because they are the ones you set out from. Everything
 * between them only if there is room for its number, and only if writing it
 * would not crowd the end. A tick is still drawn at every position, so
 * nothing is hidden: what is dropped is the number, not the hole, and the
 * table beside the drawing carries every one of them.
 *
 * @param {number[]} values  in order
 * @param {number} minGap    how much room a number needs, in the same units
 */
export function labelled(values, minGap) {
  if (values.length <= 1) return [...values];

  const last = values[values.length - 1];
  const keep = [values[0]];

  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i];
    if (v - keep[keep.length - 1] < minGap) continue;
    if (last - v < minGap) continue;
    keep.push(v);
  }

  keep.push(last);
  return keep;
}

/**
 * Evenly spaced runs in a list of positions.
 *
 * A ladder of shelf pin holes is one fact and not eighteen: a pitch, a count
 * and where it starts. Anything that is not part of a run comes back as a run
 * of one, so a caller can walk the whole axis without a special case.
 *
 * @param {number[]} values   in order
 * @param {number} minLength  how many in a row before it is worth calling a run
 * @param {number} tol        how far off the pitch a step may be
 * @returns {{from:number, to:number, step:number, n:number}[]}
 */
export function runs(values, minLength = 3, tol = 0.51) {
  const out = [];
  let i = 0;

  while (i < values.length) {
    if (i + minLength - 1 < values.length) {
      const step = values[i + 1] - values[i];
      let j = i + 1;
      while (j + 1 < values.length && Math.abs((values[j + 1] - values[j]) - step) <= tol) j++;
      if (step > 0 && j - i + 1 >= minLength) {
        out.push({ from: values[i], to: values[j], step, n: j - i + 1 });
        i = j + 1;
        continue;
      }
    }
    out.push({ from: values[i], to: values[i], step: 0, n: 1 });
    i++;
  }

  return out;
}

/** A run said the way you would set it out with a tape. */
export const runText = (r) =>
  (r.n === 1 ? `${r.from}` : `${r.n} at ${Math.round(r.step)}, ${r.from} to ${r.to}`);

/**
 * The setting out table beside the drawing.
 *
 * One row per line of holes: the position along one axis, what the holes on
 * it are, and every position along the other axis written out as runs. This
 * is where the exact numbers live, so the drawing does not have to carry them
 * and can stay a drawing.
 *
 * @param {object} panel  a panel from drillUnit
 * @returns {{along:number, kind:string, dia:number, depth:number, n:number,
 *            at:string, positions:number[]}[]}
 */
export function settingOut(panel) {
  const byLine = new Map();

  for (const hole of panel.holes) {
    /* Grouped by the column it is in, because that is how a panel is drilled:
       you set the fence once and run down the line. */
    const key = `${Math.round(hole.x)}|${hole.kind}|${hole.dia}|${hole.depth}`;
    if (!byLine.has(key)) {
      byLine.set(key, {
        along: Math.round(hole.x), kind: hole.kind, dia: hole.dia, depth: hole.depth,
        screw: hole.screw || null, positions: [],
      });
    }
    byLine.get(key).positions.push(Math.round(hole.y));
  }

  return [...byLine.values()]
    .map((line) => {
      const positions = [...new Set(line.positions)].sort((a, b) => a - b);
      return {
        ...line,
        positions,
        n: positions.length,
        at: runs(positions).map(runText).join(', '),
      };
    })
    .sort((a, b) => a.along - b.along || a.kind.localeCompare(b.kind));
}
