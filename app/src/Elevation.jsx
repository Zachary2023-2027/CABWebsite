/* ===========================================================================
   2D elevation. The primary canvas of the planner.
   Drawn to scale from the same part list the 3D uses, so door and drawer
   divisions cannot disagree between the two views.
   Hairline strokes, monospaced dimension text, restrained fills.
   =========================================================================== */

import { useMemo, useRef, useState } from 'react';
import { darken, finish, finishFor, isTimber, lighten } from './finishes.js';
import {
  applianceGlyph, beadLines, cupPath, doorStyle, grainLines, handleAt, handleStyle,
  muntins, openingSide, panelRect,
} from './draw2d.js';
import { natureOf, obstacleKind } from './obstacles.js';
import { snapX, unitWarnings } from './project.js';
import { benchSegments } from './fixtures.js';
import { CHAIN, elevationChains, heightChain, labelRows, labelStops } from './elevdim.js';

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

/** A front that does not open takes no handle. */
const NO_HANDLE = { kind: 'none' };

/* ---------------------------------------------------------------------------
   One front.

   The rectangle is the part. Everything drawn on top of it is what the door
   style and the handle say that part looks like, and none of it moves the
   part, changes its size, or reaches the cut list.
   --------------------------------------------------------------------------- */

function Handle({ at, x, y }) {
  const metal = 'var(--dw-metal)';
  if (at.shape === 'knob') {
    return <circle cx={x + at.cx} cy={y + at.cy} r={at.r} fill={metal} />;
  }
  if (at.shape === 'bar') {
    return (
      <rect x={x + at.x} y={y + at.y} width={at.w} height={at.h}
            rx={Math.min(at.w, at.h) / 2} fill={metal} />
    );
  }
  return <path d={cupPath(x + at.cx, y + at.cy, at.w)} fill={metal} />;
}

function PanelDetail({ kind, panel, fin, x, y }) {
  const px = x + panel.x;
  const py = y + panel.y;
  const edge = darken(fin.hex, 0.3);
  const sunk = darken(fin.hex, 0.08);
  const base = (
    <rect x={px} y={py} width={panel.w} height={panel.h}
          fill={sunk} stroke={edge} strokeWidth={S} />
  );

  if (kind === 'recessed') return base;

  if (kind === 'raised') {
    const i = 16;
    return (
      <>
        {base}
        <rect x={px + i} y={py + i} width={Math.max(0, panel.w - 2 * i)}
              height={Math.max(0, panel.h - 2 * i)}
              fill={lighten(fin.hex, 0.06)} stroke={edge} strokeWidth={S} />
      </>
    );
  }

  if (kind === 'bead') {
    return (
      <>
        {base}
        {beadLines(panel.w).map((bx) => (
          <line key={bx} x1={px + bx} y1={py + 6} x2={px + bx} y2={py + panel.h - 6}
                stroke={edge} strokeWidth={S} opacity="0.55" />
        ))}
      </>
    );
  }

  if (kind === 'glass') {
    const m = muntins(panel.w, panel.h);
    return (
      <>
        <rect x={px} y={py} width={panel.w} height={panel.h}
              fill="var(--dw-glass)" stroke={edge} strokeWidth={S * 1.4} />
        {m.v.map((vx) => (
          <line key={`v${vx}`} x1={px + vx} y1={py} x2={px + vx} y2={py + panel.h}
                stroke={edge} strokeWidth={S} />
        ))}
        {m.h.map((hy) => (
          <line key={`h${hy}`} x1={px} y1={py + hy} x2={px + panel.w} y2={py + hy}
                stroke={edge} strokeWidth={S} />
        ))}
      </>
    );
  }

  return null;
}

