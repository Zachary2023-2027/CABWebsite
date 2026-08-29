import { describe, expect, it } from 'vitest';
import {
  addRow, availableHeight, cleanStack, makeEqual, moveRow, newRow, removeRow,
  resolveStack, revealTotal, setRow,
} from '../stack.js';
import { FAMILY, PROJECT, buildUnit, defaultStackFor } from '../catalog.js';

const cfg = (over = {}) => ({ ...PROJECT, ...over });

/* The reveal accounting, at three cabinet heights, three reveal values, and
   with the fill row in the first, middle and last position. An off by one
   reveal is the easiest bug in this app to ship. */
describe('the reveal equation', () => {
  for (const opening of [720, 900, 2100]) {
    for (const reveal of [2, 3, 4]) {
      it(`holds in a ${opening}mm opening at a ${reveal}mm reveal`, () => {
        const P = cfg({ reveal });
        const stack = [newRow('drawer', 'fill'), newRow('drawer', 200), newRow('drawer', 200)];
        const r = resolveStack(stack, opening, P);

        expect(r.errors).toEqual([]);
        // sum of heights, plus every gap, equals the opening exactly.
        expect(r.used + revealTotal(3, P)).toBeCloseTo(opening, 1);
      });
    }
  }

  for (const at of [0, 1, 2]) {
    it(`holds with the fill row at position ${at}`, () => {
      const P = cfg({ reveal: 3 });
      const stack = [0, 1, 2].map((i) => newRow('drawer', i === at ? 'fill' : 220));
      const r = resolveStack(stack, 720, P);

      expect(r.errors).toEqual([]);
      expect(r.rows[at].filled).toBe(true);
      expect(r.used + revealTotal(3, P)).toBeCloseTo(720, 1);
    });
  }

  it('gaps at the top and bottom are their own values and default to none', () => {
    const P = cfg({ reveal: 3 });
    expect(revealTotal(3, P)).toBe(6);            // between only, twice
    expect(availableHeight(720, 3, P)).toBe(714);

    const gapped = cfg({ reveal: 3, revealTop: 3, revealBottom: 3 });
    expect(revealTotal(3, gapped)).toBe(12);      // the fully gapped case
    expect(availableHeight(720, 3, gapped)).toBe(708);
  });

  it('a single row has no gaps between anything', () => {
    const P = cfg({ reveal: 3 });
    expect(revealTotal(1, P)).toBe(0);
    const r = resolveStack([newRow('doors', 'fill')], 720, P);
    expect(r.rows[0].height).toBe(720);
  });
});

describe('positions', () => {
  it('runs top down, and the bottom row sits on the bottom of the opening', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack(
      [newRow('drawer', 238), newRow('drawer', 238), newRow('drawer', 238)], 720, P,
    );

    expect(r.rows[0].top).toBe(720);
    expect(r.rows[0].y).toBe(482);
    expect(r.rows[1].top).toBe(479);
    expect(r.rows[2].y).toBe(0);
  });

  it('a top gap pushes everything down by exactly that gap', () => {
    const P = cfg({ reveal: 3, revealTop: 3 });
    const r = resolveStack([newRow('doors', 'fill')], 720, P);
    expect(r.rows[0].top).toBe(717);
    expect(r.rows[0].height).toBe(717);
    expect(r.rows[0].y).toBe(0);
  });

  it('no row ever overlaps the one below it', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack(
      [newRow('doors', 300), newRow('drawer', 200), newRow('drawer', 'fill')], 720, P,
    );
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].top).toBeLessThanOrEqual(r.rows[i - 1].y);
    }
  });
});

