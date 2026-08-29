/* ===========================================================================
   Doors and drawers that move.

   A cabinet drawn shut is a box. Whether you can actually use it is a
   different question, and it is the question this file answers: where the
   door goes when it opens, what it sweeps on the way, and what it hits.

   That last one is not a nicety. A door that fouls the cabinet beside it, or
   the wall it is next to, is a mistake you find after everything is cut and
   hung. It is cheap to find here and expensive to find there.

   All angles in radians, all lengths in millimetres, all positions in the
   cabinet's own space unless a function says otherwise.
   =========================================================================== */

/** How far a door opens, in radians. A 110 degree hinge, wide open. */
export const FULL_SWING = (110 * Math.PI) / 180;

/** How far a drawer comes out as a fraction of its runner length. */
export const FULL_EXTENSION = 1;

/**
 * Which edge a door is hinged on, as it is drawn.
 *
 * The part carries this from the front stack. Anything unrecognised is a left
 * hand door, which is what the builder produces when nothing is set.
 */
export const hingeSideOf = (part) => (part?.hinge === 'right' ? 'right' : 'left');

/**
 * How a door sits when it is open by some fraction.
 *
 * The pivot is the hinge edge, on the front face. Rotation is about the
 * vertical axis, and the sign follows the hinge side: a left hand door swings
 * its free edge out and to the left, a right hand door out and to the right.
 * Getting the sign wrong swings the door into the cabinet, which looks almost
 * right until you notice the door is inside the box.
 *
 * @param {object} part   a front part, in cabinet space
 * @param {number} open   0 shut, 1 fully open
 * @param {number} maxAngle
 * @returns {{pivot:[number,number,number], angle:number, radius:number,
 *            side:'left'|'right', offset:[number,number,number]}}
 */
export function doorSwing(part, open = 0, maxAngle = FULL_SWING) {
  const side = hingeSideOf(part);
  const [x, y, z] = part.pos;
  const width = part.size[0];

  /* The pivot is the hinge edge. Everything the door does is a rotation about
     this line, so the mesh is offset from it by half its width and the group
     is what turns. */
  const pivotX = side === 'left' ? x : x + width;
  const angle = Math.max(0, Math.min(1, open)) * maxAngle;

  return {
    pivot: [pivotX, y, z],
    /* A rotation about Y takes +x toward +z. For the free edge of a left hand
       door to come out into the room the angle has to be negative, and for a
       right hand door positive. */
    /* The || 0 turns a negative zero back into zero. A shut left hand door is
       -0 radians otherwise, which is harmless in the maths and confusing
       everywhere a number is compared or shown. */
    angle: (side === 'left' ? -angle : angle) || 0,
    radius: width,
    side,
    // Where the door sits relative to its pivot when it is shut.
    offset: [side === 'left' ? width / 2 : -width / 2, part.size[1] / 2, 0],
  };
}

/**
 * How far a drawer front has come out.
 *
 * The front travels straight forward by the runner length. A drawer that
 * cannot come all the way out is a runner choice, not a drawing choice, so
 * the travel is whatever the runner in the project actually gives.
 */
export function drawerSlide(part, open = 0, travel = 500) {
  return {
    z: Math.max(0, Math.min(1, open)) * travel,
    travel,
  };
}

/* ---------------------------------------------------------------------------
   What a door sweeps, and what it hits.

   Seen from above, an opening door is a sector: centred on the hinge, radius
   the door width, from where the door starts to where it ends up. Anything
   standing inside that sector is in the way.
   --------------------------------------------------------------------------- */

/**
 * The sector a door sweeps, in the plan, in room coordinates along the run.
 *
 * x runs along the wall and z comes out into the room, which is the same
 * convention the 3D view uses.
 *
 * The sector also carries the height band the door occupies. A plan on its
 * own cannot tell you whether two things collide: a wall cabinet door at
 * 1500 sweeps clean over a base cabinet at 900, and comparing only their
 * footprints says they foul each other. That reported every wall cabinet door
 * in the example kitchen as opening zero degrees.
 *
 * @param {number} originX  where the cabinet starts along the wall
 * @param {number} originY  where the cabinet is mounted, so heights are absolute
 */
