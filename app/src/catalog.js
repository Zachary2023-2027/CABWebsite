/* ===========================================================================
   Cabinet catalog. One generic carcass builder, driven by a family record.
   Every unit returns a real part list, so the elevation, the 3D and the cut
   list are all reading the same numbers.

   Frameless European carcass, 32mm system. All dimensions mm, all costs AUD.
   =========================================================================== */

import { assertMm, round1 } from './mm.js';
import {
  drawerBox, hingeCountFor, longestFitting, migrateRunnerClearance, nearestLength, runnerProfile,
} from './hardware.js';
import { newRow, resolveStack } from './stack.js';
import { finishFor, roleOf } from './finishes.js';

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
  /* The gap above the top front and below the bottom one. Zero is the
     geometry this app has always produced, fronts filling the carcass
     exactly. A base cabinet has a benchtop sitting over its top front, so a
     gap there stops it rubbing: that is your call, not a constant. */
  revealTop: 0,
  revealBottom: 0,
  /* Kept so a project saved before runner profiles still opens. It is not
     read by the geometry any more: the profile below decides the drawer box
     width, and hydrate turns a stored clearance into a profile. */
  runnerClearance: 21,
  runnerProfile: 'tandem-563h',
  /* The figure the runner deducts from the opening width, to the inside of
     the drawer box. Empty means use the profile's published figure. Set it
     to whatever you measure off the runner in your hand: it is the number
     every drawer box in the kitchen is built from. */
  runnerDeduction: null,
  /* How much deeper than the runner the cabinet has to be. */
  runnerDepthAllowance: 25,

  hingeProfile: 'clip-top-blumotion-110',
  /* The gap from the edge of the cup to the edge of the door. Half the 35mm
     cup plus this is where the cup centre goes, so 5 gives the 22.5 this app
     has always drilled. It is what sets the overlay, and the mounting plate
     you buy has to match it. */
  hingeBoringDistance: 5,
  /* The tallest door that takes two hinges, three, and four. Anything above
     the last one takes five. Height is only half the question, the other
     half is weight, so these are yours to set. */
  hinge2MaxHeight: 900,
  hinge3MaxHeight: 1600,
  hinge4MaxHeight: 2000,

  /* Which line the back row of system holes sits on. On the grid means both
     rows are a whole number of 32mm steps apart and one jig setting drills
     both. Mirrored means 37mm in from each edge, which is what a fixed twin
     line jig gives you. They are different holes, so pick one and stay with
     it across the kitchen. */
  rearRow: 'grid',
  /* How the carcass is held together. Both halves of every joint are drawn
     from this: a clearance hole through the side, a pilot down the edge of
     what it screws into. */
  jointMethod: 'confirmat-7x50',
  boxSideThk: 16,
  boxBaseThk: 6,
  boxHeight: 140,
  boxSetback: 20,
  baseGroove: 10,
  shelfSetback: 20,
  runnerLength: 500,

  /* Board species. Thickness comes from the fields above, so the material
     name is always species + thickness and follows whatever you type. */
  carcassBoard: 'White melamine',
  frontBoard: 'White melamine',
  backBoard: 'MDF',
  boxBoard: 'Birch ply',
  /* The drawer bottom is usually a thinner sheet of something cheaper than
     the sides, so it gets its own species. Left empty it follows the sides. */
  boxBaseBoard: '',

  backType: 'full',       // 'full' or 'rail', a rail saves a sheet of back
  backRailHeight: 120,
  boxBaseFix: 'dado',     // 'dado' or 'screwed' under the sides

  /* Blind corner. The dead part of the front is the benchtop depth plus
     this, never a bare number on its own: the benchtop is the thing that
     returns across the front, so if you change its depth the blind has to
     follow or the door stops clearing. This is only the extra past it. */
  blindClearance: 50,

  /* The kickboard is a real part now, cut from board and nested with
     everything else, rather than a price per metre that never reached the
     saw. Left empty the species follows the carcass. */
  kickBoard: '',
  kickThk: 16,

  /* A finished panel on an end of a run that is out in the open. Off by
     default: whether an end is worth finishing is a decision about the room,
     not something the geometry can settle on its own. */
  endPanelAuto: false,
  endPanelBoard: '',
  endPanelThk: 18,

  /* How far the benchtop hangs past an open end of a run. */
  benchOverhang: 20,
  /* The longest benchtop piece you can buy or carry, so a long run is
     reported with its joins rather than as one impossible slab. */
  benchMaxPiece: 3600,

  /* What each role actually looks like. Empty means it is guessed from the
     board species you typed, so "Charcoal melamine" gives you a charcoal
     kitchen without setting the colour separately as well. Setting one wins
     over the guess. Two tone is simply the fronts differing from the carcass. */
  carcassFinish: '',
  frontFinish: '',
  backFinish: '',
  boxFinish: '',
  kickFinish: '',
  panelFinish: '',

  /* The saw. Kerf is the width of the blade, and it is the gap left between
     every part on a sheet so that cutting one does not cut into the next.
     Trim is what comes off each edge of the sheet before anything else, to
     get a straight reference edge. Both are yours to set: a thin kerf blade
     and a 3mm track saw do not take the same bite. */
  kerf: 3.2,
  trim: 10,
  minOffcut: 150,
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
  binRunner: 64,
  benchPerMetre: 320,
  kickPerMetre: 26,
  /* Whether the benchtop belongs in the project total. Off if you are buying
     the top separately, or someone else is supplying it. The metres are still
     worked out and still shown, they just stop being added up. */
  includeBench: true,
  edgeTapePerMetre: 0.6,
};

