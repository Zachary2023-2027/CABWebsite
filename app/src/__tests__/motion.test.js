import { describe, expect, it } from 'vitest';
import {
  FULL_SWING, arcPoint, degrees, doorSwing, drawerSlide, hingeSideOf, inSector,
  largestSwing, overlapsVertically, sectorHitsBox, swingProblems, swingSector,
} from '../motion.js';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';

const doorsOf = (u) => u.parts.filter((p) => p.group === 'front' && p.code.includes('DOOR'));

describe('a door turns about its hinge edge', () => {
  const u = buildUnit('T1', 'base-2door', { width: 800 }, PROJECT);
  const [left, right] = doorsOf(u);

  it('the pair is hinged on its outer edges', () => {
    expect(hingeSideOf(left)).toBe('left');
    expect(hingeSideOf(right)).toBe('right');
  });

  it('the pivot is the hinge edge, not the middle of the door', () => {
    expect(doorSwing(left).pivot[0]).toBeCloseTo(left.pos[0], 6);
    expect(doorSwing(right).pivot[0]).toBeCloseTo(right.pos[0] + right.size[0], 6);
  });

  /* Getting the sign wrong swings the door into the cabinet, which looks
     almost right until you notice the door is inside the box. */
  it('opens out into the room, not back through the carcass', () => {
    for (const door of [left, right]) {
      const swing = doorSwing(door, 1);
      const sector = swingSector(door, 0);
      const [, endZ] = arcPoint(sector, 1);
      // The free corner ends up in front of the cabinet face.
      expect(endZ, door.code).toBeGreaterThan(door.pos[2]);
    }
  });

  it('the two doors of a pair turn opposite ways', () => {
    expect(Math.sign(doorSwing(left, 1).angle))
      .toBe(-Math.sign(doorSwing(right, 1).angle));
  });

  it('shut is shut and open is the full swing', () => {
    expect(doorSwing(left, 0).angle).toBe(0);
    expect(Math.abs(degrees(doorSwing(left, 1).angle))).toBe(110);
  });

  it('an open fraction outside 0 to 1 is clamped, not extrapolated', () => {
    expect(Math.abs(doorSwing(left, 5).angle)).toBeCloseTo(FULL_SWING, 6);
    expect(Math.abs(doorSwing(left, -3).angle)).toBe(0);
  });
});

describe('a drawer comes straight out', () => {
  it('travels its runner length, and nothing when shut', () => {
    expect(drawerSlide({}, 0, 500).z).toBe(0);
    expect(drawerSlide({}, 1, 500).z).toBe(500);
    expect(drawerSlide({}, 0.5, 400).z).toBe(200);
  });

  it('is clamped the same way a door is', () => {
    expect(drawerSlide({}, 9, 500).z).toBe(500);
    expect(drawerSlide({}, -9, 500).z).toBe(0);
  });
});

describe('the sector a door sweeps', () => {
  const u = buildUnit('T1', 'base-1door', { width: 450 }, PROJECT);
  const door = doorsOf(u)[0];

  it('is centred on the hinge with the door width as its radius', () => {
    const s = swingSector(door, 1000);
    expect(s.radius).toBeCloseTo(door.size[0], 6);
    expect(s.cx).toBeCloseTo(1000 + door.pos[0], 6);
  });

  it('contains a point just in front of the open door', () => {
    const s = swingSector(door, 0);
    const [px, pz] = arcPoint(s, 0.5);
    // Pull the point slightly inside the radius.
    const inx = s.cx + (px - s.cx) * 0.8;
    const inz = s.cz + (pz - s.cz) * 0.8;
    expect(inSector(s, inx, inz)).toBe(true);
  });

  it('does not contain a point beyond its reach or behind it', () => {
    const s = swingSector(door, 0);
    expect(inSector(s, s.cx + s.radius * 3, s.cz + 10)).toBe(false);
    expect(inSector(s, s.cx, s.cz - 500)).toBe(false);
  });
});

/* A door that fouls the cabinet beside it, or the wall it is next to, is a
   mistake you find after everything is cut and hung. */
