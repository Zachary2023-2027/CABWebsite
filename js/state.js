// State shape, defaults, persistence, and mutations.
// Every mutation returns the same object; callers re-render from scratch.

import { TYPE_BY_ID } from './catalog.js';

export const STORAGE_KEY = 'kcb.state.v1';

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A furnished 12ft wall, so the app is never empty on first visit. */
export function starterState() {
  const mk = (typeId, width, height) => ({ uid: uid(), typeId, width, height });
  return {
    wall: { width: 144, height: 96 },
    style: { door: 'shaker', finish: 'white', hardware: 'bar' },
    counter: { enabled: true, material: 'quartz' },
    options: { install: true, installRate: 0.18, taxRate: 0.0825 },
    units: 'in',
    items: [
      mk('base-sink', 36),
      mk('wall-2d', 36, 30),
      mk('gap-dw', 24),
      mk('wall-2d', 24, 30),
      mk('base-3dr', 30),
      mk('wall-2d', 30, 30),
      mk('gap-range', 30),
      mk('wall-bridge', 30, 18),
      mk('base-2d', 24),
      mk('wall-2d', 24, 30),
    ],
    selected: null,
  };
}

/** Merge a stored blob over defaults so older saves keep working. */
function hydrate(raw) {
  const base = starterState();
  if (!raw || typeof raw !== 'object') return base;
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((it) => it && TYPE_BY_ID[it.typeId])
        .map((it) => ({
          uid: it.uid || uid(),
          typeId: it.typeId,
          width: Number(it.width) || TYPE_BY_ID[it.typeId].defaultWidth,
          height: it.height == null ? undefined : Number(it.height),
        }))
    : base.items;
  return {
    wall: { ...base.wall, ...(raw.wall || {}) },
    style: { ...base.style, ...(raw.style || {}) },
    counter: { ...base.counter, ...(raw.counter || {}) },
    options: { ...base.options, ...(raw.options || {}) },
    units: raw.units === 'cm' ? 'cm' : 'in',
    items,
    selected: null,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? hydrate(JSON.parse(raw)) : starterState();
  } catch {
    return starterState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode — the app still works, it just won't persist */
  }
}

// ---- mutations ----------------------------------------------------------

export function addItem(state, typeId) {
  const type = TYPE_BY_ID[typeId];
  if (!type) return state;
  const item = {
    uid: uid(),
    typeId,
    width: type.defaultWidth,
    height: type.heights ? type.defaultHeight : undefined,
  };
  state.items.push(item);
  state.selected = item.uid;
  return state;
}

const indexOf = (state, id) => state.items.findIndex((it) => it.uid === id);

export function removeItem(state, id) {
  const i = indexOf(state, id);
  if (i < 0) return state;
  state.items.splice(i, 1);
  const next = state.items[i] || state.items[i - 1];
  state.selected = next ? next.uid : null;
  return state;
}

export function duplicateItem(state, id) {
  const i = indexOf(state, id);
  if (i < 0) return state;
  const copy = { ...state.items[i], uid: uid() };
  state.items.splice(i + 1, 0, copy);
  state.selected = copy.uid;
  return state;
}

/** Move an item one slot left (-1) or right (+1) in the run. */
export function moveItem(state, id, delta) {
  const i = indexOf(state, id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.items.length) return state;
  const [it] = state.items.splice(i, 1);
  state.items.splice(j, 0, it);
  state.selected = it.uid;
  return state;
}

export function setItemSize(state, id, key, value) {
  const it = state.items[indexOf(state, id)];
  if (it) it[key] = Number(value);
  return state;
}
