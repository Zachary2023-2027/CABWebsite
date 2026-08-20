/* ===========================================================================
   Where the things in the drawing go.

   All of this used to be worked out inside a component, where the only way to
   check it was to look at a picture. Some of it looks fine in a picture and is
   wrong: a handle drawn against the hinge side of a door is a handle you
   cannot pull, and it takes building the kitchen to find out.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  BRACKET_INSET, STOOL_SETBACK, barBracketPositions, barSeatPositions, handlesFor,
  islandSlab, skirtingRuns, wallBands, wallOpenings,
} from '../fixtures.js';
import { PROJECT, buildUnit } from '../catalog.js';

const unit = (familyId, settings = {}) => buildUnit('X1', familyId, settings, PROJECT);

describe('handles', () => {
  it('puts one on every door and every drawer front, and nowhere else', () => {
    const u = unit('base-3drawer', { width: 600 });
    const fronts = u.parts.filter((p) => p.group === 'front' && p.code.includes('DRWR-F'));
    expect(handlesFor(u)).toHaveLength(fronts.length);
    expect(handlesFor(u).every((h) => h.drawer != null)).toBe(true);
  });

  it('carries which front it is fixed to, so it moves with it', () => {
    const u = unit('base-2door', { width: 800, doors: 2 });
    for (const h of handlesFor(u)) {
      expect(u.parts.some((p) => p.code === h.door)).toBe(true);
    }
  });

  /* The one place on a door a handle never goes. */
  it('goes on the opening edge of a door, never the hinge edge', () => {
    const u = unit('base-2door', { width: 800, doors: 2 });
    const doors = u.parts.filter((p) => p.group === 'front' && p.code.includes('DOOR'));
    expect(doors.length).toBe(2);

    for (const d of doors) {
      const h = handlesFor(u).find((x) => x.door === d.code);
      const middle = d.pos[0] + d.size[0] / 2;
      if (d.hinge === 'left') expect(h.at[0]).toBeGreaterThan(middle);
      else expect(h.at[0]).toBeLessThan(middle);
    }
  });

  it('stands the handle off the face of the front it is on', () => {
    const u = unit('base-1door', { width: 450 });
    const door = u.parts.find((p) => p.code.includes('DOOR'));
    const h = handlesFor(u).find((x) => x.door === door.code);
    expect(h.at[2]).toBe(door.pos[2] + door.size[2]);
  });

  it('never draws a handle longer than the front it is on', () => {
    for (const w of [300, 450, 600, 900, 1200]) {
      const u = unit('base-3drawer', { width: w });
      for (const h of handlesFor(u)) {
        const front = u.parts.find((p) => p.code === h.key);
        expect(h.length).toBeLessThan(h.vertical ? front.size[1] : front.size[0]);
      }
    }
  });

  it('has nothing to hang on a cabinet with no fronts', () => {
    expect(handlesFor(unit('wall-open', { width: 800 }))).toEqual([]);
    expect(handlesFor(null)).toEqual([]);
  });
});

describe('a wall with holes in it', () => {
  const win = (x, w) => ({ id: `w${x}`, kind: 'window', x, y: 900, w, h: 1200 });
  const doorway = (x, w) => ({ id: `d${x}`, kind: 'door', x, y: 0, w, h: 2040 });
  const wall = (obstacles) => ({ id: 'A', obstacles });

  it('is one solid band when there is nothing in it', () => {
    expect(wallBands(wall([]), 3600, 2400)).toEqual([{ x: 0, w: 3600, y: 0, h: 2400 }]);
  });

  /* Every millimetre of wall is either solid or a hole, once. */
  it('accounts for the whole wall, with the openings taken out', () => {
    const bands = wallBands(wall([win(1200, 1000)]), 3600, 2400);
    const area = bands.reduce((a, b) => a + b.w * b.h, 0);
    expect(area).toBe(3600 * 2400 - 1000 * 1200);
  });

  it('leaves a head over a window and a sill under it', () => {
    const bands = wallBands(wall([win(1200, 1000)]), 3600, 2400);
    const over = bands.find((b) => b.x === 1200 && b.y === 2100);
    const under = bands.find((b) => b.x === 1200 && b.y === 0);
    expect(over.h).toBe(300);
    expect(under.h).toBe(900);
  });

  it('leaves no sill under a doorway, because it goes to the floor', () => {
    const bands = wallBands(wall([doorway(1000, 820)]), 3600, 2400);
    expect(bands.some((b) => b.x === 1000 && b.y === 0)).toBe(false);
    expect(bands.find((b) => b.x === 1000).y).toBe(2040);
  });

  /* Two windows share the pier between them. Drawing it once per window puts
     two faces in the same place, which flickers as the camera moves. */
  it('draws the pier between two windows once', () => {
    const bands = wallBands(wall([win(600, 800), win(1800, 800)]), 3600, 2400);
    const piers = bands.filter((b) => b.h === 2400);
    const spans = piers.map((b) => `${b.x}-${b.x + b.w}`);
    expect(new Set(spans).size).toBe(spans.length);
    expect(spans).toContain('1400-1800');
  });

  it('clips an opening that runs past the end of the wall', () => {
    const bands = wallBands(wall([win(3400, 1000)]), 3600, 2400);
    const area = bands.reduce((a, b) => a + b.w * b.h, 0);
    // Only the 200 that is actually on this wall is a hole.
    expect(area).toBe(3600 * 2400 - 200 * 1200);
  });

  it('ignores a service, which is a thing on a wall and not a hole in it', () => {
    const power = { id: 'p', kind: 'power', x: 1200, y: 1100, w: 120, h: 80 };
    expect(wallOpenings(wall([power]))).toEqual([]);
    expect(wallBands(wall([power]), 3600, 2400)).toHaveLength(1);
  });
});

