import { describe, expect, it } from 'vitest';
import {
  WALL_KINDS, allParts, firstFreeX, isIsland, islandDepth, layoutFor, roomLayout,
  roomOffsets, roomWallIds, sideOf, starterProject, wallKind,
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
