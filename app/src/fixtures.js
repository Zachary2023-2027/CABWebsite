/* ===========================================================================
   Where the things in the drawing go.

   The shapes live in Fixtures.jsx and the scene lives in Kitchen3D.jsx. What
   is here is the arithmetic that decides where each one lands: which edge a
   handle screws to, how a wall is sliced up around its windows, and how
   stools and brackets are spaced along a breakfast bar.

   Its own file because all of that is dimensional, and every dimensional
   calculation in this app gets a unit test. A number worked out inside a
   component can only be checked by looking at a picture of it, and a handle
   on the hinge side of a door looks fine in a picture until you build it.

   Millimetres, and the same axes as the rest of the 3D: x along the wall, y
   up from the floor, z out into the room.
   =========================================================================== */

import { natureOf, obstacleKind } from './obstacles.js';

/* ---------------------------------------------------------------------------
   Handles.

   The order list has counted handles from the start and the drawing never
   showed one. They are most of what a kitchen looks like from across a room,
   and where they sit is a real question rather than a decoration: a handle on
   the drawer beside a wall is a knuckle you will skin.
   --------------------------------------------------------------------------- */

/** How far a bar handle stands off the front it is screwed to. */
export const HANDLE_STAND = 34;

/**
 * Every handle on a cabinet, and which front it belongs to.
 *
 * Read off the fronts the model already has, so they land on the doors and
 * drawers that are really there. Each carries the front it is fixed to, so the
 * scene can put it inside that front's group and have it swing or slide with
 * it: a handle drawn in cabinet space hangs in mid air the moment anything
 * opens.
 *
 * @returns {{key:string, at:number[], length:number, vertical:boolean,
 *            door?:string, drawer?:number}[]}
 */
