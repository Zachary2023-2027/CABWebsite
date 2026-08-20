/* ===========================================================================
   The parts that belong to a run, not to a cabinet.

   A kickboard is not a cabinet part. It is one length of board that passes in
   front of however many cabinets happen to be standing next to each other,
   and it stops where the run stops. Same with a benchtop, and same with the
   panel on the exposed end of a run. None of them can be worked out inside
   buildUnit, because a cabinet does not know what is beside it.

   Until now these were priced per metre and never cut. That is fine as an
   estimate and useless in a workshop: you cannot tick a metre off a cut list,
   it never lands on a sheet, and the offcut it would have left is invisible
   to the nest. So they are made here, as real parts, from the runs they
   actually belong to.

   The benchtop is the exception and stays a schedule rather than a part. It
   is bought as a slab by the metre, not cut from your sheet stock, so nesting
   it against a sheet of melamine would be inventing a saving that does not
   exist. It gets a list of pieces with real lengths instead.
   =========================================================================== */

import { round1 } from './mm.js';

/**
 * The continuous runs on one wall.
 *
 * A kickboard and a benchtop do not break in the same places, so what counts
 * as one run depends on what you are cutting:
 *
 *   kick    the board passes in front of anything standing on the floor with
 *           a cabinet behind it. A dishwasher or a freestanding cooker has
 *           its own foot and its own front, so the kick stops either side of
 *           it. So does a tall cabinet, which carries its own.
 *
 *   bench   the top passes over an under bench appliance without a break,
 *           because that is the point of an under bench appliance. It stops
 *           at a tall cabinet and at a freestanding cooker, which has its own
 *           top at its own height.
 *
 * Running one set of rules for both is what produced four separate benchtop
 * pieces on a wall that needs two.
 *
 * @param {'kick'|'bench'} purpose
 * @returns {{x0:number,x1:number,length:number,items:object[],
 *            openStart:boolean,openEnd:boolean}[]}
 */
export function baseRuns(lay, purpose = 'kick', P = {}, tolerance = 2, side = null) {
  const runs = [];
  let current = null;
  const close = () => { if (current) runs.push(current); current = null; };

  /* A wall cabinet is not on the floor and not under the benchtop. It is at a
     different height entirely, so it neither continues a floor run nor breaks
     one, and it has to be out of the list before anything else is asked.

     Leaving them in is what split a continuous wall into four benchtop
     pieces: a wall cabinet standing over the middle of a run looked like
     something interrupting it. A bulkhead is the same, which is why the test
     is the height it is mounted at and not the kind it calls itself. */
  const floorLimit = (Number(P.kick) || 150) + 1;
  const onFloor = (unit) => unit.kind !== 'wall' && (unit.mountY ?? 0) <= floorLimit;

  /** Whether this unit continues the run, for what we are cutting. */
  const carries = (unit) => {
    if (unit.kind === 'tall' || unit.fullHeight) return false;
    if (unit.breaksBench) return false;          // its own top, its own front
    if (unit.cavity) return purpose === 'bench'; // the top passes over, the kick does not
    return unit.kind === 'base' || unit.kind === 'filler';
  };

  /* Sorted by position, because a cabinet dragged into place can sit anywhere
     in the list while being anywhere on the wall. Two cabinets touch when the
     gap between them is nothing, and a millimetre of rounding is not a gap
     you would cut a separate kickboard for. */
  /* An island's two sides occupy the same stretch of x, one behind the other.
     Looked at together they read as cabinets overlapping each other, and the
     run finder breaks the run at every one: five cabinets on a 2400 island
     came out as five separate pieces of kickboard. Each side is its own run
     and is asked for separately. */
  const placed = [...lay.placed]
    .filter((p) => onFloor(p.unit))
    .filter((p) => (side === null ? true : (p.side === 'back' ? side === 'back' : side !== 'back')))
    .sort((a, b) => a.x - b.x);

  for (const p of placed) {
    if (!carries(p.unit)) { close(); continue; }

    if (current && Math.abs(p.x - current.x1) <= tolerance) {
      current.x1 = p.x + p.unit.width;
      current.items.push(p);
    } else {
      close();
      current = { x0: p.x, x1: p.x + p.unit.width, items: [p] };
    }
  }
  close();

  return runs.map((r) => ({
    ...r,
    length: round1(r.x1 - r.x0),
    /* Whether each end of the run is out in the open. An end that butts into
       something needs no panel and no overhang; an end you can walk past
       does. The wall start counts as closed, because a wall is there. */
    openStart: r.x0 > tolerance
      && !placed.some((p) => Math.abs(p.x + p.unit.width - r.x0) <= tolerance
        && !r.items.includes(p)),
    openEnd: !placed.some((p) => Math.abs(p.x - r.x1) <= tolerance
      && !r.items.includes(p)),
  }));
}

