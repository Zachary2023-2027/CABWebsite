import { describe, expect, it } from 'vitest';
import {
  WALL_KINDS, allParts, firstFreeX, isIsland, islandDepth, layoutFor, placeOnRun,
  roomLayout, roomOffsets, roomWallIds, sideOf, starterProject, wallKind,
} from '../project.js';
import { hydrate } from '../storage.js';
import { decodeProject, encodeProject } from '../share.js';
import { PROJECT, buildUnit } from '../catalog.js';

const island = (p) => p.walls.find((w) => isIsland(w));
const lay = (p, w) => layoutFor(p, w, roomOffsets(p));

/* An island was a wall with the id ISL, filtered out of the room by name.
   That is why it behaved like a wall: it took the room's depth, it had one
   side, and its backs were drawn against nothing. */
describe('an island is a kind of thing, not a name', () => {
  it('knows what it is from its kind', () => {
    expect(wallKind({ kind: 'island' })).toBe('island');
    expect(wallKind({ kind: 'wall' })).toBe('wall');
    expect(wallKind({})).toBe('wall');
    expect(wallKind(null)).toBe('wall');
  });

  it('still recognises the old wall called ISL, so old projects open right', () => {
    expect(wallKind({ id: 'ISL' })).toBe('island');
  });

  it('a wall named Island is a wall, because the name is not the thing', () => {
    expect(wallKind({ id: 'B', name: 'Island', kind: 'wall' })).toBe('wall');
  });

  it('every kind offered is one the model understands', () => {
    for (const k of WALL_KINDS) expect(['wall', 'island']).toContain(k.id);
  });

  /* Filtering on the id meant a second island, or one you renamed, joined the
     room and turned a corner. */
  it('is never part of the joined room run', () => {
    const p = starterProject();
    p.room = 'u';
    expect(roomWallIds(p)).not.toContain(island(p).id);

    // Even a second one, which the old id test would have let in.
    p.walls.push({ id: 'ISL2', name: 'Island 2', kind: 'island', length: 2000, obstacles: [], units: [] });
    expect(roomWallIds(p)).not.toContain('ISL2');
  });

  it('has a depth of its own rather than a cabinet depth', () => {
    const p = starterProject();
    expect(islandDepth(island(p), p.cfg)).toBe(1120);
    // Unset, it is deep enough for cabinets back to back.
    expect(islandDepth({ kind: 'island' }, p.cfg)).toBe(p.cfg.baseDepth * 2);
  });

  it('a nonsense depth falls back rather than drawing nothing', () => {
    for (const bad of [0, -100, null, 'deep']) {
      expect(islandDepth({ depth: bad }, PROJECT)).toBeGreaterThan(0);
    }
  });
});

describe('two sides, laid out independently', () => {
  const p = starterProject();
  const l = lay(p, island(p));

  it('reports which side every cabinet is on', () => {
    expect(l.front.length).toBeGreaterThan(0);
    expect(l.back.length).toBeGreaterThan(0);
    expect(l.front.length + l.back.length).toBe(l.placed.length);
  });

  /* A cabinet on the back does not push one on the front along. Sharing one
     cursor made the second side start where the first one finished, so an
     island came out twice as long as it is. */
  it('both sides start at the beginning', () => {
    expect(Math.min(...l.front.map((q) => q.x))).toBe(0);
    expect(Math.min(...l.back.map((q) => q.x))).toBe(0);
  });

  it('neither side runs past the island', () => {
    for (const side of [l.front, l.back]) {
      const end = Math.max(...side.map((q) => q.x + q.unit.width));
      expect(end).toBeLessThanOrEqual(island(p).length);
    }
  });

  it('the run reported is the longer of the two sides', () => {
    const longest = Math.max(
      ...l.front.map((q) => q.x + q.unit.width),
      ...l.back.map((q) => q.x + q.unit.width),
    );
    expect(l.run).toBe(longest);
  });

  it('a wall has everything on its one side', () => {
    const wall = p.walls.find((w) => !isIsland(w) && w.units.length);
    const wl = lay(p, wall);
    expect(wl.island).toBe(false);
    expect(wl.back).toHaveLength(0);
    expect(wl.front).toHaveLength(wl.placed.length);
  });

  it('sideOf reads the setting, and only back means anything', () => {
    expect(sideOf({ settings: { side: 'back' } })).toBe('back');
    expect(sideOf({ settings: { side: 'front' } })).toBe('front');
    expect(sideOf({ settings: {} })).toBe('front');
    expect(sideOf({})).toBe('front');
  });
});

