/* ===========================================================================
   What you actually buy.

   A cut list says what to make. A cost says roughly what it comes to. Neither
   of them is what you take to a supplier, because a supplier does not sell
   you 33 hinges, 12.4 sheets, or 47.3 metres of edge tape.

   They sell hinges in a box of a certain size, sheets whole, tape on a roll.
   So the order list rounds up to what is actually sold, says what is left
   over, and prices the packs rather than the pieces. The difference is real
   money: 33 hinges is two boxes of 20, which is 40 hinges, and the seven
   spares are paid for whether you count them or not.

   ---------------------------------------------------------------------------
   Two numbers that are not the same thing.

     needed    what the drawing says you use
     ordered   what you have to buy to have that many

   Everywhere both are shown, because the gap between them is the thing worth
   seeing. A pack size of 1 makes them equal and the row still reads properly.

   ---------------------------------------------------------------------------
   Pack sizes are settings, not facts.

   Your supplier's box is not mine. Every pack size below is typed with a
   default, and a default of 1 means "sold singly" rather than "unknown".
   =========================================================================== */

import { round1, whole } from './mm.js';
import { benchLength } from './runs.js';
import { jointMethod } from './drilling.js';
import { pocketScrew } from './pocket.js';

/**
 * How things are sold, as a default to start from.
 *
 * A pack of 1 is not a missing value: it means you buy them one at a time,
 * which is true of a benchtop and false of a hinge.
 */
export const PACK_DEFAULTS = {
  hingePack: 20,
  runnerPack: 1,        // a pair is already the unit you buy
  handlePack: 1,
  binRunnerPack: 1,
  /* Edge tape comes on a roll. Buying two metres of it is not a thing you
     can do, and the roll is most of the cost of a small job. */
  edgeTapeRoll: 50,     // metres
  /* Fixings. A confirmat or a dowel is bought by the box, and running out
     three cabinets from the end is its own kind of expensive. */
  screwPack: 200,
  dowelPack: 100,
};

/**
 * How much extra board to buy.
 *
 * Not the same as nesting waste, which is the offcut the layout leaves and is
 * already paid for in the sheet count. This is the sheet you ruin: a chipped
 * edge, a cut on the wrong side of the line, a panel that comes out with the
 * grain the wrong way. Zero is a legitimate setting if you are confident or
 * your supplier is around the corner.
 */
export const SHEET_WASTE_DEFAULT = 0;

/** Round up to whole packs, and say what that leaves over. */
export function packsFor(needed, packSize) {
  const size = Math.max(1, Number(packSize) || 1);
  const want = Math.max(0, Number(needed) || 0);
  const packs = Math.ceil(want / size);
  return {
    packs,
    ordered: packs * size,
    spare: round1(packs * size - want),
    packSize: size,
  };
}

const row = ({ what, needed, unit, packSize, each, note = '' }) => {
  const p = packsFor(needed, packSize);
  return {
    what,
    unit,
    needed: round1(needed),
    packSize: p.packSize,
    packs: p.packs,
    ordered: round1(p.ordered),
    spare: p.spare,
    each,
    /* Priced by what you buy, not by what you use. That is the whole point of
       this screen: two boxes of hinges cost two boxes of hinges.

       Not rounded. round1 is the millimetre path, and a tenth of a dollar is
       not a unit of anything: money is formatted where it is shown and kept
       exact until then, so the lines still add up to the total. */
    cost: p.packs * p.packSize * each,
    note,
  };
};

/* ---------------------------------------------------------------------------
   Edge tape.

   Worked out here rather than read off a screen, so the order list and the cut
   list cannot drift. The rule is the same one the cut list uses: what a part's
   edging field says gets taped.
   --------------------------------------------------------------------------- */

export function edgeMetres(parts) {
  return parts.reduce((a, p) => {
    if (!p.edging) return a;
    if (p.edging.startsWith('All')) return a + (2 * p.L + 2 * p.W) / 1000;
    if (p.edging.startsWith('One')) return a + p.L / 1000;
    return a + p.W / 1000;
  }, 0);
}

/**
 * How many fixings a carcass takes.
 *
 * Read off the drilling schedule rather than guessed, so a kitchen built with
 * dowels orders dowels, one built with confirmats orders confirmats and one
 * built with pocket screws orders pocket screws. Changing the joint method
 * changes the order.
 */
export function fixingCount(project, deps) {
  const { allUnits, drillUnit } = deps;
  let through = 0;

  for (const { unit } of allUnits(project)) {
    for (const panel of drillUnit(unit)) {
      /* Only the hole the fixing itself goes in is counted. The pilot in the
         mating edge is the other half of the same joint, and counting both
         orders twice as many screws as the carcass has joints. A pocket is
         the whole joint in one hole, so it counts once by construction. */
      through += panel.holes.filter(
        (h) => h.kind === 'construction' || h.kind === 'pocket').length;
    }
  }
  return through;
}

/* ---------------------------------------------------------------------------
   The order list.
   --------------------------------------------------------------------------- */

/**
 * Everything you have to buy, as packs.
 *
 * @param {object} project
 * @param {object} prices   PRICES, read at call time so an edited price shows
 * @param {object} deps     the model readers, injected for the same reason
 *                          checks.js takes them: this file derives nothing
 * @returns {{board:object[], hardware:object[], other:object[], total:number}}
 */
