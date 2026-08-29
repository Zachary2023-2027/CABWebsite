/* ===========================================================================
   Pocket hole joinery.

   A pocket screw is the joint a person building cabinets in a shed actually
   uses. It needs one jig, one bit and one box of screws, it clamps itself
   while you drive it, and it puts every hole on the inside of the carcass
   where nobody sees it. A confirmat needs a stepped bit and a hole through
   the outside of the side panel; a dowel needs the whole carcass dry fitted
   before any glue goes near it.

   ---------------------------------------------------------------------------
   The numbers, and where they come from.

   These are the figures Kreg publish and the ones the trade works to. Every
   one of them is stated once here and read from here, so a jig set to
   something else is a change in one place.

     Outermost holes    25 to 50mm in from each end of the joint. Closer than
                        that and the pocket breaks out of the corner.
     Spacing            no more than 150mm between holes, 200 at the outside.
                        A joint with a gap bigger than that opens between the
                        screws.
     How many           at least two per joint, always. One screw is a hinge.
                        A 560mm deep cabinet side takes five, a 320mm wall
                        cabinet three, a drawer box end two.
     The bore           9.5mm, entering at 15 degrees, with a 3.2mm pilot
                        running on ahead of it. One stepped bit does both.
     The screw          #8 x 32mm coarse in 16 to 19mm sheet goods. Coarse,
                        because melamine, MDF and ply have no grain to hold a
                        fine thread.

   Where they go on the panel is not a choice either. The jig sets the pocket
   back from the end of the board by however far the pilot has to travel to
   come out in the middle of the board's thickness, which is arithmetic, not
   a number to look up: at 15 degrees a pilot climbing half of a 16mm board
   has run 30mm along it.

   VERIFY BEFORE BUILDING: check the screw length against the jig and the
   board in front of you. A screw that is one size long comes out of the face
   of the finished cabinet.

   Pure. No React, no DOM.
   =========================================================================== */

/** The bit, and the angle it goes in at. */
export const POCKET = {
  bore: 9.5,        // the pocket itself, what the screw head runs down
  pilot: 3.2,       // the pilot ahead of it, what actually crosses the joint
  angle: 15,        // degrees off the face of the board
};

/**
 * How pockets are spaced along one joint.
 *
 * Three sets, because the joints are not the same joint. A carcass panel is
 * structural and gets the close spacing. A fixed shelf carries books rather
 * than the cabinet, and pocket holes in a shelf are holes you can see from
 * underneath, so it gets the wider one. A drawer box is small and its ends
 * are short.
 */
export const POCKET_RULES = {
  carcass: { endSetback: 50, maxSpacing: 150, min: 2, narrow: 120 },
  shelf: { endSetback: 50, maxSpacing: 200, min: 2, narrow: 120 },
  box: { endSetback: 35, maxSpacing: 150, min: 2, narrow: 100 },
};

export const pocketRule = (id) => POCKET_RULES[id] || POCKET_RULES.carcass;

/**
 * Screws by the thickness of the board the pocket is drilled in.
 *
 * Coarse thread throughout, because everything this app builds out of is a
 * manufactured board with no grain to grip.
 */
export const POCKET_SCREWS = [
  { upTo: 13, name: '#7 x 25mm coarse', length: 25 },
  { upTo: 20, name: '#8 x 32mm coarse', length: 32 },
  { upTo: 28, name: '#8 x 38mm coarse', length: 38 },
  { upTo: Infinity, name: '#8 x 64mm coarse', length: 64 },
];

/** The screw for a board of this thickness. */
export const pocketScrew = (thickness) =>
  POCKET_SCREWS.find((s) => (Number(thickness) || 0) <= s.upTo) || POCKET_SCREWS[1];

/**
 * The thinnest board worth putting a pocket in.
 *
 * A 9.5mm bore in a 6mm drawer bottom is a hole, not a pocket. Under this the
 * schedule says so rather than drawing holes nobody can drill.
 */
export const MIN_POCKET_THICKNESS = 12;

export const canPocket = (thickness) => (Number(thickness) || 0) >= MIN_POCKET_THICKNESS;

/**
 * How far back from the end of the board the pocket centre sits, on the face.
 *
 * The pilot leaves the face at the angle and has to come out halfway through
 * the thickness at the end of the board, so this is one right angled triangle
 * and not a figure to be looked up. On a 16mm panel at 15 degrees it is 30mm,
 * which is what a jig set to 16mm gives you.
 */
export function pocketFaceOffset(thickness, angle = POCKET.angle) {
  const t = Math.max(0, Number(thickness) || 0);
  return (t / 2) / Math.tan((angle * Math.PI) / 180);
}

/**
 * How long the pocket reads on the face of the board.
 *
 * A round bore entering at a shallow angle opens into a slot, and the slot is
 * what you see and what has to clear the edge of the panel. Drawn at this
 * length so a pocket on a drawing is the shape it is on the bench.
 */
export function pocketSlotLength(bore = POCKET.bore, angle = POCKET.angle) {
  return bore / Math.sin((angle * Math.PI) / 180);
}

/**
 * Where the pockets go along one joint.
 *
 * The ends first, held off the corner, then as many between them as it takes
 * to keep inside the spacing. Evenly spread rather than one long gap and one
 * short one, because a run of screws at an even pitch is what you can lay out
 * with a rule and what pulls the joint up straight.
 *
 * @param {number} span    the length of the joint, in millimetres
 * @param {object} rule    one of POCKET_RULES
 * @returns {number[]} positions along the joint, from one end, whole mm
 */
export function pocketPositions(span, rule = POCKET_RULES.carcass) {
  const s = Number(span) || 0;
  if (s <= 0) return [];

  /* Too short for two without their pockets running into each other. One
     down the middle is what you would actually do. */
  if (s < rule.narrow) return [Math.round(s / 2)];

  /* The setback shrinks on a short joint rather than crossing over itself.
     A quarter of the span keeps the two end holes apart on anything narrow
     enough for the full 50 to be silly. */
  const setback = Math.min(rule.endSetback, s / 4);
  const first = setback;
  const last = s - setback;
  const run = last - first;

  const gaps = Math.max(Math.max(2, rule.min) - 1, Math.ceil(run / rule.maxSpacing));
  return Array.from({ length: gaps + 1 }, (_, i) => Math.round(first + (run * i) / gaps));
}

/** How many pockets one joint of this length takes. */
export const pocketCount = (span, rule) => pocketPositions(span, rule).length;

/**
 * The sentence that goes on the drawing.
 *
 * Said once, here, so the screen, the print pack and the notes cannot each
 * describe the same joint differently.
 */
export function pocketNote(thickness, span, rule = POCKET_RULES.carcass) {
  const n = pocketCount(span, rule);
  const screw = pocketScrew(thickness);
  const off = Math.round(pocketFaceOffset(thickness));
  return `${n} pocket${n === 1 ? '' : 's'} down this joint, ${POCKET.bore}mm at ${POCKET.angle} degrees, `
    + `centres ${off}mm back from the end edge. Jig and stop collar set to ${Math.round(thickness)}mm. `
    + `${screw.name}.`;
}
