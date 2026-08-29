import { describe, expect, it } from 'vitest';
import {
  boxInRoom, carcassBoxes, clearanceFindings, findingsForWall, frontBoxes, intrusion, planGap,
  pointInRoom,
} from '../clearance.js';
import { CLEARANCE_DEFAULTS } from '../checks.js';
import { PROJECT } from '../catalog.js';
import { floorPlan, starterProject, uid } from '../project.js';

const clear = { ...CLEARANCE_DEFAULTS, ...PROJECT };

const u = (familyId, settings = {}) => ({ uid: uid(), familyId, settings });

/**
 * An L shaped kitchen, with whatever is on each leg.
 * Wall A runs along the back, wall B turns at its right hand end.
 */
const lShape = (aUnits, bUnits) => ({
  name: 'Test', cfg: { ...PROJECT }, room: 'l', locked: [], extras: [],
  activeWall: 'A',
  walls: [
    { id: 'A', name: 'Wall A', length: 3000, obstacles: [], units: aUnits },
    { id: 'B', name: 'Wall B', length: 3000, obstacles: [], units: bUnits },
  ],
});

describe('a wall put where it really is', () => {
  it('the first wall is not moved or turned', () => {
    const entry = { origin: [0, 0], rot: 0 };
    expect(pointInRoom(entry, 100, 560)).toEqual([100, 560]);
  });

  it('the return wall turns a quarter and starts at the end of the first', () => {
    const entry = { origin: [3000, 0], rot: -Math.PI / 2 };
    const [x, z] = pointInRoom(entry, 0, 0);
    expect(Math.round(x)).toBe(3000);
    expect(Math.round(z)).toBe(0);

    // 500 along the return wall runs away from the first wall, into the room.
    const [x2, z2] = pointInRoom(entry, 500, 0);
    expect(Math.round(x2)).toBe(3000);
    expect(Math.round(z2)).toBe(500);
  });

  it('a box on a turned wall is still an axis aligned box', () => {
    const entry = { origin: [3000, 0], rot: -Math.PI / 2 };
    const box = boxInRoom(entry, 0, 600, 0, 560, 150, 870);
    expect(Math.round(box.x0)).toBe(2440);
    expect(Math.round(box.x1)).toBe(3000);
    expect(Math.round(box.z0)).toBe(0);
    expect(Math.round(box.z1)).toBe(600);
  });
});