function Front({ x, y, w, h, fin, ds, hw, isDrawer, side, place, blind, flat, dim }) {
  if (blind) {
    return (
      <rect x={x} y={y} width={w} height={h}
            fill="url(#hatchTight)" stroke="var(--dw-line)" strokeWidth={S} />
    );
  }

  /* Nothing you cannot see into is glazed. A glass kitchen puts a plain
     recessed panel on the drawers and on the false front over the sink,
     rather than showing you a see-through drawer or a window into a bowl. */
  const kind = (isDrawer || flat) && ds.panel === 'glass' ? 'recessed' : ds.panel;
  const panel = kind === 'none' ? null : panelRect(w, h);
  const at = handleAt(hw.kind, isDrawer, side, w, h, place);
  const edge = darken(fin.hex, 0.3);

  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={fin.hex} fillOpacity={dim ? 0.86 : 1}
            stroke="var(--dw-line)" strokeWidth={S} />
      {isTimber(fin) && grainLines(h).map((gy) => (
        <line key={gy} x1={x + 8} y1={y + gy} x2={x + w - 8} y2={y + gy}
              stroke={edge} strokeWidth={S} opacity="0.35" />
      ))}
      {panel && <PanelDetail kind={kind} panel={panel} fin={fin} x={x} y={y} />}
      {at && <Handle at={at} x={x} y={y} />}
    </>
  );
}

/* ---------------------------------------------------------------------------
   An appliance cavity.

   Still a dashed outline, because nothing in it is supplied and the drawing
   has to keep saying so. Drawn as the appliance as well, because a fridge you
   recognise tells you more from across the workshop than the word does.
   --------------------------------------------------------------------------- */

function Appliance({ x, y, w, h, name }) {
  const g = applianceGlyph(name);
  const line = 'var(--dw-line)';
  const metal = 'var(--dw-metal)';

  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill="var(--dw-appliance)"
            stroke={line} strokeWidth={S} strokeDasharray="30 20" />

      {g.canopy && (
        <>
          <rect x={x + w * 0.38} y={y} width={w * 0.24} height={h * 0.45}
                fill="none" stroke={line} strokeWidth={S} />
          <path d={`M ${x + w * 0.3},${y + h * 0.45} L ${x + w * 0.7},${y + h * 0.45} `
                 + `L ${x + w},${y + h} L ${x},${y + h} Z`}
                fill="none" stroke={line} strokeWidth={S} />
        </>
      )}

      {(g.lines || []).map((f) => (
        <line key={`l${f}`} x1={x} y1={y + h * f} x2={x + w} y2={y + h * f}
              stroke={line} strokeWidth={S} opacity="0.7" />
      ))}
      {(g.splits || []).map((sp) => (
        <line key={`s${sp.x}`} x1={x + w * sp.x} y1={y + h * sp.y0}
              x2={x + w * sp.x} y2={y + h * sp.y1}
              stroke={line} strokeWidth={S} opacity="0.7" />
      ))}
      {(g.panels || []).map((q, i) => (
        <rect key={`p${i}`} x={x + w * q.x} y={y + h * q.y} width={w * q.w} height={h * q.h}
              rx={q.round ? Math.min(w * q.w, h * q.h) / 2 : 0}
              fill={q.glass ? 'var(--dw-glass-dark)' : 'none'} fillOpacity={q.glass ? 0.55 : 1}
              stroke={line} strokeWidth={S} opacity="0.8" />
      ))}
      {(g.knobs || []).map((k, i) => (
        <circle key={`k${i}`} cx={x + w * k.cx} cy={y + h * k.cy}
                r={Math.min(w, h) * k.r} fill={metal} />
      ))}
      {(g.bars || []).map((b, i) => (
        <rect key={`b${i}`} x={x + w * b.x} y={y + h * b.y} width={w * b.w} height={h * b.h}
              rx={Math.min(w * b.w, h * b.h) / 2} fill={metal} />
      ))}
    </>
  );
}

