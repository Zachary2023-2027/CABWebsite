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
import { cleanStack } from './stack.js';
import { cleanObstacle } from './obstacles.js';

const KEY = 'kcb.store.v2';
/* 3 added the front stack. A cabinet with no stack of its own still resolves
   one from its preset and builds exactly what it always did, so a schema 1 or
   2 file needs nothing done to it beyond being read. */
const SCHEMA = 3;

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
    /* An island is a kind of thing now rather than a wall called ISL. A
       project saved before that carries the old name and no kind, so the id
       is read one last time here and written down properly. */
    kind: (w.kind === 'island' || (!w.kind && w.id === 'ISL')) ? 'island' : 'wall',
    ...(Number(w.depth) > 0 ? { depth: Number(w.depth) } : {}),
    length: Number(w.length) > 0 ? Number(w.length) : 3600,
    /* Cleaned rather than filtered. The old test threw away anything with a
       bad number in it, which quietly deleted a window because its height
       arrived as a string. Replacing the bad value from the kind keeps the
       obstacle and keeps the drawing honest. */
    obstacles: Array.isArray(w.obstacles)
      ? w.obstacles.map(cleanObstacle).filter(Boolean) : [],
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
        ...cleanCfg(cfgIn),
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

  /* The id becomes a key in the browser store, so it has to be a plain
     string and it cannot be the name of something every object has. */
  const id = String(raw.id ?? '');

  return {
    id: (id && safeKey(id)) ? id : newId(),
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

/* ---------------------------------------------------------------------------
   Reading keys off an object that came from a file.

   Object.entries hands back whatever keys the file put there, including the
   names of things every object already has. A check written as PROJECT[k]
   walks the prototype chain, so "toString" looks like a known key with a
   function behind it and sails through a validator that was only ever meant
   to pass the thicknesses and board names in PROJECT.

   The result is a config object whose toString is the string "pwned", and
   anything that later coerces that object to text throws instead of
   rendering. A project file is something people send each other, so it is
   attacker controlled input and it gets checked like it.
   --------------------------------------------------------------------------- */

const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

/** True when a key is really this object's own, and not a built in name. */
const ownKey = (obj, k) => !RESERVED.has(k) && Object.hasOwn(obj, k);

/** True when a key is safe to write onto an object we are building. */
const safeKey = (k) => !RESERVED.has(k) && !Object.hasOwn(Object.prototype, k);

/**
 * The project config, checked against the shape of PROJECT.
 *
 * A key whose default is a number has to arrive as a number, and one whose
 * default is a string has to arrive as a string. Anything else is dropped
 * and the default stands. Without this a hand edited file could put the word
 * "wide" where a thickness goes: the geometry falls back safely, but the junk
 * stays in the file and comes back every time it is opened.
 */
function cleanCfg(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  const out = {};

  for (const [k, v] of Object.entries(cfg)) {
    // Not a key PROJECT actually has, or a name every object has. Either way
    // it is not a setting and it does not get written.
    if (!ownKey(PROJECT, k)) continue;
    const fallback = PROJECT[k];

    /* Null means follow the runner profile, and zero is a real deduction, so
       this one cannot use the numeric rule below. */
    if (k === 'runnerDeduction') {
      if (v === null || v === undefined || v === '') out[k] = null;
      else if (Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v);
      continue;
    }

    // A profile carried over by migration is an object, and it is trusted
    // because migration built it, not the file.
    if (k === 'customRunner') { if (v && typeof v === 'object') out[k] = v; continue; }

    if (typeof fallback === 'number') {
      if (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== '' && v !== null) out[k] = Number(v);
      continue;
    }
    if (typeof fallback === 'string') {
      if (typeof v === 'string') out[k] = v;
      continue;
    }
    // Booleans and anything else PROJECT holds, taken as it is.
    out[k] = v;
  }
  return out;
}

/* Per cabinet settings are free form, because a family decides what it reads.
   The two that carry structure are checked: drawer heights have to be real
   numbers, and a config override has to be numbers or short strings, so a
   hand edited file cannot put an object where a thickness should be. */
function cleanSettings(s) {
  if (!s || typeof s !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    /* Free form, so there is no list to check against. What can be checked is
       that the key is not the name of something every object already has. */
    if (!safeKey(k)) continue;
    if (k === 'runnerDeduction') {
      /* Null means follow the profile. Zero is a real value, so it cannot be
         filtered out with a falsy test. */
      if (v === null || v === undefined || v === '') { out[k] = null; continue; }
      if (Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v);
      continue;
    }
    if (k === 'side') {
      // Only an island has two sides, and only 'back' means anything.
      if (v === 'back') out[k] = 'back';
      continue;
    }
    if (k === 'x') {
      /* Where the cabinet was put along its wall. Anything that is not a
         real number is dropped, and the cabinet goes back to flowing after
         the one before it rather than landing at NaN. */
      if (Number.isFinite(Number(v)) && v !== '' && v !== null) out[k] = Math.max(0, Number(v));
      continue;
    }
    if (k === 'stack') {
      /* Null means resolve from the preset, which is what every cabinet does
         until its front is edited. A stack that arrives broken is cleaned
         rather than trusted, and more than one fill row is left in place so
         the user is told rather than corrected behind their back. */
      const clean = cleanStack(v);
      if (clean) out[k] = clean;
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
        if (!safeKey(ck)) continue;
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
    if (!safeKey(k)) continue;
    if (k === 'sheets' && v && typeof v === 'object') {
      /* The saved stock list replaces the seeded one rather than being laid
         over it. Otherwise a sheet you deleted comes back every time you
         open the project. An empty or unreadable list falls back to the
         seed, because a project with no sheets cannot be nested. */
      const sheets = {};
      for (const [name, sh] of Object.entries(v)) {
        if (!safeKey(name)) continue;
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


/* ---------------------------------------------------------------------------
   CSV.

   A spreadsheet does not treat a .csv as data. Any cell that starts with =, +,
   - or @ is read as a formula the moment the file is opened, and the formula
   language reaches outside the sheet: =cmd|'/c calc'!A1 is a DDE call, and
   =HYPERLINK or WEBSERVICE will quietly post the contents of the sheet
   somewhere. The cells in a cut list carry text that came from a person: the
   project name, a wall name, a board species you typed, all of which arrive
   wholesale in a project file someone else sent you.

   So a cell that could be read as a formula is prefixed with an apostrophe,
   which every spreadsheet treats as "the rest of this is text". The apostrophe
   is not shown in the cell and does not become part of the value.
   --------------------------------------------------------------------------- */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let text = String(value ?? '');
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of cells to a CSV document. Every cell goes through csvCell. */
export const toCsv = (rows) =>
  rows.map((r) => r.map(csvCell).join(',')).join('\n');

/**
 * A name safe to hand to the browser as a download.
 *
 * Anything that is not a letter, a number, a space or a dash is dropped, so a
 * project called ../../../etc/passwd or one with a newline in it cannot steer
 * where the file lands or what it claims to be called.
 */
export const safeFileName = (name, suffix) =>
  `${String(name ?? '').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'kitchen'}${suffix}`;

/* ---------------------------------------------------------------------------
   SVG.

   The drawings on screen are already SVG. Exporting them means handing over
   the element that is there rather than drawing it a second time, which is
   the only way the file and the screen cannot disagree.

   Two things have to be fixed on the way out. The colours are CSS variables,
   which mean nothing in a file opened outside this page, so they are resolved
   to the values they currently have. And the element needs the xmlns
   attributes, which the browser supplies in a document and does not in a
   string.
   --------------------------------------------------------------------------- */

const CSS_VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g;

/** A copy of an SVG element that stands up on its own. */
export function standaloneSvg(node) {
  if (!node) return null;

  const clone = node.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  /* Whatever the page currently resolves a variable to. Read from the live
     element rather than the clone, because the clone is not in the document
     and has no computed style. */
  const styles = getComputedStyle(node);
  const resolve = (value) => String(value).replace(CSS_VAR, (whole, name, fallback) => {
    const found = styles.getPropertyValue(name).trim();
    return found || (fallback ? fallback.trim() : 'currentColor');
  });

  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (attr.value.includes('var(')) el.setAttribute(attr.name, resolve(attr.value));
    }
    if (el.style && el.style.cssText.includes('var(')) {
      el.style.cssText = resolve(el.style.cssText);
    }
  }

  /* A background, because an SVG with no fill behind it opens transparent and
     prints as whatever is underneath it.

     The colour is usually on the element around the drawing rather than on
     the drawing itself, so the parents are walked until something opaque is
     found. Without this the file comes out see through, which looks fine in a
     browser and wrong everywhere else. */
  const opaque = (value) => value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent';
  let bg = styles.getPropertyValue('background-color').trim();
  for (let el = node.parentElement; el && !opaque(bg); el = el.parentElement) {
    bg = getComputedStyle(el).getPropertyValue('background-color').trim();
  }
  if (!opaque(bg)) bg = '#ffffff';

  if (opaque(bg)) {
    const rect = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const box = clone.getAttribute('viewBox');
    if (box) {
      const [x, y, w, h] = box.split(/[\s,]+/).map(Number);
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', w); rect.setAttribute('height', h);
      rect.setAttribute('fill', bg);
      clone.insertBefore(rect, clone.firstChild);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Save an SVG element as a file. */
export function downloadSvg(node, name) {
  const text = standaloneSvg(node);
  if (!text) return false;
  downloadBlob(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), name);
  return true;
}

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
    safeFileName(snap.name, '.kcb.json'),
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
