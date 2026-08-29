/* ===========================================================================
   Measurements.

   The numbers are the product. A drawing that looks right and a cut list that
   is 3mm out is worse than no drawing, because you find out at the saw.

   The suite already proves a lot of this one screen at a time: the carcass
   reconstructs its width, front rows fill it, holes land on the 32mm grid,
   every part is placed on a sheet. What it did not prove is the arithmetic
   that runs across those screens, which is where a measurement error hides:
   a front stack that fills the width but overruns the height, a drawer box
   wider than the hole it slides into, a shelf deeper than the carcass, a
   runner longer than the cabinet.

   Everything below is checked against every preset at three widths, because
   a kitchen wall is never a multiple of 50 and the awkward width is where
   arithmetic breaks.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';
import { layoutWall, totals } from '../project.js';
import { benchSegments } from '../fixtures.js';
import { longestFitting, runnerProfile } from '../hardware.js';

const built = FAMILIES.filter((f) => !f.cavity);
const withFronts = built.filter((f) => f.fronts && f.fronts !== 'none' && f.kind !== 'filler');

/** The narrowest, the widest, and an awkward one in between. */
const widthsFor = (f) => {
  const list = [...f.widths].sort((a, b) => a - b);
  const mid = Math.round((list[0] + list[list.length - 1]) / 2) + 13;
  return [...new Set([list[0], mid, list[list.length - 1]])];
};

/** Every preset at every one of its three widths. */
const everyUnit = (fams = built) => fams.flatMap(
  (f) => widthsFor(f).map((width) => ({
    f, width, u: buildUnit('T1', f.id, { width }, PROJECT),
  })),
);

const fronts = (u) => u.parts.filter((p) => p.group === 'front');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------------------------------------------------------------------------
   The front stack fills the opening it is in, both ways.
   --------------------------------------------------------------------------- */

describe('the front stack tiles the opening it is given', () => {
  for (const { f, width, u } of everyUnit(withFronts)) {
    if (!u.stack) continue;

    it(`${f.id} at ${width}mm`, () => {
      const { rows, available, used, opening } = u.stack;

      /* Every row is accounted for. A row can be a door, a drawer, or a
         deliberate hole: the open bay a microwave or a fridge sits in. A hole
         is still a measurement and still has to be paid for out of the same
         budget, which is what makes this the honest check. */
      expect(near(used, available, 0.51), `used ${used} of ${available}`).toBe(true);
      expect(available, 'the budget is the opening less its reveal')
        .toBeLessThanOrEqual(opening);

      /* The budget is the opening with the gaps between the rows already
         taken out of it, so the row heights alone have to add up to it. */
      const sum = rows.reduce((n, r) => n + r.height, 0);
      const gaps = (rows.length - 1) * PROJECT.reveal;
      expect(near(available, opening - gaps, 0.51),
        `budget ${available} against opening ${opening} less ${gaps} of gap`).toBe(true);
      expect(near(sum, available, 1.01),
        `rows total ${sum} against a budget of ${available}`).toBe(true);

      /* The rows run bottom to top with a reveal between them and nothing
         overlapping. */
      const byY = [...rows].sort((a, b) => a.y - b.y);
      for (let i = 1; i < byY.length; i++) {
        const gap = byY[i].y - byY[i - 1].top;
        expect(gap, `row ${i} overlaps the one below it`).toBeGreaterThanOrEqual(-0.01);
        expect(near(gap, PROJECT.reveal, 1.01), `gap above row ${i - 1} is ${gap}`).toBe(true);
      }
      expect(byY.at(-1).top, 'the stack runs past the top of the carcass')
        .toBeLessThanOrEqual(u.height + 0.51);
    });
  }
});

