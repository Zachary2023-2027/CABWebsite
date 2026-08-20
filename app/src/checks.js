/* ===========================================================================
   Design rules.

   Everything the app already knew was wrong was scattered: a warning on a
   cabinet in the inspector, a note on a wall, an oversize part on the nesting
   screen, a stack that does not add up somewhere else again. You could get to
   the end of a design with four separate things quietly telling you it will
   not work and never see any of them at once.

   This is the one place that asks every question. Nothing here computes new
   geometry: it reads what the model already says and decides whether it is
   acceptable.

   ---------------------------------------------------------------------------
   About the numbers.

   The clearance figures below are the ones people actually use in Australian
   kitchens, and every one of them is a typed setting with a default rather
   than a constant in the code. That is deliberate and it matters:

     They vary by appliance. A gas cooktop wants more room under a range hood
     than an induction one, and the hood's own installation instructions beat
     any general figure.

     They vary by who is cooking. A 1000mm walkway is fine for one person and
     tight for two passing with a hot tray.

     Some of them are regulated and the regulation changes. Nothing in this
     file should be read as a code compliance check, and it does not claim to
     be one.

   VERIFY BEFORE BUILDING: check every figure that matters to you against your
   appliance's installation instructions and the current standard. What this
   screen does is notice when your drawing disagrees with the number you set.
   It cannot know whether the number is right.
   =========================================================================== */

import { BAR_RULES } from './bar.js';
import { round1, whole } from './mm.js';
import { FULL_SWING, degrees, largestSwing } from './motion.js';
import { natureOf, obstacleKind, overlaps } from './obstacles.js';
import { stackProblems } from './stack.js';

/**
 * The clearances, as typed settings.
 *
 * Every one of these is a default to start from, not a rule this app is
 * asserting. They live in PROJECT so a project carries its own.
 */
export const CLEARANCE_DEFAULTS = {
  /* Between two runs facing each other. One person needs enough to open a
     base cabinet and stand up; two need enough to pass. */
  walkwayMin: 1000,
  walkwayComfortable: 1200,

  /* Benchtop to the underside of the wall cabinets. 600 is the usual
     splashback, and a shorter cook often wants less. */
  splashbackMin: 450,

  /* Cooktop to whatever is above it. VERIFY BEFORE BUILDING: this depends on
     the appliance and on whether it is gas, and the hood's own instructions
     are the figure that counts. The default here is deliberately generous. */
  hoodAboveCooktop: 650,

  /* Beside a cooktop, so a pan handle is not over a drop or against a wall. */
  cooktopToWall: 200,
  /* Between the sink and the cooktop, so there is somewhere to put things. */
  sinkToCooktop: 400,

  /* The highest shelf worth having. Above this you need something to stand
     on, which is worth knowing before it is built rather than after. */
  reachHeight: 1800,

  /* A door narrower than this is not worth hanging. */
  doorMinWidth: 200,
  /* A door that cannot open this far is not usable. */
  doorMinSwing: 75,

  /* The breakfast bar figures, from the one place that holds them. The model
     needs the same numbers to count brackets, so they are not this file's to
     own. */
  ...BAR_RULES,
};

export const LEVELS = ['error', 'warn', 'note'];

/** A bar side, said the way you would say it out loud. */
const BAR_SIDE_NAME = {
  front: 'front', back: 'back', left: 'left end', right: 'right end',
};

const finding = (level, rule, text, where = null) => ({ level, rule, text, where });

/* ---------------------------------------------------------------------------
   Walkways.

   Deferred out of the 3D package, because the 3D view draws the walls
   unrolled into one straight run and a walkway measured on that is measuring
   the wrong geometry. The room layout has what is actually needed: each wall
   with a real origin and a real rotation, so the runs can be put where they
   belong and the gap between them measured.
   --------------------------------------------------------------------------- */

