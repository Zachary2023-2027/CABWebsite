/* ===========================================================================
   Hardware profiles.

   A runner is not a number. It is a manufactured part with a published
   specification, and the specification says exactly how wide the drawer box
   has to be. Holding that as a bare `runnerClearance: 21` left the most
   important question unanswered: 21mm of clearance to what?

   It matters, because the two readings differ by twice the box side
   thickness on every drawer in the kitchen:

     to the outside of the box   opening 568 gives a box 526 wide outside
     to the inside of the box    opening 568 gives a box 558 wide outside

   Blum's TANDEM figure is a deduction to the inside. An undermount runner
   carries the drawer from below and needs about 5mm beside each box side,
   not 21mm: 21mm each side is side mounted ball bearing geometry, and a box
   built to it would sit in the cabinet with the runners unable to reach it.

   VERIFY BEFORE IMPLEMENTING, and before cutting: every number in this file
   is typed and editable, and the deductions below should be checked against
   the current Blum catalogue for the exact runner you are buying. Getting
   this wrong wastes a sheet of board per kitchen.
   =========================================================================== */

/** Nominal lengths Blum sells TANDEM and LEGRABOX in. */
export const NOMINAL_LENGTHS = [270, 300, 350, 400, 450, 500, 550, 600, 650];

/**
 * How much internal cabinet depth a nominal length needs.
 *
 * The allowance is a typed setting, because the catalogue figure depends on
 * the runner and on how the back is built. Defaulting to 25 and warning
 * rather than blocking, since a runner that will not fit is worth saying out
 * loud and not worth refusing to draw.
 */
export const DEPTH_ALLOWANCE = 25;
export const minDepthFor = (nominalLength, allowance = DEPTH_ALLOWANCE) =>
  nominalLength + allowance;

export const RUNNERS = {
  'tandem-563h': {
    id: 'tandem-563h',
    name: 'Blum TANDEM plus BLUMOTION 563H',
    note: 'Undermount, full extension. Drawer sides 12.7mm to 16mm.',
    sideThkMin: 12.7,
    sideThkMax: 16,
    /* The deduction is from the opening width to the INSIDE of the box.
       Outside width is the inside width plus twice the real side thickness. */
    insideDeduction: 42,
    lengths: NOMINAL_LENGTHS,
    // Drawer box depth equals the nominal length exactly.
    boxDepthFor: (nominalLength) => nominalLength,
    rearNotch: { width: 35, height: 13 },      // minimum
    hookBore: { dia: 6, depth: 10 },
  },

  'tandem-563f': {
    id: 'tandem-563f',
    name: 'Blum TANDEM plus BLUMOTION 563F',
    note: 'Undermount, full extension. Drawer sides over 16mm up to 19mm.',
    sideThkMin: 16.01,
    sideThkMax: 19,
    insideDeduction: 49,
    lengths: NOMINAL_LENGTHS,
    boxDepthFor: (nominalLength) => nominalLength,
    rearNotch: { width: 35, height: 13 },
    hookBore: { dia: 6, depth: 10 },
  },

  legrabox: {
    id: 'legrabox',
    name: 'Blum LEGRABOX',
    note: 'Metal sided. No wooden box sides are cut, only a base and a back.',
    metalSided: true,
    /* Side heights Blum publishes for the system. The height chosen decides
       the back panel height. */
    sideHeights: { N: 66.5, M: 90.5, K: 128.5, C: 177, F: 241 },
    /* VERIFY BEFORE IMPLEMENTING: the exact base and back cutting formulas
       for the height and nominal length in use. These are named fields so
       the value is in one place and can be corrected against the catalogue
       without hunting through the geometry. */
    baseWidthDeduction: 84,     // opening width minus this gives the base width
    baseDepthDeduction: 25,     // nominal length minus this gives the base depth
    backWidthDeduction: 84,
    insideDeduction: 84,
    lengths: NOMINAL_LENGTHS,
    boxDepthFor: (nominalLength) => nominalLength,
  },
};

export const RUNNER_LIST = Object.values(RUNNERS);

/** The profile for an id, falling back to the default rather than throwing. */
export const runnerProfile = (id, custom) => {
  if (custom && custom.id === id) return custom;
  return RUNNERS[id] || RUNNERS['tandem-563h'];
};

/** The nominal length nearest a typed number, from the legal list. */
export const nearestLength = (want, profile = RUNNERS['tandem-563h']) =>
  profile.lengths.reduce((best, x) =>
    (Math.abs(x - want) < Math.abs(best - want) ? x : best), profile.lengths[0]);

