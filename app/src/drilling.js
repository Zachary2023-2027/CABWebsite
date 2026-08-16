/* ===========================================================================
   Drilling schedule. 32mm system.

   Panels are drawn flat, as they sit on the bench with the face you drill
   pointing up. For a side panel that means depth across and height up, front
   edge on the right, which is how you will actually clamp the jig.

   All positions are to hole centres, in millimetres from the bottom left of
   the panel as drawn.
   =========================================================================== */

import { whole } from './mm.js';
import { CUP_RADIUS, cupCentre, hingeCentres, hingeCountFor, hingeProfile } from './hardware.js';

export const DRILL = {
  pitch: 32,          // system hole spacing
  frontSetback: 37,   // front line, centre to the front edge
  backSetback: 37,    // back line, centre to the back edge
  firstHole: 32,      // lowest system hole above the bottom edge
  systemDia: 5,
  systemDepth: 13,
  cupDia: 35,
  cupDepth: 13,
  /* Kept so a caller passing its own DRILL still works. The cup centre is
     really half the cup plus the boring distance, and it is read off the
     hinge profile and the project setting rather than sitting here as one
     unexplained number. */
  cupSetback: CUP_RADIUS + 5,
  cupFromEnd: 100,    // top and bottom hinge centres from the door ends
  handleDia: 5,
  constructionDia: 8,
  adjustSteps: 2,   // shelf pin holes either side of the shelf, for adjustment
};

/* A hole position is a whole millimetre. Nobody sets out 37.5 with a tape,
   and a jig is drilled to a mark, not to a tenth. */
const hole = (x, y, dia, depth, kind, label) =>
  ({ x: whole(x), y: whole(y), dia, depth, kind, label });

/**
 * Shelf pin positions. The template is for shelves, so instead of a full
 * length system run we drill a short ladder around each shelf height. That
 * keeps the shelf adjustable a couple of positions either way without
 * drilling the whole panel.
 */
function shelfHoles(shelfYs, height, d = DRILL) {
  const out = new Set();
  for (const y of shelfYs) {
    // snap to the 32mm grid measured from the first hole
    const k = Math.round((y - d.firstHole) / d.pitch);
    for (let n = k - d.adjustSteps; n <= k + d.adjustSteps; n++) {
      const pos = d.firstHole + n * d.pitch;
      if (pos >= d.firstHole && pos <= height - d.firstHole) out.add(pos);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Hinge centres up a door, from the bottom.
 *
 * cfg carries the hinge settings when there is a cabinet behind the call.
 * Without one the defaults apply, which is the same answer the hard coded
 * version gave for every door under 900.
 */
export function hingePositions(doorHeight, d = DRILL, cfg = {}) {
  const profile = hingeProfile(cfg.hingeProfile);
  const n = hingeCountFor(doorHeight, {
    two: cfg.hinge2MaxHeight, three: cfg.hinge3MaxHeight, four: cfg.hinge4MaxHeight,
  });
  return hingeCentres(doorHeight, n, d.cupFromEnd ?? profile.cupFromEnd);
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

    /* Shelves only. A drawer bank has nothing to set out here, so it drops
       out of the drilling schedule entirely rather than showing a panel
       covered in holes you do not need. */
    const shelfYs = unit.parts
      .filter((q) => q.group === 'shelf')
      .map((q) => q.pos[1] + q.size[1] / 2);
    if (!shelfYs.length) return null;

    for (const y of shelfHoles(shelfYs, height, d)) {
      holes.push(hole(backX, Math.round(y), d.systemDia, d.systemDepth, 'system', ''));
      holes.push(hole(frontX, Math.round(y), d.systemDia, d.systemDepth, 'system', ''));
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
      `Shelf pin holes ${d.systemDia}mm at ${d.pitch}mm pitch, ${d.systemDepth}mm deep.`,
      `Front line ${d.frontSetback}mm from the front edge, back line ${d.backSetback}mm from the back edge.`,
      `${d.adjustSteps} holes either side of each shelf, so it moves ${d.adjustSteps * d.pitch}mm up or down.`,
      'Front edge is to the right as drawn.',
    ];

    return {
      code: part.code, name: part.name, w: depth, h: height,
      xLabel: 'Depth', yLabel: 'Height', holes, notes,
    };
  }

  if (isDoor) {
    const w = part.W;   // door width across
    const h = part.L;   // door height up
    const hingeSide = part.hinge === 'right' ? 'right' : 'left';
    const profile = hingeProfile(cfg.hingeProfile);
    /* Half the cup plus the boring distance. The boring distance is the only
       half of it you choose, and it is what sets the overlay. */
    const setback = cupCentre(profile, cfg.hingeBoringDistance);
    const x = hingeSide === 'left' ? setback : w - setback;
    const holes = hingePositions(h, d, cfg).map((y) =>
      hole(Math.round(x), Math.round(y), profile.cupDia, profile.cupDepth, 'cup', ''));
    // Handle, opposite the hinges.
    const hx = hingeSide === 'left' ? w - 45 : 45;
    holes.push(hole(hx, Math.round(h / 2), d.handleDia, 0, 'handle', 'through'));

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Height',
      holes,
      notes: [
        `${profile.cupDia}mm cup, ${profile.cupDepth}mm deep, centre ${whole(setback)}mm from the ${hingeSide} edge.`,
        `That is half the cup plus a boring distance of ${whole(setback - profile.cupDia / 2)}mm.`,
        `${holes.length - 1} hinges. Handle hole is through, ${d.handleDia}mm.`,
        `Mounting plates go on the front hole row of the side panel, ${profile.plateSetback}mm in.`,
        'Drill cups from the back face.',
      ],
    };
  }

  /* Drawer fronts are not part of the shelf template. The front fixes to the
     box with adjusters and the handle is marked off the fitted drawer. */
  if (isDrawerFront) return null;

  return null;
}

/** Every drilled panel in a cabinet. */
export function drillUnit(unit, d = DRILL) {
  return unit.parts.map((p) => drillPanel(unit, p, d)).filter(Boolean);
}

export const HOLE_STYLE = {
  system: { fill: 'var(--dw-line)', label: '5mm shelf pin' },
  construction: { fill: 'var(--accent)', label: '8mm construction' },
  cup: { fill: 'var(--warn)', label: '35mm hinge cup' },
  handle: { fill: 'var(--dw-dim)', label: '5mm handle, through' },
};