describe('every front sits inside a row of its own stack', () => {
  for (const { f, width, u } of everyUnit(withFronts)) {
    if (!u.stack) continue;

    it(`${f.id} at ${width}mm`, () => {
      /* The blind panel of a corner cabinet belongs to no row: it stands
         beside the whole stack, full height, covering the dead width the
         return run is in front of. Every other front is in exactly one row. */
      for (const p of fronts(u)) {
        if (p.code.endsWith('-BLIND')) {
          expect(p.size[1], `${p.code} is not the full height`).toBeCloseTo(u.height, 1);
          continue;
        }
        const row = u.stack.rows.find(
          (r) => p.pos[1] >= r.y - 0.51 && p.pos[1] + p.size[1] <= r.top + 0.51);
        expect(row, `${p.code} at ${p.pos[1]}..${p.pos[1] + p.size[1]} is in no row`).toBeTruthy();
      }
      expect(fronts(u).every((p) => p.pos[1] + p.size[1] <= u.height + 0.51),
        'a front runs off the top of the carcass').toBe(true);
      expect(fronts(u).every((p) => p.pos[1] >= -0.51),
        'a front hangs below the carcass').toBe(true);
    });
  }
});

describe('no two fronts in the same column overlap', () => {
  for (const { f, width, u } of everyUnit(withFronts)) {
    it(`${f.id} at ${width}mm`, () => {
      const fs = fronts(u);
      for (let i = 0; i < fs.length; i++) {
        for (let j = i + 1; j < fs.length; j++) {
          const a = fs[i];
          const b = fs[j];
          const apartX = a.pos[0] + a.size[0] <= b.pos[0] + 0.01
            || b.pos[0] + b.size[0] <= a.pos[0] + 0.01;
          const apartY = a.pos[1] + a.size[1] <= b.pos[1] + 0.01
            || b.pos[1] + b.size[1] <= a.pos[1] + 0.01;
          expect(apartX || apartY, `${a.code} overlaps ${b.code}`).toBe(true);
        }
      }
    });
  }
});

/* ---------------------------------------------------------------------------
   Nothing is bigger than the cabinet it is in.
   --------------------------------------------------------------------------- */

describe('every part fits inside the cabinet it belongs to', () => {
  for (const { f, width, u } of everyUnit()) {
    it(`${f.id} at ${width}mm`, () => {
      const [W, H, D] = u.size;
      for (const p of u.parts) {
        /* A front stands proud of the carcass by its own thickness, and an
           end panel and a bulkhead are deliberately outside it. Everything
           else lives inside the box. */
        if (p.group === 'front' || p.group === 'filler') continue;

        expect(p.pos[0], `${p.code} starts left of the cabinet`).toBeGreaterThanOrEqual(-0.5);
        expect(p.pos[1], `${p.code} starts below the cabinet`).toBeGreaterThanOrEqual(-0.5);
        expect(p.pos[0] + p.size[0], `${p.code} runs past the right side`)
          .toBeLessThanOrEqual(W + 0.5);
        expect(p.pos[1] + p.size[1], `${p.code} runs past the top`)
          .toBeLessThanOrEqual(H + 0.5);
        expect(p.pos[2] + p.size[2], `${p.code} runs past the front`)
          .toBeLessThanOrEqual(D + 0.5);
      }
    });
  }
});

/* ---------------------------------------------------------------------------
   The drawer box and the hole it slides into.
   --------------------------------------------------------------------------- */

describe('a drawer box fits the cabinet it slides into', () => {
  const drawerFams = built.filter((f) => f.fronts === 'drawers' || f.fronts === 'microwave');

  for (const { f, width, u } of everyUnit(drawerFams)) {
    const sides = u.parts.filter((p) => p.group === 'box' && /SIDE-[LR]$/.test(p.code));
    if (!sides.length) continue;

    it(`${f.id} at ${width}mm`, () => {
      const T = PROJECT.carcassThk;
      const internalW = u.width - 2 * T;

      for (const s of sides) {
        expect(s.pos[0], `${s.code} starts inside the left carcass side`)
          .toBeGreaterThanOrEqual(T - 0.5);
        expect(s.pos[0] + s.size[0], `${s.code} ends inside the right carcass side`)
          .toBeLessThanOrEqual(u.width - T + 0.5);
      }

      /* The runner is a real length you can buy, and it has to fit the
         carcass with the setback taken off the front of it. */
      const profile = runnerProfile(PROJECT.runnerProfile, PROJECT.customRunner);
      const maxRunner = longestFitting(
        u.depth - PROJECT.boxSetback, profile, PROJECT.runnerDepthAllowance,
      );
      const boxDepth = Math.max(...sides.map((s) => s.size[2]));
      expect(boxDepth, 'the drawer box is no longer than the runner it sits on')
        .toBeLessThanOrEqual(maxRunner + 0.5);
      expect(boxDepth + PROJECT.boxSetback, 'the drawer box fits the carcass depth')
        .toBeLessThanOrEqual(u.depth + 0.5);
    });
  }
});