/** A fallback for when the stock is unknown. Real runs use the sheet. */
export const MAX_PIECE = 2400;

/**
 * The longest piece that will actually come off a sheet.
 *
 * Not the sheet length. The trim comes off each edge before anything is cut,
 * so a 2400 sheet gives 2380 of usable length with a 10mm trim, and a 2400mm
 * kickboard cut to the nominal sheet size is a part that fits nowhere. It
 * went straight to the oversize list, which is exactly where a run of
 * kickboard should never end up.
 */
export function usableLength(sheet, P) {
  const trim = Number(P.trim) || 0;
  if (!sheet || !Array.isArray(sheet.size)) return MAX_PIECE;
  return round1(Math.max(...sheet.size) - 2 * trim);
}

/**
 * Split a length into pieces nothing longer than the stock allows.
 *
 * A 4200mm run of kickboard is not one part, because there is no 4200mm sheet.
 * It is two pieces with a joint in it, and saying so is the difference between
 * a cut list you can follow and one that stops at the saw.
 */
export function splitRun(length, max = MAX_PIECE) {
  if (!(length > 0)) return [];
  const n = Math.ceil(length / max);
  const each = round1(length / n);
  /* The last piece takes whatever the rounding left, the same way the front
     stack divides an opening. Three equal pieces of a 7000 run round to
     2333.3 each, which is 6999.9: a tenth short, and the run does not reach
     the end of the kitchen. The piece that absorbs it is the one you cut
     last, which is where you would put the offcut anyway. */
  const pieces = Array.from({ length: n - 1 }, () => each);
  pieces.push(round1(length - each * (n - 1)));
  return pieces;
}

/**
 * The plinth around a free standing island.
 *
 * An island is kicked right round, not only in front of the cabinets: it has
 * two open ends and you can see the feet through them. Four pieces, two the
 * length of it and two the depth.
 *
 * @returns {{length:number, label:string}[]}
 */
export function islandKickRuns(wall, depth) {
  return [
    { length: round1(wall.length), label: 'front' },
    { length: round1(wall.length), label: 'back' },
    { length: round1(depth), label: 'left end' },
    { length: round1(depth), label: 'right end' },
  ];
}

/**
 * Kickboard for one wall. Real parts, cut from board, group 'kick'.
 *
 * The kick is set back from the front of the cabinet so your toes go
 * somewhere, which is why the cabinet is 560 deep and the benchtop is 600.
 */
export function kickParts(runs, P, wallId, maxPiece = MAX_PIECE) {
  const out = [];
  const material = `${P.kickBoard || P.carcassBoard || 'White melamine'} ${P.kickThk ?? P.carcassThk}mm`;

  /* Numbered straight through the wall. Numbering by run and then lettering
     the pieces inside it gave one 2400 run the parts KICK and KICK-1b, which
     is a pair of names that do not look like a pair. */
  let n = 0;
  runs.forEach((run, i) => {
    splitRun(run.length, maxPiece).forEach((piece) => {
      n += 1;
      out.push({
        code: `${wallId}-KICK-${n}`,
        name: `Kickboard ${n}`,
        group: 'kick',
        material,
        L: piece,
        W: round1(P.kick),
        T: round1(P.kickThk ?? P.carcassThk),
        edging: 'Top edge',
        runIndex: i,
      });
    });
  });

  return out;
}

