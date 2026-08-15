/* ===========================================================================
   Sheet nesting. Shelf packing, first fit decreasing.

   Not an optimal nest. It is a guillotine friendly one, which is what matters
   when the cuts are made on a table saw or a track saw: every cut runs the
   full width of the piece it is cutting, so the sequence below can actually
   be followed. An optimal nest that needs plunge cuts is no use in a shed.
   =========================================================================== */

import { PRICES, sheetFor } from './catalog.js';

export const NEST = {
  kerf: 3.2,        // blade width
  trim: 10,         // taken off each edge of the sheet before anything is cut
  minOffcut: 150,   // anything smaller than this is waste, not stock
};

const area = (w, h) => (w * h) / 1e6;

/**
 * Pack parts of one material onto sheets.
 * Parts are rotated to lie long side across the shelf where that fits, which
 * is safe on melamine and MDF. Grain direction is not tracked yet.
 */
export function nestMaterial(material, parts, cfg = NEST) {
  const sheet = sheetFor(material);
  if (!sheet) return null;

  const SW = sheet.size[0] - cfg.trim * 2;
  const SH = sheet.size[1] - cfg.trim * 2;

  // Sorted by short edge, so parts of a similar width share a shelf and the
  // strips come off the sheet in a sensible order. Measured against longest
  // edge first, this packs the example kitchen into 26 sheets instead of 27.
  /* The sort keys are their own fields. They used to be written over L,
     which left W holding the original value: a part 568 long and 2084 wide
     came out of this as 2084 by 2084, a square that fits no sheet at all, so
     it was quietly dropped from the plan. Every pantry back in the example
     kitchen was going missing exactly this way. */
  const queue = parts
    .map((p, i) => ({ ...p, seq: i, long: Math.max(p.L, p.W), short: Math.min(p.L, p.W) }))
    .sort((a, b) => b.short - a.short || b.long - a.long);

  const sheets = [];
  const newSheet = () => {
    const s = { material, size: sheet.size, cost: sheet.cost, shelves: [], placements: [], usedArea: 0 };
    sheets.push(s);
    return s;
  };

  /* Parts too big for the stock. A 2400 long part will not come out of a
     2400 sheet once you have trimmed the edges, which is easy to do by
     accident and used to be handled by opening a fresh sheet, failing to
     place the part on that either, and leaving an empty sheet behind. You
     were then charged for a sheet with nothing on it, and the part quietly
     vanished from the cut plan. They are collected instead and reported. */
  const oversize = [];

  for (const p of queue) {
    let placed = false;

    for (const s of sheets) {
      if (tryPlace(s, p, SW, SH, cfg)) { placed = true; break; }
    }
    if (placed) continue;

    const s = newSheet();
    if (tryPlace(s, p, SW, SH, cfg)) continue;

    sheets.pop();
    oversize.push({
      code: p.code, name: p.name, material, L: p.L, W: p.W, T: p.T,
      unitLabel: p.unitLabel,
      needs: [Math.round(Math.max(p.L, p.W) + cfg.trim * 2), Math.round(Math.min(p.L, p.W) + cfg.trim * 2)],
      sheet: sheet.size,
    });
  }

  for (const s of sheets) {
    const total = area(s.size[0], s.size[1]);
    s.usedArea = s.placements.reduce((a, q) => a + area(q.w, q.h), 0);
    s.wastePct = total > 0 ? (1 - s.usedArea / total) * 100 : 0;
    s.offcuts = offcutsFor(s, SW, SH, cfg);
  }

  return { sheets, oversize };
}

function tryPlace(sheet, p, SW, SH, cfg) {
  // Orientation: try as cut, then rotated, preferring the one that is shorter
  // across the shelf so shelves stay low.
  const options = [
    { w: p.L, h: p.W, rot: false },
    { w: p.W, h: p.L, rot: true },
  ].filter((o) => o.w <= SW && o.h <= SH);
  if (!options.length) return false;

  let best = null;
  for (const shelf of sheet.shelves) {
    for (const o of options) {
      if (o.h > shelf.h) continue;
      if (shelf.x + o.w > SW) continue;
      // Waste is the strip left above the part plus the tail of the shelf.
      const score = (shelf.h - o.h) * o.w + (SW - shelf.x - o.w) * 0.001;
      if (!best || score < best.score) best = { shelf, o, score };
    }
  }
  if (best) { place(sheet, best.shelf, p, best.o, cfg); return true; }

  // Start a new shelf, using the orientation that keeps the shelf shortest.
  const used = sheet.shelves.reduce((a, s) => a + s.h + cfg.kerf, 0);
  const fit = options
    .filter((o) => used + o.h <= SH)
    .sort((a, b) => a.h - b.h)[0];
  if (!fit) return false;

  const shelf = { y: used, h: fit.h, x: 0 };
  sheet.shelves.push(shelf);
  place(sheet, shelf, p, fit, cfg);
  return true;
}

