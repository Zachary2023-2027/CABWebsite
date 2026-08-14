/* ===========================================================================
   Drilling schedule. 32mm system.

   Panels are drawn flat, as they sit on the bench with the face you drill
   pointing up. For a side panel that means depth across and height up, front
   edge on the right, which is how you will actually clamp the jig.

   All positions are to hole centres, in millimetres from the bottom left of
   the panel as drawn.
   =========================================================================== */

export const DRILL = {
  pitch: 32,          // system hole spacing
  frontSetback: 37,   // front line, centre to the front edge
  backSetback: 37,    // back line, centre to the back edge
  firstHole: 32,      // lowest system hole above the bottom edge
  systemDia: 5,
  systemDepth: 13,
  cupDia: 35,
  cupDepth: 12.5,
  cupSetback: 22.5,   // cup centre to the door edge, 3mm overlay
  cupFromEnd: 100,    // top and bottom hinge centres from the door ends
  handleDia: 5,
  constructionDia: 8,
};

const hole = (x, y, dia, depth, kind, label) => ({ x, y, dia, depth, kind, label });

/** System hole column positions up a side panel. */
function systemRun(height, d = DRILL) {
  const out = [];
  for (let y = d.firstHole; y <= height - d.firstHole; y += d.pitch) out.push(y);
  return out;
}

/** Hinge centres up a door, from the bottom. */
export function hingePositions(doorHeight, d = DRILL) {
  const n = doorHeight > 900 ? 3 : 2;
  if (n === 2) return [d.cupFromEnd, doorHeight - d.cupFromEnd];
  return [d.cupFromEnd, doorHeight / 2, doorHeight - d.cupFromEnd];
}

/**
 * Drilling for one panel. Returns null when the panel needs no holes.
 * @returns {{code,name,w,h,xLabel,yLabel,holes,notes}}
 */
export function drillPanel(unit, part, d = DRILL) {
  const cfg = unit.cfg || {};
  const isSide = part.code.endsWith('SIDE-L') || part.code.endsWith('SIDE-R');
  const isDoor = part.group === 'front' && part.code.includes('DOOR');
  const isDrawerFront = part.group === 'front' && part.code.includes('DRWR-F');

  if (isSide) {
    const depth = part.W;     // across the bench
    const height = part.L;    // up the bench
    const holes = [];
    const backX = d.backSetback;
    const frontX = depth - d.frontSetback;

    for (const y of systemRun(height, d)) {
      holes.push(hole(backX, y, d.systemDia, d.systemDepth, 'system', ''));
      holes.push(hole(frontX, y, d.systemDia, d.systemDepth, 'system', ''));
    }

    // Construction holes into the bottom and the top rails or top.
    const t = cfg.carcassThk ?? 16;
    const conY = [t / 2, height - t / 2];
    for (const y of conY) {
      for (const x of [80, depth / 2, depth - 80]) {
        holes.push(hole(Math.round(x), Math.round(y), d.constructionDia, 12, 'construction', ''));
      }
    }

    const notes = [
      `System holes ${d.systemDia}mm at ${d.pitch}mm pitch, ${d.systemDepth}mm deep.`,
      `Front line ${d.frontSetback}mm from the front edge, back line ${d.backSetback}mm from the back edge.`,
      'Front edge is to the right as drawn.',
    ];

    const hasDrawers = unit.parts.some((p) => p.code.includes('DRWR-F'));
    if (hasDrawers) {
      notes.push('Runners land on the front and back system lines. No extra holes.');
    }
    const hasDoors = unit.parts.some((p) => p.code.includes('DOOR'));
    if (hasDoors) {
      notes.push('Hinge plates use the front system line. No extra holes.');
    }

    return {
      code: part.code, name: part.name, w: depth, h: height,
      xLabel: 'Depth', yLabel: 'Height', holes, notes,
    };
  }

  if (isDoor) {
    const w = part.W;   // door width across
    const h = part.L;   // door height up
    const hingeSide = part.hinge === 'right' ? 'right' : 'left';
    const x = hingeSide === 'left' ? d.cupSetback : w - d.cupSetback;
    const holes = hingePositions(h, d).map((y) =>
      hole(Math.round(x), Math.round(y), d.cupDia, d.cupDepth, 'cup', ''));
    // Handle, opposite the hinges.
    const hx = hingeSide === 'left' ? w - 45 : 45;
    holes.push(hole(hx, Math.round(h / 2), d.handleDia, 0, 'handle', 'through'));

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Height',
      holes,
      notes: [
        `${d.cupDia}mm cup, ${d.cupDepth}mm deep, centre ${d.cupSetback}mm from the ${hingeSide} edge.`,
        `${holes.length - 1} hinges. Handle hole is through, ${d.handleDia}mm.`,
        'Drill cups from the back face.',
      ],
    };
  }

  if (isDrawerFront) {
    const w = part.W;
    const h = part.L;
    const holes = [
      hole(Math.round(w / 2 - 64), Math.round(h / 2), d.handleDia, 0, 'handle', 'through'),
      hole(Math.round(w / 2 + 64), Math.round(h / 2), d.handleDia, 0, 'handle', 'through'),
    ];
    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Height', holes,
      notes: [
        'Handle at 128mm centres, through drilled 5mm.',
        'Front fixes to the box with adjusters, no holes in the front.',
      ],
    };
  }

  return null;
}

/** Every drilled panel in a cabinet. */
export function drillUnit(unit, d = DRILL) {
  return unit.parts.map((p) => drillPanel(unit, p, d)).filter(Boolean);
}

export const HOLE_STYLE = {
  system: { fill: 'var(--dw-line)', label: '5mm system' },
  construction: { fill: 'var(--accent)', label: '8mm construction' },
  cup: { fill: 'var(--warn)', label: '35mm hinge cup' },
  handle: { fill: 'var(--dw-dim)', label: '5mm handle, through' },
};
