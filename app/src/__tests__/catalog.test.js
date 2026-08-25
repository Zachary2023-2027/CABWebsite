import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY, PROJECT, buildUnit, sheetFor } from '../catalog.js';
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

/* Every front you open needs something to open it by. The old code only
   added handles in the plain doors branch, so a sink base and an oven tower
   went to the supplier without them: the example kitchen was three handles
   short and twenty seven dollars light. */
describe('every front that opens has a handle', () => {
  for (const f of built) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const opens = u.parts.filter((p) => p.group === 'front'
        && !p.code.includes('FALSE') && !p.code.includes('BLIND'));
      const handles = (u.fittings || []).filter((x) => x.type === 'handle').length;
      expect(handles).toBe(opens.length);
    });
  }
});

describe('every door has hinges', () => {
  for (const f of built) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const doors = u.parts.filter((p) => p.code.includes('DOOR'));
      const hinged = (u.fittings || []).filter((x) => x.type === 'hinge').length;
      expect(hinged).toBe(doors.length);
    });
  }
});

describe('buildUnit refuses a value that is not a millimetre', () => {
  it('throws rather than letting NaN into the part list', () => {
    expect(() => buildUnit('T1', 'base-2door', { width: NaN }, PROJECT)).toThrow(/width/);
    expect(() => buildUnit('T1', 'base-2door', { width: -600 }, PROJECT)).toThrow(/width/);
  });
});

/* ---------------------------------------------------------------------------
   Presets stated as a front stack.

   A preset is a carcass size and a list of rows. These check that the rows a
   preset declares are the rows that come out the other end, because a preset
   whose stack is quietly ignored looks fine on the picker and builds the
   wrong cabinet.
   --------------------------------------------------------------------------- */

const stacked = FAMILIES.filter((f) => f.fronts === 'stack');

describe('a preset that states its front as data gets that front', () => {
  it('there are presets defined this way', () => {
    expect(stacked.length).toBeGreaterThan(0);
  });

  for (const f of stacked) {
    it(`${f.id} resolves the rows it declares`, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const declared = f.stack(u.settings, u.height, u.cfg, u.cfg.reveal);

      expect(u.stack, `${f.id} has no resolved stack`).toBeTruthy();
      expect(u.stack.rows.map((r) => r.type)).toEqual(declared.map((r) => r.type));
      // Nothing in the stack is left over or hanging off the carcass.
      expect(u.stack.errors, u.stack.errors.join(' ')).toHaveLength(0);
      for (const row of u.stack.rows) {
        expect(row.y, `${f.id} row below the carcass`).toBeGreaterThanOrEqual(-0.05);
        expect(row.y + row.height, `${f.id} row above the carcass`)
          .toBeLessThanOrEqual(u.height + 0.05);
      }
    });
  }

  it('an appliance bay emits no part, because it is a hole', () => {
    const u = buildUnit('T1', 'wall-microwave', {}, PROJECT);
    const bay = u.stack.rows.find((r) => r.type === 'bay');
    expect(bay.height).toBe(380);
    // Nothing is cut at the bay height.
    const atBay = u.parts.filter((p) => p.group === 'front'
      && Math.abs(p.pos[1] - bay.y) < 1);
    expect(atBay).toHaveLength(0);
  });

  it('the fridge surround leaves the fridge its opening', () => {
    const u = buildUnit('T1', 'tall-fridge-surround', {}, PROJECT);
    const bay = u.stack.rows.find((r) => r.type === 'bay');
    expect(bay.appliance).toBe('fridge');
    expect(bay.height).toBe(1800);
    // The cupboard over it takes what is left, and both add up to the carcass.
    expect(u.stack.used + u.cfg.reveal).toBeCloseTo(u.height, 6);
  });
});

/* An end panel stands on edge at the end of a run. Building it through the
   filler path made a stick 18mm wide and 720 long, which is not a panel. */
describe('panels are panels, not fillers on their side', () => {
  it('an end panel is full height by full depth, and thin', () => {
    const u = buildUnit('T1', 'end-panel', {}, PROJECT);
    const p = u.parts[0];

    expect(u.width).toBe(18);                       // takes 18mm of the run
    expect(p.T).toBe(18);                           // and that is its thickness
    expect(p.L).toBe(PROJECT.benchHeight - PROJECT.benchThk);   // floor to benchtop
    expect(p.W).toBe(PROJECT.baseDepth);
    expect(u.mountY).toBe(0);                       // it stands on the floor
  });

  it('a bulkhead fills the gap from the wall cabinets to the ceiling', () => {
    const u = buildUnit('T1', 'bulkhead', {}, PROJECT);
    const gap = PROJECT.ceiling - (PROJECT.wallMount + PROJECT.wallCabHeight);

    expect(u.height).toBe(gap);
    expect(u.mountY).toBe(PROJECT.wallMount + PROJECT.wallCabHeight);
    expect(u.mountY + u.height).toBe(PROJECT.ceiling);
    expect(u.depth).toBe(PROJECT.wallDepth);
  });

  it('a bulkhead under a low ceiling does not go negative', () => {
    const u = buildUnit('T1', 'bulkhead', {}, { ...PROJECT, ceiling: 2000 });
    expect(u.height).toBeGreaterThan(0);
    for (const p of u.parts) expect(p.W).toBeGreaterThan(0);
  });

  it('a plain filler is untouched by any of this', () => {
    const u = buildUnit('T1', 'filler', { width: 40 }, PROJECT);
    expect(u.width).toBe(40);
    expect(u.parts[0].W).toBe(40);
    expect(u.mountY).toBe(PROJECT.kick);
  });
});

