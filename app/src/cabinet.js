/* ===========================================================================
   Cabinet part list. One source for both the cut list and the 3D geometry.
   Nothing here is drawn or approximated: every part carries its real cut
   size in millimetres, and the 3D box is built from that same size.

   Cut list convention is length x width x thickness. Placement is separate,
   because a 720 x 560 x 16 side stands up on its edge in the world.

   Frameless European carcass, 32mm system, all dimensions mm.
   =========================================================================== */

import { fmt } from './mm.js';

export const DEFAULTS = {
  width: 600,          // outside width of the carcass
  depth: 560,          // carcass depth, benchtop overhangs this
  carcassHeight: 720,  // 150 kick + 720 carcass + 30 benchtop = 900 finished
  carcassThk: 16,
  backThk: 6,
  frontThk: 18,
  railWidth: 100,      // top rails on a drawer cabinet, no full top
  drawers: 3,
  reveal: 3,           // gap between drawer fronts
  sideReveal: 2,       // gap each side of the front
  runnerLength: 500,
  runnerClearance: 21, // each side, Blum style
  boxSideThk: 16,
  boxBaseThk: 6,
  boxHeight: 140,
  boxSetback: 20,      // box front behind the carcass front face
  baseGroove: 10,      // drawer base sits this far up the box side
  kick: 150,
};

export const MATERIALS = {
  carcass: { name: 'White melamine 16mm', tone: 'melamine' },
  back: { name: 'MDF 6mm', tone: 'mdf' },
  front: { name: 'White melamine 18mm', tone: 'front' },
  box: { name: 'Birch ply 16mm', tone: 'ply' },
  boxBase: { name: 'Birch ply 6mm', tone: 'ply' },
};

const part = (o) => ({ drawer: null, ...o });

/**
 * Build a three drawer base cabinet.
 * @returns {{id, name, cfg, size, parts, hardware}}
 *   part.size is [x, y, z] in world axes, part.pos is the minimum corner.
 *   part.explode is the offset in mm applied at 100 percent exploded.
 */
