// SVG elevation renderer.
//
// The viewBox is authored directly in inches, so the drawing scales to its
// container for free and every stroke width / font size below is a real-world
// measurement. The same per-unit routine draws both the elevation and the
// miniature icons in the catalog palette, so the palette always reflects the
// currently selected door style and finish.

import { IN, countertop, doorStyle, finish, hardware } from './catalog.js';
import { fmtLen } from './format.js';

// ---- primitives ---------------------------------------------------------

const r3 = (v) => Math.round(v * 1000) / 1000;
const R = (x, y, w, h, a = '') =>
  `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(Math.max(0, w))}" height="${r3(Math.max(0, h))}" ${a}/>`;
const L = (x1, y1, x2, y2, a = '') =>
  `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" ${a}/>`;
const C = (cx, cy, r, a = '') =>
  `<circle cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}" ${a}/>`;

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const label = (x, y, t, size = 2.6) =>
  `<text x="${r3(x)}" y="${r3(y)}" text-anchor="middle" font-size="${size}" fill="var(--sv-dim)" letter-spacing="0.25">${esc(t)}</text>`;

// ---- front layout -------------------------------------------------------

/**
 * Lay out the door/drawer fronts inside a cabinet's front face.
 * Coordinates are relative to the top-left of the front area, in inches.
 */
function frontRects(type, w, h) {
  const r = IN.REVEAL;
  const out = [];

  const cols = (n, y, hh, kind, x0 = 0, w0 = w) => {
    if (n <= 0 || hh <= 0) return;
    const cw = w0 / n;
    for (let i = 0; i < n; i++) {
      // In a pair, each door's pull sits on the inner (opening) stile.
      const side = n === 1 ? 'right' : i < n / 2 ? 'right' : 'left';
      out.push({ x: x0 + i * cw + r, y: y + r, w: cw - 2 * r, h: hh - 2 * r, kind, side });
    }
  };
  const rows = (n, y, hh, kind) => {
    if (n <= 0 || hh <= 0) return;
    const rh = hh / n;
    for (let i = 0; i < n; i++) {
      out.push({ x: r, y: y + i * rh + r, w: w - 2 * r, h: rh - 2 * r, kind });
    }
  };

  switch (type.fronts) {
    case 'doors':
      cols(type.doors, 0, h, 'door');
      break;

    case 'drawers':
      rows(type.drawers, 0, h, 'drawer');
      break;

    case 'topDrawer': {
      const dh = Math.min(6, h * 0.28);
      cols(type.drawers, 0, dh, 'drawer');
      cols(type.doors, dh, h - dh, 'door');
      break;
    }

    case 'sink': {
      const dh = Math.min(6, h * 0.28);
      out.push({ x: r, y: r, w: w - 2 * r, h: dh - 2 * r, kind: 'false' });
      cols(type.doors, dh, h - dh, 'door');
      break;
    }

    case 'corner': {
      const dw = w * 0.62;
      cols(2, 0, h, 'door', 0, dw);
      out.push({ x: dw + r, y: r, w: w - dw - 2 * r, h: h - 2 * r, kind: 'panel' });
      break;
    }

    case 'cornerWall': {
      const dw = w * 0.7;
      cols(1, 0, h, 'door', 0, dw);
      out.push({ x: dw + r, y: r, w: w - dw - 2 * r, h: h - 2 * r, kind: 'panel' });
      break;
    }

    case 'pantry': {
      if (h > 60) {
        const lower = h * 0.42;
        cols(2, 0, h - lower, 'door');
        cols(2, h - lower, lower, 'door');
      } else {
        cols(2, 0, h, 'door');
      }
      break;
    }

    case 'oven': {
      const drawerH = 8;
      const ovenH = 30;
      const doorH = Math.max(10, h - drawerH - ovenH);
      cols(1, 0, doorH, 'door');
      out.push({ x: r, y: doorH + r, w: w - 2 * r, h: ovenH - 2 * r, kind: 'oven' });
      out.push({ x: r, y: doorH + ovenH + r, w: w - 2 * r, h: drawerH - 2 * r, kind: 'drawer' });
      break;
    }

    case 'none':
      out.push({ x: r, y: r, w: w - 2 * r, h: h - 2 * r, kind: 'panel' });
      break;

    case 'open':
    default:
      break; // shelves are drawn by unitMarkup
  }
  return out;
}

// ---- front detail -------------------------------------------------------

