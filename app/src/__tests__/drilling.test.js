import { describe, expect, it } from 'vitest';
import {
  DRILL, JOINTS, SYS32, drillPanel, drillUnit, hingePositions, jointMethod, jointXs, rearRowX,
  shelfFixOf,
} from '../drilling.js';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';
import { POCKET, canPocket, pocketFaceOffset, pocketPositions } from '../pocket.js';

const built = FAMILIES.filter((f) => !f.cavity);

/* The two carcasses that are drilled differently, so a test can say which one
   it means rather than inheriting whichever is the current default.

   PINS is the adjustable shelf on a confirmat carcass, which is what this app
   built before pocket screws existed and what half these tests are about.
   POCKETS is the default now. */
const PINS = { ...PROJECT, jointMethod: 'confirmat-7x50', shelfFix: 'pins' };
const POCKETS = { ...PROJECT, jointMethod: 'pocket-screw', shelfFix: 'pocket' };

describe('hole positions are whole millimetres', () => {
  it('across every preset, at every width it offers', () => {
    for (const f of built) {
      for (const width of f.widths) {
        for (const panel of drillUnit(buildUnit('T1', f.id, { width }, PROJECT))) {
          for (const h of panel.holes) {
            expect(Number.isInteger(h.x), `${panel.code} x ${h.x}`).toBe(true);
            expect(Number.isInteger(h.y), `${panel.code} y ${h.y}`).toBe(true);
            expect(h.x, `${panel.code} x`).toBeGreaterThanOrEqual(0);
            expect(h.y, `${panel.code} y`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('no hole falls outside the panel it belongs to', () => {
    for (const f of built) {
      for (const panel of drillUnit(buildUnit('T1', f.id, {}, PROJECT))) {
        for (const h of panel.holes) {
          expect(h.x, `${panel.code} x past ${panel.w}`).toBeLessThanOrEqual(panel.w);
          expect(h.y, `${panel.code} y past ${panel.h}`).toBeLessThanOrEqual(panel.h);
        }
      }
    }
  });
});

describe('shelf pins sit on the 32mm grid', () => {
  it('every system hole is a whole number of pitches above the first hole', () => {
    const u = buildUnit('T1', 'tall-pantry', {}, PINS);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));

    const system = side.holes.filter((h) => h.kind === 'system');
    expect(system.length).toBeGreaterThan(0);

    for (const h of system) {
      const steps = (h.y - DRILL.firstHole) / DRILL.pitch;
      expect(Number.isInteger(steps), `hole at ${h.y}`).toBe(true);
    }
  });

  it('drills two positions either side of each shelf, so it moves 64mm', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, PINS);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    const ys = [...new Set(side.holes.filter((h) => h.kind === 'system').map((h) => h.y))]
      .sort((a, b) => a - b);

    expect(ys).toHaveLength(DRILL.adjustSteps * 2 + 1);
    expect(ys[ys.length - 1] - ys[0]).toBe(DRILL.adjustSteps * 2 * DRILL.pitch);
  });

  it('puts the front row at its stated setback and the back row on the grid', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, PINS);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    const xs = [...new Set(side.holes.filter((h) => h.kind === 'system').map((h) => h.x))]
      .sort((a, b) => a - b);

    const front = side.w - DRILL.frontSetback;
    expect(xs).toEqual([rearRowX(side.w, 'grid'), front]);
    // The point of the grid setting: both rows are whole pitches apart.
    expect((front - xs[0]) % SYS32.pitch).toBe(0);
    // And nothing is closer to an edge than the front row is.
    expect(xs[0]).toBeGreaterThanOrEqual(SYS32.frontSetback);
  });

  it('mirrored puts the back row the same distance in from the back edge', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, { ...PINS, rearRow: 'mirror' });
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    const xs = [...new Set(side.holes.filter((h) => h.kind === 'system').map((h) => h.x))]
      .sort((a, b) => a - b);
    expect(xs).toEqual([SYS32.frontSetback, side.w - SYS32.frontSetback]);
  });
});

