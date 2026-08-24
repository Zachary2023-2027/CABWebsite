/* ===========================================================================
   Front detail for the 2D elevation.

   The drawing used to show a door as a coloured rectangle. That is what a door
   is on the cut list, and it is not what a door looks like, so an elevation of
   a whole kitchen came out as a wall of blank panels and you could not tell a
   bank of drawers from a pair of doors without counting the lines.

   This is the vocabulary that fixes it: what a door style does to the face of
   a front, where the handle goes, and how timber reads. It is geometry only.
   No colour is decided here and no part is invented here: everything below
   decorates a rectangle the part list already put on the wall, in the
   millimetres that rectangle is really in.

   Pure. No React, no DOM, no three.js.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Door styles.

   These change the drawing and nothing else. A shaker door is still one
   rectangle of board on the cut list, because the app does not build a door
   out of rails and stiles: it buys or makes the door as a panel. Say that
   plainly wherever the choice is offered rather than implying a build change.
   --------------------------------------------------------------------------- */

export const DOOR_STYLES = [
  { id: 'slab', name: 'Slab', panel: 'none' },
  { id: 'shaker', name: 'Shaker', panel: 'recessed' },
  { id: 'raised', name: 'Raised', panel: 'raised' },
  { id: 'glass', name: 'Glass', panel: 'glass' },
  { id: 'bead', name: 'Beadboard', panel: 'bead' },
];

export const DOOR_STYLE_IDS = DOOR_STYLES.map((d) => d.id);

/** A door style by id, falling back rather than throwing. */
export const doorStyle = (id) =>
  DOOR_STYLES.find((d) => d.id === id) || DOOR_STYLES[1];

/* ---------------------------------------------------------------------------
   Handles.

   The count is not decided here. Every door and every drawer already takes one
   handle in the fittings list and that is what gets priced, so choosing a
   different shape moves the drawing and leaves the order list alone.
   --------------------------------------------------------------------------- */

export const HANDLES = [
  { id: 'none', name: 'None', kind: 'none' },
  { id: 'knob', name: 'Knob', kind: 'knob' },
  { id: 'bar', name: 'Bar', kind: 'bar' },
  { id: 'cup', name: 'Cup', kind: 'cup' },
  { id: 'edge', name: 'Edge', kind: 'edge' },
];

export const HANDLE_IDS = HANDLES.map((h) => h.id);

/** A handle by id, falling back rather than throwing. */
export const handleStyle = (id) =>
  HANDLES.find((h) => h.id === id) || HANDLES[2];

/* ---------------------------------------------------------------------------
   The face of a front.
   --------------------------------------------------------------------------- */

/**
 * The stile width on a panelled front, in millimetres.
 *
 * A real shaker stile is 57 to 70mm and does not grow with the door, so it is
 * capped. It does shrink on a small front: a 140mm drawer face with a 60mm
 * stile each side has no panel left, and a drawing of a frame with nothing in
 * it is worse than a plain slab.
 *
 * Returns 0 when there is no room for a panel worth drawing.
 */
export function stile(w, h) {
  const s = Math.min(60, w * 0.22, h * 0.22);
  return s < 10 ? 0 : s;
}

/**
 * The panel opening inside a front, or null when the front is too small.
 * Coordinates are relative to the front's own top-left corner.
 */
export function panelRect(w, h) {
  const s = stile(w, h);
  if (!s) return null;
  return { x: s, y: s, w: w - 2 * s, h: h - 2 * s };
}

/**
 * Where the grain runs on a timber front.
 *
 * Along the length of the door, which on a kitchen front is up and down, so
 * the lines are horizontal on the elevation and spaced roughly a board's width
 * apart. Returns y offsets from the top of the front.
 */
export function grainLines(h) {
  const n = Math.max(2, Math.min(6, Math.floor(h / 150)));
  return Array.from({ length: n }, (_, i) => (h * (i + 1)) / (n + 1));
}

/**
 * Vertical bead positions across a beadboard panel, as x offsets from the
 * panel's left edge. 55mm apart, which is what a beaded panel actually is.
 */
export function beadLines(w) {
  const out = [];
  for (let x = 55; x < w - 10; x += 55) out.push(x);
  return out;
}

/**
 * Muntin lines across a glazed light, as offsets inside the panel.
 * A small light gets none: two panes of glass 90mm wide is a joke.
 */
export function muntins(w, h) {
  return {
    v: w > 320 ? [w / 2] : [],
    h: h > 460 ? [h / 2] : [],
  };
}

/* ---------------------------------------------------------------------------
   Handles.
   --------------------------------------------------------------------------- */

/**
 * Which side of a door the handle goes on.
 *
 * On the opening stile, which is the one away from the hinges. In a pair the
 * two doors open away from each other, so the handles meet in the middle. A
 * single door is hung on the left by convention here, so its handle is on the
 * right. Decided from where the front sits inside its own cabinet, because
 * that is the only thing the part list actually says about it.
 */
export function openingSide(frontX, frontW, unitW) {
  const centre = frontX + frontW / 2;
  const off = centre - unitW / 2;
  if (Math.abs(off) < unitW * 0.08) return 'right';   // one door, centred
  return off < 0 ? 'right' : 'left';                  // left door opens right
}

const SETBACK = 46;   // handle centre in from the opening edge, mm
const KNOB_R = 15;
const BAR_T = 11;     // bar and edge pull thickness