export default function Elevation({ lay, cfg, selected, selDrawer, onSelect, onHover, onDrag,
                                   onObstacle, side = 'front' }) {
  /* An island has four sides and you work on one at a time, so the drawing
     shows the side you are on. A wall has one side and everything is on it,
     which is what 'front' means for a wall. */
  const shown = lay.island
    ? lay.placed.filter((p) => p.side === side)
    : lay.placed;

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

  /* The door style and the handle the kitchen is drawn in. One choice for the
     whole project rather than one per cabinet: nobody builds a wall with two
     door styles on it, and both are drawing settings that leave the part list
     exactly where it was. */
  const ds = doorStyle(cfg.doorStyle);
  const hw = handleStyle(cfg.handle);

  const wall = lay.wall;
  const CEIL = cfg.ceiling;
  /* As long as the side being drawn. An island's end runs along its depth,
     and drawing it against the island's length puts a 600 cabinet in the
     middle of three metres of floor that is not there. */
  const L = lay.island && lay.runOf ? lay.runOf(side) : wall.length;
  /* Room for the dimensions. The left pad carries the height chain, the
     bottom pad carries however many horizontal chains this wall has, and both
     are worked out from the chains rather than being constants somebody has
     to remember to change. */
  const shownChains = useMemo(
    () => elevationChains(lay, shown,
      (p) => (drag && drag.uid === p.item.uid ? drag.x : p.x),
      lay.island && lay.runOf ? lay.runOf(side) : lay.wall.length),
    [lay, shown, drag, side],
  );
  const heights = useMemo(() => heightChain(lay, cfg, shown), [lay, cfg, shown]);

  const padX = 460;
  const padTop = 140;
  const padBottom = CHAIN.first + CHAIN.step * shownChains.chains.length + 240;

  const Y = (above) => CEIL - above;   // floor is at CEIL in svg space

  const warnMap = useMemo(() => {
    const m = new Map();
    for (const p of lay.placed) {
      const w = unitWarnings(p, lay, cfg);
      if (w.length) m.set(p.item.uid, w);
    }
    return m;
  }, [lay, cfg]);

  /* Benchtop segments. A cooktop or a tall unit breaks the run.
     One rule, shared with the 3D. While something is being dragged it is
     asked about where that cabinet is now, not where it is stored. */
  const benchSegs = useMemo(
    () => benchSegments(lay, (p) => (drag && drag.uid === p.item.uid ? drag.x : p.x)),
    [lay, drag],
  );

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

      {/* The corner cabinet standing on the wall next door.

          It is not a cabinet on this wall, so there is nothing here to select
          or drag, but it is occupying this stretch of it and cabinets on this
          wall stop at its side. Drawn rather than left as blank wall, because
          an unexplained gap at one end is the thing that used to send people
          looking for a filler to fill it with. */}
      {[
        lay.startOffset > 0 && { key: 'start', x: 0, w: lay.startOffset, text: 'Corner, wall before' },
        lay.endReserve > 0 && { key: 'end', x: lay.limit, w: lay.endReserve, text: 'Corner, next wall' },
      ].filter(Boolean).map((band) => {
        /* Along the band rather than above it. Above it lands on the row of
           cabinet numbers, and a label that sits on top of another label is
           worse than no label. */
        const cx = band.x + band.w / 2;
        const cy = Y(cfg.benchHeight / 2);
        return (
          <g key={band.key} className="corner-band">
            <rect x={band.x} y={Y(cfg.benchHeight)} width={band.w} height={cfg.benchHeight}
                  fill="url(#hatchTight)" stroke="var(--dw-dim)" strokeWidth={S}
                  strokeDasharray="20 14" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(-90 ${cx} ${cy})`}
                  fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>{band.text}</text>
          </g>
        );
      })}

      {/* What is already on the wall, behind the cabinets.

          Drawn by what it is. A window is an opening, so it is outlined and
          left clear. A service is a small thing you have to build around, so
          it is a solid marker you can actually see at 100mm across, rather
          than a hatched rectangle the size of a postage stamp. */}
      {(wall.obstacles || []).map((o, i) => {
        const kind = obstacleKind(o.kind);
        const service = natureOf(o) === 'service';
        const label = o.label || kind.name;
        return (
          <g key={o.id ?? i} className="obstacle"
             onClick={onObstacle ? (e) => { e.stopPropagation(); onObstacle(o.id); } : undefined}>
            {service ? (
              <>
                <rect x={o.x} y={Y(o.y + o.h)} width={Math.max(o.w, 60)} height={Math.max(o.h, 60)}
                      fill="var(--warn-weak, var(--sunken))" stroke="var(--warn)"
                      strokeWidth={S * 1.5} />
                <circle cx={o.x + Math.max(o.w, 60) / 2} cy={Y(o.y + o.h) + Math.max(o.h, 60) / 2}
                        r={Math.min(o.w, o.h, 60) / 4} fill="var(--warn)" />
              </>
            ) : (
              rect(o.x, Y(o.y + o.h), o.w, o.h, 'url(#hatch)')
            )}
            <text x={o.x + Math.max(o.w, 60) / 2} y={Y(o.y + o.h) - 24} textAnchor="middle"
                  fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>{label}</text>
          </g>
        );
      })}

      {/* Kickboard, one strip under each floor standing unit.

          The strip is set back 20mm each side, which quietly assumed every
          cabinet is wider than 40mm. An end panel is 18mm wide, so the strip
          came out 22mm wide the wrong way and the browser refused to draw it.
          A unit that reaches the floor has no kick under it either, so those
          are left out rather than clamped to nothing. */}
      {shown
        .filter((p) => p.where !== 'wall' && !p.unit.cavity
          && p.unit.mountY > 0 && p.unit.width > 40)
        .map((p) => (
          <rect key={`k${p.item.uid}`} x={drawX(p) + 20} y={Y(cfg.kick)}
                width={p.unit.width - 40} height={cfg.kick}
                fill={finishFor('kick', cfg).hex} fillOpacity={0.75}
                stroke="var(--dw-line)" strokeWidth={S} />
        ))}

      {/* units */}
      {shown.map((p) => {
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
              <Appliance x={x} y={y} w={unit.width} h={unit.height}
                         name={unit.family.appliance} />
              <text x={x + unit.width / 2} y={y + unit.height - 34} textAnchor="middle"
                    fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>
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
              const fx = x + q.pos[0];
              const fy = Y(unit.mountY + q.pos[1] + q.size[1]);
              const [fw, fh] = q.size;
              /* A blind panel is dead width behind the return cabinets and a
                 false front does not open, so neither takes a handle. */
              const blind = q.code.endsWith('-BLIND');
              const flat = q.code.endsWith('-FALSE');
              const opens = !blind && !flat;
              /* Which end of a door the handle belongs at. A front whose
                 bottom edge starts above the benchtop is one you reach up to,
                 so its handle goes low: wall cabinets, and the upper doors of
                 a pantry. Everything else you reach down to. The line sits
                 above every base front and below every wall one. */
              const place = unit.mountY + q.pos[1] > 1100 ? 'bottom' : 'top';
              return (
                <g key={q.code} onClick={(e) => e.stopPropagation()}
                   onPointerDown={startPress(p)} onPointerUp={endPress(p, drawerNo)}>
                  <Front x={fx} y={fy} w={fw} h={fh}
                         fin={finish(q.finish)} ds={ds}
                         hw={opens ? hw : NO_HANDLE}
                         isDrawer={drawerNo !== null}
                         side={openingSide(q.pos[0], fw, unit.width)}
                         place={place} blind={blind} flat={flat}
                         dim={drawerNo !== null} />
                  {picked && (
                    <rect x={fx} y={fy} width={fw} height={fh} fill="none"
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
              fill={finishFor('bench', cfg).hex} stroke="var(--dw-line)" strokeWidth={S} />
      ))}

      {/* labels: number and width, above the base run and under the wall run */}
      {shown.filter((p) => p.label).map((p) => {
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

      {/* ------------------------------------------------------------------
          The dimensions.

          Every cabinet on its own, every gap on its own, and the whole wall
          across the bottom of the lot. The chain is continuous, so its links
          add up to the total on the drawing rather than in your head, which
          is the only reason to put a chain on a drawing at all. */}
      {shownChains.chains.map((chain, ci) => (
        <Chain key={chain.id} chain={chain} y={CEIL + CHAIN.first + ci * CHAIN.step} />
      ))}

      {/* And the heights, up the left. */}
      <HeightChain chain={heights} ceil={CEIL} />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   One chain of dimensions.

   Drawn the way a chain is drawn: a witness line down from each stop, one
   dimension line through the lot, a terminator at every stop, and the number
   for each link centred on it. A link too narrow for its number drops to a
   second row with a leader back to the middle of the link it belongs to,
   rather than overlapping the number next to it or being left off.
   --------------------------------------------------------------------------- */

/** A terminator at a stop. Slashes, because arrowheads at this pitch merge. */
const Tick = ({ x, y }) => (
  <line x1={x - 22} y1={y + 22} x2={x + 22} y2={y - 22}
        stroke="var(--dw-dim)" strokeWidth={S * 1.2} />
);

function Chain({ chain, y }) {
  const { links } = chain;
  if (!links.length) return null;

  const size = chain.overall ? FS_DIM : FS;
  /* A monospaced digit is about 0.6 of its point size wide, which is what
     decides whether a number fits in the link it belongs to. */
  const rows = labelRows(links, size * 0.6);
  const from = links[0].x0;
  const to = links[links.length - 1].x1;

  return (
    <g className={`elev-chain elev-chain--${chain.id}`} pointerEvents="none">
      <line x1={from} y1={y} x2={to} y2={y} stroke="var(--dw-dim)" strokeWidth={S} />
      {links.map((l, i) => (
        <line key={`w${i}`} x1={l.x0} y1={y - CHAIN.tick} x2={l.x0} y2={y + CHAIN.tick / 2}
              stroke="var(--dw-dim)" strokeWidth={S} opacity="0.75" />
      ))}
      <line x1={to} y1={y - CHAIN.tick} x2={to} y2={y + CHAIN.tick / 2}
            stroke="var(--dw-dim)" strokeWidth={S} opacity="0.75" />
      {links.map((l, i) => <Tick key={`t${i}`} x={l.x0} y={y} />)}
      <Tick x={to} y={y} />

      {links.map((l, i) => {
        const mid = (l.x0 + l.x1) / 2;
        const { row } = rows[i];
        const ty = y - CHAIN.tick / 2 - row * CHAIN.stagger;
        const dim = l.kind === 'gap' || l.kind === 'corner';
        return (
          <g key={`l${i}`} opacity={dim ? 0.72 : 1}>
            {row > 0 && (
              <line x1={mid} y1={y - 8} x2={mid} y2={ty + 12}
                    stroke="var(--dw-dim)" strokeWidth={S * 0.8} strokeDasharray="14 10" />
            )}
            <text x={mid} y={ty} textAnchor="middle" fill="var(--dw-dim)"
                  fontFamily="var(--font-mono)" fontSize={size}
                  fontStyle={l.kind === 'gap' ? 'italic' : undefined}>
              {Math.round(l.label)}
            </text>
          </g>
        );
      })}

      {/* What this chain is, out past the end of it, so three chains stacked
          up are three named things rather than three rows of numbers. */}
      <text x={to + 60} y={y + size * 0.36} textAnchor="start" fill="var(--dw-dim)"
            fontFamily="var(--font-mono)" fontSize={FS * 0.8} opacity="0.8">
        {chain.name}
      </text>
    </g>
  );
}

/* The same chain stood on end, up the left hand side: kick, carcass,
   benchtop, wall cabinets, ceiling. Every horizontal line on the drawing that
   somebody has to set out with a tape. */
function HeightChain({ chain, ceil }) {
  if (!chain.links.length) return null;
  const x = -300;
  const Y = (above) => ceil - above;

  return (
    <g className="elev-chain elev-chain--height" pointerEvents="none">
      <line x1={x} y1={Y(chain.stops[0].y)} x2={x} y2={Y(chain.stops[chain.stops.length - 1].y)}
            stroke="var(--dw-dim)" strokeWidth={S} />
      {chain.stops.map((s) => (
        <g key={s.y}>
          <line x1={x - 40} y1={Y(s.y)} x2={-40} y2={Y(s.y)}
                stroke="var(--dw-dim)" strokeWidth={S} opacity="0.4" strokeDasharray="18 14" />
          <line x1={x - 34} y1={Y(s.y) + 22} x2={x + 34} y2={Y(s.y) - 22}
                stroke="var(--dw-dim)" strokeWidth={S * 1.2} />
        </g>
      ))}
      {/* The gaps, on the chain line and turned to read up it. */}
      {chain.links.map((l) => {
        const cy = Y((l.y0 + l.y1) / 2);
        return (
          <text key={`${l.y0}-${l.y1}`} x={x - 34} y={cy} textAnchor="middle"
                dominantBaseline="middle" transform={`rotate(-90 ${x - 34} ${cy})`}
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>
            {Math.round(l.label)}
          </text>
        );
      })}

      {/* And the finished heights themselves, against the lines they belong
          to. A benchtop at 900 is the number you set out from, and the gaps
          on their own make you add up to get it.

          Numbers only, no names. The drawing already says which line is the
          benchtop and which is the kick, and a name against each one either
          runs into the cabinets or pushes the whole drawing sideways to make
          room for a word you can already see. */}
      {labelStops(chain.stops.slice(1), FS).map((s) => (
        <text key={`n${s.y}`} x={-56} y={Y(s.y) - 18} textAnchor="end"
              fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS * 0.85}
              opacity="0.85">
          {Math.round(s.y)}
        </text>
      ))}
    </g>
  );
}
