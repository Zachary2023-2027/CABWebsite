/* ===========================================================================
   Project model.

   A wall holds an ordered run of units. A unit with no position of its own
   flows: it lands wherever the run has got to, so reordering or resizing a
   cabinet moves everything after it, which is what you want while you are
   still deciding what goes where.

   Drag one and it pins: from then on it stays at the millimetre you put it
   at and the flow works around it. Both kinds live in the same run, and
   Close gaps unpins the lot and packs them back together.

   Nothing else in the app knows about this. Positions never reach the cut
   list, the nest or the drilling, because where a cabinet stands does not
   change what it is made of.
   =========================================================================== */

import { FAMILY, PRICES, PROJECT, buildUnit, sheetFor, unitCost } from './catalog.js';
import { NEST, nestProject } from './nesting.js';
import {
  baseRuns, benchArea, benchLength, benchSchedule, benchVolume, endPanelParts, islandBench,
  islandKickRuns, kickParts, pieceVolume, usableLength,
} from './runs.js';
import { BAR_RULES } from './bar.js';
import { assertMm, round1 } from './mm.js';
import { finishFor, roleOf } from './finishes.js';
import { natureOf, obstacleKind, obstacleNote, overlaps } from './obstacles.js';

let seq = 0;
export const uid = () => `u${(seq++).toString(36)}${Date.now().toString(36).slice(-3)}`;

const u = (familyId, settings = {}) => ({ uid: uid(), familyId, settings });

export function starterProject() {
  return {
    name: 'Riverstone kitchen',
    cfg: { ...PROJECT },
    walls: [
      {
        id: 'A', name: 'Wall A', length: 3600,
        obstacles: [{ x: 2400, y: 900, w: 1000, h: 1200, label: 'Window' }],
        units: [
          u('tall-pantry', { width: 600 }),
          u('base-3drawer', { width: 600 }),
          u('base-sink', { width: 900 }),
          u('app-dishwasher', { width: 600 }),
          u('base-2door', { width: 800 }),
          u('filler', { width: 100 }),
          u('wall-2door', { width: 800 }),
          u('wall-2door', { width: 800 }),
          u('wall-open', { width: 800 }),
        ],
      },
      {
        id: 'B', name: 'Wall B', length: 2400,
        obstacles: [],
        units: [
          u('base-4drawer', { width: 600 }),
          u('app-cooktop', { width: 900 }),
          u('base-3drawer', { width: 800 }),
          u('filler', { width: 100 }),
          u('wall-2door', { width: 600 }),
          u('wall-bridge', { width: 900, height: 450 }),
          u('wall-2door', { width: 800 }),
        ],
      },
      {
        id: 'C', name: 'Wall C', length: 1800,
        obstacles: [],
        units: [
          u('app-fridge', { width: 1000, height: 2250 }),
          u('tall-oven', { width: 600 }),
        ],
      },
      { id: 'D', name: 'Wall D', length: 2100, obstacles: [], units: [] },
      {
        id: 'ISL', name: 'Island', kind: 'island', length: 2400, depth: 1120,
        obstacles: [],
        units: [
          u('base-3drawer', { width: 900 }),
          u('base-2door', { width: 900 }),
          u('base-1door', { width: 600 }),
          /* The other side. Back to back with the front run, which is where
             half an island's storage comes from and the reason an island has
             a depth of its own rather than a cabinet's. */
          u('base-2door', { width: 1200, side: 'back' }),
          u('base-2door', { width: 1200, side: 'back' }),
        ],
      },
    ],
    activeWall: 'A',
    room: 'straight',
    locked: [],
    extras: [],
  };
}

/** Which run a unit occupies. Tall and full height appliances take both. */
const occupies = (kind, full) =>
  kind === 'wall' ? 'wall' : (kind === 'tall' || full) ? 'both' : 'base';

/* ---------------------------------------------------------------------------
   Walls, and the thing that is not a wall.

   An island is not a wall. It stands in the middle of the floor with nothing
   behind it, it has a depth of its own rather than borrowing the cabinets',
   and it has two sides you can put cabinets on, back to back, which is where
   half its storage comes from.

   It was a wall with the id ISL, filtered out of the room by name. That is
   why it behaved like one: it took the room's depth, it had one side, and its
   backs were drawn against nothing.
   --------------------------------------------------------------------------- */

export const WALL_KINDS = [
  { id: 'wall', name: 'Wall', note: 'Against a wall. Joins the room shape.' },
  { id: 'island', name: 'Island', note: 'Free standing. Two sides, its own depth.' },
];

/** What a wall is. Anything unrecognised is a wall, which is the common case. */
export function wallKind(wall) {
  if (wall?.kind === 'island') return 'island';
  /* Projects saved before islands were their own thing carry one wall called
     ISL, which the room filtered out by name. Still recognised so those
     projects open as what they meant. */
  if (!wall?.kind && wall?.id === 'ISL') return 'island';
  return 'wall';
}

export const isIsland = (wall) => wallKind(wall) === 'island';

/** How deep an island is. A wall has no depth of its own: its cabinets do. */
export const islandDepth = (wall, cfg) =>
  (Number(wall?.depth) > 0 ? Number(wall.depth) : (cfg?.baseDepth ?? 560) * 2);

/* ---------------------------------------------------------------------------
   The four sides of an island.

   An island is the one run in a kitchen with nothing behind it, so every one
   of its four faces is a face you can stand at and put cabinets on. Two of
   them run along its length and two along its depth, which is the only real
   difference between them.
   --------------------------------------------------------------------------- */

export const ISLAND_SIDES = [
  { id: 'front', name: 'Front', along: 'length' },
  { id: 'back', name: 'Back', along: 'length' },
  { id: 'left', name: 'Left end', along: 'depth' },
  { id: 'right', name: 'Right end', along: 'depth' },
];

export const ISLAND_SIDE_IDS = ISLAND_SIDES.map((s) => s.id);
const SIDE_SET = new Set(ISLAND_SIDE_IDS);

/** Which side of an island a cabinet is on. Anything else is the front. */
export const sideOf = (item) =>
  (SIDE_SET.has(item?.settings?.side) ? item.settings.side : 'front');

/** How long a side is: the island's length, or its depth on an end. */
export function sideRun(wall, cfg, side = 'front') {
  if (!isIsland(wall)) return Number(wall?.length) || 0;
  return (side === 'left' || side === 'right')
    ? islandDepth(wall, cfg)
    : Number(wall.length) || 0;
}

/* ---------------------------------------------------------------------------
   Which way a cabinet faces on its run.

   A wall has one side and everything on it faces the room, so this is the
   identity there and nothing has to know about it.

   An island has two, and they face OPPOSITE ways. That is what makes it an
   island rather than two cabinets glued back to back facing each other: the
   front run's doors open into the front of the island and the back run's into
   the back, and the two carcasses meet in the middle with their backs
   together. Its front face is z 0 and its back face is z depth, which is the
   same convention the walkway check has always measured an island by.

   Stated once here because three places need it and none of them can be
   allowed to have its own version: the 3D that draws it, the door swing that
   asks what it fouls, and the clearance check that measures across the room.
   --------------------------------------------------------------------------- */

/**
 * Where a unit sits on its run, and how far it is turned.
 *
 * This is the one table the whole four sided island rests on. A point in the
 * unit's own space, with x across its width and z running from its back at 0
 * to its front at its depth, lands at
 *
 *     [ox + x cos(rot) + z sin(rot), oz - x sin(rot) + z cos(rot)]
 *
 * which is the same formula the room uses to place a wall, so the two compose
 * without either knowing about the other.
 *
 * A wall has one side and everything on it faces the room, so it is the
 * identity: no turn, and the front lands at the cabinet's own depth.
 *
 * An island has four, and each is a quarter turn. Front and back come out as
 * exactly the transforms this app already used for them, which is the point:
 * this generalises what was there rather than replacing it.
 *
 * @param {object} p          a placed unit
 * @param {number} length     the island's length, 0 for a wall
 * @param {number} depth      the island's depth, 0 for a wall
 * @returns {{origin:[number,number], rot:number}}
 */
