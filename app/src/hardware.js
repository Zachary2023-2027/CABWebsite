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
 * VERIFY BEFORE IMPLEMENTING against the Blum catalogue. Defaulting to the
 * nominal length plus 25 and warning rather than blocking, because a runner
 * that will not fit is worth saying out loud and not worth refusing to draw.
 */
export const minDepthFor = (nominalLength) => nominalLength + 25;

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
export function longestFitting(internalDepth, profile = RUNNERS['tandem-563h']) {
  const fits = (profile.lengths || NOMINAL_LENGTHS)
    .filter((L) => minDepthFor(L) <= internalDepth);
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
export function drawerBox({ cabinetWidth, carcassThk, boxSideThk, nominalLength, profile }) {
  const openingWidth = cabinetWidth - 2 * carcassThk;
  const insideWidth = openingWidth - profile.insideDeduction;
  const outsideWidth = insideWidth + 2 * boxSideThk;

  return {
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
