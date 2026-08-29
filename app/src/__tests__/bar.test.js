/* ===========================================================================
   The breakfast bar.

   One number and one side, and everything else follows from them. So the test
   worth writing is that everything really does follow: that the slab grows on
   the side you picked and only that side, that the price follows the slab,
   that the walkway is measured to the edge you would walk into rather than to
   the carcass, and that what holds it up is counted once rather than once by
   the order list and again by the total.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  BAR_SIDES, allFittings, allParts, allUnits, barBrackets, barCost, barFittings,
  barIsWholeSide, barRange, barSeats, barSideLength, barSpan, benchPieces, floorPlan,
  isIsland, islandBar, islandDepth, nestCfg, starterProject, totals,
} from '../project.js';
import { BAR_RULES } from '../bar.js';
import { benchLength, islandBench } from '../runs.js';
import { facesOf, walkways } from '../checks.js';
import { orderList } from '../purchase.js';
import { nestProject } from '../nesting.js';
import { drillUnit } from '../drilling.js';
import { hydrate, snapshot } from '../storage.js';
import { decodeProject, encodeProject } from '../share.js';
import { PRICES, PROJECT } from '../catalog.js';

/* The order list needs the same readers the screen gives it. */
const ORDER_DEPS = {
  allParts, allFittings, allUnits, drillUnit, nestProject, nestCfg, benchPieces,
};

const island = (p) => p.walls.find((w) => isIsland(w));

const withBar = (side, depth) => {
  const p = starterProject();
  island(p).bar = { side, depth };
  return p;
};

const rules = (p) => ({ ...BAR_RULES, ...p.cfg });

describe('what a bar is', () => {
  it('is a side and a number, and nothing else', () => {
    expect(islandBar({ bar: { side: 'back', depth: 300 } }))
      .toMatchObject({ side: 'back', depth: 300 });
  });

  it('is no bar at all when there is no island to put it on', () => {
    expect(islandBar(undefined)).toMatchObject({ side: 'none', depth: 0 });
    expect(islandBar({})).toMatchObject({ side: 'none', depth: 0 });
  });

  /* A side nobody recognises is not a broken island, it is an island with no
     bar, and it still opens. */
  it('ignores a side it does not know', () => {
    expect(islandBar({ bar: { side: 'diagonal', depth: 400 } }).depth).toBe(0);
  });

  it('ignores an overhang of nothing or of nonsense', () => {
    expect(islandBar({ bar: { side: 'back', depth: 0 } }).depth).toBe(0);
    expect(islandBar({ bar: { side: 'back', depth: -300 } }).depth).toBe(0);
    expect(islandBar({ bar: { side: 'back', depth: 'wide' } }).depth).toBe(0);
  });

  it('offers only sides the model understands', () => {
    for (const s of BAR_SIDES) {
      expect(['none', 'front', 'back', 'left', 'right']).toContain(s.id);
    }
  });
});

describe('the slab it makes', () => {
  const base = () => {
    const p = starterProject();
    const w = island(p);
    return islandBench(w, islandDepth(w, p.cfg), p.cfg)[0];
  };

  const slab = (side, depth) => {
    const p = withBar(side, depth);
    const w = island(p);
    return islandBench(w, islandDepth(w, p.cfg), p.cfg, islandBar(w))[0];
  };

  it('grows across the island for a bar on the front or the back', () => {
    const before = base();
    for (const side of ['front', 'back']) {
      const after = slab(side, 350);
      expect(after.depth).toBe(before.depth + 350);
      expect(after.length).toBe(before.length);
    }
  });

  it('grows along the island for a bar on an end', () => {
    const before = base();
    for (const side of ['left', 'right']) {
      const after = slab(side, 350);
      expect(after.length).toBe(before.length + 350);
      expect(after.depth).toBe(before.depth);
    }
  });

  /* One slab, not two pieces. The bar is more of the same top. */
  it('is still one piece with four overhanging edges', () => {
    const after = slab('back', 400);
    expect(after.overhangs).toBe(4);
    expect(after.island).toBe(true);
    expect(after.bar).toMatchObject({ side: 'back', depth: 400 });
  });

  it('says nothing about a bar when there is not one', () => {
    expect(base().bar).toBeNull();
  });
});

