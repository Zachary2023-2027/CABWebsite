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
  allFittings, allParts, allUnits, benchPieces, money, nestCfg,
} from './project.js';
import { nestProject } from './nesting.js';
import { drillUnit } from './drilling.js';
import { PRICES } from './catalog.js';
import { Num, Swatch } from './Fields.jsx';
import { downloadBlob, safeFileName, toCsv } from './storage.js';
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

function Table({ title, rows, sheetFinish }) {
  if (!rows.length) return null;
  return (
    <section className="card">
      <div className="card__head"><span className="card__title">{title}</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>What</th>
              <th className="num">Needed</th>
              <th className="num">Pack</th>
              <th className="num">Order</th>
              <th className="num">Spare</th>
              <th className="num">Each</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Purchase({ project, onCfg }) {
  const [showPacks, setShowPacks] = useState(false);

  const order = useMemo(
    () => orderList(project, PRICES, DEPS),
    [project, PRICES.hinge, PRICES.handle, PRICES.runnerPair, PRICES.benchPerMetre],
  );

  const cfg = { ...PACK_DEFAULTS, sheetWastePct: SHEET_WASTE_DEFAULT, ...project.cfg };
  const rows = [...order.board, ...order.hardware, ...order.other];

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

      <Table title="Board" rows={order.board} />
      <Table title="Hardware" rows={order.hardware} />
      <Table title="Everything else" rows={order.other} />

      <section className="card order-total">
        <div className="order-total__row">
          <span>Everything on this list</span>
          <span className="num">{money(order.total)}</span>
        </div>
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
