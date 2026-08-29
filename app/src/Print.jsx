/* ===========================================================================
   Print layouts. Black on white, hairline rules, repeating headers, page
   numbers, project name and date on every page, no navigation.

   Pages are built here rather than left to the browser. Browsers cannot put
   a page number on the page: the CSS margin boxes that would do it are not
   implemented in Chrome or Firefox. So the content is chunked into real page
   elements at a fixed row count, which gives an accurate on screen preview
   and a page number that is actually correct.
   =========================================================================== */

import { useMemo, useState } from 'react';
import {
  allFittings, allParts, allUnits, layoutFor, money, projectExtras, roomOffsets, totals,
  nestCfg, unitWarnings, wallWarnings,
} from './project.js';
import Elevation from './Elevation.jsx';
import { NEST, cutSequence, nestProject } from './nesting.js';
import { HOLE_STYLE, drillUnit, jointMethod } from './drilling.js';
import { POCKET } from './pocket.js';
import { axisValues, labelled, settingOut, textSize } from './paneldim.js';
import { PRICES, sheetFor } from './catalog.js';
import { fmt } from './mm.js';
import { pieceVolume } from './runs.js';
import { Swatch } from './Fields.jsx';
import { partLabel } from './workshop.js';

const PAGE = {
  a4: { w: 210, h: 297, label: 'A4' },
  letter: { w: 216, h: 279, label: 'Letter' },
};

const ROWS_PER_PAGE = 40;
const PANELS_PER_PAGE = 4;
/* Three across, eight down. Big enough to read on a panel leaning against a
   wall, small enough that a kitchen is a few pages. */
const LABELS_PER_PAGE = 24;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const today = () => new Date().toLocaleDateString('en-AU', {
  day: '2-digit', month: 'short', year: 'numeric',
});

/* --- page frame ----------------------------------------------------------- */

function Page({ project, doc, n, total, children }) {
  return (
    <section className="page">
      <header className="page-head">
        <span className="ph-project">{project.name}</span>
        <span className="ph-doc">{doc}</span>
        <span className="ph-date">{today()}</span>
      </header>
      <div className="page-body">{children}</div>
      <footer className="page-foot">
        <span>{project.name}</span>
        <span>Page {n} of {total}</span>
      </footer>
    </section>
  );
}

/* --- sheet drawing, print version ---------------------------------------- */

