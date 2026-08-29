import { describe, expect, it } from 'vitest';
import {
  blockingSpans, clearOfBlocks, firstFreeX, layoutWall, placeOnRun, snapTargets, snapX, uid,
} from '../project.js';
import { PROJECT, buildUnit } from '../catalog.js';
import { newObstacle } from '../obstacles.js';

const item = (familyId, settings = {}) => ({ uid: uid(), familyId, settings });

const wallWith = (obstacles, units = [], length = 4000) =>
  ({ id: 'A', name: 'Wall A', length, obstacles, units });

const doorway = (x) => ({ ...newObstacle('door', x) });
const window1 = (x) => ({ ...newObstacle('window', x) });

const probe = (familyId, settings = {}) => buildUnit('probe', familyId, settings, PROJECT);

describe('what a cabinet may not stand in', () => {
  it('a doorway blocks a base cabinet', () => {
    const lay = layoutWall(wallWith([doorway(1500)]), PROJECT);
    const spans = blockingSpans(lay, probe('base-2door'));
    expect(spans).toHaveLength(1);
    expect(spans[0].x0).toBe(1500);
    expect(spans[0].x1).toBe(1500 + 820);
    expect(spans[0].label).toBe('doorway');
  });

  /* A window at 900 off the floor and a wall cabinet at 1500 do meet. A
     window and a base cabinet under it do not, and treating every obstacle as
     blocking the whole height of the wall is how a kitchen ends up unable to
     put a sink base under its own window. */
  it('a window blocks what is at its own height and nothing else', () => {
    const lay = layoutWall(wallWith([window1(1500)]), PROJECT);
    expect(blockingSpans(lay, probe('base-2door'))).toHaveLength(0);
    expect(blockingSpans(lay, probe('wall-2door'))).toHaveLength(1);
    expect(blockingSpans(lay, probe('tall-pantry'))).toHaveLength(1);
  });

  it('something you are building around blocks nothing', () => {
    const service = { ...newObstacle('waste', 1500) };
    const lay = layoutWall(wallWith([service]), PROJECT);
    expect(blockingSpans(lay, probe('base-sink'))).toHaveLength(0);
  });

  it('a window you have said to build around stops blocking', () => {
    const hatch = { ...window1(1500), nature: 'service' };
    const lay = layoutWall(wallWith([hatch]), PROJECT);
    expect(blockingSpans(lay, probe('wall-2door'))).toHaveLength(0);
  });
});

describe('a cabinet never lands in a doorway', () => {
  const lay = () => layoutWall(wallWith([doorway(1500)]), PROJECT);

  it('a drop over it is pushed to whichever side is nearer', () => {
    const unit = probe('app-fridge', { width: 900 });

    // Dropped just inside the left hand edge: pushed left, clear of it.
    expect(clearOfBlocks(lay(), unit, 1400).x).toBe(1500 - 900);
    // Dropped just inside the right hand edge: pushed right, clear of it.
    expect(clearOfBlocks(lay(), unit, 2200).x).toBe(1500 + 820);
  });

  it('it stays where it is when it was never in the way', () => {
    const unit = probe('base-2door', { width: 600 });
    expect(clearOfBlocks(lay(), unit, 300).x).toBe(300);
    expect(clearOfBlocks(lay(), unit, 2400).x).toBe(2400);
  });

  it('a push that would run off the start of the wall goes the other way', () => {
    const lay2 = layoutWall(wallWith([doorway(0)]), PROJECT);
    const unit = probe('app-fridge', { width: 900 });
    expect(clearOfBlocks(lay2, unit, 100).x).toBe(820);
  });

  it('the drag itself is pushed clear, whatever the snap wanted', () => {
    const unit = probe('app-fridge', { width: 900 });
    const { x, snap } = snapX(lay(), { uid: 'z' }, unit, 1700);
    expect(x + 900 <= 1500 || x >= 2320).toBe(true);
    expect(snap.label).toMatch(/doorway/);
  });

  it('adding one drops it in the first gap that is really free', () => {
    const lay2 = layoutWall(wallWith([doorway(600)]), PROJECT);
    const unit = probe('base-2door', { width: 600 });
    // Nothing on the wall, but the first 600 to 1420 is a doorway.
    expect(firstFreeX(lay2, unit, 600)).toBe(0);

    const lay3 = layoutWall(
      wallWith([doorway(600)], [item('base-2door', { width: 600, x: 0 })]), PROJECT);
    expect(placeOnRun(lay3, unit, 600).x).toBe(1420);
  });
});

describe('an appliance snaps to the edge of a doorway', () => {
  it('both sides of it are offered as a join', () => {
    const lay = layoutWall(wallWith([doorway(1500)]), PROJECT);
    const unit = probe('app-fridge', { width: 900 });
    const targets = snapTargets(lay, { uid: 'z' }, unit)
      .filter((t) => t.kind === 'obstacle');

    expect(targets.map((t) => t.x).sort((a, b) => a - b)).toEqual([1500 - 900, 1500 + 820]);
    for (const t of targets) expect(t.label).toMatch(/doorway/);
  });

  /* From further out than a plain butt joint, for the same reason a corner
     is: there is one position beside a doorway that works and any number of
     places to butt two cabinets together. */
  it('it is pulled from further out than a butt joint', () => {
    const lay = layoutWall(wallWith([doorway(1500)]), PROJECT);
    const unit = probe('app-fridge', { width: 900 });
    const { x, snap } = snapX(lay, { uid: 'z' }, unit, 2450);

    expect(x).toBe(2320);
    expect(snap.kind).toBe('obstacle');
  });

  it('a wall cabinet is not offered the edges of a window it clears', () => {
    const lay = layoutWall(wallWith([{ ...window1(1500), y: 400, h: 300 }]), PROJECT);
    const targets = snapTargets(lay, { uid: 'z' }, probe('wall-2door'))
      .filter((t) => t.kind === 'obstacle');
    expect(targets).toHaveLength(0);
  });
});
