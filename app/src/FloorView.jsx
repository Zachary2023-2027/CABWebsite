/* ===========================================================================
   The plan. The kitchen from above, and the island you can take hold of.

   Two things this drawing does that nothing else in the app could.

   It shows the floor. An elevation shows one wall at a time and the 3D shows
   the room from somewhere you are standing; neither shows you the shape of
   the space left to walk in, which is what decides whether a kitchen works.

   And it lets you put the island somewhere. Its position used to be two typed
   numbers, so setting it out was type, look, type again, and the number you
   were really after, the walkway, was never the number you were typing. Here
   you drag it, the gaps redraw as you go, and it pulls towards the positions
   worth landing on: the minimum walkway, a comfortable one, or square in the
   middle of the floor.

   Everything drawn here comes from the model. The carcasses are the same ones
   the clearance checks measure and the gaps are the same ones the warning
   strip is counting, so this cannot show a kitchen the rest of the app
   disagrees with.
   =========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from './mm.js';
import {
  PLAN, barStrips, gapArrows, islandExtent, missingFromPlan, planBounds, planBoxes, planWalls,
  snapIsland,
} from './floor.js';
import { floorPlan, isIsland, islandAt } from './project.js';
import { finishFor } from './finishes.js';

const S = 6;          // hairline, mm at drawing scale
const FS = 92;        // a cabinet's number
const FS_DIM = 108;   // a dimension
const DRAG_START = 30;  // mm of travel before a press becomes a drag

/** Where the arrow head goes on a dimension, in mm of drawing. */
const ARROW = 60;

function Arrow({ g }) {
  const flip = g.to < g.from;
  const [a, b] = flip ? [g.to, g.from] : [g.from, g.to];
  const mid = (a + b) / 2;
  const horiz = g.axis === 'x';

  /* Along the axis the gap runs, across it the arrow sits in the middle of
     the stretch where the two runs actually pass each other. */
  const p = (v) => (horiz ? { x: v, y: g.at } : { x: g.at, y: v });
  const A = p(a);
  const B = p(b);
  const M = p(mid);

  const tick = (q, dir) => (horiz
    ? `M${q.x} ${q.y - ARROW} L${q.x} ${q.y + ARROW} M${q.x} ${q.y} l${dir * ARROW} ${-ARROW * 0.5} M${q.x} ${q.y} l${dir * ARROW} ${ARROW * 0.5}`
    : `M${q.x - ARROW} ${q.y} L${q.x + ARROW} ${q.y} M${q.x} ${q.y} l${-ARROW * 0.5} ${dir * ARROW} M${q.x} ${q.y} l${ARROW * 0.5} ${dir * ARROW}`);

  return (
    <g className={`plan-gap plan-gap--${g.level}`} pointerEvents="none">
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} strokeWidth={S} />
      <path d={tick(A, 1)} strokeWidth={S} fill="none" />
      <path d={tick(B, -1)} strokeWidth={S} fill="none" />
      {/* Beside the line, never on it. A number sitting on the dimension it
          belongs to is a number with a line through it, and on a plan there
          is always something else drawn underneath as well. */}
      <text x={M.x + (horiz ? 0 : ARROW * 1.3)} y={M.y - (horiz ? ARROW * 1.2 : 0)}
            fontSize={FS_DIM} textAnchor={horiz ? 'middle' : 'start'}
            dominantBaseline={horiz ? 'auto' : 'middle'}>
        {fmt(g.gap)}
      </text>
    </g>
  );
}

/**
 * One carcass, on the floor.
 *
 * It carries its own identity in the markup rather than in a handler, because
 * a cabinet on an island is inside the thing you drag. A press on it has to be
 * able to become a drag of the island, and only turn into a selection if it
 * turns out to have been a tap, and that decision belongs to whatever is
 * holding the press, not to the rectangle under the pointer.
 */
function Box({ b, tint, selected, onPick }) {
  const wallCab = b.where === 'wall';
  const w = b.x1 - b.x0;
  const h = b.z1 - b.z0;
  const small = Math.min(w, h) < FS * 2.2;

  return (
    <g className={`plan-box ${selected ? 'is-sel' : ''}`}
       data-uid={b.uid} data-side={b.side || ''}
       onClick={onPick ? (e) => { e.stopPropagation(); onPick(b); } : undefined}
       style={{ cursor: 'pointer' }}>
      <rect x={b.x0} y={b.z0} width={w} height={h}
            fill={wallCab ? 'none' : (b.cavity ? 'var(--dw-appliance)' : tint)}
            fillOpacity={wallCab ? 0 : (b.cavity ? 0.75 : 0.55)}
            stroke={selected ? 'var(--dw-selected)' : 'var(--dw-line)'}
            strokeWidth={selected ? S * 2.4 : S}
            strokeDasharray={wallCab ? `${S * 6} ${S * 5}` : b.cavity ? `${S * 3} ${S * 3}` : undefined} />
      {!wallCab && !small && (
        <text x={(b.x0 + b.x1) / 2} y={(b.z0 + b.z1) / 2} fontSize={FS}
              textAnchor="middle" dominantBaseline="middle" className="plan-label">
          {b.label}
        </text>
      )}
    </g>
  );
}

