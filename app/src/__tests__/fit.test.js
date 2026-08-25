/* ===========================================================================
   Does it actually fit together?

   Everything else in the suite checks a number against a formula. This checks
   the parts against each other: real solids in one coordinate system, and
   whether any two of them are trying to occupy the same millimetre.

   The rule the cabinet has to obey is that a drawer box lives INSIDE the
   carcass. A frameless front runs past the carcass and covers the edge of the
   bottom panel, so setting the box out from its front rather than from the
   carcass buries it in the bottom of the cabinet by a board thickness - which
   is exactly what it used to do.

   Both ways of holding the bottom are checked: recessed and pocket screwed
   into the sides, and butted up under them.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import { BOX_CLEAR, FAMILIES, PROJECT, buildUnit, drawerSetout } from '../catalog.js';

const FIXES = ['screwed', 'butted'];

const span = (p, i) => [p.pos[i], p.pos[i] + p.size[i]];
/** How far two parts overlap on one axis. Negative or zero means clear. */
const overlapOn = (a, b, i) => {
  const [a0, a1] = span(a, i);
  const [b0, b1] = span(b, i);
  return Math.min(a1, b1) - Math.max(a0, b0);
};
/** The smallest overlap across all three axes: positive means real solid
    intersection, because a box has to overlap on every axis to clash. */
const clash = (a, b) => Math.min(overlapOn(a, b, 0), overlapOn(a, b, 1), overlapOn(a, b, 2));

const drawerFamilies = FAMILIES.filter((f) => !f.cavity
  && buildUnit('T1', f.id, {}, PROJECT).parts.some((p) => /DRWR\d+-BASE$/.test(p.code)));

const build = (familyId, fix, extra = {}) =>
  buildUnit('T1', familyId, {}, { ...PROJECT, boxBaseFix: fix, ...extra });

describe('there are drawer cabinets to check', () => {
  it('finds some', () => {
    expect(drawerFamilies.length).toBeGreaterThan(0);
  });
});

describe('no drawer box is inside the carcass board', () => {
  for (const fix of FIXES) {
    it(`${fix}: box parts clear every carcass and back panel`, () => {
      for (const f of drawerFamilies) {
        const u = build(f.id, fix);
        const carcass = u.parts.filter((p) => p.group === 'carcass' || p.group === 'back');
        const boxes = u.parts.filter((p) => p.group === 'box');
        expect(boxes.length, f.id).toBeGreaterThan(0);
        for (const b of boxes) {
          for (const c of carcass) {
            expect(clash(b, c), `${f.id} ${fix}: ${b.code} into ${c.code}`)
              .toBeLessThanOrEqual(0.001);
          }
        }
      }
    });
  }

  /* The bottom drawer is the one that used to be buried, so it gets its own
     statement of the rule: the lowest surface of the lowest box sits the
     clearance above the TOP FACE of the bottom panel, not above the outside
     of the cabinet. */
  for (const fix of FIXES) {
    it(`${fix}: the lowest box stands clear of the bottom panel`, () => {
      for (const f of drawerFamilies) {
        const u = build(f.id, fix);
        const bot = u.parts.find((p) => /-BOT$/.test(p.code));
        if (!bot) continue;
        const floor = bot.pos[1] + bot.size[1];
        const lowest = Math.min(...drawerSetout(u).map((d) => d.bottom));
        expect(lowest - floor, `${f.id} ${fix}`)
          .toBeGreaterThanOrEqual(BOX_CLEAR.bottom - 0.001);
      }
    });
  }

  it('the highest box stands clear of the top, or of the top rails', () => {
    for (const f of drawerFamilies) {
      for (const fix of FIXES) {
        const u = build(f.id, fix);
        const above = u.parts.filter((p) => /-(TOP|RAIL-TB|RAIL-TF)$/.test(p.code));
        if (!above.length) continue;
        const ceiling = Math.min(...above.map((p) => p.pos[1]));
        const highest = Math.max(...drawerSetout(u).map((d) => d.top));
        expect(ceiling - highest, `${f.id} ${fix}`).toBeGreaterThanOrEqual(-0.001);
      }
    }
  });
});