/* The template is for shelves. A drawer bank carries its load on the runners
   and a filler is a strip of board, so neither has anything to set out. */
describe('only what needs drilling is drilled', () => {
  it('a drawer bank has no shelf pins, but its confirmat carcass is still joined', () => {
    const panels = drillUnit(buildUnit('T1', 'base-3drawer', {}, PINS));
    const sides = panels.filter((p) => /-SIDE-[LR]$/.test(p.code));
    expect(sides).toHaveLength(2);
    for (const side of sides) {
      expect(side.holes.filter((h) => h.kind === 'system')).toHaveLength(0);
      expect(side.holes.filter((h) => h.kind === 'construction').length).toBeGreaterThan(0);
    }
  });

  /* The whole point of a pocket screw. Nothing is drilled in the side panel
     for the joint, so a drawer bank with no shelves and no doors has nothing
     to set out on its sides at all, and the schedule says so rather than
     drawing an empty rectangle. */
  it('a pocket built drawer bank has nothing to drill in its sides', () => {
    const panels = drillUnit(buildUnit('T1', 'base-3drawer', {}, POCKETS));
    expect(panels.filter((p) => /-SIDE-[LR]$/.test(p.code))).toHaveLength(0);
  });

  it('a filler produces nothing at all', () => {
    expect(drillUnit(buildUnit('T1', 'filler', {}, PROJECT))).toHaveLength(0);
  });

  it('a cabinet with shelves produces two drilled sides', () => {
    const panels = drillUnit(buildUnit('T1', 'base-2door', { shelves: 1 }, PINS));
    expect(panels.filter((p) => p.code.includes('SIDE'))).toHaveLength(2);
  });

  it('a drawer front is never drilled, because the handle is marked off the fitted drawer', () => {
    const u = buildUnit('T1', 'base-3drawer', {}, PROJECT);
    const front = u.parts.find((p) => p.code.includes('DRWR-F'));
    expect(drillPanel(u, front)).toBeNull();
  });
});

describe('hinges', () => {
  it('puts the cup at its stated setback from the hinge side', () => {
    const u = buildUnit('T1', 'base-2door', {}, PROJECT);
    const doors = u.parts.filter((p) => p.code.includes('DOOR'));

    const left = drillPanel(u, doors.find((d) => d.hinge === 'left'));
    const right = drillPanel(u, doors.find((d) => d.hinge === 'right'));

    for (const h of left.holes.filter((x) => x.kind === 'cup')) {
      expect(h.x).toBe(Math.round(DRILL.cupSetback));
    }
    for (const h of right.holes.filter((x) => x.kind === 'cup')) {
      expect(h.x).toBe(Math.round(right.w - DRILL.cupSetback));
    }
  });

  it('adds a third hinge on a tall door', () => {
    expect(hingePositions(700)).toHaveLength(2);
    expect(hingePositions(1000)).toHaveLength(3);
  });

  it('the drilled cup follows the typed boring distance', () => {
    const cfg = { ...PROJECT, hingeBoringDistance: 3 };
    const u = buildUnit('T1', 'base-2door', {}, cfg);
    const left = drillPanel(u, u.parts.find((p) => p.code.includes('DOOR') && p.hinge === 'left'));
    for (const h of left.holes.filter((x) => x.kind === 'cup')) expect(h.x).toBe(21);
  });

  it('a lower threshold puts another hinge on the same door', () => {
    const u = buildUnit('T1', 'base-2door', {}, { ...PROJECT, hinge2MaxHeight: 400 });
    const door = u.parts.find((p) => p.code.includes('DOOR'));
    const panel = drillPanel(u, door);
    expect(panel.holes.filter((x) => x.kind === 'cup')).toHaveLength(3);
  });

  it('sets the outer hinges the stated distance from the door ends', () => {
    const p = hingePositions(700);
    expect(p[0]).toBe(DRILL.cupFromEnd);
    expect(p[p.length - 1]).toBe(700 - DRILL.cupFromEnd);
  });
});

