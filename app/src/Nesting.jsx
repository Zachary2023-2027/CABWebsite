import { useMemo, useState } from 'react';
import Screen, { Empty, Est } from './Screen.jsx';
import { allParts } from './project.js';
import { NEST, cutSequence, nestProject } from './nesting.js';
import { money } from './project.js';

function SheetSvg({ sheet, highlight, onHover }) {
  const [W, H] = sheet.size;
  return (
    <svg className="sheet-svg" viewBox={`-20 -20 ${W + 40} ${H + 40}`}
         preserveAspectRatio="xMidYMid meet" role="img"
         aria-label={`Sheet layout, ${W} by ${H}`}>
      <rect x="0" y="0" width={W} height={H} fill="var(--dw-ghost)"
            stroke="var(--dw-line)" strokeWidth="4" />
      <rect x={NEST.trim} y={NEST.trim} width={W - NEST.trim * 2} height={H - NEST.trim * 2}
            fill="none" stroke="var(--dw-dim)" strokeWidth="2" strokeDasharray="14 10" />
      {sheet.placements.map((p) => (
        <g key={p.code}
           onMouseEnter={() => onHover?.(p.code)} onMouseLeave={() => onHover?.(null)}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h}
                fill={highlight === p.code ? 'var(--accent-weak)' : 'var(--dw-carcass)'}
                stroke={highlight === p.code ? 'var(--accent)' : 'var(--dw-line)'}
                strokeWidth={highlight === p.code ? 8 : 3} />
          <text x={p.x + p.w / 2} y={p.y + p.h / 2} textAnchor="middle" dominantBaseline="middle"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={Math.min(34, p.h * 0.32, p.w * 0.13)}>
            {p.code.split('-').slice(1).join('-')}
          </text>
          {p.h > 90 && (
            <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 34} textAnchor="middle"
                  fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize="24" opacity="0.75">
              {Math.round(p.w)} x {Math.round(p.h)}{p.rot ? ' R' : ''}
            </text>
          )}
        </g>
      ))}
      <text x={W / 2} y={H + 30} textAnchor="middle" fill="var(--dw-dim)"
            fontFamily="var(--font-mono)" fontSize="30">{W} x {H}</text>
    </svg>
  );
}

/* Parts that will not come off any sheet you stock. This is not a warning
   about waste, it is the kitchen not being cuttable, so it goes at the top
   and says exactly what sheet each one would need. */
export function Oversize({ list }) {
  if (!list?.length) return null;
  return (
    <div className="card oversize-card">
      <div className="warn-inline warn-inline--error">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M8 2.5l6 11H2z" strokeLinejoin="round" /><path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
        </svg>
        <span>
          {list.length} part{list.length === 1 ? '' : 's'} will not fit any sheet you stock, so
          {list.length === 1 ? ' it is' : ' they are'} not in the layouts, the sheet count or the cost.
        </span>
      </div>
      <ul className="oversize-list">
        {list.map((o) => (
          <li key={o.code}>
            <span className="code">{o.code}</span>
            <span>{o.name}{o.unitLabel ? `, ${o.unitLabel}` : ''}</span>
            <span className="num">{o.L} x {o.W}</span>
            <span className="note">
              needs a sheet of at least {o.needs[0]} x {o.needs[1]} after {NEST.trim}mm trim.
              Your {o.material} sheet is {o.sheet[0]} x {o.sheet[1]}.
            </span>
          </li>
        ))}
      </ul>
      <p className="note">
        Either add a bigger sheet in Settings, or make the part smaller. A part exactly as
        long as the sheet will never fit, because the edges are trimmed first.
      </p>
    </div>
  );
}

export default function Nesting({ project }) {
  const parts = useMemo(() => allParts(project), [project]);
  const nest = useMemo(() => nestProject(parts), [parts]);
  const [hover, setHover] = useState(null);
  const [openSeq, setOpenSeq] = useState(null);

  if (!nest.groups.length && !nest.oversize.length) {
    return (
      <Screen title="Nesting" context="Sheet layouts for every material.">
        <Empty text="No parts to nest yet. Add cabinets in the planner." />
      </Screen>
    );
  }

  const action = (
    <div className="inline">
      <Est />
      <span className="progress-count">
        <span className="num">{nest.sheets}</span> sheets, <span className="num">{nest.wastePct.toFixed(1)}%</span> waste
      </span>
    </div>
  );

  return (
    <Screen title="Nesting" context="Shelf packed so every cut runs the full width of the piece. Follow the sequence at the saw." action={action} wide>
      <Oversize list={nest.oversize} />

      {nest.groups.map((g) => (
        <section key={g.material} className="nest-group">
          <div className="nest-group-head">
            <span className="field__label">{g.material}</span>
            <span className="nest-meta num">
              {g.count} sheets · {g.partCount} parts · {g.wastePct.toFixed(1)}% waste · {money(g.cost)}
            </span>
          </div>

          <div className="sheet-grid">
            {g.sheets.map((s, i) => (
              <article key={i} className="card sheet-card">
                <div className="card__head">
                  <span className="card__title">Sheet {i + 1} of {g.count}</span>
                  <span className="badge badge--neutral badge--num">{s.wastePct.toFixed(1)}% waste</span>
                </div>
                <SheetSvg sheet={s} highlight={hover} onHover={setHover} />

                <div className="sheet-foot">
                  <div className="offcuts">
                    <span className="field__label">Offcuts over {NEST.minOffcut}mm</span>
                    {s.offcuts.length ? (
                      <ul className="offcut-list">
                        {s.offcuts.map((o, j) => (
                          <li key={j}><span className="num">{o.w} x {o.h}</span> <span className="dim-cell">{o.where}</span></li>
                        ))}
                      </ul>
                    ) : <p className="note">None worth keeping.</p>}
                  </div>
                  <button className="btn btn--ghost"
                          onClick={() => setOpenSeq(openSeq === `${g.material}${i}` ? null : `${g.material}${i}`)}>
                    {openSeq === `${g.material}${i}` ? 'Hide sequence' : 'Cutting sequence'}
                  </button>
                </div>

                {openSeq === `${g.material}${i}` && (
                  <ol className="cut-seq">
                    {cutSequence(s).map((step) => (
                      <li key={step.n}>
                        <span className="badge badge--neutral">{step.cut}</span>
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ol>
                )}

              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="note foot">
        Kerf {NEST.kerf}mm, {NEST.trim}mm trimmed off each edge before anything is cut.
        Parts marked R are rotated. Grain direction is not tracked yet.
      </p>
    </Screen>
  );
}