describe('drawer boxes do not run into each other', () => {
  for (const fix of FIXES) {
    it(`${fix}: one box clears the next`, () => {
      for (const f of drawerFamilies) {
        const u = build(f.id, fix);
        /* Drawers are numbered down the cabinet, so they are put back in
           height order before being compared to their neighbour. */
        const up = drawerSetout(u).slice().sort((a, b) => a.bottom - b.bottom);
        for (let i = 1; i < up.length; i += 1) {
          expect(up[i].bottom - up[i - 1].top, `${f.id} ${fix} drawer ${up[i].n}`)
            .toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('the box is built out of panels that meet', () => {
  it('the front and back land on the sides, with no gap and no overlap', () => {
    for (const f of drawerFamilies) {
      const u = build(f.id, 'screwed');
      const g = (re) => u.parts.find((p) => re.test(p.code));
      const [L, R, F, B] = [/DRWR1-SIDE-L$/, /DRWR1-SIDE-R$/, /DRWR1-FRONT$/, /DRWR1-BACK$/].map(g);
      if (!L) continue;
      // Front and back span exactly the gap between the two sides.
      expect(F.pos[0], f.id).toBeCloseTo(L.pos[0] + L.size[0], 6);
      expect(F.pos[0] + F.size[0], f.id).toBeCloseTo(R.pos[0], 6);
      expect(B.pos[0], f.id).toBeCloseTo(L.pos[0] + L.size[0], 6);
      // And they sit at the two ends of the sides, inside them.
      expect(B.pos[2], f.id).toBeCloseTo(L.pos[2], 6);
      expect(F.pos[2] + F.size[2], f.id).toBeCloseTo(L.pos[2] + L.size[2], 6);
    }
  });

  /* A recessed base lands on the inside faces of all four panels: no gap for
     it to drop through, and no overlap that would stop it seating. */
  it('a recessed base lands on all four panels, exactly', () => {
    for (const f of drawerFamilies) {
      const u = build(f.id, 'screwed');
      const g = (re) => u.parts.find((p) => re.test(p.code));
      const base = g(/DRWR1-BASE$/);
      const [L, R, F, B] = [/DRWR1-SIDE-L$/, /DRWR1-SIDE-R$/, /DRWR1-FRONT$/, /DRWR1-BACK$/].map(g);
      if (!base) continue;
      expect(base.pos[0], `${f.id} left`).toBeCloseTo(L.pos[0] + L.size[0], 6);
      expect(base.pos[0] + base.size[0], `${f.id} right`).toBeCloseTo(R.pos[0], 6);
      expect(base.pos[2], `${f.id} back`).toBeCloseTo(B.pos[2] + B.size[2], 6);
      expect(base.pos[2] + base.size[2], `${f.id} front`).toBeCloseTo(F.pos[2], 6);
    }
  });

  it('a butted base covers the whole footprint it is screwed to', () => {
    for (const f of drawerFamilies) {
      const u = build(f.id, 'butted');
      const g = (re) => u.parts.find((p) => re.test(p.code));
      const base = g(/DRWR1-BASE$/);
      const [L, R] = [/DRWR1-SIDE-L$/, /DRWR1-SIDE-R$/].map(g);
      if (!base) continue;
      expect(base.pos[0], f.id).toBeCloseTo(L.pos[0], 6);
      expect(base.pos[0] + base.size[0], f.id).toBeCloseTo(R.pos[0] + R.size[0], 6);
      expect(base.pos[2], f.id).toBeCloseTo(L.pos[2], 6);
      expect(base.pos[2] + base.size[2], f.id).toBeCloseTo(L.pos[2] + L.size[2], 6);
      // And it is directly under them, touching, not floating.
      expect(base.pos[1] + base.size[1], f.id).toBeCloseTo(L.pos[1], 6);
    }
  });
});

describe('the box stays inside the cabinet in plan too', () => {
  for (const fix of FIXES) {
    it(`${fix}: clear of both sides and of the back`, () => {
      for (const f of drawerFamilies) {
        const u = build(f.id, fix);
        const box = u.parts.filter((p) => p.group === 'box');
        const side = u.parts.find((p) => /-SIDE-L$/.test(p.code) && p.group === 'carcass');
        const right = u.parts.find((p) => /-SIDE-R$/.test(p.code) && p.group === 'carcass');
        const back = u.parts.find((p) => /-BACK$/.test(p.code) && p.group === 'back');
        for (const b of box) {
          expect(b.pos[0], `${f.id} ${fix} ${b.code} left`)
            .toBeGreaterThanOrEqual(side.pos[0] + side.size[0] - 0.001);
          expect(b.pos[0] + b.size[0], `${f.id} ${fix} ${b.code} right`)
            .toBeLessThanOrEqual(right.pos[0] + 0.001);
          if (back) {
            expect(b.pos[2], `${f.id} ${fix} ${b.code} back`)
              .toBeGreaterThanOrEqual(back.pos[2] + back.size[2] - 0.001);
          }
        }
      }
    });
  }
});
