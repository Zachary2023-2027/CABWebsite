/* ===========================================================================
   The floor, seen from above.

   Every drawing in this app so far has been a face: an elevation of one wall,
   or the room in three dimensions. Neither of them answers the question you
   actually stand in a kitchen asking, which is how much floor is left. A
   kitchen is a set of runs with people walking between them, and the only
   drawing that shows that is the plan.

   It matters most for the island, because the island is the one run whose
   position is a real decision. Everything against a wall is against the wall;
   the island stands wherever you put it, and where you put it decides every
   walkway in the room at once. Setting that with two typed numbers means
   typing, looking, typing again. Here you take hold of it and move it, and
   the gaps around it are drawn and named while you do.

   Nothing is invented in this file. The carcasses come from the same room
   transform the clearance checks use, the faces from the same ones the
   walkway check measures, so the plan cannot disagree with the warnings the
   planner is showing underneath it.

   Everything is millimetres of floor. Pure: no React, no DOM.
   =========================================================================== */

import { unitBoxInRoom, boxInRoom } from './clearance.js';
import { facingGap, facesOf, CLEARANCE_DEFAULTS } from './checks.js';
import { BAR_RULES } from './bar.js';
import { barRange, islandAt, islandBars, islandDepth, isIsland } from './project.js';
import { round1 } from './mm.js';

/** How the plan is drawn, in millimetres of floor. */
export const PLAN = Object.freeze({
  wallThk: 110,   // a room wall, drawn behind the run standing against it
  pad: 700,       // air around the drawing, so the dimensions have somewhere to go
  grid: 5,        // the island's position rounds to this
  catch: 150,     // how near a snap has to be before it takes
});

/* ---------------------------------------------------------------------------
   What is on the floor.
   --------------------------------------------------------------------------- */

/**
 * Every carcass in the room as a plan rectangle.
 *
 * The same transform the clearance checks measure with, so a cabinet is drawn
 * where it is measured. `where` and `kind` come along because a plan draws a
 * wall cabinet differently from a base one: it is above your head, so it is
 * an outline over the top rather than a solid.
 */
export function planBoxes(entries) {
  const out = [];
  for (const entry of entries) {
    for (const p of entry.lay.placed) {
      out.push(unitBoxInRoom(entry, p, 0, p.unit.width, 0, p.unit.depth,
        p.unit.mountY, p.unit.mountY + p.unit.height, {
          uid: p.item.uid,
          wallId: entry.wall.id,
          wallName: entry.wall.name,
          island: !!entry.island,
          side: p.side,
          where: p.where,
          kind: p.unit.kind,
          cavity: !!p.unit.cavity,
          label: p.label || p.unit.family.name,
          name: p.unit.family.name,
        }));
    }
  }
  return out;
}

/**
 * The room's walls, as rectangles behind the runs that stand against them.
 *
 * A wall is not in the model: the model has a run of a given length and the
 * wall is the thing it is against. Drawn from the same origin and turn the
 * run has, reaching back out of the room, which is where a wall is.
 */
export function planWalls(entries) {
  return entries
    .filter((e) => !e.island)
    .map((e) => boxInRoom(e, 0, Number(e.wall.length) || 0, -PLAN.wallThk, 0, 0, 0, {
      id: e.wall.id, name: e.wall.name, length: Number(e.wall.length) || 0,
    }));
}

/* ---------------------------------------------------------------------------
   The island.
   --------------------------------------------------------------------------- */

/** How far the top runs past the carcass on each side of an island. */
export function barOverhangs(wall, cfg) {
  const out = { front: 0, back: 0, left: 0, right: 0 };
  if (!isIsland(wall)) return out;
  for (const b of islandBars(wall)) {
    if (b.depth > 0 && out[b.side] !== undefined) out[b.side] = b.depth;
  }
  return out;
}

/**
 * The floor an island takes up, top and all.
 *
 * The carcass stops where it stops and the top runs on past it, and it is the
 * top you walk into, so a footprint that stops at the carcass reports floor
 * that is over somebody's knees. Measured from the island's own corner, the
 * way the room is: along, then out.
 */
export function islandExtent(wall, cfg) {
  const at = islandAt(wall, cfg);
  const out = barOverhangs(wall, cfg);
  const length = Number(wall.length) || 0;
  const depth = islandDepth(wall, cfg);
  return {
    x0: at.x - out.left,
    x1: at.x + length + out.right,
    z0: at.y - out.front,
    z1: at.y + depth + out.back,
    at, length, depth, out,
  };
}

/**
 * The bars on an island as plan strips, where they really are on the floor.
 *
 * A bar is a strip of top beyond the carcass, along part of one side. Its
 * span comes from the model rather than from the raw record, so a bar set
 * longer than the side it is on is drawn clipped, the same way it is priced.
 */