/** True when a length is one the profile is actually sold in. */
export const isLegalLength = (length, profile) =>
  (profile.lengths || NOMINAL_LENGTHS).includes(length);

/** The longest nominal length that fits a cabinet of this internal depth. */
export function longestFitting(internalDepth, profile = RUNNERS['tandem-563h'],
  allowance = DEPTH_ALLOWANCE) {
  const fits = (profile.lengths || NOMINAL_LENGTHS)
    .filter((L) => minDepthFor(L, allowance) <= internalDepth);
  return fits.length ? fits[fits.length - 1] : (profile.lengths || NOMINAL_LENGTHS)[0];
}

/* ---------------------------------------------------------------------------
   The drawer box.

   Stated once, here, and used by the drawer builder. Every number the user
   cuts a drawer box to comes out of this function, so there is one place to
   check and one place to correct.
   --------------------------------------------------------------------------- */

/**
 * @param {object} a
 * @param {number} a.cabinetWidth   outside width of the carcass
 * @param {number} a.carcassThk     side panel thickness
 * @param {number} a.boxSideThk     drawer box side thickness
 * @param {number} a.nominalLength  runner length, one of the legal lengths
 * @param {object} a.profile        a runner profile
 */
export function drawerBox({
  cabinetWidth, carcassThk, boxSideThk, nominalLength, profile, deduction,
}) {
  /* The deduction is the one number every drawer in the kitchen depends on,
     and it is the one number that cannot be checked from inside a browser.
     So it is typed: the profile carries the published figure as a starting
     point, and whatever you measure off the runner in your hand wins. */
  /* Number(null) is 0 and Number('') is 0, so an unset deduction would read
     as deducting nothing and make every box the full width of the opening.
     Emptiness has to be tested before the number is. */
  const typed = (deduction === null || deduction === undefined || deduction === '')
    ? null : Number(deduction);
  const insideDeduction = (typed !== null && Number.isFinite(typed) && typed >= 0)
    ? typed : profile.insideDeduction;

  const openingWidth = cabinetWidth - 2 * carcassThk;
  const insideWidth = openingWidth - insideDeduction;
  const outsideWidth = insideWidth + 2 * boxSideThk;

  return {
    insideDeduction,
    openingWidth,
    insideWidth,
    outsideWidth,
    /* Clearance is what is left beside the box, not an input. Reporting it
       makes the reading obvious: about 5mm a side on an undermount runner,
       and anything near 20 means the deduction is being read as an outside
       measurement again. */
    clearanceEachSide: (openingWidth - outsideWidth) / 2,
    boxSideLength: profile.boxDepthFor(nominalLength),
    boxFrontBackLength: insideWidth,
    boxDepth: profile.boxDepthFor(nominalLength),
  };
}

/* ---------------------------------------------------------------------------
   Migration.

   The old model held a per side clearance with no stated meaning. Twice 21 is
   42, which is the TANDEM 563H deduction, so a project carrying 21 was almost
   certainly meant to be that runner. Anything else becomes a named custom
   profile rather than being silently reinterpreted, and the user is told.
   --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Hinges.

   The old code carried a single number, cupSetback: 22.5, with no statement
   of where it came from. It comes from two separate things added together,
   and only one of them is yours to choose:

     17.5   half the 35mm cup, fixed by the cutter
      5     the boring distance, the gap from the cup edge to the door edge

   The boring distance is what sets the overlay: bore closer to the edge and
   the door covers more of the carcass. Blum publish it as a range, roughly
   3mm to 7mm, and the plate you buy has to match. Splitting the number in
   two means the app can say which half you are allowed to change.

   VERIFY BEFORE IMPLEMENTING: the overlay chart, the boring distance that
   goes with each mounting plate height, and the door weight limits per hinge.
   Those are catalogue tables and nothing here invents them. The hinge count
   below is a typed setting with a conservative default, not a published
   figure dressed up as one.
   --------------------------------------------------------------------------- */

/** Half a 35mm cup. Not a setting: it is the cutter. */
export const CUP_RADIUS = 17.5;

export const BORING_DISTANCE = 5;
export const BORING_DISTANCE_MIN = 3;
export const BORING_DISTANCE_MAX = 7;

