/* ===========================================================================
   A kitchen in a link.

   There is no server, so there is nowhere to put a project and nothing to
   hand someone a code for. The only thing left is the URL itself: the whole
   design, encoded, after the hash.

   The hash matters. Everything after # is never sent to the server, which on
   GitHub Pages means the design never leaves the two browsers involved. It is
   also the only part of a URL you can change without reloading the page.

   ---------------------------------------------------------------------------
   Making it fit.

   A project is verbose JSON, and a URL has a practical ceiling: browsers cope
   with a lot, but chat apps, mail clients and forums truncate long links, and
   a truncated link is a broken one that looks fine until someone opens it.

   So the payload is squeezed hard before it is encoded, and the result is
   measured rather than hoped about. shareUrl reports the length and whether
   it is likely to survive being pasted somewhere, and the UI says so plainly
   instead of handing over a link that will not work.
   =========================================================================== */

/**
 * Roughly how long a URL can be before things start truncating it.
 *
 * Browsers themselves handle far more than this. The limit that bites is
 * everything in between: mail clients that wrap at a fixed column, chat apps
 * that shorten for display and mangle on copy, forums that stop linkifying.
 * Under this and a link is safe nearly everywhere.
 */
export const SAFE_URL = 2000;

/** Past this a lot of things will truncate it. Still worth offering, warned. */
export const RISKY_URL = 8000;

/* ---------------------------------------------------------------------------
   Squeezing the project.

   Only what cannot be worked out again is kept. Everything the app derives on
   load, which is most of a project, is left out and rebuilt by hydrate. The
   key names go too: they are the single biggest thing in the JSON, and a
   project has the same eight of them repeated once per cabinet.
   --------------------------------------------------------------------------- */

import { PROJECT } from './catalog.js';

/** Config keys worth carrying, in a fixed order, so only values are stored. */
const CFG_KEYS = Object.keys(PROJECT).sort();

/**
 * The project, with everything derivable thrown away.
 *
 * Config is stored as differences from the defaults rather than in full. A
 * project that changed nothing carries nothing, which is the common case and
 * saves most of the payload on its own.
 */
export function squeeze(project) {
  const locks = new Set(project.locked || []);
  const cfg = {};
  for (const k of CFG_KEYS) {
    const v = project.cfg?.[k];
    if (v === undefined || v === null) continue;
    // Same as the default, so it does not need saying.
    if (v === PROJECT[k]) continue;
    cfg[CFG_KEYS.indexOf(k)] = v;
  }

  return {
    n: project.name,
    r: project.room,
    a: project.activeWall,
    c: cfg,
    l: project.locked?.length ? project.locked : undefined,
    x: project.extras?.length ? project.extras : undefined,
    w: project.walls.map((wall) => ({
      i: wall.id,
      m: wall.name,
      L: wall.length,
      k: wall.kind === 'island' ? 1 : undefined,
      D: wall.depth || undefined,
      A: wall.at ? [wall.at.x, wall.at.y] : undefined,
      /* The breakfast bar, as a side and a number. Two characters of link for
         the thing that decides how much benchtop is being bought. */
      B: wall.bar?.depth > 0 ? [wall.bar.side, wall.bar.depth] : undefined,
      o: wall.obstacles?.length ? wall.obstacles : undefined,
      u: wall.units.map((u) => {
        const out = { f: u.familyId };
        /* The id is only carried when something points at it. Nothing else in
           a shared project refers to a cabinet by id: the cut ticks do not
           travel, and the receiver gets a copy with fresh ids anyway. On a
           kitchen of twenty odd cabinets that is a few hundred characters of
           link spent on nothing. */
        if (locks.has(u.uid)) out.d = u.uid;
        if (u.settings && Object.keys(u.settings).length) out.s = u.settings;
        return out;
      }),
    })),
  };
}

/** The squeezed shape back to something hydrate understands. */
export function expand(small) {
  if (!small || typeof small !== 'object' || !Array.isArray(small.w)) return null;

  const cfg = {};
  for (const [index, value] of Object.entries(small.c || {})) {
    const key = CFG_KEYS[Number(index)];
    if (key) cfg[key] = value;
  }

  return {
    project: {
      name: small.n || 'Shared kitchen',
      room: small.r || 'straight',
      activeWall: small.a,
      cfg,
      locked: small.l || [],
      extras: small.x || [],
      walls: small.w.map((wall, i) => ({
        id: wall.i ?? `W${i}`,
        name: wall.m ?? `Wall ${i + 1}`,
        kind: wall.k ? 'island' : 'wall',
        ...(wall.D ? { depth: wall.D } : {}),
        ...(Array.isArray(wall.A) ? { at: { x: wall.A[0], y: wall.A[1] } } : {}),
        ...(Array.isArray(wall.B) ? { bar: { side: wall.B[0], depth: wall.B[1] } } : {}),
        length: wall.L,
        obstacles: wall.o || [],
        units: (wall.u || []).map((u, j) => ({
          // Minted where it was not carried. hydrate does the same for a file.
          uid: u.d || `s${i}-${j}`,
          familyId: u.f,
          settings: u.s || {},
        })),
      })),
    },
    name: small.n || 'Shared kitchen',
  };
}

/* ---------------------------------------------------------------------------
   Encoding.

   Base64url, so the result survives being a URL, being pasted into a message
   and being copied back out. The standard alphabet's + and / and = all get
   mangled somewhere along that path.
   --------------------------------------------------------------------------- */

export function toBase64url(text) {
  /* Through UTF-8 first. btoa only takes Latin-1, so a project named with an
     accent or an emoji throws on the way in and comes back as mojibake on the
     way out. */
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** A project encoded into the fragment of a URL. */
export function encodeProject(project) {
  return toBase64url(JSON.stringify(squeeze(project)));
}

/**
 * A project read back out of a fragment.
 *
 * Returns null rather than throwing on anything malformed. A link is
 * something a stranger pastes, so it is untrusted input and it gets the same
 * treatment a project file does: everything it produces goes through hydrate,
 * which is what actually validates it.
 */
export function decodeProject(encoded) {
  try {
    const parsed = JSON.parse(fromBase64url(String(encoded)));
    return expand(parsed);
  } catch {
    return null;
  }
}

/**
 * The link, and whether it is going to survive being sent.
 *
 * @returns {{url:string, length:number, fits:boolean, risky:boolean}}
 */
export function shareUrl(project, base) {
  const root = String(base ?? (typeof location !== 'undefined' ? location.href : ''))
    .split('#')[0];
  const url = `${root}#k=${encodeProject(project)}`;

  return {
    url,
    length: url.length,
    fits: url.length <= SAFE_URL,
    risky: url.length > RISKY_URL,
  };
}

/** The encoded project in a URL, if there is one. */
export function readShared(href) {
  const hash = String(href ?? (typeof location !== 'undefined' ? location.hash : ''));
  const at = hash.indexOf('#k=');
  if (at < 0) return null;
  return decodeProject(hash.slice(at + 3));
}