/* Looking at both sides finds the island full when the side you are adding to
   is empty. */
describe('finding room on one side', () => {
  const p = starterProject();
  const l = lay(p, island(p));
  const probe = buildUnit('probe', 'base-2door', { width: 600 }, p.cfg);

  it('an empty side has room even when the other one is full', () => {
    const p2 = starterProject();
    const isl = island(p2);
    // Fill the front completely, leave the back empty.
    isl.units = [{ uid: 'a', familyId: 'base-2door', settings: { width: isl.length } }];
    const l2 = lay(p2, isl);

    expect(firstFreeX(l2, probe, 600, 'front')).toBeNull();
    expect(firstFreeX(l2, probe, 600, 'back')).toBe(0);
  });

  it('a full side has no room', () => {
    expect(firstFreeX(l, probe, 2000, 'front')).toBeNull();
  });

  it('a wall behaves as it always did', () => {
    const wall = p.walls.find((w) => !isIsland(w) && w.units.length);
    const wl = lay(p, wall);
    expect(firstFreeX(wl, probe, 600)).toBe(firstFreeX(wl, probe, 600, 'front'));
  });
});

describe('an island survives being saved and sent', () => {
  it('keeps its kind, its depth and which side each cabinet is on', () => {
    const p = starterProject();
    const h = hydrate({
      schema: 3, id: 'x', savedAt: 1, cut: [], prices: {}, quoted: '',
      project: p, name: p.name,
    });
    const isl = island(h.project);

    expect(isl.kind).toBe('island');
    expect(isl.depth).toBe(1120);
    expect(isl.units.filter((u) => u.settings.side === 'back')).toHaveLength(2);
  });

  it('through a link as well', () => {
    const p = starterProject();
    const h = hydrate({
      schema: 3, id: 'x', savedAt: 1, cut: [], prices: {}, quoted: '',
      ...decodeProject(encodeProject(p)),
    });
    const isl = island(h.project);

    expect(isl.kind).toBe('island');
    expect(isl.depth).toBe(1120);
    expect(isl.units.filter((u) => u.settings.side === 'back')).toHaveLength(2);
  });

  it('an old project whose island was a wall called ISL opens as an island', () => {
    const h = hydrate({
      schema: 2, id: 'x', savedAt: 1, cut: [], prices: {}, quoted: '',
      project: {
        name: 'k', room: 'straight', activeWall: 'A', cfg: {},
        walls: [
          { id: 'A', name: 'Wall A', length: 3600, units: [] },
          { id: 'ISL', name: 'Island', length: 2400, units: [] },
        ],
      },
    });
    expect(h.project.walls[1].kind).toBe('island');
    expect(roomWallIds(h.project)).toEqual(['A']);
  });

  it('a nonsense side is dropped rather than trusted', () => {
    const p = starterProject();
    island(p).units[0].settings.side = 'sideways';
    const h = hydrate({
      schema: 3, id: 'x', savedAt: 1, cut: [], prices: {}, quoted: '',
      project: p, name: p.name,
    });
    expect(island(h.project).units[0].settings.side).toBeUndefined();
  });
});

describe('the rest of the app still adds up with an island in it', () => {
  const p = starterProject();

  it('every cabinet on both sides reaches the part list', () => {
    const isl = island(p);
    const ids = new Set(isl.units.map((u) => u.uid));
    const parts = allParts(p).filter((x) => ids.has(x.unitId));
    expect(new Set(parts.map((x) => x.unitId)).size).toBe(isl.units.length);
  });

  it('part keys stay unique across both sides', () => {
    const keys = allParts(p).map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the room layout leaves the island out of the joined run', () => {
    p.room = 'u';
    expect(roomLayout(p).some((r) => isIsland(r.wall))).toBe(false);
  });
});


/* An island has a second side, so a full one is not the end of it. This is
   the same idea as a cabinet carrying on around a corner when its wall runs
   out: keep filling the thing you are working on rather than stacking
   cabinets past its end. */