function PrintSheet({ sheet }) {
  const [W, H] = sheet.size;
  return (
    <svg className="p-sheet" viewBox={`-16 -16 ${W + 32} ${H + 32}`} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={W} height={H} fill="none" stroke="#000" strokeWidth="5" />
      <rect x={NEST.trim} y={NEST.trim} width={W - NEST.trim * 2} height={H - NEST.trim * 2}
            fill="none" stroke="#000" strokeWidth="2" strokeDasharray="16 12" />
      {sheet.placements.map((p) => (
        <g key={p.code}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="#000" strokeWidth="3" />
          <text x={p.x + p.w / 2} y={p.y + p.h / 2 - 4} textAnchor="middle" dominantBaseline="middle"
                fontFamily="monospace" fontSize={Math.min(40, p.h * 0.3, p.w * 0.16)}>
            {p.code}
          </text>
          {p.h > 110 && (
            <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 34} textAnchor="middle"
                  fontFamily="monospace" fontSize="26">
              {Math.round(p.w)} x {Math.round(p.h)}{p.rot ? ' R' : ''}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* The same panel on paper. Black on white, and sized off the panel for the
   same reason the screen is: a fixed text size is too big on a rail and too
   small on a pantry door, and on paper there is nowhere for it to overflow
   to. Every exact position is in the table under it, not on it. */
function PrintPanel({ panel }) {
  const { w, h, holes } = panel;
  const u = textSize(w, h);
  const padL = u * 5;
  const padB = u * 4;
  const padT = u * 1.4;
  const padR = u * 1.4;

  const cols = axisValues(holes, 'x');
  const rows = axisValues(holes, 'y');
  const wide = (v) => String(v).length * u * 0.62 + u * 0.8;
  const colLabels = labelled(cols, Math.max(...cols.map(wide), u * 2));
  const rowLabels = labelled(rows, u * 1.5);
  const line = Math.max(u * 0.07, 1.5);

  return (
    <svg className="p-panel"
         viewBox={`${-padL} ${-padT} ${w + padL + padR} ${h + padT + padB}`}
         preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={w} height={h} fill="none" stroke="#000" strokeWidth={line * 1.6} />

      {holes.map((o, i) => {
        if (o.kind !== 'pocket') {
          return (
            <circle key={i} cx={o.x} cy={h - o.y} r={Math.max(o.dia / 2, u * 0.16)}
                    fill={o.kind === 'cup' ? 'none' : '#000'} stroke="#000" strokeWidth={line} />
          );
        }
        /* A pocket is a slot pointing at the edge its pilot leaves by, which
           is the one thing about it you cannot get wrong twice. */
        const vertical = o.towards === 'top' || o.towards === 'bottom';
        const len = o.len || 36;
        const bw = vertical ? POCKET.bore : len;
        const bh = vertical ? len : POCKET.bore;
        return (
          <rect key={i} x={o.x - bw / 2} y={(h - o.y) - bh / 2} width={bw} height={bh}
                rx={POCKET.bore / 2} fill="#000" />
        );
      })}

      {cols.map((c) => (
        <line key={`xt${c}`} x1={c} y1={h} x2={c} y2={h + u * (colLabels.includes(c) ? 1 : 0.5)}
              stroke="#000" strokeWidth={line} />
      ))}
      {colLabels.map((c) => (
        <text key={`xd${c}`} x={c} y={h + u * 2.1} textAnchor="middle"
              fontFamily="monospace" fontSize={u}>{c}</text>
      ))}
      {rows.map((r) => (
        <line key={`yt${r}`} x1={-u * (rowLabels.includes(r) ? 0.8 : 0.4)} y1={h - r}
              x2="0" y2={h - r} stroke="#000" strokeWidth={line} />
      ))}
      {rowLabels.map((r) => (
        <text key={`yd${r}`} x={-u} y={h - r + u * 0.36} textAnchor="end"
              fontFamily="monospace" fontSize={u}>{r}</text>
      ))}

      <text x={w / 2} y={h + u * 3.6} textAnchor="middle" fontFamily="monospace"
            fontSize={u * 1.1}>{panel.xLabel} {w}</text>
      <text x={-padL + u * 0.9} y={h / 2} textAnchor="middle" fontFamily="monospace"
            fontSize={u * 1.1}
            transform={`rotate(-90 ${-padL + u * 0.9} ${h / 2})`}>{panel.yLabel} {h}</text>
    </svg>
  );
}

/* --- documents ------------------------------------------------------------ */

function buildPages(project, docs, cut) {
  const pages = [];
  const parts = allParts(project);
  const nest = nestProject(parts, nestCfg(project));

  /* The elevations come first, because they are the pages that say where
     everything goes. A pack of cut sizes with no plan is a pile of board. */
  if (docs.plan) {
    const offsets = roomOffsets(project);
    for (const wall of project.walls) {
      const lay = layoutFor(project, wall, offsets);
      if (!lay.placed.length) continue;
      pages.push({ doc: 'Elevations', kind: 'plan', lay, wall });
    }
  }

  if (docs.cutlist && parts.length) {
    for (const rows of chunk(parts, ROWS_PER_PAGE)) {
      pages.push({ doc: 'Cut list', kind: 'cutlist', rows });
    }
  }

  if (docs.sheets && nest.groups.length) {
    for (const g of nest.groups) {
      g.sheets.forEach((s, i) => {
        pages.push({ doc: 'Sheet layouts', kind: 'sheet', sheet: s, material: g.material, i, of: g.count });
      });
    }
  }

  if (docs.drilling) {
    for (const u of allUnits(project)) {
      const panels = drillUnit(u.unit);
      for (const grp of chunk(panels, PANELS_PER_PAGE)) {
        pages.push({ doc: 'Drilling schedule', kind: 'drill', panels: grp, unit: u });
      }
    }
  }

  if (docs.shopping) {
    pages.push({ doc: 'Shopping list', kind: 'shopping', nest, parts });
  }

  /* Notes last of the reading pages, because they are the only ones that are
     not derived from the drawing and the only ones you might add to with a
     pencil while you are standing there. */
  if (docs.notes && (project.notes || []).some((n) => (n.lines || []).some((l) => l.text.trim()))) {
    pages.push({ doc: 'Notes', kind: 'notes' });
  }

  /* Labels last, because they are the only pages you cut up. Forty white
     panels leaving a saw look identical, and a sticker is the one thing that
     tells them apart before they are in a cabinet. */
  if (docs.labels && parts.length) {
    for (const rows of chunk(parts, LABELS_PER_PAGE)) {
      pages.push({ doc: 'Labels', kind: 'labels', rows });
    }
  }

  return pages;
}

function Labels({ rows }) {
  return (
    <div className="p-labels">
      {rows.map((p) => {
        const l = partLabel(p);
        return (
          <div className="p-label" key={p.key}>
            <div className="p-label__top">
              <b>{l.code}</b>
              <Swatch finish={l.finish} />
            </div>
            <div className="p-label__size">{l.size}</div>
            <div className="p-label__name">{l.name}</div>
            <div className="p-label__meta">
              <span>{l.cabinet || l.wall}</span>
              <span>{l.thickness}mm</span>
            </div>
            <div className="p-label__meta">
              <span>{l.material}</span>
            </div>
            {l.edging !== 'None' && <div className="p-label__edge">Tape: {l.edging}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PageBody({ page, project, cut }) {
  if (page.kind === 'labels') return <Labels rows={page.rows} />;
  if (page.kind === 'plan') {
    const { lay, wall } = page;
    const rows = lay.placed.filter((p) => p.label);
    /* The drawing outlines a cabinet the app is unhappy about. On screen you
       hover it to find out why; on paper there is nothing to hover, so the
       reasons are listed. */
    const warns = [
      ...wallWarnings(lay, project).map((w) => w.text),
      ...rows.flatMap((p) => unitWarnings(p, lay, project.cfg)
        .map((w) => `${p.label}, ${p.unit.family.name}: ${w}`)),
    ];
    return (
      <div className="p-plan">
        <b>{wall.name}, {wall.length}mm</b>
        <div className="p-elev">
          <Elevation lay={lay} cfg={project.cfg} selected={null} selDrawer={null}
                     onSelect={() => {}} onHover={() => {}} />
        </div>
        <table className="p-table">
          <thead>
            <tr>
              <th>No</th><th>Cabinet</th><th className="p-n">Along</th>
              <th className="p-n">Width</th><th className="p-n">Runs to</th>
              <th className="p-n">Height</th>
              <th className="p-n">Depth</th><th className="p-n">Off floor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.item.uid}>
                <td className="p-code">{p.label}</td>
                <td>{p.unit.family.name}</td>
                <td className="p-n">{Math.round(p.x)}</td>
                <td className="p-n">{p.unit.width}</td>
                {/* Where its far side lands, which is the number you set the
                    next cabinet out from and the one you would otherwise be
                    adding up in your head off the drawing. */}
                <td className="p-n">{Math.round(p.x + p.unit.width)}</td>
                <td className="p-n">{p.unit.height}</td>
                <td className="p-n">{p.unit.depth}</td>
                <td className="p-n">{p.unit.mountY}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {warns.length > 0 && (
          <div className="p-warns">
            <b>Check before you cut</b>
            <ul>{warns.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        <p className="p-est">
          Along is the distance from the left hand end of the wall to the left hand side
          of the cabinet, and Runs to is where its far side lands. The chains under the
          drawing carry the same numbers: every cabinet, every gap, and the whole wall
          across the bottom. A cabinet outlined on the drawing has a note against it below.
        </p>
      </div>
    );
  }

  if (page.kind === 'cutlist') {
    return (
      <table className="p-table">
        <thead>
          <tr>
            <th className="p-tick">Cut</th><th>Part code</th><th>Name</th>
            <th className="p-n">Length</th><th className="p-n">Width</th><th className="p-n">Thk</th>
            <th>Material</th><th>Edging</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((p) => (
            <tr key={p.code}>
              <td className="p-tick"><span className="p-box" /></td>
              <td className="p-code">{p.code}</td>
              <td>{p.name}</td>
              <td className="p-n">{p.L}</td><td className="p-n">{p.W}</td><td className="p-n">{p.T}</td>
              <td><Swatch finish={p.finish} /> {p.material}</td>
              <td>{p.edging || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (page.kind === 'sheet') {
    const steps = cutSequence(page.sheet);
    return (
      <div className="p-sheet-page">
        <div className="p-sheet-head">
          <b>{page.material}</b>
          <span>Sheet {page.i + 1} of {page.of} · {page.sheet.size[0]} x {page.sheet.size[1]} · {page.sheet.wastePct.toFixed(1)}% waste</span>
        </div>
        <PrintSheet sheet={page.sheet} />
        <div className="p-sheet-cols">
          <div>
            <b>Cutting sequence</b>
            <ol className="p-seq">
              {steps.map((s) => <li key={s.n}><i>{s.cut}</i> {s.text}</li>)}
            </ol>
          </div>
          <div>
            <b>Parts on this sheet</b>
            <table className="p-table p-table--tight">
              <thead><tr><th>Code</th><th className="p-n">W</th><th className="p-n">H</th></tr></thead>
              <tbody>
                {page.sheet.placements.map((p) => (
                  <tr key={p.code}>
                    <td className="p-code">{p.code}</td>
                    <td className="p-n">{Math.round(p.w)}</td>
                    <td className="p-n">{Math.round(p.h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {page.sheet.offcuts.length > 0 && (
              <>
                <b>Offcuts to keep</b>
                <ul className="p-list">
                  {page.sheet.offcuts.map((o, j) => <li key={j}>{o.w} x {o.h}, {o.where}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (page.kind === 'drill') {
    return (
      <div className="p-drill-page">
        <div className="p-sheet-head">
          <b>{page.unit.label} {page.unit.unit.family.name} {page.unit.unit.width}</b>
          <span>
            {page.unit.wallName} · {jointMethod(project.cfg.jointMethod).name} · positions to hole centres
          </span>
        </div>
        <div className="p-panels">
          {page.panels.map((p) => (
            <figure key={p.code} className="p-panel-fig">
              <PrintPanel panel={p} />
              <figcaption>
                <b>{p.code}</b> {p.name} · {p.w} x {p.h} · {p.holes.length} holes
                {p.hand ? ` · ${p.hand === 'left' ? 'LEFT' : 'RIGHT'} hand` : ''}
              </figcaption>
              {/* Every position written out, because a number measured off a
                  printed drawing is a number you have measured wrong. */}
              <table className="p-table p-table--tight p-setout">
                <thead>
                  <tr>
                    <th className="p-n">{p.xLabel}</th><th className="p-n">Dia</th>
                    <th>{p.yLabel} positions</th>
                  </tr>
                </thead>
                <tbody>
                  {settingOut(p).map((l, i) => (
                    <tr key={i}>
                      <td className="p-n">{l.along}</td>
                      <td className="p-n">{fmt(l.dia)}</td>
                      <td>{l.at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          ))}
        </div>
        <ul className="p-list p-notes">
          {[...new Set(page.panels.flatMap((p) => p.notes))].map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>
    );
  }

  if (page.kind === 'notes') {
    return (
      <div className="p-notes-page">
        {(project.notes || []).map((n) => {
          const lines = (n.lines || []).filter((l) => l.text.trim());
          if (!lines.length) return null;
          return (
            <section key={n.id} className="p-note-section">
              <b>{n.heading || 'Notes'}</b>
              <ul className="p-list">
                {lines.map((l) => (
                  <li key={l.id} className={l.done ? 'is-done' : ''}>
                    <span className="p-box">{l.done ? '×' : ''}</span> {l.text}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  if (page.kind === 'shopping') {
    const fittings = allFittings(project);
    const tot = totals(project);
    const edgeM = page.parts.reduce((a, p) => {
      if (!p.edging) return a;
      if (p.edging.startsWith('All')) return a + (2 * p.L + 2 * p.W) / 1000;
      if (p.edging.startsWith('One')) return a + p.L / 1000;
      return a + p.W / 1000;
    }, 0);

    return (
      <div className="p-shop">
        <b>Sheets</b>
        <table className="p-table">
          <thead><tr><th>Material</th><th>Sheet size</th><th className="p-n">Qty</th><th className="p-n">Each</th><th className="p-n">Total</th></tr></thead>
          <tbody>
            {page.nest.groups.map((g) => {
              const s = sheetFor(g.material);
              return (
                <tr key={g.material}>
                  <td>{g.material}</td>
                  <td className="p-code">{s.size[0]} x {s.size[1]}</td>
                  <td className="p-n">{g.count}</td>
                  <td className="p-n">{money(s.cost)}</td>
                  <td className="p-n">{money(g.cost)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan="4">Board</td><td className="p-n">{money(page.nest.cost)}</td></tr></tfoot>
        </table>

        <b>Hardware</b>
        <table className="p-table">
          <thead><tr><th>Item</th><th className="p-n">Qty</th><th className="p-n">Each</th><th className="p-n">Total</th></tr></thead>
          <tbody>
            {fittings.map((f) => {
              const unit = f.type === 'runnerPair' ? PRICES.runnerPair : PRICES[f.type] ?? 0;
              const label = f.type === 'runnerPair'
                ? `Drawer runner pair, full extension, ${f.length}mm`
                : f.type === 'hinge' ? 'Hinge, 110 degree, full overlay' : 'Handle';
              return (
                <tr key={f.key}>
                  <td>{label}</td>
                  <td className="p-n">{f.qty}</td>
                  <td className="p-n">{money(unit)}</td>
                  <td className="p-n">{money(unit * f.qty)}</td>
                </tr>
              );
            })}
            {projectExtras(project).map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td className="p-n">{e.qty}</td>
                <td className="p-n">{money(e.cost)}</td>
                <td className="p-n">{money(e.qty * e.cost)}</td>
              </tr>
            ))}
            <tr>
              <td>Edge tape, 21mm</td>
              <td className="p-n">{Math.ceil(edgeM * 1.1)} m</td>
              <td className="p-n">{money(PRICES.edgeTapePerMetre)}</td>
              <td className="p-n">{money(Math.ceil(edgeM * 1.1) * PRICES.edgeTapePerMetre)}</td>
            </tr>
          </tbody>
        </table>

        {tot.benchPieces.length > 0 && (
          <>
            <b>Benchtop schedule</b>
            <table className="p-table">
              <thead>
                <tr><th>Where</th><th className="p-n">Length</th><th className="p-n">Depth</th>
                  <th className="p-n">Thickness</th><th className="p-n">m3</th>
                  <th>Cut from</th></tr>
              </thead>
              <tbody>
                {tot.benchPieces.map((b2, i) => (
                  <tr key={i}>
                    <td>{b2.wallName}, run {b2.index}
                      {b2.overhangs > 0 && !b2.island && (
                        <span className="p-note"> with {b2.overhangs === 2 ? 'both ends' : 'one end'} overhanging</span>
                      )}
                      {b2.island && (
                        <span className="p-note"> one slab, overhanging all four sides</span>
                      )}
                      {/* Which side runs out past the carcass. A fabricator
                          cutting a slab needs to know which edge is the bar,
                          because that is the edge that gets polished and the
                          one the brackets go under. */}
                      {b2.bar && (
                        <span className="p-note"> breakfast bar {fmt(b2.bar.depth)} past the {BAR_EDGE[b2.bar.side]}</span>
                      )}
                    </td>
                    <td className="p-n">{fmt(b2.length)}</td>
                    <td className="p-n">{fmt(b2.depth)}</td>
                    <td className="p-n">{fmt(b2.thickness)}</td>
                    <td className="p-n">{pieceVolume(b2).toFixed(3)}</td>
                    <td>{b2.pieces.length === 1
                      ? 'one piece'
                      : `${b2.pieces.length} pieces, ${b2.pieces.map(fmt).join(' + ')}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <b>Also needed</b>
        <table className="p-table">
          <tbody>
            <tr>
              <td>
                Benchtop{tot.benchIncluded ? '' : ', not in the total'}
                {/* By the metre is what it is priced at. By volume is what
                    arrives on the truck and what somebody has to lift. */}
                <span className="p-note">
                  {' '}{tot.benchArea.toFixed(2)} m2 of surface,
                  {' '}{tot.benchVolume.toFixed(3)} m3 at {fmt(project.cfg.benchThk)}mm,
                  about {Math.round(tot.benchVolume * 2700)}kg in stone
                </span>
              </td>
              <td className="p-n">{tot.benchMetres.toFixed(2)} m</td>
              <td className="p-n">{money(tot.benchCost)}</td>
            </tr>
            <tr>
              <td>Kickboard<span className="p-note"> cut from board, in the sheets above</span></td>
              <td className="p-n">{tot.kickMetres.toFixed(2)} m</td>
              <td className="p-n">included</td>
            </tr>
          </tbody>
        </table>

        <div className="p-total">
          <span>Project total</span>
          <b>{money(tot.cost)}</b>
        </div>
        <p className="p-est">All prices are estimates, seeded in the app and not quoted by a supplier.</p>
      </div>
    );
  }

  return null;
}

/* --- screen --------------------------------------------------------------- */

/* Which edge of an island slab is the breakfast bar. */
const BAR_EDGE = { front: 'front', back: 'back', left: 'left end', right: 'right end' };

export default function Print({ project, cut }) {
  const [docs, setDocs] = useState({
    plan: true, cutlist: true, sheets: true, drilling: false, shopping: true,
    notes: true, labels: false,
  });
  const [size, setSize] = useState('a4');

  const pages = useMemo(() => buildPages(project, docs, cut), [project, docs, cut]);
  const paper = PAGE[size];

  const toggle = (k) => setDocs((d) => ({ ...d, [k]: !d[k] }));

  return (
    <div className="screen screen--wide print-screen">
      <header className="screen-head no-print">
        <div>
          <h1 className="screen-title">Print</h1>
          <p className="screen-ctx">
            Black on white, repeating headers, page numbers. Turn off the browser's own
            headers and footers in the print dialog, these pages carry their own.
          </p>
        </div>
        <div className="screen-action">
          <span className="progress-count"><span className="num">{pages.length}</span> pages</span>
          <button className="btn btn--primary" onClick={() => window.print()} disabled={!pages.length}>
            Print
          </button>
        </div>
      </header>

      <div className="print-controls no-print">
        {[['plan', 'Elevations'], ['cutlist', 'Cut list'], ['sheets', 'Sheet layouts'],
          ['drilling', 'Drilling schedule'], ['shopping', 'Shopping list'],
          ['notes', 'Notes'], ['labels', 'Labels']].map(([k, label]) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={docs[k]} onChange={() => toggle(k)} />
            <span className="check__box">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
            </span>
            <span className="check__text">{label}</span>
          </label>
        ))}
        <div className="seg" role="group" aria-label="Paper size">
          {Object.entries(PAGE).map(([k, v]) => (
            <button key={k} className="seg__item" aria-pressed={size === k}
                    onClick={() => setSize(k)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="print-root t-light"
           style={{ '--pw': `${paper.w}mm`, '--ph': `${paper.h}mm` }}>
        {pages.length === 0 ? (
          <p className="note no-print">Nothing selected to print.</p>
        ) : pages.map((pg, i) => (
          <Page key={i} project={project} doc={pg.doc} n={i + 1} total={pages.length}>
            <PageBody page={pg} project={project} cut={cut} />
          </Page>
        ))}
      </div>
    </div>
  );
}
