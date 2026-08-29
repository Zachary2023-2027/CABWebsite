/* ===========================================================================
   Dimensions across an elevation.

   The drawing used to carry two numbers: the length of the wall and the
   length of the base run. Everything else you had to work out by reading the
   cabinet labels and adding them up, which is exactly the arithmetic a
   drawing exists to save you.

   This is the chain that fixes it. A chain reads continuously: every link
   starts where the last one ended, so the parts add up to the whole by
   construction rather than by luck, and a gap in the run is a link of its own
   rather than an unexplained jump in the numbers.

   Everything is millimetres along the wall. Nothing here rounds, for the same
   reason dim.js does not: rounding each link separately is how a drawing ends
   up with parts that do not add up to the whole. The labels round, once.

   Pure. No React, no DOM.
   =========================================================================== */

/** How the chains stand off the drawing, in millimetres of drawing. */
export const CHAIN = {
  first: 200,     // the first chain, below the floor line
  step: 250,      // between one chain and the next one out
  tick: 64,       // the tick either side of the dimension line
  text: 88,       // the number, in millimetres of drawing
  stagger: 96,    // how far a label drops when it will not fit on its own line
};

/** A gap worth drawing as its own link. Below this it is a butt joint. */
export const GAP_TOLERANCE = 1;

/**
 * One link.
 *
 * `w` is the span the link is drawn across and `label` is the number written
 * on it. They are the same thing everywhere except on an overlap, where the
 * span is clipped so the chain still adds up to the wall and the label stays
 * the width the cabinet actually is.
 */
const link = (x0, x1, kind, label, name = null) =>
  ({ x0, x1, w: x1 - x0, kind, label: label ?? x1 - x0, name });

/**
 * One run broken into links, end to end.
 *
 * @param {object[]} placed  the units on this run, in any order
 * @param {number} from      where the run may start, so the corner band before it
 * @param {number} to        where it may finish
 * @param {number} length    the whole wall, so the chain reaches both ends
 * @param {function} xOf     where a unit is right now, which is not where it
 *                           is stored while it is being dragged
 */
export function runLinks(placed, from, to, length, xOf = (p) => p.x) {
  const out = [];
  const units = [...placed].sort((a, b) => xOf(a) - xOf(b));

  /* The stretch a corner cabinet on the next wall is standing in is not a gap
     you can fill, so it is named rather than measured as empty wall. */
  if (from > GAP_TOLERANCE) out.push(link(0, from, 'corner', from, 'Corner'));

  let cursor = from;
  for (const p of units) {
    const x = xOf(p);
    const w = p.unit.width;
    if (x - cursor > GAP_TOLERANCE) out.push(link(cursor, x, 'gap', x - cursor));

    /* An overlap is a real state of the drawing and the warnings already say
       so. The chain does not draw a link running backwards, and it does not
       count the same millimetre twice: the span is clipped to where the last
       link ended, and the label stays the width the cabinet really is. A
       cabinet completely buried under another gets no link, because there is
       no length of wall left to hang one on. */
    const x0 = Math.max(x, cursor);
    const x1 = x + w;
    if (x1 - x0 > GAP_TOLERANCE) {
      out.push(link(x0, x1, p.unit.cavity ? 'cavity' : 'unit', w, p.label));
    }
    cursor = Math.max(cursor, x1);
  }

  if (to - cursor > GAP_TOLERANCE) out.push(link(cursor, to, 'gap', to - cursor));
  if (length - to > GAP_TOLERANCE) out.push(link(to, length, 'corner', length - to, 'Corner'));

  return out;
}

/**
 * Every chain on one wall elevation, from the drawing outwards.
 *
 * The base run first, because it is the one you set out from. Then the wall
 * run, when there is one. Then the wall itself across the whole of it, which
 * is the overall dimension and belongs furthest out, with the detail inside
 * it: that is ordinary drawing practice and it is what makes the chain read
 * as a breakdown of the total rather than as a competing number.
 *
 * @returns {{chains: object[], length: number}}
 */
export function elevationChains(lay, shown = lay.front || lay.placed, xOf = (p) => p.x,
  length = lay.wall.length) {
  const from = lay.startOffset || 0;
  /* Never past the end of the thing being drawn. An island's end is as long
     as the island is deep, and the layout's limit is about its length, so a
     chain that took the limit ran the end's dimensions out to 2400 on a 1120
     deep island. */
  const to = Math.min(lay.limit ?? length, length);

  const base = shown.filter((p) => p.where !== 'wall');
  const wall = shown.filter((p) => p.where !== 'base');

  const chains = [];
  if (base.length) {
    chains.push({
      id: 'base', name: 'Base run',
      links: runLinks(base, from, to, length, xOf),
    });
  }
  if (wall.length) {
    chains.push({
      id: 'wall', name: 'Wall run',
      links: runLinks(wall, from, to, length, xOf),
    });
  }

  /* The whole wall, always, even when nothing is on it. A drawing of an empty
     wall still has to say how long the wall is. */
  chains.push({
    id: 'overall', name: 'Wall',
    overall: true,
    links: [link(0, length, 'overall', length)],
  });

  return { chains, length };
}