export function unitFrame(p, length = 0, depth = 0) {
  const along = p.x;
  const w = p.unit.width;
  const d = p.unit.depth;

  if (!depth) return { origin: [along, 0], rot: 0 };

  switch (p.side) {
    case 'back': return { origin: [along, depth - d], rot: 0 };
    case 'left': return { origin: [d, along], rot: -Math.PI / 2 };
    case 'right': return { origin: [length - d, along + w], rot: Math.PI / 2 };
    default: return { origin: [along + w, d], rot: Math.PI };
  }
}

/** A point in a unit's own space, put on its run. */
export function framePoint(frame, x, z) {
  const cos = Math.cos(frame.rot);
  const sin = Math.sin(frame.rot);
  return [
    frame.origin[0] + x * cos + z * sin,
    frame.origin[1] - x * sin + z * cos,
  ];
}

/**
 * A box in a unit's own space, put on its run, as an axis aligned box.
 *
 * The turns are all quarters, so an upright box lands back on the axes and
 * everything downstream stays a plain rectangle test.
 */
export function frameBox(frame, x0, x1, z0, z1) {
  const pts = [
    framePoint(frame, x0, z0), framePoint(frame, x1, z0),
    framePoint(frame, x0, z1), framePoint(frame, x1, z1),
  ];
  return {
    x0: Math.min(...pts.map((q) => q[0])),
    x1: Math.max(...pts.map((q) => q[0])),
    z0: Math.min(...pts.map((q) => q[1])),
    z1: Math.max(...pts.map((q) => q[1])),
  };
}

/**
 * Where an island stands on the floor.
 *
 * Free standing has to mean somewhere. Without a position an island cannot be
 * drawn in the room with the walls, and the gap between it and the run behind
 * it, which is the clearance that matters most in a kitchen with an island,
 * cannot be measured at all.
 *
 * Measured from the same corner the room is: along the back wall, then out
 * into the room. No rotation: an island square to the run is what nearly
 * every one is, and an angled one is a different drawing problem than this
 * model is set up for.
 */
export const islandAt = (wall, cfg) => ({
  x: Number.isFinite(Number(wall?.at?.x)) ? Number(wall.at.x) : 800,
  y: Number.isFinite(Number(wall?.at?.y))
    ? Number(wall.at.y)
    : (cfg?.baseDepth ?? 560) + (cfg?.walkwayComfortable ?? 1200),
});

/* --- the breakfast bar ----------------------------------------------------

   An island's top can run on past its carcass far enough to sit at. That is
   one number and one choice of side, and everything else about a breakfast
   bar follows from them: how much top you are buying, how many stools fit,
   whether it holds itself up, and how much floor has to be left behind it for
   somebody to pull a stool out and sit down.

   It is a property of the island rather than of any cabinet, because it is the
   top that overhangs and the top belongs to the island. Nothing is built here:
   no carcass changes, no extra parts. The slab gets bigger and the room gets
   smaller, and both of those are already things this model knows how to say.
   -------------------------------------------------------------------------- */

export const BAR_SIDES = [
  { id: 'none', name: 'None' },
  { id: 'front', name: 'Front' },
  { id: 'back', name: 'Back' },
  { id: 'left', name: 'Left end' },
  { id: 'right', name: 'Right end' },
];

const BAR_SIDE_IDS = new Set(BAR_SIDES.map((s) => s.id));

/** No bar. One object, so a project without one is not a special case. */
export const NO_BAR = Object.freeze({ side: 'none', depth: 0, from: 0, length: null });

/**
 * The breakfast bar on an island, as the model sees it.
 *
 * A side nobody recognises, or an overhang of nothing, is no bar at all
 * rather than a broken one.
 *
 * @returns {{side:string, depth:number}}
 */
/**
 * Every breakfast bar on an island.
 *
 * A list, because an island has four sides and a kitchen can want a bar on
 * more than one of them: an overhang along the back to sit at and a return
 * across an end is an ordinary thing to build and could not be said at all.
 *
 * A project saved when there was only ever one bar carries `bar` rather than
 * `bars`, and opens as a list of one.
 */
export function islandBars(wall) {
  const raw = Array.isArray(wall?.bars) ? wall.bars
    : (wall?.bar ? [wall.bar] : []);

  const out = [];
  const used = new Set();
  for (const one of raw) {
    const bar = cleanOneBar(one);
    if (bar.depth <= 0) continue;
    // One bar per side. Two overhangs off the same edge is one overhang.
    if (used.has(bar.side)) continue;
    used.add(bar.side);
    out.push(bar);
  }
  return out;
}

/** The bar on one side, or no bar. */
export const barOnSide = (wall, side) =>
  islandBars(wall).find((b) => b.side === side) || NO_BAR;

/**
 * The first bar, for everything written when there could only be one.
 *
 * Kept so nothing that reads a single bar has to learn about the list before
 * it is worth its while, and so a project with one bar behaves exactly as it
 * did.
 */
export function islandBar(wall) {
  const all = islandBars(wall);
  return all.length ? all[0] : NO_BAR;
}

function cleanOneBar(raw) {
  const side = BAR_SIDE_IDS.has(raw?.side) ? raw.side : 'none';
  const depth = Number.isFinite(Number(raw?.depth)) ? Math.max(0, Number(raw.depth)) : 0;
  if (side === 'none' || depth <= 0) return NO_BAR;

  /* How much of that side the bar runs along, and where it starts.

     A bar was the whole of one side or nothing, which is not what people
     build. Half of a 2400 island is a bar with two stools at one end and
     ordinary cabinet behind the rest, and there was no way to say it: you
     got a 2400 overhang and a bracket count and a stool count for a bar
     twice the size of the one you were making.

     Left empty the length is the whole side, which is what every project
     that already exists gets. */
  const from = Number.isFinite(Number(raw?.from)) ? Math.max(0, Number(raw.from)) : 0;
  const length = Number.isFinite(Number(raw?.length)) && Number(raw.length) > 0
    ? Number(raw.length) : null;

  return { side, depth: round1(depth), from: round1(from), length: length && round1(length) };
}

/** True when a side of an island carries the bar. */
export const barOn = (bar, side) => bar.side === side && bar.depth > 0;

/**
 * How long the bar edge is, which is what the stools and the brackets are
 * spaced along.
 *
 * A bar on the front or the back runs the island's length. One on an end runs
 * its depth. Getting these the wrong way round on a long shallow island is the
 * difference between six stools and two.
 */
/** The whole of the side a bar is on, whether or not the bar fills it. */
export function barSideLength(wall, cfg, bar = islandBar(wall)) {
  return bar.side === 'left' || bar.side === 'right'
    ? islandDepth(wall, cfg)
    : Number(wall.length) || 0;
}

/**
 * How long the bar edge is, which is what the stools and the brackets are
 * spaced along.
 *
 * The part of the side the bar actually runs along, clipped to the side it is
 * on: a start past the end of the island, or a length longer than the side,
 * is a bar as long as the side and not a bar hanging off the end of it.
 */
export function barSpan(wall, cfg, bar = islandBar(wall)) {
  if (bar.depth <= 0) return 0;
  const side = barSideLength(wall, cfg, bar);
  const from = Math.min(bar.from || 0, side);
  const want = bar.length == null ? side - from : bar.length;
  return round1(Math.max(0, Math.min(want, side - from)));
}

/** Where the bar starts and ends along its side, clipped the same way. */
export function barRange(wall, cfg, bar = islandBar(wall)) {
  const from = Math.min(bar.from || 0, barSideLength(wall, cfg, bar));
  return { from: round1(from), to: round1(from + barSpan(wall, cfg, bar)) };
}

/** True when the bar runs the whole of its side, which is the simple case. */
export function barIsWholeSide(wall, cfg, bar = islandBar(wall)) {
  if (bar.depth <= 0) return false;
  const side = barSideLength(wall, cfg, bar);
  const r = barRange(wall, cfg, bar);
  return r.from <= 0.5 && r.to >= side - 0.5;
}

/**
 * How many stools fit along it.
 *
 * Elbow room per seat, not stool width: two stools touching is two stools
 * nobody can sit on at once.
 */
/** The stools at every bar on an island, and the brackets under all of them. */
export const barSeatsAll = (wall, cfg, clear) =>
  islandBars(wall).reduce((a, b) => a + barSeats(wall, cfg, clear, b), 0);

