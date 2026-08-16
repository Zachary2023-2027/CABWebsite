import { useMemo, useState } from 'react';
import Screen, { Empty, Est } from './Screen.jsx';
import { allFittings, money, projectExtras } from './project.js';
import { newId } from './storage.js';

const LABEL = {
  hinge: 'Hinge, 110 degree, full overlay',
  runnerPair: 'Drawer runner pair, full extension',
  handle: 'Handle',
};

/* Anything the derived list cannot know about: the handles you actually
   bought, a soft close kit, legs, screws. Typed in, priced by you, and
   carried through to costing and the print pack. */
function Extras({ project, setProject }) {
  const rows = project.extras || [];
  const edit = (id, patch) => setProject((p) => ({
    ...p, extras: (p.extras || []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
  const add = () => setProject((p) => ({
    ...p, extras: [...(p.extras || []), { id: newId(), name: '', qty: 1, cost: 0 }],
  }));
  const remove = (id) => setProject((p) => ({
    ...p, extras: (p.extras || []).filter((e) => e.id !== id),
  }));
  const total = rows.reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.cost) || 0), 0);
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

  return (
    <section className="card settings-card extras">
      <div className="card__head">
        <span className="card__title">Your own hardware</span>
        <span className="progress-count num">{money(total)}</span>
      </div>
      <p className="note">
        Not worked out from the cabinets. Type what you are buying, how many, and what it costs.
        It goes into the project total and the print pack.
      </p>

      {rows.length > 0 && (
        <div className="extra-row extra-head">
          <span className="field__label">Item</span>
          <span className="field__label">Qty</span>
          <span className="field__label">Unit cost</span>
          <span className="field__label">Total</span>
          <span />
        </div>
      )}

      {rows.map((e) => (
        <div className="extra-row" key={e.id}>
          <div className="input-shell">
            <input type="text" value={e.name} placeholder="Item"
                   aria-label="Item name"
                   onChange={(ev) => edit(e.id, { name: ev.target.value })} />
          </div>
          <div className="input-shell num-input inline-num">
            <input className="num-input__input" type="text" inputMode="numeric" value={e.qty}
                   aria-label={`Quantity of ${e.name || 'item'}`}
                   onChange={(ev) => edit(e.id, { qty: num(ev.target.value) })} />
          </div>
          <div className="input-shell num-input inline-num">
            <input className="num-input__input" type="text" inputMode="decimal" value={e.cost}
                   aria-label={`Unit cost of ${e.name || 'item'}`}
                   onChange={(ev) => edit(e.id, { cost: num(ev.target.value) })} />
            <span className="num-input__unit">AUD</span>
          </div>
          <span className="n extra-total">{money((Number(e.qty) || 0) * (Number(e.cost) || 0))}</span>
          <button className="btn btn--ghost" onClick={() => remove(e.id)}
                  aria-label={`Remove ${e.name || 'item'}`}>Remove</button>
        </div>
      ))}

      <button className="btn btn--secondary" onClick={add}>Add an item</button>
    </section>
  );
}

export default function Hardware({ project, setProject, prices, setPrices }) {
  const fittings = useMemo(() => allFittings(project), [project]);
  const [copied, setCopied] = useState(false);

  if (!fittings.length) {
    return (
      <Screen title="Hardware" context="Everything that is not board." flow>
        <Empty text="No hardware yet. Add cabinets in the planner." />
        <Extras project={project} setProject={setProject} />
      </Screen>
    );
  }

  const rows = fittings.map((f) => {
    const unitCost = f.type === 'runnerPair' ? prices.runnerPair : prices[f.type] ?? 0;
    return {
      ...f,
      label: f.type === 'runnerPair' ? `${LABEL.runnerPair}, ${f.length}mm` : LABEL[f.type] || f.type,
      unitCost,
      total: unitCost * f.qty,
    };
  }).sort((a, b) => b.total - a.total);

  const extras = projectExtras(project);
  /* The table foots to what the table shows. The figure in the heading is the
     whole hardware bill, derived plus your own, which is the number that
     matches costing. */
  const derived = rows.reduce((a, r) => a + r.total, 0);
  const total = derived + extras.reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.cost) || 0), 0);

  const shoppingList = [...rows, ...extras.map((e) => ({ qty: e.qty, label: e.name }))]
    .map((r) => `${String(r.qty).padStart(4)} x  ${r.label}`)
    .join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shoppingList);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Screen title="Hardware" context="Grouped totals. Edit a unit cost and the project total follows."
            action={<div className="inline"><Est /><span className="progress-count num">{money(total)}</span></div>}
            wide flow>
      <div className="table-wrap hardware-table">
        <table className="table">
          <thead>
            <tr>
              <th>Item</th><th className="n">Qty</th><th className="n">Unit cost</th>
              <th className="n">Total</th><th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="n">{r.qty}</td>
                <td className="n">
                  <div className="input-shell num-input inline-num">
                    <input className="num-input__input" type="text" inputMode="decimal"
                           value={r.unitCost}
                           aria-label={`Unit cost for ${r.label}`}
                           onChange={(e) => {
                             const v = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                             setPrices((p) => ({ ...p, [r.type]: Number.isFinite(v) ? v : 0 }));
                           }} />
                    <span className="num-input__unit">AUD</span>
                  </div>
                </td>
                <td className="n">{money(r.total)}</td>
                <td className="dim-cell used-in">{r.units.join(', ')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{rows.reduce((a, r) => a + r.qty, 0)} items</td>
              <td className="n" /><td className="n" />
              <td className="n">{money(derived)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <Extras project={project} setProject={setProject} />

      <section className="card shopping">
        <div className="card__head">
          <span className="card__title">Shopping list</span>
          <button className="btn btn--secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <pre className="shopping-pre">{shoppingList}</pre>
        <p className="note">Paste this into an order. Quantities only, no prices.</p>
      </section>
    </Screen>
  );
}
