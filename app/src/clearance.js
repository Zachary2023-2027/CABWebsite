/* ===========================================================================
   Clearances, measured across the whole room.

   Everything that decides whether a kitchen can actually be used happens
   where two cabinets meet, and until now every one of those questions was
   asked one wall at a time. That is the wrong frame, and it misses exactly
   the case that costs the most:

     A blind corner runs into the corner. The return cabinets on the next wall
     butt against its side. Their doors, their drawer fronts and their handles
     stand out into the same air the corner cabinet's door has to swing
     through, and on a wall by wall check neither wall can see the other one,
     so both walls report that everything is fine.

   So this file puts every carcass and every front into one set of room
   coordinates and measures them against each other. A wall is turned and
   moved by the room layout. The back of an island is reflected, because it
   faces the other way. After that a corner is not a special case: it is two
   boxes that happen to be near each other.

   Nothing here reads the project. It takes the floor plan the model already
   built and the clearance figures the project already carries, so it cannot
   disagree with either.

   Pure. No React, no DOM.
   =========================================================================== */

import {
  FULL_SWING, degrees, mirrorSector, openUntilBlocked, sectorInRoom, swingSector,
} from './motion.js';
import { round1, whole } from './mm.js';
import { facing, zRange } from './project.js';

/* Two boxes touching is a butt joint, which is how a kitchen is built. Below
   this they are touching; above it they are in each other. */
export const TOUCHING = 0.5;

/* A door that opens a right angle is a usable door: it is what a door against
   a wall does, and it clears its own opening. Warning about it because it is
   not the full 110 would put a warning on half the kitchen and teach you to
   stop reading them. Below a right angle it starts to be in its own way. */
export const USABLE_SWING = 90;

/* ---------------------------------------------------------------------------
   Into the room.
   --------------------------------------------------------------------------- */

/** A point on a wall, in room plan coordinates. */
export function pointInRoom(entry, x, z) {
  const [ox, oy] = entry.origin || [0, 0];
  const rot = entry.rot || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [ox + x * cos + z * sin, oy - x * sin + z * cos];
}

/**
 * A box on a wall, in room plan coordinates.
 *
 * The rotations a room uses are quarter turns, so the corners of an upright
 * box land back on the axes and the result is still axis aligned. That is
 * what lets everything downstream stay a plain rectangle test.
 */
export function boxInRoom(entry, x0, x1, z0, z1, y0, y1, extra = {}) {
  const corners = [
    pointInRoom(entry, x0, z0), pointInRoom(entry, x1, z0),
    pointInRoom(entry, x0, z1), pointInRoom(entry, x1, z1),
  ];
  return {
    x0: Math.min(...corners.map((c) => c[0])),
    x1: Math.max(...corners.map((c) => c[0])),
    z0: Math.min(...corners.map((c) => c[1])),
    z1: Math.max(...corners.map((c) => c[1])),
    y0, y1,
    ...extra,
  };
}

/**
 * The depth range a unit occupies on its own run.
 *
 * The mapping itself lives in the model, so the door this measures is the
 * same door the 3D draws.
 */
export const depthRange = (entry, p, z0, z1) =>
  zRange(facing(p, entry.island ? (entry.depth ?? p.unit.depth) : 0), z0, z1);

/** A readable name for a cabinet, wall and all. */
export const nameOf = (entry, p) =>
  `${entry.wall.name}, ${p.label || p.unit.family.name}`;

/**
 * Every carcass in the room as a box.
 *
 * Fillers and appliance cavities are in here too. A fridge is as solid as a
 * cabinet as far as a door swinging into it is concerned, and a scribe filler
 * is a piece of board standing in the way.
 */
export function carcassBoxes(entries) {
  const out = [];
  for (const entry of entries) {
    for (const p of entry.lay.placed) {
      const [z0, z1] = depthRange(entry, p, 0, p.unit.depth);
      out.push(boxInRoom(entry, p.x, p.x + p.unit.width, z0, z1,
        p.unit.mountY, p.unit.mountY + p.unit.height, {
          uid: p.item.uid,
          wallId: entry.wall.id,
          label: nameOf(entry, p),
          cavity: !!p.unit.cavity,
        }));
    }
  }
  return out;
}

