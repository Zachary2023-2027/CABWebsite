/* ===========================================================================
   Standing at the saw.

   Cutting is set up bound, not cut bound. Moving the fence and checking it is
   square takes far longer than pushing the board through, so the order you
   are handed parts in decides how long the job takes. Four parts 568 wide
   should be four cuts at one fence setting, not four settings.

   The cut list is ordered by cabinet, because that is how you think about a
   kitchen. The workshop wants the opposite: everything that shares a setting,
   together, whatever cabinet it belongs to.
   =========================================================================== */

import { round1 } from './mm.js';

/* How close two dimensions have to be to count as the same fence setting.
   Nothing, really: a tenth of a millimetre is a different setting and
   pretending otherwise cuts a part wrong. It exists so that float noise
   cannot split a run that is genuinely one setting. */
export const SAME_TOLERANCE = 0.05;

const same = (a, b) => Math.abs(a - b) <= SAME_TOLERANCE;

/**
 * Parts in the order they are worth cutting.
 *
 * Grouped by material first, because changing the board on the saw is a
 * bigger interruption than moving the fence. Then by thickness, then by the
 * width you set the fence to, then longest first inside that, so the awkward
 * big pieces are dealt with while the sheet is still whole.
 */
export function cutOrder(parts) {
  return [...parts].sort((a, b) => (
    String(a.material).localeCompare(String(b.material))
    || a.T - b.T
    || b.W - a.W
    || b.L - a.L
    || String(a.code).localeCompare(String(b.code))
  ));
}

/**
 * How many parts after this one share its fence setting.
 *
 * Reported so the workshop can say "four more at this width" and you cut them
 * all before touching anything. Counted forwards only: what is behind you is
 * already done and is not a reason to keep the fence where it is.
 */
export function sameNext(list, index) {
  const here = list[index];
  if (!here) return { count: 0, parts: [] };

  const parts = [];
  for (let i = index + 1; i < list.length; i++) {
    const q = list[i];
    if (!same(q.W, here.W) || !same(q.T, here.T) || q.material !== here.material) break;
    parts.push(q);
  }
  return { count: parts.length, parts };
}

/**
 * The runs of parts sharing one setting, across a whole list.
 *
 * Used for the progress line, so the workshop can say which run you are in
 * and how many runs are left rather than only counting parts.
 */
export function settingRuns(list) {
  const runs = [];
  let current = null;

  for (const p of list) {
    if (current && same(p.W, current.W) && same(p.T, current.T)
        && p.material === current.material) {
      current.parts.push(p);
      continue;
    }
    current = { material: p.material, W: round1(p.W), T: round1(p.T), parts: [p] };
    runs.push(current);
  }
  return runs;
}

/**
 * A label for one part, as it goes on the piece.
 *
 * Forty white panels leaving a saw look identical, and the one thing that
 * tells them apart is a sticker. What is on it is what you need while the
 * part is out of the machine and not yet in a cabinet: which cabinet, which
 * part, how big, and which edges get taped.
 */
export function partLabel(part) {
  return {
    code: part.code,
    name: part.name,
    cabinet: part.unitLabel || '',
    wall: part.wallName || '',
    size: `${round1(part.L)} x ${round1(part.W)}`,
    thickness: round1(part.T),
    material: part.material,
    edging: part.edging || 'None',
    finish: part.finish,
    grain: part.L >= part.W ? 'Long edge is the grain' : '',
  };
}