describe('a drawer box is shorter than the front that hides it', () => {
  const drawerFams = built.filter((f) => f.fronts === 'drawers');

  for (const { f, width, u } of everyUnit(drawerFams)) {
    it(`${f.id} at ${width}mm`, () => {
      const boxSides = u.parts.filter((p) => p.group === 'box' && /SIDE-L$/.test(p.code));
      for (const s of boxSides) {
        const front = u.parts.find((p) => p.group === 'front' && p.drawer === s.drawer);
        expect(front, `drawer ${s.drawer} has a front`).toBeTruthy();
        expect(s.size[1], `drawer ${s.drawer} box is taller than its front`)
          .toBeLessThanOrEqual(front.size[1] + 0.5);
      }
    });
  }
});

/* ---------------------------------------------------------------------------
   Shelves.
   --------------------------------------------------------------------------- */

describe('a shelf fits the carcass it sits in', () => {
  for (const { f, width, u } of everyUnit()) {
    const shelves = u.parts.filter((p) => p.group === 'shelf');
    if (!shelves.length) continue;

    it(`${f.id} at ${width}mm`, () => {
      const T = PROJECT.carcassThk;
      const internalW = u.width - 2 * T;

      for (const s of shelves) {
        expect(s.size[0], `${s.code} is wider than the opening`)
          .toBeLessThanOrEqual(internalW + 0.01);
        /* Set back from the front so a door closes on it, and clear of the
           back so it does not foul the panel. */
        expect(s.size[2], `${s.code} is deeper than the carcass allows`)
          .toBeLessThanOrEqual(u.depth - PROJECT.shelfSetback + 0.5);
        expect(s.pos[1], `${s.code} sits above the cabinet floor`).toBeGreaterThan(0);
        expect(s.pos[1] + s.size[1], `${s.code} sits below the cabinet top`)
          .toBeLessThan(u.height);
      }
    });
  }
});

/* ---------------------------------------------------------------------------
   The carcass itself.
   --------------------------------------------------------------------------- */

describe('the carcass parts are the sizes the carcass implies', () => {
  for (const { f, width, u } of everyUnit()) {
    it(`${f.id} at ${width}mm`, () => {
      const T = PROJECT.carcassThk;
      const byCode = (suffix) => u.parts.find((p) => p.code.endsWith(suffix));

      const left = byCode('SIDE-L');
      if (left) {
        expect(near(left.L, u.height, 0.51), `left side is ${left.L}, carcass is ${u.height}`)
          .toBe(true);
        expect(left.W, 'left side is no deeper than the carcass')
          .toBeLessThanOrEqual(u.depth + 0.01);
      }

      /* A part that spans between the two sides is the cabinet width less
         both of them. This is the single most load bearing sum in the app:
         get it wrong and every cut is wrong by the same amount. */
      for (const suffix of ['BOT', 'TOP', 'RAIL-TB', 'RAIL-TF']) {
        const p = byCode(suffix);
        if (!p) continue;
        expect(near(p.L, u.width - 2 * T, 0.51),
          `${p.code} is ${p.L}, between the sides is ${u.width - 2 * T}`).toBe(true);
      }
    });
  }
});

