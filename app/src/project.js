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

import { FAMILY, PRICES, PROJECT, buildUnit, unitCost } from './catalog.js';
import { NEST, nestProject } from './nesting.js';

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
        id: 'ISL', name: 'Island', length: 2400, obstacles: [],
        units: [
          u('base-3drawer', { width: 900 }),
          u('base-2door', { width: 900 }),
          u('base-1door', { width: 600 }),
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

/**
 * Resolve a wall into placed units with real x positions.
 * Two cursors: the base run along the floor and the wall run above it.
 */
export function layoutWall(wall, cfg = PROJECT, startOffset = 0) {
  /* A run does not always start at zero. In an L or a U the second wall
     starts clear of the corner cabinet on the wall before it, because that
     cabinet's carcass is already occupying the first few hundred
     millimetres of this wall. */
  let baseX = startOffset;
  let wallX = startOffset;
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

    let x;
    if (where === 'both') {
      x = pinned ?? Math.max(baseX, wallX);
      baseX = wallX = Math.max(baseX, wallX, x + unit.width);
    } else if (where === 'wall') {
      x = pinned ?? wallX;
      wallX = Math.max(wallX, x + unit.width);
    } else {
      x = pinned ?? baseX;
      baseX = Math.max(baseX, x + unit.width);
    }

    placed.push({ item, unit, x, where, label, codeId, pinned: pinned !== null });
  }

  return {
    placed, baseRun: baseX, wallRun: wallX, run: Math.max(baseX, wallX),
    wall, startOffset,
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
  return project.walls.filter((w) => w.id !== 'ISL').slice(0, n).map((w) => w.id);
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
    const lay = layoutWall(wall, project.cfg, offsets[id] || 0);

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

/** True when the corner cabinet is the last thing in the base run. */
export function cornerIsLast(lay) {
  const run = lay.placed.filter((p) => p.where !== 'wall');
  return run.length > 0 && !!run[run.length - 1].unit.corner;
}

/**
 * Every wall's corner offset in one pass. The list builders take this once
 * and reuse it, rather than resolving the room for each wall in turn.
 */
export function roomOffsets(project) {
  const cfg = project.cfg;
  const ids = roomWallIds(project);
  const out = {};
  let offset = 0;
  for (const id of ids) {
    const wall = project.walls.find((w) => w.id === id);
    if (!wall) continue;
    out[id] = offset;
    const lay = layoutWall(wall, cfg, offset);
    const corner = cornerUnit(lay);
    offset = corner ? corner.unit.cornerReturn : 0;
  }
  return out;
}

/** Lay out a wall with whatever corner offset the room gives it. */
export const layoutFor = (project, wall, offsets) =>
  layoutWall(wall, project.cfg, (offsets || roomOffsets(project))[wall.id] || 0);

/** Walls that are not part of the joined run, so the island and any spares. */
export const looseWalls = (project) => {
  const ids = new Set(roomWallIds(project));
  return project.walls.filter((w) => !ids.has(w.id));
};

/** The corner offset a wall inherits, or zero when it is not in the run. */
export const wallOffset = (project, wallId) => roomOffsets(project)[wallId] || 0;

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
};

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

  add(lay.startOffset, 'start', 'start of the wall');
  add(lay.wall.length - w, 'end', 'end of the wall');

  for (const p of lay.placed) {
    if (p.item.uid === item.uid) continue;
    if (!sameRun(where, p.where)) continue;
    add(p.x + p.unit.width, 'butt', `right of ${p.label || p.unit.family.name}`);
    add(p.x - w, 'butt', `left of ${p.label || p.unit.family.name}`);
  }

  /* A blind corner belongs in the corner and nowhere else, so it is pulled
     from much further out. Dropping it anywhere near the right end of an L
     puts it exactly in the corner, which is the only place it works. */
  if (unit.corner) {
    const left = (unit.settings?.blindSide || 'right') === 'left';
    add(left ? lay.startOffset : lay.wall.length - w, 'corner', 'the corner', opts.cornerPull);
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
       is the join that decides whether the kitchen closes up at all. */
    const rank = c.kind === 'corner' ? -1 : 0;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) {
      best = { ...c, d, rank };
    }
  }
  const x = Math.max(0, Math.round(best ? best.x : rawX));
  return { x, snap: best ? { x: best.x, kind: best.kind, label: best.label } : null };
}

/**
 * The first place a cabinet of this width will fit on a wall, or null if it
 * will not. Used when you add one, so it lands in the first real gap rather
 * than on top of something.
 */
export function firstFreeX(lay, unit, width) {
  const where = occupies(unit.kind, unit.fullHeight);
  const taken = lay.placed
    .filter((p) => sameRun(where, p.where))
    .map((p) => [p.x, p.x + p.unit.width])
    .sort((a, b) => a[0] - b[0]);

  let cursor = lay.startOffset;
  for (const [a, b] of taken) {
    if (a - cursor >= width) return cursor;
    cursor = Math.max(cursor, b);
  }
  return cursor + width <= lay.wall.length + 0.5 ? cursor : null;
}