export function orderList(project, prices, deps) {
  const {
    allParts, allFittings, allUnits, drillUnit, nestProject, nestCfg, benchPieces,
  } = deps;

  const cfg = project.cfg;
  const packs = { ...PACK_DEFAULTS, ...cfg };
  const wastePct = Number(cfg.sheetWastePct ?? SHEET_WASTE_DEFAULT) || 0;

  const parts = allParts(project);
  const nest = nestProject(parts, nestCfg(project));

  /* --- board -------------------------------------------------------------- */

  const board = nest.groups.map((g) => {
    const sheet = prices.sheets[g.material];
    const each = sheet ? sheet.cost : 0;
    /* The nest says how many sheets the parts need. The waste percentage is
       the sheet you ruin, which is a different thing from the offcut the
       layout leaves: that one is already inside the sheet count. */
    const spares = Math.ceil((g.count * wastePct) / 100);
    return {
      what: g.material,
      unit: 'sheet',
      needed: g.count,
      packSize: 1,
      packs: g.count + spares,
      ordered: g.count + spares,
      spare: spares,
      each,
      cost: (g.count + spares) * each,
      note: spares > 0 ? `${g.count} to cut, ${spares} spare at ${wastePct} percent` : '',
      offcut: `${Math.round(g.wastePct)} percent of the sheet is offcut`,
    };
  });

  /* --- hardware ----------------------------------------------------------- */

  const fittings = allFittings(project);
  const count = (type) => fittings
    .filter((f) => f.type === type)
    .reduce((a, f) => a + f.qty, 0);

  const hardware = [];

  const hinges = count('hinge');
  if (hinges) {
    hardware.push(row({
      what: 'Hinges', needed: hinges, unit: 'hinge',
      packSize: packs.hingePack, each: prices.hinge,
    }));
  }

  /* Runners are bought by length, so each length is its own line. Ordering
     twelve pairs of runners without saying which lengths is not an order. */
  for (const f of fittings.filter((x) => x.type === 'runnerPair')) {
    hardware.push(row({
      what: `Drawer runners, ${whole(f.length)}mm`, needed: f.qty, unit: 'pair',
      packSize: packs.runnerPack, each: prices.runnerPair,
    }));
  }

  const handles = count('handle');
  if (handles) {
    hardware.push(row({
      what: 'Handles', needed: handles, unit: 'handle',
      packSize: packs.handlePack, each: prices.handle,
    }));
  }

  const bins = count('binRunner');
  if (bins) {
    hardware.push(row({
      what: 'Bin runners', needed: bins, unit: 'set',
      packSize: packs.binRunnerPack, each: prices.binRunner,
    }));
  }

  /* Breakfast bar supports. They come through allFittings like everything
     else, so this line and the project total are counting the same brackets
     rather than each working out how many an overhang needs. */
  const brackets = count('barBracket');
  if (brackets) {
    hardware.push(row({
      what: 'Breakfast bar brackets', needed: brackets, unit: 'each',
      packSize: 1, each: prices.barBracket,
      note: 'Or legs, or corbels. Whatever you are holding the overhang up with.',
    }));
  }

  /* --- everything else ---------------------------------------------------- */

  const other = [];

  const metres = edgeMetres(parts);
  if (metres > 0) {
    other.push(row({
      what: 'Edge tape', needed: round1(metres), unit: 'm',
      packSize: packs.edgeTapeRoll, each: prices.edgeTapePerMetre,
      note: `${packs.edgeTapeRoll}m roll`,
    }));
  }

  const fixings = fixingCount(project, { allUnits, drillUnit });
  if (fixings > 0) {
    const method = jointMethod(cfg.jointMethod);
    const dowelled = method.id === 'dowel-8';
    /* A pocket screw is sold by its gauge and length, and which one you want
       is decided by the board it goes in. Naming it saves the walk back to
       the shop. */
    const screw = pocketScrew(cfg.carcassThk ?? 16);
    other.push(row({
      what: method.pocket ? `Pocket screws, ${screw.name}`
        : dowelled ? 'Dowels' : 'Confirmat screws',
      needed: fixings, unit: dowelled ? 'dowel' : 'screw',
      packSize: dowelled ? packs.dowelPack : packs.screwPack,
      /* No seeded price, because a box of screws is a few dollars and
         guessing it wrong is worse than leaving it at zero for you to fill
         in. The count is the useful part. */
      each: Number(prices.fixingEach) || 0,
      note: 'Price yours to set',
    }));
  }

  const bench = benchPieces(project);
  if (bench.length && prices.includeBench !== false) {
    /* benchLength, not a sum of lengths. An island is a slab wider than a
       benchtop and is billed by the area it takes over a standard width, so
       adding its length would order half an island. Computing it here a
       second way is how the order list and the project total end up
       disagreeing about the same benchtop. */
    const benchM = benchLength(bench) / 1000;
    other.push({
      what: 'Benchtop',
      unit: 'm',
      // Exact. A tenth of a metre is a hundred millimetres of benchtop.
      needed: benchM,
      packSize: 1,
      packs: bench.length,
      ordered: round1(benchM),
      spare: 0,
      each: prices.benchPerMetre,
      cost: benchM * prices.benchPerMetre,
      note: `${bench.length} piece${bench.length === 1 ? '' : 's'}, cut to the schedule`,
    });
  }

  for (const e of project.extras || []) {
    if (!e || !e.name) continue;
    const qty = Number(e.qty) || 0;
    const each = Number(e.cost) || 0;
    if (!qty) continue;
    other.push({
      what: e.name, unit: 'each', needed: qty, packSize: 1, packs: qty,
      ordered: qty, spare: 0, each, cost: qty * each,
      note: 'Your own line',
    });
  }

  const all = [...board, ...hardware, ...other];
  return {
    board,
    hardware,
    other,
    total: all.reduce((a, r) => a + r.cost, 0),
    /* What ordering in packs costs over ordering exactly what you use. Worth
       seeing, because it is the number that makes a small job expensive. */
    packOverhead: all.reduce((a, r) => a + r.spare * r.each, 0),
  };
}