describe('an island is finished where it is seen', () => {
  it('its back is carcass board with an edged finish, not hardboard', () => {
    const island = buildUnit('T1', 'island', {}, PROJECT).parts.find((p) => p.code.endsWith('-BACK'));
    const wall = buildUnit('T1', 'base-2door', {}, PROJECT).parts.find((p) => p.code.endsWith('-BACK'));

    expect(island.material).toBe(`${PROJECT.carcassBoard} ${PROJECT.carcassThk}mm`);
    expect(island.T).toBe(PROJECT.carcassThk);
    expect(island.edging).toBe('All four edges');

    // The ordinary cabinet is unchanged.
    expect(wall.T).toBe(PROJECT.backThk);
    expect(wall.material).toBe(`${PROJECT.backBoard} ${PROJECT.backThk}mm`);
  });
});

describe('a retired preset is kept but not offered', () => {
  it('names what replaces it, and that replacement exists', () => {
    const retired = FAMILIES.filter((f) => f.retired);
    expect(retired.length).toBeGreaterThan(0);
    for (const f of retired) {
      expect(FAMILY[f.replacedBy], `${f.id} points at nothing`).toBeTruthy();
      expect(FAMILY[f.replacedBy].retired).toBeFalsy();
    }
  });

  it('still builds, so a saved project that has one still opens', () => {
    const u = buildUnit('T1', 'base-corner', {}, PROJECT);
    expect(u.parts.length).toBeGreaterThan(0);
  });
});

/* The drawer base is cut to the inside of the box whichever way it is fixed.
   A screwed base is pocket screwed into the sides, so it is NOT the box
   footprint hung underneath them: that cuts it 2 x the side thickness too big
   in both directions and stands the box proud of its runner. */
describe('the drawer base is fixed inside the box', () => {
  const drawerFamily = FAMILIES.find((f) => !f.cavity
    && buildUnit('T1', f.id, {}, PROJECT).parts.some((p) => /DRWR\d+-BASE$/.test(p.code)));

  const baseAndSides = (cfg) => {
    const u = buildUnit('T1', drawerFamily.id, {}, cfg);
    return {
      base: u.parts.find((p) => /DRWR\d+-BASE$/.test(p.code)),
      side: u.parts.find((p) => /DRWR\d+-SIDE-L$/.test(p.code)),
      front: u.parts.find((p) => /DRWR\d+-FRONT$/.test(p.code)),
    };
  };

  it('a family with drawers exists to test', () => {
    expect(drawerFamily).toBeTruthy();
  });

  for (const fix of ['dado', 'screwed']) {
    it(`${fix}: the base is cut to the inside of the box`, () => {
      const { base, side, front } = baseAndSides({ ...PROJECT, boxBaseFix: fix });
      // As wide as the box is inside, which is what the front and back are.
      expect(base.L).toBe(front.L);
      // As long as the runner less the front and the back.
      expect(base.W).toBe(side.L - 2 * PROJECT.boxSideThk);
    });

    it(`${fix}: the base sits between the sides, not outside them`, () => {
      const { base, side } = baseAndSides({ ...PROJECT, boxBaseFix: fix });
      expect(base.pos[0]).toBeGreaterThan(side.pos[0]);
      expect(base.pos[0] + base.size[0])
        .toBeLessThanOrEqual(side.pos[0] + PROJECT.boxSideThk + base.L + 0.001);
    });
  }

  it('a screwed base sits flush with the bottom of the sides', () => {
    const { base, side } = baseAndSides({ ...PROJECT, boxBaseFix: 'screwed' });
    expect(base.pos[1]).toBe(side.pos[1]);
  });

  it('a dado base sits up the side by the groove height', () => {
    const { base, side } = baseAndSides({ ...PROJECT, boxBaseFix: 'dado' });
    expect(base.pos[1]).toBe(side.pos[1] + PROJECT.baseGroove);
  });

  it('a screwed base never hangs below the sides', () => {
    const { base, side } = baseAndSides({ ...PROJECT, boxBaseFix: 'screwed' });
    expect(base.pos[1]).toBeGreaterThanOrEqual(side.pos[1]);
  });
});
