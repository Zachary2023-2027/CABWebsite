/* ===========================================================================
   The order list.

   What a cut list says to make, and what a cost says it comes to, are neither
   of them what you hand a supplier. This is: rounded up to what is actually
   sold, with what is left over said out loud.
   =========================================================================== */

import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { PACK_DEFAULTS, SHEET_WASTE_DEFAULT, orderList } from './purchase.js';
import {
  allFittings, allParts, allUnits, benchPieces, money, nestCfg, totals,
} from './project.js';
import { nestProject } from './nesting.js';
import { drillUnit } from './drilling.js';
import { PRICES } from './catalog.js';
import { Num, Swatch } from './Fields.jsx';
import { downloadBlob, newId, safeFileName, toCsv } from './storage.js';
import { fmt } from './mm.js';

const DEPS = { allParts, allFittings, allUnits, drillUnit, nestProject, nestCfg, benchPieces };

const PACK_FIELDS = [
  ['hingePack', 'Hinges per box'],
  ['runnerPack', 'Runner pairs per box'],
  ['handlePack', 'Handles per box'],
  ['binRunnerPack', 'Bin runners per box'],
  ['edgeTapeRoll', 'Edge tape roll'],
  ['screwPack', 'Confirmats per box'],
  ['dowelPack', 'Dowels per box'],
];

/* A quantity, at a sensible number of places for what it is counting.

   fmt rounds to a tenth, which is right for a millimetre and wrong for a
   metre: a tenth of a metre is a hundred millimetres of benchtop, and 9.26
   showing as 9.3 is forty dollars of stone. */
const qty = (value, unit) => (unit === 'm'
  ? Number(value).toFixed(2).replace(/\.00$/, '')
  : fmt(value));

