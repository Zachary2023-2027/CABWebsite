/* ===========================================================================
   Dimension geometry.

   The arithmetic behind an annotated drawing, kept out of the component so it
   can be checked. What it encodes is ordinary drawing practice:

   - a witness line stands OFF the feature it measures by a small gap, so the
     dimension is not welded to the edge, and runs a little PAST the dimension
     line at the far end
   - the dimension line carries a terminator at each end, so where it begins
     and ends is not a matter of opinion
   - the text sits centred on its own dimension line
   - parallel dimensions step out by a constant, and detail sits INSIDE the
     overall: the chain that breaks a face down is nearer the object than the
     single dimension taken across the whole of it
   - a chain reads continuously, each link starting where the last one ended,
     so its parts add up to the whole by construction rather than by luck
   - a span too short to hold two terminators pointing inwards turns them
     outwards instead, rather than drawing arrowheads through each other

   Everything is millimetres in the cabinet's own coordinates. Nothing here
   rounds: rounding each link of a chain separately is how a drawing ends up
   with parts that do not add up to the whole. The label rounds, once.
   =========================================================================== */

export const DIM = {
  gap: 16,      // witness line stand-off from the feature
  past: 20,     // how far the witness runs past the dimension line
  step: 120,    // between one dimension line and the next one out
  base: 90,     // the first dimension line, off the object
  arrow: 24,    // terminator length
  barb: 0.26,   // terminator half width, as a fraction of its length
};

/** Shortest span that can hold two terminators pointing inwards. */
export const MIN_INWARD = DIM.arrow * 2.6;

export const vAdd = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
export const vSub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
export const vLen = (v) => Math.hypot(v[0], v[1], v[2]);
export const vUnit = (v) => {
  const l = vLen(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The number as it is written on a drawing: whole millimetres. */
export const mmLabel = (v) => `${Math.round(v)}`;

/**
 * Every line one dimension is made of.
 *
 * @param {number[]} a    one end of the feature, in cabinet coordinates
 * @param {number[]} b    the other end
 * @param {number[]} dir  points away from the object, where the dimension goes
 * @param {number} off    how far out to put the dimension line
 * @returns {?{witness:number[][][], line:number[][], arrows:number[][][],
 *             mid:number[], span:number, inward:boolean}}
 *          null when there is nothing to measure.
 */
export function dimLines(a, b, dir, off) {
  const span = vLen(vSub(b, a));
  if (span < 0.5) return null;

  const d = vUnit(dir);
  const axis = vUnit(vSub(b, a));
  const a1 = vAdd(a, d, off);
  const b1 = vAdd(b, d, off);
  const inward = span > MIN_INWARD;

  /* A terminator sits at `at` and points along `towards`, its barbs swung in
     the plane of the dimension line and its offset - the plane the whole
     annotation lives in, so it reads from any camera that can read the
     dimension itself. */
  const arrow = (at, towards) => {
    const tail = vAdd(at, towards, -DIM.arrow);
    const wing = DIM.arrow * DIM.barb;
    return [[at, vAdd(tail, d, wing)], [at, vAdd(tail, d, -wing)]];
  };
  const back = [-axis[0], -axis[1], -axis[2]];

  return {
    witness: [
      [vAdd(a, d, DIM.gap), vAdd(a, d, off + DIM.past)],
      [vAdd(b, d, DIM.gap), vAdd(b, d, off + DIM.past)],
    ],
    /* Run past each end when the terminators had to be turned outwards, so
       they have something to sit on. */
    line: inward ? [a1, b1]
      : [vAdd(a1, axis, -DIM.arrow * 1.4), vAdd(b1, axis, DIM.arrow * 1.4)],
    arrows: inward
      ? [...arrow(a1, back), ...arrow(b1, axis)]
      : [...arrow(a1, axis), ...arrow(b1, back)],
    mid: [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2, (a1[2] + b1[2]) / 2],
    span,
    inward,
  };
}

/**
 * The stops of a continuous chain along one axis: the two ends of the thing
 * being broken down, plus every edge inside it, in order and without
 * duplicates so a link never has zero length or doubles back.
 *
 * @param {number} from   one end of the whole
 * @param {number} to     the other end
 * @param {number[]} at   edges inside it, in any order
 */
export function chainStops(from, to, at) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const inside = at.filter((v) => v > lo + 0.5 && v < hi - 0.5);
  return [...new Set([lo, ...inside, hi])].sort((x, y) => x - y);
}

/** How far out the nth parallel dimension line goes. */
export const levelOff = (level = 0) => DIM.base + level * DIM.step;
