/* ===========================================================================
   2D elevation. The primary canvas of the planner.
   Drawn to scale from the same part list the 3D uses, so door and drawer
   divisions cannot disagree between the two views.
   Hairline strokes, monospaced dimension text, restrained fills.
   =========================================================================== */

import { useMemo } from 'react';
import { unitWarnings } from './project.js';

const S = 4;        // hairline, mm at drawing scale
const FS = 40;      // label text
const FS_DIM = 46;  // dimension text

export default function Elevation({ lay, cfg, selected, selDrawer, onSelect, onHover }) {
  const wall = lay.wall;
  const CEIL = cfg.ceiling;
  const L = wall.length;
  const padX = 220;
  const padTop = 140;
  const padBottom = 320;

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
    const floor = lay.placed
      .filter((p) => p.where !== 'wall')
      .sort((a, b) => a.x - b.x);
    for (const p of floor) {
      const carries =
        p.unit.kind === 'base' || p.unit.kind === 'filler' ||
        (p.unit.cavity && !p.unit.breaksBench && !p.unit.fullHeight);
      if (!carries) { cur = null; continue; }
      if (cur && Math.abs(cur.x + cur.w - p.x) < 0.5) cur.w += p.unit.width;
      else { cur = { x: p.x, w: p.unit.width }; segs.push(cur); }
    }
    return segs;
  }, [lay]);

  const rect = (x, y, w, h, fill, extra = {}) => (
    <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
          fill={fill} stroke="var(--dw-line)" strokeWidth={S} {...extra} />
  );

  return (
    <svg className="elevation" role="img"
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

      {/* kickboard, one strip under each floor standing unit */}
      {lay.placed.filter((p) => p.where !== 'wall' && !p.unit.cavity).map((p) => (
        <rect key={`k${p.item.uid}`} x={p.x + 20} y={Y(cfg.kick)} width={p.unit.width - 40} height={cfg.kick}
              fill="var(--dw-kick)" stroke="var(--dw-line)" strokeWidth={S} />
      ))}

      {/* units */}
      {lay.placed.map((p) => {
        const { unit, x } = p;
        const isSel = selected === p.item.uid;
        const warned = warnMap.has(p.item.uid);
        const y = Y(unit.mountY + unit.height);

        const common = {
          onClick: (e) => { e.stopPropagation(); onSelect(p.item.uid); },
          onMouseEnter: () => onHover?.(p),
          onMouseLeave: () => onHover?.(null),
          style: { cursor: 'pointer' },
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
            {/* carcass box */}
            <rect x={x} y={y} width={unit.width} height={unit.height}
                  fill="var(--dw-carcass)" stroke="var(--dw-line)" strokeWidth={S} />

            {/* open shelf units show their shelves instead of fronts */}
            {unit.family.fronts === 'open' && unit.parts.filter((q) => q.group === 'shelf').map((q) => (
              <rect key={q.code} x={x + q.pos[0]} y={Y(unit.mountY + q.pos[1] + q.size[1])}
                    width={q.size[0]} height={q.size[1]}
                    fill="var(--dw-door)" stroke="var(--dw-line)" strokeWidth={S} />
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
                <g key={q.code}
                   onClick={(e) => { e.stopPropagation(); onSelect(p.item.uid, drawerNo); }}>
                  <rect x={x + q.pos[0]} y={Y(unit.mountY + q.pos[1] + q.size[1])}
                        width={q.size[0]} height={q.size[1]}
                        fill={drawerNo !== null ? 'var(--dw-drawer)' : 'var(--dw-door)'}
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
          ? Y(p.unit.mountY) + FS + 30
          : Y(p.unit.mountY + p.unit.height) - 30;
        return (
          <text key={`l${p.item.uid}`} x={p.x + p.unit.width / 2} y={ty} textAnchor="middle"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={FS}>
            {p.label} {p.unit.width}
          </text>
        );
      })}

      {/* dimension line along the bottom */}
      <g>
        <line x1="0" y1={CEIL + 180} x2={L} y2={CEIL + 180} stroke="var(--dw-dim)" strokeWidth={S} />
        <line x1="0" y1={CEIL + 145} x2="0" y2={CEIL + 215} stroke="var(--dw-dim)" strokeWidth={S} />
        <line x1={L} y1={CEIL + 145} x2={L} y2={CEIL + 215} stroke="var(--dw-dim)" strokeWidth={S} />
        <text x={L / 2} y={CEIL + 160} textAnchor="middle" fill="var(--dw-dim)"
              fontFamily="var(--font-mono)" fontSize={FS_DIM}>{L}</text>
        {lay.baseRun > 0 && lay.baseRun < L && (
          <>
            <line x1="0" y1={CEIL + 280} x2={lay.baseRun} y2={CEIL + 280}
                  stroke="var(--dw-dim)" strokeWidth={S} strokeDasharray="20 14" />
            <text x={lay.baseRun / 2} y={CEIL + 262} textAnchor="middle" fill="var(--dw-dim)"
                  fontFamily="var(--font-mono)" fontSize={FS}>base run {Math.round(lay.baseRun)}</text>
          </>
        )}
      </g>
    </svg>
  );
}