function panelMarkup(kind, x, y, w, h, fin) {
  const inset = Math.min(2.25, w * 0.22, h * 0.22);
  if (inset < 0.4) return '';
  const ix = x + inset, iy = y + inset, iw = w - 2 * inset, ih = h - 2 * inset;

  switch (kind) {
    case 'recessed':
      return R(ix, iy, iw, ih, `fill="${fin.detail}" stroke="${fin.edge}" stroke-width="0.11"`);

    case 'raised':
      return (
        R(ix, iy, iw, ih, `fill="${fin.detail}" stroke="${fin.edge}" stroke-width="0.11"`) +
        R(ix + 0.7, iy + 0.7, iw - 1.4, ih - 1.4,
          `fill="${fin.door}" stroke="${fin.edge}" stroke-width="0.09" opacity="0.9"`)
      );

    case 'glass': {
      const p = [R(ix, iy, iw, ih, `fill="var(--sv-glass)" stroke="${fin.edge}" stroke-width="0.13"`)];
      if (iw > 7) p.push(L(ix + iw / 2, iy, ix + iw / 2, iy + ih, `stroke="${fin.edge}" stroke-width="0.11"`));
      if (ih > 10) p.push(L(ix, iy + ih / 2, ix + iw, iy + ih / 2, `stroke="${fin.edge}" stroke-width="0.11"`));
      return p.join('');
    }

    case 'bead': {
      const p = [R(ix, iy, iw, ih, `fill="${fin.detail}" stroke="${fin.edge}" stroke-width="0.11"`)];
      for (let bx = ix + 1.6; bx < ix + iw - 0.4; bx += 1.6) {
        p.push(L(bx, iy + 0.3, bx, iy + ih - 0.3, `stroke="${fin.edge}" stroke-width="0.1" opacity="0.55"`));
      }
      return p.join('');
    }

    default:
      return '';
  }
}

function cupPath(cx, cy, bw) {
  const x1 = cx - bw / 2, x2 = cx + bw / 2, top = cy - 0.75, mid = cy - 0.15;
  return `<path d="M ${r3(x1)},${r3(top)} L ${r3(x1)},${r3(mid)} A ${r3(bw / 2)},${r3(bw / 2)} 0 0 0 ${r3(x2)},${r3(mid)} L ${r3(x2)},${r3(top)} Z" fill="var(--sv-metal)"/>`;
}

function pullMarkup(f, hw, x, y, w, h) {
  if (hw.kind === 'none') return '';
  const fill = 'fill="var(--sv-metal)"';

  if (f.kind === 'drawer') {
    const cx = x + w / 2, cy = y + h / 2;
    switch (hw.kind) {
      case 'knob': return C(cx, cy, 0.6, fill);
      case 'bar': {
        const bw = Math.min(w * 0.45, 6);
        return R(cx - bw / 2, cy - 0.22, bw, 0.44, `rx="0.22" ${fill}`);
      }
      case 'cup': return cupPath(cx, cy, Math.min(w * 0.3, 4));
      case 'edge': return R(x + w * 0.25, y + 0.35, w * 0.5, 0.4, `rx="0.2" ${fill}`);
    }
    return '';
  }

  if (f.kind !== 'door') return '';

  const right = f.side !== 'left';
  const px = right ? x + w - 1.8 : x + 1.8;
  const cy = y + Math.min(h * 0.5, 5);
  switch (hw.kind) {
    case 'knob': return C(px, cy, 0.6, fill);
    case 'bar': {
      const bh = Math.min(h * 0.38, 6);
      return R(px - 0.22, cy - bh / 2, 0.44, bh, `rx="0.22" ${fill}`);
    }
    case 'cup': return cupPath(px, cy, 2.6);
    case 'edge': {
      const ex = right ? x + w - 0.75 : x + 0.35;
      return R(ex, y + h * 0.22, 0.4, h * 0.56, `rx="0.2" ${fill}`);
    }
  }
  return '';
}

function ovenBay(x, y, w, h) {
  return (
    R(x, y, w, h, `rx="0.4" fill="var(--sv-appliance)" stroke="var(--sv-appliance-line)" stroke-width="0.2"`) +
    R(x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.52, `rx="0.3" fill="var(--sv-glass-dark)" opacity="0.75"`) +
    R(x + w * 0.1, y + h * 0.13, w * 0.8, 0.55, `rx="0.27" fill="var(--sv-metal)"`)
  );
}

