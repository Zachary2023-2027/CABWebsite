import { describe, expect, it } from 'vitest';
import {
  allParts, allUnits, layoutFor, nestCfg, snapX, starterProject, totals,
} from '../project.js';
import { nestProject } from '../nesting.js';
import { PRICES } from '../catalog.js';
import { hydrate, snapshot } from '../storage.js';
import { corruptedFile, schema1File, schema2File, tinyProject } from './fixtures.js';

describe('part keys survive editing', () => {
  it('a tick stays on the part you cut after an earlier cabinet is deleted', () => {
    const project = tinyProject();
    const before = allParts(project);

    const target = before.filter((p) => p.unitId === 'u3');
    expect(target.length).toBeGreaterThan(2);
    const ticked = new Set(target.slice(0, 3).map((p) => p.key));

    project.walls[0].units.splice(0, 1);
    const after = allParts(project);
    const still = after.filter((p) => ticked.has(p.key));

    expect(still).toHaveLength(3);
    for (const p of still) expect(p.unitId).toBe('u3');
  });

  it('part codes shift under the same edit, which is why keys exist', () => {
    const project = tinyProject();
    const codeBefore = allParts(project).find((p) => p.unitId === 'u3').code;

    project.walls[0].units.splice(0, 1);
    const codeAfter = allParts(project).find((p) => p.unitId === 'u3').code;

    expect(codeAfter).not.toBe(codeBefore);
  });

  it('keys are unique across a whole project', () => {
    const parts = allParts(starterProject());
    expect(new Set(parts.map((p) => p.key)).size).toBe(parts.length);
  });
});

describe('numbers computed two independent ways agree', () => {
  const project = starterProject();

  it('sheet count from totals matches a fresh nest', () => {
    const t = totals(project);
    const nest = nestProject(allParts(project), nestCfg(project));
    expect(t.sheets).toBe(nest.sheets);
    expect(t.boardCost).toBeCloseTo(nest.cost, 6);
  });

  it('part count from the project list matches the sum over cabinets', () => {
    const fromParts = allParts(project).length;
    const fromUnits = allUnits(project).reduce((a, u) => a + u.unit.parts.length, 0);
    expect(fromParts).toBe(fromUnits);
  });

  it('cabinet count from totals matches the walls', () => {
    const counted = project.walls.reduce((a, w) => a + layoutFor(project, w).placed
      .filter((p) => !p.unit.cavity && p.unit.kind !== 'filler').length, 0);
    expect(totals(project).cabinets).toBe(counted);
  });

  it('door and drawer counts match the fronts in the part list', () => {
    const t = totals(project);
    const parts = allParts(project);
    expect(t.doors).toBe(parts.filter((p) => p.group === 'front' && p.code.includes('DOOR')).length);
    expect(t.drawers).toBe(parts.filter((p) => p.code.includes('DRWR-F')).length);
  });
});

describe('layout', () => {
  it('a flowing cabinet lands where the run has got to', () => {
    const project = tinyProject();
    const lay = layoutFor(project, project.walls[0]);
    expect(lay.placed.map((p) => p.x)).toEqual([0, 800, 1400]);
  });

  it('a pinned cabinet stays put and the flow works around it', () => {
    const project = tinyProject();
    project.walls[0].units[1].settings.x = 2000;
    const lay = layoutFor(project, project.walls[0]);

    expect(lay.placed[1].x).toBe(2000);
    expect(lay.placed[1].pinned).toBe(true);
    expect(lay.placed[2].x).toBe(2600);
  });

  it('a drag snaps to a neighbour, to the wall start and to the wall end', () => {
    const project = tinyProject();
    const lay = layoutFor(project, project.walls[0]);
    const moving = lay.placed[2];

    expect(snapX(lay, moving.item, moving.unit, 830).x).toBe(800);
    expect(snapX(lay, moving.item, moving.unit, 20).x).toBe(0);
    expect(snapX(lay, moving.item, moving.unit, 2970).x).toBe(3000);
    expect(snapX(lay, moving.item, moving.unit, 1800).snap).toBeNull();
  });

  it('refuses a wall length that is not a millimetre value', () => {
    const project = tinyProject();
    project.walls[0].length = NaN;
    expect(() => layoutFor(project, project.walls[0])).toThrow(/length/);
  });
});

