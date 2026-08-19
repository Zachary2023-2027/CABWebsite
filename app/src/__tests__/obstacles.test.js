import { describe, expect, it } from 'vitest';
import {
  OBSTACLE_KINDS, OBSTACLE_LIST, blocks, cleanObstacle, isService, natureOf,
  newObstacle, obstacleKind, obstacleNote, overlaps,
} from '../obstacles.js';
import { hydrate } from '../storage.js';
import { layoutFor, roomOffsets, starterProject, unitServices, unitWarnings } from '../project.js';
import { tinyProject } from './fixtures.js';

describe('the kinds', () => {
  it('every kind is a real thing with a real default size', () => {
    for (const k of OBSTACLE_LIST) {
      expect(k.name.length, k.id).toBeGreaterThan(0);
      expect(['blocks', 'service', 'note']).toContain(k.nature);
      expect(k.size[0], k.id).toBeGreaterThan(0);
      expect(k.size[1], k.id).toBeGreaterThan(0);
      expect(k.y, k.id).toBeGreaterThanOrEqual(0);
      expect(k.note.length, k.id).toBeGreaterThan(0);
    }
  });

  it('an unknown kind falls back rather than throwing', () => {
    expect(obstacleKind('nonsense').id).toBe('window');
    expect(obstacleKind(undefined).id).toBe('window');
  });

  it('a new obstacle starts from its kind and lands where it is put', () => {
    const o = newObstacle('waste', 1500);
    expect(o.kind).toBe('waste');
    expect(o.x).toBe(1500);
    expect(o.y).toBe(OBSTACLE_KINDS.waste.y);
    expect(o.w).toBe(OBSTACLE_KINDS.waste.size[0]);
    expect(o.id).toBeTruthy();
  });

  it('two obstacles made in a row do not share an id', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newObstacle('power').id));
    expect(ids.size).toBe(20);
  });
});

/* Not everything on a wall is in the way in the same sense. A window behind a
   wall cabinet is a mistake. A waste pipe inside a sink base is the point. */
describe('what an obstacle means', () => {
  it('a window blocks and a waste pipe is a service', () => {
    expect(blocks(newObstacle('window'))).toBe(true);
    expect(isService(newObstacle('waste'))).toBe(true);
    expect(blocks(newObstacle('waste'))).toBe(false);
  });

  it('a blocking obstacle is an error and a service is a note', () => {
    expect(obstacleNote(newObstacle('window')).level).toBe('error');
    expect(obstacleNote(newObstacle('power')).level).toBe('note');
    expect(obstacleNote(newObstacle('vent'))).toBeNull();
  });

  /* Changing your mind about a window must not turn it into a power point,
     which is what changing its kind would do. */
  it('you can disagree with the kind without changing what it is', () => {
    const hatch = { ...newObstacle('window'), nature: 'service' };
    expect(hatch.kind).toBe('window');
    expect(natureOf(hatch)).toBe('service');
    expect(obstacleNote(hatch).level).toBe('note');
  });

  it('a nonsense nature falls back to the kind rather than silencing it', () => {
    const o = { ...newObstacle('window'), nature: 'whatever' };
    expect(natureOf(o)).toBe('blocks');
  });

  it('the note names the obstacle, so it says which one', () => {
    const o = { ...newObstacle('waste'), label: 'Old cast iron waste' };
    expect(obstacleNote(o).text).toContain('old cast iron waste');
  });
});

describe('overlap', () => {
  const o = { x: 1000, y: 900, w: 1000, h: 1200 };

  it('catches a cabinet standing in front of it', () => {
    expect(overlaps(o, 1500, 1500, 800, 720)).toBe(true);
  });

  it('lets past a cabinet beside it or below it', () => {
    expect(overlaps(o, 2100, 1500, 800, 720)).toBe(false);
    expect(overlaps(o, 1500, 150, 800, 720)).toBe(false);
  });

  it('touching edges do not overlap', () => {
    expect(overlaps(o, 2000, 900, 800, 720)).toBe(false);
    expect(overlaps(o, 1999, 900, 800, 720)).toBe(true);
  });
});