export const HINGES = {
  'clip-top-blumotion-110': {
    id: 'clip-top-blumotion-110',
    name: 'Blum CLIP top BLUMOTION 110',
    note: 'Soft close, 110 degree opening. Full overlay, half overlay and inset all use the same 35mm cup.',
    cupDia: 35,
    cupDepth: 13,
    boringDistance: BORING_DISTANCE,
    boringMin: BORING_DISTANCE_MIN,
    boringMax: BORING_DISTANCE_MAX,
    /* Mounting plate screw holes sit on the front row of the system grid,
       37mm in from the front edge and 32mm apart up the panel. */
    plateSetback: 37,
    platePitch: 32,
    plateDia: 5,
    plateDepth: 13,
    /* Distance from the top and the bottom of the door to the end hinges.
       A convention, not a specification: it keeps the cup clear of the edge
       banding and off the shelf line. */
    cupFromEnd: 100,
  },

  'clip-top-155': {
    id: 'clip-top-155',
    name: 'Blum CLIP top 155',
    note: 'Wide angle, for a corner cabinet where the door has to clear a return.',
    cupDia: 35,
    cupDepth: 13,
    boringDistance: BORING_DISTANCE,
    boringMin: BORING_DISTANCE_MIN,
    boringMax: BORING_DISTANCE_MAX,
    plateSetback: 37,
    platePitch: 32,
    plateDia: 5,
    plateDepth: 13,
    cupFromEnd: 100,
  },
};

export const HINGE_LIST = Object.values(HINGES);

export const hingeProfile = (id) => HINGES[id] || HINGES['clip-top-blumotion-110'];

/** Where the cup centre sits, measured from the hinged edge of the door. */
export function cupCentre(profile = HINGES['clip-top-blumotion-110'], boringDistance) {
  const typed = (boringDistance === null || boringDistance === undefined || boringDistance === '')
    ? null : Number(boringDistance);
  const b = (typed !== null && Number.isFinite(typed)) ? typed : profile.boringDistance;
  return (profile.cupDia / 2) + b;
}

/** True when a typed boring distance is one the hinge can actually be set to. */
export const boringInRange = (b, profile = HINGES['clip-top-blumotion-110']) =>
  Number.isFinite(Number(b)) && Number(b) >= profile.boringMin && Number(b) <= profile.boringMax;

/**
 * How many hinges a door of this height needs.
 *
 * Typed as three heights rather than a fixed table, because the real answer
 * depends on the door weight as much as the height and the honest thing is
 * to let you set it. The defaults are deliberately on the safe side.
 */
export const HINGE_COUNTS = { two: 900, three: 1600, four: 2000 };

export function hingeCountFor(doorHeight, table = HINGE_COUNTS) {
  const two = Number(table.two) || HINGE_COUNTS.two;
  const three = Number(table.three) || HINGE_COUNTS.three;
  const four = Number(table.four) || HINGE_COUNTS.four;
  const h = Number(doorHeight) || 0;
  if (h <= two) return 2;
  if (h <= three) return 3;
  if (h <= four) return 4;
  return 5;
}

/**
 * Hinge centres up a door, from the bottom edge.
 *
 * The end pair sit a fixed distance in from the ends and anything else is
 * spread evenly between them, which is what you would do by eye and what
 * keeps the load off the middle of a tall door.
 */
export function hingeCentres(doorHeight, count, fromEnd = 100) {
  const n = Math.max(2, Math.round(Number(count) || 2));
  const first = fromEnd;
  const last = doorHeight - fromEnd;
  if (last <= first) return [doorHeight / 2];
  const out = [];
  for (let i = 0; i < n; i++) out.push(first + ((last - first) * i) / (n - 1));
  return out;
}

export function migrateRunnerClearance(clearance) {
  const perSide = Number(clearance);
  if (!Number.isFinite(perSide)) return { profileId: 'tandem-563h', custom: null, changed: false };

  const deduction = perSide * 2;
  const match = RUNNER_LIST.find((p) => p.insideDeduction === deduction);
  if (match) return { profileId: match.id, custom: null, changed: true };

  return {
    profileId: 'custom-runner',
    custom: {
      id: 'custom-runner',
      name: 'Custom runner',
      note: `Carried over from a stored clearance of ${perSide}mm each side. Confirm this against your runner before cutting.`,
      insideDeduction: deduction,
      lengths: NOMINAL_LENGTHS,
      boxDepthFor: (nominalLength) => nominalLength,
      unconfirmed: true,
    },
    changed: true,
  };
}
