import { useMemo, useState } from 'react';
import Screen, { Empty, Est } from './Screen.jsx';
import { allFittings, money } from './project.js';

const LABEL = {
  hinge: 'Hinge, 110 degree, full overlay',
  runnerPair: 'Drawer runner pair, full extension',
  handle: 'Handle',
};

export default function Hardware({ project, prices, setPrices }) {
  const fittings = useMemo(() => allFittings(project), [project]);
  const [copied, setCopied] = useState(false);

  if (!fittings.length) {
    return (
      <Screen title="Hardware" context="Everything that is not board.">
        <Empty text="No hardware yet. Add cabinets in the planner." />
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

  const total = rows.reduce((a, r) => a + r.total, 0);

  const shoppingList = rows
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
            action={<div className="inline"><Est /><span className="progress-count num">{money(total)}</span></div>} wide>
      <div className="table-wrap" data-density="comfortable">
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
                <td className="dim-cell">{r.units.slice(0, 6).join(', ')}{r.units.length > 6 ? ` +${r.units.length - 6}` : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{rows.reduce((a, r) => a + r.qty, 0)} items</td>
              <td className="n" /><td className="n" />
              <td className="n">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

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
