/* ===========================================================================
   Cabinet catalog. One generic carcass builder, driven by a family record.
   Every unit returns a real part list, so the elevation, the 3D and the cut
   list are all reading the same numbers.

   Frameless European carcass, 32mm system. All dimensions mm, all costs AUD.
   =========================================================================== */

export const PROJECT = {
  benchHeight: 900,     // finished benchtop height
  benchThk: 30,
  benchDepth: 600,      // overhangs the 560 carcass
  kick: 150,
  baseDepth: 560,
  wallDepth: 320,
  wallMount: 1500,      // underside of wall cabinets, 600 splashback
  wallCabHeight: 720,
  tallHeight: 2100,     // plus kick, 2250 overall
  ceiling: 2400,
  carcassThk: 16,
  backThk: 6,
  frontThk: 18,
  reveal: 3,
  runnerClearance: 21,
  boxSideThk: 16,
  boxBaseThk: 6,
  boxHeight: 140,
  boxSetback: 20,
  baseGroove: 10,
  shelfSetback: 20,
  runnerLength: 500,
};

/* Seeded prices. Estimates, shown as such everywhere they appear. */
export const PRICES = {
  estimate: true,
  sheets: {
    'White melamine 16mm': { size: [2400, 1200], cost: 68 },
    'White melamine 18mm': { size: [2400, 1200], cost: 82 },
    'MDF 6mm': { size: [2400, 1200], cost: 28 },
    'Birch ply 16mm': { size: [2440, 1220], cost: 145 },
    'Birch ply 6mm': { size: [2440, 1220], cost: 78 },
  },
  hinge: 6.5,
  runnerPair: 28,
  handle: 9,
  benchPerMetre: 320,
  kickPerMetre: 26,
  edgeTapePerMetre: 0.6,
};

const MAT = {
  carcass: 'White melamine 16mm',
  front: 'White melamine 18mm',
  back: 'MDF 6mm',
  box: 'Birch ply 16mm',
  boxBase: 'Birch ply 6mm',
};

const TONE = {
  'White melamine 16mm': 'melamine',
  'White melamine 18mm': 'front',
  'MDF 6mm': 'mdf',
  'Birch ply 16mm': 'ply',
  'Birch ply 6mm': 'ply',
};

/* --- families -------------------------------------------------------------
   kind drives placement and which run the unit occupies.
   fronts drives the front elevation and which parts get built. */