function frontMarkup(f, ds, fin, hw, ox, oy) {
  const x = ox + f.x, y = oy + f.y, w = f.w, h = f.h;
  if (w <= 0.05 || h <= 0.05) return '';
  if (f.kind === 'oven') return ovenBay(x, y, w, h);

  const p = [R(x, y, w, h, `rx="0.3" fill="${fin.door}" stroke="${fin.edge}" stroke-width="0.16"`)];

  if (fin.grain) {
    const n = Math.max(2, Math.min(6, Math.floor(h / 6)));
    for (let i = 1; i <= n; i++) {
      const gy = y + (h * i) / (n + 1);
      p.push(L(x + 0.6, gy, x + w - 0.6, gy, `stroke="${fin.edge}" stroke-width="0.12" opacity="0.28"`));
    }
  }

  if (f.kind !== 'panel') {
    // Drawers and false fronts are never glazed — fall back to a flat panel.
    const panel = f.kind === 'door' ? ds.panel : ds.panel === 'glass' ? 'recessed' : ds.panel;
    p.push(panelMarkup(panel, x, y, w, h, fin));
    p.push(pullMarkup(f, hw, x, y, w, h));
  }
  return p.join('');
}

// ---- appliances ---------------------------------------------------------

function applianceMarkup(kind, x, y, w, h) {
  const p = [];
  p.push(R(x, y, w, h,
    `rx="0.5" fill="var(--sv-appliance)" stroke="var(--sv-appliance-line)" stroke-width="0.28" stroke-dasharray="1.6 1.1"`));
  const metal = 'fill="var(--sv-metal)"';
  const line = 'stroke="var(--sv-appliance-line)" stroke-width="0.18" fill="none"';

  if (kind === 'range') {
    const ctrl = 5;
    p.push(L(x, y + ctrl, x + w, y + ctrl, line));
    for (let i = 0; i < 4; i++) p.push(C(x + w * (0.18 + i * 0.215), y + ctrl / 2, 0.7, metal));
    p.push(R(x + w * 0.1, y + ctrl + 3, w * 0.8, Math.max(4, h - ctrl - 6.5),
      `rx="0.4" fill="var(--sv-glass-dark)" opacity="0.5"`));
    p.push(R(x + w * 0.08, y + ctrl + 1.2, w * 0.84, 0.6, `rx="0.3" ${metal}`));
    p.push(label(x + w / 2, y + h - 1.4, 'RANGE'));
  } else if (kind === 'dw') {
    p.push(L(x, y + 4.5, x + w, y + 4.5, line));
    p.push(R(x + w * 0.1, y + 1.7, w * 0.8, 0.6, `rx="0.3" ${metal}`));
    p.push(label(x + w / 2, y + h / 2 + 2, 'DW'));
  } else {
    const split = y + h * 0.62;
    p.push(L(x, split, x + w, split, line));
    p.push(L(x + w / 2, y, x + w / 2, split, line));
    p.push(R(x + w * 0.455, y + 5, 0.55, 13, `rx="0.27" ${metal}`));
    p.push(R(x + w * 0.525, y + 5, 0.55, 13, `rx="0.27" ${metal}`));
    p.push(label(x + w / 2, y + h - 2.5, 'FRIDGE'));
  }
  return p.join('');
}

// ---- one cabinet --------------------------------------------------------

/**
 * Draw a single unit. `x`/`y` are the top-left of its box in SVG space;
 * `h` is the full box height including toe kick for floor-standing units.
 * Shared by the elevation and the palette icons.
 */
export function unitMarkup({ x, y, w, h, type, item, ds, fin, hw, selected }) {
  const cls = `unit${selected ? ' is-selected' : ''}`;
  const attrs = item ? `class="${cls}" data-uid="${esc(item.uid)}"` : `class="${cls}"`;

  if (type.appliance) {
    return `<g ${attrs}>${applianceMarkup(type.appliance, x, y, w, h)}</g>`;
  }

  const kick = type.row === 'base' || type.row === 'tall' ? IN.TOE_KICK : 0;
  const fh = h - kick;
  const p = [];

  p.push(R(x, y, w, fh, `fill="var(--sv-carcass)" stroke="var(--sv-carcass-line)" stroke-width="0.16"`));

  if (kick) {
    p.push(R(x + 1.5, y + fh, w - 3, kick, `fill="var(--sv-kick)"`));
    p.push(L(x, y + fh, x + w, y + fh, `stroke="var(--sv-carcass-line)" stroke-width="0.14"`));
  }

  if (type.fronts === 'open') {
    p.push(R(x + 0.6, y + 0.6, w - 1.2, fh - 1.2, `fill="var(--sv-interior)"`));
    const shelves = Math.max(1, Math.round(fh / 12) - 1);
    for (let i = 1; i <= shelves; i++) {
      const sy = y + (fh * i) / (shelves + 1);
      p.push(R(x + 0.6, sy, w - 1.2, 0.75, `fill="${fin.door}" stroke="${fin.edge}" stroke-width="0.1"`));
    }
  } else {
    for (const f of frontRects(type, w, fh)) p.push(frontMarkup(f, ds, fin, hw, x, y));
  }

  if (type.fronts === 'corner' || type.fronts === 'cornerWall') {
    const split = x + w * (type.fronts === 'corner' ? 0.62 : 0.7);
    p.push(L(split, y, x + w, y + fh * 0.16, `stroke="${fin.edge}" stroke-width="0.14" opacity="0.55"`));
  }

  return `<g ${attrs}>${p.join('')}</g>`;
}