export function barStrips(wall, cfg) {
  if (!isIsland(wall)) return [];
  const at = islandAt(wall, cfg);
  const length = Number(wall.length) || 0;
  const depth = islandDepth(wall, cfg);

  return islandBars(wall)
    .filter((b) => b.depth > 0)
    .map((b) => {
      const span = barRange(wall, cfg, b);
      const { from, to } = span;
      switch (b.side) {
        case 'back': return { side: b.side, depth: b.depth, span,
          x0: at.x + from, x1: at.x + to, z0: at.y + depth, z1: at.y + depth + b.depth };
        case 'left': return { side: b.side, depth: b.depth, span,
          x0: at.x - b.depth, x1: at.x, z0: at.y + from, z1: at.y + to };
        case 'right': return { side: b.side, depth: b.depth, span,
          x0: at.x + length, x1: at.x + length + b.depth, z0: at.y + from, z1: at.y + to };
        default: return { side: b.side, depth: b.depth, span,
          x0: at.x + from, x1: at.x + to, z0: at.y - b.depth, z1: at.y };
      }
    });
}

/* ---------------------------------------------------------------------------
   How far apart things are.
   --------------------------------------------------------------------------- */

/** Where two spans lie over each other, or null when they do not. */
const overlap1 = (a0, a1, b0, b1) => {
  const from = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const to = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return to > from ? [from, to] : null;
};

/** Whether a face runs left to right rather than up and down the plan. */
const isAcross = (f) => Math.abs(f.a[1] - f.b[1]) < 0.5;

/**
 * How much a gap matters.
 *
 * The same three figures the checks use, so the colour on the plan and the
 * warning in the strip underneath it are the same judgement. A gap somebody
 * sits in has to take a stool as well as a person, so a bar is measured
 * against the stool space rather than the walkway.
 */
export function gapLevel(gap, bar, clear) {
  if (gap < clear.walkwayMin) return 'error';
  if (bar && gap < (clear.barStoolSpace ?? BAR_RULES.barStoolSpace)) return 'warn';
  if (gap < clear.walkwayComfortable) return 'warn';
  return 'ok';
}

/**
 * Every gap between one run and the rest of the room, ready to draw.
 *
 * `walkways` already answers which runs face each other and how far apart
 * they are. What a drawing needs on top of that is where to put the arrow, so
 * this asks the same question of the same faces and keeps the geometry.
 *
 * @param {object[]} entries  the whole floor
 * @param {string} wallId     the run being measured, usually the island
 */
export function gapArrows(entries, cfg, wallId) {
  const clear = { ...CLEARANCE_DEFAULTS, ...BAR_RULES, ...cfg };
  const mine = entries.filter((e) => e.wall.id === wallId).flatMap((e) => facesOf(e, cfg));
  const rest = entries.filter((e) => e.wall.id !== wallId).flatMap((e) => facesOf(e, cfg));
  const out = [];

  for (const a of mine) {
    for (const b of rest) {
      const facing = facingGap(a, b);
      if (!facing) continue;

      /* Both faces are axis aligned, because every turn a room makes is a
         quarter. So the gap runs along one axis and the arrow is drawn in the
         middle of the stretch where the two actually pass each other. */
      const across = isAcross(a);
      const over = across
        ? overlap1(a.a[0], a.b[0], b.a[0], b.b[0])
        : overlap1(a.a[1], a.b[1], b.a[1], b.b[1]);
      if (!over) continue;

      const at = (over[0] + over[1]) / 2;
      const from = across ? a.a[1] : a.a[0];
      const to = across ? b.a[1] : b.a[0];
      const bar = !!(a.bar || b.bar);

      out.push({
        axis: across ? 'z' : 'x',
        at, from, to,
        gap: round1(facing.gap),
        overlap: facing.overlap,
        bar,
        level: gapLevel(facing.gap, bar, clear),
        between: [a.name, b.name],
      });
    }
  }

  /* One arrow per run you could walk to, and it is the near side of the
     island that faces it.

     Both sides of an island are parallel to the wall in front of it, so both
     of them report a gap: the walkway, and the same walkway with the island
     added to it. The second is not a gap anybody walks through. It is a line
     straight through the cabinets, and drawing it puts a number on the plan
     that is worse than no number. So the runs are grouped by what is being
     measured to, and each one keeps the smallest gap, which is the one on
     the side you are standing. */
  const best = new Map();
  for (const g of out) {
    const key = `${g.axis}|${Math.round(g.to)}`;
    const had = best.get(key);
    if (!had || g.gap < had.gap || (g.gap === had.gap && g.overlap > had.overlap)) {
      best.set(key, g);
    }
  }
  return [...best.values()];
}

