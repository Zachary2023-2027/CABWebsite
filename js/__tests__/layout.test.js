import { describe, expect, it } from 'vitest';
import { layout, warnings } from '../layout.js';
import { IN } from '../catalog.js';

const wall = { width: 144, height: 96 };
const item = (typeId, width, height) => ({ uid: typeId + width, typeId, width, height });

describe('layout', () => {
  it('advances the base cursor across base units', () => {
    const lay = layout([item('base-2d', 30), item('base-3dr', 24)], wall);
    expect(lay.placed.map((p) => p.x)).toEqual([0, 30]);
    expect(lay.baseRun).toBe(54);
    expect(lay.wallRun).toBe(0);
  });

  it('runs wall cabinets on a cursor independent of the base run', () => {
    const lay = layout([item('base-2d', 30), item('wall-2d', 36, 30)], wall);
    expect(lay.placed[1].x).toBe(0);
    expect(lay.baseRun).toBe(30);
    expect(lay.wallRun).toBe(36);
  });

  it('mounts wall cabinets at the standard height above the floor', () => {
    const [p] = layout([item('wall-2d', 30, 30)], wall).placed;
    expect(p.bottom).toBe(IN.WALL_MOUNT_AFF);
    expect(p.top).toBe(IN.WALL_MOUNT_AFF + 30);
  });

  it('blocks both rows with a tall unit and squares the cursors up', () => {
    const lay = layout([item('base-2d', 30), item('tall-pantry', 24, 90)], wall);
    expect(lay.placed[1].x).toBe(30);
    expect(lay.baseRun).toBe(54);
    expect(lay.wallRun).toBe(54);
  });

  it('starts a tall unit past whichever row has run further', () => {
    const lay = layout([item('wall-2d', 36, 30), item('tall-pantry', 24, 90)], wall);
    expect(lay.placed[1].x).toBe(36);
  });

  it('skips items whose type is unknown', () => {
    const lay = layout([item('base-2d', 30), item('does-not-exist', 20)], wall);
    expect(lay.placed).toHaveLength(1);
    expect(lay.baseRun).toBe(30);
  });

  it('falls back to the default width when the stored one is unusable', () => {
    const [p] = layout([{ uid: 'x', typeId: 'base-2d', width: 0 }], wall).placed;
    expect(p.w).toBe(30);
  });
});

describe('counter segments', () => {
  it('joins abutting base units into one run', () => {
    const lay = layout([item('base-2d', 30), item('base-3dr', 24)], wall);
    expect(lay.counterSegments).toEqual([{ x: 0, w: 54 }]);
  });

  it('carries the counter over a dishwasher', () => {
    const lay = layout([item('base-2d', 30), item('gap-dw', 24), item('base-2d', 24)], wall);
    expect(lay.counterSegments).toEqual([{ x: 0, w: 78 }]);
  });

  it('breaks the counter at a slide-in range', () => {
    const lay = layout([item('base-2d', 30), item('gap-range', 30), item('base-2d', 24)], wall);
    expect(lay.counterSegments).toEqual([{ x: 0, w: 30 }, { x: 60, w: 24 }]);
  });

  it('breaks the counter at a tall unit', () => {
    const lay = layout([item('base-2d', 30), item('tall-pantry', 24, 90), item('base-2d', 24)], wall);
    expect(lay.counterSegments).toEqual([{ x: 0, w: 30 }, { x: 54, w: 24 }]);
  });

  it('does not call a lone filler strip a countertop run', () => {
    const lay = layout([item('base-filler', 3)], wall);
    expect(lay.counterSegments).toEqual([]);
  });
});

describe('warnings', () => {
  const check = (items, w = wall) => {
    const state = { wall: w, items };
    return warnings(state, layout(items, w)).map((x) => `${x.level}:${x.text}`);
  };

  it('is quiet on a sound layout', () => {
    const out = check([item('base-sink', 36), item('base-2d', 30)]);
    expect(out).toEqual([]);
  });

  it('reports a base run past the end of the wall', () => {
    const out = check([item('base-sink', 36)], { width: 24, height: 96 });
    expect(out.some((t) => t.startsWith('error:Base run overruns'))).toBe(true);
  });

  it('reports units that break the ceiling', () => {
    const out = check([item('base-sink', 36), item('tall-pantry', 24, 96)], { width: 144, height: 90 });
    expect(out.some((t) => t.includes('Exceeds the 90″ ceiling'))).toBe(true);
  });

  it('notes a missing sink but not on an empty wall', () => {
    expect(check([item('base-2d', 30)]).some((t) => t.includes('No sink base'))).toBe(true);
    expect(check([])).toEqual([]);
  });

  it('wants something above a range and is satisfied by a bridge', () => {
    const bare = [item('base-sink', 36), item('gap-range', 30)];
    expect(bare && check(bare).some((t) => t.includes('no bridge cabinet'))).toBe(true);

    const covered = [item('base-sink', 36), item('gap-range', 30), item('wall-bridge', 66, 18)];
    expect(check(covered).some((t) => t.includes('no bridge cabinet'))).toBe(false);
  });

  it('flags an unreasonable amount of filler', () => {
    const items = [item('base-sink', 36), ...Array.from({ length: 3 }, (_, i) => ({
      uid: `f${i}`, typeId: 'base-filler', width: 3,
    }))];
    expect(check(items).some((t) => t.includes('of filler'))).toBe(true);
  });
});