export const FAMILIES = [
  { id: 'base-1door', group: 'Base', name: 'Base, 1 door', kind: 'base', fronts: 'doors',
    desc: 'One door, one shelf. Narrow runs and end cabinets.',
    widths: [300, 350, 400, 450, 500, 550, 600], def: { width: 450, doors: 1, shelves: 1 }, glyph: 'door1' },

  { id: 'base-2door', group: 'Base', name: 'Base, 2 door', kind: 'base', fronts: 'doors',
    desc: 'Pair of doors, one shelf. The everyday base cabinet.',
    widths: [600, 700, 800, 900, 1000], def: { width: 800, doors: 2, shelves: 1 }, glyph: 'door2' },

  { id: 'base-3drawer', group: 'Base', name: 'Base, 3 drawer', kind: 'base', fronts: 'drawers',
    desc: 'Three equal drawers on full extension runners.',
    widths: [400, 450, 500, 600, 700, 800, 900], def: { width: 600, drawers: 3 }, glyph: 'drawer3' },

  { id: 'base-4drawer', group: 'Base', name: 'Base, 4 drawer', kind: 'base', fronts: 'drawers',
    desc: 'Four drawers. Cutlery over pots.',
    widths: [400, 450, 500, 600, 700, 800], def: { width: 600, drawers: 4 }, glyph: 'drawer4' },

  { id: 'base-sink', group: 'Base', name: 'Sink base', kind: 'base', fronts: 'sink',
    desc: 'False front over two doors. No shelf, waste clear.',
    widths: [800, 900, 1000, 1200], def: { width: 900, doors: 2, shelves: 0 }, glyph: 'sink' },

  { id: 'base-corner', group: 'Base', name: 'Blind corner', kind: 'base', fronts: 'doors',
    desc: 'Runs into the corner. One door, blind return.',
    widths: [900, 1000, 1050], def: { width: 900, doors: 1, shelves: 1 }, glyph: 'corner' },

  { id: 'wall-1door', group: 'Wall', name: 'Wall, 1 door', kind: 'wall', fronts: 'doors',
    desc: 'One door, two shelves, 320 deep.',
    widths: [300, 350, 400, 450, 500, 600], def: { width: 450, doors: 1, shelves: 2 }, glyph: 'door1' },

  { id: 'wall-2door', group: 'Wall', name: 'Wall, 2 door', kind: 'wall', fronts: 'doors',
    desc: 'Pair of doors, two shelves, 320 deep.',
    widths: [600, 700, 800, 900, 1000], def: { width: 800, doors: 2, shelves: 2 }, glyph: 'door2' },

  { id: 'wall-bridge', group: 'Wall', name: 'Bridge', kind: 'wall', fronts: 'doors',
    desc: 'Short cabinet over a cooktop or window.',
    widths: [600, 700, 800, 900], def: { width: 900, doors: 2, shelves: 0, height: 450 }, glyph: 'bridge' },

  { id: 'wall-open', group: 'Wall', name: 'Open shelves', kind: 'wall', fronts: 'open',
    desc: 'No doors. Two shelves, all edges taped.',
    widths: [600, 700, 800, 900], def: { width: 800, shelves: 2 }, glyph: 'open' },

  { id: 'tall-pantry', group: 'Tall', name: 'Pantry', kind: 'tall', fronts: 'doors',
    desc: 'Floor to 2250. Four doors, five shelves.',
    widths: [450, 500, 600, 700, 800, 900], def: { width: 600, doors: 2, shelves: 5 }, glyph: 'pantry' },

  { id: 'tall-oven', group: 'Tall', name: 'Oven tower', kind: 'tall', fronts: 'oven',
    desc: 'Oven cavity at 600, door above, drawer below.',
    widths: [600], def: { width: 600, doors: 1, drawers: 1, shelves: 1 }, glyph: 'oven' },

  { id: 'app-fridge', group: 'Appliance', name: 'Fridge space', kind: 'appliance', fronts: 'none',
    desc: 'Blocked out cavity. No parts, no cost.',
    widths: [900, 1000, 1100, 1200], def: { width: 1000, height: 2250 }, glyph: 'fridge' },

  { id: 'app-dishwasher', group: 'Appliance', name: 'Dishwasher space', kind: 'appliance', fronts: 'none',
    desc: 'Under bench cavity, 600 standard.',
    widths: [600, 450], def: { width: 600 }, glyph: 'dw' },

  { id: 'app-cooktop', group: 'Appliance', name: 'Cooktop space', kind: 'appliance', fronts: 'none',
    desc: 'Freestanding cooker cavity, benchtop broken.',
    widths: [600, 700, 900], def: { width: 900 }, glyph: 'cooktop' },

  { id: 'filler', group: 'Filler', name: 'Filler', kind: 'filler', fronts: 'none',
    desc: 'Scribe strip against a wall or appliance.',
    widths: [20, 30, 40, 50, 75, 100], def: { width: 40 }, glyph: 'filler' },
];

export const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
export const GROUPS = [...new Set(FAMILIES.map((f) => f.group))];

/* --- carcass builder ------------------------------------------------------ */

const mkPart = (o) => ({ drawer: null, tone: TONE[o.material] || 'melamine', ...o });

function carcassHeightFor(kind, P) {
  if (kind === 'wall') return P.wallCabHeight;
  if (kind === 'tall') return P.tallHeight;
  return P.benchHeight - P.benchThk - P.kick;   // 720
}

