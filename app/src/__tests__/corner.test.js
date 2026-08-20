/* ===========================================================================
   A corner has two legs, and the cabinet can stand on either.

   Only one of the two was ever understood. A blind corner at the end of wall
   A pushed wall B along, which is right. A blind corner at the start of wall
   B did nothing at all to wall A, so wall A ran its cabinets straight through
   the corner cabinet's carcass and neither the drawing, the snap, nor the
   checks noticed.
   =========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  cornerAtEnd, cornerAtStart, firstFreeX, layoutFor, roomOffsets, runGaps,
  snapTargets, snapX, starterProject, unitWarnings, wallWarnings,
} from '../project.js';
import { buildUnit } from '../catalog.js';

/* An L with nothing on either wall, so each test says what is on them. */
function bareL() {
  const p = starterProject();
  p.room = 'l';
  p.walls = [
    { id: 'A', name: 'Wall A', length: 3600, obstacles: [], units: [] },
    { id: 'B', name: 'Wall B', length: 2400, obstacles: [], units: [] },
  ];
  return p;
}

const put = (p, wallId, familyId, settings = {}) => {
  const wall = p.walls.find((w) => w.id === wallId);
  wall.units.push({ uid: `u${wallId}${wall.units.length}`, familyId, settings });
  return p;
};

const lay = (p, id) => layoutFor(p, p.walls.find((w) => w.id === id), roomOffsets(p));

/* The corner cabinet's own reach, worked out from the catalog rather than
   read back off the thing under test. */
const reach = (p, settings = {}) =>
  buildUnit('probe', 'base-blind-l', settings, p.cfg).cornerReturn;

describe('a corner built from the first leg, which always worked', () => {
  it('pushes the next wall along by the corner cabinet depth', () => {
    const p = put(bareL(), 'A', 'base-blind-l', { width: 1050 });
    const D = reach(p);
    expect(D).toBeGreaterThan(0);

    expect(lay(p, 'A').endReserve).toBe(0);
    expect(lay(p, 'A').limit).toBe(3600);
    expect(lay(p, 'B').startOffset).toBe(D);
  });
});

describe('a corner built from the second leg, which did not', () => {
  const built = () => put(bareL(), 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });

  it('holds the first wall back by the corner cabinet depth', () => {
    const p = built();
    const D = reach(p, { blindSide: 'left' });

    const a = lay(p, 'A');
    expect(a.endReserve).toBe(D);
    expect(a.limit).toBe(3600 - D);

    /* The same number the other way round: what wall A gives up plus where
       its cabinets may reach is the whole wall. */
    expect(a.limit + a.endReserve).toBe(a.wall.length);
  });

  it('does not also push the second wall along, because it is standing on it', () => {
    const p = built();
    expect(lay(p, 'B').startOffset).toBe(0);
    expect(cornerAtStart(lay(p, 'B'))).not.toBeNull();
    expect(cornerAtEnd(lay(p, 'B'))).toBeNull();
  });

  it('stops a cabinet on the first wall at the corner cabinet', () => {
    const p = built();
    const a = lay(p, 'A');
    const probe = buildUnit('probe', 'base-2door', { width: 800 }, p.cfg);

    /* Filled from the start, the last one that fits is the one that lands
       against the corner cabinet's side and no further. */
    let x = firstFreeX(a, probe, 800);
    let last = null;
    let guard = 0;
    while (x !== null && guard < 20) {
      last = x;
      const stub = { ...a, placed: [...a.placed, { item: { uid: `f${guard}` }, unit: probe, x, where: 'base', side: 'front' }] };
      x = firstFreeX(stub, probe, 800);
      a.placed = stub.placed;
      guard += 1;
    }
    expect(last).not.toBeNull();
    expect(last + 800).toBeLessThanOrEqual(lay(p, 'A').limit + 0.5);
    expect(last + 800 + 800).toBeGreaterThan(lay(p, 'A').limit);
  });

  it('snaps a cabinet on the first wall to the corner cabinet on the second', () => {
    const p = put(built(), 'A', 'base-2door', { width: 800 });
    const a = lay(p, 'A');
    const placed = a.placed[0];

    // Dragged into roughly the right area, not onto the millimetre.
    const dropped = snapX(a, placed.item, placed.unit, a.limit - 800 - 90);
    expect(dropped.snap).not.toBeNull();
    expect(dropped.snap.kind).toBe('corner');
    expect(dropped.x).toBe(Math.round(a.limit - 800));
    expect(dropped.snap.label).toMatch(/next wall/);
  });

  /* The end of the wall is not a join any more, because there is a cabinet
     standing in front of it. Offering it would pull a cabinet into the corner
     cabinet's carcass and call it a tidy fit. */
  it('does not offer the end of the wall as somewhere to snap to', () => {
    const p = put(built(), 'A', 'base-2door', { width: 800 });
    const a = lay(p, 'A');
    const placed = a.placed[0];
    const targets = snapTargets(a, placed.item, placed.unit);

    expect(targets.some((t) => t.kind === 'end')).toBe(false);
    expect(targets.some((t) => t.x === a.wall.length - 800)).toBe(false);

    const corner = targets.find((t) => t.kind === 'corner');
    expect(corner.x).toBe(a.limit - 800);
  });

  it('does not call the corner cabinet a gap to fill', () => {
    const p = put(built(), 'A', 'base-2door', { width: 800 });
    const a = lay(p, 'A');
    const tail = runGaps(a, 'base').find((g) => g.trailing);
    expect(Math.round(tail.w)).toBe(Math.round(a.limit - 800));
  });

  it('says a cabinet drawn into the corner cabinet runs into it', () => {
    const p = built();
    const D = reach(p, { blindSide: 'left' });
    put(p, 'A', 'base-2door', { width: 800, x: 3600 - 800 });
    const a = lay(p, 'A');
    const notes = unitWarnings(a.placed[0], a, p.cfg);
    expect(notes.join(' ')).toMatch(/into the corner cabinet on the next wall/);
    expect(notes.join(' ')).toContain(`${D}mm`);
  });
});