describe('what a door hits', () => {
  const u = buildUnit('T1', 'base-2door', { width: 800 }, PROJECT);

  it('nothing, with an empty room in front of it', () => {
    expect(swingProblems(u, 0, [])).toEqual([]);
  });

  it('a wall hard against the hinge side stops the door at 90 degrees', () => {
    const wall = { x0: -200, x1: 0, z0: 0, z1: 1200, label: 'the wall' };
    const problems = swingProblems(u, 0, [wall]);

    // Only the door hinged on that side is affected.
    expect(problems).toHaveLength(1);
    expect(problems[0].hits).toEqual(['the wall']);

    const left = doorsOf(u).find((d) => d.hinge === 'left');
    expect(degrees(largestSwing(left, 0, [wall]))).toBe(90);
  });

  it('reports how far it does open, not just that it does not', () => {
    const left = doorsOf(u).find((d) => d.hinge === 'left');
    const close = { x0: -900, x1: -100, z0: 500, z1: 1300, label: 'a return' };
    const reach = largestSwing(left, 0, [close]);

    expect(degrees(reach)).toBeGreaterThan(0);
    expect(degrees(reach)).toBeLessThan(110);
  });

  it('with nothing in the way a door reaches its full swing', () => {
    for (const door of doorsOf(u)) {
      expect(largestSwing(door, 0, [])).toBeCloseTo(FULL_SWING, 6);
    }
  });

  it('a box behind the cabinet is not in the way of anything', () => {
    const behind = { x0: -500, x1: 1500, z0: -400, z1: -10, label: 'the wall behind' };
    expect(swingProblems(u, 0, [behind])).toEqual([]);
  });

  /* The arc is sampled, so a box narrow enough to slip between two samples
     has to be caught by the open door lying across it instead. */
  it('catches a thin obstruction the arc could step over', () => {
    const sector = swingSector(doorsOf(u)[0], 0);
    const thin = {
      x0: sector.cx + sector.radius * 0.35, x1: sector.cx + sector.radius * 0.4,
      z0: sector.cz + 1, z1: sector.cz + sector.radius,
      label: 'a post',
    };
    expect(sectorHitsBox(sector, thin)).toBe(true);
  });
});

describe('every door in every preset can be swung without falling over', () => {
  for (const f of FAMILIES.filter((x) => !x.cavity)) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      for (const door of doorsOf(u)) {
        const swing = doorSwing(door, 1);
        expect(swing.pivot.every(Number.isFinite), door.code).toBe(true);
        expect(Number.isFinite(swing.angle), door.code).toBe(true);
        expect(swing.radius, door.code).toBeGreaterThan(0);

        const sector = swingSector(door, 0);
        expect(Number.isFinite(sector.cx) && Number.isFinite(sector.cz)).toBe(true);
        for (const t of [0, 0.5, 1]) {
          expect(arcPoint(sector, t).every(Number.isFinite), door.code).toBe(true);
        }
      }
    });
  }
});


/* A plan on its own cannot tell you whether two things collide. A wall cabinet
   door at 1500 sweeps clean over a base cabinet at 900, and comparing only
   their footprints says they foul each other: that reported every wall cabinet
   door in the example kitchen as opening zero degrees. */
describe('things at different heights do not collide', () => {
  const wallCab = buildUnit('T1', 'wall-2door', { width: 800 }, PROJECT);
  const baseBelow = {
    x0: -100, x1: 900, z0: 0, z1: 560,
    y0: PROJECT.kick, y1: PROJECT.benchHeight,
    label: 'the bench below',
  };

  it('a wall cabinet door opens fully over a base cabinet', () => {
    for (const door of doorsOf(wallCab)) {
      const reach = largestSwing(door, 0, [baseBelow], FULL_SWING, 22, PROJECT.wallMount);
      expect(degrees(reach), door.code).toBe(110);
    }
  });

  it('the same door is still stopped by something at its own height', () => {
    const beside = {
      x0: -400, x1: 0, z0: 0, z1: 400,
      y0: PROJECT.wallMount, y1: PROJECT.wallMount + PROJECT.wallCabHeight,
      label: 'the next wall cabinet',
    };
    const left = doorsOf(wallCab).find((d) => d.hinge === 'left');
    expect(degrees(largestSwing(left, 0, [beside], FULL_SWING, 22, PROJECT.wallMount)))
      .toBeLessThan(110);
  });

  it('a box with no height stated is treated as reaching everywhere', () => {
    expect(overlapsVertically({ y0: 0, y1: 100 }, {})).toBe(true);
    expect(overlapsVertically({}, { y0: 0, y1: 100 })).toBe(true);
  });

  it('bands that touch at an edge do not count as overlapping', () => {
    expect(overlapsVertically({ y0: 0, y1: 900 }, { y0: 900, y1: 1800 })).toBe(false);
    expect(overlapsVertically({ y0: 0, y1: 901 }, { y0: 900, y1: 1800 })).toBe(true);
  });

  it('the sector carries the height band of the door it belongs to', () => {
    const door = doorsOf(wallCab)[0];
    const s = swingSector(door, 0, FULL_SWING, PROJECT.wallMount);
    expect(s.y0).toBeCloseTo(PROJECT.wallMount + door.pos[1], 6);
    expect(s.y1 - s.y0).toBeCloseTo(door.size[1], 6);
  });

  it('the height check does not let a real collision through', () => {
    const sameHeight = {
      x0: -300, x1: 0, z0: 0, z1: 900,
      y0: PROJECT.wallMount, y1: PROJECT.wallMount + 720,
      label: 'a return',
    };
    const s = swingSector(doorsOf(wallCab)[0], 0, FULL_SWING, PROJECT.wallMount);
    expect(sectorHitsBox(s, sameHeight)).toBe(true);
  });
});
