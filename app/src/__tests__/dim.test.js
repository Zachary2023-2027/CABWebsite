import { describe, expect, it } from 'vitest';
import {
  DIM, MIN_INWARD, chainStops, dimLines, levelOff, mmLabel, vLen, vSub,
} from '../dim.js';
import { FAMILIES, PROJECT, buildUnit, drawerSetout } from '../catalog.js';

const A = [0, 0, 0];
const B = [0, 500, 0];
const LEFT = [-1, 0, 0];

describe('a dimension is drawn the way a drawing draws one', () => {
  const g = dimLines(A, B, LEFT, 90);

  it('measures the span it was given', () => {
    expect(g.span).toBeCloseTo(500, 6);
  });

  it('stands its witness lines off the feature, not on it', () => {
    for (const [start] of g.witness) {
      // The near end of each witness is the gap away from the object, so the
      // dimension never touches the edge it is measuring.
      expect(vLen(vSub(start, A)) === 0).toBe(false);
    }
    expect(g.witness[0][0][0]).toBeCloseTo(-DIM.gap, 6);
    expect(g.witness[1][0][0]).toBeCloseTo(-DIM.gap, 6);
  });

  it('runs its witness lines past the dimension line', () => {
    // Far end is further out than the dimension line itself.
    expect(Math.abs(g.witness[0][1][0])).toBeGreaterThan(Math.abs(g.line[0][0]));
    expect(Math.abs(g.witness[0][1][0])).toBeCloseTo(90 + DIM.past, 6);
  });

  it('puts the dimension line the asked-for distance out', () => {
    expect(g.line[0][0]).toBeCloseTo(-90, 6);
    expect(g.line[1][0]).toBeCloseTo(-90, 6);
  });

  it('terminates both ends', () => {
    // Two barbs per terminator, two terminators.
    expect(g.arrows).toHaveLength(4);
  });

  it('centres the text on its own dimension line', () => {
    expect(g.mid[1]).toBeCloseTo(250, 6);
    expect(g.mid[0]).toBeCloseTo(-90, 6);
  });

  it('has nothing to draw for a zero span', () => {
    expect(dimLines(A, A, LEFT, 90)).toBeNull();
    expect(dimLines(A, [0, 0.2, 0], LEFT, 90)).toBeNull();
  });
});

describe('a span too short for inward terminators turns them outwards', () => {
  it('points them in when there is room', () => {
    expect(dimLines(A, [0, MIN_INWARD + 10, 0], LEFT, 90).inward).toBe(true);
  });

  it('points them out when there is not', () => {
    const tight = dimLines(A, [0, MIN_INWARD - 10, 0], LEFT, 90);
    expect(tight.inward).toBe(false);
  });

  it('extends the dimension line past a tight span, to carry them', () => {
    const tight = dimLines(A, [0, 20, 0], LEFT, 90);
    expect(vLen(vSub(tight.line[1], tight.line[0]))).toBeGreaterThan(20);
  });

  it('keeps the line exactly on the span when they point in', () => {
    const roomy = dimLines(A, B, LEFT, 90);
    expect(vLen(vSub(roomy.line[1], roomy.line[0]))).toBeCloseTo(500, 6);
  });
});

describe('parallel dimensions step out, detail inside the overall', () => {
  it('the first level sits on the base offset', () => {
    expect(levelOff(0)).toBe(DIM.base);
  });

  it('each level clears the one inside it by the step', () => {
    expect(levelOff(1) - levelOff(0)).toBe(DIM.step);
    expect(levelOff(2) - levelOff(1)).toBe(DIM.step);
  });

  it('a step clears the witness lines of the level inside it', () => {
    // Otherwise a chain would be drawn through the annotation next to it.
    expect(DIM.step).toBeGreaterThan(DIM.past);
  });
});

