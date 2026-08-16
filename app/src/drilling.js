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

/* ---------------------------------------------------------------------------
   The 32mm system, in one place.

   Every one of these was scattered through the code as a bare number. They
   are the system: a 5mm hole every 32mm, on a line 37mm in from the front
   edge, with the first hole 32mm off the bottom. Change one and the jig no
   longer fits the panel, so they are stated once and read from here.
   --------------------------------------------------------------------------- */
export const SYS32 = {
  pitch: 32,
  frontSetback: 37,
  firstHole: 32,
  dia: 5,
  depth: 13,
};

/* Where the back row of system holes goes.

   grid    the back row is a whole number of 32mm steps behind the front row,
           so both rows are on the same grid and one jig setting drills both
   mirror  the back row is measured 37mm in from the back edge, mirroring the
           front, which is what a fixed twin-line jig gives you

   They are different holes. On a 560 deep panel the grid puts the back row
   at 43 and the mirror puts it at 37, and a shelf drilled to one will not
   sit on pins set out to the other. */
export const REAR_ROWS = [
  { id: 'grid', name: 'On the 32mm grid' },
  { id: 'mirror', name: 'Mirrored from the back edge' },
];

export function rearRowX(depth, mode = 'grid', d = SYS32) {
  const front = depth - d.frontSetback;
  if (mode === 'mirror') return d.frontSetback;
  const steps = Math.floor((front - d.frontSetback) / d.pitch);
  return front - steps * d.pitch;
}

/* ---------------------------------------------------------------------------
   How the carcass is held together.

   Both halves of a joint are drilled, and they are drilled differently: the
   panel the screw passes through gets a clearance hole, the panel it screws
   into gets a pilot down its edge. Drawing only one half is how a carcass
   ends up with a bottom that will not line up with its sides.
   --------------------------------------------------------------------------- */
export const JOINTS = {
  'confirmat-7x50': {
    id: 'confirmat-7x50',
    name: 'Confirmat 7 x 50',
    faceDia: 7,
    faceDepth: 0,          // through the side panel
    faceThrough: true,
    edgeDia: 5,
    edgeDepth: 40,
    note: 'A stepped confirmat bit drills both in one pass. The 7mm part goes through the side, the 5mm part down the edge.',
  },
  'dowel-8': {
    id: 'dowel-8',
    name: '8mm dowel',
    faceDia: 8,
    faceDepth: 12,
    faceThrough: false,
    edgeDia: 8,
    edgeDepth: 32,
    note: 'Glue only. Dry fit the whole carcass before any glue goes near it, because a dowelled joint cannot be adjusted once it is home.',
  },
};

export const JOINT_LIST = Object.values(JOINTS);
export const jointMethod = (id) => JOINTS[id] || JOINTS['confirmat-7x50'];

/**
 * Where the joint holes sit along the depth of a side panel, measured from
 * the back edge as the panel is drawn.
 *
 * Two near the ends and one in the middle. The end pair are held off the
 * corner far enough not to split the board, and the mating panel is drilled
 * to the same figures measured from its own front edge, which is the only
 * way the two halves land on each other.
 */
/* The panels that screw into the edge of a side: the bottom, the top, and
   the top rails of a base cabinet. A shelf is not one of them, it sits on
   pins and stays adjustable. */
export const JOINTED = /-(BOT|TOP|RAIL-TB|RAIL-TF)$/;