describe('the height chain adds up', () => {
  it('a base carcass is the benchtop height less the kick and the slab', () => {
    const u = buildUnit('T1', 'base-2door', {}, PROJECT);
    expect(u.height).toBe(PROJECT.benchHeight - PROJECT.benchThk - PROJECT.kick);
    expect(u.mountY).toBe(PROJECT.kick);
    expect(u.mountY + u.height + PROJECT.benchThk).toBe(PROJECT.benchHeight);
  });

  it('a wall cabinet hangs at the height it is told to', () => {
    const u = buildUnit('T1', 'wall-2door', {}, PROJECT);
    expect(u.mountY).toBe(PROJECT.wallMount);
    expect(u.height).toBe(PROJECT.wallCabHeight);
  });

  it('a tall cabinet stands on the same kick as the base run', () => {
    const u = buildUnit('T1', 'tall-pantry', {}, PROJECT);
    expect(u.mountY).toBe(PROJECT.kick);
    expect(u.height).toBe(PROJECT.tallHeight);
  });

  it('nothing in a straight run reaches the ceiling', () => {
    for (const { f, u } of everyUnit()) {
      expect(u.mountY + u.height, `${f.id} is taller than the ceiling`)
        .toBeLessThanOrEqual(PROJECT.ceiling);
    }
  });
});

/* ---------------------------------------------------------------------------
   The reveal, which is the gap you actually see.
   --------------------------------------------------------------------------- */