describe('two boxes', () => {
  const at = (x0, x1, z0, z1, y0 = 0, y1 = 1000) => ({ x0, x1, z0, z1, y0, y1 });

  it('touching is a butt joint, not an intrusion', () => {
    expect(intrusion(at(0, 600, 0, 560), at(600, 1200, 0, 560))).toBeNull();
  });

  it('inside each other reports the smaller of the two overlaps', () => {
    const hit = intrusion(at(0, 600, 0, 560), at(560, 1200, 0, 560));
    expect(hit.least).toBe(40);
  });

  it('at different heights they never meet', () => {
    expect(intrusion(at(0, 600, 0, 560, 150, 870), at(0, 600, 0, 560, 1500, 2220))).toBeNull();
  });

  it('a gap is measured in the plan, and only when they could touch', () => {
    expect(planGap(at(0, 600, 0, 560), at(620, 1200, 0, 560))).toBe(20);
    expect(planGap(at(0, 600, 0, 560, 150, 870), at(620, 1200, 0, 560, 1500, 2220))).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   The corner. The reason this file exists.
   --------------------------------------------------------------------------- */
describe('two runs meeting at a corner', () => {
  it('with no blind corner cabinet the two runs are built through each other', () => {
    const project = lShape(
      [u('base-2door', { width: 600, x: 2400 })],
      [u('base-2door', { width: 600, x: 0 })],
    );
    const found = clearanceFindings(floorPlan(project), clear);
    const clash = found.filter((f) => f.rule === 'corner');

    expect(clash.length).toBeGreaterThan(0);
    expect(clash[0].level).toBe('error');
    expect(clash[0].text).toMatch(/through each other/);
    expect(clash[0].walls).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('a blind corner cabinet makes the same corner clean', () => {
    const project = lShape(
      [u('base-blind-l', { width: 900, x: 2100 })],
      [u('base-2door', { width: 600 })],
    );
    const found = clearanceFindings(floorPlan(project), clear);
    expect(found.filter((f) => f.rule === 'corner')).toHaveLength(0);
    expect(found.filter((f) => f.level === 'error')).toHaveLength(0);
  });

  /* The case the corner is actually about, and the reason a return has to
     start clear of the corner cabinet's FRONT and not only its carcass. Here
     the two carcasses miss each other by five millimetres and the two doors
     are inside each other, which is invisible in plan and fatal on the bench. */
  it('fronts that reach into each other are found even when the carcasses clear', () => {
    const project = lShape(
      [u('base-2door', { width: 600, x: 2400 })],
      [u('base-2door', { width: 600, x: 565 })],
    );
    const found = clearanceFindings(floorPlan(project), clear);
    const clash = found.find((f) => f.rule === 'front-clash');

    expect(clash).toBeDefined();
    expect(clash.level).toBe('error');
    expect(clash.text).toMatch(/with both of them shut/);
    // And the carcasses themselves are clear, so nothing else would have said so.
    expect(found.filter((f) => f.rule === 'corner')).toHaveLength(0);
  });

  it('a door with the return run standing in front of it opens nothing at all', () => {
    const project = lShape(
      [u('base-2door', { width: 600, x: 2400 })],
      [u('base-2door', { width: 600, x: 600 })],
    );
    const swing = clearanceFindings(floorPlan(project), clear)
      .filter((f) => f.rule === 'door-swing' && f.level === 'error');

    expect(swing.length).toBeGreaterThan(0);
    expect(swing[0].text).toMatch(/It runs into Wall B/);
  });

  it('a door that clears a right angle is not worth a warning', () => {
    const project = lShape(
      [u('base-blind-l', { width: 900, x: 2100 })],
      [u('base-2door', { width: 600 })],
    );
    expect(clearanceFindings(floorPlan(project), clear)
      .filter((f) => f.rule === 'door-swing')).toHaveLength(0);
  });

  it('a door that cannot open past the return run says what it runs into', () => {
    const project = lShape(
      [u('base-1door', { width: 600, x: 2400 })],
      [u('base-2door', { width: 600, x: 0 })],
    );
    const swing = clearanceFindings(floorPlan(project), clear)
      .filter((f) => f.rule === 'door-swing');

    expect(swing.length).toBeGreaterThan(0);
    expect(swing[0].text).toMatch(/runs into Wall [AB]/);
  });
});

describe('a straight kitchen that is fine stays quiet', () => {
  it('two cabinets butted on one wall raise nothing', () => {
    const project = {
      name: 'T', cfg: { ...PROJECT }, room: 'straight', locked: [], extras: [],
      activeWall: 'A',
      walls: [{
        id: 'A', name: 'Wall A', length: 3000, obstacles: [],
        units: [u('base-2door', { width: 600 }), u('base-3drawer', { width: 600 })],
      }],
    };
    const found = clearanceFindings(floorPlan(project), clear);
    expect(found.filter((f) => f.level === 'error')).toHaveLength(0);
  });
});

describe('what the model already builds', () => {
  const project = starterProject();
  const entries = floorPlan(project);

  it('every carcass in the kitchen becomes a box, appliances included', () => {
    const boxes = carcassBoxes(entries);
    const placed = entries.reduce((a, e) => a + e.lay.placed.length, 0);
    expect(boxes).toHaveLength(placed);
    expect(boxes.some((b) => b.cavity)).toBe(true);
    for (const b of boxes) {
      expect(b.x1).toBeGreaterThan(b.x0);
      expect(b.z1).toBeGreaterThan(b.z0);
      expect(b.y1).toBeGreaterThan(b.y0);
    }
  });

  it('every front becomes a thin box standing off its carcass', () => {
    const boxes = frontBoxes(entries);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      const thin = Math.min(b.x1 - b.x0, b.z1 - b.z0);
      expect(thin, b.label).toBeLessThanOrEqual(PROJECT.frontThk + 0.5);
    }
  });

  it('the two sides of an island face opposite ways', () => {
    const island = entries.find((e) => e.island);
    expect(island).toBeDefined();

    const fronts = frontBoxes([island]);
    const back = island.lay.placed.find((p) => p.side === 'back');
    const front = island.lay.placed.find((p) => p.side !== 'back');

    // Back to the island's own coordinates, since the room has moved it out
    // from the wall and that offset is not what is being tested here.
    const zOf = (uidWanted) => {
      const b = fronts.find((f) => f.uid === uidWanted);
      return (b.z0 + b.z1) / 2 - island.origin[1];
    };

    /* The front run's fronts sit just outside the island's front face at z 0,
       the back run's just outside its back face. Doors on the two sides
       looking at each other across the middle is the thing this is here to
       stop: it is not an island, it is two cabinets in an argument. */
    expect(zOf(front.item.uid)).toBeLessThan(0);
    expect(zOf(back.item.uid)).toBeGreaterThan(island.depth);
  });

  it('finishes in a reasonable time on a whole kitchen', () => {
    const started = Date.now();
    clearanceFindings(entries, clear);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('findings reach the wall they are about', () => {
  it('a corner finding shows on both of the walls that make it', () => {
    const project = lShape(
      [u('base-2door', { width: 600, x: 2400 })],
      [u('base-2door', { width: 600, x: 0 })],
    );
    const found = clearanceFindings(floorPlan(project), clear);
    expect(findingsForWall(found, 'A').some((f) => f.rule === 'corner')).toBe(true);
    expect(findingsForWall(found, 'B').some((f) => f.rule === 'corner')).toBe(true);
  });
});