describe('hydrate', () => {
  it('round trips a current project without changing it', () => {
    const first = hydrate(schema2File);
    const second = hydrate(snapshot({
      id: first.id, name: first.name, project: first.project,
      cut: first.cut, prices: first.prices, quoted: first.quoted,
    }));
    expect(second.project).toEqual(first.project);
    expect(second.cut).toEqual(first.cut);
  });

  it('opens a file written before the schema field existed', () => {
    const h = hydrate(schema1File);
    expect(h.project.walls).toHaveLength(1);
    expect(h.project.room).toBe('straight');
    expect(h.project.locked).toEqual([]);
    expect(h.project.extras).toEqual([]);
    expect(h.prices.hinge).toBe(7);
    expect(allParts(h.project).length).toBeGreaterThan(0);
  });

  it('opens a current file with everything in it', () => {
    const h = hydrate(schema2File);
    expect(h.project.locked).toEqual(['u1']);
    expect(h.project.extras[0].name).toBe('Soft close kit');
    expect(h.prices.includeBench).toBe(false);
    expect(h.quoted).toBe('12000');
  });

  it('turns a corrupted file into a project that renders', () => {
    const h = hydrate(corruptedFile);
    expect(h).not.toBeNull();

    // The unknown family is dropped, the real ones survive.
    const ids = h.project.walls[0].units.map((u) => u.familyId);
    expect(ids).toEqual(['base-2door', 'base-3drawer']);

    // A nonsense position is dropped so the cabinet flows instead.
    expect(h.project.walls[0].units[0].settings.x).toBeUndefined();
    // A nonsense override is dropped rather than reaching the geometry.
    expect(h.project.walls[0].units[1].settings.cfg).toBeUndefined();
    // A lock pointing at nothing goes, a real one stays, duplicates collapse.
    expect(h.project.locked).toEqual(['a']);
    // A negative wall length is replaced, not carried.
    expect(h.project.walls[0].length).toBeGreaterThan(0);
    // An unknown room shape falls back.
    expect(h.project.room).toBe('straight');
    // The active wall points at a wall that exists.
    expect(h.project.walls.some((w) => w.id === h.project.activeWall)).toBe(true);

    // And the whole thing still builds, nests and costs.
    expect(() => {
      const t = totals(h.project);
      expect(Number.isFinite(t.cost)).toBe(true);
    }).not.toThrow();
  });

  it('rejects something that is not a project at all', () => {
    expect(hydrate(null)).toBeNull();
    expect(hydrate({})).toBeNull();
    expect(hydrate({ project: { walls: [] } })).toBeNull();
  });
});

describe('totals', () => {
  it('every reported number is finite and not negative', () => {
    const t = totals(starterProject());
    for (const [k, v] of Object.entries(t)) {
      if (typeof v !== 'number') continue;
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
    }
  });

  /* PRICES is mutated in place so pricing functions see edits at call time.
     That is deliberate, and it means a test touching it has to put it back. */
  it('leaving the benchtop out lowers the total by exactly the benchtop', () => {
    const project = starterProject();
    const withBench = totals(project);
    expect(withBench.benchIncluded).toBe(true);
    expect(withBench.benchCost).toBeGreaterThan(0);

    PRICES.includeBench = false;
    try {
      const without = totals(project);
      expect(without.benchIncluded).toBe(false);
      expect(withBench.cost - without.cost).toBeCloseTo(withBench.benchCost, 6);
    } finally {
      PRICES.includeBench = true;
    }
  });
});
