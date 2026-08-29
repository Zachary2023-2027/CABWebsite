import { useMemo, useState } from 'react';
import Screen, { Empty, Est } from './Screen.jsx';
import { EXTRA_KINDS, allFittings, extrasOfKind, money, projectExtras } from './project.js';
import { newId } from './storage.js';
import { Num } from './Fields.jsx';

const LABEL = {
  hinge: 'Hinge, 110 degree, full overlay',
  runnerPair: 'Drawer runner pair, full extension',
  handle: 'Handle',
  binRunner: 'Bin runner',
  carousel: 'Corner carousel or pull-out',
  barBracket: 'Breakfast bar bracket or leg',
};

/* ---------------------------------------------------------------------------
   Everything the cabinets cannot tell you.

   A part list can work out its own hinges. It cannot know which oven you
   bought, that the splashback is on order, or that somebody is charging you
   to template the stone. All of that is money in the job and none of it is
   derivable, so it is typed.

   Three lists rather than one, because an appliance and a box of screws are
   not the same decision and do not get read at the same time. The appliance
   list is the one that matters most: the planner blocks out a hole for a
   fridge and until now there was nowhere to write down which fridge, so the
   cavity and the appliance that has to fit it lived in different heads.
   --------------------------------------------------------------------------- */
function Extras({ project, setProject, kind }) {
  const rows = extrasOfKind(project, kind.id);
  const edit = (id, patch) => setProject((p) => ({
    ...p, extras: (p.extras || []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
  const add = () => setProject((p) => ({
    ...p,
    extras: [...(p.extras || []), { id: newId(), name: '', qty: 1, cost: 0, kind: kind.id, note: '' }],
  }));
  const remove = (id) => setProject((p) => ({
    ...p, extras: (p.extras || []).filter((e) => e.id !== id),
  }));
  const total = rows.reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.cost) || 0), 0);

  return (
    <section className="card settings-card extras">
      <div className="card__head">
        <span className="card__title">{kind.name}</span>
        <span className="progress-count num">{money(total)}</span>
      </div>
      <p className="note">{kind.note}</p>

      {rows.length > 0 && (
        <div className="extra-row extra-head">
          <span className="field__label">Item</span>
          <span className="field__label">Model, size or note</span>
          <span className="field__label">Qty</span>
          <span className="field__label">Unit cost</span>
          <span className="field__label">Total</span>
          <span />
        </div>
      )}

      {rows.map((e) => (
        <div className="extra-row" key={e.id}>
          <div className="input-shell">
            <input type="text" value={e.name} placeholder={kind.placeholder}
                   aria-label="Item name"
                   onChange={(ev) => edit(e.id, { name: ev.target.value })} />
          </div>
          {/* The model number, the size, the lead time. An appliance is not a
              line of money, it is a thing with a size that has to fit a hole
              the planner has already blocked out. */}
          <div className="input-shell">
            <input type="text" value={e.note || ''} placeholder={kind.notePlaceholder}
                   aria-label="Model, size or note"
                   onChange={(ev) => edit(e.id, { note: ev.target.value })} />
          </div>
          <Num label={`Quantity of ${e.name || 'item'}`} hideLabel compact unit=""
               value={e.qty} whenEmpty={0}
               onChange={(v) => edit(e.id, { qty: v ?? 0 })} />
          <Num label={`Unit cost of ${e.name || 'item'}`} hideLabel compact unit="AUD"
               value={e.cost} whenEmpty={0}
               onChange={(v) => edit(e.id, { cost: v ?? 0 })} />
          <span className="n extra-total">{money((Number(e.qty) || 0) * (Number(e.cost) || 0))}</span>
          <button className="btn btn--ghost" onClick={() => remove(e.id)}
                  aria-label={`Remove ${e.name || 'item'}`}>Remove</button>
        </div>
      ))}

      <button className="btn btn--secondary" onClick={add}>{kind.add}</button>
    </section>
  );
}

/* The three lists, in the order you would think about them. */
const KIND_TEXT = {
  hardware: { placeholder: 'Soft close kit, legs, screws',
    notePlaceholder: 'Size or part number', add: 'Add hardware' },
  appliance: { placeholder: 'Oven, cooktop, sink, tap',
    notePlaceholder: 'Model and the size of the hole it needs', add: 'Add an appliance' },
  other: { placeholder: 'Splashback, tiling, plumbing, stone templating',
    notePlaceholder: 'Who is doing it, or when', add: 'Add an item' },
};

function ExtraLists({ project, setProject }) {
  return (
    <>
      {EXTRA_KINDS.map((k) => (
        <Extras key={k.id} project={project} setProject={setProject}
                kind={{ ...k, ...KIND_TEXT[k.id] }} />
      ))}
    </>
  );
}

export default function Hardware({ project, setProject, prices, setPrices }) {
  const fittings = useMemo(() => allFittings(project), [project]);
  const [copied, setCopied] = useState(false);

  if (!fittings.length) {
    return (
      <Screen title="Hardware" context="Everything that is not board." flow>
        <Empty text="No hardware yet. Add cabinets in the planner." />
        <ExtraLists project={project} setProject={setProject} />
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
                  <Num label={`Unit cost for ${r.label}`} hideLabel compact unit="AUD"
                       value={r.unitCost} whenEmpty={0}
                       onChange={(v) => setPrices((p) => ({ ...p, [r.type]: v ?? 0 }))} />
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

      <ExtraLists project={project} setProject={setProject} />

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