/**
 * A wall's front face as a line segment in the room, in plan.
 *
 * The wall runs along its own x with the room in +z, so the face of the
 * cabinets is the wall line pushed out by however deep they are. Turned by the
 * wall's rotation and moved to its origin, that is where the face really is.
 */
export function wallFace(entry, depth) {
  const { origin, rot, wall } = entry;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = (x, z) => [origin[0] + x * cos + z * sin, origin[1] - x * sin + z * cos];

  return {
    id: wall.id,
    name: wall.name,
    depth,
    a: at(0, depth),
    b: at(wall.length, depth),
  };
}

/** The deepest thing standing on the floor of a wall, which is what juts out. */
export function runDepth(entry, cfg) {
  let deepest = 0;
  for (const p of entry.lay.placed) {
    if (p.unit.kind === 'wall') continue;
    deepest = Math.max(deepest, p.unit.depth || 0);
  }
  return deepest || cfg.baseDepth;
}

/**
 * Whether two runs face each other, and how far apart they are if they do.
 *
 * Two runs face each other when they are parallel and their spans overlap.
 * That is a real geometric test, and it has to be: an index based one, where
 * walls next to each other in the list are assumed to meet at a corner, gets
 * a U exactly wrong. In a U both return walls attach to the back wall, so the
 * pair that shares a corner with each other is the pair such a heuristic
 * keeps, and the pair that actually faces across the room is the one it
 * throws away.
 *
 * @returns {?{gap:number, overlap:number}} null when they do not face
 */
export function facingGap(p, q, tolerance = 0.05) {
  const dir = (f) => {
    const dx = f.b[0] - f.a[0];
    const dz = f.b[1] - f.a[1];
    const len = Math.hypot(dx, dz);
    return len < 1e-6 ? null : [dx / len, dz / len];
  };

  const u = dir(p);
  const v = dir(q);
  if (!u || !v) return null;

  // Parallel or anti parallel: the cross product of the two directions is nil.
  if (Math.abs(u[0] * v[1] - u[1] * v[0]) > tolerance) return null;

  // The perpendicular distance from one run's line across to the other.
  const normal = [-u[1], u[0]];
  const gap = Math.abs((q.a[0] - p.a[0]) * normal[0] + (q.a[1] - p.a[1]) * normal[1]);

  /* Two parallel runs at opposite ends of a long room are not a walkway. They
     face each other only where they are actually alongside each other. */
  const along = (point) => (point[0] - p.a[0]) * u[0] + (point[1] - p.a[1]) * u[1];
  const pLen = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const qFrom = Math.min(along(q.a), along(q.b));
  const qTo = Math.max(along(q.a), along(q.b));
  const overlap = Math.min(pLen, qTo) - Math.max(0, qFrom);

  if (overlap <= 0) return null;
  return { gap: round1(gap), overlap: round1(overlap) };
}

/**
 * The faces a run presents to the room.
 *
 * A wall has one: the front of its cabinets. An island has two, because it is
 * free standing and you walk on both sides of it. Leaving the second one out
 * misses the gap that matters most in a kitchen with an island.
 */
export function facesOf(entry, cfg) {
  if (!entry.island) return [wallFace(entry, runDepth(entry, cfg))];

  const depth = entry.depth ?? runDepth(entry, cfg);

  /* A breakfast bar is what you actually walk into. The carcass stops where it
     stops, but the top runs on past it at chest height, and measuring the
     walkway to the cabinet rather than to the edge of the slab reports a gap
     nobody can use.

     Only one side carries it, so the other keeps the carcass face. */
  const bar = entry.bar || { side: 'none', depth: 0 };
  const out = bar.side === 'front' ? -bar.depth : 0;
  const back = depth + (bar.side === 'back' ? bar.depth : 0);

  return [
    { ...wallFace(entry, out), name: `${entry.wall.name}, front`, bar: bar.side === 'front' },
    { ...wallFace(entry, back), name: `${entry.wall.name}, back`, bar: bar.side === 'back' },
  ];
}