export function swingSector(part, originX, maxAngle = FULL_SWING, originY = 0) {
  const side = hingeSideOf(part);
  const width = part.size[0];
  const cx = originX + (side === 'left' ? part.pos[0] : part.pos[0] + width);
  const cz = part.pos[2];
  const y0 = originY + part.pos[1];
  const y1 = y0 + part.size[1];

  /* Shut, the door lies along the wall. Open, it stands out into the room.
     Angles are measured from +x, turning toward +z.

     from is always shut and to is always open, in that order, which is what
     lets arcPoint(sector, 1) mean "where the door ends up" for both hands. A
     right hand door sweeps downward, from pi back toward pi minus the angle,
     and sorting the pair to put the smaller first quietly reversed it: the
     door's "fully open" corner came back as its shut one. */
  const from = side === 'left' ? 0 : Math.PI;
  const to = side === 'left' ? maxAngle : Math.PI - maxAngle;

  return { cx, cz, radius: width, side, from, to, y0, y1 };
}

/* ---------------------------------------------------------------------------
   The same sector, somewhere else in the room.

   A swing is worked out in the cabinet's own space, which is the only place
   it can be worked out. What it fouls is very often not in that space: the
   thing a corner cabinet's door hits is on the next wall, turned ninety
   degrees and moved to the other end of the room.

   Both of these move a sector without recomputing it, so what gets compared
   across the room is the same sector the cabinet's own screen drew.
   --------------------------------------------------------------------------- */

/**
 * A sector turned and moved into room coordinates.
 *
 * The wall runs along its own x with the room in +z, and the room layout
 * gives each wall an origin and a rotation. A point (x, z) on the wall lands
 * at (ox + x cos + z sin, oy - x sin + z cos), and an angle measured from +x
 * toward +z lands at that angle less the rotation. That second half is the
 * one that is easy to leave out, and leaving it out swings every door on the
 * return wall in the wrong direction.
 */
export function sectorInRoom(sector, origin = [0, 0], rot = 0) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    ...sector,
    cx: origin[0] + sector.cx * cos + sector.cz * sin,
    cz: origin[1] - sector.cx * sin + sector.cz * cos,
    from: sector.from - rot,
    to: sector.to - rot,
  };
}

/**
 * A sector on the back of an island, which faces the other way.
 *
 * A reflection, not a rotation: the depth is measured back from the far side
 * and the door changes hand, because a left hand door seen from the back of
 * the island is a right hand one seen from the front.
 */
export function mirrorSector(sector, depth) {
  return {
    ...sector,
    cz: depth - sector.cz,
    from: -sector.from,
    to: -sector.to,
    side: sector.side === 'left' ? 'right' : 'left',
  };
}

/**
 * Whether two things are at heights that could ever touch.
 *
 * A box with no height stated is treated as reaching everywhere, so a caller
 * that only knows the plan still gets an answer rather than silently getting
 * no collisions at all.
 */
export function overlapsVertically(a, b) {
  if (a?.y0 == null || a?.y1 == null || b?.y0 == null || b?.y1 == null) return true;
  return a.y0 < b.y1 && b.y0 < a.y1;
}

/** A point on the arc a door's free corner travels. */
export const arcPoint = (sector, t) => {
  const a = sector.from + (sector.to - sector.from) * t;
  return [sector.cx + Math.cos(a) * sector.radius, sector.cz + Math.sin(a) * sector.radius];
};

/** True when a point in the plan falls inside the sector a door sweeps. */
export function inSector(sector, px, pz) {
  const dx = px - sector.cx;
  const dz = pz - sector.cz;
  const r = Math.hypot(dx, dz);
  if (r > sector.radius || r < 0.001) return false;

  let a = Math.atan2(dz, dx);
  // Bring the angle into the same turn as the sector before comparing.
  while (a < sector.from - Math.PI) a += Math.PI * 2;
  while (a > sector.from + Math.PI) a -= Math.PI * 2;

  /* The sector runs from shut to open, and for a right hand door that counts
     downward, so the pair is only ordered here, where it is being compared. */
  const lo = Math.min(sector.from, sector.to);
  const hi = Math.max(sector.from, sector.to);
  return a >= lo && a <= hi;
}