describe('what it costs', () => {
  it('bills the extra top, worked out two ways', () => {
    const plain = starterProject();
    const barred = withBar('back', 400);

    const before = benchLength(benchPieces(plain));
    const after = benchLength(benchPieces(barred));

    /* By the model. And by hand: the extra is a strip 400 deep the length of
       the slab, billed as metres of a standard width top. */
    const w = island(barred);
    const slab = benchPieces(barred).find((b) => b.island);
    const byHand = (slab.length * 400) / plain.cfg.benchDepth;

    expect(after - before).toBeCloseTo(byHand, 3);
    expect(after).toBeGreaterThan(before);
    expect(barSpan(w, barred.cfg, islandBar(w))).toBe(w.length);
  });

  it('puts the brackets on the order list and in the total, once', () => {
    const p = withBar('back', 450);
    const clear = rules(p);
    const qty = barBrackets(island(p), p.cfg, clear);
    expect(qty).toBeGreaterThan(0);

    const fittings = allFittings(p);
    const row = fittings.find((f) => f.type === 'barBracket');
    expect(row.qty).toBe(qty);

    const order = orderList(p, PRICES, ORDER_DEPS);
    const line = [...order.board, ...order.hardware, ...order.other]
      .find((r) => /bar bracket/i.test(r.what));
    expect(line.needed).toBe(qty);

    /* The order list and the project total are counting the same brackets. */
    expect(barCost(p, PRICES)).toBe(qty * PRICES.barBracket);
    expect(totals(p).cost - totals(starterProject()).cost)
      .toBeCloseTo(barCost(p, PRICES) + (totals(p).benchCost - totals(starterProject()).benchCost), 6);
  });

  it('buys nothing at all for an overhang that carries itself', () => {
    const p = withBar('back', BAR_RULES.barMaxUnsupported);
    expect(barFittings(p)).toEqual([]);
    expect(barCost(p, PRICES)).toBe(0);
    expect(allFittings(p).some((f) => f.type === 'barBracket')).toBe(false);
  });
});

describe('whether you can sit at it', () => {
  it('counts stools by elbow room, not by stool', () => {
    const p = withBar('back', 350);
    const w = island(p);
    const clear = rules(p);
    // 2400 long at 600 each.
    expect(barSeats(w, p.cfg, clear)).toBe(4);
    expect(barSeats(w, p.cfg, { ...clear, barSeatWidth: 700 })).toBe(3);
  });

  it('counts along the depth for a bar on an end', () => {
    const p = withBar('right', 350);
    const w = island(p);
    expect(barSpan(w, p.cfg, islandBar(w))).toBe(islandDepth(w, p.cfg));
    expect(barSeats(w, p.cfg, rules(p))).toBe(Math.floor(1120 / 600));
  });

  it('wants a bracket at each end and enough between them', () => {
    const p = withBar('back', 500);
    const w = island(p);
    const clear = { ...rules(p), barBracketSpacing: 900 };
    // 2400 at 900 apart is three gaps, so four brackets.
    expect(barBrackets(w, p.cfg, clear)).toBe(4);
    // Never fewer than two, however short it is.
    expect(barBrackets({ ...w, length: 400 }, p.cfg, clear)).toBe(2);
  });
});

describe('the room it takes up', () => {
  it('measures the walkway to the edge of the slab, not to the carcass', () => {
    const plain = starterProject();
    const barred = withBar('front', 400);

    const gapTo = (project) => {
      const entry = floorPlan(project).find((e) => e.island);
      const face = facesOf(entry, project.cfg).find((f) => /front/.test(f.name));
      return face;
    };

    const before = gapTo(plain);
    const after = gapTo(barred);
    // The front face has moved 400 out from the island, toward the wall.
    expect(after.depth).toBe(before.depth - 400);
    expect(after.bar).toBe(true);
  });

  it('narrows the real walkway by exactly the overhang', () => {
    const plain = starterProject();
    const barred = withBar('front', 400);

    const pick = (project) => walkways(project, floorPlan(project))
      .find((w) => /Island, front/.test(w.between.join(' ')));

    expect(pick(plain).gap - pick(barred).gap).toBeCloseTo(400, 6);
    expect(pick(barred).bar).toBe(true);
    expect(pick(plain).bar).toBe(false);
  });

  it('leaves the other side of the island alone', () => {
    const barred = withBar('front', 400);
    const back = walkways(barred, floorPlan(barred))
      .find((w) => /Island, back/.test(w.between.join(' ')));
    const plain = starterProject();
    const wasBack = walkways(plain, floorPlan(plain))
      .find((w) => /Island, back/.test(w.between.join(' ')));
    expect(back.gap).toBe(wasBack.gap);
  });
});

