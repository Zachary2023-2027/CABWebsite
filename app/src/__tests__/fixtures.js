/* Shared fixtures. Kept in one place so a test that needs a project does not
   invent one, and so the schema fixtures below stay the only definition of
   what an older file looks like. */

import { PROJECT } from '../catalog.js';

/** A project built by hand, so a test is not asserting against a moving target. */
export function tinyProject(overrides = {}) {
  return {
    name: 'Test kitchen',
    cfg: { ...PROJECT },
    room: 'straight',
    walls: [{
      id: 'A',
      name: 'Wall A',
      length: 3600,
      obstacles: [],
      units: [
        { uid: 'u1', familyId: 'base-2door', settings: { width: 800 } },
        { uid: 'u2', familyId: 'base-3drawer', settings: { width: 600 } },
        { uid: 'u3', familyId: 'tall-pantry', settings: { width: 600 } },
      ],
    }],
    activeWall: 'A',
    locked: [],
    extras: [],
    ...overrides,
  };
}

/**
 * A file written before the schema field existed. Everything optional is
 * missing, which is the point: hydrate has to fill it all in.
 */
export const schema1File = {
  id: 'old1',
  name: 'Old kitchen',
  savedAt: 1,
  project: {
    name: 'Old kitchen',
    cfg: { carcassThk: 16 },
    walls: [{
      id: 'A',
      name: 'Wall A',
      length: 3600,
      units: [{ uid: 'a', familyId: 'base-2door', settings: { width: 800 } }],
    }],
    activeWall: 'A',
  },
  cut: [],
  prices: { hinge: 7 },
  quoted: '',
};

/** A current file, with everything the app writes today. */
export const schema2File = {
  schema: 2,
  id: 'cur2',
  name: 'Current kitchen',
  savedAt: 2,
  project: {
    ...tinyProject(),
    locked: ['u1'],
    extras: [{ id: 'e1', name: 'Soft close kit', qty: 10, cost: 12.5 }],
  },
  cut: [],
  prices: { hinge: 6.5, includeBench: false },
  quoted: '12000',
};

/**
 * A file somebody has broken: wrong types everywhere, a family that does not
 * exist, a lock pointing at nothing, a negative length. Hydrate must return a
 * project that renders rather than throwing or returning half a project.
 */
export const corruptedFile = {
  schema: 2,
  id: null,
  name: 42,
  savedAt: 'yesterday',
  project: {
    name: null,
    cfg: { carcassThk: 'thick', kerf: -5, reveal: {} },
    room: 'hexagon',
    walls: [
      {
        id: 'A',
        name: 'Wall A',
        length: -100,
        obstacles: [{ x: 'a', y: 1, w: 2, h: 3 }, { x: 1, y: 1, w: 1, h: 1, label: 'Window' }],
        units: [
          { uid: 'a', familyId: 'base-2door', settings: { width: 800, x: 'nonsense' } },
          { uid: 'b', familyId: 'does-not-exist', settings: {} },
          { uid: 'c', familyId: 'base-3drawer', settings: { drawerHeights: ['x'], cfg: { carcassThk: {} } } },
          null,
        ],
      },
    ],
    activeWall: 'Z',
    locked: ['a', 'ghost', 'a'],
    extras: [{ name: 'x', qty: '3', cost: '2' }, null, 'nope'],
  },
  cut: ['A1-SIDE-L', 12, null],
  prices: { hinge: 'free', sheets: { Bad: { size: [0, 0], cost: 1 } } },
  quoted: 99,
};