export const barBracketsAll = (wall, cfg, clear) =>
  islandBars(wall).reduce((a, b) => a + barBrackets(wall, cfg, clear, b), 0);

export function barSeats(wall, cfg, clear, bar = islandBar(wall)) {
  const each = Number(clear?.barSeatWidth) || 0;
  if (bar.depth <= 0 || each <= 0) return 0;
  return Math.floor(barSpan(wall, cfg, bar) / each);
}

/**
 * How many brackets or legs the overhang needs.
 *
 * None while it carries itself. Once it does not, one at each end and enough
 * between them to keep to the spacing, which is the way a bracket run is
 * actually set out: you do not fit two thirds of a bracket in the middle.
 */
export function barBrackets(wall, cfg, clear, bar = islandBar(wall)) {
  if (bar.depth <= 0) return 0;
  const carries = Number(clear?.barMaxUnsupported) || 0;
  if (bar.depth <= carries) return 0;

  const spacing = Number(clear?.barBracketSpacing) || 0;
  const span = barSpan(wall, cfg, bar);
  if (spacing <= 0 || span <= 0) return 2;
  return Math.max(2, Math.ceil(span / spacing) + 1);
}

/**
 * Everything standing on the floor, placed and turned.
 *
 * The joined walls, then the islands where they actually stand. roomLayout is
 * the corner run on its own, because the corner offsets are worked out along
 * it and an island is not part of that. Anything that wants the whole floor,
 * rather than the run, wants this.
 */
export function floorPlan(project) {
  const cfg = project.cfg;
  const walls = roomLayout(project);
  const inRun = new Set(walls.map((r) => r.wall.id));

  const islands = project.walls
    .filter((w) => isIsland(w) && !inRun.has(w.id))
    .map((wall) => {
      const at = islandAt(wall, cfg);
      return {
        wall,
        lay: layoutWall(wall, cfg, 0),
        origin: [at.x, at.y],
        rot: 0,
        corner: false,
        island: true,
        depth: islandDepth(wall, cfg),
        /* Carried here so the checks and the 3D read the same bars the price
           did, rather than each working it out off the wall record. */
        bar: islandBar(wall),
        bars: islandBars(wall).map((b) => ({ ...b, span: barSpan(wall, cfg, b) })),
      };
    });

  return [...walls, ...islands];
}

/**
 * Resolve a wall into placed units with real x positions.
 * Two cursors: the base run along the floor and the wall run above it.
 */
export function layoutWall(wall, cfg = PROJECT, startOffset = 0, endReserve = 0) {
  /* A run does not always start at zero. In an L or a U the second wall
     starts clear of the corner cabinet on the wall before it, because that
     cabinet's carcass is already occupying the first few hundred
     millimetres of this wall.

     It does not always finish at the wall's length either. A corner is built
     from one leg of the L or the other, and when it is built from the next
     wall the cabinet reaches back into this one, so this wall has to stop
     short by the same amount. */
  assertMm(wall.length, `${wall.id} length`);
  assertMm(startOffset, `${wall.id} start offset`);
  assertMm(endReserve, `${wall.id} end reserve`);

  const island = isIsland(wall);

  /* An island has two sides and they are laid out independently: a cabinet on
     the back does not push one on the front along. A wall has one side, and
     everything on it is on the front, so the same code covers both. */
  /* One cursor per side. A wall has one side and everything is on the front.
     An island has four and they fill independently: a cabinet on its left end
     does not push one on its front along, and a full front does not make the
     left end full. */
  const cursors = {
    front: { base: startOffset, wall: startOffset },
    back: { base: 0, wall: 0 },
    left: { base: 0, wall: 0 },
    right: { base: 0, wall: 0 },
  };
  let n = 0;
  let f = 0;
  const placed = [];

  for (const item of wall.units) {
    const fam = FAMILY[item.familyId];
    if (!fam) continue;

    /* Number the cabinet before building it, so every part code carries the
       cabinet number you see on the drawing. A part called A1-SIDE-L tells
       you where it goes. One called U0NP-SIDE-L tells you nothing. */
    const isFiller = fam.kind === 'filler';
    if (isFiller) f += 1; else n += 1;
    const label = isFiller ? null : `${wall.id}${n}`;
    const codeId = label || `${wall.id}F${f}`;

    const unit = buildUnit(codeId, item.familyId, item.settings, cfg);
    const where = occupies(unit.kind, unit.fullHeight);

    /* A pinned unit sits where you put it. The cursor still advances past
       it, so anything flowing after it carries on from its right hand edge
       rather than being drawn straight through it. */
    const raw = Number(item.settings?.x);
    const pinned = Number.isFinite(raw) ? Math.max(0, raw) : null;

    const side = island ? sideOf(item) : 'front';
    const c = cursors[side];

    let x;
    if (where === 'both') {
      x = pinned ?? Math.max(c.base, c.wall);
      c.base = c.wall = Math.max(c.base, c.wall, x + unit.width);
    } else if (where === 'wall') {
      x = pinned ?? c.wall;
      c.wall = Math.max(c.wall, x + unit.width);
    } else {
      x = pinned ?? c.base;
      c.base = Math.max(c.base, x + unit.width);
    }

    placed.push({ item, unit, x, where, side, label, codeId, pinned: pinned !== null });
  }

  /* How far along has been filled. An island reports the fullest of its four
     sides, because that is the one that has to fit. */
  const sides = Object.values(cursors);
  const baseRun = Math.max(...sides.map((c) => c.base));
  const wallRun = Math.max(...sides.map((c) => c.wall));

  /* The last millimetre a cabinet on this wall may reach. Everything that
     places, snaps, gaps or complains measures against this rather than the
     wall's length, so the corner cabinet standing on the next wall is a
     boundary the whole app can see rather than one only the drawing knows. */
  const limit = Math.max(startOffset, wall.length - endReserve);

  return {
    placed, baseRun, wallRun, run: Math.max(baseRun, wallRun),
    wall, startOffset, endReserve, limit, island,
    cursors,
    /* Each side on its own, for anything that draws or measures one at a
       time. A wall has everything on its front and the other three empty,
       which every consumer can ignore without knowing why. */
    front: placed.filter((p) => p.side === 'front'),
    back: placed.filter((p) => p.side === 'back'),
    left: placed.filter((p) => p.side === 'left'),
    right: placed.filter((p) => p.side === 'right'),
    /* How long each side is, so nothing has to work it out again from the
       island's length and depth and get the ends the wrong way round. */
    runOf: (side) => (island
      ? ((side === 'left' || side === 'right')
        ? (Number(wall.depth) > 0 ? Number(wall.depth) : (cfg?.baseDepth ?? 560) * 2)
        : wall.length)
      : wall.length),
  };
}

/* --- room shape -----------------------------------------------------------

   A kitchen is not always one wall. The shape decides which walls join at a
   corner, where each one starts, and how it is turned in the 3D view.

   Wall A runs along the back. In an L, wall B turns at the right hand end of
   A and runs toward you. In a U, wall C runs the other side. The island is
   never part of the joined run: it stands on its own.

   The rotations are the only ones that put the cabinet fronts on the inside
   of the room. Turning the return wall the other way puts every door facing
   the wall behind it, which looks fine in plan and is useless to build from.
   ========================================================================== */

export const ROOM_SHAPES = [
  { id: 'straight', name: 'One wall', walls: 1 },
  { id: 'l', name: 'L shape', walls: 2 },
  { id: 'u', name: 'U shape', walls: 3 },
];

export const roomShape = (project) =>
  ROOM_SHAPES.find((s) => s.id === project.room) ? project.room : 'straight';

/** The walls that form the joined run, in corner order. */
export function roomWallIds(project) {
  const n = ROOM_SHAPES.find((s) => s.id === roomShape(project)).walls;
  /* By what it is, not by what it is called. Filtering on the id ISL meant a
     second island, or one you renamed, joined the room and turned a corner. */
  return project.walls.filter((w) => !isIsland(w)).slice(0, n).map((w) => w.id);
}

/**
 * Resolve the whole room: every joined wall placed and turned, plus the
 * corner offset each one inherits from the wall before it.
 */
