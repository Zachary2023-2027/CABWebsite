import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { allUnits } from './project.js';
import { DRILL, HOLE_STYLE, drillUnit } from './drilling.js';

/* Panel drawn flat at a known scale, so a print at 100 percent is usable
   as a setting out sheet. Dimensions are to hole centres. */
function PanelSvg({ panel }) {
  const pad = 90;
  const { w, h, holes } = panel;

  // Unique hole columns and rows, for the dimension ladders.
  const cols = [...new Set(holes.map((o) => Math.round(o.x)))].sort((a, b) => a - b);
  // Only label columns far enough apart to read. The rest still get a tick.
  const minGap = w * 0.11;
  const labelled = cols.filter((c, i, arr) => i === 0 || c - arr[i - 1] >= minGap ||
    (i === arr.length - 1 && c - arr[i - 1] >= minGap * 0.6));
  const rowsAll = [...new Set(holes.map((o) => Math.round(o.y)))].sort((a, b) => a - b);
  const rows = rowsAll.length > 12 ? [rowsAll[0], rowsAll[1], rowsAll[rowsAll.length - 1]] : rowsAll;

  return (
    <svg className="panel-svg" viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
         preserveAspectRatio="xMidYMid meet" role="img"
         aria-label={`${panel.name}, ${w} by ${h}, ${holes.length} holes`}>
      <rect x="0" y="0" width={w} height={h} fill="var(--dw-carcass)"
            stroke="var(--dw-line)" strokeWidth="3" />

      {/* hole centre lines down each column */}
      {cols.map((c) => (
        <line key={`c${c}`} x1={c} y1="0" x2={c} y2={h}
              stroke="var(--dw-dim)" strokeWidth="1.2" strokeDasharray="12 8" opacity="0.6" />
      ))}

      {holes.map((o, i) => (
        <g key={i}>
          <circle cx={o.x} cy={h - o.y} r={o.dia / 2}
                  fill={HOLE_STYLE[o.kind]?.fill || 'var(--dw-line)'} />
          {o.dia > 20 && (
            <circle cx={o.x} cy={h - o.y} r={o.dia / 2} fill="none"
                    stroke="var(--dw-line)" strokeWidth="2" />
          )}
        </g>
      ))}

      {/* x ladder along the bottom */}
      {cols.map((c) => (
        <line key={`xt${c}`} x1={c} y1={h} x2={c} y2={h + (labelled.includes(c) ? 38 : 22)}
              stroke="var(--dw-dim)" strokeWidth="1.5" />
      ))}
      {labelled.map((c) => (
        <text key={`xd${c}`} x={c} y={h + 62} textAnchor="middle" fill="var(--dw-dim)"
              fontFamily="var(--font-mono)" fontSize="26">{c}</text>
      ))}
      <line x1="0" y1={h + 24} x2={w} y2={h + 24} stroke="var(--dw-dim)" strokeWidth="1.5" />
      <text x={w / 2} y={h + 86} textAnchor="middle" fill="var(--dw-dim)"
            fontFamily="var(--font-mono)" fontSize="28">{panel.xLabel} {w}</text>

      {/* y ladder up the left */}
      {rows.map((r) => (
        <g key={`yd${r}`}>
          <line x1="-38" y1={h - r} x2="0" y2={h - r} stroke="var(--dw-dim)" strokeWidth="1.5" />
          <text x="-46" y={h - r + 9} textAnchor="end" fill="var(--dw-dim)"
                fontFamily="var(--font-mono)" fontSize="26">{r}</text>
        </g>
      ))}
      <text x={-pad + 10} y={h / 2} textAnchor="middle" fill="var(--dw-dim)"
            fontFamily="var(--font-mono)" fontSize="28"
            transform={`rotate(-90 ${-pad + 10} ${h / 2})`}>{panel.yLabel} {h}</text>
    </svg>
  );
}

export default function Drilling({ project }) {
  const units = useMemo(() => allUnits(project), [project]);
  const [sel, setSel] = useState(null);

  const current = units.find((u) => u.item.uid === sel) || units[0];
  const panels = useMemo(() => (current ? drillUnit(current.unit) : []), [current]);

  if (!units.length) {
    return (
      <Screen title="Drilling" context="Hole positions for every panel, 32mm system.">
        <Empty text="No cabinets yet. Add some in the planner." />
      </Screen>
    );
  }

  const action = (
    <div className="inline">
      <label className="field compact filter">
        <span className="field__label">Cabinet</span>
        <div className="input-shell select-shell">
          <select value={current.item.uid} onChange={(e) => setSel(e.target.value)}>
            {units.map((u) => (
              <option key={u.item.uid} value={u.item.uid}>
                {u.label} {u.unit.family.name} {u.unit.width}
              </option>
            ))}
          </select>
        </div>
      </label>
      <button className="btn btn--secondary" onClick={() => window.print()}>Print</button>
    </div>
  );

  return (
    <Screen title="Drilling" context={`${DRILL.pitch}mm system. Positions are to hole centres, measured from the bottom left of the panel as drawn.`} action={action} wide>
      <div className="legend">
        {Object.entries(HOLE_STYLE).map(([k, v]) => (
          <span className="legend-item" key={k}>
            <span className="legend-dot" style={{ background: v.fill }} />{v.label}
          </span>
        ))}
      </div>

      {!panels.length ? (
        <Empty text="This cabinet has no drilled panels." />
      ) : (
        <div className="panel-grid">
          {panels.map((p) => (
            <article className="card panel-card" key={p.code}>
              <div className="card__head">
                <span className="card__title">{p.name}</span>
                <span className="badge badge--neutral badge--num">{p.code}</span>
              </div>
              <PanelSvg panel={p} />
              <div className="panel-meta">
                <span className="num">{p.holes.length} holes</span>
                <span className="num">{p.w} x {p.h}</span>
              </div>
              <ul className="panel-notes">
                {p.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
    </Screen>
  );
}
