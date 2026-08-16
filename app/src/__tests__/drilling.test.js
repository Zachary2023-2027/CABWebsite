import { describe, expect, it } from 'vitest';
import { DRILL, drillPanel, drillUnit, hingePositions } from '../drilling.js';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';

const built = FAMILIES.filter((f) => !f.cavity);

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
    const u = buildUnit('T1', 'tall-pantry', {}, PROJECT);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));

    const system = side.holes.filter((h) => h.kind === 'system');
    expect(system.length).toBeGreaterThan(0);

    for (const h of system) {
      const steps = (h.y - DRILL.firstHole) / DRILL.pitch;
      expect(Number.isInteger(steps), `hole at ${h.y}`).toBe(true);
    }
  });

  it('drills two positions either side of each shelf, so it moves 64mm', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, PROJECT);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    const ys = [...new Set(side.holes.filter((h) => h.kind === 'system').map((h) => h.y))]
      .sort((a, b) => a - b);

    expect(ys).toHaveLength(DRILL.adjustSteps * 2 + 1);
    expect(ys[ys.length - 1] - ys[0]).toBe(DRILL.adjustSteps * 2 * DRILL.pitch);
  });

  it('puts the front and back rows at their stated setbacks', () => {
    const u = buildUnit('T1', 'base-2door', { shelves: 1 }, PROJECT);
    const side = drillUnit(u).find((p) => p.code.endsWith('-SIDE-L'));
    const xs = [...new Set(side.holes.filter((h) => h.kind === 'system').map((h) => h.x))]
      .sort((a, b) => a - b);

    expect(xs).toEqual([DRILL.backSetback, side.w - DRILL.frontSetback]);
  });
});

/* The template is for shelves. A drawer bank carries its load on the runners
   and a filler is a strip of board, so neither has anything to set out. */
describe('only what needs drilling is drilled', () => {
  it('a drawer bank produces no drilled side panels', () => {
    const panels = drillUnit(buildUnit('T1', 'base-3drawer', {}, PROJECT));
    expect(panels.filter((p) => p.code.includes('SIDE'))).toHaveLength(0);
  });

  it('a filler produces nothing at all', () => {
    expect(drillUnit(buildUnit('T1', 'filler', {}, PROJECT))).toHaveLength(0);
  });

  it('a cabinet with shelves produces two drilled sides', () => {
    const panels = drillUnit(buildUnit('T1', 'base-2door', { shelves: 1 }, PROJECT));
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
          expect(['system', 'construction', 'cup', 'handle']).toContain(h.kind);
        }
        expect(panel.notes.length, `${panel.code} notes`).toBeGreaterThan(0);
      }
    }
  });
});