export function jointXs(depth, inset = 80) {
  const back = Math.min(inset, depth / 3);
  return [back, depth / 2, depth - inset].map((x) => Math.round(x));
}

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
  /* A drawer box has sides too, and its parts end in SIDE-L the same way the
     carcass does. Only the carcass is drilled. */
  const isSide = part.group === 'carcass'
    && (part.code.endsWith('SIDE-L') || part.code.endsWith('SIDE-R'));
  const isDoor = part.group === 'front' && part.code.includes('DOOR');
  const isDrawerFront = part.group === 'front' && part.code.includes('DRWR-F');

  if (isSide) {
    const depth = part.W;     // across the bench
    const height = part.L;    // up the bench
    const holes = [];
    const hand = part.code.endsWith('SIDE-L') ? 'left' : 'right';
    const rearMode = cfg.rearRow || 'grid';
    const backX = rearRowX(depth, rearMode, d);
    const frontX = depth - d.frontSetback;
    const joint = jointMethod(cfg.jointMethod);

    const shelfYs = unit.parts
      .filter((q) => q.group === 'shelf')
      .map((q) => q.pos[1] + q.size[1] / 2);

    for (const y of shelfHoles(shelfYs, height, d)) {
      holes.push(hole(backX, Math.round(y), d.systemDia, d.systemDepth, 'system', ''));
      holes.push(hole(frontX, Math.round(y), d.systemDia, d.systemDepth, 'system', ''));
    }

    /* The other half of the hinge. A door carries the cup and the side panel
       carries the plate it clips onto, and until now only the door half was
       drawn: you could drill every door in the kitchen and still have nothing
       to hang them on. The plate screws land on two neighbouring holes of the
       same system grid the shelves use, which is what the grid is for. */
    const hp = hingeProfile(cfg.hingeProfile);
    const doors = unit.parts.filter((q) => q.group === 'front' && q.code.includes('DOOR')
      && (q.hinge === 'right' ? 'right' : 'left') === hand);
    const plateX = depth - hp.plateSetback;
    let plates = 0;
    for (const door of doors) {
      /* A door sits at its own height in the cabinet, so a hinge centre
         measured up the door has to be lifted to where the door actually is
         before it means anything on the side panel. */
      const doorBottom = door.pos[1];
      for (const y of hingePositions(door.L, d, cfg)) {
        const at = doorBottom + y;
        const k = Math.round((at - d.firstHole) / d.pitch);
        for (const n of [k, k + 1]) {
          const py = d.firstHole + n * d.pitch;
          if (py < d.firstHole || py > height - d.firstHole) continue;
          holes.push(hole(plateX, Math.round(py), hp.plateDia, hp.plateDepth, 'plate', ''));
          plates++;
        }
      }
    }

    /* Both halves of the carcass joint. These go through the side and into
       the edge of whatever is behind them, and the mating panel is drilled to
       the same figures from its own front edge. */
    const t = cfg.carcassThk ?? 16;
    const mates = unit.parts.filter((q) => q.group === 'carcass' && JOINTED.test(q.code));
    for (const m of mates) {
      const y = m.pos[1] + t / 2;
      for (const x of jointXs(depth)) {
        holes.push(hole(x, Math.round(y), joint.faceDia,
          joint.faceThrough ? t : joint.faceDepth, 'construction', ''));
      }
    }

    if (!holes.length) return null;

    const notes = [
      `${hand === 'left' ? 'LEFT' : 'RIGHT'} hand side. Drilled face is up, front edge to the right.`,
      'All positions are to hole centres, from the bottom left corner as drawn.',
    ];
    if (shelfYs.length) {
      notes.push(`Shelf pin holes ${d.systemDia}mm at ${d.pitch}mm pitch, ${d.systemDepth}mm deep.`);
      notes.push(rearMode === 'mirror'
        ? `Front line ${d.frontSetback}mm from the front edge, back line ${d.frontSetback}mm from the back edge.`
        : `Front line ${d.frontSetback}mm from the front edge, back line ${backX}mm from the back edge, which is ${Math.round((frontX - backX) / d.pitch)} steps of ${d.pitch}mm behind it.`);
      notes.push(`${d.adjustSteps} holes either side of each shelf, so it moves ${d.adjustSteps * d.pitch}mm up or down.`);
    }
    if (plates) notes.push(`${plates} hinge plate holes on the ${hp.plateSetback}mm line, ${hp.plateDia}mm, ${hp.plateDepth}mm deep.`);
    notes.push(`${joint.name}: ${joint.faceDia}mm ${joint.faceThrough ? 'through the side' : `${joint.faceDepth}mm deep`}.`);
    notes.push(joint.note);

    return {
      code: part.code, name: part.name, w: depth, h: height, hand,
      xLabel: 'Depth', yLabel: 'Height', holes, notes,
    };
  }

  /* The panel the screws go into. Its holes are down the two end edges, not
     in the face, so they are drawn straddling the edge as a reminder of which
     way the panel goes on the bench. */
  if (part.group === 'carcass' && JOINTED.test(part.code)) {
    const joint = jointMethod(cfg.jointMethod);
    const w = part.L;   // across, the internal width of the carcass
    const h = part.W;   // the depth of the panel
    const holes = [];

    /* The side is drilled from its back edge and this panel is measured from
       its front, so the same joint is the same distance from the front of the
       cabinet on both halves. That is the whole point of stating the datum. */
    const sideDepth = (unit.parts.find((q) => q.code.endsWith('SIDE-L')) || part).W;
    for (const x of jointXs(sideDepth)) {
      const fromFront = sideDepth - x;
      const y = h - fromFront;
      if (y < 0 || y > h) continue;
      holes.push(hole(0, Math.round(y), joint.edgeDia, joint.edgeDepth, 'edge', ''));
      holes.push(hole(w, Math.round(y), joint.edgeDia, joint.edgeDepth, 'edge', ''));
    }
    if (!holes.length) return null;

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Depth',
      edges: true,
      holes,
      notes: [
        'Front edge is at the bottom as drawn. Holes are into the two end edges, not into the face.',
        `${joint.edgeDia}mm, ${joint.edgeDepth}mm deep, down the centre of the edge.`,
        'Same distances from the front as the side panel, so the two halves land on each other.',
        joint.note,
      ],
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
  construction: { fill: 'var(--accent)', label: 'Carcass joint, through the side' },
  cup: { fill: 'var(--warn)', label: '35mm hinge cup' },
  handle: { fill: 'var(--dw-dim)', label: '5mm handle, through' },
  plate: { fill: 'var(--ok)', label: 'Hinge plate screw' },
  edge: { fill: 'var(--accent)', label: 'Carcass joint, into the end edge' },
};
