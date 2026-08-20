/* ===========================================================================
   Settings. Money and stock only.

   The carcass, height and drawer numbers used to live here, a screen away
   from the drawing they change. They are on the planner now, under Advanced
   design, so the elevation moves as you edit them.

   Nothing on this screen is a drop-down. Every value is typed, including
   sheet sizes and sheet names, because your supplier's stock list is not
   going to match a list I picked.
   =========================================================================== */

import { useEffect, useState } from 'react';
import Screen from './Screen.jsx';
import { PRICE_SEED } from './catalog.js';
import { Num } from './Fields.jsx';

const PRICE_FIELDS = [
  ['hinge', 'Hinge', 'each'],
  ['runnerPair', 'Runner pair', 'pair'],
  ['handle', 'Handle', 'each'],
  ['binRunner', 'Bin runner', 'each'],
  ['benchPerMetre', 'Benchtop', 'per m'],
  ['edgeTapePerMetre', 'Edge tape', 'per m'],
];

/* Renaming a sheet rekeys it, which remounts the row, which would take the
   keyboard away mid-word. So the name is held locally and committed when you
   leave the field or press Enter. */
function Name({ value, onCommit, label, hideLabel }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    const v = draft.trim();
    if (!v || v === value) { setDraft(value); return; }
    onCommit(v);
  };
  return (
    <div className="field">
      <span className={`field__label ${hideLabel ? 'is-hidden' : ''}`}>{label}</span>
      <div className="input-shell">
        <input type="text" value={draft} aria-label={label} placeholder="Birch ply 16mm"
               onChange={(e) => setDraft(e.target.value)}
               onBlur={commit}
               onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Sheet stock.

   A sheet is keyed by its material name, and that name is how a part finds
   its sheet: a part made of "Birch ply 16mm" nests and costs against the
   sheet of the same name. So renaming a sheet is a real operation, not a
   label change, and the row says so.
   --------------------------------------------------------------------------- */

function Sheets({ prices, setPrices }) {
  const rows = Object.entries(prices.sheets);

  const edit = (name, patch) => setPrices((p) => ({
    ...p, sheets: { ...p.sheets, [name]: { ...p.sheets[name], ...patch } },
  }));

  const rename = (name, next) => setPrices((p) => {
    const sheets = {};
    // Rebuild in order, so a rename does not jump the row to the bottom.
    for (const [k, v] of Object.entries(p.sheets)) sheets[k === name ? next : k] = v;
    return { ...p, sheets };
  });

  const remove = (name) => setPrices((p) => {
    const sheets = { ...p.sheets };
    delete sheets[name];
    return { ...p, sheets };
  });

  const add = () => setPrices((p) => {
    let name = 'New sheet';
    let n = 2;
    while (p.sheets[name]) { name = `New sheet ${n}`; n += 1; }
    return { ...p, sheets: { ...p.sheets, [name]: { size: [2400, 1200], cost: 0 } } };
  });

  return (
    <section className="card settings-card">
      <div className="card__head">
        <span className="card__title">Sheet stock</span>
        <span className="group-note">Used by nesting and by costing.</span>
      </div>
      <p className="note">
        The name has to match the board and thickness on the part, like Birch ply 16mm.
        If a thickness you have typed is not stocked, the nearest sheet of the same board
        is used and the cost is scaled.
      </p>

      {rows.map(([name, s], i) => (
        <div className="sheet-row" key={name}>
          <Name label="Material" hideLabel={i > 0} value={name} onCommit={(v) => rename(name, v)} />
          <Num label="Width" unit="mm" hideLabel={i > 0} value={s.size[0]} whenEmpty={0}
               onChange={(v) => edit(name, { size: [v, s.size[1]] })} />
          <Num label="Length" unit="mm" hideLabel={i > 0} value={s.size[1]} whenEmpty={0}
               onChange={(v) => edit(name, { size: [s.size[0], v] })} />
          <Num label="Cost" unit="AUD" hideLabel={i > 0} value={s.cost} whenEmpty={0}
               onChange={(v) => edit(name, { cost: v })} />
          <button className="btn btn--ghost sheet-del" onClick={() => remove(name)}
                  aria-label={`Remove ${name}`}>Remove</button>
        </div>
      ))}

      {!rows.length && <p className="note">No sheets. Nothing can be nested or costed until you add one.</p>}

      <div className="group-foot">
        <button className="btn btn--secondary" onClick={add}>Add a sheet</button>
      </div>
    </section>
  );
}

export default function Settings({ prices, setPrices }) {
  const resetPrices = () => setPrices(structuredClone(PRICE_SEED));

  return (
    <Screen title="Settings" context="Prices and sheet stock. Cabinet sizes are on the planner, under Advanced design.">
      <section className="card settings-card">
        <div className="card__head">
          <span className="card__title">Prices</span>
          <span className="group-note">Seeded estimates. Replace them with your supplier numbers.</span>
        </div>
        <div className="settings-grid">
          {PRICE_FIELDS.map(([k, label, unit]) => (
            <Num key={k} label={`${label}, ${unit}`} unit="AUD" value={prices[k] ?? 0}
                 whenEmpty={0} onChange={(v) => setPrices((p) => ({ ...p, [k]: v }))} />
          ))}
        </div>
        <div className="group-foot">
          <button className="btn btn--ghost" onClick={resetPrices}>Reset prices</button>
        </div>
      </section>

      <section className="card settings-card">
        <div className="card__head">
          <span className="card__title">What goes in the total</span>
          <span className="group-note">The metres are still worked out either way.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={prices.includeBench !== false}
                 onChange={(e) => setPrices((p) => ({ ...p, includeBench: e.target.checked }))} />
          <span className="check__box">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
          </span>
          <span className="check__text">Include the benchtop in the project total</span>
        </label>
        <p className="note">
          Turn this off if the benchtop is being supplied by someone else. It still
          appears on the costing and print pack with its metres and its price, it
          just stops being added to the project total.
        </p>
      </section>

      <Sheets prices={prices} setPrices={setPrices} />
    </Screen>
  );
}
