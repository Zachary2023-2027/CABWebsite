// Catalog data: dimensional constants, cabinet types, and finish options.
// Pure data — no DOM, no side effects. Extend the tables here to add products.

/** Standard North American cabinet dimensions, in inches. */
export const IN = {
  TOE_KICK: 4.5,       // recessed kick under base and tall cabinets
  BASE_BOX_H: 34.5,    // top of base carcass, before countertop
  COUNTER_T: 1.5,      // countertop slab -> finished counter at 36"
  BASE_DEPTH: 24,
  WALL_DEPTH: 12,
  WALL_MOUNT_AFF: 54,  // bottom of wall cabinets above finished floor
  REVEAL: 0.125,       // gap between adjacent fronts
};

export const DOOR_STYLES = [
  { id: 'shaker', name: 'Shaker',       factor: 1.00, panel: 'recessed' },
  { id: 'slab',   name: 'Flat Slab',    factor: 0.88, panel: 'none' },
  { id: 'raised', name: 'Raised Panel', factor: 1.22, panel: 'raised' },
  { id: 'glass',  name: 'Glass Front',  factor: 1.45, panel: 'glass' },
  { id: 'bead',   name: 'Beadboard',    factor: 1.12, panel: 'bead' },
];

// `door` / `edge` / `detail` feed the SVG renderer directly.
export const FINISHES = [
  { id: 'white',    name: 'Painted White', factor: 1.00, door: '#F1EFE9', edge: '#C6BFB3', detail: '#E3DFD5', grain: false },
  { id: 'greige',   name: 'Greige',        factor: 1.00, door: '#D9D2C6', edge: '#ADA495', detail: '#CBC3B4', grain: false },
  { id: 'sage',     name: 'Sage',          factor: 1.04, door: '#A7B49E', edge: '#7C8B73', detail: '#99A790', grain: false },
  { id: 'navy',     name: 'Navy',          factor: 1.06, door: '#39506F', edge: '#23344A', detail: '#31465F', grain: false },
  { id: 'charcoal', name: 'Charcoal',      factor: 1.06, door: '#3E444B', edge: '#282D33', detail: '#363C42', grain: false },
  { id: 'oak',      name: 'Natural Oak',   factor: 1.18, door: '#C9A268', edge: '#9C7B49', detail: '#BE9557', grain: true },
  { id: 'walnut',   name: 'Walnut',        factor: 1.42, door: '#6E4B33', edge: '#4A3121', detail: '#63422C', grain: true },
  { id: 'cherry',   name: 'Cherry',        factor: 1.30, door: '#8C4E36', edge: '#633425', detail: '#7E452F', grain: true },
];

/** Priced per pull; every door and every drawer takes one. */
export const HARDWARE = [
  { id: 'none', name: 'Integrated (none)', price: 0,    kind: 'none' },
  { id: 'knob', name: 'Round Knob',        price: 6,    kind: 'knob' },
  { id: 'bar',  name: 'Bar Pull',          price: 8.5,  kind: 'bar' },
  { id: 'cup',  name: 'Cup Pull',          price: 11,   kind: 'cup' },
  { id: 'edge', name: 'Edge Pull',         price: 14,   kind: 'edge' },
];

export const COUNTERTOPS = [
  { id: 'laminate', name: 'Laminate',      pricePerLf: 35,  color: '#8E8880' },
  { id: 'butcher',  name: 'Butcher Block', pricePerLf: 65,  color: '#B98A4E' },
  { id: 'granite',  name: 'Granite',       pricePerLf: 95,  color: '#4A4A4E' },
  { id: 'quartz',   name: 'Quartz',        pricePerLf: 120, color: '#DCD9D3' },
  { id: 'marble',   name: 'Marble',        pricePerLf: 160, color: '#EDEAE4' },
];

