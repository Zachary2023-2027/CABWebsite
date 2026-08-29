/* ===========================================================================
   The gaps, on both axes, on every cabinet this app can build.

   This is the test the whole model stands on. If the fronts plus the gaps do
   not equal the carcass, every number downstream is wrong and none of them
   look wrong: the cut list is plausible, the nest fits, the price is fine,
   and the doors do not go on.

   So it is checked exhaustively rather than by sampling. Every family, at
   every width it offers, at several reveals, with the side gaps left to
   follow the rule and with them set to something else. Both axes: across, the
   fronts and the gaps between them fill the carcass; up, the rows and their
   gaps fill the opening.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';
import { frontSpan, resolveStack, revealTotal, reveals } from '../stack.js';

const real = FAMILIES.filter((f) => !f.cavity && f.kind !== 'filler');

/** The fronts of a unit, grouped into the rows they are drawn in. */
function rows(unit) {
  const out = new Map();
  for (const p of unit.parts) {
    if (p.group !== 'front') continue;
    /* The blind panel of a corner stands beside the whole stack rather than
       in a row of it, so it is counted once, on its own. */
    if (p.code.endsWith('-BLIND')) continue;
    const y = Math.round(p.pos[1] * 10) / 10;
    if (!out.has(y)) out.set(y, []);
    out.get(y).push(p);
  }
  return out;
}

const blindOf = (unit) => unit.parts.find((p) => p.code.endsWith('-BLIND')) || null;

/* ---------------------------------------------------------------------------
   Across the cabinet.
   --------------------------------------------------------------------------- */

describe('the fronts and the gaps fill the carcass, across', () => {
  for (const reveal of [2, 3, 4, 6]) {
    const cfg = { ...PROJECT, reveal };

    for (const f of real) {
      for (const width of f.widths) {
        it(`${f.id} at ${width}mm on a ${reveal}mm reveal`, () => {
          const u = buildUnit('T1', f.id, { width }, cfg);
          const r = reveals(u.cfg);
          const span = frontSpan(u.width, u.cfg);

          /* The front band: the carcass less the gap at each end. Stated once
             by the model, and here worked out the other way round from the
             two gaps, so the two have to agree. */
          expect(span.x, 'the front starts at the left gap').toBeCloseTo(r.left, 6);
          expect(span.x + span.width + r.right, 'the front band ends at the carcass')
            .toBeCloseTo(u.width, 6);

          const blind = blindOf(u);
          // On a corner the rows fill the opening, and the blind covers the rest.
          const target = blind ? span.width - blind.size[0] - r.betweenX : span.width;
          if (blind) {
            expect(blind.size[0] + r.betweenX + target, 'blind plus opening is the front band')
              .toBeCloseTo(span.width, 6);
          }

          for (const [y, row] of rows(u)) {
            const across = row.reduce((a, p) => a + p.size[0], 0)
              + (row.length - 1) * r.betweenX;
            expect(across, `${f.id} row at ${y}`).toBeCloseTo(target, 6);

            // And every front in the row starts where the last one ended.
            const sorted = [...row].sort((a, b) => a.pos[0] - b.pos[0]);
            for (let i = 1; i < sorted.length; i++) {
              const gap = sorted[i].pos[0] - (sorted[i - 1].pos[0] + sorted[i - 1].size[0]);
              expect(gap, `${f.id} between fronts in the row at ${y}`)
                .toBeCloseTo(r.betweenX, 6);
            }
          }
        });
      }
    }
  }
});

/* ---------------------------------------------------------------------------
   The gaps at the ends, which used to be the two you could not set.
   --------------------------------------------------------------------------- */

describe('the gap at each end of a cabinet', () => {
  it('follows half the reveal when it is left alone, which is what it always did', () => {
    for (const reveal of [2, 3, 4]) {
      const u = buildUnit('T1', 'base-2door', { width: 800 }, { ...PROJECT, reveal });
      const door = u.parts.filter((p) => p.group === 'front')
        .sort((a, b) => a.pos[0] - b.pos[0])[0];
      expect(door.pos[0], `at a ${reveal}mm reveal`).toBeCloseTo(reveal / 2, 6);
    }
  });

  it('can be set to something else, and the fronts move to suit', () => {
    const cfg = { ...PROJECT, reveal: 3, revealLeft: 10, revealRight: 2 };
    const u = buildUnit('T1', 'base-2door', { width: 800 }, cfg);
    const fronts = u.parts.filter((p) => p.group === 'front')
      .sort((a, b) => a.pos[0] - b.pos[0]);

    expect(fronts[0].pos[0]).toBeCloseTo(10, 6);
    const right = fronts[fronts.length - 1];
    expect(u.width - (right.pos[0] + right.size[0])).toBeCloseTo(2, 6);
  });

  /* Two cabinets butted together leave both their end gaps between their
     doors. That is the joint you look straight at from across the room, and
     the reason these two had to stop being decided for you. */
  it('two cabinets butted together leave both their end gaps between the doors', () => {
    for (const [left, right] of [[null, null], [10, 2], [0, 0]]) {
      const cfg = { ...PROJECT, reveal: 3, revealLeft: left, revealRight: right };
      const a = buildUnit('A', 'base-1door', { width: 600 }, cfg);
      const b = buildUnit('B', 'base-1door', { width: 600 }, cfg);
      const r = reveals(cfg);

      const aRight = a.parts.filter((p) => p.group === 'front')
        .reduce((m, p) => Math.max(m, p.pos[0] + p.size[0]), 0);
      const bLeft = b.parts.filter((p) => p.group === 'front')
        .reduce((m, p) => Math.min(m, p.pos[0]), Infinity);

      // b stands at 600, so the gap between the two doors is what is left.
      expect((600 + bLeft) - aRight, `${left} and ${right}`)
        .toBeCloseTo(r.right + r.left, 6);
    }
  });

  it('a pair of doors in one opening has its own gap', () => {
    const cfg = { ...PROJECT, reveal: 3, revealBetween: 12 };
    const u = buildUnit('T1', 'base-2door', { width: 800 }, cfg);
    const [a, b] = u.parts.filter((p) => p.group === 'front')
      .sort((x, y) => x.pos[0] - y.pos[0]);
    expect(b.pos[0] - (a.pos[0] + a.size[0])).toBeCloseTo(12, 6);
    // And the pair still fills the front band exactly.
    expect(a.size[0] + 12 + b.size[0]).toBeCloseTo(800 - 3, 6);
  });
});

