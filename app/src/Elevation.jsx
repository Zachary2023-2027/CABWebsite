/* ===========================================================================
   2D elevation. The primary canvas of the planner.
   Drawn to scale from the same part list the 3D uses, so door and drawer
   divisions cannot disagree between the two views.
   Hairline strokes, monospaced dimension text, restrained fills.
   =========================================================================== */

import { useMemo, useRef, useState } from 'react';
import { finish, finishFor } from './finishes.js';
import { snapX, unitWarnings } from './project.js';

const S = 4;        // hairline, mm at drawing scale
/* Text sizes in millimetres of drawing.

   These were set at a desk. Read at arm's length on a tablet propped against
   a saw they were too small, and the numbers on this drawing are the whole
   point of it, so they are bigger than the drawing strictly needs. */
const FS = 72;      // cabinet number and width
const FS_DIM = 88;  // dimension line

/* How far the pointer has to travel before a press turns into a drag. Below
   this it is a tap, and a tap selects. In millimetres of drawing, so it
   scales with the zoom rather than being a fixed number of pixels. */
const DRAG_START = 40;

export default function Elevation({ lay, cfg, selected, selDrawer, onSelect, onHover, onDrag }) {
  /* The drag is held here and committed on release. Writing every pointer
     move into the project would re-derive the whole kitchen, and the nest
     with it, sixty times a second. */
  const [drag, setDrag] = useState(null);
  const press = useRef(null);
  const svgRef = useRef(null);

  /** Pointer position in drawing millimetres. */
  const atPointer = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(m.inverse());
  };

  const startPress = (p) => (e) => {
    if (e.button != null && e.button !== 0) return;
    const at = atPointer(e);
    if (!at) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { uid: p.item.uid, from: at.x, x0: p.x, moved: false, placed: p };
  };

  const movePress = (e) => {
    const st = press.current;
    if (!st) return;
    const at = atPointer(e);
    if (!at) return;
    const delta = at.x - st.from;
    if (!st.moved && Math.abs(delta) < DRAG_START) return;
    st.moved = true;
    e.preventDefault();
    const { placed } = st;
    const { x, snap } = snapX(lay, placed.item, placed.unit, st.x0 + delta);
    setDrag({ uid: st.uid, x, snap, width: placed.unit.width });
  };

  const endPress = (p, drawerNo = null) => (e) => {
    /* A drawer front sits inside its cabinet's group, so this fires twice on
       the way up: once for the front, once for the cabinet. Without stopping
       here the cabinet's turn immediately clears the drawer the front just
       chose. */
    e.stopPropagation();
    const st = press.current;
    press.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (st && st.moved) {
      const at = atPointer(e);
      const last = drag;
      setDrag(null);
      if (last) onDrag?.(st.uid, last.x);
      else if (at) onDrag?.(st.uid, Math.round(st.x0 + (at.x - st.from)));
      return;
    }
    setDrag(null);
    onSelect(p.item.uid, drawerNo);
  };

  const cancelPress = () => { press.current = null; setDrag(null); };

  /* touch-action lives on .elevation in the stylesheet. Setting it on a child
     of an svg does nothing, and setting it once a drag has started is too
     late, because the browser has already given the gesture to the scroller.

     Where a unit is drawn right now, which is not where it is stored while
     you are dragging it. */
  const drawX = (p) => (drag && drag.uid === p.item.uid ? drag.x : p.x);

  const wall = lay.wall;
  const CEIL = cfg.ceiling;
  const L = wall.length;
  const padX = 220;
  const padTop = 140;
  const padBottom = 380;

  const Y = (above) => CEIL - above;   // floor is at CEIL in svg space

  const warnMap = useMemo(() => {
    const m = new Map();
    for (const p of lay.placed) {
      const w = unitWarnings(p, lay, cfg);
      if (w.length) m.set(p.item.uid, w);
    }
    return m;
  }, [lay, cfg]);

  /* Benchtop segments. A cooktop or a tall unit breaks the run. */
  const benchSegs = useMemo(() => {
    const segs = [];
    let cur = null;
    const at = (p) => (drag && drag.uid === p.item.uid ? drag.x : p.x);
    const floor = lay.placed
      .filter((p) => p.where !== 'wall')
      .sort((a, b) => at(a) - at(b));
    for (const p of floor) {
      const carries =
        p.unit.kind === 'base' || p.unit.kind === 'filler' ||
        (p.unit.cavity && !p.unit.breaksBench && !p.unit.fullHeight);
      if (!carries) { cur = null; continue; }
      if (cur && Math.abs(cur.x + cur.w - at(p)) < 0.5) cur.w += p.unit.width;
      else { cur = { x: at(p), w: p.unit.width }; segs.push(cur); }
    }
    return segs;
  }, [lay, drag]);

  const rect = (x, y, w, h, fill, extra = {}) => (
    <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
          fill={fill} stroke="var(--dw-line)" strokeWidth={S} {...extra} />
  );

  return (
    <svg className="elevation" role="img" ref={svgRef}
         onPointerMove={movePress} onPointerCancel={cancelPress}
         aria-label={`Elevation of ${wall.name}, ${L}mm long`}
         viewBox={`${-padX} ${-padTop} ${L + padX * 2} ${CEIL + padTop + padBottom}`}
         preserveAspectRatio="xMidYMid meet">

      <defs>
        <pattern id="hatch" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="60" stroke="var(--dw-hatch)" strokeWidth={S} />
        </pattern>
        <pattern id="hatchTight" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="34" stroke="var(--dw-hatch)" strokeWidth={S} />
        </pattern>
      </defs>

      {/* wall plane, ceiling, floor */}
      <rect x="0" y="0" width={L} height={CEIL} fill="var(--dw-ghost)" opacity="0.35" />
      <line x1="0" y1="0" x2={L} y2="0" stroke="var(--dw-dim)" strokeWidth={S}
            strokeDasharray="24 18" opacity="0.8" />
      <line x1={-padX + 60} y1={CEIL} x2={L + padX - 60} y2={CEIL}
            stroke="var(--dw-line)" strokeWidth={S * 2} />
      {Array.from({ length: Math.ceil((L + padX * 2) / 90) }, (_, i) => {
        const x = -padX + 60 + i * 90;
        return <line key={i} x1={x} y1={CEIL + 70} x2={x + 55} y2={CEIL}
                     stroke="var(--dw-line)" strokeWidth={S} opacity="0.45" />;
      })}

      {/* obstacles sit behind the cabinets */}
      {(wall.obstacles || []).map((o, i) => (
        <g key={i}>
          {rect(o.x, Y(o.y + o.h), o.w, o.h, 'url(#hatch)')}
          <text x={o.x + o.w / 2} y={Y(o.y + o.h) - 24} textAnchor="middle"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>{o.label}</text>
        </g>
      ))}

      {/* Kickboard, one strip under each floor standing unit.

          The strip is set back 20mm each side, which quietly assumed every
          cabinet is wider than 40mm. An end panel is 18mm wide, so the strip
          came out 22mm wide the wrong way and the browser refused to draw it.
          A unit that reaches the floor has no kick under it either, so those
          are left out rather than clamped to nothing. */}
      {lay.placed
        .filter((p) => p.where !== 'wall' && !p.unit.cavity
          && p.unit.mountY > 0 && p.unit.width > 40)
        .map((p) => (
          <rect key={`k${p.item.uid}`} x={drawX(p) + 20} y={Y(cfg.kick)}
                width={p.unit.width - 40} height={cfg.kick}
                fill={finishFor('kick', cfg).hex} fillOpacity={0.75}
                stroke="var(--dw-line)" strokeWidth={S} />
        ))}

      {/* units */}
      {lay.placed.map((p) => {
        const { unit } = p;
        const x = drawX(p);
        const isSel = selected === p.item.uid;
        const isDragging = drag && drag.uid === p.item.uid;
        const warned = warnMap.has(p.item.uid);
        const y = Y(unit.mountY + unit.height);

        const common = {
          onPointerDown: startPress(p),
          onPointerUp: endPress(p),
          /* Selection is decided on pointer up, but a press and release still
             produces a click afterwards, and the background listens for that
             to clear the selection. Swallow it here or every drag ends with
             nothing selected. */
          onClick: (e) => e.stopPropagation(),
          onMouseEnter: () => onHover?.(p),
          onMouseLeave: () => onHover?.(null),
          style: { cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' },
          opacity: isDragging ? 0.85 : undefined,
        };

        if (unit.cavity) {
          return (
            <g key={p.item.uid} {...common}>
              <rect x={x} y={y} width={unit.width} height={unit.height}
                    fill="var(--dw-appliance)" stroke="var(--dw-line)" strokeWidth={S}
                    strokeDasharray="30 20" />
              <text x={x + unit.width / 2} y={y + unit.height / 2} textAnchor="middle"
                    dominantBaseline="middle" fill="var(--dw-dim)"
                    fontFamily="var(--font-mono)" fontSize={FS}>
                {unit.family.name.replace(' space', '').toUpperCase()}
              </text>
              {isSel && <rect x={x} y={y} width={unit.width} height={unit.height} fill="none"
                              stroke="var(--dw-selected)" strokeWidth={S * 3} />}
            </g>
          );
        }

        if (unit.kind === 'filler') {
          return (
            <g key={p.item.uid} {...common}>
              <rect x={x} y={y} width={unit.width} height={unit.height}
                    fill="url(#hatchTight)" stroke="var(--dw-line)" strokeWidth={S} />
              {isSel && <rect x={x} y={y} width={unit.width} height={unit.height} fill="none"
                              stroke="var(--dw-selected)" strokeWidth={S * 3} />}
            </g>
          );
        }

        const fronts = unit.parts.filter((q) => q.group === 'front');

        return (
          <g key={p.item.uid} {...common}>
            {/* The carcass, in the colour it is actually made of. A drawing
                that shows every kitchen off white is not showing you the one
                you are building. */}
            <rect x={x} y={y} width={unit.width} height={unit.height}
                  fill={finishFor('carcass', unit.cfg).hex}
                  stroke="var(--dw-line)" strokeWidth={S} />

            {/* open shelf units show their shelves instead of fronts */}
            {unit.family.fronts === 'open' && unit.parts.filter((q) => q.group === 'shelf').map((q) => (
              <rect key={q.code} x={x + q.pos[0]} y={Y(unit.mountY + q.pos[1] + q.size[1])}
                    width={q.size[0]} height={q.size[1]}
                    fill={finish(q.finish).hex} stroke="var(--dw-line)" strokeWidth={S} />
            ))}

            {/* oven cavity */}
            {unit.ovenCavity && (
              <rect x={x + 40} y={Y(unit.mountY + unit.ovenCavity.y + unit.ovenCavity.h)}
                    width={unit.width - 80} height={unit.ovenCavity.h}
                    fill="var(--dw-appliance)" stroke="var(--dw-line)" strokeWidth={S} />
            )}

            {/* Doors and drawer fronts, straight off the part list. Drawers are
                numbered top down, the way you count them standing at the
                cabinet, and clicking one selects that drawer for editing. */}
            {fronts.map((q) => {
              const drawerNo = q.drawer ?? null;
              const picked = isSel && drawerNo !== null && selDrawer === drawerNo;
              return (
                <g key={q.code} onClick={(e) => e.stopPropagation()}
                   onPointerDown={startPress(p)} onPointerUp={endPress(p, drawerNo)}>
                  <rect x={x + q.pos[0]} y={Y(unit.mountY + q.pos[1] + q.size[1])}
                        width={q.size[0]} height={q.size[1]}
                        fill={q.code.endsWith('-BLIND') ? 'url(#hatchTight)'
                          : finish(q.finish).hex}
                        fillOpacity={drawerNo !== null ? 0.86 : 1}
                        stroke="var(--dw-line)" strokeWidth={S} />
                  {picked && (
                    <rect x={x + q.pos[0]} y={Y(unit.mountY + q.pos[1] + q.size[1])}
                          width={q.size[0]} height={q.size[1]} fill="none"
                          stroke="var(--dw-selected)" strokeWidth={S * 3} />
                  )}
                </g>
              );
            })}

            {warned && (
              <rect x={x} y={y} width={unit.width} height={unit.height} fill="none"
                    stroke="var(--warn)" strokeWidth={S * 2.5} />
            )}
            {isSel && (
              <rect x={x} y={y} width={unit.width} height={unit.height} fill="none"
                    stroke="var(--dw-selected)" strokeWidth={S * 3} />
            )}
          </g>
        );
      })}

      {/* benchtop over the base run */}
      {benchSegs.map((s, i) => (
        <rect key={i} x={s.x - 10} y={Y(cfg.benchHeight)} width={s.w + 20} height={cfg.benchThk}
              fill="var(--dw-benchtop)" stroke="var(--dw-line)" strokeWidth={S} />
      ))}

      {/* labels: number and width, above the base run and under the wall run */}
      {lay.placed.filter((p) => p.label).map((p) => {
        const isWall = p.where === 'wall';
        const ty = isWall
          ? Y(p.unit.mountY) + FS + 34
          : Y(p.unit.mountY + p.unit.height) - 34;
        return (
          <text key={`l${p.item.uid}`} x={drawX(p) + p.unit.width / 2} y={ty} textAnchor="middle"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>
            {p.label} {p.unit.width}
          </text>
        );
      })}

      {/* While you are dragging: the join it has locked on to, drawn as a
          line the full height of the wall, and the position in millimetres.
          Without this you are guessing whether it took hold. */}
      {drag && drag.snap && (
        <g pointerEvents="none">
          <line x1={drag.snap.kind === 'butt' && drag.snap.label.startsWith('left')
            ? drag.x + drag.width : drag.x}
                y1={-40} x2={drag.snap.kind === 'butt' && drag.snap.label.startsWith('left')
                  ? drag.x + drag.width : drag.x} y2={CEIL + 60}
                stroke="var(--dw-selected)" strokeWidth={S * 2} strokeDasharray="30 18" />
          <text x={drag.x + drag.width / 2} y={-60} textAnchor="middle"
                fill="var(--dw-selected)" fontFamily="var(--font-mono)" fontSize={FS}>
            {drag.snap.label}
          </text>
        </g>
      )}
      {drag && (
        <text x={drag.x + drag.width / 2} y={Y(0) + 120} textAnchor="middle"
              fill="var(--dw-selected)" fontFamily="var(--font-mono)" fontSize={FS_DIM}
              pointerEvents="none">
          {Math.round(drag.x)}
        </text>
      )}

      {/* dimension line along the bottom */}
      <g>
        <line x1="0" y1={CEIL + 210} x2={L} y2={CEIL + 210} stroke="var(--dw-dim)" strokeWidth={S} />
        <line x1="0" y1={CEIL + 170} x2="0" y2={CEIL + 250} stroke="var(--dw-dim)" strokeWidth={S} />
        <line x1={L} y1={CEIL + 170} x2={L} y2={CEIL + 250} stroke="var(--dw-dim)" strokeWidth={S} />
        <text x={L / 2} y={CEIL + 182} textAnchor="middle" fill="var(--dw-dim)"
              fontFamily="var(--font-mono)" fontSize={FS_DIM}>{L}</text>
        {lay.baseRun > 0 && lay.baseRun < L && (
          <>
            <line x1="0" y1={CEIL + 330} x2={lay.baseRun} y2={CEIL + 330}
                  stroke="var(--dw-dim)" strokeWidth={S} strokeDasharray="20 14" />
            <text x={lay.baseRun / 2} y={CEIL + 306} textAnchor="middle" fill="var(--dw-dim)"
                  fontFamily="var(--font-mono)" fontSize={FS}>base run {Math.round(lay.baseRun)}</text>
          </>
        )}
      </g>
    </svg>
  );
}
