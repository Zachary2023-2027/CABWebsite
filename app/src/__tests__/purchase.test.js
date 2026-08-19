import { describe, expect, it } from 'vitest';
import {
  PACK_DEFAULTS, edgeMetres, fixingCount, orderList, packsFor,
} from '../purchase.js';
import {
  allFittings, allParts, allUnits, benchPieces, nestCfg, starterProject,
} from '../project.js';
import { nestProject } from '../nesting.js';
import { drillUnit } from '../drilling.js';
import { PRICES, PROJECT } from '../catalog.js';

const DEPS = { allParts, allFittings, allUnits, drillUnit, nestProject, nestCfg, benchPieces };
const order = (project, prices = PRICES) => orderList(project, prices, DEPS);

describe('rounding up to what is actually sold', () => {
  it('a pack of 20 turns 49 into three boxes with eleven spare', () => {
    expect(packsFor(49, 20)).toEqual({ packs: 3, ordered: 60, spare: 11, packSize: 20 });
  });

  it('an exact multiple leaves nothing spare', () => {
    expect(packsFor(40, 20).spare).toBe(0);
    expect(packsFor(40, 20).packs).toBe(2);
  });

  it('a pack of one means you buy exactly what you need', () => {
    expect(packsFor(37, 1)).toEqual({ packs: 37, ordered: 37, spare: 0, packSize: 1 });
  });

  it('needing nothing orders nothing', () => {
    expect(packsFor(0, 20).packs).toBe(0);
    expect(packsFor(0, 20).ordered).toBe(0);
  });

  it('a nonsense pack size behaves as sold singly rather than dividing by zero', () => {
    for (const bad of [0, -5, null, undefined, 'box']) {
      const p = packsFor(10, bad);
      expect(Number.isFinite(p.packs), String(bad)).toBe(true);
      expect(p.packSize, String(bad)).toBe(1);
    }
  });

  it('a fractional need still rounds up to whole packs', () => {
    expect(packsFor(115.7, 50).packs).toBe(3);
    expect(packsFor(115.7, 50).spare).toBeCloseTo(34.3, 6);
  });
});

/* The gap between what you use and what you buy is the thing worth seeing. */
describe('the order list', () => {
  const project = starterProject();
  const o = order(project);
  const rows = [...o.board, ...o.hardware, ...o.other];

  it('has board, hardware and everything else in it', () => {
    expect(o.board.length).toBeGreaterThan(0);
    expect(o.hardware.length).toBeGreaterThan(0);
    expect(o.other.length).toBeGreaterThan(0);
  });

  it('every row says both what you need and what you order', () => {
    for (const r of rows) {
      expect(Number.isFinite(r.needed), r.what).toBe(true);
      expect(Number.isFinite(r.ordered), r.what).toBe(true);
      expect(r.ordered, r.what).toBeGreaterThanOrEqual(r.needed - 0.001);
      expect(r.spare, r.what).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.cost), r.what).toBe(true);
      expect(r.cost, r.what).toBeGreaterThanOrEqual(0);
    }
  });

  it('the total is the sum of the lines', () => {
    expect(o.total).toBeCloseTo(rows.reduce((a, r) => a + r.cost, 0), 4);
  });

  /* Priced by what you buy, not by what you use. Two boxes of hinges cost two
     boxes of hinges. */
  it('a packed item costs more than the pieces it contains', () => {
    const singly = order({ ...project, cfg: { ...project.cfg, hingePack: 1 } });
    const boxed = order({ ...project, cfg: { ...project.cfg, hingePack: 20 } });

    const hinges = (list) => list.hardware.find((r) => r.what === 'Hinges');
    expect(hinges(boxed).needed).toBe(hinges(singly).needed);
    expect(hinges(boxed).cost).toBeGreaterThan(hinges(singly).cost);
    expect(hinges(singly).spare).toBe(0);
    expect(hinges(boxed).spare).toBeGreaterThan(0);
  });

  it('runners are listed by length, because that is how you order them', () => {
    const runners = o.hardware.filter((r) => /runners/i.test(r.what));
    expect(runners.length).toBeGreaterThan(0);
    for (const r of runners) expect(r.what).toMatch(/\d+mm/);
  });

  it('the hinge count matches what the cabinets actually take', () => {
    const fromFittings = allFittings(project)
      .filter((f) => f.type === 'hinge')
      .reduce((a, f) => a + f.qty, 0);
    expect(o.hardware.find((r) => r.what === 'Hinges').needed).toBe(fromFittings);
  });

  it('the pack overhead is what the spares cost', () => {
    expect(o.packOverhead).toBeCloseTo(
      rows.reduce((a, r) => a + r.spare * r.each, 0), 4);
  });

  it('an empty kitchen orders nothing rather than throwing', () => {
    const empty = starterProject();
    for (const w of empty.walls) w.units = [];
    const e = order(empty);
    expect(e.hardware).toHaveLength(0);
    expect(Number.isFinite(e.total)).toBe(true);
  });
});

