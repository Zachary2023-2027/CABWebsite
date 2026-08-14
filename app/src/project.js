/* ===========================================================================
   Project model. Walls hold an ordered run of units. Positions are derived,
   never stored, so reordering or resizing a cabinet moves everything after it.
   =========================================================================== */

import { FAMILY, PRICES, PROJECT, buildUnit, unitCost } from './catalog.js';

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
  };
}

/** Which run a unit occupies. Tall and full height appliances take both. */
const occupies = (kind, full) =>
  kind === 'wall' ? 'wall' : (kind === 'tall' || full) ? 'both' : 'base';

/**
 * Resolve a wall into placed units with real x positions.
 * Two cursors: the base run along the floor and the wall run above it.
 */
export function layoutWall(wall, cfg = PROJECT) {
  let baseX = 0;
  let wallX = 0;
  let n = 0;
  const placed = [];

  for (const item of wall.units) {
    const fam = FAMILY[item.familyId];
    if (!fam) continue;
    const unit = buildUnit(item.uid.toUpperCase().slice(0, 4), item.familyId, item.settings, cfg);
    const where = occupies(unit.kind, unit.fullHeight);

    let x;
    if (where === 'both') { x = Math.max(baseX, wallX); baseX = wallX = x + unit.width; }
    else if (where === 'wall') { x = wallX; wallX += unit.width; }
    else { x = baseX; baseX += unit.width; }

    if (unit.kind !== 'filler') n += 1;
    const label = unit.kind === 'filler' ? null : `${wall.id}${n}`;
    placed.push({ item, unit, x, where, label });
  }

  return { placed, baseRun: baseX, wallRun: wallX, run: Math.max(baseX, wallX), wall };
}

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

  for (const o of lay.wall.obstacles || []) {
    const top = unit.mountY + unit.height;
    const overlapX = x < o.x + o.w && x + unit.width > o.x;
    const overlapY = unit.mountY < o.y + o.h && top > o.y;
    if (overlapX && overlapY) out.push(`Runs into ${o.label.toLowerCase()}`);
  }

  return out;
}

export function wallWarnings(lay) {
  const out = [];
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
  const area = {};

  for (const wall of project.walls) {
    const lay = layoutWall(wall, cfg);
    let benchRun = 0;
    for (const p of lay.placed) {
      const { unit } = p;

      if (unit.kind === 'appliance') {
        // A cooktop breaks the benchtop. A dishwasher sits under it.
        if (unit.breaksBench) { benchMm += benchRun; benchRun = 0; }
        else if (!unit.fullHeight) benchRun += unit.width;
        else { benchMm += benchRun; benchRun = 0; }
        continue;
      }
      if (unit.kind === 'tall') { benchMm += benchRun; benchRun = 0; kickMm += unit.width; continue; }
      if (unit.kind === 'base' || unit.kind === 'filler') {
        benchRun += unit.width;
        kickMm += unit.width;
      }
      if (unit.kind === 'filler') continue;

      cabinets += 1;
      doors += unit.parts.filter((x) => x.group === 'front' && x.code.includes('DOOR')).length;
      drawers += unit.parts.filter((x) => x.group === 'front' && x.code.includes('DRWR-F')).length;

      const c = unitCost(unit);
      cost += c.total;
      for (const [m, a] of Object.entries(c.areaByMaterial)) area[m] = (area[m] || 0) + a;
    }
    benchMm += benchRun;
  }

  let sheets = 0;
  for (const [m, a] of Object.entries(area)) {
    const sh = PRICES.sheets[m];
    if (!sh) continue;
    sheets += Math.ceil((a * 1.18) / ((sh.size[0] * sh.size[1]) / 1e6));
  }

  const bench = (benchMm / 1000) * PRICES.benchPerMetre;
  const kick = (kickMm / 1000) * PRICES.kickPerMetre;

  return {
    cabinets, doors, drawers,
    benchMetres: benchMm / 1000,
    kickMetres: kickMm / 1000,
    sheets,
    cost: cost + bench + kick,
    estimate: true,
  };
}

export const money = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
