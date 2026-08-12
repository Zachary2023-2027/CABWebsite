// Layout engine.
//
// Items are an ordered list, not coordinates. Position falls out of a single
// walk with two independent cursors: wall cabinets float free of the base run,
// while a tall unit (pantry, fridge) blocks both rows and advances each.

import { IN, TYPE_BY_ID, boxHeight } from './catalog.js';

/**
 * @returns {{
 *   placed: Array<{item, type, x, w, h, bottom, top, row}>,
 *   baseRun: number, wallRun: number, runWidth: number,
 *   counterSegments: Array<{x: number, w: number}>
 * }}
 * `bottom`/`top` are heights above the finished floor, in inches.
 */
export function layout(items, wall) {
  let baseX = 0;
  let wallX = 0;
  const placed = [];

  for (const item of items) {
    const type = TYPE_BY_ID[item.typeId];
    if (!type) continue;

    const w = Number(item.width) || type.defaultWidth;
    const h = boxHeight(type, item);

    let x;
    if (type.row === 'tall') {
      x = Math.max(baseX, wallX);
      baseX = wallX = x + w;
    } else if (type.row === 'wall') {
      x = wallX;
      wallX += w;
    } else {
      x = baseX;
      baseX += w;
    }

    const bottom = type.row === 'wall' ? IN.WALL_MOUNT_AFF : 0;
    placed.push({ item, type, x, w, h, bottom, top: bottom + h, row: type.row });
  }

  return {
    placed,
    baseRun: baseX,
    wallRun: wallX,
    runWidth: Math.max(baseX, wallX),
    counterSegments: counterSegments(placed),
    wall,
  };
}

/**
 * Countertop runs along the floor-standing units. A tall cabinet or a slide-in
 * range interrupts it; a dishwasher does not (it lives under the counter).
 */
function counterSegments(placed) {
  const floor = placed
    .filter((p) => p.row === 'base' || p.row === 'tall')
    .sort((a, b) => a.x - b.x);

  const bears = (p) => p.row === 'base' && p.type.appliance !== 'range';

  const segs = [];
  let cur = null;
  for (const p of floor) {
    if (!bears(p)) { cur = null; continue; }
    if (cur && Math.abs(cur.x + cur.w - p.x) < 1e-6) cur.w += p.w;
    else { cur = { x: p.x, w: p.w }; segs.push(cur); }
  }
  // A lone filler strip isn't a countertop run.
  return segs.filter((s) => s.w > 3);
}

/** Non-blocking design checks surfaced above the drawing. */
export function warnings(state, lay) {
  const out = [];
  const { width: wallW, height: wallH } = state.wall;

  if (lay.baseRun > wallW + 1e-6) {
    out.push({ level: 'error', text: `Base run overruns the wall by ${round(lay.baseRun - wallW)}″.` });
  }
  if (lay.wallRun > wallW + 1e-6) {
    out.push({ level: 'error', text: `Wall run overruns the wall by ${round(lay.wallRun - wallW)}″.` });
  }

  const tooTall = lay.placed.filter((p) => p.top > wallH + 1e-6);
  if (tooTall.length) {
    const names = [...new Set(tooTall.map((p) => p.type.name))].join(', ');
    out.push({ level: 'error', text: `Exceeds the ${round(wallH)}″ ceiling: ${names}.` });
  }

  const has = (fn) => lay.placed.some((p) => fn(p.type));
  if (lay.placed.length && !has((t) => t.isSink)) {
    out.push({ level: 'warn', text: 'No sink base in this layout.' });
  }

  const ranges = lay.placed.filter((p) => p.type.appliance === 'range');
  for (const r of ranges) {
    const covered = lay.placed.some(
      (p) => p.row === 'wall' && p.x < r.x + r.w - 1e-6 && p.x + p.w > r.x + 1e-6,
    );
    if (!covered) {
      out.push({ level: 'warn', text: 'Range gap has no bridge cabinet or hood above it.' });
      break;
    }
  }

  const fillers = lay.placed.filter((p) => p.type.isFiller).reduce((s, p) => s + p.w, 0);
  if (fillers > 6) {
    out.push({ level: 'warn', text: `${round(fillers)}″ of filler — check cabinet sizing.` });
  }

  return out;
}

const round = (n) => Math.round(n * 100) / 100;
