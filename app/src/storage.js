/* ===========================================================================
   Saving.

   There is no server. Saving means two separate things and they are not
   interchangeable:

   1. The browser store. Automatic, instant, survives a reload or a closed
      tab. It does not survive clearing site data, a different browser, or a
      different machine.
   2. A project file. A .kcb.json you keep wherever you keep your other
      files. That is the real backup and the only way to move a kitchen
      between devices.

   The app autosaves to (1) and nags you toward (2).
   =========================================================================== */

import { FAMILY, PRICES, PROJECT } from './catalog.js';

const KEY = 'kcb.store.v2';
const SCHEMA = 2;

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* --- the store ------------------------------------------------------------ */

export function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { schema: SCHEMA, projects: {}, lastOpened: null };
    const db = JSON.parse(raw);
    if (!db || typeof db !== 'object' || !db.projects) throw new Error('bad store');
    return { schema: SCHEMA, projects: db.projects, lastOpened: db.lastOpened ?? null };
  } catch {
    return { schema: SCHEMA, projects: {}, lastOpened: null };
  }
}

function writeStore(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return { ok: true };
  } catch (e) {
    // Quota, or private browsing with storage disabled.
    return { ok: false, reason: e?.name === 'QuotaExceededError' ? 'full' : 'blocked' };
  }
}

/** One saved kitchen, everything needed to carry on exactly where you left off. */
export const snapshot = ({ id, name, project, cut, prices, quoted }) => ({
  schema: SCHEMA,
  id: id || newId(),
  name: name || project?.name || 'Untitled kitchen',
  savedAt: Date.now(),
  project,
  cut: [...(cut || [])],
  prices: prices || PRICES,
  quoted: quoted || '',
});

export function saveSnapshot(snap) {
  const db = readStore();
  db.projects[snap.id] = snap;
  db.lastOpened = snap.id;
  return { ...writeStore(db), id: snap.id, savedAt: snap.savedAt };
}

export function listSaved() {
  const db = readStore();
  return Object.values(db.projects)
    .map((s) => ({
      id: s.id, name: s.name, savedAt: s.savedAt,
      walls: s.project?.walls?.length ?? 0,
      cabinets: (s.project?.walls || [])
        .reduce((a, w) => a + (w.units || []).filter((u) => FAMILY[u.familyId]?.kind !== 'filler'
          && FAMILY[u.familyId]?.kind !== 'appliance').length, 0),
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadSnapshot(id) {
  const db = readStore();
  const s = db.projects[id];
  return s ? hydrate(s) : null;
}

export function removeSnapshot(id) {
  const db = readStore();
  delete db.projects[id];
  if (db.lastOpened === id) db.lastOpened = null;
  return writeStore(db);
}

export function renameSnapshot(id, name) {
  const db = readStore();
  if (!db.projects[id]) return { ok: false };
  db.projects[id].name = name;
  db.projects[id].project.name = name;
  return writeStore(db);
}

export const lastOpenedId = () => readStore().lastOpened;

/* --- validation ----------------------------------------------------------- */

/**
 * Accept a snapshot from the store or a file. Anything unrecognised is
 * dropped rather than trusted, so a hand edited or older file cannot put the
 * app into a state it cannot render.
 */
export function hydrate(raw) {
  if (!raw || typeof raw !== 'object' || !raw.project) return null;
  const p = raw.project;
  if (!Array.isArray(p.walls)) return null;

  const walls = p.walls.map((w, i) => ({
    id: String(w.id ?? `W${i}`),
    name: String(w.name ?? `Wall ${i + 1}`),
    length: Number(w.length) > 0 ? Number(w.length) : 3600,
    obstacles: Array.isArray(w.obstacles) ? w.obstacles.filter(
      (o) => o && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(Number(o[k]))),
    ) : [],
    units: Array.isArray(w.units) ? w.units.filter((u) => u && FAMILY[u.familyId]).map((u) => ({
      uid: String(u.uid || newId()),
      familyId: u.familyId,
      settings: (u.settings && typeof u.settings === 'object') ? u.settings : {},
    })) : [],
  }));

  if (!walls.length) return null;

  return {
    id: raw.id || newId(),
    name: String(raw.name || p.name || 'Untitled kitchen'),
    savedAt: Number(raw.savedAt) || Date.now(),
    project: {
      name: String(p.name || raw.name || 'Untitled kitchen'),
      cfg: { ...PROJECT, ...(p.cfg && typeof p.cfg === 'object' ? p.cfg : {}) },
      walls,
      activeWall: walls.some((w) => w.id === p.activeWall) ? p.activeWall : walls[0].id,
    },
    cut: Array.isArray(raw.cut) ? raw.cut.filter((c) => typeof c === 'string') : [],
    prices: mergePrices(raw.prices),
    quoted: typeof raw.quoted === 'string' ? raw.quoted : '',
  };
}

function mergePrices(incoming) {
  const base = structuredClone(PRICES);
  if (!incoming || typeof incoming !== 'object') return base;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'sheets' && v && typeof v === 'object') {
      for (const [name, sh] of Object.entries(v)) {
        if (sh && Array.isArray(sh.size) && Number.isFinite(Number(sh.cost))) {
          base.sheets[name] = { size: sh.size.map(Number), cost: Number(sh.cost) };
        }
      }
    } else if (Number.isFinite(Number(v))) {
      base[k] = Number(v);
    }
  }
  return base;
}

/* --- files ---------------------------------------------------------------- */

const fileName = (name) =>
  `${String(name).trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'kitchen'}.kcb.json`;

export function exportFile(snap) {
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(snap.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.onload = () => {
      try {
        const snap = hydrate(JSON.parse(String(r.result)));
        if (!snap) reject(new Error('That is not a kitchen file, or it has no walls in it.'));
        else resolve({ ...snap, id: newId() });
      } catch {
        reject(new Error('That file is not valid JSON.'));
      }
    };
    r.readAsText(file);
  });
}

export { newId };