describe('what the checks say about a corner', () => {
  const levels = (p, id) => wallWarnings(lay(p, id), p);
  const texts = (p, id) => levels(p, id).map((w) => w.text).join(' | ');

  it('still complains when neither leg has a corner cabinet', () => {
    const p = bareL();
    put(p, 'A', 'base-2door', { width: 800 });
    expect(texts(p, 'A')).toMatch(/no blind corner cabinet/);
  });

  it('stops complaining once the second leg carries it', () => {
    const p = put(bareL(), 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });
    put(p, 'A', 'base-2door', { width: 800 });
    expect(texts(p, 'A')).not.toMatch(/no blind corner cabinet/);
  });

  it('says which stretch of the wall is not yours to use', () => {
    const p = put(bareL(), 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });
    const note = levels(p, 'A').find((w) => /corner cabinet on the next wall/.test(w.text));
    expect(note.level).toBe('note');
    expect(note.text).toContain(`${reach(p, { blindSide: 'left' })}mm`);
  });

  it('calls two corner cabinets in the one corner an error', () => {
    const p = put(bareL(), 'A', 'base-blind-l', { width: 1050 });
    put(p, 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });
    const bad = levels(p, 'A').find((w) => w.level === 'error');
    expect(bad.text).toMatch(/Two blind corners/);
  });

  it('says so when the corner on this wall faces the wrong way', () => {
    const p = put(bareL(), 'A', 'base-blind-l', { width: 1050, blindSide: 'left' });
    expect(texts(p, 'A')).toMatch(/reaches back/);
  });

  it('measures an overrun against the corner cabinet, not the wall', () => {
    const p = put(bareL(), 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });
    const D = reach(p, { blindSide: 'left' });
    // Exactly the wall's length of cabinets, so the overrun is the reserve.
    for (let i = 0; i < 4; i += 1) put(p, 'A', 'base-2door', { width: 900 });
    const bad = levels(p, 'A').find((w) => w.level === 'error');
    expect(bad.text).toMatch(/corner cabinet on the next wall/);
    expect(bad.text).toContain(`Reduce by ${D}mm`);
  });
});

describe('the last wall in the run has nothing after it', () => {
  it('keeps its whole length, whichever way its corner faces', () => {
    const p = put(bareL(), 'B', 'base-blind-l', { width: 1050, blindSide: 'left' });
    expect(lay(p, 'B').endReserve).toBe(0);
    expect(lay(p, 'B').limit).toBe(2400);
  });
});