export function roomLayout(project) {
  const offsets = roomOffsets(project);
  const ids = roomWallIds(project);
  const out = [];

  for (const [i, id] of ids.entries()) {
    const wall = project.walls.find((w) => w.id === id);
    if (!wall) continue;
    const o = offsets[id] || {};
    const lay = layoutWall(wall, project.cfg, o.start || 0, o.end || 0);

    /* Where this wall sits in the room, and how far it is turned. The first
       wall is the back wall. The second turns at its right hand end. The
       third comes back down the other side. */
    let origin = [0, 0];
    let rot = 0;
    if (i === 1) { origin = [out[0].wall.length, 0]; rot = -Math.PI / 2; }
    if (i === 2) { origin = [0, wall.length]; rot = Math.PI / 2; }

    out.push({ wall, lay, origin, rot, corner: i > 0 });
  }

  return out;
}

/**
 * The corner cabinet on a wall, if there is one.
 *
 * It is looked for anywhere in the base run, not only at the very end. A
 * filler tucked in after it is a normal enough mistake, and quietly doing
 * nothing because the last unit was not the corner is worse than turning the
 * corner and saying the order is wrong.
 */
export const cornerUnit = (lay) =>
  lay.placed.find((p) => p.where !== 'wall' && p.unit.corner) || null;

/**
 * Which end of its own wall a blind corner runs into.
 *
 * A corner is built from one leg of the L or the other, and the blind side
 * setting is what says which. Blind on the right means the dead part of the
 * front is at the right hand end, so the cabinet sits at the end of its wall
 * and reaches forward into the next one. Blind on the left means it sits at
 * the start and reaches back into the wall before it.
 */
export const cornerSide = (p) =>
  ((p.unit.settings?.blindSide || 'right') === 'left' ? 'start' : 'end');

/** The corner cabinet reaching forward off the end of this wall, if any. */
export const cornerAtEnd = (lay) => {
  const c = cornerUnit(lay);
  return c && cornerSide(c) === 'end' ? c : null;
};

/** The corner cabinet standing at the start of this wall, reaching back. */
export const cornerAtStart = (lay) => {
  const c = cornerUnit(lay);
  return c && cornerSide(c) === 'start' ? c : null;
};

/** True when the corner cabinet is the last thing in the base run. */
export function cornerIsLast(lay) {
  const run = lay.placed.filter((p) => p.where !== 'wall');
  return run.length > 0 && !!run[run.length - 1].unit.corner;
}

/** True when the corner cabinet is the first thing in the base run. */
export function cornerIsFirst(lay) {
  const run = lay.placed.filter((p) => p.where !== 'wall');
  return run.length > 0 && !!run[0].unit.corner;
}

/**
 * Every wall's corner offsets in one pass. The list builders take this once
 * and reuse it, rather than resolving the room for each wall in turn.
 *
 * Two passes, because a corner has two legs and the cabinet can stand on
 * either. Forward is what a wall inherits from the corner cabinet at the end
 * of the wall before it. Backward is what a wall gives up at its own far end
 * to a corner cabinet standing at the start of the wall after it. Only the
 * forward half used to exist, so building the corner from the second leg
 * drew the two runs straight through each other.
 *
 * @returns {Object<string, {start:number, end:number}>}
 */
export function roomOffsets(project) {
  const cfg = project.cfg;
  const walls = roomWallIds(project)
    .map((id) => project.walls.find((w) => w.id === id))
    .filter(Boolean);

  const lays = [];
  let start = 0;
  for (const wall of walls) {
    const lay = layoutWall(wall, cfg, start);
    lays.push(lay);
    const corner = cornerAtEnd(lay);
    start = corner ? corner.unit.cornerReturn : 0;
  }

  const out = {};
  for (const [i, wall] of walls.entries()) {
    const next = i < walls.length - 1 ? cornerAtStart(lays[i + 1]) : null;
    out[wall.id] = {
      start: lays[i].startOffset,
      end: next ? next.unit.cornerReturn : 0,
    };
  }
  return out;
}

/** Lay out a wall with whatever corner offsets the room gives it. */
export const layoutFor = (project, wall, offsets) => {
  const o = (offsets || roomOffsets(project))[wall.id] || {};
  return layoutWall(wall, project.cfg, o.start || 0, o.end || 0);
};

/** Walls that are not part of the joined run, so the island and any spares. */
export const looseWalls = (project) => {
  const ids = new Set(roomWallIds(project));
  return project.walls.filter((w) => !ids.has(w.id));
};

/** The corner offset a wall inherits, or zero when it is not in the run. */
export const wallOffset = (project, wallId) => roomOffsets(project)[wallId]?.start || 0;

/**
 * The saw settings for a project, for anything that nests.
 *
 * Every screen that lays parts out on sheets has to use the same numbers, or
 * the cut list, the sheet drawings, the costing and the print pack quietly
 * disagree about how many sheets you are buying.
 */
export function nestCfg(project) {
  const c = project?.cfg || {};
  const pick = (k) => (Number.isFinite(Number(c[k])) && Number(c[k]) >= 0 ? Number(c[k]) : NEST[k]);
  return { kerf: pick('kerf'), trim: pick('trim'), minOffcut: pick('minOffcut') };
}

/* --- placing and snapping -------------------------------------------------

   Dragging a cabinet to the millimetre with a finger on a tablet is not
   going to happen, and it is not what you want anyway: cabinets butt against
   each other and against the ends of the wall, and anything in between is a
   gap you will have to fill later. So a drag looks for the joins that
   matter and pulls to the nearest one.
   ========================================================================== */

export const SNAP = {
  tolerance: 60,       // how close a join has to be before it takes hold
  cornerPull: 400,     // a corner cabinet is pulled much harder, see below
  /* A doorway is pulled hard for the same reason a corner is: there is
     exactly one position beside it that works, and the whole point of
     dragging a fridge up to a doorway is to land against its edge. */
  obstaclePull: 250,
};

/* ---------------------------------------------------------------------------
   The stretches of wall a cabinet may not stand in.

   An obstacle set to "In the way" is not advice. A doorway is not somewhere
   you put a fridge and then get a warning about: it is 820mm of wall that
   does not exist as far as the run is concerned. So it comes out of the wall
   before anything is placed, snapped or packed, and the warning is only there
   for the case the model cannot prevent, which is moving the doorway after
   the cabinets are down.

   The height band matters and is easy to drop. A window at 900 blocks a base
   cabinet and a tall pantry and does not block a wall cabinet at 1500: they
   are at different heights and they never meet.
   --------------------------------------------------------------------------- */

/**
 * @param {object} lay
 * @param {object} unit    the unit being placed, for its height band
 * @returns {{x0:number, x1:number, label:string}[]} in order along the wall
 */
export function blockingSpans(lay, unit) {
  const y0 = unit?.mountY ?? 0;
  const y1 = y0 + (unit?.height ?? 0);
  const out = [];

  for (const o of lay.wall.obstacles || []) {
    if (natureOf(o) !== 'blocks') continue;
    // Heights that could never touch are not in each other's way.
    if (y1 > y0 && (y0 >= o.y + o.h || y1 <= o.y)) continue;
    out.push({
      x0: o.x, x1: o.x + o.w,
      label: (o.label || obstacleKind(o.kind).name).toLowerCase(),
    });
  }
  return out.sort((a, b) => a.x0 - b.x0);
}

/**
 * The nearest position that does not stand a cabinet in a doorway.
 *
 * Pushed to whichever side of the obstacle is closer, and to the other one
 * when that side runs off the start of the wall. Repeated, because pushing
 * clear of one obstacle can land on the next.
 *
 * @returns {{x:number, blocked:?object}} blocked is what it was pushed off
 */
export function clearOfBlocks(lay, unit, x, spans = blockingSpans(lay, unit)) {
  const w = unit.width;
  let out = x;
  let blocked = null;

  for (let pass = 0; pass <= spans.length; pass++) {
    const hit = spans.find((s) => out < s.x1 - 0.5 && out + w > s.x0 + 0.5);
    if (!hit) break;
    blocked = hit;
    const left = hit.x0 - w;
    const right = hit.x1;
    out = (left >= 0 && Math.abs(left - out) <= Math.abs(right - out)) ? left : right;
  }

  return { x: Math.max(0, out), blocked };
}

/** Which run a placed unit shares with the one being dragged. */
const sameRun = (a, b) => a === b || a === 'both' || b === 'both';

