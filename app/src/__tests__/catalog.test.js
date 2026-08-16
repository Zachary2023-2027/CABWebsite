import { describe, expect, it } from 'vitest';
import { FAMILIES, PROJECT, buildUnit, sheetFor } from '../catalog.js';
import { fmt } from '../mm.js';

const real = FAMILIES.filter((f) => !f.cavity && f.kind !== 'filler');
const built = FAMILIES.filter((f) => !f.cavity);

/* Three widths per preset: the narrowest it offers, the widest, and one in
   between that is deliberately not a round number, because a kitchen wall is
   never a multiple of 50 and the awkward width is where the arithmetic breaks. */
const widthsFor = (f) => {
  const list = [...f.widths].sort((a, b) => a - b);
  const mid = Math.round((list[0] + list[list.length - 1]) / 2) + 13;
  return [list[0], mid, list[list.length - 1]];
};

describe('every part is a usable rectangle', () => {
  for (const f of built) {
    for (const width of widthsFor(f)) {
      it(`${f.id} at ${width}mm`, () => {
        const u = buildUnit('T1', f.id, { width }, PROJECT);

        for (const p of u.parts) {
          expect(p.L, `${p.code} length`).toBeGreaterThan(0);
          expect(p.W, `${p.code} width`).toBeGreaterThan(0);
          expect(p.T, `${p.code} thickness`).toBeGreaterThan(0);
          expect(Number.isFinite(p.L * p.W * p.T), `${p.code} is a real size`).toBe(true);
          expect(String(p.material || '').length, `${p.code} material`).toBeGreaterThan(0);
          expect(p.size.every(Number.isFinite), `${p.code} 3D size`).toBe(true);
          expect(p.pos.every(Number.isFinite), `${p.code} 3D position`).toBe(true);
        }
      });
    }
  }
});

describe('part codes are unique within a cabinet', () => {
  for (const f of built) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const codes = u.parts.map((p) => p.code);
      expect(new Set(codes).size, `duplicate in ${codes.join(', ')}`).toBe(codes.length);
    });
  }
});

/* The width reconstruction. Two sides plus whatever sits between them is the
   outside of the cabinet. If this drifts, the carcass does not close up and
   every downstream number is describing a cabinet that cannot be built. */
describe('the carcass reconstructs its stated width', () => {
  for (const f of real) {
    for (const width of widthsFor(f)) {
      it(`${f.id} at ${width}mm`, () => {
        const u = buildUnit('T1', f.id, { width }, PROJECT);
        const sides = u.parts.filter((p) => p.group === 'carcass' && /-SIDE-[LR]$/.test(p.code));
        const bottom = u.parts.find((p) => p.code.endsWith('-BOT'));

        expect(sides).toHaveLength(2);
        expect(bottom).toBeDefined();
        expect(sides[0].T + bottom.L + sides[1].T).toBeCloseTo(u.width, 1);
      });
    }
  }
});

describe('the carcass reconstructs its stated height and depth', () => {
  for (const f of real) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const side = u.parts.find((p) => p.code.endsWith('-SIDE-L'));

      // A side panel is the full height and the full depth of the carcass.
      expect(side.L).toBeCloseTo(u.height, 1);
      expect(side.W).toBeCloseTo(u.depth, 1);
    });
  }
});

/* Fronts are laid out in rows. Doors sitting beside each other share a row,
   and the widths across a row plus the reveals between them fill the carcass
   less a half reveal each side. */
describe('front rows fill the carcass width', () => {
  for (const f of real) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const fronts = u.parts.filter((p) => p.group === 'front');
      if (!fronts.length) return;

      const R = u.cfg.reveal;
      const rows = new Map();
      for (const p of fronts) {
        const y = Math.round(p.pos[1]);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(p);
      }

      for (const [y, row] of rows) {
        // size[0] is the width of a front whichever way round L and W are.
        const across = row.reduce((a, p) => a + p.size[0], 0) + (row.length - 1) * R;
        expect(across, `row at ${y}`).toBeCloseTo(u.width - R, 0);
      }
    });
  }
});

describe('rounding happens once, at the part', () => {
  it('an awkward typed thickness produces no float noise anywhere', () => {
    const cfg = { ...PROJECT, carcassThk: 18.2, frontThk: 17.3, reveal: 2.5 };

    for (const f of built) {
      const u = buildUnit('T1', f.id, {}, cfg);
      for (const p of u.parts) {
        for (const key of ['L', 'W', 'T']) {
          const decimals = String(p[key]).split('.')[1];
          expect(decimals === undefined || decimals.length === 1,
            `${p.code} ${key} is ${p[key]}`).toBe(true);
        }
      }
    }
  });

  it('nothing rendered from a part reads as a float or an exponent', () => {
    const cfg = { ...PROJECT, carcassThk: 18.2, frontThk: 17.3 };
    for (const f of built) {
      for (const p of buildUnit('T1', f.id, {}, cfg).parts) {
        for (const key of ['L', 'W', 'T']) {
          const s = fmt(p[key]);
          expect(s, `${p.code} ${key}`).not.toMatch(/e/i);
          expect(s, `${p.code} ${key}`).not.toMatch(/\.\d\d/);
        }
      }
    }
  });
});

describe('every part can be bought', () => {
  it('every material at default settings resolves to a sheet', () => {
    for (const f of built) {
      for (const p of buildUnit('T1', f.id, {}, PROJECT).parts) {
        expect(sheetFor(p.material), `${p.code} is ${p.material}`).toBeTruthy();
      }
    }
  });
});

describe('buildUnit refuses a value that is not a millimetre', () => {
  it('throws rather than letting NaN into the part list', () => {
    expect(() => buildUnit('T1', 'base-2door', { width: NaN }, PROJECT)).toThrow(/width/);
    expect(() => buildUnit('T1', 'base-2door', { width: -600 }, PROJECT)).toThrow(/width/);
  });
});