describe('a full side spills onto the other one', () => {
  const probe = (width) => buildUnit('probe', 'base-2door', { width }, PROJECT);

  /* The rule itself, not a copy of it. Writing the planner's logic out again
     here is how a test passes while the screen does something else: the first
     version of this test had its own copy that tried the back of a wall, which
     the real code never does. */
  const placeOn = (l, unit, width, want) => placeOnRun(l, unit, width, want);

  const island3600 = (units) => {
    const p = starterProject();
    const isl = island(p);
    isl.length = 3600;
    isl.units = units;
    return { p, isl };
  };

  it('four 900s fill the front, then the fifth goes on the back', () => {
    const units = [];
    const p = starterProject();
    const isl = island(p);
    isl.length = 3600;
    isl.units = units;

    const sides = [];
    for (let i = 0; i < 8; i++) {
      const l = lay(p, isl);
      const { x, side } = placeOn(l, probe(900), 900, 'front');
      sides.push(side);
      units.push({ uid: `u${i}`, familyId: 'base-2door', settings: { width: 900, ...(x === null ? {} : { x }), ...(side === 'back' ? { side: 'back' } : {}) } });
    }

    expect(sides.slice(0, 4)).toEqual(['front', 'front', 'front', 'front']);
    expect(sides.slice(4)).toEqual(['back', 'back', 'back', 'back']);
  });

  it('spills the other way too, from the back to the front', () => {
    const { p, isl } = island3600([
      { uid: 'b1', familyId: 'base-2door', settings: { width: 3600, x: 0, side: 'back' } },
    ]);
    const { side } = placeOn(lay(p, isl), probe(600), 600, 'back');
    expect(side).toBe('front');
  });

  /* An island has four faces, not two. A full front is not a full island:
     there are two ends on it, each as long as the island is deep, and a
     cabinet goes on one of them before it goes nowhere. */
  /* Onto an end, if the island is deep enough to have one. A cabinet on an
     end butts against the ends of the long runs, so a 1120 island with 560
     cabinets front and back has nothing left on its ends at all. */
  it('spills round to an end once the long sides are full', () => {
    const { p, isl } = island3600([
      { uid: 'f1', familyId: 'base-2door', settings: { width: 3600, x: 0 } },
      { uid: 'b1', familyId: 'base-2door', settings: { width: 3600, x: 0, side: 'back' } },
    ]);
    isl.depth = 1800;
    const { x, side } = placeOn(lay(p, isl), probe(600), 600, 'front');
    expect(['left', 'right']).toContain(side);
    expect(x).toBe(PROJECT.baseDepth);
  });

  it('when all four are full it stays where you put it', () => {
    const { p, isl } = island3600([
      { uid: 'f1', familyId: 'base-2door', settings: { width: 3600, x: 0 } },
      { uid: 'b1', familyId: 'base-2door', settings: { width: 3600, x: 0, side: 'back' } },
      { uid: 'l1', familyId: 'base-2door', settings: { width: 1120, x: 0, side: 'left' } },
      { uid: 'r1', familyId: 'base-2door', settings: { width: 1120, x: 0, side: 'right' } },
    ]);
    const { x, side } = placeOn(lay(p, isl), probe(600), 600, 'front');
    expect(x).toBeNull();
    expect(side).toBe('front');
  });

  /* An end runs along the island's depth, not its length. Measuring it the
     other way says a 600 cabinet on a 1120 deep end has 3600mm of room. */
  it('an end is as long as the island is deep', () => {
    const { p, isl } = island3600([]);
    const l = lay(p, isl);

    expect(l.runOf('front')).toBe(3600);
    expect(l.runOf('back')).toBe(3600);
    expect(l.runOf('left')).toBe(islandDepth(isl, p.cfg));
    expect(l.runOf('right')).toBe(islandDepth(isl, p.cfg));

    // And nothing longer than the depth fits on an end.
    expect(firstFreeX(l, probe(3600), 3600, 'left')).toBeNull();
    expect(firstFreeX(l, probe(600), 600, 'left')).toBe(0);
  });

  it('the four sides fill independently', () => {
    const { p, isl } = island3600([
      { uid: 'f1', familyId: 'base-2door', settings: { width: 3600, x: 0 } },
    ]);
    const l = lay(p, isl);

    expect(firstFreeX(l, probe(600), 600, 'front')).toBeNull();
    expect(firstFreeX(l, probe(600), 600, 'back')).toBe(0);
    // The ends start clear of the front run they butt against.
    for (const side of ['left', 'right']) {
      expect(firstFreeX(l, probe(400), 400, side), side).toBe(PROJECT.baseDepth);
    }
  });

  it('a wall has nowhere to spill to, so a full one stays full', () => {
    const p = starterProject();
    const w = p.walls.find((q) => !isIsland(q));
    w.units = [{ uid: 'f', familyId: 'base-2door', settings: { width: w.length, x: 0 } }];
    const l = lay(p, w);

    expect(l.island).toBe(false);
    const got = placeOn(l, probe(600), 600, 'front');
    expect(got.x).toBeNull();
    expect(got.side).toBe('front');
  });
});