describe('nothing is silently adjusted', () => {
  it('rows that come up short are reported, not stretched', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack([newRow('drawer', 200), newRow('drawer', 200)], 720, P);

    expect(r.rows.map((x) => x.height)).toEqual([200, 200]);
    expect(r.warnings.join(' ')).toMatch(/317.*unused/);
    expect(r.errors).toEqual([]);
  });

  it('rows that are too tall are an error, not a squeeze', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack([newRow('drawer', 400), newRow('drawer', 400)], 720, P);

    expect(r.rows.map((x) => x.height)).toEqual([400, 400]);
    expect(r.errors.join(' ')).toMatch(/too tall/);
  });

  it('two fill rows is an error the user is told about', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack([newRow('drawer', 'fill'), newRow('drawer', 'fill')], 720, P);
    expect(r.errors.join(' ')).toMatch(/Only one row can take what is left over/);
  });

  it('a fill row asked for more than there is reports the shortfall', () => {
    const P = cfg({ reveal: 3 });
    const r = resolveStack([newRow('drawer', 800), newRow('drawer', 'fill')], 720, P);
    expect(r.errors.join(' ')).toMatch(/more than the .* available/);
  });
});

describe('make equal', () => {
  it('divides the opening evenly and still adds up exactly', () => {
    const P = cfg({ reveal: 3 });
    const stack = makeEqual([newRow('drawer'), newRow('drawer'), newRow('drawer')], 720, P);
    const r = resolveStack(stack, 720, P);

    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.used + revealTotal(3, P)).toBeCloseTo(720, 1);
  });

  it('works for any number of rows, at any opening', () => {
    for (const n of [1, 2, 3, 4, 5, 7]) {
      for (const opening of [450, 720, 2100]) {
        const P = cfg({ reveal: 3 });
        const stack = makeEqual(Array.from({ length: n }, () => newRow('drawer')), opening, P);
        const r = resolveStack(stack, opening, P);
        expect(r.errors, `${n} rows in ${opening}`).toEqual([]);
        expect(r.used + revealTotal(n, P), `${n} rows in ${opening}`).toBeCloseTo(opening, 1);
      }
    }
  });

  it('generalises beyond drawers, to any mix of row types', () => {
    const P = cfg({ reveal: 3 });
    const stack = makeEqual(
      [newRow('drawer'), newRow('doors'), newRow('open')], 720, P,
    );
    expect(stack.map((r) => r.type)).toEqual(['drawer', 'doors', 'open']);
    expect(resolveStack(stack, 720, P).errors).toEqual([]);
  });
});

describe('row operations', () => {
  const base = () => [newRow('doors', 100), newRow('drawer', 200), newRow('open', 300)];

  it('adds above and below', () => {
    expect(addRow(base(), 0, newRow('false', 50)).map((r) => r.type))
      .toEqual(['false', 'doors', 'drawer', 'open']);
    expect(addRow(base(), 3, newRow('false', 50)).map((r) => r.type))
      .toEqual(['doors', 'drawer', 'open', 'false']);
  });

  it('removes', () => {
    expect(removeRow(base(), 1).map((r) => r.type)).toEqual(['doors', 'open']);
  });

  it('moves up and down, and refuses to fall off either end', () => {
    expect(moveRow(base(), 2, -1).map((r) => r.type)).toEqual(['doors', 'open', 'drawer']);
    expect(moveRow(base(), 0, -1).map((r) => r.type)).toEqual(['doors', 'drawer', 'open']);
    expect(moveRow(base(), 2, 1).map((r) => r.type)).toEqual(['doors', 'drawer', 'open']);
  });

  it('sets a field without touching the others', () => {
    const next = setRow(base(), 0, { doors: 2, hingeSide: 'pair' });
    expect(next[0]).toMatchObject({ type: 'doors', height: 100, doors: 2, hingeSide: 'pair' });
    expect(next[1]).toEqual(base()[1]);
  });

  it('never mutates the stack it was given', () => {
    const stack = base();
    addRow(stack, 0, newRow());
    removeRow(stack, 0);
    moveRow(stack, 0, 1);
    setRow(stack, 0, { doors: 2 });
    expect(stack.map((r) => r.type)).toEqual(['doors', 'drawer', 'open']);
  });
});