describe('the gap between fronts is the gap you set', () => {
  it('two doors on one cabinet are one full reveal apart', () => {
    const u = buildUnit('T1', 'base-2door', { width: 800 }, PROJECT);
    const doors = fronts(u).filter((p) => p.code.includes('DOOR')).sort(
      (a, b) => a.pos[0] - b.pos[0]);
    expect(doors.length).toBe(2);
    const gap = doors[1].pos[0] - (doors[0].pos[0] + doors[0].size[0]);
    expect(near(gap, PROJECT.reveal, 0.01), `gap is ${gap}`).toBe(true);
  });

  it('a front stops half a reveal short of each side, so two cabinets make one gap', () => {
    const u = buildUnit('T1', 'base-2door', { width: 800 }, PROJECT);
    const doors = fronts(u).sort((a, b) => a.pos[0] - b.pos[0]);
    const left = doors[0].pos[0];
    const right = u.width - (doors.at(-1).pos[0] + doors.at(-1).size[0]);
    expect(near(left, PROJECT.reveal / 2, 0.01), `left margin is ${left}`).toBe(true);
    expect(near(right, PROJECT.reveal / 2, 0.01), `right margin is ${right}`).toBe(true);
  });

  it('stacked drawers are one full reveal apart', () => {
    const u = buildUnit('T1', 'base-3drawer', { width: 600 }, PROJECT);
    const ds = fronts(u).sort((a, b) => a.pos[1] - b.pos[1]);
    for (let i = 1; i < ds.length; i++) {
      const gap = ds[i].pos[1] - (ds[i - 1].pos[1] + ds[i - 1].size[1]);
      expect(near(gap, PROJECT.reveal, 0.01), `gap ${i} is ${gap}`).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------------------
   The cut list is the part list.
   --------------------------------------------------------------------------- */

describe('a part is cut to the size it is drawn at', () => {
  for (const { f, width, u } of everyUnit()) {
    it(`${f.id} at ${width}mm`, () => {
      for (const p of u.parts) {
        const drawn = [...p.size].sort((a, b) => b - a);
        const cut = [p.L, p.W, p.T].sort((a, b) => b - a);
        for (let i = 0; i < 3; i++) {
          expect(near(drawn[i], cut[i], 0.51),
            `${p.code} is drawn ${p.size.join('x')} and cut ${p.L}x${p.W}x${p.T}`).toBe(true);
        }
      }
    });
  }
});

/* ===========================================================================
   Across a wall, not just inside one cabinet.

   A cabinet can be perfectly measured and the run still wrong: two cabinets
   drawn through each other, a run that reports a length it is not, a corner
   that does not reserve the space the cabinet on the next wall is standing
   in, a benchtop that stops short of the cabinets under it.
   =========================================================================== */

const wallOf = (units, length = 4200) => ({
  id: 'A', name: 'Wall A', length, obstacles: [], units,
});

const item = (familyId, settings = {}) => ({
  uid: `u${familyId}${settings.width ?? ''}${settings.x ?? ''}`, familyId, settings,
});

describe('cabinets flowing along a wall', () => {
  const units = [
    item('base-2door', { width: 800 }),
    item('base-3drawer', { width: 600 }),
    item('base-1door', { width: 450 }),
    item('base-2door', { width: 900 }),
  ];
  const lay = layoutWall(wallOf(units), PROJECT);

  it('starts at the wall and butts each cabinet against the last', () => {
    const base = lay.placed.filter((p) => p.where !== 'wall').sort((a, b) => a.x - b.x);
    expect(base[0].x).toBe(0);
    for (let i = 1; i < base.length; i++) {
      const prev = base[i - 1];
      expect(base[i].x, `cabinet ${i} does not butt the one before it`)
        .toBe(prev.x + prev.unit.width);
    }
  });

  it('reports a run that is the sum of what is in it', () => {
    const total = units.reduce((n, u) => n + u.settings.width, 0);
    expect(lay.baseRun).toBe(total);
    expect(lay.run).toBe(total);
  });

  it('no two cabinets on the same row occupy the same millimetre', () => {
    const rows = ['base', 'wall'];
    for (const row of rows) {
      const on = lay.placed.filter((p) => p.where === row || p.where === 'both')
        .sort((a, b) => a.x - b.x);
      for (let i = 1; i < on.length; i++) {
        expect(on[i].x, `${row} row: ${on[i].item.uid} overlaps ${on[i - 1].item.uid}`)
          .toBeGreaterThanOrEqual(on[i - 1].x + on[i - 1].unit.width - 0.01);
      }
    }
  });
});

describe('a tall cabinet blocks the wall run as well as the base run', () => {
  it('a pantry pushes the wall cabinets past it, not through it', () => {
    const lay = layoutWall(wallOf([
      item('tall-pantry', { width: 600 }),
      item('wall-2door', { width: 800 }),
    ]), PROJECT);

    const pantry = lay.placed.find((p) => p.unit.familyId === 'tall-pantry');
    const wallCab = lay.placed.find((p) => p.unit.familyId === 'wall-2door');
    expect(wallCab.x, 'the wall cabinet starts inside the pantry')
      .toBeGreaterThanOrEqual(pantry.x + pantry.unit.width - 0.01);
  });
});

describe('a pinned cabinet stays at the millimetre you pinned it to', () => {
  it('and the ones flowing after it carry on from its right hand edge', () => {
    const lay = layoutWall(wallOf([
      item('base-2door', { width: 800, x: 1200 }),
      item('base-3drawer', { width: 600 }),
    ]), PROJECT);

    const pinned = lay.placed.find((p) => p.unit.familyId === 'base-2door');
    const after = lay.placed.find((p) => p.unit.familyId === 'base-3drawer');
    expect(pinned.x).toBe(1200);
    expect(after.x, 'the flowing cabinet is drawn through the pinned one')
      .toBeGreaterThanOrEqual(pinned.x + pinned.unit.width - 0.01);
  });
});

describe('a corner reserves the space the cabinet on the next wall stands in', () => {
  /* The carcass depth plus a front. The blind panel and the door stand proud
     of the carcass, and so do the return run's own fronts, so a return that
     started at the carcass depth put one wall's front inside the other's by a
     board thickness in the corner. It is 18mm, it is invisible in plan, and
     it is the reason the doors would not go on. */
  it('the return wall starts clear of the corner carcass and its front', () => {
    const corner = buildUnit('A1', 'base-blind-l', { width: 1050 }, PROJECT);
    expect(corner.cornerReturn, 'a corner cabinet reports no return')
      .toBe(corner.depth + PROJECT.frontThk);

    const lay = layoutWall(wallOf([item('base-2door', { width: 800 })]),
      PROJECT, corner.cornerReturn);
    expect(lay.placed[0].x, 'the first cabinet on the return wall sits in the corner')
      .toBe(corner.cornerReturn);
    expect(lay.startOffset).toBe(corner.depth + PROJECT.frontThk);
  });

  it('a wall that gives its end to the next one stops short by that much', () => {
    const lay = layoutWall(wallOf([item('base-2door', { width: 800 })], 3000), PROJECT, 0, 560);
    expect(lay.limit).toBe(3000 - 560);
  });
});

describe('the benchtop covers the cabinets under it', () => {
  it('one slab over an unbroken base run, overhanging each end', () => {
    const lay = layoutWall(wallOf([
      item('base-2door', { width: 800 }),
      item('base-3drawer', { width: 600 }),
    ]), PROJECT);
    const segs = benchSegments(lay, (p) => p.x);
    expect(segs.length).toBe(1);
    expect(segs[0].x).toBeLessThanOrEqual(0);
    expect(segs[0].x + segs[0].w, 'the slab stops short of the run')
      .toBeGreaterThanOrEqual(1400);
  });

  it('a cooktop breaks it into two, because the bench is cut there', () => {
    const lay = layoutWall(wallOf([
      item('base-2door', { width: 800 }),
      item('app-cooktop', { width: 600 }),
      item('base-2door', { width: 800 }),
    ]), PROJECT);
    const segs = benchSegments(lay, (p) => p.x);
    expect(segs.length).toBe(2);
    expect(segs[0].x + segs[0].w, 'the first slab runs into the cooktop')
      .toBeLessThanOrEqual(segs[1].x + 0.01);
  });

  it('a wall cabinet gets no benchtop under it', () => {
    const lay = layoutWall(wallOf([item('wall-2door', { width: 800 })]), PROJECT);
    expect(benchSegments(lay, (p) => p.x)).toEqual([]);
  });
});

/* ===========================================================================
   What the numbers on the top strip are made of.

   Those five figures are the ones you glance at while you work, so they have
   to be the same arithmetic as the screens they summarise. A benchtop metre
   that is counted twice is a benchtop metre you pay for twice.
   =========================================================================== */

/* benchRunMetres is the raw run of base cabinets. benchMetres is the slab you
   are billed for, which is longer because it includes the overhang at an open
   end. The app keeps them apart on purpose, so the tests do too. */
describe('the benchtop metres are the base run, and only the base run', () => {
  const project = (units) => ({
    name: 'T', cfg: PROJECT, room: 'straight', activeWall: 'A', locked: [], extras: [],
    walls: [wallOf(units)],
  });

  it('counts a base run once', () => {
    const t = totals(project([
      item('base-2door', { width: 800 }),
      item('base-3drawer', { width: 600 }),
    ]));
    expect(t.benchRunMetres).toBeCloseTo(1.4, 3);
  });

  it('leaves out a wall cabinet, which has no bench under it', () => {
    const t = totals(project([
      item('base-2door', { width: 800 }),
      item('wall-2door', { width: 800 }),
    ]));
    expect(t.benchRunMetres).toBeCloseTo(0.8, 3);
  });

  it('counts a dishwasher, because the bench runs over it', () => {
    const t = totals(project([
      item('base-2door', { width: 800 }),
      item('app-dishwasher', { width: 600 }),
    ]));
    expect(t.benchRunMetres).toBeCloseTo(1.4, 3);
  });

  it('stops at a cooktop, because the bench is cut there', () => {
    const withCooktop = totals(project([
      item('base-2door', { width: 800 }),
      item('app-cooktop', { width: 600 }),
      item('base-2door', { width: 800 }),
    ]));
    /* The two runs either side, and not the 600 of cooktop between them. */
    expect(withCooktop.benchRunMetres).toBeCloseTo(1.6, 3);
  });

  it('a tall cabinet ends the run rather than standing on the bench', () => {
    const t = totals(project([
      item('base-2door', { width: 800 }),
      item('tall-pantry', { width: 600 }),
    ]));
    expect(t.benchRunMetres).toBeCloseTo(0.8, 3);
  });
});

describe('the cabinet, door and drawer counts are what is really there', () => {
  it('counts every cabinet including the tall ones, and no fillers', () => {
    const t = totals({
      name: 'T', cfg: PROJECT, room: 'straight', activeWall: 'A', locked: [], extras: [],
      walls: [wallOf([
        item('base-2door', { width: 800 }),
        item('tall-pantry', { width: 600 }),
        item('filler', { width: 100 }),
        item('base-3drawer', { width: 600 }),
      ])],
    });
    expect(t.cabinets).toBe(3);
    /* Two on the base cabinet, four on the pantry, none on the drawers. */
    expect(t.doors).toBe(6);
    expect(t.drawers).toBe(3);
  });
});
