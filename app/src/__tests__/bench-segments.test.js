/* ===========================================================================
   Where the benchtop runs, and therefore where the splashback does.

   The elevation and the 3D each worked this out for themselves, in two copies
   of the same twelve lines. The elevation's copy was right. The 3D never had
   one for the splashback at all: it drew a single slab the whole length of the
   wall, which ran straight through every tall cabinet standing on that wall
   and hung in the air past the end of the run, while the correct benchtop
   segments were drawn a few lines further down the same file.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import { benchSegments, carriesBench } from '../fixtures.js';
import { layoutFor, roomOffsets, starterProject } from '../project.js';
import { buildUnit } from '../catalog.js';

const bare = (units) => {
  const p = starterProject();
  p.room = 'straight';
  p.walls = [{ id: 'A', name: 'Wall A', length: 4800, obstacles: [], units }];
  return p;
};

const u = (familyId, settings = {}, i = 0) => ({ uid: `u${i}`, familyId, settings });

const lay = (p) => layoutFor(p, p.walls[0], roomOffsets(p));

describe('what carries a benchtop', () => {
  const cfg = starterProject().cfg;
  const unit = (id, s = {}) => buildUnit('probe', id, s, cfg);

  it('a base cabinet does', () => {
    expect(carriesBench(unit('base-2door'))).toBe(true);
  });

  it('a filler does, because the top runs over it', () => {
    expect(carriesBench(unit('filler', { width: 100 }))).toBe(true);
  });

  it('a dishwasher does, because the top runs over that too', () => {
    expect(carriesBench(unit('app-dishwasher'))).toBe(true);
  });

  it('a freestanding cooker does not, because it breaks the run', () => {
    expect(carriesBench(unit('app-cooktop'))).toBe(false);
  });

  it('a tall cabinet does not, because it is taller than the top', () => {
    expect(carriesBench(unit('tall-pantry'))).toBe(false);
  });

  it('a fridge does not', () => {
    expect(carriesBench(unit('app-fridge', { height: 2250 }))).toBe(false);
  });

  it('a wall cabinet is never asked, and is not on the floor run anyway', () => {
    expect(carriesBench(unit('wall-2door'))).toBe(false);
  });
});

describe('the stretches a benchtop runs along', () => {
  it('merges cabinets that touch into one length', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('base-3drawer', { width: 600 }, 1),
      u('base-1door', { width: 450 }, 2),
    ]);
    const segs = benchSegments(lay(p));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ x: 0, w: 1850 });
  });

  it('breaks at a tall cabinet and starts again after it', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('tall-pantry', { width: 600 }, 1),
      u('base-2door', { width: 900 }, 2),
    ]);
    const segs = benchSegments(lay(p));
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ x: 0, w: 800 });
    expect(segs[1]).toEqual({ x: 1400, w: 900 });
  });

  it('breaks at a freestanding cooker', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('app-cooktop', { width: 900 }, 1),
      u('base-2door', { width: 800 }, 2),
    ]);
    expect(benchSegments(lay(p)).map((s) => s.x)).toEqual([0, 1700]);
  });

  it('runs straight over a dishwasher without breaking', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('app-dishwasher', { width: 600 }, 1),
      u('base-2door', { width: 800 }, 2),
    ]);
    const segs = benchSegments(lay(p));
    expect(segs).toHaveLength(1);
    expect(segs[0].w).toBe(2200);
  });

  it('is nothing at all on a wall with only wall cabinets on it', () => {
    const p = bare([u('wall-2door', { width: 800 }, 0)]);
    expect(benchSegments(lay(p))).toEqual([]);
  });

  /* The bug, stated as a measurement. Every stretch has to sit inside the run
     of cabinets that actually carry a top: none of it past the end of the
     wall, and none of it crossing a tall cabinet. A single slab the length of
     the wall fails both. */
  it('never covers ground a tall cabinet is standing on', () => {
    const p = bare([
      u('tall-pantry', { width: 600 }, 0),
      u('base-2door', { width: 800 }, 1),
      u('tall-oven', { width: 600 }, 2),
      u('base-3drawer', { width: 600 }, 3),
    ]);
    const l = lay(p);
    const segs = benchSegments(l);

    const tall = l.placed
      .filter((q) => !carriesBench(q.unit) && q.where !== 'wall')
      .map((q) => [q.x, q.x + q.unit.width]);
    expect(tall.length).toBe(2);

    for (const s of segs) {
      for (const [a, b] of tall) {
        const overlap = Math.min(s.x + s.w, b) - Math.max(s.x, a);
        expect(overlap).toBeLessThanOrEqual(0);
      }
    }
  });

  it('stops where the cabinets stop, not where the wall does', () => {
    const p = bare([u('base-2door', { width: 800 }, 0)]);
    const l = lay(p);
    const segs = benchSegments(l);
    const end = Math.max(...segs.map((s) => s.x + s.w));
    expect(end).toBe(800);
    expect(end).toBeLessThan(l.wall.length);
  });

  /* Two independent ways to the same number: the stretches add up to the
     widths of the cabinets that carry a top, no more and no less. */
  it('adds up to exactly the cabinets that carry a top', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('tall-pantry', { width: 600 }, 1),
      u('app-dishwasher', { width: 600 }, 2),
      u('base-3drawer', { width: 700 }, 3),
      u('app-cooktop', { width: 900 }, 4),
      u('filler', { width: 100 }, 5),
      u('wall-2door', { width: 800 }, 6),
    ]);
    const l = lay(p);
    const fromSegs = benchSegments(l).reduce((a, s) => a + s.w, 0);
    const fromUnits = l.placed
      .filter((q) => q.where !== 'wall' && carriesBench(q.unit))
      .reduce((a, q) => a + q.unit.width, 0);
    expect(fromSegs).toBe(fromUnits);
  });

  it('follows a cabinet that is being dragged rather than where it is stored', () => {
    const p = bare([
      u('base-2door', { width: 800 }, 0),
      u('base-2door', { width: 800 }, 1),
    ]);
    const l = lay(p);
    const moved = l.placed[1].item.uid;

    // Dragged clear of its neighbour, the one run becomes two.
    const segs = benchSegments(l, (q) => (q.item.uid === moved ? 2000 : q.x));
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ x: 0, w: 800 });
    expect(segs[1]).toEqual({ x: 2000, w: 800 });
  });
});