/** Every gap between two runs that face each other across the room. */
export function walkways(project, roomEntries) {
  const cfg = project.cfg;
  const faces = roomEntries.flatMap((e) => facesOf(e, cfg));
  const out = [];

  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      /* The two faces of one island are not a walkway across each other:
         they are the island. */
      if (faces[i].id === faces[j].id) continue;
      const facing = facingGap(faces[i], faces[j]);
      if (!facing) continue;
      out.push({
        between: [faces[i].name, faces[j].name],
        gap: facing.gap,
        overlap: facing.overlap,
        /* A gap somebody sits in is not the same gap as one they walk through:
           it has to take a stool as well. */
        bar: !!(faces[i].bar || faces[j].bar),
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   The rules.
   --------------------------------------------------------------------------- */

/**
 * Every question worth asking about a project.
 *
 * @param {object} project
 * @param {object} deps  the model readers, injected so this file computes no
 *                       geometry of its own and cannot disagree with the app
 * @returns {{level:string, rule:string, text:string, where:?string}[]}
 */
export function runChecks(project, deps) {
  const {
    floorPlan, layoutFor, roomOffsets, allParts, nestProject, nestCfg,
    unitWarnings, wallWarnings,
  } = deps;
  /* barSeats and barBrackets stay on deps rather than being pulled out here,
     because they are read inside the bar loop below and taking them apart
     twice reads worse than leaving them where the rest of the model is. */

  const cfg = project.cfg;
  const clear = { ...CLEARANCE_DEFAULTS, ...project.cfg };
  const out = [];
  const offsets = roomOffsets(project);
  /* The whole floor, not only the joined run, so an island is measured too. */
  const entries = floorPlan(project);
  const lays = project.walls.map((w) => ({ wall: w, lay: layoutFor(project, w, offsets) }));

  /* --- what the model already knew, gathered in one place ----------------- */

  for (const { wall, lay } of lays) {
    /* wallWarnings already says how much each one matters, so its level is
       carried through rather than everything from a wall being a warning. */
    for (const w of wallWarnings(lay, project)) {
      out.push(finding(LEVELS.includes(w.level) ? w.level : 'warn', 'wall', w.text, wall.name));
    }
    for (const p of lay.placed) {
      for (const text of unitWarnings(p, lay, cfg)) {
        out.push(finding('error', 'cabinet', text, `${wall.name}, ${p.label || p.unit.family.name}`));
      }
      /* A front that does not add up is an error you can see on the drawing
         and miss anyway, because it looks like a design decision. */
      if (p.unit.stack) {
        for (const problem of stackProblems(
          p.item.settings?.stack || null, p.unit.height, p.unit.cfg)) {
          out.push(finding(problem.level === 'error' ? 'error' : 'warn', 'front',
            problem.text, `${wall.name}, ${p.label || p.unit.family.name}`));
        }
      }
    }
  }

  /* --- parts that cannot be cut ------------------------------------------ */

  const nest = nestProject(allParts(project), nestCfg(project));
  for (const part of nest.oversize) {
    out.push(finding('error', 'oversize',
      `${part.name} is ${whole(part.L)} by ${whole(part.W)}, which does not fit any sheet you stock.`,
      part.code));
  }

  /* --- walkways ----------------------------------------------------------- */

  for (const w of walkways(project, entries)) {
    const [a, b] = w.between;
    if (w.gap < clear.walkwayMin) {
      out.push(finding('error', 'walkway',
        `${whole(w.gap)}mm between ${a} and ${b}. Under ${clear.walkwayMin} you cannot open a base cabinet and stand up.`,
        `${a} to ${b}`));
    } else if (w.gap < clear.walkwayComfortable) {
      out.push(finding('warn', 'walkway',
        `${whole(w.gap)}mm between ${a} and ${b}. Enough for one person, tight for two.`,
        `${a} to ${b}`));
    } else {
      out.push(finding('note', 'walkway',
        `${whole(w.gap)}mm between ${a} and ${b}.`, `${a} to ${b}`));
    }

    /* Sitting takes more room than walking. A gap wide enough to pass through
       can still be one where the stool has to be pushed in before anybody can
       get past, and that is worth knowing before the stools arrive. */
    if (w.bar && w.gap >= clear.walkwayMin && w.gap < clear.barStoolSpace) {
      out.push(finding('warn', 'bar',
        `${whole(w.gap)}mm behind the breakfast bar. Under ${clear.barStoolSpace} a stool has to be pushed in before anyone can get past it.`,
        `${a} to ${b}`));
    }
  }

  /* --- the breakfast bar --------------------------------------------------- */

  for (const entry of entries) {
    if (!entry.island) continue;
    const bar = entry.bar || { side: 'none', depth: 0 };
    if (bar.depth <= 0) continue;

    const where = entry.wall.name;
    const side = BAR_SIDE_NAME[bar.side] || bar.side;

    if (bar.depth < clear.barKneeDepth) {
      out.push(finding('warn', 'bar',
        `The ${whole(bar.depth)}mm overhang on the ${side} is under the ${clear.barKneeDepth} it takes to get knees under it. That is a wide benchtop rather than somewhere to sit.`,
        where));
    }

    const seats = deps.barSeats(entry.wall, cfg, clear, bar);
    out.push(seats > 0
      ? finding('note', 'bar',
        `${seats} ${seats === 1 ? 'stool fits' : 'stools fit'} at the ${side}, at ${clear.barSeatWidth}mm each.`,
        where)
      : finding('warn', 'bar',
        `Nothing like enough along the ${side} for one stool at ${clear.barSeatWidth}mm.`,
        where));

    const brackets = deps.barBrackets(entry.wall, cfg, clear, bar);
    if (brackets > 0) {
      out.push(finding('note', 'bar',
        `${whole(bar.depth)}mm is past the ${clear.barMaxUnsupported} this top carries on its own, so it wants ${brackets} brackets or legs. They are on the order list.`,
        where));
    }
  }

  /* --- heights ------------------------------------------------------------ */

  const splashback = cfg.wallMount - cfg.benchHeight;
  if (splashback < clear.splashbackMin) {
    out.push(finding('warn', 'splashback',
      `${whole(splashback)}mm from the benchtop to the wall cabinets. Under ${clear.splashbackMin} there is nowhere to work.`));
  }

  const topShelf = cfg.wallMount + cfg.wallCabHeight;
  if (topShelf > clear.reachHeight + 400) {
    out.push(finding('note', 'reach',
      `The top of the wall cabinets is at ${whole(topShelf)}. Anything above about ${clear.reachHeight} needs something to stand on.`));
  }

  /* --- doors that cannot be used ------------------------------------------ */

  for (const { wall, lay } of lays) {
    const placed = lay.placed.filter((p) => !p.unit.cavity && p.unit.kind !== 'filler');
    for (const p of placed) {
      const others = placed
        .filter((q) => q.item.uid !== p.item.uid)
        .map((q) => ({
          x0: q.x, x1: q.x + q.unit.width, z0: 0, z1: q.unit.depth,
          y0: q.unit.mountY, y1: q.unit.mountY + q.unit.height,
          label: q.unit.family.name,
        }));

      for (const door of p.unit.parts.filter(
        (d) => d.group === 'front' && d.code.includes('DOOR'))) {
        const where = `${wall.name}, ${p.label || p.unit.family.name}`;

        if (door.size[0] < clear.doorMinWidth) {
          out.push(finding('warn', 'door',
            `${door.name} is only ${whole(door.size[0])}mm wide. Under ${clear.doorMinWidth} it is not worth hanging.`,
            where));
        }

        const reach = largestSwing(door, p.x, others, FULL_SWING, 22, p.unit.mountY);
        if (degrees(reach) < clear.doorMinSwing) {
          out.push(finding('error', 'door',
            `${door.name} only opens ${degrees(reach)} degrees before it fouls something.`,
            where));
        }
      }
    }
  }

  /* --- appliances --------------------------------------------------------- */

  for (const { wall, lay } of lays) {
    const cooktops = lay.placed.filter((p) => p.unit.family.appliance === 'cooktop'
      || p.unit.family.appliance === 'cooktopOven');
    const sinks = lay.placed.filter((p) => /sink/i.test(p.unit.family.id));

    for (const c of cooktops) {
      // Room beside it for a pan handle.
      const leftRoom = c.x;
      const rightRoom = wall.length - (c.x + c.unit.width);
      if (leftRoom > 0 && leftRoom < clear.cooktopToWall) {
        out.push(finding('warn', 'cooktop',
          `${whole(leftRoom)}mm from the cooktop to the end of the wall on its left. Under ${clear.cooktopToWall} a pan handle sticks out past it.`,
          wall.name));
      }
      if (rightRoom > 0 && rightRoom < clear.cooktopToWall) {
        out.push(finding('warn', 'cooktop',
          `${whole(rightRoom)}mm from the cooktop to the end of the wall on its right. Under ${clear.cooktopToWall} a pan handle sticks out past it.`,
          wall.name));
      }

      // Somewhere to put a hot pan down between the sink and the heat.
      for (const s of sinks) {
        const gap = s.x > c.x
          ? s.x - (c.x + c.unit.width)
          : c.x - (s.x + s.unit.width);
        if (gap >= 0 && gap < clear.sinkToCooktop) {
          out.push(finding('warn', 'cooktop',
            `${whole(gap)}mm of benchtop between the sink and the cooktop. Under ${clear.sinkToCooktop} there is nowhere to put anything down.`,
            wall.name));
        }
      }

      /* What is over the cooktop. VERIFY BEFORE BUILDING: the appliance
         instructions are the figure that counts, and this is only checking
         against the number you set. */
      const above = lay.placed.filter((p) => p.unit.kind === 'wall'
        && p.x < c.x + c.unit.width && p.x + p.unit.width > c.x);
      for (const a of above) {
        const gap = a.unit.mountY - cfg.benchHeight;
        if (gap < clear.hoodAboveCooktop) {
          out.push(finding('error', 'cooktop',
            `${whole(gap)}mm from the cooktop to the ${a.unit.family.name.toLowerCase()} above it, against the ${clear.hoodAboveCooktop} you have set. Check the appliance instructions.`,
            wall.name));
        }
      }
    }
  }

  /* --- what is on the wall ------------------------------------------------ */

  for (const { wall, lay } of lays) {
    for (const o of wall.obstacles || []) {
      if (natureOf(o) !== 'service') continue;
      const covered = lay.placed.some((p) =>
        overlaps(o, p.x, p.unit.mountY, p.unit.width, p.unit.height));
      if (!covered) {
        out.push(finding('note', 'services',
          `The ${(o.label || obstacleKind(o.kind).name).toLowerCase()} is not inside any cabinet. It will be on show.`,
          wall.name));
      }
    }
  }

  return out;
}

/** The findings grouped by how much they matter. */
export function byLevel(findings) {
  return {
    error: findings.filter((f) => f.level === 'error'),
    warn: findings.filter((f) => f.level === 'warn'),
    note: findings.filter((f) => f.level === 'note'),
  };
}

/** A one line summary, for the rail badge and the print pack. */
export function summarise(findings) {
  const { error, warn } = byLevel(findings);
  if (error.length) {
    return { level: 'error', text: `${error.length} thing${error.length === 1 ? '' : 's'} to fix` };
  }
  if (warn.length) {
    return { level: 'warn', text: `${warn.length} thing${warn.length === 1 ? '' : 's'} to look at` };
  }
  return { level: 'ok', text: 'Nothing to fix' };
}