/* ---------------------------------------------------------------------------
   Up the cabinet.
   --------------------------------------------------------------------------- */

describe('the rows and the gaps fill the opening, up', () => {
  for (const f of real) {
    for (const width of f.widths) {
      it(`${f.id} at ${width}mm`, () => {
        const u = buildUnit('T1', f.id, { width }, PROJECT);
        if (!u.stack) return;

        const used = u.stack.rows.reduce((a, r) => a + r.height, 0);
        expect(used + revealTotal(u.stack.rows.length, u.cfg), `${f.id} stack`)
          .toBeCloseTo(u.height, 1);

        // Nothing runs off either end of the carcass.
        for (const p of u.parts.filter((q) => q.group === 'front')) {
          expect(p.pos[1], `${p.code} below the carcass`).toBeGreaterThanOrEqual(-0.51);
          expect(p.pos[1] + p.size[1], `${p.code} above the carcass`)
            .toBeLessThanOrEqual(u.height + 0.51);
        }
      });
    }
  }

  it('a top and bottom gap push the fronts in by exactly that much', () => {
    const cfg = { ...PROJECT, reveal: 3, revealTop: 5, revealBottom: 7 };
    const u = buildUnit('T1', 'base-3drawer', { width: 600 }, cfg);
    const fronts = u.parts.filter((p) => p.group === 'front')
      .sort((a, b) => a.pos[1] - b.pos[1]);

    expect(fronts[0].pos[1]).toBeCloseTo(7, 6);
    const top = fronts[fronts.length - 1];
    expect(u.height - (top.pos[1] + top.size[1])).toBeCloseTo(5, 6);
  });
});

/* ---------------------------------------------------------------------------
   The drawer box, which is the one thing set out from the carcass rather than
   from the front, and the place a blind corner used to get it wrong.
   --------------------------------------------------------------------------- */

describe('every drawer box is inside the carcass it runs in', () => {
  for (const f of real) {
    for (const width of f.widths) {
      it(`${f.id} at ${width}mm`, () => {
        const u = buildUnit('T1', f.id, { width }, PROJECT);
        const T = u.cfg.carcassThk;
        const box = u.parts.filter((p) => p.group === 'box');
        if (!box.length) return;

        for (const p of box) {
          expect(p.pos[0], `${p.code} through the left side`).toBeGreaterThanOrEqual(T - 0.01);
          expect(p.pos[0] + p.size[0], `${p.code} through the right side`)
            .toBeLessThanOrEqual(u.width - T + 0.01);
        }
      });
    }
  }

  /* The corner is the case that made this worth its own test. Its box runs in
     the part of the cabinet you can reach into, and its front covers the same
     opening, and the two are set out from different things. */
  it('a corner drawer runs in the reachable half, on whichever side that is', () => {
    for (const blindSide of ['right', 'left']) {
      const u = buildUnit('T1', 'base-corner-drawer', { blindSide }, PROJECT);
      const T = u.cfg.carcassThk;
      const box = u.parts.filter((p) => p.group === 'box');
      const blind = blindOf(u);

      const from = Math.min(...box.map((p) => p.pos[0]));
      const to = Math.max(...box.map((p) => p.pos[0] + p.size[0]));

      expect(from, blindSide).toBeGreaterThanOrEqual(T - 0.01);
      expect(to, blindSide).toBeLessThanOrEqual(u.width - T + 0.01);

      /* And it is on the side away from the blind panel, which is the whole
         point: a box behind the blind is a drawer you cannot open. */
      const boxMid = (from + to) / 2;
      const blindMid = blind.pos[0] + blind.size[0] / 2;
      if (blindSide === 'right') expect(boxMid).toBeLessThan(blindMid);
      else expect(boxMid).toBeGreaterThan(blindMid);
    }
  });
});

/* ---------------------------------------------------------------------------
   And the whole thing, once more, from the other direction: the stack the
   model resolved is the stack the parts were built from.
   --------------------------------------------------------------------------- */

describe('the parts match the stack they came from', () => {
  for (const f of real) {
    it(f.id, () => {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      if (!u.stack) return;

      for (const p of u.parts.filter((q) => q.group === 'front')) {
        if (p.code.endsWith('-BLIND')) continue;
        const row = u.stack.rows.find(
          (r) => Math.abs(r.y - p.pos[1]) < 0.51 && Math.abs(r.height - p.size[1]) < 0.51);
        expect(row, `${p.code} matches no row of its own stack`).toBeTruthy();
      }
    });
  }
});
