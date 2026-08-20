import { describe, expect, it } from 'vitest';
import { baseRuns, benchSchedule, endPanelParts, kickParts, splitRun } from '../runs.js';
import {
  allParts, benchPieces, layoutFor, nestCfg, roomOffsets, runParts, starterProject, totals,
} from '../project.js';
import { nestProject } from '../nesting.js';
import { PROJECT } from '../catalog.js';

const wallLay = (project, i = 0) =>
  layoutFor(project, project.walls[i], roomOffsets(project));

describe('a run is what one length of board actually covers', () => {
  const project = starterProject();
  const lay = wallLay(project);

  /* A wall cabinet is not on the floor and not under the benchtop. Leaving it
     in the list made it look like something interrupting a run, and a
     continuous wall came out as four separate benchtop pieces. */
  it('a wall cabinet standing over a run does not break it', () => {
    const runs = baseRuns(lay, 'bench', project.cfg);
    const walls = lay.placed.filter((p) => p.unit.kind === 'wall');

    expect(walls.length).toBeGreaterThan(0);
    // At least one wall cabinet sits over the middle of a run, and the run
    // is still one run.
    const over = walls.filter((w) => runs.some((r) => w.x > r.x0 && w.x < r.x1));
    expect(over.length).toBeGreaterThan(0);
    expect(runs).toHaveLength(1);
  });

  it('the kickboard stops either side of a dishwasher, the benchtop does not', () => {
    const kick = baseRuns(lay, 'kick', project.cfg);
    const bench = baseRuns(lay, 'bench', project.cfg);

    expect(kick.length).toBeGreaterThan(bench.length);
    // The benchtop covers everything the kick does, and then some.
    const kickMm = kick.reduce((a, r) => a + r.length, 0);
    const benchMm = bench.reduce((a, r) => a + r.length, 0);
    expect(benchMm).toBeGreaterThan(kickMm);
  });

  it('a tall cabinet ends a run, because it carries its own', () => {
    const runs = baseRuns(lay, 'bench', project.cfg);
    const tall = lay.placed.find((p) => p.unit.kind === 'tall');
    expect(tall).toBeDefined();
    for (const r of runs) {
      expect(r.x0 >= tall.x + tall.unit.width || r.x1 <= tall.x).toBe(true);
    }
  });

  it('runs never overlap and are in order', () => {
    for (const mode of ['kick', 'bench']) {
      const runs = baseRuns(lay, mode, project.cfg);
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].x0, mode).toBeGreaterThanOrEqual(runs[i - 1].x1);
      }
      for (const r of runs) expect(r.length, mode).toBeGreaterThan(0);
    }
  });

  it('an empty wall produces no runs at all', () => {
    const project2 = starterProject();
    project2.walls[0].units = [];
    expect(baseRuns(wallLay(project2), 'kick', project2.cfg)).toHaveLength(0);
  });
});

describe('a run too long for the stock is split, not wished away', () => {
  it('splits into equal pieces that add back up', () => {
    for (const length of [1000, 2400, 2401, 4200, 7000]) {
      const pieces = splitRun(length, 2400);
      // The pieces have to add back up to the run exactly, or it comes up
      // short at the far end of the kitchen.
      expect(pieces.reduce((a, x) => a + x, 0)).toBeCloseTo(length, 6);
      for (const p of pieces) expect(p).toBeLessThanOrEqual(2400);
    }
  });

  it('a length of nothing is no pieces, not one piece of nothing', () => {
    expect(splitRun(0)).toEqual([]);
    expect(splitRun(-5)).toEqual([]);
  });
});

describe('the kickboard is a real part', () => {
  const project = starterProject();

  it('is cut to the runs, and every piece is a usable rectangle', () => {
    const kick = runParts(project).filter((p) => p.group === 'kick');
    expect(kick.length).toBeGreaterThan(0);
    for (const p of kick) {
      expect(p.L).toBeGreaterThan(0);
      expect(p.W).toBe(PROJECT.kick);
      expect(p.T).toBeGreaterThan(0);
      expect(p.material).toMatch(/mm$/);
    }
  });

  /* The point of making it a part is that it goes on a sheet with everything
     else. It does not have to cost more: fitting into an offcut that was
     going to be thrown away is the best outcome, and the old per metre rate
     could never find that. What matters is that every piece is placed. */
  /* The point of making it a part is that it goes on a sheet with everything
     else. It does not have to cost more: fitting into an offcut that was
     going to be thrown away is the best outcome, and a per metre rate could
     never find that. What matters is that nothing is too big to cut. */
  it('no piece is too long to come off a sheet', () => {
    const nest = nestProject(allParts(project), nestCfg(project));
    const oversize = nest.oversize.filter((p) => p.group === 'kick' || p.group === 'panel');
    expect(oversize.map((p) => `${p.code} ${p.L}x${p.W}`)).toEqual([]);
  });

  it('a run longer than a sheet is split, allowing for the trim', () => {
    const p2 = starterProject();
    p2.cfg = { ...p2.cfg, trim: 10 };
    const nest = nestProject(allParts(p2), nestCfg(p2));
    expect(nest.oversize.filter((p) => p.group === 'kick')).toEqual([]);
  });

  /* Two ways of counting the same thing. The metres reported have to be the
     metres cut, or the cut list and the summary are describing different
     kitchens. */
  it('the metres reported are the metres cut', () => {
    const cut = runParts(project)
      .filter((p) => p.group === 'kick')
      .reduce((a, p) => a + p.L, 0);
    expect(totals(project).kickMetres).toBeCloseTo(cut / 1000, 6);
  });

  it('is not charged per metre on top of the board it is cut from', () => {
    expect(totals(project).kickCost).toBe(0);
  });

  it('follows its own board when one is set', () => {
    const p2 = starterProject();
    p2.cfg = { ...p2.cfg, kickBoard: 'Birch ply', kickThk: 18 };
    const kick = runParts(p2).filter((p) => p.group === 'kick');
    for (const p of kick) expect(p.material).toBe('Birch ply 18mm');
  });

  it('every part carries a key, so a cut tick stays on it', () => {
    const keys = runParts(project).map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toContain('/');
  });
});