/**
 * Whether a sector overlaps an upright box standing in the plan.
 *
 * Checked by sampling the arc and by testing the box corners, which between
 * them catch the two ways these actually overlap: the door reaching into the
 * box, and the box corner poking into the sector. An exact sector to rectangle
 * intersection is a page of algebra to save a fraction of a millisecond on a
 * kitchen with thirty cabinets in it.
 */
export function sectorHitsBox(sector, box, samples = 24) {
  if (!overlapsVertically(sector, box)) return false;
  const { x0, x1, z0, z1 } = box;

  // The box has a corner inside the sector.
  for (const px of [x0, x1]) {
    for (const pz of [z0, z1]) if (inSector(sector, px, pz)) return true;
  }

  // Or the arc passes through the box.
  for (let i = 0; i <= samples; i++) {
    const [px, pz] = arcPoint(sector, i / samples);
    if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) return true;
  }

  /* Or the door, fully open, lies across the box. The open door is a line
     from the hinge to the free corner, and a short box in front of a wide
     door can sit between the arc samples. */
  const [ex, ez] = arcPoint(sector, 1);
  return segmentHitsBox(sector.cx, sector.cz, ex, ez, box);
}

/** Whether a line segment crosses an axis aligned box. */
export function segmentHitsBox(ax, az, bx, bz, box, steps = 16) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    if (px >= box.x0 && px <= box.x1 && pz >= box.z0 && pz <= box.z1) return true;
  }
  return false;
}

/**
 * Everything a cabinet's doors would foul when they open.
 *
 * Neighbours are given as boxes in the plan. A cabinet never fouls itself, and
 * the box the door belongs to is excluded by the caller rather than guessed
 * at here.
 *
 * @returns {{code:string, hits:string[]}[]} one entry per door that fouls
 */
export function swingProblems(unit, originX, neighbours, maxAngle = FULL_SWING) {
  const out = [];
  const doors = (unit.parts || []).filter(
    (p) => p.group === 'front' && p.code.includes('DOOR'));

  for (const door of doors) {
    const sector = swingSector(door, originX, maxAngle, unit.mountY ?? 0);
    const hits = neighbours
      .filter((n) => sectorHitsBox(sector, n))
      .map((n) => n.label);
    if (hits.length) out.push({ code: door.code, hits: [...new Set(hits)] });
  }
  return out;
}

/**
 * The widest a door can open before it fouls something, in radians.
 *
 * Reported so the warning can say how far it does open rather than only that
 * it does not open fully. A door that reaches 100 degrees is fine in practice;
 * one that reaches 30 is not a door.
 */
export function largestSwing(part, originX, neighbours, maxAngle = FULL_SWING,
  steps = 22, originY = 0) {
  let best = 0;
  for (let i = 1; i <= steps; i++) {
    const angle = (maxAngle * i) / steps;
    const sector = swingSector(part, originX, angle, originY);
    if (neighbours.some((n) => sectorHitsBox(sector, n))) break;
    best = angle;
  }
  return best;
}

/** The same sector opened only part of the way. */
export const partSector = (sector, t) => ({
  ...sector,
  to: sector.from + (sector.to - sector.from) * t,
});

/**
 * How far a sector opens before it hits something, and what stopped it.
 *
 * The sector version of largestSwing, for a door that has already been moved
 * into room coordinates. Rebuilding the sector from the part, as largestSwing
 * does, would throw that transform away and measure the door back on its own
 * wall, which is the whole thing this is here to avoid.
 *
 * @returns {{angle:number, hit:?object}} angle in radians
 */
export function openUntilBlocked(sector, neighbours, steps = 22) {
  const full = Math.abs(sector.to - sector.from);
  let best = 0;

  for (let i = 1; i <= steps; i++) {
    const at = partSector(sector, i / steps);
    const hit = neighbours.find((n) => sectorHitsBox(at, n));
    if (hit) return { angle: best, hit };
    best = (full * i) / steps;
  }
  return { angle: best, hit: null };
}

export const degrees = (radians) => Math.round((radians * 180) / Math.PI);
