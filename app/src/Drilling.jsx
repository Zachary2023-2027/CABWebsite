import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { allUnits } from './project.js';
import { DRILL, HOLE_STYLE, drillUnit } from './drilling.js';
import { fmt } from './mm.js';

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

      {/* Scale check. Printed at 100 percent this bar measures 100mm, so a
          rule across it says straight away whether the sheet came out at
          size or whether the printer has shrunk it to fit the page. */}
      <g transform={`translate(0 ${-pad + 34})`}>
        <line x1="0" y1="0" x2="100" y2="0" stroke="var(--dw-dim)" strokeWidth="4" />
        <line x1="0" y1="-10" x2="0" y2="10" stroke="var(--dw-dim)" strokeWidth="4" />
        <line x1="100" y1="-10" x2="100" y2="10" stroke="var(--dw-dim)" strokeWidth="4" />
        <line x1="50" y1="-6" x2="50" y2="6" stroke="var(--dw-dim)" strokeWidth="2" />
        <text x="112" y="10" fill="var(--dw-dim)" fontFamily="var(--font-mono)"
              fontSize="26">100mm, check this with a rule before you drill</text>
      </g>
    </svg>
  );
}

/* Every hole on the panel as a list, grouped by what it is. The drawing is
   for setting out and the table is for checking: counting holes off a drawing
   is how you find out at the bench that you drilled five instead of six. */
function HoleSchedule({ panel }) {
  const groups = new Map();
  for (const h of panel.holes) {
    const key = `${h.kind}|${h.dia}|${h.depth}`;
    if (!groups.has(key)) groups.set(key, { ...h, qty: 0, ys: [] });
    const g = groups.get(key);
    g.qty++;
    if (!g.ys.includes(h.y)) g.ys.push(h.y);
  }

  return (
    <table className="hole-schedule">
      <thead>
        <tr><th>Hole</th><th className="num">Size</th><th className="num">Depth</th><th className="num">How many</th></tr>
      </thead>
      <tbody>
        {[...groups.values()].map((g, i) => (
          <tr key={i}>
            <td>
              <span className="legend-dot" style={{ background: HOLE_STYLE[g.kind]?.fill }} />
              {HOLE_STYLE[g.kind]?.label || g.kind}
            </td>
            <td className="num">{fmt(g.dia)}mm</td>
            <td className="num">{g.depth ? `${fmt(g.depth)}mm` : 'through'}</td>
            <td className="num">{g.qty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Drilling({ project }) {
  const units = useMemo(() => allUnits(project), [project]);

  /* Work out what every cabinet has to be drilled before choosing one to
     show. Drawer banks have nothing to set out, so a third of a kitchen has
     no panels at all: opening this screen onto one of those looked like the
     screen was broken rather than like the cabinet being finished. */
  const withPanels = useMemo(() => units.map((u) => ({
    ...u, panels: drillUnit(u.unit),
  })), [units]);

  const drilled = withPanels.filter((u) => u.panels.length);
  const [sel, setSel] = useState('all');

  const current = sel === 'all' ? null : withPanels.find((u) => u.item.uid === sel);
  const showing = sel === 'all' ? drilled : (current ? [current] : []);
  const panels = showing.flatMap((u) => u.panels.map((p) => ({ ...p, unitLabel: u.label })));
  const holes = panels.reduce((a, p) => a + p.holes.length, 0);

  if (!units.length) {
    return (
      <Screen title="Drilling" context="Hole positions for every panel, 32mm system." flow>
        <Empty text="No cabinets yet. Add some in the planner." />
      </Screen>
    );
  }

  const action = (
    <div className="inline">
      <span className="progress-count">
        <span className="num">{panels.length}</span> panels, <span className="num">{holes}</span> holes
      </span>
      <label className="field compact filter">
        <span className="field__label">Cabinet</span>
        <div className="input-shell select-shell">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="all">
              Every cabinet, {drilled.length} of {units.length}
            </option>
            {withPanels.map((u) => (
              <option key={u.item.uid} value={u.item.uid}>
                {u.label ? `${u.label} ` : ''}{u.unit.family.name} {u.unit.width}
                {u.panels.length ? ` (${u.panels.length})` : ' (nothing to drill)'}
              </option>
            ))}
          </select>
        </div>
      </label>
      <button className="btn btn--secondary" onClick={() => window.print()}>Print</button>
    </div>
  );

  return (
    <Screen title="Drilling"
            context={`${DRILL.pitch}mm system. Positions are to hole centres, measured from the bottom left of the panel as drawn.`}
            action={action} wide flow>
      <div className="legend">
        {Object.entries(HOLE_STYLE).map(([k, v]) => (
          <span className="legend-item" key={k}>
            <span className="legend-dot" style={{ background: v.fill }} />{v.label}
          </span>
        ))}
      </div>

      {!panels.length ? (
        <div className="card">
          <p className="note">
            {current
              ? `${current.label ? `${current.label}, ` : ''}${current.unit.family.name} has nothing to drill.`
              : 'Nothing in this kitchen needs drilling yet.'}
            {' '}
            The template is for shelves. A drawer bank carries its load on the runners, and
            a filler is a strip of board, so neither has holes to set out. Doors are drilled
            for their hinges and show up here with the cabinet they belong to.
          </p>
          {drilled.length > 0 && (
            <button className="btn btn--secondary" onClick={() => setSel('all')}>
              Show the {drilled.length} cabinet{drilled.length === 1 ? '' : 's'} that do need drilling
            </button>
          )}
        </div>
      ) : (
        <div className="panel-grid">
          {panels.map((p) => (
            <article className={`card panel-card ${p.h > p.w * 1.6 ? 'panel-card--tall' : ''}`}
                     key={p.code}>
              <div className="card__head">
                <span className="card__title">
                  {sel === 'all' && p.unitLabel ? `${p.unitLabel} ` : ''}{p.name}
                </span>
                <span className="inline">
                  {p.hand && (
                    <span className="badge badge--warn">{p.hand === 'left' ? 'LEFT hand' : 'RIGHT hand'}</span>
                  )}
                  <span className="badge badge--neutral badge--num">{p.code}</span>
                </span>
              </div>
              <PanelSvg panel={p} />
              <div className="panel-meta">
                <span className="num">{p.holes.length} holes</span>
                <span className="num">{p.w} x {p.h}</span>
              </div>
              <ul className="panel-notes">
                {p.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <HoleSchedule panel={p} />
            </article>
          ))}
        </div>
      )}
    </Screen>
  );
}