// ---- the scene ----------------------------------------------------------

const ROW_ORDER = { base: 0, tall: 1, wall: 2 };

function dimensionLine(x1, x2, y, text) {
  const s = 'stroke="var(--sv-dim)" stroke-width="0.22"';
  return (
    L(x1, y, x2, y, s) + L(x1, y - 2, x1, y + 2, s) + L(x2, y - 2, x2, y + 2, s) +
    `<text x="${r3((x1 + x2) / 2)}" y="${r3(y - 2.4)}" text-anchor="middle" font-size="3.4" fill="var(--sv-dim)">${esc(text)}</text>`
  );
}

/** Full elevation as an `<svg>` string. */
export function scene(state, lay) {
  const W = state.wall.width;
  const H = state.wall.height;
  // An overrunning run must stay visible, not get cropped at the wall edge.
  const contentW = Math.max(W, lay.runWidth);
  const padL = 16, padR = 16, padT = 14, padB = 26;

  const ds = doorStyle(state.style.door);
  const fin = finish(state.style.finish);
  const hw = hardware(state.style.hardware);
  const ct = countertop(state.counter.material);
  const Y = (aboveFloor) => H - aboveFloor;

  const g = [];

  g.push(R(0, 0, W, H, 'fill="var(--sv-wall)"'));
  g.push(R(0, 0, W, H, 'fill="none" stroke="var(--sv-wall-line)" stroke-width="0.3"'));
  g.push(L(0, 0, W, 0, 'stroke="var(--sv-dim)" stroke-width="0.25" stroke-dasharray="2 2" opacity="0.7"'));

  // floor line + hatch
  g.push(L(-padL + 4, H, contentW + padR - 4, H, 'stroke="var(--sv-floor)" stroke-width="0.55"'));
  for (let hx = -padL + 4; hx < contentW + padR - 4; hx += 4) {
    g.push(L(hx, H + 4.5, hx + 3, H, 'stroke="var(--sv-floor)" stroke-width="0.22" opacity="0.5"'));
  }

  for (const p of [...lay.placed].sort((a, b) => ROW_ORDER[a.row] - ROW_ORDER[b.row])) {
    g.push(unitMarkup({
      x: p.x, y: Y(p.top), w: p.w, h: p.h,
      type: p.type, item: p.item, ds, fin, hw,
      selected: state.selected === p.item.uid,
    }));
  }

  if (state.counter.enabled) {
    for (const s of lay.counterSegments) {
      g.push(R(s.x - 0.75, Y(IN.BASE_BOX_H + IN.COUNTER_T), s.w + 1.5, IN.COUNTER_T,
        `rx="0.2" fill="${ct.color}" stroke="var(--sv-carcass-line)" stroke-width="0.16"`));
    }
  }

  if (lay.runWidth > 0) {
    g.push(dimensionLine(0, lay.runWidth, H + 13, fmtLen(lay.runWidth, state.units)));
  }
  g.push(`<text x="${r3(contentW)}" y="-4.5" text-anchor="end" font-size="3" fill="var(--sv-dim)">${esc(fmtLen(H, state.units))} ceiling · ${esc(fmtLen(W, state.units))} wall</text>`);

  const vb = `${-padL} ${-padT} ${contentW + padL + padR} ${H + padT + padB}`;
  const alt = `Kitchen elevation: ${lay.placed.length} units across ${fmtLen(lay.runWidth, state.units)} of a ${fmtLen(W, state.units)} wall.`;

  return `<svg class="elevation${state.selected ? ' has-selection' : ''}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(alt)}">${g.join('')}</svg>`;
}

/** Miniature of a cabinet type for the catalog palette. */
export function paletteIcon(type, ds, fin, hw) {
  const w = type.defaultWidth;
  const h = type.row === 'base' ? IN.BASE_BOX_H : type.defaultHeight ?? 30;
  const body = unitMarkup({ x: 0, y: 0, w, h, type, item: null, ds, fin, hw });
  return `<svg class="icon" viewBox="-1 -1 ${r3(w + 2)} ${r3(h + 2)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${body}</svg>`;
}