/**
 * Every position worth snapping a unit to on its wall.
 * @returns {{x:number, kind:string, label:string, pull:number}[]}
 */
export function snapTargets(lay, item, unit, opts = SNAP) {
  const where = occupies(unit.kind, unit.fullHeight);
  const w = unit.width;
  const out = [];
  const add = (x, kind, label, pull = opts.tolerance) => {
    if (Number.isFinite(x)) out.push({ x, kind, label, pull });
  };

  /* The two ends of the side this cabinet is on. On a wall that is the wall;
     on an island's end it is the island's depth, not its length. */
  const runLen = lay.runOf ? lay.runOf(lay.island ? sideOf(item) : 'front') : lay.wall.length;

  add(lay.startOffset, 'start', 'start of the run');

  /* The far end, which is not always the end of the wall. When the corner is
     built from the next wall, that cabinet reaches back to here, and butting
     against its side is the join that closes the L. It gets a corner's pull
     rather than a plain end's: it is the one position in that whole stretch
     that works, and the next wall's drawing is where you can see why. */
  if (lay.endReserve > 0) {
    add(lay.limit - w, 'corner', 'the corner cabinet on the next wall', opts.cornerPull);
  } else {
    add(runLen - w, 'end', 'end of the run');
  }

  /* Only what is beside it. Every side of an island runs along the same
     numbers, so without this a cabinet on the back snaps to the edges of
     cabinets on the front, which are behind it rather than next to it. */
  const side = lay.island ? sideOf(item) : null;

  for (const p of lay.placed) {
    if (p.item.uid === item.uid) continue;
    if (!sameRun(where, p.where)) continue;
    if (side !== null && p.side !== side) continue;
    add(p.x + p.unit.width, 'butt', `right of ${p.label || p.unit.family.name}`);
    add(p.x - w, 'butt', `left of ${p.label || p.unit.family.name}`);
  }

  /* Either side of anything you have to build around. A fridge beside a
     doorway lands against its architrave, not 40mm short of it and not 40mm
     over it, and there is no other position in that stretch of wall that is
     any use at all. */
  for (const b of blockingSpans(lay, unit)) {
    add(b.x0 - w, 'obstacle', `left of the ${b.label}`, opts.obstaclePull ?? opts.tolerance);
    add(b.x1, 'obstacle', `right of the ${b.label}`, opts.obstaclePull ?? opts.tolerance);
  }

  /* A blind corner belongs in the corner and nowhere else, so it is pulled
     from much further out. Dropping it anywhere near the right end of an L
     puts it exactly in the corner, which is the only place it works. */
  if (unit.corner) {
    const left = (unit.settings?.blindSide || 'right') === 'left';
    add(left ? lay.startOffset : lay.limit - w, 'corner', 'the corner', opts.cornerPull);
  }

  return out;
}

/**
 * Snap a dragged position to the nearest join.
 * @returns {{x:number, snap:{x,kind,label}|null}}
 */
export function snapX(lay, item, unit, rawX, opts = SNAP) {
  const targets = snapTargets(lay, item, unit, opts);
  let best = null;
  for (const c of targets) {
    const d = Math.abs(c.x - rawX);
    if (d > c.pull) continue;
    /* A corner beats a plain butt joint at the same distance, because that
       is the join that decides whether the kitchen closes up at all. An
       obstacle beats one too: there is one position beside a doorway and any
       number of places to butt two cabinets together. */
    const rank = (c.kind === 'corner' || c.kind === 'obstacle') ? -1 : 0;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) {
      best = { ...c, d, rank };
    }
  }

  /* Whatever the drag and the snap between them decided, a cabinet does not
     end up standing in a doorway. The push happens last so it wins over
     everything, including a snap that would have put it there. */
  const wanted = Math.max(0, Math.round(best ? best.x : rawX));
  const cleared = clearOfBlocks(lay, unit, wanted);
  const x = Math.round(cleared.x);

  if (cleared.blocked && x !== wanted) {
    return {
      x,
      snap: { x, kind: 'obstacle', label: `clear of the ${cleared.blocked.label}` },
    };
  }
  return { x, snap: best ? { x: best.x, kind: best.kind, label: best.label } : null };
}

/**
 * The first place a cabinet of this width will fit on a wall, or null if it
 * will not. Used when you add one, so it lands in the first real gap rather
 * than on top of something.
 */
/**
 * The corners of an island side that the sides next to it already fill.
 *
 * A cabinet on an end butts against the ends of the front and back runs, so
 * what an end really has is its depth less however deep those two are. On a
 * 1120 island with 560 cabinets front and back, that is nothing at all: the
 * ends are the exposed side panels of the long runs and there is no room on
 * them, which is exactly how a real island is built.
 *
 * Taking it off the run rather than warning about it afterwards is what stops
 * a cabinet being dropped straight into a corner that is already full.
 *
 * @returns {[number, number][]} spans of the side that are already occupied
 */
export function cornerTaken(lay, side) {
  if (!lay.island) return [];

  const ends = side === 'left' || side === 'right';
  // The two sides that run into this one's corners, in order along it.
  const [atStart, atEnd] = ends ? ['front', 'back'] : ['left', 'right'];

  const deepest = (which) => lay.placed
    .filter((p) => p.side === which && p.where !== 'wall')
    .reduce((a, p) => Math.max(a, p.unit.depth || 0), 0);

  const run = lay.runOf(side);
  const out = [];
  const a = deepest(atStart);
  const b = deepest(atEnd);
  if (a > 0) out.push([0, a]);
  if (b > 0) out.push([Math.max(0, run - b), run]);
  return out;
}

export function firstFreeX(lay, unit, width, side = 'front') {
  const where = occupies(unit.kind, unit.fullHeight);
  const runLen = lay.runOf ? lay.runOf(side) : lay.wall.length;
  /* Only what is on the same side counts. A cabinet on the back of an island
     does not push one on the front along, so looking at both sides finds the
     island full when the side you are adding to is empty.

     A doorway counts on both sides, because it is not a cabinet: it is a
     stretch of wall that is not there. Adding it here rather than warning
     about it afterwards is what stops a new cabinet landing in one. */
  const taken = [
    ...lay.placed
      .filter((p) => (lay.island ? p.side === side : true))
      .filter((p) => sameRun(where, p.where))
      .map((p) => [p.x, p.x + p.unit.width]),
    ...blockingSpans(lay, unit).map((b) => [b.x0, b.x1]),
    /* And the corners the sides next to this one already stand in. */
    ...cornerTaken(lay, side),
  ].sort((a, b) => a[0] - b[0]);

  let cursor = lay.startOffset;
  for (const [a, b] of taken) {
    if (a - cursor >= width) return cursor;
    cursor = Math.max(cursor, b);
  }
  /* An island's end is as long as the island is deep, which is not what the
     wall's limit says. */
  const stop = lay.island ? runLen : lay.limit;
  return cursor + width <= stop + 0.5 ? cursor : null;
}

/**
 * Where a cabinet goes when you add it, and which side it ends up on.
 *
 * An island has a second side, so a full one is not the end of it: the same
 * idea as a cabinet carrying on around a corner when its wall runs out. Keep
 * filling the thing you are working on rather than stacking cabinets past its
 * end.
 *
 * A wall has one side and nowhere to spill to, so it gets the answer it
 * always got. That guard has to live here rather than in the screen, because
 * a screen that reimplements it will get it wrong in exactly the way a test
 * of the screen's copy will not notice.
 *
 * @returns {{x: ?number, side: string}} x null when it fits nowhere
 */
export function placeOnRun(lay, unit, width, want = 'front') {
  const side = SIDE_SET.has(want) ? want : 'front';
  const first = firstFreeX(lay, unit, width, side);
  if (first !== null) return { x: first, side };

  if (!lay.island) return { x: null, side };

  /* Round the island, starting from the one you are looking at. A full front
     is not a full island: there are three more faces on it, and filling the
     thing you are working on beats stacking cabinets past the end of one
     side of it. */
  const order = ISLAND_SIDE_IDS.filter((id) => id !== side);
  for (const other of order) {
    const at = firstFreeX(lay, unit, width, other);
    if (at !== null) return { x: at, side: other };
  }
  return { x: null, side };
}