describe('it survives being saved and shared', () => {
  it('opens again from a file', () => {
    const p = withBar('right', 380);
    const back = hydrate({ project: p });
    expect(islandBar(island(back.project))).toMatchObject({ side: 'right', depth: 380 });
  });

  it('travels in a link', () => {
    const p = withBar('back', 320);
    const back = decodeProject(encodeProject(p).replace(/^/, ''));
    expect(islandBar(island(back.project))).toMatchObject({ side: 'back', depth: 320 });
  });

  /* A hand edited file is untrusted input like anything else. */
  it('drops a bar it cannot make sense of rather than opening broken', () => {
    const p = starterProject();
    island(p).bar = { side: 'sideways', depth: 400 };
    expect(island(hydrate({ project: p }).project).bar).toBeUndefined();

    const q = starterProject();
    island(q).bar = { side: 'back', depth: 'wide' };
    expect(island(hydrate({ project: q }).project).bar).toBeUndefined();
  });

  it('carries its own defaults, like every other figure', () => {
    for (const [k, v] of Object.entries(BAR_RULES)) {
      expect(PROJECT[k], k).toBe(v);
    }
  });
});


/* ---------------------------------------------------------------------------
   Part of a side.

   A bar was the whole of one side or nothing, which is not what people build.
   Half of a 2400 island is a bar with two stools at one end and ordinary
   cabinet behind the rest, and saying so used to be impossible: you got a
   2400 overhang, and a bracket count and a stool count for a bar twice the
   size of the one you were making.
   --------------------------------------------------------------------------- */
describe('a bar along part of a side', () => {
  const isl = (bar) => ({ id: 'ISL', name: 'Island', kind: 'island', length: 2400, depth: 1120, bar });

  it('left alone it is the whole side, which is what it always was', () => {
    const wall = isl({ side: 'back', depth: 300 });
    expect(barSpan(wall, PROJECT)).toBe(2400);
    expect(barIsWholeSide(wall, PROJECT)).toBe(true);
    expect(barRange(wall, PROJECT)).toEqual({ from: 0, to: 2400 });
  });

  it('a length makes it part of the side, and it starts where you say', () => {
    const wall = isl({ side: 'back', depth: 300, from: 600, length: 1200 });
    expect(barSpan(wall, PROJECT)).toBe(1200);
    expect(barRange(wall, PROJECT)).toEqual({ from: 600, to: 1800 });
    expect(barIsWholeSide(wall, PROJECT)).toBe(false);
  });

  /* Half the length is half the stools and, past the point it holds itself
     up, half the brackets. Those counts were the whole reason the span had to
     be real rather than assumed. */
  it('the stools and the brackets follow the part, not the side', () => {
    const clear = { ...BAR_RULES, ...PROJECT };
    const whole = isl({ side: 'back', depth: 300 });
    const half = isl({ side: 'back', depth: 300, length: 1200 });

    expect(barSeats(half, PROJECT, clear)).toBeLessThan(barSeats(whole, PROJECT, clear));
    expect(barSeats(half, PROJECT, clear))
      .toBe(Math.floor(1200 / clear.barSeatWidth));
  });

  it('a bar longer than its side is a bar as long as its side', () => {
    const wall = isl({ side: 'back', depth: 300, from: 2000, length: 9000 });
    expect(barSpan(wall, PROJECT)).toBe(400);
    expect(barRange(wall, PROJECT)).toEqual({ from: 2000, to: 2400 });
  });

  it('a start past the end of the island is a bar of nothing', () => {
    const wall = isl({ side: 'back', depth: 300, from: 3000, length: 600 });
    expect(barSpan(wall, PROJECT)).toBe(0);
  });

  it('an end bar is measured along the depth, not the length', () => {
    const wall = isl({ side: 'right', depth: 300, length: 600 });
    expect(barSideLength(wall, PROJECT)).toBe(1120);
    expect(barSpan(wall, PROJECT)).toBe(600);
  });

  it('the span survives a save and a link', () => {
    const p = starterProject();
    island(p).bar = { side: 'back', depth: 300, from: 600, length: 1200 };
    const want = { side: 'back', depth: 300, from: 600, length: 1200 };

    expect(islandBar(island(hydrate({ project: p }).project))).toMatchObject(want);
    expect(islandBar(island(decodeProject(encodeProject(p)).project))).toMatchObject(want);
  });

  /* A file saved before a bar could be part of a side has neither figure, and
     has to open as what it was: a bar along the whole of its side. */
  it('a bar saved before spans existed still opens as the whole side', () => {
    const p = starterProject();
    island(p).bar = { side: 'back', depth: 300 };
    const back = islandBar(island(hydrate({ project: p }).project));

    expect(back.length).toBeNull();
    expect(barSpan(island(p), p.cfg, back)).toBe(island(p).length);
  });
});
