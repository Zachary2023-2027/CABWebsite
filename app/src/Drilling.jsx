/* ===========================================================================
   The drilling schedule.

   This is the screen you stand at a bench with. Everything on it is built for
   that one job, which means three things it did not used to do:

     The numbers are readable. Text on a drawing is sized off the panel it is
     drawn on, so a 2100 pantry door and a 100mm top rail come out the same
     size on screen, and a number that will not fit is not written. Nothing
     runs off the edge of its own card any more.

     The exact positions live in a table, not on the drawing. Eighteen shelf
     pin holes at 32mm is one line of text and eighteen numbers stacked on top
     of each other is a smudge, so the drawing says the shape of it and the
     table beside it says every figure.

     You drill a kind at a time. Every side, then every shelf, then every
     door, because that is when the jig is set for it. So the panels filter by
     kind, and how the carcass goes together is edited here rather than two
     screens away in a settings panel.
   =========================================================================== */

import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { allUnits } from './project.js';
import {
  DRILL, HOLE_STYLE, JOINT_LIST, PANEL_KINDS, REAR_ROWS, SHELF_FIXES, drillUnit, jointMethod,
  panelKind, rearRowX, shelfFixOf,
} from './drilling.js';
import { POCKET, pocketScrew } from './pocket.js';
import { axisValues, labelled, runText, runs, settingOut, textSize } from './paneldim.js';
import { Choice } from './Fields.jsx';
import { fmt } from './mm.js';

/* ---------------------------------------------------------------------------
   One panel, drawn flat.

   To scale, so a print at 100 percent is a setting out sheet. Every number on
   it is in millimetres of drawing and sized off the panel, so it reads the
   same whether the panel is a rail or a pantry door.
   --------------------------------------------------------------------------- */

/** A pocket, which is a slot pointing at the edge its pilot comes out of. */
function Pocket({ hole, h, u }) {
  const cx = hole.x;
  const cy = h - hole.y;
  const len = hole.len || 36;
  const across = POCKET.bore;

  /* The drawing is flipped in y, so a pocket aimed at the bottom edge of the
     panel points down the screen and one aimed at the top points up. */
  const vertical = hole.towards === 'top' || hole.towards === 'bottom';
  const w = vertical ? across : len;
  const t = vertical ? len : across;

  /* Which way the pilot runs on, drawn as a short tail so the pocket is not
     just a lozenge you have to work out the direction of. */
  const tail = {
    left: [cx - len / 2, cy, cx - len / 2 - u * 0.9, cy],
    right: [cx + len / 2, cy, cx + len / 2 + u * 0.9, cy],
    bottom: [cx, cy + len / 2, cx, cy + len / 2 + u * 0.9],
    top: [cx, cy - len / 2, cx, cy - len / 2 - u * 0.9],
  }[hole.towards] || null;

  return (
    <g>
      <rect x={cx - w / 2} y={cy - t / 2} width={w} height={t} rx={across / 2}
            fill={HOLE_STYLE.pocket.fill} fillOpacity="0.85"
            stroke="var(--dw-line)" strokeWidth={u * 0.05} />
      {tail && (
        <line x1={tail[0]} y1={tail[1]} x2={tail[2]} y2={tail[3]}
              stroke={HOLE_STYLE.pocket.fill} strokeWidth={u * 0.12} strokeDasharray={`${u * 0.2} ${u * 0.2}`} />
      )}
    </g>
  );
}