describe('what the planner says about it', () => {
  const withObstacle = (kind, x, y) => {
    const project = tinyProject();
    project.walls[0].obstacles = [{ ...newObstacle(kind, x), y, w: 200, h: 200 }];
    const lay = layoutFor(project, project.walls[0], roomOffsets(project));
    return { project, lay, placed: lay.placed[0] };
  };

  it('a window behind a cabinet is a warning', () => {
    const { placed, lay, project } = withObstacle('window', 100, 200);
    expect(unitWarnings(placed, lay, project.cfg).some((w) => /window/i.test(w))).toBe(true);
  });

  /* Calling a service a problem trains you to ignore the problems. */
  it('a waste pipe inside a cabinet is not a warning', () => {
    const { placed, lay, project } = withObstacle('waste', 100, 200);
    expect(unitWarnings(placed, lay, project.cfg).some((w) => /waste/i.test(w))).toBe(false);
  });

  it('it is reported as something to build around instead', () => {
    const { placed, lay } = withObstacle('waste', 100, 200);
    const services = unitServices(placed, lay);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatch(/cut the back around it/i);
  });

  it('a service nowhere near a cabinet says nothing at all', () => {
    const { placed, lay } = withObstacle('waste', 9000, 200);
    expect(unitServices(placed, lay)).toHaveLength(0);
  });
});

/* The old loader threw away any obstacle with a bad number in it, which
   quietly deleted a window because its height arrived as a string. */
describe('an obstacle arriving from a file', () => {
  const load = (obstacles) => hydrate({
    schema: 3, id: 'x', name: 'k', savedAt: 1, cut: [], prices: {}, quoted: '',
    project: { ...tinyProject(), walls: [{ ...tinyProject().walls[0], obstacles }] },
  }).project.walls[0].obstacles;

  it('survives a bad number rather than being deleted', () => {
    const [o] = load([{ kind: 'window', label: 'Window', x: 2400, y: 900, w: 1000, h: 'tall' }]);
    expect(o).toBeTruthy();
    expect(o.label).toBe('Window');
    expect(o.h).toBe(OBSTACLE_KINDS.window.size[1]);
  });

  it('keeps everything that was already right', () => {
    const [o] = load([{ id: 'w1', kind: 'waste', label: 'Waste', x: 1200, y: 300, w: 100, h: 100 }]);
    expect(o).toEqual({ id: 'w1', kind: 'waste', label: 'Waste', x: 1200, y: 300, w: 100, h: 100 });
  });

  it('keeps a nature you set, and drops one you did not', () => {
    expect(load([{ kind: 'window', nature: 'service' }])[0].nature).toBe('service');
    expect(load([{ kind: 'window', nature: 'nonsense' }])[0].nature).toBeUndefined();
  });

  it('never produces a size of nothing', () => {
    for (const bad of [0, -50, null, 'x']) {
      const [o] = load([{ kind: 'power', w: bad, h: bad }]);
      expect(o.w, String(bad)).toBeGreaterThan(0);
      expect(o.h, String(bad)).toBeGreaterThan(0);
    }
  });

  it('drops something that is not an obstacle at all', () => {
    expect(load([null, 'window', 42, { kind: 'power' }])).toHaveLength(1);
  });

  it('a long label is trimmed rather than carried', () => {
    const [o] = load([{ kind: 'window', label: 'x'.repeat(500) }]);
    expect(o.label.length).toBeLessThanOrEqual(60);
  });

  it('the example kitchen still opens with its window', () => {
    const project = starterProject();
    expect(project.walls[0].obstacles).toHaveLength(1);
    const [o] = load(project.walls[0].obstacles);
    expect(o.label).toBe('Window');
  });
});