/* The seeded numbers, kept aside. PRICES itself is edited in place so the
   costing functions see your numbers, which means it cannot also be the
   thing Reset goes back to. */
export const PRICE_SEED = structuredClone(PRICES);

const matName = (base, thk) => `${base} ${thk}mm`;

/* Material names follow the configured thickness. Without this, changing
   carcass thickness renamed nothing, so an 18mm part was still costed and
   nested against a 16mm sheet. */
const materialsFor = (P) => ({
  carcass: matName(P.carcassBoard || 'White melamine', P.carcassThk),
  front: matName(P.frontBoard || 'White melamine', P.frontThk),
  back: matName(P.backBoard || 'MDF', P.backThk),
  box: matName(P.boxBoard || 'Birch ply', P.boxSideThk),
  boxBase: matName(P.boxBaseBoard || P.boxBoard || 'Birch ply', P.boxBaseThk),
});

const toneFor = (material) => {
  if (/ply/i.test(material)) return 'ply';
  if (/^MDF|hardboard/i.test(material)) return 'mdf';
  if (/oak|birch|pine|walnut/i.test(material)) return 'ply';
  return 'melamine';
};

/** Board species suggested in the fields. Thickness is typed, not chosen. */
export const BOARDS = ['White melamine', 'Birch ply', 'Hoop pine ply', 'MDF', 'HMR MDF', 'Structural ply'];

/**
 * Every board name worth suggesting: the seeded species plus whatever you
 * have actually put in your sheet stock. Typing a name that is not here is
 * allowed, it just will not have a sheet until you add one.
 */