export default function FloorView({ project, selected, onPick, onMoveIsland, onMissing }) {
  const cfg = project.cfg;
  const svgRef = useRef(null);
  const press = useRef(null);
  const [drag, setDrag] = useState(null);

  /* The floor as the model has it, with whatever island is being dragged put
     where the pointer has it rather than where it is stored. Writing a drag
     into the project on every pointer move would re-derive the whole kitchen,
     and the nest with it, sixty times a second. */
  const shown = useMemo(() => {
    if (!drag) return project;
    return {
      ...project,
      walls: project.walls.map((w) => (w.id === drag.id
        ? { ...w, at: { x: drag.x, y: drag.y } } : w)),
    };
  }, [project, drag]);

  const entries = useMemo(() => floorPlan(shown), [shown]);
  const boxes = useMemo(() => planBoxes(entries), [entries]);
  const walls = useMemo(() => planWalls(entries), [entries]);
  const bars = useMemo(() => entries.filter((e) => e.island)
    .flatMap((e) => barStrips(e.wall, cfg).map((s) => ({ ...s, id: e.wall.id }))),
  [entries, cfg]);

  const islands = useMemo(() => entries.filter((e) => e.island), [entries]);

  /* Walls the room shape has no place for. Said out loud rather than left as
     a plan that is quietly missing a run of cabinets. It goes out to the
     caller rather than onto the drawing, because svg text does not wrap and
     this is a sentence, not a dimension. */
  const missing = useMemo(() => missingFromPlan(shown, entries), [shown, entries]);
  const missingKey = missing.map((w) => w.name).join(', ');
  useEffect(() => { onMissing?.(missing); }, [missingKey]);

  /* The gaps around whichever island you are moving, or around every island
     when you are not. Nothing else in the room moves, so nothing else needs
     its dimensions drawn over the top of the cabinets. */
  const arrows = useMemo(() => {
    const ids = drag ? [drag.id] : islands.map((e) => e.wall.id);
    return ids.flatMap((id) => gapArrows(entries, cfg, id));
  }, [entries, cfg, drag, islands]);

  const bounds = useMemo(
    () => planBounds([...boxes, ...walls, ...bars], PLAN.pad),
    [boxes, walls, bars],
  );

  /* The drawing holds still while you drag.

     Without this the frame grows to fit the island as it moves, so the same
     screen point means a different millimetre from one pointer move to the
     next, and the island runs away from the pointer. Frozen at the moment the
     press starts and let go of on release, which is also what makes a drag
     feel like moving a thing rather than steering one. */
  const held = useRef(null);
  const view = (drag && held.current) || bounds;

  const tint = useMemo(() => finishFor('front', cfg).hex, [cfg]);

  /** Pointer position in millimetres of floor. */
  const atPointer = (e) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(m.inverse());
  };

  const startPress = (wall) => (e) => {
    if (e.button != null && e.button !== 0) return;
    const at = atPointer(e);
    if (!at) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    held.current = bounds;
    const from = islandAt(wall, cfg);
    /* Which cabinet the press landed on, if it landed on one. Read off the
       drawing rather than handed in, so pressing anywhere on the island
       starts the same drag and only the tap at the end cares what was under
       the pointer. */
    const hit = e.target.closest?.('[data-uid]');
    press.current = {
      id: wall.id, wall, ox: at.x, oz: at.y, x0: from.x, y0: from.y, moved: false,
      uid: hit?.dataset?.uid || null, side: hit?.dataset?.side || null,
    };
  };

  const movePress = (e) => {
    const st = press.current;
    if (!st) return;
    const at = atPointer(e);
    if (!at) return;
    const dx = at.x - st.ox;
    const dz = at.y - st.oz;
    if (!st.moved && Math.hypot(dx, dz) < DRAG_START) return;
    st.moved = true;
    e.preventDefault();
    const want = { x: st.x0 + dx, y: st.y0 + dz };
    const snapped = snapIsland(entries, st.wall, cfg, want);
    setDrag({ id: st.id, ...snapped });
  };

  const endPress = (wall) => (e) => {
    const st = press.current;
    press.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const last = drag;
    setDrag(null);
    held.current = null;
    if (st && st.moved && last) {
      e.stopPropagation();
      onMoveIsland?.(wall.id, { x: Math.round(last.x), y: Math.round(last.y) });
      return;
    }
    /* Not a drag, so it was a tap, and a tap picks whatever it landed on. */
    onPick?.({ wallId: wall.id, uid: st?.uid || null, side: st?.side || null });
  };

  const cancelPress = () => { press.current = null; setDrag(null); held.current = null; };

  const wallBoxes = boxes.filter((b) => !b.island);
  const islandBoxes = boxes.filter((b) => b.island);

  return (
    <svg className="floorplan" ref={svgRef} role="img"
         aria-label="Plan of the kitchen floor"
         viewBox={`${view.x0} ${view.z0} ${view.w} ${view.h}`}
         preserveAspectRatio="xMidYMid meet"
         onPointerMove={movePress} onPointerCancel={cancelPress}>

      {/* The room. Drawn first and solid, so everything else sits on it. */}
      {walls.map((w) => (
        <rect key={w.id} x={w.x0} y={w.z0} width={w.x1 - w.x0} height={w.z1 - w.z0}
              fill="var(--dw-kick)" stroke="var(--dw-line)" strokeWidth={S} />
      ))}

      {/* Everything against a wall. */}
      {wallBoxes.filter((b) => b.where !== 'wall').map((b) => (
        <Box key={`${b.uid}-c`} b={b} tint={tint} selected={b.uid === selected}
             onPick={() => onPick?.({ wallId: b.wallId, uid: b.uid, side: b.side })} />
      ))}
      {wallBoxes.filter((b) => b.where === 'wall').map((b) => (
        <Box key={`${b.uid}-w`} b={b} tint={tint} selected={b.uid === selected}
             onPick={() => onPick?.({ wallId: b.wallId, uid: b.uid, side: b.side })} />
      ))}

      {/* Every island, as one thing you can take hold of. */}
      {islands.map((e) => {
        const ext = islandExtent(e.wall, cfg);
        const mine = islandBoxes.filter((b) => b.wallId === e.wall.id);
        const strips = bars.filter((s) => s.id === e.wall.id);
        const moving = drag?.id === e.wall.id;

        return (
          <g key={e.wall.id} className={`plan-island ${moving ? 'is-moving' : ''}`}
             style={{ cursor: moving ? 'grabbing' : 'grab', touchAction: 'none' }}
             onPointerDown={startPress(e.wall)} onPointerUp={endPress(e.wall)}>

            {/* The whole footprint, top and all. This is the thing you grab,
                and it is what the room actually loses to the island. */}
            <rect x={ext.x0} y={ext.z0} width={ext.x1 - ext.x0} height={ext.z1 - ext.z0}
                  fill="var(--dw-ghost)" fillOpacity={moving ? 0.5 : 0.22}
                  stroke="var(--dw-dim)" strokeWidth={S}
                  strokeDasharray={`${S * 4} ${S * 4}`} />

            {/* The bar is top with nothing under it, which is what makes it
                somewhere to sit rather than more bench. */}
            {strips.map((s, i) => (
              <rect key={i} x={s.x0} y={s.z0} width={s.x1 - s.x0} height={s.z1 - s.z0}
                    fill="var(--dw-benchtop)" fillOpacity={0.5}
                    stroke="var(--dw-line)" strokeWidth={S} />
            ))}

            {mine.filter((b) => b.where !== 'wall').map((b) => (
              <Box key={b.uid} b={b} tint={tint} selected={b.uid === selected} />
            ))}

            {/* At the corner, not in the middle. The middle of an island is
                where every dimension to it lands. */}
            <text x={ext.x0} y={ext.z0 - FS * 0.45} fontSize={FS}
                  textAnchor="start" className="plan-name">
              {e.wall.name} {fmt(ext.length)} x {fmt(ext.depth)}
            </text>
          </g>
        );
      })}

      {/* The gaps, over the top of everything, because they are the answer. */}
      {arrows.map((g, i) => <Arrow key={i} g={g} />)}

      {/* What the drag has locked on to, said in words rather than left for
          you to notice in the numbers. */}
      {drag?.hits?.length > 0 && (
        <text x={view.x0 + view.w / 2} y={view.z0 + FS_DIM * 1.6}
              fontSize={FS_DIM} textAnchor="middle" className="plan-snap"
              pointerEvents="none">
          {[...new Set(drag.hits.map((h) => h.why))].join(' and ')}
        </text>
      )}
    </svg>
  );
}