function depthFor(kind, P) {
  return kind === 'wall' ? P.wallDepth : P.baseDepth;
}

/**
 * Build one unit from its family and instance settings.
 * @returns {{id,familyId,name,kind,width,height,depth,mountY,parts,hardware,size}}
 */
export function buildUnit(id, familyId, inst = {}, cfg = PROJECT) {
  const P = { ...PROJECT, ...cfg };
  const fam = FAMILY[familyId];
  if (!fam) throw new Error(`Unknown family ${familyId}`);

  const s = { ...fam.def, ...inst };
  const W = s.width;
  const kind = fam.kind;
  const H = s.height ?? carcassHeightFor(kind, P);
  const D = s.depth ?? depthFor(kind, P);
  const mountY = kind === 'wall' ? P.wallMount : P.kick;

  const parts = [];
  const fittings = [];
  const code = (x) => `${id}-${x}`;

  /* Appliance cavities and fillers are volumes, not cabinets. */
  if (kind === 'appliance') {
    return {
      id, familyId, family: fam, name: fam.name, kind, settings: s,
      width: W, height: s.height ?? (P.benchHeight - P.benchThk - P.kick), depth: D,
      mountY: kind === 'appliance' && s.height >= 2000 ? 0 : P.kick,
      size: [W, s.height ?? (P.benchHeight - P.benchThk - P.kick), D],
      parts: [], hardware: [], fittings: [], cfg: P, breaksBench: familyId === 'app-cooktop',
      fullHeight: (s.height ?? 0) >= 2000,
    };
  }

  if (kind === 'filler') {
    parts.push(mkPart({
      code: code('FILL'), name: 'Filler strip', group: 'filler', material: MAT.front,
      L: H, W, T: P.frontThk,
      size: [W, H, P.frontThk], pos: [0, 0, D - P.frontThk], explode: [0, 0, 200],
      edging: 'One long edge',
    }));
    return { id, familyId, family: fam, name: fam.name, kind, settings: s,
      width: W, height: H, depth: D, mountY: P.kick, size: [W, H, D],
      parts, fittings, hardware: [], cfg: P };
  }

  const T = P.carcassThk;
  const BT = P.backThk;
  const internalW = W - 2 * T;
  const bottomDepth = D - BT;
  const isBase = kind === 'base';

  parts.push(mkPart({
    code: code('SIDE-L'), name: 'Left side', group: 'carcass', material: MAT.carcass,
    L: H, W: D, T, size: [T, H, D], pos: [0, 0, 0], explode: [-260, 0, 0], edging: 'Front edge',
  }));
  parts.push(mkPart({
    code: code('SIDE-R'), name: 'Right side', group: 'carcass', material: MAT.carcass,
    L: H, W: D, T, size: [T, H, D], pos: [W - T, 0, 0], explode: [260, 0, 0], edging: 'Front edge',
  }));
  parts.push(mkPart({
    code: code('BOT'), name: 'Bottom', group: 'carcass', material: MAT.carcass,
    L: internalW, W: bottomDepth, T,
    size: [internalW, T, bottomDepth], pos: [T, 0, BT], explode: [0, -200, 0], edging: 'Front edge',
  }));

  if (isBase) {
    const RW = 100;
    parts.push(mkPart({
      code: code('RAIL-TB'), name: 'Top rail, back', group: 'carcass', material: MAT.carcass,
      L: internalW, W: RW, T, size: [internalW, T, RW], pos: [T, H - T, BT], explode: [0, 210, -70],
    }));
    parts.push(mkPart({
      code: code('RAIL-TF'), name: 'Top rail, front', group: 'carcass', material: MAT.carcass,
      L: internalW, W: RW, T, size: [internalW, T, RW], pos: [T, H - T, D - RW], explode: [0, 210, 70],
      edging: 'Front edge',
    }));
  } else {
    parts.push(mkPart({
      code: code('TOP'), name: 'Top', group: 'carcass', material: MAT.carcass,
      L: internalW, W: bottomDepth, T,
      size: [internalW, T, bottomDepth], pos: [T, H - T, BT], explode: [0, 220, 0], edging: 'Front edge',
    }));
  }

  parts.push(mkPart({
    code: code('BACK'), name: 'Back', group: 'back', material: MAT.back,
    L: internalW, W: H - T, T: BT,
    size: [internalW, H - T, BT], pos: [T, T, 0], explode: [0, 0, -280],
  }));

  const shelves = s.shelves ?? 0;
  const shelfDepth = D - BT - P.shelfSetback;
  for (let i = 0; i < shelves; i++) {
    const y = T + ((H - 2 * T) * (i + 1)) / (shelves + 1);
    parts.push(mkPart({
      code: code(`SHELF-${i + 1}`), name: `Shelf ${i + 1}`, group: 'shelf', material: MAT.carcass,
      L: internalW - 2, W: shelfDepth, T,
      size: [internalW - 2, T, shelfDepth], pos: [T + 1, y, BT], explode: [0, 120 + i * 60, 90],
      edging: 'Front edge',
    }));
  }

  /* --- fronts ---------------------------------------------------------- */

  const R = P.reveal;
  const FT = P.frontThk;
  const frontW = W - 2 * (R / 2);
  const sideGap = R / 2;

  const addDoors = (n, y, h) => {
    const each = (frontW - (n - 1) * R) / n;
    for (let i = 0; i < n; i++) {
      parts.push(mkPart({
        code: code(n === 1 ? 'DOOR' : `DOOR-${i + 1}`),
        name: n === 1 ? 'Door' : `Door ${i + 1}`, group: 'front', material: MAT.front,
        L: Math.round(h), W: Math.round(each), T: FT,
        size: [each, h, FT], pos: [sideGap + i * (each + R), y, D], explode: [0, 0, 340],
        edging: 'All four edges', hinge: i < n / 2 ? 'left' : 'right',
      }));
      fittings.push({ type: 'hinge', qty: h > 900 ? 3 : 2, code: code(`HINGE-${i + 1}`) });
    }
  };

  const addDrawers = (n, y, h) => {
    const each = (h - (n - 1) * R) / n;
    const boxW = internalW - 2 * P.runnerClearance;
    const boxInnerW = boxW - 2 * P.boxSideThk;
    const RL = D >= 560 ? 500 : 400;
    const boxZ = D - P.boxSetback - RL;
    for (let i = 0; i < n; i++) {
      const fy = y + h - each - i * (each + R);
      const num = i + 1;
      parts.push(mkPart({
        code: code(`DRWR-F${num}`), name: `Drawer front ${num}`, group: 'front', material: MAT.front,
        L: Math.round(frontW), W: Math.round(each), T: FT, drawer: num,
        size: [frontW, each, FT], pos: [sideGap, fy, D], explode: [0, 0, 340],
        edging: 'All four edges',
      }));
      const by = fy + 20;
      const sh = [0, 0, 170];
      const push = (sfx, nm, L, Wd, Th, size, pos, ex, mat) => parts.push(mkPart({
        code: code(`DRWR${num}-${sfx}`), name: `Drawer ${num} ${nm}`, group: 'box',
        material: mat, L, W: Wd, T: Th, drawer: num, size, pos,
        explode: [ex[0] + sh[0], ex[1] + sh[1], ex[2] + sh[2]],
      }));
      const BST = P.boxSideThk;
      push('SIDE-L', 'box, left side', RL, P.boxHeight, BST, [BST, P.boxHeight, RL], [T + P.runnerClearance, by, boxZ], [-170, 0, 0], MAT.box);
      push('SIDE-R', 'box, right side', RL, P.boxHeight, BST, [BST, P.boxHeight, RL], [T + P.runnerClearance + boxW - BST, by, boxZ], [170, 0, 0], MAT.box);
      push('FRONT', 'box, front', boxInnerW, P.boxHeight, BST, [boxInnerW, P.boxHeight, BST], [T + P.runnerClearance + BST, by, boxZ + RL - BST], [0, 0, 150], MAT.box);
      push('BACK', 'box, back', boxInnerW, P.boxHeight, BST, [boxInnerW, P.boxHeight, BST], [T + P.runnerClearance + BST, by, boxZ], [0, 0, -150], MAT.box);
      push('BASE', 'base', boxInnerW, RL - 2 * BST, P.boxBaseThk, [boxInnerW, P.boxBaseThk, RL - 2 * BST], [T + P.runnerClearance + BST, by + P.baseGroove, boxZ + BST], [0, -150, 0], MAT.boxBase);
      fittings.push({ type: 'runnerPair', qty: 1, code: code(`RUNNER-${num}`), length: RL });
      fittings.push({ type: 'handle', qty: 1, code: code(`HANDLE-D${num}`) });
    }
  };

  if (fam.fronts === 'doors') {
    if (kind === 'tall' && (s.doors ?? 2) >= 2 && H > 1600) {
      // Pantry: a lower pair and an upper pair rather than 2100 tall doors.
      const lower = Math.round(H * 0.45);
      addDoors(2, 0, lower - R / 2);
      addDoors(2, lower + R / 2, H - lower - R / 2);
    } else {
      addDoors(s.doors ?? 1, 0, H);
    }
    for (let i = 0; i < (s.doors ?? 1); i++) fittings.push({ type: 'handle', qty: 1, code: code(`HANDLE-${i + 1}`) });
  } else if (fam.fronts === 'drawers') {
    addDrawers(s.drawers ?? 3, 0, H);
  } else if (fam.fronts === 'sink') {
    const fh = 150;
    parts.push(mkPart({
      code: code('FALSE'), name: 'False front', group: 'front', material: MAT.front,
      L: Math.round(frontW), W: fh, T: FT,
      size: [frontW, fh, FT], pos: [sideGap, H - fh, D], explode: [0, 0, 340], edging: 'All four edges',
    }));
    addDoors(2, 0, H - fh - R);
  } else if (fam.fronts === 'oven') {
    const cavity = 600;
    const drawerH = 300;
    const doorH = H - cavity - drawerH - 2 * R;
    addDoors(1, H - doorH, doorH);
    addDrawers(1, 0, drawerH);
  }

  return {
    id, familyId, family: fam, name: fam.name, kind, settings: s,
    width: W, height: H, depth: D, mountY, size: [W, H, D],
    parts, fittings, hardware: [], cfg: P,
    ovenCavity: fam.fronts === 'oven' ? { y: 300 + P.reveal, h: 600 } : null,
  };
}

/* --- costing. All estimates. --------------------------------------------- */

export function unitCost(unit) {
  let board = 0;
  const bySheet = {};
  for (const p of unit.parts) {
    const sheet = PRICES.sheets[p.material];
    if (!sheet) continue;
    const area = (p.L * p.W) / 1e6;
    const sheetArea = (sheet.size[0] * sheet.size[1]) / 1e6;
    bySheet[p.material] = (bySheet[p.material] || 0) + area;
    board += (area / sheetArea) * sheet.cost * 1.18;  // 18 percent nesting waste
  }
  let hw = 0;
  for (const h of unit.fittings || []) {
    if (h.type === 'hinge') hw += PRICES.hinge * h.qty;
    if (h.type === 'runnerPair') hw += PRICES.runnerPair * h.qty;
    if (h.type === 'handle') hw += PRICES.handle * h.qty;
  }
  return { board, hardware: hw, total: board + hw, areaByMaterial: bySheet };
}