/**
 * The handle on one front, in millimetres relative to the front's top-left.
 *
 * Returns null when there is nothing to draw. Otherwise one of:
 *   { shape: 'knob',  cx, cy, r }
 *   { shape: 'bar',   x, y, w, h }        a rounded rectangle
 *   { shape: 'cup',   cx, cy, w }         drawn as a path by the caller
 *
 * `kind` is a handle kind, `isDrawer` says which way the front opens, `side`
 * is the opening side for a door, and `place` is the end of a door the handle
 * belongs at: `top` for anything you reach down to, `bottom` for anything
 * above your head. A handle 130mm from the top of a 2100mm pantry door is out
 * of reach, and one at the top of a wall cabinet door is worse.
 */
export function handleAt(kind, isDrawer, side, w, h, place = 'top') {
  if (kind === 'none' || w < 60 || h < 60) return null;

  if (isDrawer) {
    const cx = w / 2;
    const cy = h / 2;
    switch (kind) {
      case 'knob':
        return { shape: 'knob', cx, cy, r: KNOB_R };
      case 'bar': {
        const bw = Math.min(w * 0.45, 160);
        return { shape: 'bar', x: cx - bw / 2, y: cy - BAR_T / 2, w: bw, h: BAR_T };
      }
      case 'cup':
        return { shape: 'cup', cx, cy, w: Math.min(w * 0.3, 100) };
      case 'edge': {
        /* A lip along the top of the drawer face, which is where your fingers
           actually go on a handleless kitchen. */
        const bw = w * 0.5;
        return { shape: 'bar', x: (w - bw) / 2, y: 9, w: bw, h: 10 };
      }
      default:
        return null;
    }
  }

  const right = side !== 'left';
  const px = right ? w - SETBACK : SETBACK;
  const inset = Math.min(h * 0.5, 130);
  const cy = place === 'bottom' ? h - inset : inset;

  switch (kind) {
    case 'knob':
      return { shape: 'knob', cx: px, cy, r: KNOB_R };
    case 'bar': {
      const bh = Math.min(h * 0.38, 160);
      return { shape: 'bar', x: px - BAR_T / 2, y: cy - bh / 2, w: BAR_T, h: bh };
    }
    case 'cup':
      return { shape: 'cup', cx: px, cy, w: 66 };
    case 'edge': {
      /* Down the opening edge itself, not set in from it. Full height, so it
         does not care which end you reach for. */
      const ex = right ? w - 19 : 9;
      return { shape: 'bar', x: ex, y: h * 0.22, w: 10, h: h * 0.56 };
    }
    default:
      return null;
  }
}

/**
 * A cup pull, as an SVG path. Its shape is the reason it is a path: a cup is
 * a half round hollow with two flat ends, and no rectangle says that.
 * `cx`/`cy` are absolute, in drawing millimetres.
 */
export function cupPath(cx, cy, w) {
  const r = w / 2;
  const x1 = cx - r;
  const x2 = cx + r;
  const top = cy - 19;
  const mid = cy - 4;
  return `M ${x1},${top} L ${x1},${mid} A ${r},${r} 0 0 0 ${x2},${mid} L ${x2},${top} Z`;
}

/* ---------------------------------------------------------------------------
   Appliances.

   A cavity is a hole in the run with nothing supplied in it, and the drawing
   has always said so with a dashed box and a word. The word is still there,
   but a fridge drawn as a fridge is read at a glance from across the room and
   a box with FRIDGE in it is not.

   Each returns geometry as fractions of the cavity, so one description works
   at any size. The caller multiplies by width and height.
   --------------------------------------------------------------------------- */

/**
 * How to draw one appliance cavity.
 *
 * `lines` are full width horizontals, `splits` are full height verticals,
 * `panels` are inset rectangles (a glass oven door), `knobs` are round
 * controls, `bars` are handles. Everything is 0..1 of the cavity.
 */
export function applianceGlyph(kind) {
  switch (kind) {
    case 'fridge':
      return {
        splits: [{ x: 0.5, y0: 0, y1: 0.62 }],
        lines: [0.62],
        bars: [
          { x: 0.45, y: 0.14, w: 0.022, h: 0.3 },
          { x: 0.53, y: 0.14, w: 0.022, h: 0.3 },
          { x: 0.45, y: 0.68, w: 0.022, h: 0.22 },
        ],
      };

    case 'dw':
      return {
        lines: [0.26],
        bars: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.05 }],
        panels: [{ x: 0.08, y: 0.34, w: 0.84, h: 0.56, glass: false }],
      };

    case 'cooktop':
      /* A freestanding cooker: burners on top, a control strip, an oven door
         with a handle under it. */
      return {
        knobs: [
          { cx: 0.22, cy: 0.06, r: 0.035 },
          { cx: 0.4, cy: 0.06, r: 0.035 },
          { cx: 0.6, cy: 0.06, r: 0.035 },
          { cx: 0.78, cy: 0.06, r: 0.035 },
        ],
        lines: [0.13],
        bars: [{ x: 0.08, y: 0.17, w: 0.84, h: 0.035 }],
        panels: [{ x: 0.1, y: 0.28, w: 0.8, h: 0.62, glass: true }],
      };

    case 'cooktopOven':
      /* The cooktop is cut into the benchtop above, so what shows on the
         cabinet face is the oven alone. */
      return {
        bars: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.05 }],
        panels: [{ x: 0.1, y: 0.2, w: 0.8, h: 0.68, glass: true }],
      };

    case 'hood':
      /* A canopy over a flue, drawn as the trapezoid it is. */
      return { canopy: true };

    case 'washer':
      return {
        lines: [0.2],
        knobs: [{ cx: 0.78, cy: 0.11, r: 0.05 }],
        panels: [{ x: 0.16, y: 0.3, w: 0.68, h: 0.6, glass: true, round: true }],
      };

    default:
      return {};
  }
}