export function boardNames() {
  const out = new Set(BOARDS);
  for (const k of Object.keys(PRICES.sheets)) {
    const base = k.replace(/\s[\d.]+mm$/, '').trim();
    if (base) out.add(base);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/**
 * Sheet stock for a material. If that exact thickness is not stocked, fall
 * back to the nearest thickness of the same board and scale the cost, rather
 * than silently dropping the part out of the nest and out of the cost.
 */
export function sheetFor(material) {
  if (PRICES.sheets[material]) return PRICES.sheets[material];
  const m = material.match(/([\d.]+)mm$/);
  if (!m) return null;
  const thk = parseFloat(m[1]);
  const base = material.replace(/\s[\d.]+mm$/, '');
  const cands = Object.entries(PRICES.sheets)
    .filter(([k]) => k.startsWith(base) && /([\d.]+)mm$/.test(k));
  if (!cands.length) return null;
  const pick = cands
    .map(([k, v]) => [k, v, Math.abs(parseFloat(k.match(/([\d.]+)mm$/)[1]) - thk)])
    .sort((a, b) => a[2] - b[2])[0];
  const baseThk = parseFloat(pick[0].match(/([\d.]+)mm$/)[1]);
  return { ...pick[1], cost: pick[1].cost * (thk / baseThk), substituted: pick[0] };
}

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

  /* Superseded by base-blind-l, which derives its blind width from the
     benchtop instead of leaving it to a door that may not clear. Kept so a
     saved project still opens, hidden from the picker, and offered a one time
     conversion on the cabinet itself. */
  { id: 'base-corner', group: 'Base', name: 'Blind corner, old', kind: 'base', fronts: 'doors',
    retired: true, replacedBy: 'base-blind-l',
    desc: 'The older corner cabinet. Its blind width was not tied to the benchtop.',
    widths: [900, 1000, 1050], def: { width: 900, doors: 1, shelves: 1 }, glyph: 'corner' },

  { id: 'base-blind-l', group: 'Base', name: 'Blind corner, L shape', kind: 'base', fronts: 'blind',
    corner: true,
    desc: 'Sits in the corner of an L. The return cabinets butt against its side.',
    widths: [900, 1000, 1050, 1100, 1200, 1350],
    def: { width: 1050, doors: 1, shelves: 1 }, glyph: 'cornerL' },

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

  { id: 'base-micro', group: 'Base', name: 'Microwave and drawer', kind: 'base', fronts: 'microwave',
    desc: 'Open bay for the microwave over one drawer.',
    widths: [500, 600, 700, 800], def: { width: 600, drawers: 1, microH: 380 }, glyph: 'micro' },

  { id: 'base-bin', group: 'Base', name: 'Pull-out bin', kind: 'base', fronts: 'bin',
    desc: 'One door on a bin runner. No shelf.',
    widths: [300, 400, 450, 500, 600], def: { width: 450, doors: 1, shelves: 0 }, glyph: 'bin' },

  { id: 'app-fridge', group: 'Appliance', name: 'Fridge space', kind: 'tall', fronts: 'none',
    cavity: true, appliance: 'fridge',
    desc: 'Blocked out cavity. No parts, no cost.',
    widths: [900, 1000, 1100, 1200], def: { width: 1000, height: 2250 }, glyph: 'fridge' },

  { id: 'app-dishwasher', group: 'Appliance', name: 'Dishwasher space', kind: 'base', fronts: 'none',
    cavity: true, appliance: 'dw',
    desc: 'Under bench cavity, 600 standard.',
    widths: [600, 450], def: { width: 600 }, glyph: 'dw' },

  { id: 'app-cooktop', group: 'Appliance', name: 'Cooktop space', kind: 'base', fronts: 'none',
    cavity: true, appliance: 'cooktop', breaksBench: true,
    desc: 'Freestanding cooker cavity, benchtop broken.',
    widths: [600, 700, 900], def: { width: 900 }, glyph: 'cooktop' },

  { id: 'app-cooktop-oven', group: 'Appliance', name: 'Cooktop with oven below', kind: 'base', fronts: 'none',
    cavity: true, appliance: 'cooktopOven', breaksBench: true,
    desc: 'Cooktop cut into the bench with the oven in the cavity under it.',
    widths: [600, 700, 900], def: { width: 600 }, glyph: 'cooktopOven' },

  { id: 'app-rangehood', group: 'Appliance', name: 'Range hood', kind: 'wall', fronts: 'none',
    cavity: true, appliance: 'hood',
    desc: 'Hangs over the cooktop. Drawn as a hood, not a box.',
    widths: [600, 700, 900], def: { width: 900, height: 600, mountY: 1500 }, glyph: 'hood' },

  { id: 'filler', group: 'Filler', name: 'Filler', kind: 'filler', fronts: 'none', cavity: false,
    desc: 'Scribe strip against a wall or appliance.',
    widths: [20, 30, 40, 50, 75, 100], def: { width: 40 }, glyph: 'filler' },

  /* -------------------------------------------------------------------------
     Presets stated as a front stack.

     Everything below says what its front is as a list of rows rather than as
     a branch in the builder. A row is a pair of doors, a drawer, a false
     front, an open bay or an appliance bay, and one row per preset is set to
     fill so the cabinet works at any height you give it.
     ------------------------------------------------------------------------- */

  { id: 'base-2drawer', group: 'Base', name: 'Base, 2 drawer', kind: 'base', fronts: 'stack',
    desc: 'A shallow drawer over a deep one. Pots under cutlery.',
    widths: [400, 450, 500, 600, 700, 800, 900], def: { width: 600 }, glyph: 'drawer3',
    stack: (s2) => [
      { type: 'drawer', height: s2.topDrawerH ?? 180 },
      { type: 'drawer', height: 'fill' },
    ] },

  { id: 'base-drawer-door', group: 'Base', name: 'Base, drawer over door', kind: 'base', fronts: 'stack',
    desc: 'One drawer at the top, doors below. The everyday cabinet with somewhere for the utensils.',
    widths: [400, 450, 500, 600, 700, 800, 900],
    def: { width: 600, doors: 1, shelves: 1 }, glyph: 'door1',
    stack: (s2) => [
      { type: 'drawer', height: s2.topDrawerH ?? 180 },
      { type: 'doors', height: 'fill', doors: s2.doors ?? 1,
        hingeSide: (s2.doors ?? 1) >= 2 ? 'pair' : 'left' },
    ] },

  { id: 'base-sink-drawer', group: 'Base', name: 'Sink base, drawer under', kind: 'base', fronts: 'stack',
    desc: 'False front at the top, one drawer below it. The drawer clears the trap.',
    widths: [800, 900, 1000, 1200], def: { width: 900, shelves: 0 }, glyph: 'sink',
    stack: (s2) => [
      { type: 'false', height: s2.falseH ?? 150 },
      { type: 'drawer', height: 'fill' },
    ] },

  { id: 'tall-broom', group: 'Tall', name: 'Broom cupboard', kind: 'tall', fronts: 'stack',
    desc: 'Full height, one shelf high up. Long handled things stand on the floor.',
    widths: [400, 450, 500, 600], def: { width: 450, shelves: 1 }, glyph: 'pantry',
    stack: (s2) => [
      { type: 'doors', height: 'fill', doors: s2.doors ?? 1,
        hingeSide: (s2.doors ?? 1) >= 2 ? 'pair' : 'left' },
    ] },

  { id: 'tall-fridge-surround', group: 'Tall', name: 'Fridge surround', kind: 'tall', fronts: 'stack',
    desc: 'A cupboard over the fridge, with the fridge space left open below it.',
    widths: [900, 1000, 1100, 1200], def: { width: 1000, shelves: 0, fridgeH: 1800 },
    glyph: 'fridge',
    stack: (s2, H, P, R) => [
      { type: 'doors', height: Math.max(150, H - (s2.fridgeH ?? 1800) - R),
        doors: s2.doors ?? 2, hingeSide: 'pair' },
      { type: 'bay', height: s2.fridgeH ?? 1800, appliance: 'fridge' },
    ] },

  { id: 'wall-microwave', group: 'Wall', name: 'Wall, microwave under', kind: 'wall', fronts: 'stack',
    desc: 'A cupboard with the microwave sitting in an open bay underneath it.',
    widths: [600, 700, 800, 900], def: { width: 800, shelves: 1, microH: 380 },
    glyph: 'micro',
    stack: (s2) => [
      { type: 'doors', height: 'fill', doors: s2.doors ?? 2, hingeSide: 'pair' },
      { type: 'bay', height: s2.microH ?? 380, appliance: 'microwave' },
    ] },

  { id: 'island', group: 'Base', name: 'Island', kind: 'base', fronts: 'stack',
    desc: 'A base cabinet finished on the back, so it can stand away from a wall.',
    widths: [600, 700, 800, 900, 1000, 1200],
    def: { width: 900, doors: 2, shelves: 1 }, glyph: 'door2',
    finishedBack: true,
    stack: (s2) => [
      { type: 'doors', height: 'fill', doors: s2.doors ?? 2,
        hingeSide: (s2.doors ?? 1) >= 2 ? 'pair' : 'left' },
    ] },

  { id: 'end-panel', group: 'Filler', name: 'End panel', kind: 'filler', fronts: 'none',
    panel: true,
    desc: 'A finished panel on the end of a run, the full depth of the cabinet beside it.',
    widths: [16, 18, 25], def: { width: 18 }, glyph: 'filler' },

  { id: 'bulkhead', group: 'Filler', name: 'Bulkhead', kind: 'filler', fronts: 'none',
    panel: true, above: 'wall',
    desc: 'Closes the gap between the wall cabinets and the ceiling.',
    widths: [300, 450, 600, 800, 900, 1000], def: { width: 900 }, glyph: 'bridge' },
];

export const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
export const GROUPS = [...new Set(FAMILIES.map((f) => f.group))];

/* ---------------------------------------------------------------------------
   Default front stacks.

   Every preset resolves to one of these when the cabinet has no stack of its
   own. The arithmetic is the arithmetic the old branching code did, written
   down as data. A test asserts every preset produces the same parts as it did
   before, at every width it offers, so this cannot drift.
   --------------------------------------------------------------------------- */

export function defaultStackFor(fam, s, H, P) {
  const R = Number(P.reveal) || 0;

  /* A preset can state its front as data. That is what a preset is now: a
     carcass size and a list of rows, which is why adding a cabinet type is
     adding a record rather than adding a branch. The presets below the switch
     predate this and keep their arithmetic, because a byte level comparison
     of every one of them at every width it offers is what proves the front
     stack did not change anything when it was introduced. */
  if (typeof fam.stack === 'function') return fam.stack(s, H, P, R);
  if (Array.isArray(fam.stack)) return fam.stack;

  switch (fam.fronts) {
    case 'doors': {
      /* A pantry gets a lower pair and an upper pair rather than one pair of
         2100mm doors, which nobody can hang on their own. */
      if (fam.kind === 'tall' && (s.doors ?? 2) >= 2 && H > 1600) {
        const lower = Math.round(H * 0.45);
        return [
          { type: 'doors', height: H - lower - R / 2, doors: 2, hingeSide: 'pair' },
          { type: 'doors', height: lower - R / 2, doors: 2, hingeSide: 'pair' },
        ];
      }
      const n = s.doors ?? 1;
      return [{ type: 'doors', height: 'fill', doors: n, hingeSide: n >= 2 ? 'pair' : 'left' }];
    }

    case 'drawers': {
      const n = s.drawers ?? 3;
      const heights = Array.isArray(s.drawerHeights) && s.drawerHeights.length === n
        && s.drawerHeights.every((v) => Number(v) > 0)
        ? s.drawerHeights.map(Number)
        : null;
      const even = (H - (n - 1) * R) / n;
      return Array.from({ length: n }, (_, i) => ({
        type: 'drawer', height: heights ? heights[i] : even,
      }));
    }

    case 'microwave': {
      // An open bay for the microwave, over a drawer.
      const bay = s.microH ?? 380;
      return [
        { type: 'open', height: bay },
        { type: 'drawer', height: Math.max(120, H - bay - R) },
      ];
    }

    case 'sink': {
      // A false front over a pair of doors, so the bowl has somewhere to go.
      const fh = 150;
      return [
        { type: 'false', height: fh },
        { type: 'doors', height: H - fh - R, doors: 2, hingeSide: 'pair' },
      ];
    }

    case 'oven': {
      const cavity = s.ovenH ?? 600;
      const drawerH = 300;
      return [
        { type: 'doors', height: H - cavity - drawerH - 2 * R, doors: 1, hingeSide: 'left' },
        { type: 'bay', height: cavity, appliance: 'oven' },
        { type: 'drawer', height: drawerH },
      ];
    }

    case 'bin':
      return [{ type: 'doors', height: 'fill', doors: 1, hingeSide: 'left' }];

    // Open shelves, fillers, cavities and the blind corner have no stack.
    default:
      return null;
  }
}

/* --- carcass builder ------------------------------------------------------ */

/* Cut sizes are rounded here and nowhere else.

   Type a thickness of 18.2 and the arithmetic that follows produces numbers
   like 190.60000000000002. That is harmless in the geometry, where it is a
   ten thousandth of a millimetre, and not harmless at all on the workshop
   screen, where the whole point is one clear number you set the saw to.

   A tenth of a millimetre is finer than any saw and far below the 3.2mm
   kerf, so rounding here cannot move a part into or out of a sheet in any
   way that matters, and it means the cut list, the nest, the print pack and
   the workshop view are all quoting the same figure. */
const mkPart = (o) => ({
  drawer: null, tone: toneFor(o.material), ...o,
  L: round1(o.L), W: round1(o.W), T: round1(o.T),
});

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
  const fam = FAMILY[familyId];
  if (!fam) throw new Error(`Unknown family ${familyId}`);

  const s = { ...fam.def, ...inst };

  /* Guard the numbers coming in, at the one boundary they all pass through.
     A NaN width propagates into every part, every sheet and every price
     before anything visibly goes wrong, so it is worth stopping here. */
  assertMm(s.width, `${familyId} width`);
  if (s.height !== undefined) assertMm(s.height, `${familyId} height`);
  if (s.depth !== undefined) assertMm(s.depth, `${familyId} depth`);

  /* A cabinet may carry its own overrides, which win over the project
     defaults. That is what lets one cabinet be 18mm while the rest stay 16,
     or one drawer bank run a wider runner gap. Everything downstream reads
     the part list, so the cut list, nest, drilling and costing all follow. */
  const P = { ...PROJECT, ...cfg, ...(s.cfg && typeof s.cfg === 'object' ? s.cfg : {}) };
  const W = s.width;
  const kind = fam.kind;
  const H = s.height ?? carcassHeightFor(kind, P);
  const D = s.depth ?? depthFor(kind, P);
  const mountY = kind === 'wall' ? P.wallMount : P.kick;

  const MAT = materialsFor(P);
  const parts = [];

  /* Every part carries the finish of the role it belongs to, resolved once
     here. The 3D, the elevation, the picker, the cut list and the print pack
     all read part.finish, so none of them has to know how a finish is chosen
     and a colour you set is the colour everywhere. */
  const finished = (list) => {
    for (const q of list) q.finish = finishFor(roleOf(q), P).id;
    return list;
  };
  let drawerOpening = 0;
  /* What the resolved stack had to say, so the inspector and the checks
     screen can report a stack that does not add up. */
  let stackNotes = null;
  const fittings = [];
  const code = (x) => `${id}-${x}`;

  /* Cavities are blocked out volumes, not cabinets: no parts, no cost.
     kind still says which run they occupy, so a range hood sits in the wall
     run and a fridge takes both. */
  if (fam.cavity) {
    const ch = s.height ?? (kind === 'tall' ? P.tallHeight + P.kick
      : kind === 'wall' ? (s.height ?? 600)
      : P.benchHeight - P.benchThk - P.kick);
    return {
      id, familyId, family: fam, name: fam.name, kind, settings: s, cavity: true,
      appliance: fam.appliance || 'box',
      width: W, height: ch, depth: D,
      mountY: kind === 'wall' ? (s.mountY ?? P.wallMount)
        : kind === 'tall' ? 0 : P.kick,
      size: [W, ch, D],
      parts: [], hardware: [], fittings: [], cfg: P,
      breaksBench: !!fam.breaksBench,
      fullHeight: kind === 'tall',
    };
  }

  if (kind === 'filler') {
    /* An end panel is not a filler on its side. A filler is a strip across
       the front of a gap, and its width is how wide the gap is. An end panel
       stands on edge at the end of a run: the width you set is how thick it
       is, and the part is the full height by the full depth of the cabinet it
       is finishing. Building it through the filler path made a stick 18mm
       wide and 720 long, which is not a panel and does not close anything. */
    if (fam.panel) {
      const above = fam.above === 'wall';
      /* A bulkhead fills what is left between the top of the wall cabinets
         and the ceiling, so its height is that gap and not a carcass height.
         If the ceiling is lower than the cabinets reach there is nothing to
         fill, and it collapses to a minimum rather than going negative. */
      const panelH = above
        ? Math.max(20, P.ceiling - (P.wallMount + P.wallCabHeight))
        : (s.height ?? carcassHeightFor('base', P) + P.kick);
      const panelD = above ? P.wallDepth : (s.depth ?? P.baseDepth);
      const thk = above ? P.frontThk : W;
      const runWidth = above ? W : thk;

      parts.push(mkPart(above ? {
        code: code('BULK'), name: 'Bulkhead panel', group: 'filler', material: MAT.front,
        L: W, W: panelH, T: thk,
        size: [W, panelH, thk], pos: [0, 0, panelD - thk], explode: [0, 0, 200],
        edging: 'Bottom edge',
      } : {
        code: code('END'), name: 'End panel', group: 'filler', material: MAT.front,
        L: panelH, W: panelD, T: thk,
        size: [thk, panelH, panelD], pos: [0, 0, 0], explode: [-200, 0, 0],
        edging: 'Front edge',
      }));

      return { id, familyId, family: fam, name: fam.name, kind, settings: s,
        width: runWidth, height: panelH, depth: panelD,
        mountY: above ? P.wallMount + P.wallCabHeight : 0,
        size: [runWidth, panelH, panelD],
        parts: finished(parts), fittings, hardware: [], cfg: P };
    }

    parts.push(mkPart({
      code: code('FILL'), name: 'Filler strip', group: 'filler', material: MAT.front,
      L: H, W, T: P.frontThk,
      size: [W, H, P.frontThk], pos: [0, 0, D - P.frontThk], explode: [0, 0, 200],
      edging: 'One long edge',
    }));
    return { id, familyId, family: fam, name: fam.name, kind, settings: s,
      width: W, height: H, depth: D, mountY: P.kick, size: [W, H, D],
      parts: finished(parts), fittings, hardware: [], cfg: P };
  }

  const T = P.carcassThk;
  const BT = P.backThk;
  const internalW = W - 2 * T;
  const railBack = (P.backType || 'full') === 'rail';
  const bottomDepth = railBack ? D : D - BT;
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
    size: [internalW, T, bottomDepth], pos: [T, 0, railBack ? 0 : BT], explode: [0, -200, 0], edging: 'Front edge',
  }));

  if (isBase) {
    const RW = 100;
    parts.push(mkPart({
      code: code('RAIL-TB'), name: 'Top rail, back', group: 'carcass', material: MAT.carcass,
      L: internalW, W: RW, T, size: [internalW, T, RW], pos: [T, H - T, railBack ? 0 : BT], explode: [0, 210, -70],
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
      size: [internalW, T, bottomDepth], pos: [T, H - T, railBack ? 0 : BT], explode: [0, 220, 0], edging: 'Front edge',
    }));
  }

  if (railBack) {
    /* A back rail braces the carcass at the top and takes far less board.
       It carries no dust seal, so it suits a base cabinet more than a wall. */
    const RH = P.backRailHeight;
    parts.push(mkPart({
      code: code('BACK-RAIL'), name: 'Back rail', group: 'back', material: MAT.carcass,
      L: internalW, W: RH, T,
      size: [internalW, RH, T], pos: [T, H - T - RH, 0], explode: [0, 0, -280],
    }));
  } else {
    /* An island is seen from behind, so its back is the carcass board with a
       finished edge rather than a sheet of 6mm hardboard nobody was ever
       meant to look at. */
    const finished = !!fam.finishedBack;
    parts.push(mkPart({
      code: code('BACK'), name: finished ? 'Back, finished' : 'Back', group: 'back',
      material: finished ? MAT.carcass : MAT.back,
      L: internalW, W: H - T, T: finished ? T : BT,
      size: [internalW, H - T, finished ? T : BT], pos: [T, T, 0], explode: [0, 0, -280],
      ...(finished ? { edging: 'All four edges' } : {}),
    }));
  }

  /* The dead width of a blind corner, and the amount the next wall has to
     start clear of. Both are read by the room layout and by the warnings.

     The blind is derived, not typed: benchtop depth plus however much past
     it you want. What you set is the extra, so widening the benchtop widens
     the blind with it and the door keeps clearing. A project saved before
     this held the finished width, so that is converted back to an extra
     rather than being thrown away. */
  const blindExtra = fam.corner
    ? Math.round(s.blindExtra ?? (Number.isFinite(Number(s.blindWidth))
      ? Number(s.blindWidth) - P.benchDepth
      : (P.blindClearance ?? 50)))
    : 0;
  const blindWidth = fam.corner ? Math.round(P.benchDepth + blindExtra) : 0;

  const shelves = s.shelves ?? 0;
  const shelfDepth = D - (railBack ? 0 : BT) - P.shelfSetback;
  for (let i = 0; i < shelves; i++) {
    const y = T + ((H - 2 * T) * (i + 1)) / (shelves + 1);
    parts.push(mkPart({
      code: code(`SHELF-${i + 1}`), name: `Shelf ${i + 1}`, group: 'shelf', material: MAT.carcass,
      L: internalW - 2, W: shelfDepth, T,
      size: [internalW - 2, T, shelfDepth], pos: [T + 1, y, railBack ? 0 : BT], explode: [0, 120 + i * 60, 90],
      edging: 'Front edge',
    }));
  }

  /* --- fronts ---------------------------------------------------------- */

  const R = P.reveal;
  const FT = P.frontThk;
  const frontW = W - 2 * (R / 2);
  const sideGap = R / 2;

  let doorNo = 0;
  let drawerNo = 0;
  /* How many hinges a door of this height gets. The thresholds are typed, so
     a heavy door can be told to take another hinge without touching code. */
  const hingeCount = (doorHeight) => hingeCountFor(doorHeight, {
    two: P.hinge2MaxHeight, three: P.hinge3MaxHeight, four: P.hinge4MaxHeight,
  });
  /**
   * A row of doors.
   *
   * hingeSide decides which carcass panel gets the hinge plate holes and
   * which way the door swings. A pair is hinged on its outer edges and meets
   * in the middle, which is what two doors on one opening always are, and is
   * what this produced before the side became something you can set.
   */
  const addDoors = (n, y, h, hingeSide, rowIndex) => {
    const each = (frontW - (n - 1) * R) / n;
    const side = hingeSide || (n >= 2 ? 'pair' : 'left');
    for (let i = 0; i < n; i++) {
      const num = ++doorNo;
      const hinge = side === 'pair' ? (i < n / 2 ? 'left' : 'right') : side;
      parts.push(mkPart({
        code: code(`DOOR-${num}`),
        name: `Door ${num}`, group: 'front', material: MAT.front,
        L: Math.round(h), W: Math.round(each), T: FT,
        size: [each, h, FT], pos: [sideGap + i * (each + R), y, D], explode: [0, 0, 340],
        edging: 'All four edges', hinge, row: rowIndex,
      }));
      fittings.push({ type: 'hinge', qty: hingeCount(h), code: code(`HINGE-${num}`) });
    }
  };

  const addDrawers = (n, y, h, heights, rowIndex) => {
    /* Remember the opening these drawers have to fill. The inspector checks
       typed heights against this, not against the whole carcass, so a
       microwave unit with a bay above the drawer is judged correctly. */
    drawerOpening = h;
    /* Heights are per drawer if you set them, otherwise equal. They are used
       as typed: no silent rescaling, so an overrun shows up in the elevation
       and in the warning rather than being hidden. */
    const gaps = (n - 1) * R;
    const even = (h - gaps) / n;
    const hs = (Array.isArray(heights) && heights.length === n
      && heights.every((v) => Number(v) > 0))
      ? heights.map(Number)
      : Array.from({ length: n }, () => even);

    /* The drawer box comes out of the runner profile, not out of a bare
       clearance number. The profile's deduction is to the inside of the box,
       so the outside is the inside plus twice the real side thickness. See
       hardware.js: reading it the other way makes every box in the kitchen
       32mm too narrow. */
    const profile = runnerProfile(P.runnerProfile, P.customRunner);
    const internalDepth = D - P.boxSetback;
    const wantLength = Number(P.runnerLength) || 500;
    const RL = Math.min(
      nearestLength(wantLength, profile),
      longestFitting(internalDepth, profile, P.runnerDepthAllowance),
    );

    const box = drawerBox({
      cabinetWidth: W, carcassThk: T, boxSideThk: P.boxSideThk,
      nominalLength: RL, profile, deduction: P.runnerDeduction,
    });
    const boxW = box.outsideWidth;
    const boxInnerW = box.insideWidth;
    const boxSide = (internalW - boxW) / 2;   // clearance beside each box side
    const boxZ = D - P.boxSetback - RL;
    const dado = (P.boxBaseFix || 'dado') === 'dado';

    let top = y + h;
    for (let i = 0; i < n; i++) {
      const each = hs[i];
      const fy = top - each;
      top = fy - R;
      /* Numbered across the whole cabinet, not within the call. Each drawer
         row is now its own call, so a per call counter would number every
         drawer in the cabinet 1 and collide every part code. */
      const num = ++drawerNo;

      parts.push(mkPart({
        code: code(`DRWR-F${num}`), name: `Drawer front ${num}`, group: 'front', material: MAT.front,
        L: Math.round(frontW), W: Math.round(each), T: FT, drawer: num, row: rowIndex,
        size: [frontW, each, FT], pos: [sideGap, fy, D], explode: [0, 0, 340],
        edging: 'All four edges',
      }));

      // The box never stands taller than its own front.
      const BH = Math.max(60, Math.min(P.boxHeight, each - 40));
      const by = fy + 20;
      const sh = [0, 0, 170];
      const BST = P.boxSideThk;
      const push = (sfx, nm, L, Wd, Th, size, pos, ex, mat) => parts.push(mkPart({
        code: code(`DRWR${num}-${sfx}`), name: `Drawer ${num} ${nm}`, group: 'box',
        material: mat, L, W: Wd, T: Th, drawer: num, size, pos,
        explode: [ex[0] + sh[0], ex[1] + sh[1], ex[2] + sh[2]],
      }));

      push('SIDE-L', 'box, left side', RL, BH, BST, [BST, BH, RL], [T + boxSide, by, boxZ], [-170, 0, 0], MAT.box);
      push('SIDE-R', 'box, right side', RL, BH, BST, [BST, BH, RL], [T + boxSide + boxW - BST, by, boxZ], [170, 0, 0], MAT.box);
      push('FRONT', 'box, front', boxInnerW, BH, BST, [boxInnerW, BH, BST], [T + boxSide + BST, by, boxZ + RL - BST], [0, 0, 150], MAT.box);
      push('BACK', 'box, back', boxInnerW, BH, BST, [boxInnerW, BH, BST], [T + boxSide + BST, by, boxZ], [0, 0, -150], MAT.box);

      if (dado) {
        // Base captured in a groove, so it is the inside size and sits up a little.
        push('BASE', 'base', boxInnerW, RL - 2 * BST, P.boxBaseThk,
          [boxInnerW, P.boxBaseThk, RL - 2 * BST],
          [T + boxSide + BST, by + P.baseGroove, boxZ + BST], [0, -150, 0], MAT.boxBase);
      } else {
        // Screwed on underneath, so it is the full box footprint.
        push('BASE', 'base, screwed under', boxW, RL, P.boxBaseThk,
          [boxW, P.boxBaseThk, RL],
          [T + boxSide, by - P.boxBaseThk, boxZ], [0, -150, 0], MAT.boxBase);
      }

      fittings.push({ type: 'runnerPair', qty: 1, code: code(`RUNNER-${num}`), length: RL });
      fittings.push({ type: 'handle', qty: 1, code: code(`HANDLE-D${num}`) });
    }
  };

  /* The front is a stack of rows, top to bottom.

     A cabinet with no stack of its own resolves one from its preset, and
     that produces exactly the parts this app has always produced: the row
     heights below are the same arithmetic the old branch did, just written
     down as data instead of buried in a conditional. Once the stack is set,
     it is the stack that decides, and any layout is buildable.

     The row emitters underneath are unchanged. Only the heights they are
     handed come from somewhere new. */
  const stack = Array.isArray(s.stack) && s.stack.length
    ? s.stack
    : defaultStackFor(fam, s, H, P);

  if (stack) {
    const resolved = resolveStack(stack, H, P);
    stackNotes = resolved;

    for (const [i, row] of resolved.rows.entries()) {
      if (row.height <= 0) continue;
      if (row.type === 'doors') {
        addDoors(row.doors ?? 1, row.y, row.height, row.hingeSide, i);
      } else if (row.type === 'drawer') {
        addDrawers(1, row.y, row.height, null, i);
      } else if (row.type === 'false') {
        parts.push(mkPart({
          code: code('FALSE'), name: 'False front', group: 'front', material: MAT.front,
          L: Math.round(frontW), W: Math.round(row.height), T: FT, row: i,
          size: [frontW, row.height, FT], pos: [sideGap, row.y, D],
          explode: [0, 0, 340], edging: 'All four edges',
        }));
      }
      /* An open row and an appliance bay are holes, not parts. They take up
         their height in the stack and emit nothing, which is what makes a
         microwave bay or an oven cavity work. */
    }

    if (doorNo > 0) {
      for (let i = 0; i < doorNo; i++) fittings.push({ type: 'handle', qty: 1, code: code(`HANDLE-${i + 1}`) });
    }
  }

  if (fam.fronts === 'blind') {
    /* Blind corner in an L.

       The cabinet runs into the corner. The return cabinets on the next wall
       butt against its side, so the last `blind` millimetres of its front are
       dead: covered by a fixed panel, not a door. That dead width has to be
       wider than the benchtop returning across it, otherwise the door has
       nothing to swing clear of and you cannot open the cabinet you just
       built. The default is the benchtop depth plus a clearance you can
       change; anything tighter is flagged on the cabinet. */
    const blind = blindWidth;
    const opening = frontW - blind - R;
    // Which end runs into the corner. Right suits the right hand end of a
    // run, left suits the other leg of a U.
    const blindLeft = (s.blindSide || 'right') === 'left';
    parts.push(mkPart({
      code: code('BLIND'), name: 'Blind panel', group: 'front', material: MAT.front,
      L: Math.round(H), W: Math.round(blind), T: FT,
      size: [blind, H, FT],
      pos: [blindLeft ? sideGap : sideGap + opening + R, 0, D], explode: [0, 0, 260],
      edging: 'All four edges',
    }));
    if (opening > 150) {
      const num = ++doorNo;
      parts.push(mkPart({
        code: code(`DOOR-${num}`), name: `Door ${num}`, group: 'front', material: MAT.front,
        L: Math.round(H), W: Math.round(opening), T: FT,
        size: [opening, H, FT],
        pos: [blindLeft ? sideGap + blind + R : sideGap, 0, D], explode: [0, 0, 340],
        edging: 'All four edges', hinge: blindLeft ? 'right' : 'left',
      }));
      fittings.push({ type: 'hinge', qty: hingeCount(H), code: code(`HINGE-${num}`) });
      fittings.push({ type: 'handle', qty: 1, code: code(`HANDLE-${num}`) });
    }
  }

  if (fam.fronts === 'bin') {
    fittings.push({ type: 'binRunner', qty: 1, code: code('BIN-RUNNER') });
  }

  return {
    id, familyId, family: fam, name: fam.name, kind, settings: s,
    width: W, height: H, depth: D, mountY, size: [W, H, D],
    parts: finished(parts), fittings, hardware: [], cfg: P, drawerOpening,
    /* The stack as resolved, with every row's real height and position, and
       anything wrong with it. Null on a cabinet that has no front. */
    stack: stackNotes,
    corner: !!fam.corner,
    blindWidth,
    blindExtra,
    /* How far along the next wall the corner is used up. The return cabinets
       start after this, which is what stops them being drawn inside the
       corner cabinet. */
    cornerReturn: fam.corner ? D : 0,
    ovenCavity: fam.fronts === 'oven' ? { y: 300 + P.reveal, h: s.ovenH ?? 600 } : null,
    microBay: fam.fronts === 'microwave'
      ? { y: H - (s.microH ?? 380), h: s.microH ?? 380 } : null,
  };
}

/* --- costing. All estimates. --------------------------------------------- */

export function unitCost(unit) {
  let board = 0;
  const bySheet = {};
  for (const p of unit.parts) {
    const sheet = sheetFor(p.material);
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
    if (h.type === 'binRunner') hw += (PRICES.binRunner ?? 0) * h.qty;
    if (h.type === 'custom') hw += (h.cost ?? 0) * h.qty;
  }
  return { board, hardware: hw, total: board + hw, areaByMaterial: bySheet };
}