describe('skirting', () => {
  it('runs the whole wall when nothing interrupts it', () => {
    expect(skirtingRuns({ obstacles: [] }, 3600)).toEqual([{ x: 0, w: 3600 }]);
  });

  it('stops either side of a doorway', () => {
    const wall = { obstacles: [{ id: 'd', kind: 'door', x: 1000, y: 0, w: 820, h: 2040 }] };
    expect(skirtingRuns(wall, 3600)).toEqual([{ x: 0, w: 1000 }, { x: 1820, w: 1780 }]);
  });

  it('runs straight under a window, which starts above it', () => {
    const wall = { obstacles: [{ id: 'w', kind: 'window', x: 1000, y: 900, w: 1000, h: 1200 }] };
    expect(skirtingRuns(wall, 3600)).toEqual([{ x: 0, w: 3600 }]);
  });
});

describe('the island slab', () => {
  const none = { side: 'none', depth: 0 };

  it('is centred on the island when there is no bar', () => {
    const s = islandSlab(2400, 1120, 20, none);
    expect(s).toMatchObject({ length: 2440, across: 1160, shiftX: 0, shiftZ: 0 });
  });

  /* A top 400 wider is also 200 further over. Centring it leaves 200 of
     overhang on the side with no stools at it. */
  it('moves off centre by half of what the bar adds', () => {
    const s = islandSlab(2400, 1120, 20, { side: 'back', depth: 400 });
    expect(s.across).toBe(1560);
    expect(s.shiftZ).toBe(200);
    expect(s.shiftX).toBe(0);
  });

  it('moves the other way for a bar on the front', () => {
    expect(islandSlab(2400, 1120, 20, { side: 'front', depth: 400 }).shiftZ).toBe(-200);
  });

  it('moves along the island for a bar on an end', () => {
    const left = islandSlab(2400, 1120, 20, { side: 'left', depth: 300 });
    const right = islandSlab(2400, 1120, 20, { side: 'right', depth: 300 });
    expect(left.shiftX).toBe(-150);
    expect(right.shiftX).toBe(150);
    expect(left.across).toBe(right.across);
  });

  /* Worked out the other way: where the slab's far edge lands. */
  it('puts the bar edge exactly where the overhang says', () => {
    const depth = 1120;
    const s = islandSlab(2400, depth, 20, { side: 'back', depth: 400 });
    const farEdge = depth / 2 + s.shiftZ + s.across / 2;
    expect(farEdge).toBe(depth + 20 + 400);
  });
});

describe('stools and brackets along the bar', () => {
  const bar = { side: 'back', depth: 400 };

  it('spaces the stools evenly and faces them all the same way', () => {
    const seats = barSeatPositions(4, 2400, 1120, bar, 20);
    expect(seats.map((s) => s.x)).toEqual([300, 900, 1500, 2100]);
    expect(new Set(seats.map((s) => s.rot)).size).toBe(1);
  });

  it('sets them back from the bar edge, not from the carcass', () => {
    const [first] = barSeatPositions(1, 2400, 1120, bar, 20);
    expect(first.z).toBe(1120 + 400 + 20 - STOOL_SETBACK);
  });

  it('puts them on the end for a bar on an end, along the depth', () => {
    const seats = barSeatPositions(2, 2400, 1120, { side: 'right', depth: 300 }, 20);
    expect(seats.map((s) => s.z)).toEqual([280, 840]);
    expect(seats.every((s) => s.x === 2400 + 300 + 20 - STOOL_SETBACK)).toBe(true);
  });

  it('has none when there is no bar and none when nothing fits', () => {
    expect(barSeatPositions(0, 2400, 1120, bar, 20)).toEqual([]);
    expect(barSeatPositions(4, 2400, 1120, { side: 'none', depth: 0 }, 20)).toEqual([]);
  });

  it('puts a bracket in from each end and spreads the rest between', () => {
    const b = barBracketPositions(4, 2400, 1120, bar);
    expect(b[0].x).toBe(BRACKET_INSET);
    expect(b[b.length - 1].x).toBe(2400 - BRACKET_INSET);
    const gaps = b.slice(1).map((q, i) => q.x - b[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
  });

  it('puts the brackets on the carcass line, which is what they screw to', () => {
    expect(barBracketPositions(2, 2400, 1120, bar).every((q) => q.z === 1120)).toBe(true);
    expect(barBracketPositions(2, 2400, 1120, { side: 'front', depth: 400 })
      .every((q) => q.z === 0)).toBe(true);
  });

  it('handles a single bracket without dividing by nothing', () => {
    const b = barBracketPositions(1, 2400, 1120, bar);
    expect(b).toHaveLength(1);
    expect(Number.isFinite(b[0].x)).toBe(true);
  });
});
