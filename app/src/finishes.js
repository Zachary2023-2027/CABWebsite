/* ===========================================================================
   Finishes.

   Until now a part had a tone: melamine, ply, mdf or metal. Four words, each
   standing for one hard coded colour, and every white kitchen in the world
   looked identical to every other one. You could type "Charcoal melamine" as
   your board species, pay for it, cut it, and the drawing would still show it
   as off white, because the species name never reached anything that draws.

   A finish is what the board actually looks like: a colour, how much it
   shines, and whether it is dark enough that a label written on it has to
   flip to white. It is attached by role rather than by material name, because
   the roles are what you decide. You choose a carcass board and a front
   board, and two tone is exactly the case where those two differ.

   One source of truth, read by the 3D, the elevation, the picker glyphs, the
   cut list and the print pack, so a colour you set is the colour everywhere.
   =========================================================================== */

/**
 * The finish list.
 *
 * roughness and metalness are what three.js wants for a physical material.
 * They are here rather than in the 3D view so that a finish is one record
 * describing one real product, instead of a colour in one file and a shine in
 * another that nobody remembers to keep in step.
 */
export const FINISHES = {
  white: {
    id: 'white', name: 'White', hex: '#F1EDE6',
    roughness: 0.80, metalness: 0, group: 'Plain',
  },
  'warm-white': {
    id: 'warm-white', name: 'Warm white', hex: '#EFE7D8',
    roughness: 0.78, metalness: 0, group: 'Plain',
  },
  stone: {
    id: 'stone', name: 'Stone', hex: '#D8D2C7',
    roughness: 0.82, metalness: 0, group: 'Plain',
  },
  putty: {
    id: 'putty', name: 'Putty', hex: '#BFB6A6',
    roughness: 0.84, metalness: 0, group: 'Plain',
  },
  sage: {
    id: 'sage', name: 'Sage', hex: '#8E9C86',
    roughness: 0.82, metalness: 0, group: 'Colour',
  },
  navy: {
    id: 'navy', name: 'Navy', hex: '#38465C',
    roughness: 0.80, metalness: 0, group: 'Colour',
  },
  forest: {
    id: 'forest', name: 'Forest', hex: '#3B4E42',
    roughness: 0.80, metalness: 0, group: 'Colour',
  },
  charcoal: {
    id: 'charcoal', name: 'Charcoal', hex: '#3A3B3C',
    roughness: 0.76, metalness: 0, group: 'Colour',
  },
  black: {
    id: 'black', name: 'Black', hex: '#232323',
    roughness: 0.72, metalness: 0, group: 'Colour',
  },
  birch: {
    id: 'birch', name: 'Birch ply', hex: '#D9BD8C',
    roughness: 0.82, metalness: 0, group: 'Timber',
  },
  oak: {
    id: 'oak', name: 'Oak', hex: '#C9A875',
    roughness: 0.80, metalness: 0, group: 'Timber',
  },
  walnut: {
    id: 'walnut', name: 'Walnut', hex: '#6B4E36',
    roughness: 0.78, metalness: 0, group: 'Timber',
  },
  pine: {
    id: 'pine', name: 'Hoop pine', hex: '#E2CFA6',
    roughness: 0.84, metalness: 0, group: 'Timber',
  },
  mdf: {
    id: 'mdf', name: 'Raw MDF', hex: '#C0B49B',
    roughness: 0.90, metalness: 0, group: 'Raw',
  },
  metal: {
    id: 'metal', name: 'Metal', hex: '#9AA0A6',
    roughness: 0.45, metalness: 0.55, group: 'Raw',
  },
};

export const FINISH_LIST = Object.values(FINISHES);
export const FINISH_GROUPS = [...new Set(FINISH_LIST.map((f) => f.group))];

/** A finish by id, falling back rather than throwing. */
export const finish = (id) => FINISHES[id] || FINISHES.white;

/* ---------------------------------------------------------------------------
   Guessing a finish from a board name.

   You type your board species as free text, because your supplier's list is
   not mine. So the name is read for something recognisable and the finish
   follows, which means typing "Charcoal melamine" gets you a charcoal kitchen
   without having to set the colour separately as well.

   Whatever it guesses is only a default. Set the finish and the guess is not
   consulted again.
   --------------------------------------------------------------------------- */

const NAME_HINTS = [
  [/\bwalnut\b/i, 'walnut'],
  [/\boak\b/i, 'oak'],
  [/\b(hoop\s*)?pine\b/i, 'pine'],
  [/\bbirch\b/i, 'birch'],
  [/\b(black|ebony)\b/i, 'black'],
  [/\b(charcoal|graphite|anthracite)\b/i, 'charcoal'],
  [/\bnavy\b/i, 'navy'],
  [/\b(forest|olive)\b/i, 'forest'],
  [/\bsage\b/i, 'sage'],
  [/\b(putty|mushroom|taupe)\b/i, 'putty'],
  [/\b(stone|grey|gray|silver)\b/i, 'stone'],
  [/\bwarm\s*white\b/i, 'warm-white'],
  [/\bwhite\b/i, 'white'],
  [/\b(mdf|hardboard)\b/i, 'mdf'],
  [/\bply\b/i, 'birch'],
];

/** The finish a board name suggests, before anyone has chosen one. */
export function finishFromName(boardName) {
  const name = String(boardName || '');
  for (const [pattern, id] of NAME_HINTS) if (pattern.test(name)) return id;
  return 'white';
}