/* ---------------------------------------------------------------------------
   Where the numbers go.

   A 100mm filler between two cabinets has a three character number and about
   twenty five millimetres of drawing to put it in. Squeezing it in is how a
   chain turns into a smear, and dropping it is how the one number you were
   looking for is the one that is not there.

   So a label that will not fit drops to a second row with a leader line back
   to its own link. Two rows is enough for any run: three labels in a row all
   too narrow to fit is a run of fillers, and they alternate.
   --------------------------------------------------------------------------- */

/**
 * Which row each label goes on, and whether it needs a leader.
 *
 * @param {object[]} links
 * @param {number} charW  how wide one character is, in millimetres of drawing
 * @returns {{row:number, fits:boolean}[]} one per link, in order
 */
export function labelRows(links, charW) {
  let lastDropped = -2;
  let lastRow = 2;
  return links.map((l, i) => {
    const need = String(Math.round(l.label)).length * charW + charW * 1.6;
    const fits = l.w >= need;
    if (fits) return { row: 0, fits: true };
    /* Two labels dropped next to each other would collide on the second row
       just as they did on the first, so consecutive drops alternate between
       the two rows below the line. */
    const row = lastDropped === i - 1 ? 3 - lastRow : 1;
    lastDropped = i;
    lastRow = row;
    return { row, fits: false };
  });
}

/* ---------------------------------------------------------------------------
   Heights.

   The same idea turned on its side. Every horizontal line on the elevation
   that somebody has to set out: the top of the kick, the top of the carcass,
   the benchtop, the underside of the wall cabinets, their top, the ceiling.
   --------------------------------------------------------------------------- */

/**
 * The height chain up the left of the elevation.
 *
 * Only the lines that are really there. A kitchen with no wall cabinets does
 * not get a splashback dimension, and a run with nothing on the floor does
 * not get a kickboard.
 *
 * @returns {{stops:number[], links:object[], total:number}}
 */
export function heightChain(lay, cfg, shown = lay.front || lay.placed) {
  const hasBase = shown.some((p) => p.where !== 'wall' && !p.unit.cavity);
  const hasWall = shown.some((p) => p.where === 'wall');

  /* The third value says which lines you would keep if two of them are too
     close together to label both. The benchtop at 900 is a number somebody
     sets out from; the top of the carcass 30mm under it is a consequence of
     the benchtop being 30 thick, and it is the one to lose. */
  const named = [
    [0, 'Floor', true],
    hasBase && [cfg.kick, 'Kick', true],
    hasBase && [cfg.benchHeight - cfg.benchThk, 'Carcass', false],
    hasBase && [cfg.benchHeight, 'Benchtop', true],
    hasWall && [cfg.wallMount, 'Wall cabinets', true],
    hasWall && [cfg.wallMount + cfg.wallCabHeight, 'Top', false],
    [cfg.ceiling, 'Ceiling', true],
  ].filter(Boolean);

  /* In order and without duplicates, so a link never has zero length or
     doubles back. A 2400 ceiling over 2250 of tall cabinet is tight, not
     wrong, and it still has to draw. */
  const stops = [];
  for (const [y, name, key] of named) {
    const last = stops[stops.length - 1];
    if (last && Math.abs(last.y - y) < GAP_TOLERANCE) continue;
    if (last && y < last.y) continue;
    stops.push({ y, name, key });
  }

  const links = [];
  for (let i = 1; i < stops.length; i++) {
    links.push({
      y0: stops[i - 1].y, y1: stops[i].y,
      h: stops[i].y - stops[i - 1].y,
      label: stops[i].y - stops[i - 1].y,
      name: stops[i].name,
    });
  }

  return { stops, links, total: cfg.ceiling };
}


/**
 * Which stops on a height chain get their height written against them.
 *
 * Two lines 30mm apart cannot both carry a number: at any readable text size
 * the two numbers are on top of each other, which is worse than one number.
 * So the crowded one goes, and which one goes is decided by which is worth
 * having rather than by which came first.
 *
 * @param {object[]} stops  in order, each with y and key
 * @param {number} minGap   how far apart two numbers have to be to both fit
 */
export function labelStops(stops, minGap) {
  const out = [];
  for (const s of stops) {
    const last = out[out.length - 1];
    if (last && s.y - last.y < minGap) {
      if (s.key && !last.key) out[out.length - 1] = s;
      continue;
    }
    out.push(s);
  }
  return out;
}