describe('a stack arriving from a file', () => {
  it('drops rows of a type that does not exist', () => {
    const clean = cleanStack([{ type: 'doors', height: 100 }, { type: 'trapdoor', height: 50 }]);
    expect(clean.map((r) => r.type)).toEqual(['doors']);
  });

  it('turns a nonsense height into fill rather than into NaN', () => {
    const clean = cleanStack([{ type: 'drawer', height: 'tall' }, { type: 'drawer', height: -5 }]);
    expect(clean.map((r) => r.height)).toEqual(['fill', 'fill']);
  });

  it('keeps zero, because a row can be closed up', () => {
    expect(cleanStack([{ type: 'drawer', height: 0 }])[0].height).toBe(0);
  });

  it('gives a door row a sane hinge side', () => {
    expect(cleanStack([{ type: 'doors', height: 100, doors: 2 }])[0].hingeSide).toBe('pair');
    expect(cleanStack([{ type: 'doors', height: 100, doors: 1 }])[0].hingeSide).toBe('left');
    expect(cleanStack([{ type: 'doors', height: 100, doors: 1, hingeSide: 'up' }])[0].hingeSide).toBe('left');
  });

  it('leaves two fill rows alone, so the user is told rather than corrected', () => {
    const clean = cleanStack([{ type: 'drawer', height: 'fill' }, { type: 'drawer', height: 'fill' }]);
    expect(clean).toHaveLength(2);
    expect(resolveStack(clean, 720, cfg()).errors.length).toBe(1);
  });

  it('returns null for anything that is not a stack', () => {
    expect(cleanStack(null)).toBeNull();
    expect(cleanStack('doors')).toBeNull();
    expect(cleanStack([])).toBeNull();
    expect(cleanStack([{ type: 'nope' }])).toBeNull();
  });
});