function Table({ title, rows, sheetFinish, have, onHave, onRemove }) {
  if (!rows.length) return null;
  return (
    <section className="card">
      <div className="card__head"><span className="card__title">{title}</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {/* A row you already own comes off the order without coming off
                  the drawing. The cabinet still needs the hinge; you simply do
                  not have to buy it again, and the total should say so. */}
              <th className="p-tick" title="Tick what you already have">Have</th>
              <th>What</th>
              <th className="num">Needed</th>
              <th className="num">Pack</th>
              <th className="num">Order</th>
              <th className="num">Spare</th>
              <th className="num">Each</th>
              <th className="num">Cost</th>
              <th className="num" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={have?.(r) ? 'is-had' : ''}>
                <td className="p-tick">
                  <label className="check compact">
                    <input type="checkbox" checked={!!have?.(r)}
                           aria-label={`Already have ${r.what}`}
                           onChange={() => onHave?.(r)} />
                    <span className="check__box">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                           strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                    </span>
                  </label>
                </td>
                <td>
                  {sheetFinish && sheetFinish(r.what) && <Swatch finish={sheetFinish(r.what)} />}
                  {r.what}
                  {(r.note || r.offcut) && (
                    <span className="order-note">{[r.note, r.offcut].filter(Boolean).join('. ')}</span>
                  )}
                </td>
                <td className="num">{qty(r.needed, r.unit)} {r.unit}</td>
                <td className="num">{r.packSize === 1 ? 'single' : fmt(r.packSize)}</td>
                <td className="num">{fmt(r.packs)}</td>
                <td className={`num ${r.spare > 0 ? 'is-spare' : ''}`}>
                  {r.spare > 0 ? fmt(r.spare) : ''}
                </td>
                <td className="num">{r.each ? money(r.each) : ''}</td>
                <td className="num">{r.cost ? money(r.cost) : ''}</td>
                <td className="num">
                  {r.own && (
                    <button className="btn btn--ghost" onClick={() => onRemove?.(r)}
                            aria-label={`Remove ${r.what}`}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Purchase({ project, setProject, onCfg }) {
  const [showPacks, setShowPacks] = useState(false);

  const derived = useMemo(
    () => orderList(project, PRICES, DEPS),
    [project, PRICES.hinge, PRICES.handle, PRICES.runnerPair, PRICES.benchPerMetre],
  );

  const cfg = { ...PACK_DEFAULTS, sheetWastePct: SHEET_WASTE_DEFAULT, ...project.cfg };

  /* --- what you already have -----------------------------------------------

     A row you tick is a row you own. It stays on the list, greyed, because it
     is still what the kitchen needs and taking it off would make the list a
     record of your shopping rather than of the job. What it comes out of is
     the total, which is the only number a tick should move.

     Remembered against the row's own name, which is what orderList builds
     them from, so it survives a cabinet being added or deleted. */
  const had = new Set(project.ordered || []);
  const have = (r) => had.has(r.what);
  const toggleHave = (r) => setProject?.((p) => {
    const cur = new Set(p.ordered || []);
    if (cur.has(r.what)) cur.delete(r.what); else cur.add(r.what);
    return { ...p, ordered: [...cur] };
  });

  /* --- rows you typed yourself ---------------------------------------------

     The order list is derived from the drawing, which is what makes it worth
     having and also what makes it incomplete: it cannot know about the tap,
     the delivery, or the two hundred dollars of silicone and shims that a
     kitchen eats. Those go on here and into the total. */
  const own = (project.orderExtras || []).map((e) => ({
    ...e,
    what: e.what || 'Item',
    needed: Number(e.qty) || 0,
    unit: e.unit || 'each',
    packSize: 1,
    packs: Number(e.qty) || 0,
    spare: 0,
    each: Number(e.each) || 0,
    cost: (Number(e.qty) || 0) * (Number(e.each) || 0),
    own: true,
  }));

  const setOwn = (next) => setProject?.((p) => ({ ...p, orderExtras: next }));
  const addOwn = () => setOwn([...(project.orderExtras || []),
    { id: newId(), what: '', qty: 1, unit: 'each', each: 0 }]);
  const editOwn = (id, patch) => setOwn((project.orderExtras || [])
    .map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeOwn = (r) => setOwn((project.orderExtras || []).filter((e) => e.id !== r.id));

  /* The total is what is left to buy: everything on the list, less what you
     have already ticked, plus what you typed. */
  const order = {
    ...derived,
    other: [...derived.other, ...own],
    total: [...derived.board, ...derived.hardware, ...derived.other, ...own]
      .reduce((a, r) => a + (have(r) ? 0 : (Number(r.cost) || 0)), 0),
  };
  const rows = [...order.board, ...order.hardware, ...order.other];
  const haveCost = [...derived.board, ...derived.hardware, ...derived.other, ...own]
    .reduce((a, r) => a + (have(r) ? (Number(r.cost) || 0) : 0), 0);

  const tableProps = { have, onHave: toggleHave, onRemove: removeOwn };
  const bench = totals(project);

  const download = () => downloadBlob(
    new Blob([toCsv([
      ['What', 'Needed', 'Unit', 'Pack size', 'Order', 'Spare', 'Each', 'Cost', 'Note'],
      ...rows.map((r) => [r.what, r.needed, r.unit, r.packSize, r.packs, r.spare,
        r.each, r.cost, r.note || '']),
    ])], { type: 'text/csv;charset=utf-8' }),
    safeFileName(project.name, '-order.csv'),
  );

  const action = (
    <div className="inline">
      <span className="progress-count">
        <span className="num">{money(order.total)}</span> to buy
      </span>
      <button className="btn btn--secondary" onClick={() => setShowPacks((s) => !s)}>
        {showPacks ? 'Hide pack sizes' : 'Pack sizes'}
      </button>
      <button className="btn btn--secondary" onClick={download} disabled={!rows.length}>
        Export CSV
      </button>
    </div>
  );

  if (!rows.length) {
    return (
      <Screen title="Order list" context="What to buy, in the sizes it is sold in." flow>
        <Empty text="Nothing to order yet. Add some cabinets in the planner." />
      </Screen>
    );
  }

  return (
    <Screen title="Order list"
            context="What to buy, in the sizes it is sold in. All prices are estimates."
            action={action} wide flow>

      {showPacks && (
        <section className="card checks-settings">
          <p className="note">
            How your supplier sells things. A pack of 1 means sold singly rather
            than unknown. Extra board is for the sheet you ruin, which is a
            different thing from the offcut the layout leaves: that one is already
            inside the sheet count.
          </p>
          <div className="settings-grid">
            {PACK_FIELDS.map(([key, label]) => (
              <Num key={key} label={label} value={cfg[key]} unit=""
                   onChange={(v) => onCfg({ [key]: v ?? PACK_DEFAULTS[key] })} />
            ))}
            <Num label="Extra board" value={cfg.sheetWastePct} unit="%"
                 onChange={(v) => onCfg({ sheetWastePct: v ?? 0 })} />
          </div>
        </section>
      )}

      <Table title="Board" rows={order.board} {...tableProps} />
      <Table title="Hardware" rows={order.hardware} {...tableProps} />
      <Table title="Everything else" rows={order.other} {...tableProps} />

      {/* Anything the drawing cannot know about. The tap, the delivery, the
          two hundred dollars of silicone and shims a kitchen eats. */}
      <section className="card order-own">
        <div className="card__head">
          <span className="card__title">Your own lines</span>
          <button className="btn btn--secondary" onClick={addOwn}>Add a line</button>
        </div>
        {(project.orderExtras || []).length === 0 ? (
          <p className="note">
            Nothing yet. The list above is worked out from the drawing, so it knows
            about hinges and it does not know about the tap, the delivery, or the day
            somebody spends templating the stone.
          </p>
        ) : (
          <>
            <div className="extra-row order-own-row extra-head">
              <span className="field__label">What</span>
              <span className="field__label">Qty</span>
              <span className="field__label">Unit</span>
              <span className="field__label">Each</span>
              <span className="field__label">Total</span>
              <span />
            </div>
            {(project.orderExtras || []).map((e) => (
              <div className="extra-row order-own-row" key={e.id}>
                <div className="input-shell">
                  <input type="text" value={e.what} placeholder="Tap, delivery, stone templating"
                         aria-label="What it is"
                         onChange={(ev) => editOwn(e.id, { what: ev.target.value })} />
                </div>
                <Num label="Quantity" hideLabel compact unit="" value={e.qty} whenEmpty={0}
                     onChange={(v) => editOwn(e.id, { qty: v ?? 0 })} />
                <div className="input-shell">
                  <input type="text" value={e.unit} placeholder="each"
                         aria-label="Unit"
                         onChange={(ev) => editOwn(e.id, { unit: ev.target.value })} />
                </div>
                <Num label="Each" hideLabel compact unit="AUD" value={e.each} whenEmpty={0}
                     onChange={(v) => editOwn(e.id, { each: v ?? 0 })} />
                <span className="n extra-total">
                  {money((Number(e.qty) || 0) * (Number(e.each) || 0))}
                </span>
                <button className="btn btn--ghost"
                        onClick={() => removeOwn(e)}
                        aria-label={`Remove ${e.what || 'line'}`}>Remove</button>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card order-total">
        <div className="order-total__row">
          <span>Still to buy</span>
          <span className="num">{money(order.total)}</span>
        </div>
        {haveCost > 0 && (
          <p className="note">
            {money(haveCost)} of the list is ticked as already owned and is not in that
            figure. It is still on the list, because the kitchen still needs it.
          </p>
        )}
        {/* A benchtop is bought by the metre, delivered by the tonne and
            carried by however many people are there on the day. */}
        {bench.benchVolume > 0 && (
          <p className="note">
            The benchtop is {bench.benchMetres.toFixed(2)}m of standard width top:
            {' '}{bench.benchArea.toFixed(2)} square metres of surface
            and {bench.benchVolume.toFixed(3)} cubic metres of material at
            {' '}{fmt(project.cfg.benchThk)}mm thick. In stone that is roughly
            {' '}{Math.round(bench.benchVolume * 2700)}kg, which decides how many people
            you need there when it arrives.
          </p>
        )}
        {order.packOverhead > 0 && (
          <p className="note">
            {money(order.packOverhead)} of that is what you are left with rather than
            what you use: the spare column. It is not waste, it is the next job's
            hinges, but it is money spent now.
          </p>
        )}
        <p className="note">
          Estimates. Check them against a real quote before you commit to anything.
        </p>
      </section>
    </Screen>
  );
}
