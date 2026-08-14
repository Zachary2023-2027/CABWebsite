/* ===========================================================================
   Project model. Walls hold an ordered run of units. Positions are derived,
   never stored, so reordering or resizing a cabinet moves everything after it.
   =========================================================================== */

import { FAMILY, PRICES, PROJECT, buildUnit, unitCost } from './catalog.js';
import { nestProject } from './nesting.js';

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

    let x;
    if (where === 'both') { x = Math.max(baseX, wallX); baseX = wallX = x + unit.width; }
    else if (where === 'wall') { x = wallX; wallX += unit.width; }
    else { x = baseX; baseX += unit.width; }

    placed.push({ item, unit, x, where, label });
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

/* --- warnings, drawn on the cabinet itself -------------------------------- */

export function unitWarnings(p, lay, cfg = PROJECT) {
  const out = [];
  const { unit, x } = p;
  const s = unit.settings;

  if (x + unit.width > lay.wall.length + 0.5) {
    out.push(`Past the end of the wall by ${Math.round(x + unit.width - lay.wall.length)}mm`);
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
    const needed = cfg.benchDepth;
    if (unit.blindWidth < needed) {
      out.push(`Blind panel ${unit.blindWidth}mm against a ${needed}mm benchtop return. Widen it or the door will not clear`);
    }
    const opening = unit.width - unit.blindWidth - 2 * cfg.reveal;
    if (opening < 300) {
      out.push(`Door opening ${Math.round(opening)}mm. Under 300 there is no point in the door, widen the cabinet`);
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
  } else if (lay.wall.length - lay.baseRun > 5 && lay.baseRun > 0) {
    out.push({ level: 'warn', text: `${Math.round(lay.wall.length - lay.baseRun)}mm of the base run is unfilled. Add a filler or widen a cabinet.` });
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
  const nest = nestProject(allParts(project));

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

/** Every part in the project, tagged with the cabinet and wall it belongs to. */
export function allParts(project) {
  const out = [];
  const offsets = roomOffsets(project);
  for (const wall of project.walls) {
    for (const p of layoutFor(project, wall, offsets).placed) {
      if (!p.unit.parts.length) continue;
      for (const part of p.unit.parts) {
        out.push({ ...part, unitId: p.item.uid, unitLabel: p.label, wallId: wall.id, wallName: wall.name });
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