describe('an empty stack', () => {
  it('resolves to nothing without throwing', () => {
    const r = resolveStack([], 720, cfg());
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   The guarantee that makes this package safe to ship: a cabinet with no stack
   of its own builds exactly what it built before the stack existed.
   --------------------------------------------------------------------------- */

describe('a preset with no stack of its own', () => {
  it('is what the preset says, resolved against the opening', () => {
    const P = cfg();
    const stack = defaultStackFor(FAMILY['base-3drawer'], { drawers: 3 }, 720, P);
    expect(stack).toHaveLength(3);
    expect(stack.every((r) => r.type === 'drawer')).toBe(true);

    const r = resolveStack(stack, 720, P);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.height)).toEqual([238, 238, 238]);
    expect(r.rows[2].y).toBe(0);
  });

  it('leaves four equal drawers sitting exactly on the carcass bottom', () => {
    // 177.75 each. Rounding a row height and then stacking it left the
    // bottom drawer 0.2mm below the cabinet.
    const r = resolveStack(defaultStackFor(FAMILY['base-4drawer'], { drawers: 4 }, 720, cfg()), 720, cfg());
    expect(r.rows[3].y).toBe(0);
    expect(r.rows[0].top).toBe(720);
  });

  it('gives a pantry two pairs rather than one pair of 2100mm doors', () => {
    const stack = defaultStackFor(FAMILY['tall-pantry'], { doors: 2 }, 2100, cfg());
    expect(stack).toHaveLength(2);
    expect(stack.every((r) => r.type === 'doors' && r.doors === 2)).toBe(true);
  });

  it('gives an oven tower a door, a cavity and a drawer, top down', () => {
    const stack = defaultStackFor(FAMILY['tall-oven'], { ovenH: 600 }, 2100, cfg());
    expect(stack.map((r) => r.type)).toEqual(['doors', 'bay', 'drawer']);
    expect(stack[1].appliance).toBe('oven');
    expect(resolveStack(stack, 2100, cfg()).errors).toEqual([]);
  });

  /* A pair of doors and nothing over them. The 150mm plank that used to run
     across the top is what a drawer bank has instead of a drawer, and a sink
     base has no use for one: the bowl hangs below the benchtop and the doors
     run past it. Anyone who wants one adds a false front row. */
  it('gives a sink two full height doors and no plank across the top', () => {
    const stack = defaultStackFor(FAMILY['base-sink'], {}, 720, cfg());
    expect(stack.map((r) => r.type)).toEqual(['doors']);
    expect(stack[0].doors).toBe(2);
    expect(stack[0].height).toBe('fill');

    const done = resolveStack(stack, 720, cfg());
    expect(done.errors).toEqual([]);
    // And it fills the opening, so the reveal accounting still adds up.
    expect(done.rows[0].height).toBe(done.available);
  });
});

/* The layouts that were impossible before, because they were not on the list
   of twenty one families. */
describe('a stack the user has written', () => {
  it('builds one drawer over two doors', () => {
    const u = buildUnit('T1', 'base-2door', {
      width: 800,
      stack: [
        { type: 'drawer', height: 180 },
        { type: 'doors', height: 'fill', doors: 2, hingeSide: 'pair' },
      ],
    }, cfg());

    const fronts = u.parts.filter((p) => p.group === 'front');
    expect(fronts.filter((p) => p.code.includes('DRWR-F'))).toHaveLength(1);
    expect(fronts.filter((p) => p.code.includes('DOOR'))).toHaveLength(2);

    // Reveals still add up: 180 drawer, 3 gap, 537 doors, in a 720 opening.
    expect(u.stack.errors).toEqual([]);
    expect(u.stack.rows[1].height).toBe(537);
    expect(u.stack.rows[1].y).toBe(0);
  });

  it('builds three unequal drawers over an open bay', () => {
    const u = buildUnit('T1', 'base-3drawer', {
      width: 600,
      stack: [
        { type: 'drawer', height: 150 },
        { type: 'drawer', height: 200 },
        { type: 'drawer', height: 'fill' },
        { type: 'open', height: 120 },
      ],
    }, cfg());

    expect(u.parts.filter((p) => p.code.includes('DRWR-F'))).toHaveLength(3);
    expect(u.stack.errors).toEqual([]);
    // The open row emits nothing but still takes its height.
    expect(u.stack.rows[3].height).toBe(120);
    expect(u.stack.used + revealTotal(4, cfg())).toBeCloseTo(720, 1);
  });

  it('hangs a single door on the side you choose', () => {
    for (const side of ['left', 'right']) {
      const u = buildUnit('T1', 'base-1door', {
        width: 450, stack: [{ type: 'doors', height: 'fill', doors: 1, hingeSide: side }],
      }, cfg());
      expect(u.parts.find((p) => p.code.includes('DOOR')).hinge, side).toBe(side);
    }
  });

  it('hinges a pair on its outer edges', () => {
    const u = buildUnit('T1', 'base-2door', {
      width: 800, stack: [{ type: 'doors', height: 'fill', doors: 2, hingeSide: 'pair' }],
    }, cfg());
    expect(u.parts.filter((p) => p.code.includes('DOOR')).map((p) => p.hinge)).toEqual(['left', 'right']);
  });

  it('tells the user when the rows do not add up, rather than fixing it', () => {
    const u = buildUnit('T1', 'base-3drawer', {
      width: 600,
      stack: [{ type: 'drawer', height: 400 }, { type: 'drawer', height: 400 }],
    }, cfg());
    expect(u.stack.errors.join(' ')).toMatch(/too tall/);
    // and it still draws, at the heights that were typed
    expect(u.parts.filter((p) => p.code.includes('DRWR-F'))).toHaveLength(2);
  });

  it('carries the row a front came from, so every view can point at the same thing', () => {
    const u = buildUnit('T1', 'base-2door', {
      width: 800,
      stack: [{ type: 'drawer', height: 180 }, { type: 'doors', height: 'fill', doors: 2 }],
    }, cfg());
    expect(u.parts.find((p) => p.code.includes('DRWR-F')).row).toBe(0);
    expect(u.parts.filter((p) => p.code.includes('DOOR')).every((p) => p.row === 1)).toBe(true);
  });
});