/* Extra board is the sheet you ruin. Nesting waste is the offcut the layout
   leaves, and that is already inside the sheet count. */
describe('extra board', () => {
  const project = starterProject();

  it('none by default, because zero is a legitimate answer', () => {
    expect(PROJECT.sheetWastePct).toBe(0);
    for (const r of order(project).board) expect(r.spare).toBe(0);
  });

  it('adds whole sheets, never a fraction of one', () => {
    const o = order({ ...project, cfg: { ...project.cfg, sheetWastePct: 20 } });
    for (const r of o.board) {
      expect(Number.isInteger(r.spare), r.what).toBe(true);
      expect(r.packs).toBe(r.needed + r.spare);
    }
  });

  it('more waste costs more board', () => {
    const none = order({ ...project, cfg: { ...project.cfg, sheetWastePct: 0 } });
    const some = order({ ...project, cfg: { ...project.cfg, sheetWastePct: 25 } });
    const boardCost = (o) => o.board.reduce((a, r) => a + r.cost, 0);
    expect(boardCost(some)).toBeGreaterThan(boardCost(none));
  });

  it('the sheets to cut never change, only the spares', () => {
    const none = order({ ...project, cfg: { ...project.cfg, sheetWastePct: 0 } });
    const some = order({ ...project, cfg: { ...project.cfg, sheetWastePct: 25 } });
    expect(some.board.map((r) => r.needed)).toEqual(none.board.map((r) => r.needed));
  });
});

describe('fixings are counted off the drilling, not guessed', () => {
  const project = starterProject();

  /* Counting both halves of a joint orders twice as many screws as the
     carcass has joints. */
  it('counts the hole the screw passes through, once per joint', () => {
    const count = fixingCount(project, { allUnits, drillUnit });
    expect(count).toBeGreaterThan(0);

    const byHand = allUnits(project).reduce((a, { unit }) => a + drillUnit(unit)
      .reduce((b, panel) => b + panel.holes.filter((h) => h.kind === 'construction').length, 0), 0);
    expect(count).toBe(byHand);
  });

  it('a dowelled carcass orders dowels and a screwed one orders screws', () => {
    const screwed = order({ ...project, cfg: { ...project.cfg, jointMethod: 'confirmat-7x50' } });
    const dowelled = order({ ...project, cfg: { ...project.cfg, jointMethod: 'dowel-8' } });

    expect(screwed.other.some((r) => /confirmat/i.test(r.what))).toBe(true);
    expect(dowelled.other.some((r) => /dowel/i.test(r.what))).toBe(true);
    expect(dowelled.other.some((r) => /confirmat/i.test(r.what))).toBe(false);
  });
});

describe('edge tape', () => {
  it('is worked out the same way the cut list works it out', () => {
    const parts = allParts(starterProject());
    const metres = edgeMetres(parts);
    expect(metres).toBeGreaterThan(0);

    // The same rule, written out independently.
    const byHand = parts.reduce((a, p) => {
      if (!p.edging) return a;
      if (p.edging.startsWith('All')) return a + (2 * p.L + 2 * p.W) / 1000;
      if (p.edging.startsWith('One')) return a + p.L / 1000;
      return a + p.W / 1000;
    }, 0);
    expect(metres).toBeCloseTo(byHand, 6);
  });

  it('comes on a roll, so a short job still buys a whole one', () => {
    const project = starterProject();
    const o = order(project);
    const tape = o.other.find((r) => r.what === 'Edge tape');
    expect(tape.packSize).toBe(PACK_DEFAULTS.edgeTapeRoll);
    expect(tape.ordered % PACK_DEFAULTS.edgeTapeRoll).toBe(0);
  });

  it('a part with no edging adds nothing', () => {
    expect(edgeMetres([{ L: 500, W: 300 }])).toBe(0);
  });
});
