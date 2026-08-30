import { describe, expect, it } from 'vitest';
import {
  PLAN, barOverhangs, barStrips, gapArrows, gapLevel, islandExtent, missingFromPlan, planBounds,
  planBoxes, planWalls, snapIsland, snapsOn,
} from '../floor.js';
import { CLEARANCE_DEFAULTS } from '../checks.js';
import { PROJECT } from '../catalog.js';
import { floorPlan, islandAt, starterProject } from '../project.js';

const project = starterProject();
const island = project.walls.find((w) => w.kind === 'island');

/* A plan of a room with an island in it, built from the parts the app really
   uses rather than from a fixture, so a change to the model shows up here. */
const withIsland = (patch = {}, cfg = {}) => ({
  ...project,
  cfg: { ...project.cfg, ...cfg },
  walls: project.walls.map((w) => (w.id === island.id ? { ...w, ...patch } : w)),
});

describe('what is on the floor', () => {
  it('every carcass in the room lands as a rectangle', () => {
    const boxes = planBoxes(floorPlan(project));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x1, b.label).toBeGreaterThan(b.x0);
      expect(b.z1, b.label).toBeGreaterThan(b.z0);
      expect(b.wallId).toBeTruthy();
    }
  });

  it('a wall cabinet is on the plan too, marked as being over your head', () => {
    const boxes = planBoxes(floorPlan(project));
    const above = boxes.filter((b) => b.where === 'wall');
    expect(above.length).toBeGreaterThan(0);
  });

  it('the room walls stand behind the runs, not in them', () => {
    const entries = floorPlan(project);
    const walls = planWalls(entries);
    expect(walls.length).toBe(entries.filter((e) => !e.island).length);
    for (const w of walls) {
      expect(Math.round((w.x1 - w.x0) + (w.z1 - w.z0)))
        .toBe(Math.round(w.length + PLAN.wallThk));
    }
  });

  it('an island is not a wall, so it gets no wall drawn behind it', () => {
    const ids = planWalls(floorPlan(project)).map((w) => w.id);
    expect(ids).not.toContain(island.id);
  });
});

/* ---------------------------------------------------------------------------
   The island's footprint.

   The carcass stops where it stops and the top runs on past it. It is the top
   you walk into, so a footprint that stopped at the carcass reported floor
   that is actually over somebody's knees.
   --------------------------------------------------------------------------- */
describe('how much floor an island takes', () => {
  it('with no bar it is the carcass', () => {
    const p = withIsland({ bars: [] });
    const w = p.walls.find((x) => x.id === island.id);
    const ext = islandExtent(w, p.cfg);
    const at = islandAt(w, p.cfg);
    expect(ext.x0).toBe(at.x);
    expect(ext.x1).toBe(at.x + w.length);
  });

  it('a bar on the back pushes the footprint out behind it', () => {
    const p = withIsland({ bars: [{ side: 'back', depth: 300, from: 0, length: null }] });
    const w = p.walls.find((x) => x.id === island.id);
    const plain = islandExtent({ ...w, bars: [] }, p.cfg);
    const ext = islandExtent(w, p.cfg);
    expect(ext.z1 - plain.z1).toBe(300);
    expect(ext.z0).toBe(plain.z0);
  });

  it('a bar on each of the four sides pushes all four out', () => {
    const bars = ['front', 'back', 'left', 'right']
      .map((side) => ({ side, depth: 300, from: 0, length: null }));
    const p = withIsland({ bars });
    const w = p.walls.find((x) => x.id === island.id);
    expect(barOverhangs(w, p.cfg)).toEqual({ front: 300, back: 300, left: 300, right: 300 });
    const ext = islandExtent(w, p.cfg);
    expect(ext.x1 - ext.x0).toBe(w.length + 600);
    expect(ext.z1 - ext.z0).toBe(ext.depth + 600);
  });

  it('a bar along half a side is drawn along half of it', () => {
    const p = withIsland({ bars: [{ side: 'front', depth: 300, from: 0, length: 1200 }] });
    const w = p.walls.find((x) => x.id === island.id);
    const [strip] = barStrips(w, p.cfg);
    expect(strip.x1 - strip.x0).toBe(1200);
    expect(strip.z1 - strip.z0).toBe(300);
  });

  it('a bar longer than its side is clipped, the way it is priced', () => {
    const p = withIsland({ bars: [{ side: 'left', depth: 300, from: 0, length: 99000 }] });
    const w = p.walls.find((x) => x.id === island.id);
    const [strip] = barStrips(w, p.cfg);
    const ext = islandExtent(w, p.cfg);
    expect(strip.z1 - strip.z0).toBeCloseTo(ext.depth, 6);
  });
});