/**
 * A finished panel on an end of a run that is out in the open.
 *
 * Only generated when endPanelAuto is on, because whether an end is worth
 * finishing is a decision about the room and not something the geometry can
 * settle on its own. An end panel you add from the picker is a cabinet in the
 * run and is untouched by this.
 */
export function endPanelParts(runs, P, wallId) {
  if (!P.endPanelAuto) return [];

  const out = [];
  const thk = round1(P.endPanelThk ?? P.frontThk);
  const material = `${P.endPanelBoard || P.frontBoard || 'White melamine'} ${thk}mm`;

  runs.forEach((run, i) => {
    for (const [end, open] of [['L', run.openStart], ['R', run.openEnd]]) {
      if (!open) continue;
      out.push({
        code: `${wallId}-ENDP-${i + 1}${end}`,
        name: `End panel, ${end === 'L' ? 'left' : 'right'} of run ${i + 1}`,
        group: 'panel',
        material,
        /* Floor to the underside of the benchtop, and the full depth of the
           cabinet it is finishing, so it covers the kick as well. */
        L: round1(P.benchHeight - P.benchThk),
        W: round1(P.baseDepth),
        T: thk,
        edging: 'Front edge',
        runIndex: i,
      });
    }
  });

  return out;
}

/**
 * The benchtop, as a schedule rather than a part.
 *
 * Bought by the metre as a slab, so it is never nested and never costed
 * against your sheet stock. What it needs is the list of pieces and their
 * real lengths, including the bit that hangs past the end of the run.
 */
export function benchSchedule(runs, P) {
  const overhang = Number(P.benchOverhang) || 0;

  return runs.map((run, i) => {
    /* An end out in the open gets the overhang. An end that runs into a wall
       or a tall cabinet is cut flush, because there is nothing to overhang. */
    const ends = (run.openStart ? 1 : 0) + (run.openEnd ? 1 : 0);
    const length = round1(run.length + ends * overhang);
    return {
      index: i + 1,
      length,
      depth: round1(P.benchDepth),
      thickness: round1(P.benchThk),
      overhangs: ends,
      /* A run longer than a slab needs a join, and where it goes is worth
         knowing before it is delivered rather than after. */
      pieces: splitRun(length, Number(P.benchMaxPiece) || 3600),
    };
  });
}

/**
 * The top on an island: one slab over the whole footprint.
 *
 * Overhanging on all four sides, because every side of an island is an open
 * one. Reported with its real depth rather than as a run, and priced by what
 * it would be as a standard width top, which is the only honest way to put a
 * slab against a rate quoted per metre of a normal benchtop.
 */
export function islandBench(wall, depth, P) {
  const over = Number(P.benchOverhang) || 0;
  const length = round1(wall.length + 2 * over);
  const across = round1(depth + 2 * over);

  return [{
    index: 1,
    length,
    depth: across,
    thickness: round1(P.benchThk),
    overhangs: 4,
    island: true,
    /* A slab this wide is not one metre of benchtop per metre of length. The
       area over a standard width is what it really costs.

       Not rounded. round1 is the millimetre path, and a tenth of a metre is
       a hundred millimetres: rounding a billing quantity to that loses real
       money and stops the lines adding up to the total. Rounded where it is
       shown, like every other figure that is not a millimetre. */
    metres: (length * across) / (Number(P.benchDepth) || 600) / 1000,
    pieces: splitRun(length, Number(P.benchMaxPiece) || 3600),
  }];
}

/**
 * Total benchtop, in metres of a standard width top.
 *
 * A run is its length. An island slab is wider than a benchtop, so it is the
 * area it takes converted to metres of the width you are actually buying:
 * charging a 1120 deep slab as though it were 600 deep buys half an island.
 */
export const benchLength = (schedule) =>
  schedule.reduce((a, s) => a + (s.island ? s.metres * 1000 : s.length), 0);