/**
 * Gaps left in a run, so the wall can say where they are.
 *
 * A side has to be named on an island. Its two sides occupy the same stretch
 * of x and fill independently, so taking both at once reads a full front and
 * an empty back as one full run with no gaps in it, and every gap on the back
 * of an island went unreported.
 */
export function runGaps(lay, which = 'base', side = null) {
  const spans = lay.placed
    .filter((p) => (which === 'wall' ? p.where !== 'base' : p.where !== 'wall'))
    .filter((p) => side === null || p.side === side)
    .map((p) => [p.x, p.x + p.unit.width])
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return [];

  const gaps = [];
  let cursor = lay.startOffset;
  for (const [a, b] of spans) {
    if (a - cursor > 5) gaps.push({ x: cursor, w: a - cursor });
    cursor = Math.max(cursor, b);
  }
  /* Against the limit, not the wall. The stretch a corner cabinet on the next
     wall is standing in is not a gap you can fill: it is already full. On an
     island the limit is the side's own length, which on an end is the depth. */
  const stop = lay.island && side ? lay.runOf(side) : lay.limit;
  if (stop - cursor > 5) gaps.push({ x: cursor, w: stop - cursor, trailing: true });
  return gaps;
}

/* --- warnings, drawn on the cabinet itself -------------------------------- */

export function unitWarnings(p, lay, cfg = PROJECT) {
  const out = [];
  const { unit, x } = p;
  const s = unit.settings;

  /* An island's end is as long as the island is deep. Measuring a cabinet on
     it against the island's length says a 600 cabinet on a 1120 deep end has
     1800mm of room, which it does not. */
  const stop = lay.island && lay.runOf ? lay.runOf(p.side) : lay.limit;
  if (x + unit.width > stop + 0.5) {
    const over = Math.round(x + unit.width - stop);
    const name = ISLAND_SIDES.find((q) => q.id === p.side)?.name.toLowerCase();
    out.push(lay.endReserve > 0
      ? `Runs ${over}mm into the corner cabinet on the next wall`
      : lay.island
        ? `Past the end of the ${name} by ${over}mm`
        : `Past the end of the wall by ${over}mm`);
  }

  /* Two cabinets in the same run cannot occupy the same millimetres. Before
     you could drag one this was impossible by construction, so it was never
     worth saying.

     Every one of them, not the first. A cabinet dragged across two others is
     wrong twice, and being told about one of them and then finding the other
     after you fix it is how you lose an afternoon.

     On the same SIDE of the run as well. An island's two sides run along the
     same stretch of x back to back, so without this every cabinet on the
     front of one was reported as overlapping the cabinet behind it, which is
     not an overlap: it is what back to back means. */
  for (const q of lay.placed) {
    if (q.item.uid === p.item.uid) continue;
    if (!sameRun(p.where, q.where)) continue;
    if (lay.island && q.side !== p.side) continue;
    const over = Math.min(x + unit.width, q.x + q.unit.width) - Math.max(x, q.x);
    if (over > 0.5) {
      out.push(`Overlaps ${q.label || q.unit.family.name} by ${Math.round(over)}mm`);
    }
  }

  if ((s.shelves ?? 0) > 0) {
    const span = unit.width - 2 * cfg.carcassThk;
    if (span > 800) out.push(`Shelf span ${span}mm. Over 800 a 16mm shelf sags, add a support`);
  }

  if (unit.family.fronts === 'drawers' && unit.width > 900) {
    out.push(`Drawer ${unit.width}mm wide. Standard runners stop at 900`);
  }

  if (unit.kind === 'filler' && unit.width > 100) {
    out.push(`Filler ${unit.width}mm. Over 100 looks like a mistake, add a cabinet`);
  }

  /* A door that is too wide drops on its hinges. What matters is the door,
     not the cabinet: a 1200 cabinet with a pair of 597mm doors on it is a
     normal cabinet, and measuring the carcass instead put a warning on every
     wide island unit in the kitchen. */
  const widest = unit.parts.reduce((a, q) => (
    q.group === 'front' && q.code.includes('DOOR') ? Math.max(a, q.size[0]) : a), 0);
  if (widest > 1000) {
    out.push(`${Math.round(widest)}mm door. Over 1000 it will drop on its hinges, split it into a pair`);
  }

  /* A blind corner is only useful if the door can open. The return cabinets
     and the benchtop above them cross the front of this cabinet, so the dead
     part of the front has to be wider than they are. */
  if (unit.corner) {
    /* The blind is the benchtop depth plus the extra, so it can only fall
       short of the return if the extra has been set negative. */
    if (unit.blindExtra < 0) {
      out.push(`Blind panel ${unit.blindWidth}mm against a ${cfg.benchDepth}mm benchtop return. It has to reach past the benchtop or the door will not clear`);
    } else if (unit.blindExtra < 20) {
      out.push(`Blind panel only ${unit.blindExtra}mm past the benchtop. The door will foul the return, allow 40 or more`);
    }
    const opening = unit.width - unit.blindWidth - 2 * cfg.reveal;
    if (opening < 300) {
      out.push(`Door opening ${Math.round(opening)}mm. Under 300 there is no point in the door, widen the cabinet to ${Math.round(unit.blindWidth + 300 + 2 * cfg.reveal)} or more`);
    }
  }

  /* What is already on the wall. A window behind a cabinet is a mistake; a
     waste pipe inside a sink base is the reason the sink base is there. The
     obstacle says which it is rather than everything being an obstruction. */
  for (const o of lay.wall.obstacles || []) {
    if (!overlaps(o, x, unit.mountY, unit.width, unit.height)) continue;
    const note = obstacleNote(o, unit.family.name);
    if (note && note.level === 'error') out.push(note.text);
  }

  return out;
}

/**
 * The services that come out inside a cabinet, so it can be built around them.
 *
 * Not a warning. A waste pipe inside a sink base is the point, and calling it
 * a problem trains you to ignore the problems.
 */
export function unitServices(placed, lay) {
  const { unit, x } = placed;
  const out = [];
  for (const o of lay.wall.obstacles || []) {
    if (!overlaps(o, x, unit.mountY, unit.width, unit.height)) continue;
    const note = obstacleNote(o, unit.family.name);
    if (note && note.level === 'note') out.push(note.text);
  }
  return out;
}