function PanelSvg({ panel }) {
  const { w, h, holes } = panel;
  const u = textSize(w, h);

  /* Room for the ladders and the overall dimensions, worked out from the text
     rather than guessed, so nothing is ever outside the box. */
  const padL = u * 6.5;
  const padB = u * 6;
  const padT = u * 3.4;
  const padR = u * 1.6;

  const cols = axisValues(holes, 'x');
  const rows = axisValues(holes, 'y');
  /* A number needs roughly 0.62 of the text size per digit, plus air. */
  const wide = (v) => String(v).length * u * 0.62 + u * 0.8;
  const colLabels = labelled(cols, Math.max(...cols.map(wide), u * 2));
  const rowLabels = labelled(rows, u * 1.5);

  const tick = u * 0.9;
  const line = u * 0.07;

  return (
    <svg className="panel-svg" role="img"
         viewBox={`${-padL} ${-padT} ${w + padL + padR} ${h + padT + padB}`}
         preserveAspectRatio="xMidYMid meet"
         aria-label={`${panel.name}, ${w} by ${h}, ${holes.length} holes`}>

      {/* The board. */}
      <rect x="0" y="0" width={w} height={h} fill="var(--dw-carcass)"
            stroke="var(--dw-line)" strokeWidth={line * 1.6} />

      {/* Centre lines, one down each column of holes. Faint: they are there to
          say the holes really are in a line, not to be read. */}
      {cols.map((c) => (
        <line key={`c${c}`} x1={c} y1={0} x2={c} y2={h}
              stroke="var(--dw-dim)" strokeWidth={line * 0.8}
              strokeDasharray={`${u * 0.35} ${u * 0.3}`} opacity="0.45" />
      ))}

      {holes.map((o, i) => (o.kind === 'pocket'
        ? <Pocket key={i} hole={o} h={h} u={u} />
        : (
          <g key={i}>
            <circle cx={o.x} cy={h - o.y} r={Math.max(o.dia / 2, u * 0.14)}
                    fill={HOLE_STYLE[o.kind]?.fill || 'var(--dw-line)'} />
            {o.dia > 20 && (
              <circle cx={o.x} cy={h - o.y} r={o.dia / 2} fill="none"
                      stroke="var(--dw-line)" strokeWidth={line} />
            )}
          </g>
        )))}

      {/* The ladder along the bottom. A tick at every column, a number only
          where one fits, and the overall width under the lot. */}
      <g className="panel-ladder">
        {cols.map((c) => (
          <line key={`xt${c}`} x1={c} y1={h} x2={c} y2={h + tick * (colLabels.includes(c) ? 1.5 : 0.8)}
                stroke="var(--dw-dim)" strokeWidth={line} />
        ))}
        {colLabels.map((c) => (
          <text key={`xd${c}`} x={c} y={h + tick * 1.5 + u} textAnchor="middle"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={u}>{c}</text>
        ))}

        <line x1="0" y1={h + tick * 3.4} x2={w} y2={h + tick * 3.4}
              stroke="var(--dw-dim)" strokeWidth={line} />
        <line x1="0" y1={h + tick * 2.8} x2="0" y2={h + tick * 4}
              stroke="var(--dw-dim)" strokeWidth={line} />
        <line x1={w} y1={h + tick * 2.8} x2={w} y2={h + tick * 4}
              stroke="var(--dw-dim)" strokeWidth={line} />
        <text x={w / 2} y={h + tick * 3.2} textAnchor="middle" fill="var(--dw-dim)"
              fontFamily="var(--font-mono)" fontSize={u * 1.1}>{panel.xLabel} {w}</text>
      </g>

      {/* And up the left. */}
      <g className="panel-ladder">
        {rows.map((r) => (
          <line key={`yt${r}`} x1={-tick * (rowLabels.includes(r) ? 0.9 : 0.5)} y1={h - r}
                x2="0" y2={h - r} stroke="var(--dw-dim)" strokeWidth={line} />
        ))}
        {rowLabels.map((r) => (
          <text key={`yd${r}`} x={-tick * 1.2} y={h - r + u * 0.36} textAnchor="end"
                fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={u}>{r}</text>
        ))}
        <text x={-padL + u * 1.1} y={h / 2} textAnchor="middle"
              transform={`rotate(-90 ${-padL + u * 1.1} ${h / 2})`}
              fill="var(--dw-dim)" fontFamily="var(--font-mono)" fontSize={u * 1.1}>
          {panel.yLabel} {h}
        </text>
      </g>

      {/* Printed at 100 percent this bar measures 100mm, so a rule across it
          says straight away whether the sheet came out at size. */}
      <g transform={`translate(0 ${-padT + u * 1.4})`}>
        <line x1="0" y1="0" x2="100" y2="0" stroke="var(--dw-dim)" strokeWidth={line * 2} />
        <line x1="0" y1={-u * 0.35} x2="0" y2={u * 0.35} stroke="var(--dw-dim)" strokeWidth={line * 2} />
        <line x1="100" y1={-u * 0.35} x2="100" y2={u * 0.35} stroke="var(--dw-dim)" strokeWidth={line * 2} />
        {/* The sentence only where there is room for it. On a narrow panel it
            would run out past the edge of its own drawing, which is the thing
            this whole screen was rebuilt to stop. */}
        <text x={112} y={u * 0.36} fill="var(--dw-dim)" fontFamily="var(--font-mono)"
              fontSize={u * 0.9}>
          {w > u * 26 ? '100mm, check with a rule before you drill' : '100mm'}
        </text>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   The numbers.

   Two tables, because they answer two different questions. What am I drilling
   with, and where exactly does it go.
   --------------------------------------------------------------------------- */

function HoleSchedule({ panel }) {
  const groups = new Map();
  for (const h of panel.holes) {
    const key = `${h.kind}|${h.dia}|${h.depth}`;
    if (!groups.has(key)) groups.set(key, { ...h, qty: 0 });
    groups.get(key).qty++;
  }

  return (
    <table className="hole-schedule">
      <thead>
        <tr>
          <th>Hole</th><th className="num">Size</th><th className="num">Depth</th>
          <th className="num">How many</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.values()].map((g, i) => (
          <tr key={i}>
            <td>
              <span className="legend-dot" style={{ background: HOLE_STYLE[g.kind]?.fill }} />
              {HOLE_STYLE[g.kind]?.label || g.kind}
              {g.screw && <span className="hole-screw">{g.screw}</span>}
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

/* Where every hole actually is. One row per line of holes, because that is
   how a panel is drilled: set the fence once and run down the line. A run at
   an even pitch is said as a pitch and a count, which is what you set out. */
function SettingOut({ panel }) {
  const lines = settingOut(panel);
  return (
    <table className="hole-schedule setting-out">
      <thead>
        <tr>
          <th className="num">{panel.xLabel}</th>
          <th>Hole</th>
          <th>{panel.yLabel} positions</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="num">{l.along}</td>
            <td>
              <span className="legend-dot" style={{ background: HOLE_STYLE[l.kind]?.fill }} />
              {fmt(l.dia)}mm
            </td>
            <td className="num setting-out__at">{l.at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------------------
   How it goes together.

   Edited here rather than on a settings screen, because these three choices
   are the whole content of this page: change one and every drawing on it is a
   different drawing.
   --------------------------------------------------------------------------- */

function Setup({ cfg, onChange }) {
  const joint = jointMethod(cfg.jointMethod);
  const shelf = shelfFixOf(cfg.shelfFix);
  const screw = pocketScrew(cfg.carcassThk ?? 16);
  const pins = shelf.id === 'pins';

  return (
    <section className="card drill-setup">
      <div className="settings-grid">
        <Choice label="Carcass joint" value={joint.id}
                options={JOINT_LIST.map((j) => ({ value: j.id, label: j.name }))}
                onChange={(v) => onChange({ jointMethod: v })} />
        <Choice label="Shelves" value={shelf.id}
                options={SHELF_FIXES.map((f) => ({ value: f.id, label: f.name }))}
                onChange={(v) => onChange({ shelfFix: v })} />
        {pins && (
          <Choice label="Back row of holes" value={cfg.rearRow || 'grid'}
                  options={REAR_ROWS.map((r) => ({ value: r.id, label: r.name }))}
                  onChange={(v) => onChange({ rearRow: v })} />
        )}
      </div>

      <p className="note">{joint.note}</p>
      {joint.pocket && (
        <p className="note">
          {POCKET.bore}mm bore at {POCKET.angle} degrees with a {POCKET.pilot}mm pilot, one
          stepped bit. Outermost pockets 50mm in from each end of a joint, then no more
          than 150 between them, never fewer than two. {screw.name} in {fmt(cfg.carcassThk ?? 16)}mm
          board: coarse thread, because a manufactured board has no grain to hold a fine one.
        </p>
      )}
      <p className="note">{shelf.note}</p>
      {pins && (
        <p className="note">
          {(cfg.rearRow || 'grid') === 'grid'
            ? `On a ${cfg.baseDepth}mm deep side the back row lands ${rearRowX(cfg.baseDepth, 'grid')}mm in, a whole number of ${DRILL.pitch}mm steps behind the front row, so one jig setting drills both.`
            : `The back row sits ${DRILL.frontSetback}mm in from the back edge, mirroring the front. It is not on the same grid as the front row.`}
        </p>
      )}
    </section>
  );
}

/* --- screen --------------------------------------------------------------- */

export default function Drilling({ project, setProject }) {
  const units = useMemo(() => allUnits(project), [project]);

  /* Work out what every cabinet has to be drilled before choosing one to
     show. A pocket screwed drawer bank has nothing on its sides at all, so
     landing on one and seeing an empty screen has to be explained rather than
     looking like a bug. */
  const withPanels = useMemo(() => units.map((u) => ({
    ...u, panels: drillUnit(u.unit).map((p) => ({ ...p, kind: panelKind(p) })),
  })), [units]);

  const drilled = withPanels.filter((u) => u.panels.length);
  const [sel, setSel] = useState('all');
  const [kind, setKind] = useState('all');

  const setCfg = (patch) => setProject?.((prev) => ({ ...prev, cfg: { ...prev.cfg, ...patch } }));

  const current = sel === 'all' ? null : withPanels.find((u) => u.item.uid === sel);
  const showing = sel === 'all' ? drilled : (current ? [current] : []);

  const all = showing.flatMap((u) => u.panels.map((p) => ({ ...p, unitLabel: u.label })));
  const kinds = PANEL_KINDS.filter((k) => all.some((p) => p.kind === k.id));
  const panels = kind === 'all' ? all : all.filter((p) => p.kind === kind);
  const holes = panels.reduce((a, p) => a + p.holes.length, 0);

  if (!units.length) {
    return (
      <Screen title="Drilling" context="Hole positions for every panel." flow>
        <Empty text="No cabinets yet. Add some in the planner." />
      </Screen>
    );
  }

  const joint = jointMethod(project.cfg.jointMethod);

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
            context={`${joint.pocket ? `${joint.name} carcass` : `${DRILL.pitch}mm system`}. `
              + 'Positions are to hole centres, from the bottom left of the panel as drawn, '
              + 'with the face you drill pointing up.'}
            action={action} wide flow>

      {setProject && <Setup cfg={project.cfg} onChange={setCfg} />}

      {/* Drilled a kind at a time, because that is when the jig is set for it. */}
      {kinds.length > 1 && (
        <div className="seg drill-kinds" role="group" aria-label="Which panels">
          <button className="seg__item" aria-pressed={kind === 'all'}
                  onClick={() => setKind('all')}>Everything ({all.length})</button>
          {kinds.map((k) => (
            <button key={k.id} className="seg__item" aria-pressed={kind === k.id}
                    onClick={() => setKind(k.id)}>
              {k.name} ({all.filter((p) => p.kind === k.id).length})
            </button>
          ))}
        </div>
      )}

      <div className="legend">
        {Object.entries(HOLE_STYLE)
          .filter(([k]) => panels.some((p) => p.holes.some((o) => o.kind === k)))
          .map(([k, v]) => (
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
              : kind !== 'all'
                ? 'Nothing of that kind in this selection.'
                : 'Nothing in this kitchen needs drilling yet.'}
            {' '}
            {joint.pocket
              ? 'A pocket screw is drilled in one panel only, the one that butts into the other, so a side panel with no shelves and no doors has nothing in it at all. Fillers are strips of board and drawer fronts are marked off the fitted drawer.'
              : 'A drawer bank carries its load on the runners and a filler is a strip of board, so neither has holes to set out. Doors are drilled for their hinges and show up with the cabinet they belong to.'}
          </p>
          {kind !== 'all' && (
            <button className="btn btn--secondary" onClick={() => setKind('all')}>
              Show every kind of panel
            </button>
          )}
          {drilled.length > 0 && sel !== 'all' && (
            <button className="btn btn--secondary" onClick={() => setSel('all')}>
              Show the {drilled.length} cabinet{drilled.length === 1 ? '' : 's'} that do need drilling
            </button>
          )}
        </div>
      ) : (
        <div className="drill-list">
          {panels.map((p) => (
            <article className="card panel-card" key={p.code}>
              <div className="card__head">
                <span className="card__title">
                  {sel === 'all' && p.unitLabel ? `${p.unitLabel} ` : ''}{p.name}
                </span>
                <span className="inline">
                  {p.hand && (
                    <span className="badge badge--warn">{p.hand === 'left' ? 'LEFT hand' : 'RIGHT hand'}</span>
                  )}
                  <span className="badge badge--neutral badge--num">{p.w} x {p.h}</span>
                  <span className="badge badge--neutral badge--num">{p.holes.length} holes</span>
                  <span className="badge badge--neutral badge--num">{p.code}</span>
                </span>
              </div>

              {/* The drawing on the left and the numbers on the right, because
                  you look at one to understand the panel and read the other to
                  set it out, and neither wants to be underneath the other. */}
              <div className="panel-split">
                <div className="panel-draw"><PanelSvg panel={p} /></div>
                <div className="panel-numbers">
                  <SettingOut panel={p} />
                  <HoleSchedule panel={p} />
                  <ul className="panel-notes">
                    {p.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Screen>
  );
}
