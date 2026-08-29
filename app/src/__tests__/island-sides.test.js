/* ===========================================================================
   An island has four sides.

   Two of them run along its length and two along its depth, and that one
   difference is the whole of it. Everything else follows from the frame: a
   quarter turn and an origin per side, composed with wherever the island
   stands in the room.

   So the test that matters is the frame itself. If a cabinet on every side
   lands inside the island's footprint with its front facing out of that side,
   the 3D that draws it, the clearance check that measures it and the drawing
   that shows it are all correct by construction, because all three read the
   same table.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  ISLAND_SIDES, barBracketsAll, barSeatsAll, barSpan, benchPieces, firstFreeX,
  floorPlan, frameBox, framePoint, islandBar, islandBars, islandDepth, isIsland,
  cornerTaken, layoutWall, placeOnRun, sideOf, starterProject, unitFrame, uid,
  wallWarnings,
} from '../project.js';
import { carcassBoxes, clearanceFindings, frontBoxes } from '../clearance.js';
import { facesOf, walkways, CLEARANCE_DEFAULTS } from '../checks.js';
import { hydrate } from '../storage.js';
import { decodeProject, encodeProject } from '../share.js';
import { PROJECT, buildUnit } from '../catalog.js';

const L = 2400;
const D = 1120;

const isle = (units = [], bars = null, depth = D) => ({
  id: 'ISL', name: 'Island', kind: 'island', length: L, depth,
  obstacles: [], units, ...(bars ? { bars } : {}),
});

const u = (side, settings = {}) =>
  ({ uid: uid(), familyId: 'base-2door', settings: { width: 600, x: 0, side, ...settings } });

const lay = (wall) => layoutWall(wall, PROJECT);
const probe = (width) => buildUnit('probe', 'base-2door', { width }, PROJECT);

/* ---------------------------------------------------------------------------
   The frame. Everything rests on this.
   --------------------------------------------------------------------------- */

describe('every side puts a cabinet where it belongs', () => {
  const d = PROJECT.baseDepth;

  /* For each side: where the carcass lands in the island's own coordinates,
     and where its front face ends up. The front is the thing that matters,
     because a cabinet facing into the island is a cabinet you cannot open. */
  const cases = [
    ['front', { x0: 300, x1: 900, z0: 0, z1: d }, 'z', 0],
    ['back', { x0: 300, x1: 900, z0: D - d, z1: D }, 'z', D],
    ['left', { x0: 0, x1: d, z0: 300, z1: 900 }, 'x', 0],
    ['right', { x0: L - d, x1: L, z0: 300, z1: 900 }, 'x', L],
  ];

  for (const [side, want, axis, face] of cases) {
    it(`${side}: the carcass lands in the footprint`, () => {
      const p = lay(isle([u(side, { x: 300 })])).placed[0];
      const box = frameBox(unitFrame(p, L, D), 0, p.unit.width, 0, p.unit.depth);

      // +0 rather than Math.round, which hands back a negative zero.
      expect(Math.round(box.x0) + 0, 'x0').toBe(want.x0);
      expect(Math.round(box.x1) + 0, 'x1').toBe(want.x1);
      expect(Math.round(box.z0) + 0, 'z0').toBe(want.z0);
      expect(Math.round(box.z1) + 0, 'z1').toBe(want.z1);
    });

    it(`${side}: the front faces out of that side`, () => {
      const p = lay(isle([u(side, { x: 300 })])).placed[0];
      const frame = unitFrame(p, L, D);

      /* The middle of the cabinet's own front face, which is at its own
         depth, put where it really is. */
      const at = framePoint(frame, p.unit.width / 2, p.unit.depth);
      const got = axis === 'x' ? at[0] : at[1];
      expect(Math.round(got) + 0, `front on the ${side}`).toBe(face);

      // And its back is on the inside, further from that face than its front.
      const back = framePoint(frame, p.unit.width / 2, 0);
      const backOn = axis === 'x' ? back[0] : back[1];
      expect(Math.abs(backOn - face)).toBeCloseTo(p.unit.depth, 6);
    });
  }

  it('never lands anything outside the island footprint', () => {
    for (const s of ISLAND_SIDES) {
      const l = lay(isle([u(s.id, { x: 200 })]));
      const p = l.placed[0];
      const box = frameBox(unitFrame(p, L, D), 0, p.unit.width, 0, p.unit.depth);

      expect(box.x0, `${s.id} x0`).toBeGreaterThanOrEqual(-0.01);
      expect(box.x1, `${s.id} x1`).toBeLessThanOrEqual(L + 0.01);
      expect(box.z0, `${s.id} z0`).toBeGreaterThanOrEqual(-0.01);
      expect(box.z1, `${s.id} z1`).toBeLessThanOrEqual(D + 0.01);
    }
  });

  /* A wall is the same function and has to come back unchanged: no turn, and
     the front at the cabinet's own depth facing into the room. */
  it('a wall is the identity, which is what it always was', () => {
    const p = { x: 800, side: 'front', unit: { width: 600, depth: 560 } };
    const f = unitFrame(p, 0, 0);
    expect(f.rot).toBe(0);
    expect(f.origin).toEqual([800, 0]);
    expect(framePoint(f, 0, 560)).toEqual([800, 560]);
  });
});