/** Gaps left in a run, so the wall can say where they are. */
export function runGaps(lay, which = 'base') {
  const spans = lay.placed
    .filter((p) => (which === 'wall' ? p.where !== 'base' : p.where !== 'wall'))
    .map((p) => [p.x, p.x + p.unit.width])
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return [];

  const gaps = [];
  let cursor = lay.startOffset;
  for (const [a, b] of spans) {
    if (a - cursor > 5) gaps.push({ x: cursor, w: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (lay.wall.length - cursor > 5) gaps.push({ x: cursor, w: lay.wall.length - cursor, trailing: true });
  return gaps;
}

/* --- warnings, drawn on the cabinet itself -------------------------------- */

export function unitWarnings(p, lay, cfg = PROJECT) {
  const out = [];
  const { unit, x } = p;
  const s = unit.settings;

  if (x + unit.width > lay.wall.length + 0.5) {
    out.push(`Past the end of the wall by ${Math.round(x + unit.width - lay.wall.length)}mm`);
  }

  /* Two cabinets in the same run cannot occupy the same millimetres. Before
     you could drag one this was impossible by construction, so it was never
     worth saying. */
  for (const q of lay.placed) {
    if (q.item.uid === p.item.uid) continue;
    if (!sameRun(p.where, q.where)) continue;
    const over = Math.min(x + unit.width, q.x + q.unit.width) - Math.max(x, q.x);
    if (over > 0.5) {
      out.push(`Overlaps ${q.label || q.unit.family.name} by ${Math.round(over)}mm`);
      break;
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

  if (unit.kind === 'base' && unit.width > 1000 && unit.family.fronts === 'doors') {
    out.push(`${unit.width}mm on doors. Over 1000 they will drop, split the cabinet`);
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

  for (const o of lay.wall.obstacles || []) {
    const top = unit.mountY + unit.height;
    const overlapX = x < o.x + o.w && x + unit.width > o.x;
    const overlapY = unit.mountY < o.y + o.h && top > o.y;
    if (overlapX && overlapY) out.push(`Runs into ${o.label.toLowerCase()}`);
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

  /* In an L or a U, the wall that runs into a corner needs a corner cabinet
     at its far end. Without one the two runs are drawn on top of each other. */
  if (project) {
    const ids = roomWallIds(project);
    const i = ids.indexOf(lay.wall.id);
    if (i >= 0 && i < ids.length - 1) {
      if (!cornerUnit(lay)) {
        out.push({ level: 'warn', text: 'This wall turns a corner but has no blind corner cabinet on it. The next wall will run into whatever is at the end of this one.' });
      } else if (!cornerIsLast(lay)) {
        out.push({ level: 'warn', text: 'The blind corner is not the last cabinet on this wall. It has to sit in the corner, so move it to the end of the run.' });
      }
    }
  }

  if (lay.baseRun > lay.wall.length + 0.5) {
    out.push({ level: 'error', text: `Base run is ${Math.round(lay.baseRun)}mm against a ${lay.wall.length}mm wall. Reduce by ${Math.round(lay.baseRun - lay.wall.length)}mm.` });
  } else {
    /* Free placement means a gap can be anywhere, not just at the end, so
       say where it is rather than only how much is left over. */
    const gaps = runGaps(lay, 'base');
    const inner = gaps.filter((g) => !g.trailing);
    const tail = gaps.find((g) => g.trailing);
    for (const g of inner) {
      out.push({ level: 'warn', text: `${Math.round(g.w)}mm gap at ${Math.round(g.x)}mm along the base run. Add a filler, widen a cabinet, or press Close gaps.` });
    }
    if (tail && lay.baseRun > 0) {
      out.push({ level: 'warn', text: `${Math.round(tail.w)}mm of the base run is unfilled at the end. Add a filler or widen a cabinet.` });
    }
  }
  if (lay.wallRun > lay.wall.length + 0.5) {
    out.push({ level: 'error', text: `Wall run is ${Math.round(lay.wallRun)}mm against a ${lay.wall.length}mm wall.` });
  }
  return out;
}

/* --- totals, live in the top strip ---------------------------------------- */

export function totals(project) {
  const cfg = project.cfg;
  let cabinets = 0, doors = 0, drawers = 0, cost = 0;
  let benchMm = 0, kickMm = 0;

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
        benchMm += benchRun; benchRun = 0; kickMm += unit.width;
      } else if (unit.kind === 'base' || unit.kind === 'filler') {
        benchRun += unit.width;
        kickMm += unit.width;
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

  /* The benchtop can be left out of the total. The metres and the rate are
     still reported, so the number you are not counting is still visible. */
  const benchIncluded = PRICES.includeBench !== false;
  const bench = (benchMm / 1000) * PRICES.benchPerMetre;
  const kick = (kickMm / 1000) * PRICES.kickPerMetre;

  return {
    cabinets, doors, drawers,
    benchMetres: benchMm / 1000,
    kickMetres: kickMm / 1000,
    sheets: nest.sheets,
    wastePct: nest.wastePct,
    oversize: nest.oversize,
    boardCost: nest.cost,
    hardwareCost: cost + extras,
    extrasCost: extras,
    benchCost: bench,
    kickCost: kick,
    benchIncluded,
    cost: nest.cost + cost + extras + (benchIncluded ? bench : 0) + kick,
    estimate: true,
  };
}

/** Hardware the user typed in themselves, rather than anything derived. */
export const projectExtras = (project) =>
  (project.extras || []).filter((e) => e && e.name);

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
  return [...rows.entries()].map(([key, v]) => ({ key, ...v, units: [...v.units] }));
}

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