export function buildCabinet(id = 'B03', cfg = DEFAULTS) {
  const c = { ...DEFAULTS, ...cfg };
  const {
    width: W, depth: D, carcassHeight: H,
    carcassThk: T, backThk: BT, frontThk: FT, railWidth: RW,
    drawers: N, reveal: R, sideReveal: SR,
    runnerLength: RL, runnerClearance: RC,
    boxSideThk: BST, boxBaseThk: BBT, boxHeight: BH, boxSetback: BS, baseGroove: BG,
  } = c;

  const internalW = W - 2 * T;          // 568
  const bottomDepth = D - BT;           // 554, the back sits behind it
  const backHeight = H - T;             // 704, from the top of the bottom up
  const frontW = W - 2 * SR;            // 596
  const frontH = (H - (N - 1) * R) / N; // 238
  const boxW = internalW - 2 * RC;      // 526
  const boxInnerW = boxW - 2 * BST;     // 494
  const boxInnerD = RL - 2 * BST;       // 468
  const boxX = T + RC;                  // 37
  const boxZ = D - BS - RL;             // 40

  const p = [];
  const code = (s) => `${id}-${s}`;

  /* --- carcass --------------------------------------------------------- */

  p.push(part({
    code: code('SIDE-L'), name: 'Left side', group: 'carcass', material: MATERIALS.carcass,
    L: H, W: D, T,
    size: [T, H, D], pos: [0, 0, 0], explode: [-260, 0, 0],
    edging: 'Front edge',
  }));
  p.push(part({
    code: code('SIDE-R'), name: 'Right side', group: 'carcass', material: MATERIALS.carcass,
    L: H, W: D, T,
    size: [T, H, D], pos: [W - T, 0, 0], explode: [260, 0, 0],
    edging: 'Front edge',
  }));
  p.push(part({
    code: code('BOT'), name: 'Bottom', group: 'carcass', material: MATERIALS.carcass,
    L: internalW, W: bottomDepth, T,
    size: [internalW, T, bottomDepth], pos: [T, 0, BT], explode: [0, -200, 0],
    edging: 'Front edge',
  }));
  p.push(part({
    code: code('RAIL-TB'), name: 'Top rail, back', group: 'carcass', material: MATERIALS.carcass,
    L: internalW, W: RW, T,
    size: [internalW, T, RW], pos: [T, H - T, BT], explode: [0, 210, -70],
  }));
  p.push(part({
    code: code('RAIL-TF'), name: 'Top rail, front', group: 'carcass', material: MATERIALS.carcass,
    L: internalW, W: RW, T,
    size: [internalW, T, RW], pos: [T, H - T, D - RW], explode: [0, 210, 70],
    edging: 'Front edge',
  }));
  p.push(part({
    code: code('BACK'), name: 'Back', group: 'back', material: MATERIALS.back,
    L: internalW, W: backHeight, T: BT,
    size: [internalW, backHeight, BT], pos: [T, T, 0], explode: [0, 0, -280],
  }));

  /* --- drawer fronts and boxes, numbered from the top ------------------ */

  for (let i = 0; i < N; i++) {
    const n = i + 1;
    const frontY = H - frontH - i * (frontH + R);
    const boxY = frontY + 20;

    p.push(part({
      code: code(`DRWR-F${n}`), name: `Drawer front ${n}`, group: 'front', material: MATERIALS.front,
      L: frontW, W: Math.round(frontH), T: FT, drawer: n,
      size: [frontW, frontH, FT], pos: [SR, frontY, D], explode: [0, 0, 360],
      edging: 'All four edges',
    }));

    const shift = [0, 0, 170];   // the whole box clears the carcass first
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

    p.push(part({
      code: code(`DRWR${n}-SIDE-L`), name: `Drawer ${n} box, left side`, group: 'box', material: MATERIALS.box,
      L: RL, W: BH, T: BST, drawer: n,
      size: [BST, BH, RL], pos: [boxX, boxY, boxZ], explode: add([-170, 0, 0], shift),
    }));
    p.push(part({
      code: code(`DRWR${n}-SIDE-R`), name: `Drawer ${n} box, right side`, group: 'box', material: MATERIALS.box,
      L: RL, W: BH, T: BST, drawer: n,
      size: [BST, BH, RL], pos: [boxX + boxW - BST, boxY, boxZ], explode: add([170, 0, 0], shift),
    }));
    p.push(part({
      code: code(`DRWR${n}-FRONT`), name: `Drawer ${n} box, front`, group: 'box', material: MATERIALS.box,
      L: boxInnerW, W: BH, T: BST, drawer: n,
      size: [boxInnerW, BH, BST], pos: [boxX + BST, boxY, boxZ + RL - BST], explode: add([0, 0, 150], shift),
    }));
    p.push(part({
      code: code(`DRWR${n}-BACK`), name: `Drawer ${n} box, back`, group: 'box', material: MATERIALS.box,
      L: boxInnerW, W: BH, T: BST, drawer: n,
      size: [boxInnerW, BH, BST], pos: [boxX + BST, boxY, boxZ], explode: add([0, 0, -150], shift),
    }));
    p.push(part({
      code: code(`DRWR${n}-BASE`), name: `Drawer ${n} base`, group: 'box', material: MATERIALS.boxBase,
      L: boxInnerW, W: boxInnerD, T: BBT, drawer: n,
      size: [boxInnerW, BBT, boxInnerD], pos: [boxX + BST, boxY + BG, boxZ + BST], explode: add([0, -150, 0], shift),
    }));
  }

  /* --- hardware. Not in the cut list, it has its own shopping list. ----- */

  const hardware = [];
  for (let i = 0; i < N; i++) {
    const n = i + 1;
    const boxY = H - frontH - i * (frontH + R) + 20;
    for (const [sfx, x, dir] of [['L', T, -1], ['R', W - T - 13, 1]]) {
      hardware.push(part({
        code: code(`DRWR${n}-RUNNER-${sfx}`), name: `Runner ${RL}mm, ${sfx === 'L' ? 'left' : 'right'}`,
        group: 'hardware', material: { name: `Drawer runner ${RL}mm`, tone: 'metal' },
        L: RL, W: 45, T: 13, drawer: n,
        size: [13, 45, RL], pos: [x, boxY + 30, boxZ], explode: [dir * 230, 0, 170],
      }));
    }
  }

  return {
    id,
    name: `${N} drawer base, ${W} wide`,
    cfg: c,
    size: [W, H, D],
    parts: p,
    hardware,
  };
}

/**
 * Bounding box of the whole assembly at a given explode amount, 0 to 1.
 * The viewer frames the camera from this, so nothing leaves the frame while
 * the exploded slider is dragged.
 */
export function bounds(cab, t = 0) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of [...cab.parts, ...cab.hardware]) {
    for (let a = 0; a < 3; a++) {
      const lo = p.pos[a] + p.explode[a] * t;
      if (lo < min[a]) min[a] = lo;
      if (lo + p.size[a] > max[a]) max[a] = lo + p.size[a];
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Runner travel, used by the open state. Full extension runners. */
export const runnerTravel = (cfg = DEFAULTS) => cfg.runnerLength;

/* fmt lives in mm.js now, so there is one implementation. Re-exported here
   because several screens already import it from this module. A re-export on
   its own would not put fmt in this module's scope, and cutSize below needs
   it, so it is imported as well. */
export { fmt };

/** The cut list line for a part, in the order the brief asks for. */
export const cutSize = (p) => `${fmt(p.L)} x ${fmt(p.W)} x ${fmt(p.T)}`;
