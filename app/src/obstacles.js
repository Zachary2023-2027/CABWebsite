/* ===========================================================================
   The things already on the wall.

   A kitchen is not drawn on an empty wall. There is a window where you wanted
   the wall cabinets, a waste pipe coming out at 300 above the floor, a meter
   box nobody can move, and a power point that has to end up somewhere you can
   actually reach. Every one of them changes what you can build, and none of
   them are in the model until you put them there.

   They were already drawn and already warned about. What was missing was any
   way to say one exists: the example kitchen had a window because it was
   typed into the source, and your kitchen could not have anything.

   ---------------------------------------------------------------------------
   The distinction that matters.

   Not everything on a wall is in the way in the same sense:

     A window behind a wall cabinet is a mistake. The cabinet covers it, and
     you cannot open either of them.

     A waste pipe inside a sink base is not a mistake, it is the point. A
     power point inside a cabinet is how the dishwasher gets power.

   So an obstacle says whether a cabinet in front of it is a problem or a
   requirement, and the warnings follow that rather than treating everything
   as an obstruction.
   =========================================================================== */

import { round1 } from './mm.js';

/**
 * @typedef {object} ObstacleKind
 * @property {string} id
 * @property {string} name
 * @property {'blocks'|'service'|'note'} nature
 *   blocks   a cabinet over it is wrong
 *   service  a cabinet over it is fine, and often the reason it is there
 *   note     worth drawing, never a warning on its own
 * @property {number[]} size  a sensible default, [w, h]
 * @property {number} y       a sensible default height off the floor
 */
export const OBSTACLE_KINDS = {
  window: {
    id: 'window', name: 'Window', nature: 'blocks',
    size: [1000, 1200], y: 900,
    note: 'Nothing can sit in front of it, and the benchtop usually runs under it.',
  },
  door: {
    id: 'door', name: 'Doorway', nature: 'blocks',
    size: [820, 2040], y: 0,
    note: 'Floor to head height. Nothing stands in a doorway.',
  },
  'meter-box': {
    id: 'meter-box', name: 'Meter box', nature: 'blocks',
    size: [400, 500], y: 1400,
    note: 'Has to stay reachable, so nothing covers it.',
  },
  beam: {
    id: 'beam', name: 'Beam or bulkhead', nature: 'blocks',
    size: [2000, 300], y: 2100,
    note: 'Drops out of the ceiling. Tall cabinets have to clear it.',
  },
  downpipe: {
    id: 'downpipe', name: 'Pipe or duct', nature: 'blocks',
    size: [150, 2400], y: 0,
    note: 'Runs the full height. A cabinet has to be scribed around it or stop short.',
  },

  power: {
    id: 'power', name: 'Power point', nature: 'service',
    size: [120, 80], y: 1100,
    note: 'Above the benchtop where you use it, or inside a cabinet for an appliance.',
  },
  waste: {
    id: 'waste', name: 'Waste pipe', nature: 'service',
    size: [100, 100], y: 300,
    note: 'Comes out low, inside the sink base. The cabinet back is cut around it.',
  },
  water: {
    id: 'water', name: 'Water', nature: 'service',
    size: [150, 100], y: 450,
    note: 'Stop taps, inside the cabinet they serve.',
  },
  gas: {
    id: 'gas', name: 'Gas point', nature: 'service',
    size: [120, 120], y: 500,
    note: 'Wherever the cooker is going.',
  },
  vent: {
    id: 'vent', name: 'Vent or flue', nature: 'note',
    size: [200, 200], y: 2000,
    note: 'For the range hood ducting to reach.',
  },
};

export const OBSTACLE_LIST = Object.values(OBSTACLE_KINDS);

/** A kind by id, falling back rather than throwing. */
export const obstacleKind = (id) => OBSTACLE_KINDS[id] || OBSTACLE_KINDS.window;

let seq = 0;
const newId = () => `o${(seq++).toString(36)}${Date.now().toString(36).slice(-3)}`;

/**
 * A new obstacle of some kind, at a position on the wall.
 *
 * Everything about it is editable afterwards. The kind only decides what it
 * starts as and what it means, not what it has to stay.
 */
export function newObstacle(kindId, x = 0) {
  const kind = obstacleKind(kindId);
  return {
    id: newId(),
    kind: kind.id,
    label: kind.name,
    x: Math.max(0, Math.round(x)),
    y: kind.y,
    w: kind.size[0],
    h: kind.size[1],
  };
}

/**
 * Whether a cabinet in front of this is a mistake or the point.
 *
 * The kind decides it to begin with, and the obstacle can disagree. A window
 * blocks, normally, but a servery hatch you are deliberately building a
 * cabinet under does not. Saying so has to be possible without turning the
 * window into a power point, which is what changing its kind would do.
 */
export const natureOf = (obstacle) =>
  (obstacle?.nature === 'blocks' || obstacle?.nature === 'service' || obstacle?.nature === 'note'
    ? obstacle.nature
    : obstacleKind(obstacle?.kind).nature);

/** True when a cabinet standing here would be a mistake rather than the point. */
export const blocks = (obstacle) => natureOf(obstacle) === 'blocks';

/** True when this is something a cabinet is expected to be built around. */
export const isService = (obstacle) => natureOf(obstacle) === 'service';

/** Whether a box on the wall overlaps an obstacle. */
export function overlaps(obstacle, x, y, w, h) {
  return x < obstacle.x + obstacle.w && x + w > obstacle.x
    && y < obstacle.y + obstacle.h && y + h > obstacle.y;
}

/**
 * An obstacle arriving from a file, cleaned.
 *
 * Anything that is not a real millimetre value is replaced from the kind
 * rather than carried, so a hand edited file cannot put a window at NaN and
 * take the elevation down with it.
 */
export function cleanObstacle(o) {
  if (!o || typeof o !== 'object') return null;

  const kind = obstacleKind(o.kind);
  const num = (v, fallback) =>
    (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);

  const w = Math.max(1, round1(num(o.w, kind.size[0])));
  const h = Math.max(1, round1(num(o.h, kind.size[1])));

  return {
    id: String(o.id || newId()),
    kind: kind.id,
    ...(['blocks', 'service', 'note'].includes(o.nature) ? { nature: o.nature } : {}),
    label: String(o.label ?? kind.name).slice(0, 60),
    x: Math.max(0, round1(num(o.x, 0))),
    y: Math.max(0, round1(num(o.y, kind.y))),
    w,
    h,
  };
}

/**
 * What an obstacle has to say about the cabinets standing in front of it.
 *
 * A window behind a wall cabinet is a mistake: the cabinet covers it and you
 * cannot open either. A waste pipe inside a sink base is not a mistake, it is
 * the reason the sink base is there, so it is reported as something to cut the
 * back around rather than as something wrong.
 */
export function obstacleNote(obstacle) {
  const kind = obstacleKind(obstacle.kind);
  const label = (obstacle.label || kind.name).toLowerCase();
  const nature = natureOf(obstacle);

  if (nature === 'blocks') {
    return { level: 'error', text: `Runs into the ${label}` };
  }
  if (nature === 'service') {
    return {
      level: 'note',
      text: `The ${label} comes out inside this cabinet. Cut the back around it.`,
    };
  }
  return null;
}
