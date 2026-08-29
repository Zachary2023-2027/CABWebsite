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
import {
  POCKET, canPocket, pocketFaceOffset, pocketNote, pocketPositions, pocketRule, pocketScrew,
  pocketSlotLength,
} from './pocket.js';

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

   Three ways, and they are drilled differently enough that the method has to
   be a setting rather than an assumption.

   A pocket screw is drilled in one panel only: the one that butts into the
   other. The pocket goes in its face, near the end, and the pilot comes out
   of its end edge to cross the joint into the face of the panel it lands on,
   which needs nothing drilled in it at all. So a pocket built carcass has
   holes in the bottom, the top and the rails, and a side panel with nothing
   in it but shelf pins and hinge plates.

   A confirmat and a dowel are the other way round: both halves are drilled,
   the panel the screw passes through gets a clearance hole and the panel it
   screws into gets a pilot down its edge. Drawing only one half of those is
   how a carcass ends up with a bottom that will not line up with its sides.
   --------------------------------------------------------------------------- */
export const JOINTS = {
  'pocket-screw': {
    id: 'pocket-screw',
    name: 'Pocket screw',
    /* The flag the schedule turns on. Everything else about a pocket comes
       out of pocket.js, which is where the jig geometry lives. */
    pocket: true,
    faceDia: POCKET.bore,
    faceDepth: 0,
    faceThrough: true,
    edgeDia: POCKET.pilot,
    edgeDepth: 0,
    note: 'One panel is drilled, the one that butts into the other. Set the jig and the stop collar to the thickness of the panel in the jig, not to the thickness of what it screws into. Clamp the joint before you drive the screw: a pocket screw pulls the panel sideways if nothing is holding it.',
  },
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
export const jointMethod = (id) => JOINTS[id] || JOINTS['pocket-screw'];

/* ---------------------------------------------------------------------------
   How a shelf is held up.

   Two answers, and they are different shelves. On pins it is adjustable and
   the holes are in the sides. Pocket screwed it is fixed, the holes are in
   the shelf itself and they go in its underside where nobody looks up at
   them, and it braces the carcass instead of just sitting in it.
   --------------------------------------------------------------------------- */
export const SHELF_FIXES = [
  { id: 'pocket', name: 'Fixed, pocket screwed',
    note: 'Pockets down both long edges of the shelf, drilled in its underside so they are not seen. A fixed shelf stiffens the cabinet, which is what stops a wide one sagging.' },
  { id: 'pins', name: 'Adjustable, on pins',
    note: 'Shelf pin holes in the sides, two either side of the shelf so it moves 64mm up or down. Nothing is drilled in the shelf.' },
];

export const shelfFixOf = (id) => SHELF_FIXES.find((f) => f.id === id) || SHELF_FIXES[0];

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
export const JOINTED = /-(BOT|TOP|RAIL-TB|RAIL-TF|BACK-RAIL)$/;

/* The drawer box panels that screw into the box sides. The base is separate:
   it is thin enough that it often cannot take a pocket at all. */
export const BOX_JOINTED = /-(FRONT|BACK)$/;

export function jointXs(depth, inset = 80) {
  const back = Math.min(inset, depth / 3);
  return [back, depth / 2, depth - inset].map((x) => Math.round(x));
}

/* A hole position is a whole millimetre. Nobody sets out 37.5 with a tape,
   and a jig is drilled to a mark, not to a tenth. */
const hole = (x, y, dia, depth, kind, label) =>
  ({ x: whole(x), y: whole(y), dia, depth, kind, label });

/**
 * One pocket, at a hole centre on the face of the panel.
 *
 * `towards` is the edge the pilot comes out of, as the panel is drawn, so the
 * drawing can put the slot the right way round. A pocket pointing the wrong
 * way is a pocket drilled into the wrong end of the board.
 */
const pocket = (x, y, towards, thickness, label = '') => ({
  x: whole(x), y: whole(y),
  dia: POCKET.bore, depth: 0, kind: 'pocket', label,
  len: Math.round(pocketSlotLength()),
  towards,
  screw: pocketScrew(thickness).name,
});

/**
 * Pockets down one joint on a panel drawn flat.
 *
 * The joint runs along one edge of the panel. The pockets sit a fixed
 * distance in from that edge, spread along it by the rule.
 *
 * @param {'left'|'right'|'top'|'bottom'} edge  which edge the joint is on
 * @param {number} w   panel width as drawn
 * @param {number} h   panel height as drawn
 * @param {number} thk thickness of THIS panel, which is what sets the jig
 * @param {object} rule one of POCKET_RULES
 */
function pocketsOnEdge(edge, w, h, thk, rule) {
  const off = pocketFaceOffset(thk);
  const along = (edge === 'left' || edge === 'right') ? h : w;
  return pocketPositions(along, rule).map((t) => {
    if (edge === 'left') return pocket(off, t, 'left', thk);
    if (edge === 'right') return pocket(w - off, t, 'right', thk);
    if (edge === 'bottom') return pocket(t, off, 'bottom', thk);
    return pocket(t, h - off, 'top', thk);
  });
}

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

    /* A shelf on pins is drilled here, in the side. A shelf that is pocket
       screwed is a fixed shelf: the holes are in the shelf itself and this
       panel gets nothing for it. */
    const shelfFix = shelfFixOf(cfg.shelfFix);
    const shelfYs = shelfFix.id === 'pins'
      ? unit.parts.filter((q) => q.group === 'shelf').map((q) => q.pos[1] + q.size[1] / 2)
      : [];

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

    /* The carcass joint, when the method puts a hole in this panel.

       A pocket screw does not. It is drilled in the panel that butts into
       this one and lands in this face with nothing bored for it, which is
       half the reason to build a carcass that way: the outside of the side
       panel stays whole. */
    const t = cfg.carcassThk ?? 16;
    const mates = unit.parts.filter((q) => q.group === 'carcass' && JOINTED.test(q.code));
    if (!joint.pocket) {
      for (const m of mates) {
        const y = m.pos[1] + t / 2;
        for (const x of jointXs(depth)) {
          holes.push(hole(x, Math.round(y), joint.faceDia,
            joint.faceThrough ? t : joint.faceDepth, 'construction', ''));
        }
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
    if (joint.pocket) {
      notes.push(`${joint.name} carcass. Nothing is drilled in this panel for the joint: the bottom, the top and the rails carry the pockets and land on this face.`);
    } else {
      notes.push(`${joint.name}: ${joint.faceDia}mm ${joint.faceThrough ? 'through the side' : `${joint.faceDepth}mm deep`}.`);
      notes.push(joint.note);
    }
    if (shelfFix.id !== 'pins' && unit.parts.some((q) => q.group === 'shelf')) {
      notes.push('Shelves are fixed and pocket screwed, so there are no pin holes in this panel. The shelves carry their own.');
    }

    return {
      code: part.code, name: part.name, w: depth, h: height, hand,
      xLabel: 'Depth', yLabel: 'Height', holes, notes,
    };
  }

  /* The panel that meets the sides: the bottom, the top, the rails, the back
     rail. Which half of the joint lands in it depends entirely on the method.

     Pocket screwed, this panel carries the whole joint. The pockets go in its
     face, near each end, and the pilots come out of the end edges into the
     sides. Drilled face down on the bench, which for a bottom is its
     underside and for a top is the side you will never see.

     Confirmat or dowel, it is the other half: pilots down the two end edges,
     drawn straddling the edge as a reminder of which way the panel goes on
     the bench. */
  if (part.group === 'carcass' && JOINTED.test(part.code)) {
    const joint = jointMethod(cfg.jointMethod);
    const w = part.L;   // across, the internal width of the carcass
    const h = part.W;   // the depth of the panel
    const holes = [];

    if (joint.pocket) {
      const thk = part.T;
      if (!canPocket(thk)) return null;
      const rule = pocketRule('carcass');
      holes.push(...pocketsOnEdge('left', w, h, thk, rule));
      holes.push(...pocketsOnEdge('right', w, h, thk, rule));
      return {
        code: part.code, name: part.name, w, h,
        xLabel: 'Width', yLabel: 'Depth',
        pockets: true,
        holes,
        notes: [
          'Front edge is at the bottom as drawn. Pockets are in the face that will not be seen: the underside of a bottom, the top of a top, the inside of a rail.',
          pocketNote(thk, h, rule),
          `The pilot comes out of the end edge and lands in the face of the side panel, so nothing is drilled in the side for this joint.`,
          joint.note,
        ],
      };
    }

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

  /* A fixed shelf. Pockets down both long edges, in the underside, so a
     shelf that is holding the cabinet square is not a shelf covered in holes
     you can see. Nothing here when the shelves are on pins: those are drilled
     in the sides and the shelf itself is a plain rectangle. */
  if (part.group === 'shelf') {
    const joint = jointMethod(cfg.jointMethod);
    if (shelfFixOf(cfg.shelfFix).id !== 'pocket') return null;
    const thk = part.T;
    if (!canPocket(thk)) return null;

    const w = part.L;   // across, the width of the shelf
    const h = part.W;   // the depth of the shelf
    const rule = pocketRule('shelf');
    const holes = [
      ...pocketsOnEdge('left', w, h, thk, rule),
      ...pocketsOnEdge('right', w, h, thk, rule),
    ];

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Depth',
      pockets: true,
      holes,
      notes: [
        'Drilled in the UNDERSIDE, front edge at the bottom as drawn. A pocket in the top of a shelf is a pocket you look into every time you open the door.',
        pocketNote(thk, h, rule),
        'Screwed to the sides, so this shelf is fixed. Set it out on the sides before you assemble the carcass and mark both together.',
        joint.note,
      ],
    };
  }

  /* The drawer box front and back, which screw into the box sides. Two
     pockets each end is what a box that size takes. */
  if (part.group === 'box' && BOX_JOINTED.test(part.code)) {
    const thk = part.T;
    if (!canPocket(thk)) return null;
    const w = part.L;   // across, the inside width of the box
    const h = part.W;   // the height of the box side
    const rule = pocketRule('box');
    const holes = [
      ...pocketsOnEdge('left', w, h, thk, rule),
      ...pocketsOnEdge('right', w, h, thk, rule),
    ];

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Height',
      pockets: true,
      holes,
      notes: [
        'Drilled in the face that ends up inside the box, so the pockets are hidden once the drawer is together.',
        pocketNote(thk, h, rule),
        'The pilots come out of the end edges into the box sides. The sides are not drilled.',
      ],
    };
  }

  /* The drawer bottom. The app has always called a recessed base pocket
     screwed, and never drew a single one of the pockets. A butted base goes
     under the sides and is screwed or pinned up through, not pocketed, and a
     6mm bottom cannot take a 9.5mm pocket at all, so both of those come back
     as nothing rather than as holes you cannot drill. */
  if (part.group === 'box' && part.code.endsWith('-BASE')) {
    // Anything but an explicit butted base is the recessed, pocket screwed one.
    if ((cfg.boxBaseFix ?? 'screwed') === 'butted') return null;
    const thk = part.T;
    if (!canPocket(thk)) return null;

    const w = part.L;   // across, the width of the base
    const h = part.W;   // its depth
    const rule = pocketRule('box');
    const holes = [
      ...pocketsOnEdge('left', w, h, thk, rule),
      ...pocketsOnEdge('right', w, h, thk, rule),
    ];

    return {
      code: part.code, name: part.name, w, h,
      xLabel: 'Width', yLabel: 'Depth',
      pockets: true,
      holes,
      notes: [
        'Drilled in the underside, so the pockets are under the drawer where nothing is loaded on them.',
        pocketNote(thk, h, rule),
        'Screwed up into the bottom edges of the box sides. The sides are not drilled.',
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

/**
 * What kind of panel this is, for filtering a schedule down to the job in
 * front of you. Drilling a kitchen is done a kind at a time: every side, then
 * every shelf, then every door, because that is when the jig is set for it.
 */
export function panelKind(panel) {
  if (/-SIDE-[LR]$/.test(panel.code)) return 'side';
  if (/-SHELF-\d+$/.test(panel.code)) return 'shelf';
  if (panel.code.includes('DOOR')) return 'door';
  if (/-DRWR\d+-/.test(panel.code)) return 'box';
  return 'carcass';
}

export const PANEL_KINDS = [
  { id: 'side', name: 'Sides' },
  { id: 'carcass', name: 'Tops, bottoms and rails' },
  { id: 'shelf', name: 'Shelves' },
  { id: 'door', name: 'Doors' },
  { id: 'box', name: 'Drawer boxes' },
];

/** Every drilled panel in a cabinet. */
export function drillUnit(unit, d = DRILL) {
  return unit.parts.map((p) => drillPanel(unit, p, d)).filter(Boolean);
}

export const HOLE_STYLE = {
  pocket: { fill: 'var(--accent)', label: `${POCKET.bore}mm pocket, ${POCKET.angle} degrees` },
  system: { fill: 'var(--dw-line)', label: '5mm shelf pin' },
  construction: { fill: 'var(--accent)', label: 'Carcass joint, through the side' },
  cup: { fill: 'var(--warn)', label: '35mm hinge cup' },
  handle: { fill: 'var(--dw-dim)', label: '5mm handle, through' },
  plate: { fill: 'var(--ok)', label: 'Hinge plate screw' },
  edge: { fill: 'var(--accent)', label: 'Carcass joint, into the end edge' },
};
