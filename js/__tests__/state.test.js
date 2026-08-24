import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY, addItem, duplicateItem, load, moveItem,
  removeItem, save, setItemSize, starterState, uid,
} from '../state.js';

// The module talks to localStorage directly; give it one that behaves.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => store.clear());

const ids = (s) => s.items.map((i) => i.typeId);

describe('uid', () => {
  it('does not collide within a session', () => {
    const seen = new Set(Array.from({ length: 500 }, uid));
    expect(seen.size).toBe(500);
  });
});

describe('starterState', () => {
  it('furnishes a wall so the app is never empty', () => {
    const s = starterState();
    expect(s.items.length).toBeGreaterThan(0);
    expect(s.wall).toEqual({ width: 144, height: 96 });
    expect(s.selected).toBeNull();
  });

  it('gives every item its own uid', () => {
    const s = starterState();
    expect(new Set(s.items.map((i) => i.uid)).size).toBe(s.items.length);
  });
});

describe('mutations', () => {
  it('adds to the end of the run and selects it', () => {
    const s = starterState();
    const n = s.items.length;
    addItem(s, 'base-2d');
    expect(s.items).toHaveLength(n + 1);
    expect(s.items.at(-1).typeId).toBe('base-2d');
    expect(s.selected).toBe(s.items.at(-1).uid);
  });

  it('ignores an unknown type', () => {
    const s = starterState();
    const n = s.items.length;
    addItem(s, 'not-a-cabinet');
    expect(s.items).toHaveLength(n);
  });

  it('removes an item and selects its neighbour', () => {
    const s = starterState();
    const [, second, third] = s.items;
    removeItem(s, second.uid);
    expect(s.items.some((i) => i.uid === second.uid)).toBe(false);
    expect(s.selected).toBe(third.uid);
  });

  it('selects the previous item when the last one goes', () => {
    const s = starterState();
    const last = s.items.at(-1);
    const before = s.items.at(-2);
    removeItem(s, last.uid);
    expect(s.selected).toBe(before.uid);
  });

  it('clears the selection when the run empties', () => {
    const s = starterState();
    while (s.items.length) removeItem(s, s.items[0].uid);
    expect(s.selected).toBeNull();
  });

  it('duplicates in place with a fresh uid', () => {
    const s = starterState();
    const first = s.items[0];
    duplicateItem(s, first.uid);
    expect(s.items[1].typeId).toBe(first.typeId);
    expect(s.items[1].uid).not.toBe(first.uid);
    expect(s.selected).toBe(s.items[1].uid);
  });

  it('moves an item along the run', () => {
    const s = starterState();
    const before = ids(s);
    moveItem(s, s.items[0].uid, 1);
    expect(ids(s)[0]).toBe(before[1]);
    expect(ids(s)[1]).toBe(before[0]);
  });

  it('will not move past either end', () => {
    const s = starterState();
    const before = ids(s);
    moveItem(s, s.items[0].uid, -1);
    moveItem(s, s.items.at(-1).uid, 1);
    expect(ids(s)).toEqual(before);
  });

  it('sets a size numerically', () => {
    const s = starterState();
    setItemSize(s, s.items[0].uid, 'width', '33');
    expect(s.items[0].width).toBe(33);
  });

  it('shrugs off an unknown uid', () => {
    const s = starterState();
    const before = ids(s);
    removeItem(s, 'nope');
    moveItem(s, 'nope', 1);
    duplicateItem(s, 'nope');
    setItemSize(s, 'nope', 'width', 30);
    expect(ids(s)).toEqual(before);
  });
});

describe('load', () => {
  const stash = (obj) => store.set(STORAGE_KEY, JSON.stringify(obj));

  it('returns the starter when nothing is saved', () => {
    expect(load().items.length).toBe(starterState().items.length);
  });

  it('round-trips a saved state', () => {
    const s = starterState();
    s.wall.width = 120;
    s.style.finish = 'navy';
    save(s);
    const back = load();
    expect(back.wall.width).toBe(120);
    expect(back.style.finish).toBe('navy');
  });

  it('survives junk in storage', () => {
    store.set(STORAGE_KEY, '{ not json');
    expect(load().wall.width).toBe(144);
  });

  it('drops items whose type no longer exists', () => {
    stash({ items: [{ uid: 'a', typeId: 'base-2d', width: 30 }, { uid: 'b', typeId: 'gone', width: 30 }] });
    expect(load().items).toHaveLength(1);
  });

  it('replaces a non-numeric wall with the default rather than NaN', () => {
    stash({ wall: { width: 'wide', height: null } });
    const s = load();
    expect(s.wall.width).toBe(144);
    expect(s.wall.height).toBe(96);
  });

  it('clamps a wall that is out of range', () => {
    stash({ wall: { width: 99999, height: 2 } });
    const s = load();
    expect(s.wall.width).toBe(600);
    expect(s.wall.height).toBe(72);
  });

  it('clamps a tax rate that would run away with the total', () => {
    stash({ options: { taxRate: 7.5 } });
    expect(load().options.taxRate).toBe(0.25);
  });

  it('repairs an item width that is not a number', () => {
    stash({ items: [{ uid: 'a', typeId: 'base-2d', width: 'thirty' }] });
    expect(load().items[0].width).toBe(30);
  });

  it('only accepts the two known unit systems', () => {
    stash({ units: 'furlongs' });
    expect(load().units).toBe('in');
    stash({ units: 'cm' });
    expect(load().units).toBe('cm');
  });

  it('never restores a selection', () => {
    stash({ selected: 'whatever' });
    expect(load().selected).toBeNull();
  });
});