export function handlesFor(unit) {
  const out = [];
  for (const q of unit?.parts || []) {
    if (q.group !== 'front') continue;
    const isDoor = q.code.includes('DOOR');
    const isDrawer = q.code.includes('DRWR-F');
    if (!isDoor && !isDrawer) continue;

    const [w, h] = q.size;
    if (isDrawer) {
      /* Across the middle of a drawer front, at two thirds of its width, which
         is what a bar handle on a drawer normally is. */
      out.push({
        key: q.code,
        drawer: q.drawer,
        at: [q.pos[0] + w / 2, q.pos[1] + h / 2, q.pos[2] + q.size[2]],
        length: Math.max(120, Math.min(w - 90, 500)),
        vertical: false,
      });
    } else {
      /* Up the opening edge of a door, which is the edge away from the hinge.
         Getting this backwards puts every handle against a hinge, which is the
         one place on a door a handle never goes. */
      const hingedLeft = q.hinge === 'left';
      out.push({
        key: q.code,
        door: q.code,
        at: [q.pos[0] + (hingedLeft ? w - 55 : 55), q.pos[1] + h / 2, q.pos[2] + q.size[2]],
        length: Math.max(120, Math.min(h - 120, 420)),
        vertical: true,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Walls with holes in them.

   A wall used to be one plane and a window was a rectangle painted on it,
   which reads as a picture hanging on a wall rather than as a hole in one.
   Sliced into the pieces around its openings it is a real hole with a real
   reveal, which is also how the wall is actually built.
   --------------------------------------------------------------------------- */

/** The openings in a wall, in order along it. */
export function wallOpenings(wall) {
  return (wall?.obstacles || [])
    .filter((o) => natureOf(o) === 'blocks')
    .filter((o) => ['window', 'door'].includes(obstacleKind(o.kind).id))
    .map((o) => ({
      id: o.id,
      kind: obstacleKind(o.kind).id,
      x: Math.max(0, Number(o.x) || 0),
      y: Math.max(0, Number(o.y) || 0),
      w: Math.max(1, Number(o.w) || 0),
      h: Math.max(1, Number(o.h) || 0),
    }))
    .sort((a, b) => a.x - b.x);
}

/**
 * A wall as the solid pieces around its openings.
 *
 * Vertical bands rather than a rectangle per opening. Two windows side by side
 * share the pier between them, and drawing that pier once per window puts two
 * faces in the same place, which flickers as the camera moves.
 *
 * @returns {{x:number, w:number, y:number, h:number}[]}
 */
export function wallBands(wall, length, ceiling) {
  const holes = wallOpenings(wall).filter((o) => o.x < length && o.x + o.w > 0);
  const out = [];
  let cursor = 0;

  for (const o of holes) {
    const x0 = Math.max(0, o.x);
    const x1 = Math.min(length, o.x + o.w);
    if (x1 <= cursor) continue;
    if (x0 > cursor) out.push({ x: cursor, w: x0 - cursor, y: 0, h: ceiling });

    // Over the head, and under the sill where it does not reach the floor.
    const head = ceiling - (o.y + o.h);
    if (head > 1) out.push({ x: x0, w: x1 - x0, y: o.y + o.h, h: head });
    if (o.y > 1) out.push({ x: x0, w: x1 - x0, y: 0, h: o.y });
    cursor = x1;
  }
  if (cursor < length) out.push({ x: cursor, w: length - cursor, y: 0, h: ceiling });
  return out;
}

/** Where skirting runs, which is everywhere a doorway does not. */
export function skirtingRuns(wall, length) {
  const gaps = wallOpenings(wall).filter((o) => o.kind === 'door' && o.y < 20);
  const out = [];
  let cursor = 0;
  for (const g of gaps) {
    if (g.x > cursor) out.push({ x: cursor, w: g.x - cursor });
    cursor = Math.max(cursor, g.x + g.w);
  }
  if (cursor < length) out.push({ x: cursor, w: length - cursor });
  return out.filter((r) => r.w > 1);
}

/* ---------------------------------------------------------------------------
   The breakfast bar.
   --------------------------------------------------------------------------- */

/** How far back from the bar edge the middle of a stool sits.

    Half under the slab and half out, which is where a stool actually is when
    somebody is on it. Tucked right in it disappears under the top and tells
    you nothing about whether anybody fits. */
export const STOOL_SETBACK = 260;

/** How far in from each end of the bar the outermost bracket goes. */
export const BRACKET_INSET = 120;

/**
 * The slab over an island, and how far off centre the bar pushes it.
 *
 * The bar runs out on one side only, so a top 400 wider is also 200 further
 * over. Centring it on the island instead leaves 200 of overhang on the side
 * with no stools at it and 200 short on the side with them.
 */
export function islandSlab(length, depth, over, bar) {
  const along = bar.side === 'left' || bar.side === 'right' ? bar.depth : 0;
  const across = bar.side === 'front' || bar.side === 'back' ? bar.depth : 0;
  const sign = (s) => (bar.side === s ? 1 : 0);
  return {
    over,
    length: length + 2 * over + along,
    across: depth + 2 * over + across,
    shiftX: (sign('right') - sign('left')) * (along / 2),
    shiftZ: (sign('back') - sign('front')) * (across / 2),
  };
}

/** Where the stools go along the bar, and which way each one faces. */
export function barSeatPositions(seats, length, depth, bar, over) {
  if (seats <= 0 || bar.depth <= 0) return [];

  const along = bar.side === 'left' || bar.side === 'right';
  const span = along ? depth : length;
  const step = span / seats;
  const reach = bar.depth + over - STOOL_SETBACK;
  const out = [];

  for (let i = 0; i < seats; i++) {
    const t = (i + 0.5) * step;
    if (bar.side === 'front') out.push({ x: t, z: -reach, rot: Math.PI });
    else if (bar.side === 'back') out.push({ x: t, z: depth + reach, rot: 0 });
    else if (bar.side === 'left') out.push({ x: -reach, z: t, rot: -Math.PI / 2 });
    else out.push({ x: length + reach, z: t, rot: Math.PI / 2 });
  }
  return out;
}

/**
 * Where the brackets go under the bar.
 *
 * One in from each end and the rest spread evenly between them, which is how a
 * bracket run is actually set out. They sit on the carcass line, because that
 * is what they are screwed to.
 */
export function barBracketPositions(count, length, depth, bar) {
  if (count <= 0 || bar.depth <= 0) return [];

  const along = bar.side === 'left' || bar.side === 'right';
  const span = along ? depth : length;
  const out = [];

  for (let i = 0; i < count; i++) {
    const t = BRACKET_INSET
      + ((span - BRACKET_INSET * 2) * i) / Math.max(1, count - 1);
    if (bar.side === 'front') out.push({ x: t, z: 0, rot: Math.PI });
    else if (bar.side === 'back') out.push({ x: t, z: depth, rot: 0 });
    else if (bar.side === 'left') out.push({ x: 0, z: t, rot: -Math.PI / 2 });
    else out.push({ x: length, z: t, rot: Math.PI / 2 });
  }
  return out;
}