describe('every hole carries what you need to drill it', () => {
  it('a diameter, a depth and a kind', () => {
    for (const f of built) {
      for (const panel of drillUnit(buildUnit('T1', f.id, {}, PROJECT))) {
        for (const h of panel.holes) {
          expect(h.dia, `${panel.code}`).toBeGreaterThan(0);
          expect(h.depth, `${panel.code}`).toBeGreaterThanOrEqual(0);
          expect(['system', 'construction', 'cup', 'handle', 'plate', 'edge', 'pocket'])
            .toContain(h.kind);
        }
        expect(panel.notes.length, `${panel.code} notes`).toBeGreaterThan(0);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
   Both halves of every joint.

   The old schedule drilled the side panel and stopped. You could drill every
   panel it gave you and still have a bottom with nothing in its edges, and a
   kitchen full of doors with nothing to hang them on.
   --------------------------------------------------------------------------- */
describe('both halves of a carcass joint are drawn', () => {
  it('the bottom is drilled down its ends wherever the side is drilled through', () => {
    const u = buildUnit('T1', 'base-2door', {}, PINS);
    const panels = drillUnit(u);
    const side = panels.find((p) => p.code.endsWith('-SIDE-L'));
    const bottom = panels.find((p) => p.code.endsWith('-BOT'));
    expect(bottom).toBeDefined();

    const through = side.holes.filter((h) => h.kind === 'construction');
    const edge = bottom.holes.filter((h) => h.kind === 'edge');
    // Three joints per end, two ends.
    expect(edge).toHaveLength(6);
    expect(through.length).toBeGreaterThanOrEqual(edge.length / 2);
  });

  it('the two halves are the same distance from the front of the cabinet', () => {
    const u = buildUnit('T1', 'base-2door', {}, PINS);
    const panels = drillUnit(u);
    const side = panels.find((p) => p.code.endsWith('-SIDE-L'));
    const bottom = panels.find((p) => p.code.endsWith('-BOT'));

    /* The side is drawn from its back edge and the bottom from its front, so
       the check is the distance to the front on both. That is the whole
       reason each panel states its datum. */
    const fromFrontOnSide = [...new Set(side.holes.filter((h) => h.kind === 'construction')
      .map((h) => side.w - h.x))].sort((a, b) => a - b);
    const fromFrontOnBottom = [...new Set(bottom.holes.filter((h) => h.kind === 'edge')
      .map((h) => bottom.h - h.y))].sort((a, b) => a - b);

    expect(fromFrontOnBottom).toEqual(fromFrontOnSide);
  });

  it('a dowelled carcass drills a different hole from a screwed one', () => {
    const screwed = drillUnit(buildUnit('T1', 'base-2door', {}, PINS))
      .find((p) => p.code.endsWith('-BOT'));
    const dowelled = drillUnit(buildUnit('T1', 'base-2door', {}, { ...PINS, jointMethod: 'dowel-8' }))
      .find((p) => p.code.endsWith('-BOT'));

    expect(screwed.holes[0].dia).toBe(JOINTS['confirmat-7x50'].edgeDia);
    expect(dowelled.holes[0].dia).toBe(JOINTS['dowel-8'].edgeDia);
    expect(dowelled.holes[0].depth).toBe(JOINTS['dowel-8'].edgeDepth);
  });

  it('an unknown method falls back rather than drilling nothing', () => {
    expect(jointMethod('nonsense').id).toBe('pocket-screw');
  });

  it('no joint hole runs off the end of the panel it goes into', () => {
    for (const f of built) {
      for (const panel of drillUnit(buildUnit('T1', f.id, {}, PINS))) {
        for (const h of panel.holes.filter((x) => x.kind === 'edge')) {
          expect(h.y, panel.code).toBeGreaterThanOrEqual(0);
          expect(h.y, panel.code).toBeLessThanOrEqual(panel.h);
        }
      }
    }
  });

  it('joint positions are held off the corners of the panel', () => {
    for (const depth of [280, 320, 560, 600]) {
      const xs = jointXs(depth);
      expect(xs[0]).toBeGreaterThan(0);
      expect(xs[xs.length - 1]).toBeLessThan(depth);
    }
  });
});

describe('the side panel carries the other half of the hinge', () => {
  it('a door hinged left puts its plate holes on the left side', () => {
    const u = buildUnit('T1', 'base-2door', {}, PINS);
    const panels = drillUnit(u);
    for (const code of ['-SIDE-L', '-SIDE-R']) {
      const side = panels.find((p) => p.code.endsWith(code));
      expect(side.holes.filter((h) => h.kind === 'plate').length, code).toBeGreaterThan(0);
    }
  });

  it('plate holes sit on the front row, on the same grid as the shelf pins', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, PINS);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    for (const h of side.holes.filter((x) => x.kind === 'plate')) {
      expect(h.x).toBe(side.w - SYS32.frontSetback);
      expect((h.y - SYS32.firstHole) % SYS32.pitch).toBe(0);
    }
  });

  it('a drawer bank has no plate holes, because it has no doors', () => {
    const side = drillUnit(buildUnit('T1', 'base-3drawer', {}, PINS))
      .find((p) => p.code.endsWith('-SIDE-L'));
    expect(side.holes.filter((h) => h.kind === 'plate')).toHaveLength(0);
  });
});

describe('every panel says which way round it goes', () => {
  it('a side panel is named left or right and states its datum', () => {
    for (const f of built) {
      for (const panel of drillUnit(buildUnit('T1', f.id, {}, PINS))) {
        if (!/-SIDE-[LR]$/.test(panel.code)) continue;
        expect(['left', 'right']).toContain(panel.hand);
        const notes = panel.notes.join(' ');
        expect(notes, panel.code).toMatch(/LEFT|RIGHT/);
        expect(notes, panel.code).toMatch(/bottom left/);
      }
    }
  });
});


/* ---------------------------------------------------------------------------
   Pocket screws.

   The joint one person in a shed actually uses, and the one the schedule now
   defaults to. What matters is that the holes are in the panel that butts in,
   never in the panel it lands on, and that they are where a jig can drill
   them.
   --------------------------------------------------------------------------- */
describe('pocket screws', () => {
  it('drills the panel that butts in, and nothing in the side it lands on', () => {
    const panels = drillUnit(buildUnit('T1', 'base-2door', { shelves: 1 }, POCKETS));
    const bottom = panels.find((p) => p.code.endsWith('-BOT'));

    expect(bottom).toBeDefined();
    expect(bottom.holes.every((h) => h.kind === 'pocket')).toBe(true);
    for (const panel of panels) {
      expect(panel.holes.filter((h) => h.kind === 'construction'), panel.code).toHaveLength(0);
      expect(panel.holes.filter((h) => h.kind === 'edge'), panel.code).toHaveLength(0);
    }
  });

  it('sets the pocket back from the end by the angle, not by a guess', () => {
    const bottom = drillUnit(buildUnit('T1', 'base-2door', {}, POCKETS))
      .find((p) => p.code.endsWith('-BOT'));
    const off = Math.round(pocketFaceOffset(POCKETS.carcassThk));
    const xs = [...new Set(bottom.holes.map((h) => h.x))].sort((a, b) => a - b);

    expect(xs).toEqual([off, bottom.w - off]);
    // 16mm board at 15 degrees. Half of 16, divided by tan 15.
    expect(off).toBe(30);
  });

  it('puts the same number down each end, spread by the rule', () => {
    const bottom = drillUnit(buildUnit('T1', 'base-2door', {}, POCKETS))
      .find((p) => p.code.endsWith('-BOT'));
    const want = pocketPositions(bottom.h);

    for (const x of [...new Set(bottom.holes.map((h) => h.x))]) {
      const ys = bottom.holes.filter((h) => h.x === x).map((h) => h.y).sort((a, b) => a - b);
      expect(ys).toEqual(want);
    }
    expect(want.length).toBeGreaterThanOrEqual(2);
  });

  it('points every pocket at the edge its pilot comes out of', () => {
    const bottom = drillUnit(buildUnit('T1', 'base-2door', {}, POCKETS))
      .find((p) => p.code.endsWith('-BOT'));
    for (const h of bottom.holes) {
      expect(['left', 'right']).toContain(h.towards);
      expect(h.towards).toBe(h.x < bottom.w / 2 ? 'left' : 'right');
    }
  });

  it('names the screw on the panel, so it can be ordered off the drawing', () => {
    const bottom = drillUnit(buildUnit('T1', 'base-2door', {}, POCKETS))
      .find((p) => p.code.endsWith('-BOT'));
    expect(bottom.holes[0].screw).toMatch(/#8 x 32mm/);
    expect(bottom.notes.join(' ')).toMatch(/32mm/);
  });

  it('a fixed shelf carries its own holes and the sides carry none', () => {
    const panels = drillUnit(buildUnit('T1', 'base-2door', { shelves: 2 }, POCKETS));
    const shelves = panels.filter((p) => /-SHELF-\d+$/.test(p.code));

    expect(shelves).toHaveLength(2);
    for (const shelf of shelves) {
      expect(shelf.holes.length).toBeGreaterThanOrEqual(4);
      expect(shelf.holes.every((h) => h.kind === 'pocket')).toBe(true);
      expect(shelf.notes.join(' ')).toMatch(/UNDERSIDE/);
    }
    for (const panel of panels.filter((p) => /-SIDE-[LR]$/.test(p.code))) {
      expect(panel.holes.filter((h) => h.kind === 'system')).toHaveLength(0);
    }
  });

  it('a shelf on pins is not drilled at all', () => {
    const panels = drillUnit(buildUnit('T1', 'base-2door', { shelves: 2 }, PINS));
    expect(panels.filter((p) => /-SHELF-\d+$/.test(p.code))).toHaveLength(0);
  });

  it('drills the drawer box front and back, and the base it calls pocket screwed', () => {
    const panels = drillUnit(buildUnit('T1', 'base-3drawer', {}, POCKETS));
    expect(panels.some((p) => /-DRWR1-FRONT$/.test(p.code))).toBe(true);
    expect(panels.some((p) => /-DRWR1-BACK$/.test(p.code))).toBe(true);
    // The 6mm default base cannot take a 9.5mm pocket, and says nothing rather
    // than drawing a hole nobody can drill.
    expect(canPocket(POCKETS.boxBaseThk)).toBe(false);
    expect(panels.some((p) => /-DRWR1-BASE$/.test(p.code))).toBe(false);

    const thick = drillUnit(buildUnit('T1', 'base-3drawer', {}, { ...POCKETS, boxBaseThk: 16 }));
    expect(thick.some((p) => /-DRWR1-BASE$/.test(p.code))).toBe(true);
  });

  it('a butted base is never pocketed, because it goes under the sides', () => {
    const panels = drillUnit(buildUnit('T1', 'base-3drawer', {},
      { ...POCKETS, boxBaseThk: 16, boxBaseFix: 'butted' }));
    expect(panels.some((p) => /-DRWR1-BASE$/.test(p.code))).toBe(false);
  });

  it('every pocket sits inside the panel it is drilled in', () => {
    for (const f of built) {
      for (const panel of drillUnit(buildUnit('T1', f.id, {}, POCKETS))) {
        for (const h of panel.holes.filter((x) => x.kind === 'pocket')) {
          expect(h.x, panel.code).toBeGreaterThan(0);
          expect(h.x, panel.code).toBeLessThan(panel.w);
          expect(h.y, panel.code).toBeGreaterThanOrEqual(0);
          expect(h.y, panel.code).toBeLessThanOrEqual(panel.h);
        }
      }
    }
  });

  it('an unknown shelf fixing is the fixed one, not nothing', () => {
    expect(shelfFixOf('nonsense').id).toBe('pocket');
    expect(shelfFixOf('pins').id).toBe('pins');
  });

  it('the bore and the angle are the jig, not a drawing choice', () => {
    expect(POCKET.bore).toBe(9.5);
    expect(POCKET.angle).toBe(15);
  });
});