/* ---------------------------------------------------------------------------
   The four runs.
   --------------------------------------------------------------------------- */

describe('the four sides are four runs', () => {
  it('each has its own length: the island along, its depth on an end', () => {
    const l = lay(isle());
    expect(l.runOf('front')).toBe(L);
    expect(l.runOf('back')).toBe(L);
    expect(l.runOf('left')).toBe(D);
    expect(l.runOf('right')).toBe(D);
  });

  it('they fill independently', () => {
    const l = lay(isle([u('front', { width: L })]));
    expect(firstFreeX(l, probe(600), 600, 'front')).toBeNull();
    // The back is untouched. The ends start after the front run's depth,
    // because that is what a cabinet on an end butts against.
    expect(firstFreeX(l, probe(600), 600, 'back')).toBe(0);
    for (const side of ['left', 'right']) {
      expect(firstFreeX(l, probe(400), 400, side), side).toBe(PROJECT.baseDepth);
    }
  });

  it('a cabinet flows along its own side, not along the island', () => {
    const l = lay(isle([
      { uid: 'a', familyId: 'base-2door', settings: { width: 600, side: 'left' } },
      { uid: 'b', familyId: 'base-2door', settings: { width: 400, side: 'left' } },
      { uid: 'c', familyId: 'base-2door', settings: { width: 900, side: 'right' } },
    ]));
    const at = (id) => l.placed.find((p) => p.item.uid === id).x;
    expect(at('a')).toBe(0);
    expect(at('b')).toBe(600);
    // The right end starts again from nothing.
    expect(at('c')).toBe(0);
  });

  /* Round the island, onto whichever side still has room. On an island deep
     enough for it, that is an end; on a shallow one the ends are the exposed
     side panels of the long runs and there is nowhere left, which the next
     block is about. */
  it('adding one goes round the island rather than nowhere', () => {
    const deep = isle([u('front', { width: L }), u('back', { width: L })], null, 1800);
    const { x, side } = placeOnRun(lay(deep), probe(600), 600, 'front');
    expect(['left', 'right']).toContain(side);
    expect(x).toBe(PROJECT.baseDepth);
  });

  it('past the end of an END is measured against the depth', () => {
    const l = lay(isle([u('left', { width: 1600 })]));
    const warns = wallWarnings(l, null).map((w) => w.text).join(' ');
    // 1600 on a 1120 deep end is 480 too long, and it says which side.
    expect(warns).toMatch(/left end/i);
  });

  it('a gap on one side is not a gap on another', () => {
    const l = lay(isle([u('front', { width: L }), u('left', { width: 400 })]));
    const texts = wallWarnings(l, null).map((w) => w.text);

    expect(texts.some((t) => /left end/.test(t))).toBe(true);
    expect(texts.some((t) => /on the front/.test(t))).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   In the room.
   --------------------------------------------------------------------------- */

describe('an island in the room', () => {
  const project = () => {
    const p = starterProject();
    const isl = p.walls.find(isIsland);
    isl.length = L;
    isl.depth = D;
    isl.units = ISLAND_SIDES.map((s) => u(s.id, { x: 200 }));
    return p;
  };

  it('every side ends up somewhere different', () => {
    const entry = floorPlan(project()).find((e) => e.island);
    const boxes = carcassBoxes([entry]);
    expect(boxes).toHaveLength(4);

    const key = (b) => `${Math.round(b.x0)},${Math.round(b.z0)}`;
    expect(new Set(boxes.map(key)).size).toBe(4);
  });

  /* Clear of the corners, nothing touches. The corners themselves are a real
     clash and the next test is about those. */
  it('cabinets clear of the corners never touch each other', () => {
    const p = starterProject();
    const isl = p.walls.find(isIsland);
    isl.length = L;
    isl.depth = D;
    isl.units = [
      u('front', { x: 700 }), u('back', { x: 700 }),
      u('left', { x: 300 }), u('right', { x: 300 }),
    ];

    const boxes = carcassBoxes([floorPlan(p).find((e) => e.island)]);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart = a.x1 <= b.x0 + 0.01 || b.x1 <= a.x0 + 0.01
          || a.z1 <= b.z0 + 0.01 || b.z1 <= a.z0 + 0.01;
        expect(apart, `${a.side} and ${b.side}`).toBe(true);
      }
    }
  });

  /* An island has four inside corners of its own, and two cabinets running
     into the same one are built through each other exactly the way two runs
     meeting at a wall corner are. It is the same fault and it is found by the
     same check, which is what putting every side in one set of coordinates
     was for. */
  it('two cabinets running into the same corner are reported', () => {
    const p = starterProject();
    const isl = p.walls.find(isIsland);
    isl.length = L;
    isl.depth = D;
    isl.units = [u('front', { x: 0 }), u('left', { x: 0 })];

    const found = clearanceFindings(floorPlan(p), { ...CLEARANCE_DEFAULTS, ...PROJECT });
    expect(found.some((f) => f.level === 'error')).toBe(true);
  });

  it('every front stands just outside the side it belongs to', () => {
    const entry = floorPlan(project()).find((e) => e.island);
    const [ox, oz] = entry.origin;
    for (const f of frontBoxes([entry])) {
      const local = { x0: f.x0 - ox, x1: f.x1 - ox, z0: f.z0 - oz, z1: f.z1 - oz };
      const out = local.x0 < 0 || local.x1 > L || local.z0 < 0 || local.z1 > D;
      expect(out, `${f.label} is inside the island`).toBe(true);
    }
  });

  it('presents four faces to the room, not two', () => {
    const entry = floorPlan(project()).find((e) => e.island);
    const faces = facesOf(entry, PROJECT);
    expect(faces).toHaveLength(4);
    expect(faces.map((f) => f.side).sort())
      .toEqual(['back', 'front', 'left', 'right']);
  });
});

/* ---------------------------------------------------------------------------
   Bars on any side, and on more than one.
   --------------------------------------------------------------------------- */

describe('a bar on any side, and on several', () => {
  const withBars = (bars) => {
    const p = starterProject();
    const isl = p.walls.find(isIsland);
    isl.length = L;
    isl.depth = D;
    delete isl.bar;
    isl.bars = bars;
    return p;
  };
  const clear = { ...CLEARANCE_DEFAULTS, ...PROJECT };

  it('reads a list', () => {
    const isl = isle([], [{ side: 'back', depth: 300 }, { side: 'left', depth: 250 }]);
    expect(islandBars(isl).map((b) => b.side)).toEqual(['back', 'left']);
  });

  it('one bar per side, however many are written down', () => {
    const isl = isle([], [{ side: 'back', depth: 300 }, { side: 'back', depth: 400 }]);
    expect(islandBars(isl)).toHaveLength(1);
    expect(islandBars(isl)[0].depth).toBe(300);
  });

  it('a project with one bar opens as a list of one', () => {
    const isl = { id: 'ISL', kind: 'island', length: L, depth: D, bar: { side: 'back', depth: 300 } };
    expect(islandBars(isl)).toHaveLength(1);
    expect(islandBar(isl).side).toBe('back');
  });

  it('the stools and the brackets count every bar', () => {
    const one = withBars([{ side: 'back', depth: 300 }]);
    const two = withBars([{ side: 'back', depth: 300 }, { side: 'right', depth: 300 }]);
    const isl = (p) => p.walls.find(isIsland);

    expect(barSeatsAll(isl(two), two.cfg, clear))
      .toBe(barSeatsAll(isl(one), one.cfg, clear)
        + Math.floor(D / clear.barSeatWidth));

    const deep = withBars([
      { side: 'back', depth: 700 }, { side: 'right', depth: 700 },
    ]);
    expect(barBracketsAll(isl(deep), deep.cfg, clear))
      .toBeGreaterThan(barBracketsAll(isl(one), one.cfg, clear));
  });

  it('the slab grows on every side a bar runs the whole of', () => {
    const plain = benchPieces(withBars([])).find((b) => b.island);
    const both = benchPieces(withBars([
      { side: 'back', depth: 300 }, { side: 'right', depth: 200 },
    ])).find((b) => b.island);

    expect(both.depth).toBe(plain.depth + 300);
    expect(both.length).toBe(plain.length + 200);
  });

  it('a bar along part of a side is its own rectangle, beside the slab', () => {
    const pieces = benchPieces(withBars([
      { side: 'back', depth: 300, from: 300, length: 1200 },
      { side: 'left', depth: 250 },
    ])).filter((b) => b.wallId === 'ISL');

    const strip = pieces.find((b) => b.barPiece);
    expect(strip).toBeDefined();
    expect(strip.length).toBe(1200);
    expect(strip.depth).toBe(300);

    // And the slab itself only grew on the side whose bar runs all of it.
    const slab = pieces.find((b) => !b.barPiece);
    const plain = benchPieces(withBars([])).find((b) => b.island);
    expect(slab.depth).toBe(plain.depth);
    expect(slab.length).toBe(plain.length + 250);
  });

  it('every bar is a face you walk into', () => {
    const entry = floorPlan(withBars([
      { side: 'back', depth: 300 }, { side: 'left', depth: 250 },
    ])).find((e) => e.island);

    const faces = facesOf(entry, PROJECT);
    expect(faces.filter((f) => f.bar).map((f) => f.side).sort()).toEqual(['back', 'left']);
  });

  it('survives a save and a link', () => {
    const p = withBars([
      { side: 'back', depth: 300, from: 600, length: 1200 },
      { side: 'right', depth: 250 },
    ]);
    const want = [
      { side: 'back', depth: 300, from: 600, length: 1200 },
      { side: 'right', depth: 250 },
    ];

    const saved = islandBars(hydrate({ project: p }).project.walls.find(isIsland));
    expect(saved).toMatchObject(want);

    const linked = islandBars(decodeProject(encodeProject(p)).project.walls.find(isIsland));
    expect(linked).toMatchObject(want);
  });
});

/* ---------------------------------------------------------------------------
   And the cabinets on four sides survive a save.
   --------------------------------------------------------------------------- */

describe('four sides of cabinets survive a save and a link', () => {
  const project = () => {
    const p = starterProject();
    const isl = p.walls.find(isIsland);
    isl.units = ISLAND_SIDES.map((s) => u(s.id));
    return p;
  };

  it('every side comes back as the side it was on', () => {
    const sides = (proj) => proj.walls.find(isIsland).units.map(sideOf);

    expect(sides(hydrate({ project: project() }).project))
      .toEqual(['front', 'back', 'left', 'right']);
    expect(sides(decodeProject(encodeProject(project())).project))
      .toEqual(['front', 'back', 'left', 'right']);
  });
});


/* ---------------------------------------------------------------------------
   The corners of the island itself.

   A cabinet on an end butts against the ends of the front and back runs, so
   what an end really has is the island's depth less however deep those two
   are. On a 1120 island with 560 cabinets front and back that is nothing at
   all, and it is not a mistake: the ends of such an island are the exposed
   side panels of the long runs.

   That is how a real island is built, and it is the difference between four
   sides you can use and four sides that drop every cabinet straight into a
   corner which is already full.
   --------------------------------------------------------------------------- */
describe('the sides take one another\'s corners', () => {
  const full = (depth) => lay(isle([
    { uid: 'f', familyId: 'base-2door', settings: { width: L, x: 0, side: 'front' } },
    { uid: 'b', familyId: 'base-2door', settings: { width: L, x: 0, side: 'back' } },
  ], null, depth));

  it('an end of a shallow island has no room on it at all', () => {
    expect(firstFreeX(full(1120), probe(600), 600, 'left')).toBeNull();
    expect(firstFreeX(full(1120), probe(600), 600, 'right')).toBeNull();
  });

  it('a deeper island leaves room between the two runs', () => {
    // 1800 deep, 560 front and 560 back, so 680 in the middle of each end.
    expect(firstFreeX(full(1800), probe(600), 600, 'left')).toBe(560);
    expect(firstFreeX(full(1800), probe(700), 700, 'left')).toBeNull();
  });

  it('one long side left short leaves the ends usable', () => {
    const l = lay(isle([
      { uid: 'f', familyId: 'base-2door', settings: { width: L, x: 0, side: 'front' } },
    ]));
    expect(firstFreeX(l, probe(400), 400, 'left')).toBe(560);
  });

  it('says so rather than leaving you to look for the room', () => {
    const texts = wallWarnings(full(1120), null).map((w) => w.text).join(' ');
    expect(texts).toMatch(/left end has no room/i);
    expect(texts).toMatch(/right end has no room/i);
  });

  it('an empty island has no corners taken', () => {
    expect(cornerTaken(lay(isle()), 'left')).toEqual([]);
    expect(cornerTaken(lay(isle()), 'front')).toEqual([]);
  });

  it('a wall has no corners of its own to take', () => {
    const l = layoutWall({ id: 'A', name: 'A', length: 3000, obstacles: [], units: [] }, PROJECT);
    expect(cornerTaken(l, 'front')).toEqual([]);
  });
});