describe('a chain adds up to the whole it breaks down', () => {
  it('closes on the overall, whatever is inside it', () => {
    const at = chainStops(0, 720, [100, 250, 610]);
    expect(at[0]).toBe(0);
    expect(at[at.length - 1]).toBe(720);
    const links = at.slice(0, -1).map((v, i) => at[i + 1] - v);
    expect(links.reduce((a, b) => a + b, 0)).toBeCloseTo(720, 6);
  });

  it('reads in order, whatever order it was given in', () => {
    expect(chainStops(0, 100, [70, 20, 45])).toEqual([0, 20, 45, 70, 100]);
  });

  it('never makes a zero length link', () => {
    const at = chainStops(0, 100, [0, 100, 50, 50]);
    for (let i = 1; i < at.length; i += 1) expect(at[i] - at[i - 1]).toBeGreaterThan(0);
  });

  it('drops edges that are not inside the whole', () => {
    expect(chainStops(0, 100, [-30, 130, 50])).toEqual([0, 50, 100]);
  });

  it('survives its ends being handed over backwards', () => {
    expect(chainStops(720, 0, [250])).toEqual([0, 250, 720]);
  });

  it('is just the overall when nothing is inside it', () => {
    expect(chainStops(0, 600, [])).toEqual([0, 600]);
  });
});

describe('the number written on a drawing', () => {
  it('is whole millimetres', () => {
    expect(mmLabel(719.9999)).toBe('720');
    expect(mmLabel(6)).toBe('6');
  });
});

/* The chain the cabinet drawing actually builds, on real cabinets: the drawer
   setout up the left and across the bottom. If these do not close, the
   drawing is telling someone a drawer sits somewhere it does not. */
describe('the drawer setout chain, on real cabinets', () => {
  const withDrawers = FAMILIES.filter((f) => !f.cavity
    && drawerSetout(buildUnit('T1', f.id, {}, PROJECT)).length > 0);

  it('there are drawer cabinets to draw', () => {
    expect(withDrawers.length).toBeGreaterThan(0);
  });

  for (const fix of ['dado', 'screwed', 'butted']) {
    it(`${fix}: the chain up the cabinet closes on its height`, () => {
      for (const f of withDrawers) {
        const u = buildUnit('T1', f.id, {}, { ...PROJECT, boxBaseFix: fix });
        const [, H] = u.size;
        const setout = drawerSetout(u);
        const up = chainStops(0, H, setout.flatMap((d) => [d.bottom, d.top]));
        expect(up[0], f.id).toBe(0);
        expect(up[up.length - 1], f.id).toBe(H);
        const links = up.slice(0, -1).map((v, i) => up[i + 1] - v);
        expect(links.reduce((a, b) => a + b, 0), f.id).toBeCloseTo(H, 6);
        // Every drawer contributes a real link, so none is drawn as nothing.
        expect(up.length, f.id).toBeGreaterThanOrEqual(2 + setout.length);
      }
    });

    it(`${fix}: the chain across the cabinet closes on its width`, () => {
      for (const f of withDrawers) {
        const u = buildUnit('T1', f.id, {}, { ...PROJECT, boxBaseFix: fix });
        const [W] = u.size;
        const d = drawerSetout(u)[0];
        const across = chainStops(0, W, [d.left, d.right]);
        expect(across, f.id).toEqual([0, d.left, d.right, W]);
        expect(across[3] - across[0], f.id).toBeCloseTo(W, 6);
      }
    });
  }

  it('every link of a real chain has a dimension that can be drawn', () => {
    const u = buildUnit('T1', withDrawers[0].id, {}, PROJECT);
    const [, H, D] = u.size;
    const up = chainStops(0, H, drawerSetout(u).flatMap((d) => [d.bottom, d.top]));
    for (let i = 1; i < up.length; i += 1) {
      const g = dimLines([0, up[i - 1], D / 2], [0, up[i], D / 2], [-1, 0, 0], levelOff(0));
      expect(g, `${up[i - 1]} to ${up[i]}`).not.toBeNull();
      expect(g.arrows).toHaveLength(4);
    }
  });
});