/* ---------------------------------------------------------------------------
   Where the island wants to land.

   Dragging on its own gives you 1187mm of walkway, which is nothing anybody
   chose. The positions worth landing on are the ones a kitchen is set out
   from: the minimum walkway, the comfortable one, and square in the middle of
   the floor between two runs. So the drag pulls towards those and says which
   one it took, which is the difference between moving a box around and
   setting a kitchen out.
   --------------------------------------------------------------------------- */

/**
 * The positions one axis of an island is drawn towards.
 *
 * @param {object[]} rest   every face in the room except this island's
 * @param {string} axis     'x' across the plan, 'z' up it
 * @param {number} size     how wide the island is on this axis, top and all
 * @returns {{v:number, why:string}[]} where the island's low edge would go
 */
export function snapsOn(rest, axis, size, clear) {
  const want = [
    [clear.walkwayComfortable, `${clear.walkwayComfortable} walkway`],
    [clear.walkwayMin, `${clear.walkwayMin} walkway`],
  ];
  const lines = rest
    .filter((f) => (axis === 'z' ? isAcross(f) : !isAcross(f)))
    .map((f) => (axis === 'z' ? f.a[1] : f.a[0]));

  const out = [];
  for (const line of lines) {
    for (const [gap, why] of want) {
      /* Either side of the run: the island past it, or the island before it.
         Which one is right is not decided here. It is decided by which one is
         near enough to where you are actually dragging. */
      out.push({ v: line + gap, why });
      out.push({ v: line - gap - size, why });
    }
  }

  /* Centred between two runs that face each other. The one position in a
     galley that is not a compromise, and the hardest to hit by hand. */
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const span = Math.abs(lines[j] - lines[i]);
      if (span < size) continue;
      out.push({ v: Math.min(lines[i], lines[j]) + (span - size) / 2, why: 'centred' });
    }
  }
  return out;
}

/**
 * Take hold of an island and let go of it somewhere sensible.
 *
 * @param {object[]} entries  the whole floor
 * @param {object} wall       the island being moved
 * @param {{x:number, y:number}} want  where the pointer has dragged it to
 * @returns {{x:number, y:number, hits:object[]}}
 */
export function snapIsland(entries, wall, cfg, want, opts = PLAN) {
  const clear = { ...CLEARANCE_DEFAULTS, ...cfg };
  const ext = islandExtent(wall, cfg);
  const size = { x: ext.x1 - ext.x0, z: ext.z1 - ext.z0 };
  /* The pointer moves the island's own corner; the snaps are about its outer
     edge, top and all. One offset each way keeps the two apart. */
  const lead = { x: ext.out.left, z: ext.out.front };

  const rest = entries
    .filter((e) => e.wall.id !== wall.id)
    .flatMap((e) => facesOf(e, cfg));

  const hits = [];
  const on = (axis, raw) => {
    const edge = raw - lead[axis];
    let best = null;
    for (const s of snapsOn(rest, axis, size[axis], clear)) {
      const d = Math.abs(s.v - edge);
      if (d > opts.catch) continue;
      if (!best || d < best.d) best = { ...s, d };
    }
    if (!best) return Math.round(raw / opts.grid) * opts.grid;
    hits.push({ axis, why: best.why, at: best.v + lead[axis] });
    return round1(best.v + lead[axis]);
  };

  return { x: Math.max(0, on('x', want.x)), y: Math.max(0, on('z', want.y)), hits };
}

/* ---------------------------------------------------------------------------
   The page it all goes on.
   --------------------------------------------------------------------------- */

/**
 * A box around everything, with room for the dimensions.
 *
 * An empty kitchen still has to draw as something, so a floor with nothing on
 * it falls back to a square of room rather than to a zero sized viewBox that
 * renders as a blank pane.
 */
export function planBounds(boxes, pad = PLAN.pad) {
  if (!boxes.length) return { x0: -pad, z0: -pad, x1: 3000 + pad, z1: 3000 + pad, w: 3000 + pad * 2, h: 3000 + pad * 2 };
  const x0 = Math.min(...boxes.map((b) => b.x0)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x1)) + pad;
  const z0 = Math.min(...boxes.map((b) => b.z0)) - pad;
  const z1 = Math.max(...boxes.map((b) => b.z1)) + pad;
  return { x0, z0, x1, z1, w: x1 - x0, h: z1 - z0 };
}

/**
 * The runs this plan cannot draw, and why.
 *
 * A room shape says how many walls join at a corner. Anything past that is a
 * wall with no place in the room: the model does not know where it stands, so
 * the plan cannot put it anywhere, and a plan that quietly leaves a wall of
 * cabinets out is worse than one that says it has.
 */
export function missingFromPlan(project, entries) {
  const drawn = new Set(entries.map((e) => e.wall.id));
  return project.walls.filter((w) => !drawn.has(w.id) && !isIsland(w));
}