export function wallWarnings(lay, project) {
  const out = [];

  /* A wall that starts clear of a corner has less of itself to fill, so say
     what is going on rather than leaving an unexplained gap at the end. */
  if (lay.startOffset > 0) {
    out.push({ level: 'note', text: `First ${Math.round(lay.startOffset)}mm of this wall is the corner cabinet on the wall before it. Cabinets here start after it.` });
  }
  if (lay.endReserve > 0) {
    out.push({ level: 'note', text: `Last ${Math.round(lay.endReserve)}mm of this wall is the corner cabinet on the next wall. Cabinets here stop before it, and the last one snaps to its side.` });
  }

  /* In an L or a U the corner has to be filled by a blind corner cabinet, or
     the two runs are drawn through each other. It can stand on either leg:
     at the end of this wall reaching forward, or at the start of the next one
     reaching back. Both is a mistake, and so is neither. */
  if (project) {
    const ids = roomWallIds(project);
    const i = ids.indexOf(lay.wall.id);
    if (i >= 0 && i < ids.length - 1) {
      const mine = cornerAtEnd(lay);
      const theirs = lay.endReserve > 0;
      if (mine && theirs) {
        out.push({ level: 'error', text: 'Two blind corners in the one corner: one at the end of this wall and one at the start of the next. Keep whichever leg you want to build it from and delete the other.' });
      } else if (theirs) {
        // The next wall carries it. Nothing is wrong with this one.
      } else if (!cornerUnit(lay)) {
        out.push({ level: 'warn', text: 'This wall turns a corner but there is no blind corner cabinet in it, on this wall or at the start of the next. The next wall will run into whatever is at the end of this one.' });
      } else if (!mine) {
        out.push({ level: 'warn', text: 'The blind corner on this wall is set to sit at its start, so it reaches back rather than into the corner this wall turns. Set the corner to the other side, or move it to the next wall.' });
      } else if (!cornerIsLast(lay)) {
        out.push({ level: 'warn', text: 'The blind corner is not the last cabinet on this wall. It has to sit in the corner, so move it to the end of the run.' });
      }
    }
  }

  /* An island's ends are as long as it is deep, so a run that fits its length
     can still be too long for the end it is on. Checked per side, because the
     one number `baseRun` cannot say which of four sides it came from. */
  if (lay.island) {
    /* An end whose corners are both full has no room on it at all. That is
       not a mistake, it is what a 1120 island with 560 cabinets front and
       back is: the ends are the exposed side panels of the long runs. Worth
       saying, because otherwise you go looking for the room. */
    for (const side of ['left', 'right']) {
      const room = lay.runOf(side);
      const free = room - cornerTaken(lay, side)
        .reduce((a, [x0, x1]) => a + (x1 - x0), 0);
      const onIt = lay.placed.some((p) => p.side === side && p.where !== 'wall');
      const name = ISLAND_SIDES.find((q) => q.id === side).name.toLowerCase();
      if (free <= 0 && !onIt) {
        out.push({
          level: 'note',
          text: `The ${name} has no room on it: the front and back runs fill the island's ${Math.round(room)}mm of depth between them. Make the island deeper, or leave one of the long sides short, to put cabinets on it.`,
        });
      }
    }

    for (const side of ISLAND_SIDE_IDS) {
      const run = lay.placed
        .filter((p) => p.side === side && p.where !== 'wall')
        .reduce((a, p) => Math.max(a, p.x + p.unit.width), 0);
      const room = lay.runOf(side);
      if (run > room + 0.5) {
        const name = ISLAND_SIDES.find((q) => q.id === side).name.toLowerCase();
        out.push({
          level: 'error',
          text: `The ${name} of the island is filled to ${Math.round(run)}mm against ${Math.round(room)}mm of ${side === 'left' || side === 'right' ? 'depth' : 'length'}. Reduce by ${Math.round(run - room)}mm.`,
        });
      }
    }
  }

  if (!lay.island && lay.baseRun > lay.limit + 0.5) {
    const over = Math.round(lay.baseRun - lay.limit);
    out.push(lay.endReserve > 0
      ? { level: 'error', text: `Base run is ${Math.round(lay.baseRun)}mm and only reaches ${Math.round(lay.limit)}mm before the corner cabinet on the next wall. Reduce by ${over}mm.` }
      : { level: 'error', text: `Base run is ${Math.round(lay.baseRun)}mm against a ${lay.wall.length}mm wall. Reduce by ${over}mm.` });
  } else {
    /* Free placement means a gap can be anywhere, not just at the end, so
       say where it is rather than only how much is left over. An island has
       two sides that fill independently, so each is asked separately and the
       answer says which one it is about. */
    const sides = lay.island ? ISLAND_SIDE_IDS : [null];
    for (const side of sides) {
      const name = ISLAND_SIDES.find((q) => q.id === side)?.name.toLowerCase();
      const where = side ? ` on the ${name} of the island` : '';
      const gaps = runGaps(lay, 'base', side);
      const filled = lay.placed.some((p) => p.where !== 'wall'
        && (side === null || p.side === side));

      for (const g of gaps.filter((q) => !q.trailing)) {
        out.push({ level: 'warn', text: `${Math.round(g.w)}mm gap at ${Math.round(g.x)}mm along the base run${where}. Add a filler, widen a cabinet, or press Close gaps.` });
      }
      const tail = gaps.find((q) => q.trailing);
      if (tail && filled) {
        out.push({ level: 'warn', text: `${Math.round(tail.w)}mm of the base run${where} is unfilled at the end. Add a filler or widen a cabinet.` });
      }
    }
  }
  if (lay.wallRun > lay.limit + 0.5) {
    out.push({ level: 'error', text: `Wall run is ${Math.round(lay.wallRun)}mm against a ${lay.wall.length}mm wall.` });
  }
  return out;
}

/* --- totals, live in the top strip ---------------------------------------- */

export function totals(project) {
  const cfg = project.cfg;
  let cabinets = 0, doors = 0, drawers = 0, cost = 0;
  let benchMm = 0;

  const offsets = roomOffsets(project);
  for (const wall of project.walls) {
    const lay = layoutFor(project, wall, offsets);
    let benchRun = 0;
    for (const p of lay.placed) {
      const { unit } = p;

      if (unit.cavity) {
        // A cooktop breaks the benchtop. A dishwasher sits under it.
        if (unit.breaksBench) { benchMm += benchRun; benchRun = 0; }
        else if (!unit.fullHeight) benchRun += unit.width;
        else { benchMm += benchRun; benchRun = 0; }
        continue;
      }
      /* A tall unit ends the benchtop run and carries kick, but it is still a
         cabinet. This used to continue here, so pantries and oven towers were
         left out of the cabinet count, the door and drawer counts, and the
         hardware cost. */
      if (unit.kind === 'tall') {
        benchMm += benchRun; benchRun = 0;
      } else if (unit.kind === 'base' || unit.kind === 'filler') {
        benchRun += unit.width;
      }
      if (unit.kind === 'filler') continue;

      cabinets += 1;
      doors += unit.parts.filter((x) => x.group === 'front' && x.code.includes('DOOR')).length;
      drawers += unit.parts.filter((x) => x.group === 'front' && x.code.includes('DRWR-F')).length;

      // Board cost comes from the real nest below. Only fittings are summed here.
      cost += unitCost(unit).hardware;
    }
    benchMm += benchRun;
  }

  /* Sheets and board cost come from the same nesting run the Nesting screen
     shows. An area estimate gave a different, lower number for the same
     thing, which is worse than useless when you are buying sheets. */
  const nest = nestProject(allParts(project), nestCfg(project));

  /* Hardware you added yourself. It is not derived from any cabinet, so it
     is counted here once and shows up in costing and in the print pack. */
  const extras = extrasCost(project);

  /* What holds a breakfast bar up. Derived, but from the island rather than
     from a cabinet, so the per unit sum above cannot have caught it. */
  const bar = barCost(project);

  /* The benchtop can be left out of the total. The metres and the rate are
     still reported, so the number you are not counting is still visible. */
  /* The benchtop is billed from the schedule the print pack shows, including
     the overhang at an open end. benchMm is the raw run of cabinets, which is
     a different and slightly shorter number: billing one while printing the
     other is how a quote and a delivery end up disagreeing. */
  const schedule = benchPieces(project);
  const benchMetres = benchLength(schedule) / 1000;

  /* The kick metres are measured off the kickboard actually cut, not off the
     cabinets it runs past. Those are different numbers: the run stops either
     side of a dishwasher and a tall cabinet carries its own, so counting
     cabinet widths reported more kick than anybody cuts. */
  const kickMm = runParts(project)
    .filter((x) => x.group === 'kick')
    .reduce((a, x) => a + x.L, 0);

  const benchIncluded = PRICES.includeBench !== false;
  const bench = benchMetres * PRICES.benchPerMetre;
  /* The kickboard is cut from board now, so the nest above has already paid
     for it. Charging the old per metre rate on top would bill it twice. The
     metres are still reported, because knowing how much kick you are running
     is useful even when it is not its own line on the bill. */
  const kick = 0;

  return {
    cabinets, doors, drawers,
    benchMetres,
    /* What the top actually is as a solid, not as a line. A stone or timber
       benchtop is quoted, freighted and lifted by volume and weight as often
       as by the metre, and one person cannot carry half a cubic metre of
       stone. Worked out once, here, so every screen quotes the same figure. */
    benchVolume: benchVolume(schedule),
    benchArea: benchArea(schedule),
    benchPieces: schedule,
    benchRunMetres: benchMm / 1000,
    kickMetres: kickMm / 1000,
    sheets: nest.sheets,
    wastePct: nest.wastePct,
    oversize: nest.oversize,
    boardCost: nest.cost,
    hardwareCost: cost + extras + bar,
    extrasCost: extras,
    barCost: bar,
    benchCost: bench,
    kickCost: kick,
    benchIncluded,
    cost: nest.cost + cost + extras + bar + (benchIncluded ? bench : 0) + kick,
    estimate: true,
  };
}

/** Hardware the user typed in themselves, rather than anything derived. */
/* ---------------------------------------------------------------------------
   The things the model cannot know about.

   A cabinet list can work out its own hinges. It cannot know which oven you
   bought, that the splashback is on order, or that you are paying somebody to
   template the stone. All of that is money in the job and none of it is
   derivable, so it is typed, and it is grouped by what sort of thing it is
   because an appliance and a box of screws are not the same kind of decision.
   --------------------------------------------------------------------------- */

