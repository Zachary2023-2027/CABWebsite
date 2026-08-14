import { useState } from 'react';
import Screen from './Screen.jsx';
import { PRICES, PROJECT } from './catalog.js';

const GROUPS = [
  {
    id: 'carcass', name: 'Carcass',
    note: 'Change a thickness and every dependent part in every cabinet follows.',
    fields: [
      ['carcassThk', 'Carcass thickness', 'mm'],
      ['backThk', 'Back thickness', 'mm'],
      ['frontThk', 'Front thickness', 'mm'],
      ['reveal', 'Reveal between fronts', 'mm'],
      ['baseDepth', 'Base cabinet depth', 'mm'],
      ['wallDepth', 'Wall cabinet depth', 'mm'],
    ],
  },
  {
    id: 'heights', name: 'Heights',
    note: 'Australian standard is a 900 benchtop over a 150 kick.',
    fields: [
      ['benchHeight', 'Benchtop height', 'mm'],
      ['benchThk', 'Benchtop thickness', 'mm'],
      ['benchDepth', 'Benchtop depth', 'mm'],
      ['kick', 'Kickboard height', 'mm'],
      ['wallMount', 'Wall cabinet underside', 'mm'],
      ['wallCabHeight', 'Wall cabinet height', 'mm'],
      ['tallHeight', 'Tall carcass height', 'mm'],
      ['ceiling', 'Ceiling height', 'mm'],
    ],
  },
  {
    id: 'drawers', name: 'Drawers',
    note: 'Runner clearance is each side. Blum Tandem style takes 21.',
    fields: [
      ['runnerLength', 'Runner length', 'mm'],
      ['runnerClearance', 'Runner clearance each side', 'mm'],
      ['boxSideThk', 'Box side thickness', 'mm'],
      ['boxBaseThk', 'Box base thickness', 'mm'],
      ['boxHeight', 'Box side height', 'mm'],
      ['boxSetback', 'Box behind the front face', 'mm'],
    ],
  },
];

const PRICE_FIELDS = [
  ['hinge', 'Hinge', 'each'],
  ['runnerPair', 'Runner pair', 'pair'],
  ['handle', 'Handle', 'each'],
  ['benchPerMetre', 'Benchtop', 'per m'],
  ['kickPerMetre', 'Kickboard', 'per m'],
  ['edgeTapePerMetre', 'Edge tape', 'per m'],
];

function Num({ value, onChange, unit, label }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="input-shell num-input">
        <input className="num-input__input" type="text" inputMode="decimal"
               value={value} aria-label={label}
               onChange={(e) => {
                 const v = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                 onChange(Number.isFinite(v) ? v : 0);
               }} />
        <span className="num-input__unit">{unit}</span>
      </div>
    </div>
  );
}

export default function Settings({ project, setProject, prices, setPrices }) {
  const [open, setOpen] = useState({ carcass: true, heights: false, drawers: false, prices: false, sheets: false });
  const cfg = project.cfg;

  const setCfg = (k, v) => setProject((p) => ({ ...p, cfg: { ...p.cfg, [k]: v } }));
  const resetGroup = (g) => setProject((p) => {
    const next = { ...p.cfg };
    for (const [k] of g.fields) next[k] = PROJECT[k];
    return { ...p, cfg: next };
  });
  const resetPrices = () => setPrices({ ...PRICES });

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <Screen title="Settings" context="Australian defaults are already in place. You should not need to open this to start.">
      {GROUPS.map((g) => (
        <section className="card group-card" key={g.id}>
          <button className="group-head" onClick={() => toggle(g.id)} aria-expanded={open[g.id]}>
            <span className="card__title">{g.name}</span>
            <span className="group-note">{g.note}</span>
            <span className="group-caret">{open[g.id] ? 'Hide' : 'Show'}</span>
          </button>
          {open[g.id] && (
            <>
              <div className="settings-grid">
                {g.fields.map(([k, label, unit]) => (
                  <Num key={k} label={label} unit={unit} value={cfg[k]}
                       onChange={(v) => setCfg(k, v)} />
                ))}
              </div>
              <div className="group-foot">
                <button className="btn btn--ghost" onClick={() => resetGroup(g)}>Reset {g.name.toLowerCase()}</button>
              </div>
            </>
          )}
        </section>
      ))}

      <section className="card group-card">
        <button className="group-head" onClick={() => toggle('prices')} aria-expanded={open.prices}>
          <span className="card__title">Prices</span>
          <span className="group-note">All seeded estimates. Replace them with your supplier numbers.</span>
          <span className="group-caret">{open.prices ? 'Hide' : 'Show'}</span>
        </button>
        {open.prices && (
          <>
            <div className="settings-grid">
              {PRICE_FIELDS.map(([k, label, unit]) => (
                <Num key={k} label={`${label}, ${unit}`} unit="AUD" value={prices[k]}
                     onChange={(v) => setPrices((p) => ({ ...p, [k]: v }))} />
              ))}
            </div>
            <div className="group-foot">
              <button className="btn btn--ghost" onClick={resetPrices}>Reset prices</button>
            </div>
          </>
        )}
      </section>

      <section className="card group-card">
        <button className="group-head" onClick={() => toggle('sheets')} aria-expanded={open.sheets}>
          <span className="card__title">Sheet stock</span>
          <span className="group-note">Sheet cost per full sheet, used by nesting and costing.</span>
          <span className="group-caret">{open.sheets ? 'Hide' : 'Show'}</span>
        </button>
        {open.sheets && (
          <div className="settings-grid">
            {Object.entries(prices.sheets).map(([name, s]) => (
              <Num key={name} label={`${name}, ${s.size[0]} x ${s.size[1]}`} unit="AUD" value={s.cost}
                   onChange={(v) => setPrices((p) => ({
                     ...p, sheets: { ...p.sheets, [name]: { ...p.sheets[name], cost: v } },
                   }))} />
            ))}
          </div>
        )}
      </section>
    </Screen>
  );
}
