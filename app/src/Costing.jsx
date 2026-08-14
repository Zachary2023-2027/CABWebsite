import { useMemo, useState } from 'react';
import Screen, { Empty, Est } from './Screen.jsx';
import { allParts, allUnits, money, totals } from './project.js';
import { nestProject } from './nesting.js';
import { unitCost } from './catalog.js';

export default function Costing({ project, quoted, setQuoted }) {
  const units = useMemo(() => allUnits(project), [project]);
  const tot = useMemo(() => totals(project), [project]);
  const nest = useMemo(() => nestProject(allParts(project)), [project]);

  const rows = useMemo(() => units.map((u) => {
    const c = unitCost(u.unit);
    return {
      label: u.label, wall: u.wallName, name: u.unit.family.name,
      width: u.unit.width, parts: u.unit.parts.length,
      board: c.board, hardware: c.hardware, total: c.total,
      perMetre: c.total / (u.unit.width / 1000),
    };
  }).sort((a, b) => b.total - a.total), [units]);

  const cabinetTotal = rows.reduce((a, r) => a + r.total, 0);
  const runMetres = units
    .filter((u) => u.unit.kind !== 'wall')
    .reduce((a, u) => a + u.unit.width, 0) / 1000;
  const perLinearMetre = runMetres > 0 ? cabinetTotal / runMetres : 0;

  const q = parseFloat(quoted) || 0;
  const saving = q - tot.cost;
  const savingPct = q > 0 ? (saving / q) * 100 : 0;

  if (!rows.length) {
    return (
      <Screen title="Costing" context="What it costs to build, and what you save.">
        <Empty text="No cabinets yet. Add some in the planner." />
      </Screen>
    );
  }

  return (
    <Screen title="Costing" context="Board is nested cost, not part area. Hardware is per fitting."
            action={<Est />} wide>
      <div className="stat-cards">
        {[
          ['Cabinets, allocated', money(cabinetTotal), `${rows.length} units, board by part area`],
          ['Per linear metre', money(perLinearMetre), `${runMetres.toFixed(2)} m of base run`],
          ['Board, as nested', money(nest.cost), `${nest.sheets} sheets, ${nest.wastePct.toFixed(1)}% waste`],
          ['Project total', money(tot.cost),
            tot.benchIncluded ? 'with benchtop and kickboard'
              : `kickboard in, benchtop left out (${money(tot.benchCost)})`],
        ].map(([k, v, sub]) => (
          <div className="card stat-card" key={k}>
            <span className="stat__label">{k}</span>
            <span className="stat-card-value">{v}</span>
            <span className="note">{sub}</span>
          </div>
        ))}
      </div>

      <section className="card quote-card">
        <div className="card__head"><span className="card__title">Against a quote</span></div>
        <div className="quote-row">
          <div className="field">
            <span className="field__label">Quoted price</span>
            <div className="input-shell num-input">
              <input className="num-input__input" type="text" inputMode="decimal"
                     value={quoted} aria-label="Quoted price"
                     onChange={(e) => setQuoted(e.target.value.replace(/[^0-9.]/g, ''))} />
              <span className="num-input__unit">AUD</span>
            </div>
          </div>
          <div className="quote-out">
            <span className="stat__label">You save</span>
            <span className={`quote-saving ${saving < 0 ? 'is-over' : ''}`}>
              {q > 0 ? money(saving) : '—'}
            </span>
            <span className="note">
              {q > 0
                ? `${savingPct.toFixed(1)}% of the quote. Your build is ${money(tot.cost)}.`
                : 'Enter a quote to compare.'}
            </span>
          </div>
        </div>
        {q > 0 && saving < 0 && (
          <div className="warn-inline">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M8 2.5l6 11H2z" strokeLinejoin="round" /><path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
            </svg>
            <span>Your estimate is above the quote. Check the seeded prices in Settings before deciding.</span>
          </div>
        )}
      </section>

      <div className="table-wrap" data-density="compact">
        <table className="table">
          <thead>
            <tr>
              <th>Cabinet</th><th>Wall</th><th>Type</th>
              <th className="n">Width</th><th className="n">Parts</th>
              <th className="n">Board</th><th className="n">Hardware</th>
              <th className="n">Total</th><th className="n">Per metre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="code">{r.label}</td>
                <td className="dim-cell">{r.wall}</td>
                <td>{r.name}</td>
                <td className="n">{r.width}</td>
                <td className="n">{r.parts}</td>
                <td className="n">{money(r.board)}</td>
                <td className="n">{money(r.hardware)}</td>
                <td className="n">{money(r.total)}</td>
                <td className="n">{money(r.perMetre)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{rows.length} cabinets</td><td /><td /><td className="n" /><td className="n" />
              <td className="n">{money(rows.reduce((a, r) => a + r.board, 0))}</td>
              <td className="n">{money(rows.reduce((a, r) => a + r.hardware, 0))}</td>
              <td className="n">{money(cabinetTotal)}</td>
              <td className="n">{money(perLinearMetre)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="note foot">
        Every price here is seeded, not quoted. Change them in Settings so the comparison means something.
        Per cabinet board is that cabinet's share by part area. The project total uses the real nest,
        which is higher, because you buy whole sheets.
      </p>
    </Screen>
  );
}