export const EXTRA_KINDS = [
  { id: 'hardware', name: 'Hardware',
    note: 'Handles, legs, soft close kits, screws. Anything that goes on a cabinet.' },
  { id: 'appliance', name: 'Appliances',
    note: 'The oven, the cooktop, the sink, the tap. What goes in the holes the planner blocked out.' },
  { id: 'other', name: 'Everything else',
    note: 'Splashback, tiling, plumbing, electrical, the stone templating fee. Money in the job that is not a cabinet.' },
];

export const EXTRA_KIND_IDS = new Set(EXTRA_KINDS.map((k) => k.id));

/** The kind an item is, falling back rather than dropping it. */
export const extraKind = (e) =>
  (EXTRA_KIND_IDS.has(e?.kind) ? e.kind : 'hardware');

export const projectExtras = (project) =>
  (project.extras || []).filter((e) => e && e.name);

/** The typed items of one kind, in the order they were added. */
export const extrasOfKind = (project, kind) =>
  (project.extras || []).filter((e) => e && extraKind(e) === kind);

export const extrasCost = (project) =>
  projectExtras(project).reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.cost) || 0), 0);

export const money = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

/* --- project wide part and fitting lists ---------------------------------- */

/**
 * Every part in the project, tagged with the cabinet and wall it belongs to.
 *
 * Each part also carries a key that survives editing. The part code contains
 * the cabinet number, and cabinet numbers are positions in the run: delete
 * one cabinet and every code after it shifts up. Anything remembered against
 * a code, the cut ticks above all, would then be pointing at a different
 * piece of board without saying so. The key is built from the cabinet's own
 * id, which never changes, so a tick stays on the part you actually cut.
 */
/**
 * The parts that belong to a run rather than to any one cabinet: kickboard,
 * and the end panels when they are generated automatically.
 *
 * Keyed by the wall and the run, because that is what they belong to. The key
 * has to be stable for the same reason a cabinet part's key does: a tick on a
 * cut list has to stay on the piece you actually cut.
 */
export function runParts(project) {
  const out = [];
  const offsets = roomOffsets(project);
  const cfg = project.cfg;

  for (const wall of project.walls) {
    const lay = layoutFor(project, wall, offsets);
    /* An island is kicked right round, because it has two open ends you can
       see the feet through. A wall is kicked in front of its cabinets, and
       each side of an island is asked for on its own so that the two sides,
       which occupy the same stretch of x, do not read as cabinets overlapping
       each other and break the run at every one. */
    const runs = isIsland(wall)
      ? islandKickRuns(wall, islandDepth(wall, cfg))
      : baseRuns(lay, 'kick', cfg);
    /* A kickboard piece has to come off a real sheet with the trim already
       taken off it, or it is cut to a length that fits nowhere and lands on
       the oversize list. */
    const kickMat = `${cfg.kickBoard || cfg.carcassBoard || 'White melamine'} ${cfg.kickThk ?? cfg.carcassThk}mm`;
    const maxPiece = usableLength(sheetFor(kickMat), cfg);
    for (const part of [
      ...kickParts(runs, cfg, wall.id, maxPiece),
      ...endPanelParts(runs, cfg, wall.id),
    ]) {
      out.push({
        ...part,
        finish: finishFor(roleOf(part), cfg).id,
        /* Not cabinet parts, so they have no unit. They still need the size
           and position fields every consumer reads, and a zero size keeps
           them out of the 3D view without any of it knowing they exist. */
        size: [0, 0, 0], pos: [0, 0, 0],
        key: `${wall.id}/${part.code.slice(wall.id.length + 1)}`,
        unitId: null, unitLabel: '', wallId: wall.id, wallName: wall.name,
      });
    }
  }
  return out;
}

/** The benchtop, as a list of pieces with real lengths. Never nested. */
export function benchPieces(project) {
  const offsets = roomOffsets(project);
  const out = [];
  for (const wall of project.walls) {
    /* An island's top is one slab over the whole footprint, which is what the
       3D has always drawn. The schedule was reading it as a linear run and
       reporting five strips of 600 deep for one 2400 by 1120 slab: the two
       disagreed, and the order list was the one that was wrong. */
    if (isIsland(wall)) {
      /* The bar with its span already worked out and clipped to the side it
         is on, so the slab and the stool count are reading the same bar. */
      /* Every bar on the island, each with its span already worked out and
         clipped to the side it is on, so the slab and the stool counts are
         reading the same bars. */
      const bars = islandBars(wall).map((b) => ({
        ...b, span: barSpan(wall, project.cfg, b),
      }));
      const pieces = islandBench(
        wall, islandDepth(wall, project.cfg), project.cfg,
        bars.length ? bars : { side: 'none', depth: 0 },
      );
      for (const piece of pieces) {
        out.push({ ...piece, wallId: wall.id, wallName: wall.name });
      }
      continue;
    }
    const runs = baseRuns(layoutFor(project, wall, offsets), 'bench', project.cfg);
    for (const piece of benchSchedule(runs, project.cfg)) {
      out.push({ ...piece, wallId: wall.id, wallName: wall.name });
    }
  }
  return out;
}

export function allParts(project) {
  const out = [];
  const offsets = roomOffsets(project);
  for (const wall of project.walls) {
    for (const p of layoutFor(project, wall, offsets).placed) {
      if (!p.unit.parts.length) continue;
      for (const part of p.unit.parts) {
        out.push({
          ...part,
          key: `${p.item.uid}/${part.code.slice(p.codeId.length + 1)}`,
          unitId: p.item.uid, unitLabel: p.label, wallId: wall.id, wallName: wall.name,
        });
      }
    }
  }
  out.push(...runParts(project));
  return out;
}

/** Every fitting, rolled up by type. */
export function allFittings(project) {
  const rows = new Map();
  const offsets = roomOffsets(project);
  for (const wall of project.walls) {
    for (const p of layoutFor(project, wall, offsets).placed) {
      for (const f of p.unit.fittings || []) {
        const key = f.type === 'runnerPair' ? `runnerPair-${f.length}` : f.type;
        const cur = rows.get(key) || { type: f.type, length: f.length, qty: 0, units: new Set() };
        cur.qty += f.qty;
        cur.units.add(p.label);
        rows.set(key, cur);
      }
    }
  }

  /* What holds a breakfast bar up. It belongs to the island rather than to any
     cabinet on it, so it is added here rather than found on a unit, and it is
     added here rather than in the order list so the hardware screen, the
     costing and the order list all count it once and agree. */
  for (const f of barFittings(project)) {
    const cur = rows.get(f.type) || { type: f.type, qty: 0, units: new Set() };
    cur.qty += f.qty;
    cur.units.add(f.where);
    rows.set(f.type, cur);
  }

  return [...rows.entries()].map(([key, v]) => ({ key, ...v, units: [...v.units] }));
}

/**
 * The brackets under every breakfast bar in the project.
 *
 * Nothing at all until an overhang stops carrying itself, which is the common
 * case: a 300mm bar on a laminate top wants no ironmongery whatever.
 */
export function barFittings(project) {
  const clear = { ...BAR_RULES, ...project.cfg };
  const out = [];
  for (const wall of project.walls) {
    if (!isIsland(wall)) continue;
    /* Every bar on the island, not the first one. Two overhangs need two
       sets of brackets, and counting only one is money left off the order. */
    const qty = barBracketsAll(wall, project.cfg, clear);
    if (qty > 0) out.push({ type: 'barBracket', qty, where: wall.name });
  }
  return out;
}

/** What a project's bar brackets come to. */
export const barCost = (project, prices = PRICES) =>
  barFittings(project).reduce((a, f) => a + f.qty * (Number(prices.barBracket) || 0), 0);

/** Cabinets across the whole project, for the cut list and costing screens. */
export function allUnits(project) {
  const out = [];
  const offsets = roomOffsets(project);
  for (const wall of project.walls) {
    for (const p of layoutFor(project, wall, offsets).placed) {
      if (p.unit.cavity) continue;
      out.push({ ...p, wallId: wall.id, wallName: wall.name });
    }
  }
  return out;
}