/* ---------------------------------------------------------------------------
   Roles.

   A part belongs to a role, and a role carries a finish. These are the roles
   worth colouring separately: the ones you can actually buy different board
   for.
   --------------------------------------------------------------------------- */

/* `bench` is here so the benchtop can be a colour you choose rather than one
   fixed grey. It is a drawing and 3D role only: no part is ever built into it,
   so `roleOf` below never returns it and the cut list cannot see it. */
export const ROLES = ['carcass', 'front', 'back', 'box', 'kick', 'panel', 'bench'];

/** The board species a role uses, so the guess has something to read. */
const BOARD_KEY = {
  carcass: 'carcassBoard',
  front: 'frontBoard',
  back: 'backBoard',
  box: 'boxBoard',
  kick: 'kickBoard',
  panel: 'endPanelBoard',
};

/** The config key holding a chosen finish for a role. */
export const finishKey = (role) => `${role}Finish`;

/**
 * The finish a role resolves to.
 *
 * A finish you set wins. Otherwise it is guessed from the board species, and
 * a role with no board of its own falls back to the one it is cut alongside:
 * a kickboard with no board set is carcass board, so it is carcass coloured.
 */
export function finishFor(role, P = {}) {
  const chosen = P[finishKey(role)];
  if (chosen && FINISHES[chosen]) return FINISHES[chosen];

  const own = P[BOARD_KEY[role]];
  if (own) return finish(finishFromName(own));

  /* No board of its own, so it follows whatever it is actually cut from. A
     kickboard with no board set is cut from carcass board, so it should be
     carcass coloured rather than defaulting to white beside a navy kitchen. */
  const follows = { kick: 'carcass', panel: 'front' }[role];
  if (follows) return finishFor(follows, P);

  /* A benchtop is not cut from your cabinet board and never was, so it does
     not follow the carcass. Left alone it is stone, which is what most of
     them are. */
  if (role === 'bench') return FINISHES.stone;

  return finish(finishFromName(P.carcassBoard));
}

/** The role a part belongs to, from the group it was built in. */
export function roleOf(part) {
  const group = part?.group;
  if (group === 'front' || group === 'filler') return 'front';
  if (group === 'back') return 'back';
  if (group === 'box') return 'box';
  if (group === 'kick') return 'kick';
  if (group === 'panel') return 'panel';
  if (group === 'hardware') return 'metal';
  return 'carcass';
}

/* ---------------------------------------------------------------------------
   Two tone.

   A two tone kitchen is the ordinary case, not an exotic one: dark bases,
   light walls, or timber fronts on a white carcass. All it is, is the front
   finish differing from the carcass finish, so the helper says that in one
   move rather than making you find two fields and hope they disagree in the
   way you meant.
   --------------------------------------------------------------------------- */

/** True when the fronts and the carcass are not the same colour. */
export const isTwoTone = (P) => finishFor('front', P).id !== finishFor('carcass', P).id;

/**
 * The config patch that makes a kitchen two tone.
 *
 * Returns only the keys that change, so it composes with whatever else the
 * project already has set.
 */
export const twoTone = (frontFinishId, carcassFinishId) => ({
  [finishKey('front')]: frontFinishId,
  ...(carcassFinishId ? { [finishKey('carcass')]: carcassFinishId } : {}),
});

/** Put every role back to being guessed from its board name. */
export const clearFinishes = () =>
  Object.fromEntries(ROLES.map((r) => [finishKey(r), '']));

/* ---------------------------------------------------------------------------
   Reading a colour.
   --------------------------------------------------------------------------- */

/** Relative luminance, for deciding what a label written on this can be. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255)
    + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

export const INK_DARK = '#232323';
export const INK_LIGHT = '#FFFFFF';

/** Contrast ratio between two colours, the way the accessibility rules define it. */
export function contrast(a, b) {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}

/**
 * Ink that can be read on this finish.
 *
 * Picked by measuring both, not by a luminance threshold. A threshold looks
 * right until a mid tone lands just the wrong side of it: sage is dark enough
 * to fall under a 0.45 cut off, so it took white ink, and white on sage is
 * 2.9 to 1, which is not readable. Measuring says dark ink at 5.2 to 1, which
 * is. The only honest way to choose between two inks is to compare them.
 */
export const inkOn = (hex) =>
  (contrast(hex, INK_LIGHT) >= contrast(hex, INK_DARK) ? INK_LIGHT : INK_DARK);

/** True when a finish is dark enough that light ink reads better on it. */
export const isDark = (hex) => inkOn(hex) === INK_LIGHT;

/* ---------------------------------------------------------------------------
   Shading a finish.

   A panelled door is one colour with a shadow in it. Rather than carrying a
   second and third hex on every finish, the shadow is derived: the same
   colour, moved toward black by a fraction. That way a finish added later
   needs one hex and still draws a shaker door correctly.
   --------------------------------------------------------------------------- */

/** The same colour, darker by `amount` (0 to 1). */
export function darken(hex, amount = 0.22) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const k = Math.max(0, Math.min(1, 1 - amount));
  const ch = (shift) => Math.round(((n >> shift) & 255) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** The same colour, lighter by `amount` (0 to 1). */
export function lighten(hex, amount = 0.16) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const k = Math.max(0, Math.min(1, amount));
  const ch = (shift) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (255 - v) * k);
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** True when a finish is a timber, so the drawing should show grain. */
export const isTimber = (f) => f?.group === 'Timber';
