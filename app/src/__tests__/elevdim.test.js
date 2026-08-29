import { describe, expect, it } from 'vitest';
import { GAP_TOLERANCE, elevationChains, heightChain, labelRows, runLinks } from '../elevdim.js';
import { PROJECT } from '../catalog.js';
import { layoutFor, layoutWall, starterProject } from '../project.js';

const project = starterProject();
const wallA = project.walls.find((w) => w.id === 'A');

/* The one property that makes a chain worth drawing: the links add up to the
   whole, on the drawing, without the reader doing any arithmetic. If that can
   fail then the chain is decoration. */
const sums = (links) => links.reduce((a, l) => a + l.w, 0);

describe('a chain reads continuously', () => {
  it('every link starts where the last one ended', () => {
    const lay = layoutFor(project, wallA);
    const { chains } = elevationChains(lay);

    for (const chain of chains) {
      for (let i = 1; i < chain.links.length; i++) {
        expect(chain.links[i].x0, `${chain.id} link ${i}`).toBe(chain.links[i - 1].x1);
      }
    }
  });

  it('the links of a run add up to the length of the wall', () => {
    const lay = layoutFor(project, wallA);
    for (const chain of elevationChains(lay).chains) {
      expect(sums(chain.links), chain.id).toBeCloseTo(wallA.length, 6);
      expect(chain.links[0].x0).toBe(0);
      expect(chain.links[chain.links.length - 1].x1).toBe(wallA.length);
    }
  });

  it('holds on every wall in the starter kitchen', () => {
    for (const wall of project.walls) {
      const lay = layoutFor(project, wall);
      for (const chain of elevationChains(lay).chains) {
        expect(sums(chain.links), `${wall.id} ${chain.id}`).toBeCloseTo(wall.length, 6);
      }
    }
  });
});

describe('what a link is', () => {
  it('a cabinet link is its width, and carries its number', () => {
    const lay = layoutFor(project, wallA);
    const base = elevationChains(lay).chains.find((c) => c.id === 'base');
    const units = base.links.filter((l) => l.kind === 'unit' || l.kind === 'cavity');

    for (const l of units) expect(l.label).toBe(l.w);
    expect(units.some((l) => l.name === 'A1')).toBe(true);
  });

  it('a gap in the run is a link of its own, not a jump in the numbers', () => {
    const wall = {
      id: 'X', name: 'X', length: 3000, obstacles: [],
      units: [
        { uid: 'a', familyId: 'base-1door', settings: { width: 600, x: 0 } },
        { uid: 'b', familyId: 'base-1door', settings: { width: 600, x: 900 } },
      ],
    };
    const lay = layoutWall(wall, PROJECT);
    const base = elevationChains(lay).chains.find((c) => c.id === 'base');
    const gaps = base.links.filter((l) => l.kind === 'gap');

    expect(gaps.map((g) => g.w)).toEqual([300, 1500]);
    expect(sums(base.links)).toBe(3000);
  });

  it('the corner cabinet on the wall before is named, not measured as empty wall', () => {
    const lay = layoutWall(
      { id: 'X', name: 'X', length: 3000, obstacles: [], units: [] }, PROJECT, 600);
    const overall = elevationChains(lay).chains.find((c) => c.id === 'overall');
    expect(overall.links).toHaveLength(1);
    expect(overall.links[0].w).toBe(3000);
  });

  it('an overlap never draws a link running backwards', () => {
    const wall = {
      id: 'X', name: 'X', length: 3000, obstacles: [],
      units: [
        { uid: 'a', familyId: 'base-1door', settings: { width: 600, x: 0 } },
        { uid: 'b', familyId: 'base-1door', settings: { width: 600, x: 300 } },
      ],
    };
    const base = elevationChains(layoutWall(wall, PROJECT)).chains.find((c) => c.id === 'base');
    for (const l of base.links) expect(l.w, JSON.stringify(l)).toBeGreaterThan(0);
    expect(sums(base.links)).toBe(3000);
  });

  it('an empty wall still says how long it is', () => {
    const lay = layoutWall({ id: 'X', name: 'X', length: 2400, obstacles: [], units: [] }, PROJECT);
    const { chains } = elevationChains(lay);
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe('overall');
    expect(chains[0].links[0].label).toBe(2400);
  });

  it('a joint under the tolerance is a butt joint, not a gap', () => {
    const wall = {
      id: 'X', name: 'X', length: 1400, obstacles: [],
      units: [
        { uid: 'a', familyId: 'base-1door', settings: { width: 600, x: 0 } },
        { uid: 'b', familyId: 'base-1door', settings: { width: 600, x: 600 + GAP_TOLERANCE / 2 } },
      ],
    };
    const base = elevationChains(layoutWall(wall, PROJECT)).chains.find((c) => c.id === 'base');
    expect(base.links.filter((l) => l.kind === 'gap' && l.w < 5)).toHaveLength(0);
  });
});

describe('numbers that will not fit', () => {
  it('a wide link keeps its number on the line', () => {
    const rows = labelRows([{ w: 600, label: 600 }], 50);
    expect(rows[0]).toEqual({ row: 0, fits: true });
  });

  it('a narrow link drops its number rather than losing it', () => {
    const rows = labelRows([{ w: 20, label: 100 }], 50);
    expect(rows[0].fits).toBe(false);
    expect(rows[0].row).toBe(1);
  });

  it('two narrow links in a row do not land on top of each other', () => {
    const rows = labelRows(
      [{ w: 20, label: 100 }, { w: 20, label: 100 }, { w: 20, label: 100 }], 50);
    expect(rows.map((r) => r.row)).toEqual([1, 2, 1]);
  });
});

describe('the height chain', () => {
  it('runs floor to ceiling through every line you set out', () => {
    const lay = layoutFor(project, wallA);
    const chain = heightChain(lay, PROJECT);

    expect(chain.stops[0].y).toBe(0);
    expect(chain.stops[chain.stops.length - 1].y).toBe(PROJECT.ceiling);
    expect(chain.links.reduce((a, l) => a + l.h, 0)).toBe(PROJECT.ceiling);
    expect(chain.stops.map((s) => s.name)).toContain('Benchtop');
  });

  it('leaves out the lines that are not on this wall', () => {
    const lay = layoutWall({ id: 'X', name: 'X', length: 2400, obstacles: [], units: [] }, PROJECT);
    const chain = heightChain(lay, PROJECT);
    expect(chain.stops.map((s) => s.name)).toEqual(['Floor', 'Ceiling']);
  });

  it('never doubles back, even when the cabinets reach the ceiling', () => {
    const cfg = { ...PROJECT, ceiling: 2000 };
    const lay = layoutFor({ ...project, cfg }, wallA);
    const chain = heightChain(lay, cfg);
    for (const l of chain.links) expect(l.h).toBeGreaterThan(0);
  });
});

describe('where a cabinet is drawn is where it is measured', () => {
  it('a chain follows a drag rather than the stored position', () => {
    const lay = layoutFor(project, wallA);
    const first = lay.placed.find((p) => p.where !== 'wall');
    const moved = elevationChains(lay, lay.placed,
      (p) => (p.item.uid === first.item.uid ? p.x + 250 : p.x));

    const base = moved.chains.find((c) => c.id === 'base');
    expect(base.links[0].kind).toBe('gap');
    expect(base.links[0].w).toBe(250);
    expect(sums(base.links)).toBeCloseTo(wallA.length, 6);
  });
});