function place(sheet, shelf, p, o, cfg) {
  sheet.placements.push({
    code: p.code, name: p.name, unitLabel: p.unitLabel,
    x: shelf.x + cfg.trim, y: shelf.y + cfg.trim,
    w: o.w, h: o.h, rot: o.rot, L: p.L, W: p.W, T: p.T,
  });
  shelf.x += o.w + cfg.kerf;
}

/** Usable rectangles left over: the tail of each shelf, and the strip below. */
function offcutsFor(sheet, SW, SH, cfg) {
  const out = [];
  for (const s of sheet.shelves) {
    const w = SW - s.x;
    if (w >= cfg.minOffcut && s.h >= cfg.minOffcut) {
      out.push({ w: Math.round(w), h: Math.round(s.h), where: `beside shelf at ${Math.round(s.y)}` });
    }
  }
  const used = sheet.shelves.reduce((a, s) => a + s.h + cfg.kerf, 0);
  const tail = SH - used;
  if (tail >= cfg.minOffcut) out.push({ w: Math.round(SW), h: Math.round(tail), where: 'full width strip at the end' });
  return out;
}

/** Nest the whole project, grouped by material. */
export function nestProject(parts, cfg = NEST) {
  const byMaterial = new Map();
  for (const p of parts) {
    if (!sheetFor(p.material)) continue;
    if (!byMaterial.has(p.material)) byMaterial.set(p.material, []);
    byMaterial.get(p.material).push(p);
  }

  const groups = [];
  const oversize = [];
  for (const [material, list] of byMaterial) {
    const res = nestMaterial(material, list, cfg);
    if (!res) continue;
    const { sheets } = res;
    oversize.push(...res.oversize);
    if (!sheets.length) continue;
    const totalArea = sheets.reduce((a, s) => a + area(s.size[0], s.size[1]), 0);
    const usedArea = sheets.reduce((a, s) => a + s.usedArea, 0);
    groups.push({
      material, sheets,
      count: sheets.length,
      cost: sheets.length * sheets[0].cost,
      wastePct: totalArea > 0 ? (1 - usedArea / totalArea) * 100 : 0,
      partCount: list.length,
    });
  }
  groups.sort((a, b) => b.count - a.count);

  return {
    groups,
    /* Parts that will not come off any sheet you stock. Nothing downstream
       can quietly ignore this: it means the kitchen as drawn cannot be cut. */
    oversize,
    sheets: groups.reduce((a, g) => a + g.count, 0),
    cost: groups.reduce((a, g) => a + g.cost, 0),
    wastePct: groups.length
      ? groups.reduce((a, g) => a + g.wastePct * g.count, 0) / groups.reduce((a, g) => a + g.count, 0)
      : 0,
  };
}

/**
 * Cutting sequence for one sheet. Rip the shelves off first, then crosscut
 * each strip into parts. That is the order a table saw wants.
 */
export function cutSequence(sheet, cfg = NEST) {
  const steps = [];
  steps.push({ n: 1, cut: 'Trim', text: `Trim ${cfg.trim}mm off all four edges of the ${sheet.size[0]} x ${sheet.size[1]} sheet.` });

  let n = 2;
  const shelves = [...sheet.shelves].sort((a, b) => a.y - b.y);
  for (const [i, s] of shelves.entries()) {
    steps.push({
      n: n++, cut: 'Rip',
      text: `Rip strip ${i + 1} at ${Math.round(s.h)}mm wide.`,
    });
  }
  for (const [i, s] of shelves.entries()) {
    const inShelf = sheet.placements
      .filter((p) => Math.abs(p.y - cfg.trim - s.y) < 0.5)
      .sort((a, b) => a.x - b.x);
    if (!inShelf.length) continue;
    steps.push({
      n: n++, cut: 'Crosscut',
      text: `Strip ${i + 1}, crosscut to ${inShelf.map((p) => `${Math.round(p.w)}`).join(', ')}.`,
      parts: inShelf.map((p) => p.code),
    });
  }
  return steps;
}