export const GROUPS = [
  { id: 'base',      label: 'Base Cabinets' },
  { id: 'wall',      label: 'Wall Cabinets' },
  { id: 'tall',      label: 'Tall Cabinets' },
  { id: 'appliance', label: 'Appliances' },
];

const W_NARROW = [9, 12, 15, 18, 21];
const W_WIDE = [24, 27, 30, 33, 36];
const H_WALL = [30, 36, 42];

/**
 * Cabinet types.
 *   row     — 'base' | 'wall' | 'tall'; drives vertical placement and layout cursors
 *   group   — palette section (appliances live in their own section but occupy a row)
 *   fronts  — front-elevation treatment, see preview.js#frontRects
 *   pricing — basePrice + perInch*width + perHeightInch*(height - heightRef)
 */
export const TYPES = [
  // ---- Base -------------------------------------------------------------
  { id: 'base-1d', name: 'Base 1 Door', short: '1 door, 1 drawer',
    row: 'base', group: 'base', fronts: 'topDrawer', doors: 1, drawers: 1,
    widths: W_NARROW, defaultWidth: 18, basePrice: 105, perInch: 8.2 },

  { id: 'base-2d', name: 'Base 2 Door', short: '2 doors, 2 drawers',
    row: 'base', group: 'base', fronts: 'topDrawer', doors: 2, drawers: 2,
    widths: W_WIDE, defaultWidth: 30, basePrice: 120, perInch: 8.5 },

  { id: 'base-3dr', name: '3-Drawer Base', short: 'Three stacked drawers',
    row: 'base', group: 'base', fronts: 'drawers', doors: 0, drawers: 3,
    widths: [15, 18, 21, ...W_WIDE], defaultWidth: 30, basePrice: 180, perInch: 11.5 },

  { id: 'base-4dr', name: '4-Drawer Base', short: 'Four stacked drawers',
    row: 'base', group: 'base', fronts: 'drawers', doors: 0, drawers: 4,
    widths: [15, 18, 21, ...W_WIDE], defaultWidth: 30, basePrice: 205, perInch: 12.5 },

  { id: 'base-sink', name: 'Sink Base', short: 'False front, 2 doors',
    row: 'base', group: 'base', fronts: 'sink', doors: 2, drawers: 0, isSink: true,
    widths: [30, 33, 36, 42], defaultWidth: 36, basePrice: 130, perInch: 7.8 },

  { id: 'base-corner', name: 'Lazy Susan Corner', short: 'Bi-fold corner unit',
    row: 'base', group: 'base', fronts: 'corner', doors: 2, drawers: 0,
    widths: [36], defaultWidth: 36, basePrice: 340, perInch: 9 },

  { id: 'base-filler', name: 'Filler Strip', short: 'Scribe filler',
    row: 'base', group: 'base', fronts: 'none', doors: 0, drawers: 0, isFiller: true,
    widths: [1, 2, 3], defaultWidth: 3, basePrice: 16, perInch: 6 },

  // ---- Wall -------------------------------------------------------------
  { id: 'wall-1d', name: 'Wall 1 Door', short: 'Single door',
    row: 'wall', group: 'wall', fronts: 'doors', doors: 1, drawers: 0,
    widths: W_NARROW, defaultWidth: 18, heights: H_WALL, defaultHeight: 30,
    basePrice: 78, perInch: 6.4, perHeightInch: 2.6, heightRef: 30 },

  { id: 'wall-2d', name: 'Wall 2 Door', short: 'Pair of doors',
    row: 'wall', group: 'wall', fronts: 'doors', doors: 2, drawers: 0,
    widths: W_WIDE, defaultWidth: 30, heights: H_WALL, defaultHeight: 30,
    basePrice: 92, perInch: 6.6, perHeightInch: 2.8, heightRef: 30 },

  { id: 'wall-bridge', name: 'Bridge / Over-Range', short: 'Short lift-up door',
    row: 'wall', group: 'wall', fronts: 'doors', doors: 1, drawers: 0, isBridge: true,
    widths: [30, 36], defaultWidth: 30, heights: [12, 18], defaultHeight: 18,
    basePrice: 70, perInch: 5.2, perHeightInch: 3.0, heightRef: 18 },

  { id: 'wall-open', name: 'Open Shelf Unit', short: 'No doors, 2 shelves',
    row: 'wall', group: 'wall', fronts: 'open', doors: 0, drawers: 0,
    widths: W_WIDE, defaultWidth: 30, heights: [30, 36], defaultHeight: 30,
    basePrice: 64, perInch: 5.0, perHeightInch: 2.2, heightRef: 30 },

  { id: 'wall-corner', name: 'Diagonal Wall Corner', short: 'Angled corner unit',
    row: 'wall', group: 'wall', fronts: 'cornerWall', doors: 1, drawers: 0,
    widths: [24], defaultWidth: 24, heights: H_WALL, defaultHeight: 30,
    basePrice: 210, perInch: 6.0, perHeightInch: 2.6, heightRef: 30 },

  { id: 'wall-filler', name: 'Wall Filler', short: 'Scribe filler',
    row: 'wall', group: 'wall', fronts: 'none', doors: 0, drawers: 0, isFiller: true,
    widths: [1, 2, 3], defaultWidth: 3, heights: H_WALL, defaultHeight: 30,
    basePrice: 14, perInch: 5 },

  // ---- Tall -------------------------------------------------------------
  { id: 'tall-pantry', name: 'Pantry', short: 'Upper + lower doors',
    row: 'tall', group: 'tall', fronts: 'pantry', doors: 4, drawers: 0,
    widths: [18, 24, 30, 36], defaultWidth: 24, heights: [84, 90, 96], defaultHeight: 90,
    basePrice: 300, perInch: 26, perHeightInch: 4.0, heightRef: 90 },

  { id: 'tall-oven', name: 'Oven Cabinet', short: 'Door, oven bay, drawer',
    row: 'tall', group: 'tall', fronts: 'oven', doors: 1, drawers: 1,
    widths: [30, 33], defaultWidth: 30, heights: [90, 96], defaultHeight: 90,
    basePrice: 420, perInch: 22, perHeightInch: 3.5, heightRef: 90 },

  // ---- Appliance placeholders (not supplied; priced at zero) -------------
  { id: 'gap-range', name: 'Range Gap', short: 'Slide-in range opening',
    row: 'base', group: 'appliance', fronts: 'appliance', appliance: 'range',
    doors: 0, drawers: 0, widths: [30, 36], defaultWidth: 30, basePrice: 0, perInch: 0 },

  { id: 'gap-dw', name: 'Dishwasher Gap', short: 'Under-counter opening',
    row: 'base', group: 'appliance', fronts: 'appliance', appliance: 'dw',
    doors: 0, drawers: 0, widths: [24], defaultWidth: 24, basePrice: 0, perInch: 0 },

  { id: 'gap-fridge', name: 'Refrigerator Gap', short: 'Full-height opening',
    row: 'tall', group: 'appliance', fronts: 'appliance', appliance: 'fridge',
    doors: 0, drawers: 0, widths: [36], defaultWidth: 36,
    heights: [84], defaultHeight: 84, basePrice: 0, perInch: 0 },
];

export const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

const byId = (list, id, fallback) => list.find((x) => x.id === id) || list[fallback ?? 0];

export const doorStyle = (id) => byId(DOOR_STYLES, id);
export const finish = (id) => byId(FINISHES, id);
export const hardware = (id) => byId(HARDWARE, id);
export const countertop = (id) => byId(COUNTERTOPS, id);

/** Box height of an item, including toe kick for floor-standing units. */
export function boxHeight(type, item) {
  if (type.row === 'wall') return item.height ?? type.defaultHeight;
  if (type.row === 'tall') return item.height ?? type.defaultHeight;
  return IN.BASE_BOX_H;
}