/* ---------------------------------------------------------------------------
   The gaps.
   --------------------------------------------------------------------------- */
describe('the gaps around an island', () => {
  const clear = { ...CLEARANCE_DEFAULTS, ...PROJECT };

  it('says the same thing the checks do about how much a gap matters', () => {
    expect(gapLevel(clear.walkwayMin - 1, false, clear)).toBe('error');
    expect(gapLevel(clear.walkwayMin + 1, false, clear)).toBe('warn');
    expect(gapLevel(clear.walkwayComfortable + 1, false, clear)).toBe('ok');
  });

  it('a gap somebody sits in has to take a stool as well', () => {
    /* Only when the stool space is set wider than a walkway, which is what a
       kitchen with stools in it is for. Left at the default it is narrower
       than a walkway and never decides anything. */
    const sitting = { ...clear, barStoolSpace: 1400 };
    const wide = sitting.walkwayComfortable + 1;
    expect(gapLevel(wide, false, sitting)).toBe('ok');
    expect(gapLevel(wide, true, sitting)).toBe('warn');
  });

  it('every arrow is drawn along one axis and closes on its own number', () => {
    const entries = floorPlan(project);
    const arrows = gapArrows(entries, project.cfg, island.id);
    expect(arrows.length).toBeGreaterThan(0);
    for (const g of arrows) {
      expect(['x', 'z']).toContain(g.axis);
      expect(Math.abs(g.to - g.from)).toBeCloseTo(g.gap, 0);
    }
  });

  it('moving the island changes the gap by exactly what it moved', () => {
    const at = islandAt(island, project.cfg);
    const before = gapArrows(floorPlan(project), project.cfg, island.id);
    const after = gapArrows(
      floorPlan(withIsland({ at: { ...at, y: at.y + 100 } })), project.cfg, island.id);

    const front = (list) => list.find((g) => g.axis === 'z' && g.between[0].includes('front'));
    expect(front(before)).toBeTruthy();
    expect(front(after).gap - front(before).gap).toBeCloseTo(100, 0);
  });

  it('the same gap is not drawn twice because two cabinets face it', () => {
    const arrows = gapArrows(floorPlan(project), project.cfg, island.id);
    const keys = arrows.map((g) => `${g.axis}|${Math.round(g.to)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /* Both sides of an island are parallel to the wall in front of it, so both
     report a gap: the walkway, and the walkway with the island added to it.
     The second is a line drawn straight through the cabinets. */
  it('measures to the near side of the island, not through it', () => {
    const p = withIsland({ at: { x: 800, y: 1800 } });
    const w = p.walls.find((x) => x.id === island.id);
    const ext = islandExtent(w, p.cfg);
    const arrows = gapArrows(floorPlan(p), p.cfg, island.id);

    for (const g of arrows.filter((x) => x.axis === 'z')) {
      const passes = Math.min(g.from, g.to) < ext.z1 - 0.5
        && Math.max(g.from, g.to) > ext.z0 + 0.5;
      expect(passes, `${g.gap} between ${g.between.join(' and ')}`).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------------------
   Dragging it.

   The point of a snap is that you land on a number somebody chose. Landing on
   1187mm of walkway is what dragging without one gives you.
   --------------------------------------------------------------------------- */
describe('where an island lands', () => {
  const entries = () => floorPlan(project);

  it('a drag that is nowhere near anything just rounds', () => {
    const got = snapIsland(entries(), island, project.cfg, { x: 803.7, y: 6000 });
    expect(got.x % PLAN.grid).toBe(0);
    expect(got.hits.filter((h) => h.axis === 'z')).toHaveLength(0);
  });

  it('a drag near a comfortable walkway takes it exactly', () => {
    const cfg = project.cfg;
    const clear = { ...CLEARANCE_DEFAULTS, ...cfg };
    /* The back wall's cabinets stand out into the room; a walkway past them
       is where the island's front should land. */
    const want = clear.walkwayMin + cfg.baseDepth;
    const got = snapIsland(entries(), island, cfg, { x: 800, y: want + 40 });
    expect(got.y).toBeCloseTo(want, 0);
    expect(got.hits.some((h) => h.axis === 'z')).toBe(true);
  });

  it('what it locked on to is said, not left to be noticed', () => {
    const cfg = project.cfg;
    const clear = { ...CLEARANCE_DEFAULTS, ...cfg };
    const want = clear.walkwayComfortable + cfg.baseDepth;
    const got = snapIsland(entries(), island, cfg, { x: 800, y: want - 30 });
    expect(got.hits.map((h) => h.why).join()).toContain(String(clear.walkwayComfortable));
  });

  it('the snap is about the top, so a bar on the front holds the island back', () => {
    const cfg = project.cfg;
    const clear = { ...CLEARANCE_DEFAULTS, ...cfg };
    const p = withIsland({ bars: [{ side: 'front', depth: 300, from: 0, length: null }] });
    const w = p.walls.find((x) => x.id === island.id);
    const want = clear.walkwayMin + cfg.baseDepth;

    const got = snapIsland(floorPlan(p), w, cfg, { x: 800, y: want + 300 + 40 });
    /* The carcass sits 300 further back than it would with no bar, because it
       is the bar edge that has to clear the walkway. */
    expect(got.y).toBeCloseTo(want + 300, 0);
  });

  it('never goes negative, however far you drag it off the plan', () => {
    const got = snapIsland(entries(), island, project.cfg, { x: -9000, y: -9000 });
    expect(got.x).toBeGreaterThanOrEqual(0);
    expect(got.y).toBeGreaterThanOrEqual(0);
  });

  it('centring between two runs is one of the places it stops', () => {
    const clear = { ...CLEARANCE_DEFAULTS, ...PROJECT };
    const faces = [
      { a: [0, 0], b: [4000, 0] },
      { a: [0, 4000], b: [4000, 4000] },
    ];
    const stops = snapsOn(faces, 'z', 1000, clear);
    const centre = stops.find((s) => s.why === 'centred');
    expect(centre.v).toBe(1500);
  });
});

describe('the page it goes on', () => {
  it('fits everything with room for the dimensions', () => {
    const boxes = planBoxes(floorPlan(project));
    const b = planBounds(boxes, PLAN.pad);
    expect(b.x0).toBeLessThan(Math.min(...boxes.map((x) => x.x0)));
    expect(b.x1).toBeGreaterThan(Math.max(...boxes.map((x) => x.x1)));
    expect(b.w).toBe(b.x1 - b.x0);
    expect(b.h).toBe(b.z1 - b.z0);
  });

  it('an empty floor still draws as something', () => {
    const b = planBounds([]);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  });
});


/* ---------------------------------------------------------------------------
   What the plan cannot draw.

   A room shape says how many walls join at a corner. Anything past that is a
   wall the model has no position for, and a plan that quietly leaves a run of
   cabinets out is worse than one that says it has.
   --------------------------------------------------------------------------- */
describe('the walls that are not in the room', () => {
  it('names a wall the room shape has no place for', () => {
    const straight = { ...project, room: 'straight' };
    const missing = missingFromPlan(straight, floorPlan(straight));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((w) => w.kind !== 'island')).toBe(true);
  });

  it('an island is never missing, because it stands where it stands', () => {
    const straight = { ...project, room: 'straight' };
    const ids = missingFromPlan(straight, floorPlan(straight)).map((w) => w.id);
    expect(ids).not.toContain(island.id);
  });

  it('nothing is missing when every wall is in the room shape', () => {
    const two = { ...project, room: 'l', walls: project.walls.filter(
      (w) => w.id === 'A' || w.id === 'B') };
    expect(missingFromPlan(two, floorPlan(two))).toHaveLength(0);
  });
});
