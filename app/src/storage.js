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

import { FAMILY, PRICE_SEED, PROJECT } from './catalog.js';
import { ROOM_SHAPES, allParts } from './project.js';
import { migrateRunnerClearance } from './hardware.js';

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
  prices: prices || PRICE_SEED,
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
          && !FAMILY[u.familyId]?.cavity).length, 0),
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
      settings: cleanSettings(u.settings),
    })) : [],
  }));

  if (!walls.length) return null;

  /* Locks and your own hardware are project wide. A file written before
     these existed simply has neither, which is why both default rather than
     failing the load. */
  const uids = new Set(walls.flatMap((w) => w.units.map((u) => u.uid)));
  const locked = Array.isArray(p.locked)
    ? [...new Set(p.locked.map(String).filter((id) => uids.has(id)))] : [];
  const extras = Array.isArray(p.extras)
    ? p.extras.filter((e) => e && typeof e === 'object').map((e) => ({
      id: String(e.id || newId()),
      name: String(e.name ?? ''),
      qty: Number.isFinite(Number(e.qty)) ? Number(e.qty) : 0,
      cost: Number.isFinite(Number(e.cost)) ? Number(e.cost) : 0,
    })) : [];

  /* Runner clearance became a runner profile. Twice 21 is 42, the TANDEM
     563H deduction, so a stored 21 becomes that profile. The old code read
     the number as a deduction to the outside of the drawer box and the
     profile reads it to the inside, which is the correct reading, so the
     boxes in an older project get wider by twice the box side thickness.
     That is a real change to a saved kitchen and it is reported rather than
     made quietly: see runnerNotice below. */
  const cfgIn = (p.cfg && typeof p.cfg === 'object') ? p.cfg : {};
  const hadProfile = typeof cfgIn.runnerProfile === 'string';
  const migrated = hadProfile ? null : migrateRunnerClearance(cfgIn.runnerClearance);

  const project = {
      name: String(p.name || raw.name || 'Untitled kitchen'),
      cfg: {
        ...PROJECT,
        ...cfgIn,
        ...(migrated ? { runnerProfile: migrated.profileId } : {}),
        ...(migrated && migrated.custom ? { customRunner: migrated.custom } : {}),
      },
      walls,
      locked,
      extras,
      /* A file written before room shapes existed has no room, and one wall
         is what it was, so that is what it opens as. */
      room: ROOM_SHAPES.some((s) => s.id === p.room) ? p.room : 'straight',
      activeWall: walls.some((w) => w.id === p.activeWall) ? p.activeWall : walls[0].id,
  };

  return {
    id: raw.id || newId(),
    name: String(raw.name || p.name || 'Untitled kitchen'),
    savedAt: Number(raw.savedAt) || Date.now(),
    project,
    cut: migrateCut(raw.cut, project),
    /* Set once, when an older file is opened, so the app can say what moved
       and why. Null on a file that already carried a profile. */
    runnerNotice: migrated && migrated.changed ? {
      profileId: migrated.profileId,
      unconfirmed: !!(migrated.custom && migrated.custom.unconfirmed),
      wasClearance: Number(cfgIn.runnerClearance),
    } : null,
    prices: mergePrices(raw.prices),
    quoted: typeof raw.quoted === 'string' ? raw.quoted : '',
  };
}

/* Per cabinet settings are free form, because a family decides what it reads.
   The two that carry structure are checked: drawer heights have to be real
   numbers, and a config override has to be numbers or short strings, so a
   hand edited file cannot put an object where a thickness should be. */
function cleanSettings(s) {
  if (!s || typeof s !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'x') {
      /* Where the cabinet was put along its wall. Anything that is not a
         real number is dropped, and the cabinet goes back to flowing after
         the one before it rather than landing at NaN. */
      if (Number.isFinite(Number(v)) && v !== '' && v !== null) out[k] = Math.max(0, Number(v));
      continue;
    }
    if (k === 'drawerHeights') {
      if (Array.isArray(v) && v.length && v.every((x) => Number(x) > 0)) out[k] = v.map(Number);
      continue;
    }
    if (k === 'cfg') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const cfg = {};
      for (const [ck, cv] of Object.entries(v)) {
        if (Number.isFinite(Number(cv)) && cv !== '' && cv !== null) cfg[ck] = Number(cv);
        else if (typeof cv === 'string' && cv.length <= 60) cfg[ck] = cv;
      }
      if (Object.keys(cfg).length) out[k] = cfg;
      continue;
    }
    if (v === null || typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

/**
 * Cut ticks used to be stored against part codes, which move when you delete
 * a cabinet. They are stored against a stable key now. A file written before
 * that carries codes, and at the moment it is opened the codes still line up
 * with the project as saved, so this is the one and only chance to translate
 * them. After this the ticks stay on the right parts for good.
 */
function migrateCut(raw, project) {
  if (!Array.isArray(raw)) return [];
  const stored = new Set(raw.filter((c) => typeof c === 'string'));
  if (!stored.size) return [];

  let parts;
  try { parts = allParts(project); } catch { return [...stored].filter((c) => c.includes('/')); }
  const byCode = new Map(parts.map((q) => [q.code, q.key]));
  const valid = new Set(parts.map((q) => q.key));

  const out = new Set();
  for (const c of stored) {
    if (valid.has(c)) out.add(c);                 // already a key
    else if (byCode.has(c)) out.add(byCode.get(c)); // an old code, translate it
    // anything else refers to a part that no longer exists, so it is dropped
  }
  return [...out];
}

function mergePrices(incoming) {
  /* Merge onto the seeded list, not onto whatever this session has been
     edited to, so opening a saved kitchen gives you the prices you saved. */
  const base = structuredClone(PRICE_SEED);
  if (!incoming || typeof incoming !== 'object') return base;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'sheets' && v && typeof v === 'object') {
      /* The saved stock list replaces the seeded one rather than being laid
         over it. Otherwise a sheet you deleted comes back every time you
         open the project. An empty or unreadable list falls back to the
         seed, because a project with no sheets cannot be nested. */
      const sheets = {};
      for (const [name, sh] of Object.entries(v)) {
        if (sh && Array.isArray(sh.size) && sh.size.length === 2
            && sh.size.every((x) => Number(x) > 0) && Number.isFinite(Number(sh.cost))) {
          sheets[name] = { size: sh.size.map(Number), cost: Number(sh.cost) };
        }
      }
      if (Object.keys(sheets).length) base.sheets = sheets;
    } else if (typeof v === 'boolean') {
      base[k] = v;
    } else if (Number.isFinite(Number(v))) {
      base[k] = Number(v);
    }
  }
  return base;
}

/* --- files ---------------------------------------------------------------- */

const fileName = (name) =>
  `${String(name).trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'kitchen'}.kcb.json`;

/**
 * Hand the browser a file. The anchor has to be in the document and the
 * object URL has to outlive the click, or the download is cancelled before
 * it starts in some browsers.
 */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFile(snap) {
  downloadBlob(
    new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }),
    fileName(snap.name),
  );
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