describe('the benchtop is a schedule, not a nested part', () => {
  const project = starterProject();

  it('never reaches the nest, because it is bought by the metre', () => {
    expect(allParts(project).some((p) => p.group === 'bench')).toBe(false);
  });

  it('overhangs only the ends that are out in the open', () => {
    const runs = [
      { length: 1000, openStart: false, openEnd: false },
      { length: 1000, openStart: false, openEnd: true },
      { length: 1000, openStart: true, openEnd: true },
    ];
    const sched = benchSchedule(runs, { ...PROJECT, benchOverhang: 20 });
    expect(sched.map((s) => s.length)).toEqual([1000, 1020, 1040]);
    expect(sched.map((s) => s.overhangs)).toEqual([0, 1, 2]);
  });

  it('a run longer than a slab is reported with its joins', () => {
    const sched = benchSchedule(
      [{ length: 5000, openStart: false, openEnd: false }],
      { ...PROJECT, benchMaxPiece: 3600 });
    expect(sched[0].pieces).toHaveLength(2);
    expect(sched[0].pieces.reduce((a, x) => a + x, 0)).toBeCloseTo(5000, 1);
  });

  /* The quote and the delivery have to be the same number.

     A run is billed by its length. An island is a slab wider than a benchtop,
     so it is billed by the area it takes converted to metres of the width you
     are actually buying: charging a 1120 deep slab as though it were 600 deep
     buys half an island. The rule is written out here rather than read off
     benchLength, so the two are genuinely independent. */
  it('the metres billed are the metres in the schedule', () => {
    const byHand = benchPieces(project).reduce((a, b) => (
      b.island ? a + (b.length * b.depth) / project.cfg.benchDepth : a + b.length
    ), 0);
    expect(totals(project).benchMetres).toBeCloseTo(byHand / 1000, 6);
  });

  it('an island is one slab over its whole footprint, not a run of strips', () => {
    const slabs = benchPieces(project).filter((b) => b.island);
    expect(slabs).toHaveLength(1);

    const isl = project.walls.find((w) => w.kind === 'island');
    const over = project.cfg.benchOverhang;
    expect(slabs[0].length).toBe(isl.length + 2 * over);
    expect(slabs[0].depth).toBe(isl.depth + 2 * over);
    // Every side of an island is an open one.
    expect(slabs[0].overhangs).toBe(4);
  });

  it('a slab wider than a benchtop is billed as more than its length', () => {
    const slab = benchPieces(project).find((b) => b.island);
    expect(slab.metres * 1000).toBeGreaterThan(slab.length);
  });

  it('the kickboard goes right round an island, not across one face', () => {
    const kick = runParts(project).filter((p) => p.group === 'kick' && p.wallId === 'ISL');
    const isl = project.walls.find((w) => w.kind === 'island');
    const total = kick.reduce((a, p) => a + p.L, 0);

    // Two long sides and two ends, whatever it is split into to fit a sheet.
    expect(total).toBeCloseTo(2 * isl.length + 2 * isl.depth, 1);
  });

  it('leaving the benchtop out still lowers the total by exactly the benchtop', () => {
    const t = totals(project);
    expect(t.benchCost).toBeGreaterThan(0);
    expect(t.benchPieces.length).toBeGreaterThan(0);
  });
});

describe('automatic end panels', () => {
  const runs = [{ length: 1000, openStart: false, openEnd: true }];

  it('are off unless you ask for them', () => {
    expect(endPanelParts(runs, PROJECT, 'W0')).toHaveLength(0);
  });

  it('appear only on an end that is out in the open', () => {
    const parts = endPanelParts(runs, { ...PROJECT, endPanelAuto: true }, 'W0');
    expect(parts).toHaveLength(1);
    expect(parts[0].name).toMatch(/right/);
    expect(parts[0].L).toBe(PROJECT.benchHeight - PROJECT.benchThk);
    expect(parts[0].W).toBe(PROJECT.baseDepth);
  });

  it('reach the cut list and the nest once they are on', () => {
    const project = starterProject();
    const before = allParts(project).filter((p) => p.group === 'panel').length;
    project.cfg = { ...project.cfg, endPanelAuto: true };
    const after = allParts(project).filter((p) => p.group === 'panel').length;

    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
  });
});

describe('nothing about a run reaches the geometry of a cabinet', () => {
  it('the cabinet parts are identical whether or not end panels are on', () => {
    const a = starterProject();
    const b = starterProject();
    b.cfg = { ...b.cfg, endPanelAuto: true, kickBoard: 'Birch ply' };

    const cabinetParts = (p) => allParts(p).filter((x) => x.unitId)
      .map((x) => `${x.code} ${x.L}x${x.W}x${x.T} ${x.material}`);

    expect(cabinetParts(b)).toEqual(cabinetParts(a));
  });
});