/**
 * Every front in the room as a box, shut.
 *
 * Shut is the point. A door that fouls something when it opens is one
 * problem; a door and a drawer front from two different walls occupying the
 * same air before either of them has moved is a different and worse one, and
 * it is what a corner with no blind cabinet in it actually produces.
 */
export function frontBoxes(entries) {
  const out = [];
  for (const entry of entries) {
    for (const p of entry.lay.placed) {
      if (p.unit.cavity) continue;
      for (const q of p.unit.parts) {
        if (q.group !== 'front' && q.group !== 'filler') continue;
        const [z0, z1] = depthRange(entry, p, q.pos[2], q.pos[2] + q.size[2]);
        out.push(boxInRoom(entry, p.x + q.pos[0], p.x + q.pos[0] + q.size[0], z0, z1,
          p.unit.mountY + q.pos[1], p.unit.mountY + q.pos[1] + q.size[1], {
            uid: p.item.uid,
            wallId: entry.wall.id,
            code: q.code,
            label: `${nameOf(entry, p)}, ${q.name.toLowerCase()}`,
          }));
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Two boxes.
   --------------------------------------------------------------------------- */

const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** How far two boxes are inside each other on every axis, or null. */
export function intrusion(a, b) {
  const x = span(a.x0, a.x1, b.x0, b.x1);
  const z = span(a.z0, a.z1, b.z0, b.z1);
  const y = span(a.y0, a.y1, b.y0, b.y1);
  if (x <= TOUCHING || z <= TOUCHING || y <= TOUCHING) return null;
  return { x: round1(x), z: round1(z), y: round1(y), least: round1(Math.min(x, z)) };
}

/**
 * Which way a front faces, by which of its two plan dimensions is the board.
 *
 * Two fronts thin on the same axis are in the same plane: side by side on one
 * wall, or across a corner facing the same way, and a gap between them is a
 * gap you can measure and reach into. Two fronts thin on different axes are
 * perpendicular, which is what an inside corner is: they meet edge to face
 * and touching is how they are supposed to meet. Measuring a clearance
 * between those two would report every corner in every kitchen.
 */
export const thinAxis = (box) => ((box.x1 - box.x0) <= (box.z1 - box.z0) ? 'x' : 'z');

/**
 * The gap between two boxes in the plan, or null when they never meet.
 *
 * Null covers both the case where they are inside each other, which is a
 * different finding, and the case where they are at heights that can never
 * touch, which is not a finding at all: a wall cabinet 600 above a benchtop
 * is not short of clearance to it.
 */
export function planGap(a, b) {
  if (span(a.y0, a.y1, b.y0, b.y1) <= TOUCHING) return null;
  const x = span(a.x0, a.x1, b.x0, b.x1);
  const z = span(a.z0, a.z1, b.z0, b.z1);
  if (x > TOUCHING && z > TOUCHING) return null;
  const dx = Math.max(0, -x);
  const dz = Math.max(0, -z);
  return round1(Math.hypot(dx, dz));
}

/* ---------------------------------------------------------------------------
   The findings.
   --------------------------------------------------------------------------- */

const finding = (level, rule, text, where, walls) =>
  ({ level, rule, text, where, walls });

/**
 * Everything two runs have to say to each other, plus every door swing in the
 * room measured against everything in it.
 *
 * @param {object[]} entries  the floor plan: every run placed and turned
 * @param {object} clear      the clearance figures, already merged with cfg
 * @returns {{level,rule,text,where,walls}[]}
 */
export function clearanceFindings(entries, clear = {}) {
  const out = [];
  const minFront = Number(clear.frontClearance) || 0;
  const minSwing = Number(clear.doorMinSwing) || 0;

  const carcasses = carcassBoxes(entries);
  const fronts = frontBoxes(entries);

  /* --- carcasses that are inside each other ------------------------------- */

  for (let i = 0; i < carcasses.length; i++) {
    for (let j = i + 1; j < carcasses.length; j++) {
      const a = carcasses[i];
      const b = carcasses[j];
      /* Two cabinets on the same run overlapping is already said, per
         cabinet, on the drawing they are both on. This is the pair the
         drawing cannot see: one on each of two different runs. */
      if (a.wallId === b.wallId) continue;
      const hit = intrusion(a, b);
      if (!hit) continue;
      out.push(finding('error', 'corner',
        `${a.label} and ${b.label} are built through each other by ${whole(hit.least)}mm. Two runs meeting at a corner need a blind corner cabinet in it, or the second run has to start clear of the first.`,
        `${a.label} to ${b.label}`, [a.wallId, b.wallId]));
    }
  }

  /* --- fronts, shut ------------------------------------------------------- */

  for (let i = 0; i < fronts.length; i++) {
    for (let j = i + 1; j < fronts.length; j++) {
      const a = fronts[i];
      const b = fronts[j];
      if (a.uid === b.uid) continue;

      const hit = intrusion(a, b);
      if (hit) {
        out.push(finding('error', 'front-clash',
          `${a.label} and ${b.label} are in the same ${whole(hit.least)}mm of air with both of them shut. Neither will go on, let alone open.`,
          `${a.label} to ${b.label}`, [a.wallId, b.wallId]));
        continue;
      }

      /* Two fronts on the same run are set out by the reveal, which is a
         typed number and already checked. This is about fronts that meet
         because of where their cabinets stand, not because of how their
         cabinet was divided up. */
      if (a.wallId === b.wallId && a.uid !== b.uid) continue;
      if (!minFront) continue;
      // Perpendicular fronts meeting at a corner are meant to touch.
      if (thinAxis(a) !== thinAxis(b)) continue;

      const gap = planGap(a, b);
      if (gap === null || gap >= minFront) continue;
      out.push(finding('warn', 'front-clearance',
        `${whole(gap)}mm between ${a.label} and ${b.label}. Under ${whole(minFront)} you cannot get a hand or a handle in between them, and either one opening rubs the other.`,
        `${a.label} to ${b.label}`, [a.wallId, b.wallId]));
    }
  }

  /* --- doors, opening, against the whole room ----------------------------- */

  for (const entry of entries) {
    for (const p of entry.lay.placed) {
      if (p.unit.cavity || p.unit.kind === 'filler') continue;

      const doors = p.unit.parts.filter(
        (q) => q.group === 'front' && q.code.includes('DOOR'));
      if (!doors.length) continue;

      /* Everything in the room except the cabinet the door belongs to. Its
         own carcass is behind the door, not in front of it. */
      const others = carcasses.filter((c) => c.uid !== p.item.uid);
      const where = nameOf(entry, p);

      for (const door of doors) {
        const face = facing(p, entry.island ? (entry.depth ?? p.unit.depth) : 0);
        let sector = swingSector(door, p.x, FULL_SWING, p.unit.mountY);
        /* A run that is turned around swings its doors the other way. Mirror
           first, in the run's own space, then move the whole run into the
           room: doing it in the other order turns the reflection into a
           rotation and the door opens through the island. */
        sector = face.flip
          ? mirrorSector(sector, face.offset)
          : { ...sector, cz: sector.cz + face.offset };
        sector = sectorInRoom(sector, entry.origin || [0, 0], entry.rot || 0);

        /* How far it gets, and what stops it, in one pass. Naming the thing
           it runs into is the difference between a warning you can act on and
           one you go looking for. */
        const { angle, hit: blocker } = openUntilBlocked(sector, others);
        const deg = degrees(angle);
        if (!blocker || deg >= USABLE_SWING) continue;

        const by = ` It runs into ${blocker.label}.`;

        if (deg < minSwing) {
          out.push(finding('error', 'door-swing',
            `${door.name} only opens ${deg} degrees before it fouls something.${by}`,
            where, [entry.wall.id, blocker.wallId].filter(Boolean)));
        } else {
          out.push(finding('warn', 'door-swing',
            `${door.name} opens ${deg} degrees, short of the right angle it needs to clear its own opening.${by} You will not get a drawer or a tray out past it.`,
            where, [entry.wall.id, blocker.wallId].filter(Boolean)));
        }
      }
    }
  }

  return out;
}

/** The findings that touch one wall, for the strip under its drawing. */
export const findingsForWall = (findings, wallId) =>
  findings.filter((f) => !f.walls || !f.walls.length || f.walls.includes(wallId));
