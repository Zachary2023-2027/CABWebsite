/* ===========================================================================
   The front layout editor.

   The rows are drawn as a vertical strip in the same order and the same
   proportions as the elevation beside it, so the thing you are editing looks
   like the thing you are looking at. Tap a row to open it, drag the handles
   to reorder, type a height or set it to fill.

   A cabinet has no stack of its own until you edit it. Until then this shows
   the one its preset resolves to, and the first edit writes that stack down
   as it stood, so nothing jumps when you change one row.
   =========================================================================== */

import { addRow, makeEqual, moveRow, newRow, removeRow, setRow } from './stack.js';
import { Choice, Num } from './Fields.jsx';

const TYPE_LABEL = {
  doors: 'Doors',
  drawer: 'Drawer',
  false: 'False front',
  open: 'Open',
  bay: 'Appliance bay',
};

const TYPE_ORDER = ['doors', 'drawer', 'false', 'open', 'bay'];

/** The resolved rows turned back into an editable stack. */
const toStack = (rows) => rows.map((r) => {
  const row = { type: r.type, height: r.filled ? 'fill' : r.height };
  if (r.type === 'doors') { row.doors = r.doors ?? 1; row.hingeSide = r.hingeSide ?? 'left'; }
  if (r.type === 'drawer' && r.boxHeight) row.boxHeight = r.boxHeight;
  if (r.type === 'bay') row.appliance = r.appliance ?? 'other';
  return row;
});

export default function StackEditor({ unit, cfg, selRow, setSelRow, onStack }) {
  const resolved = unit.stack;
  if (!resolved || !resolved.rows.length) {
    return (
      <p className="note">
        This cabinet has no front to lay out. Open shelves, fillers and appliance
        cavities have nothing to divide up.
      </p>
    );
  }

  const rows = resolved.rows;
  const stack = toStack(rows);
  const commit = (next) => onStack(next);
  const opening = resolved.opening;

  /* Heights on the strip are proportional to the real thing, so a 150mm false
     front looks like a false front and not like a drawer. */
  const total = rows.reduce((a, r) => a + Math.max(r.height, 0), 0) || 1;

  return (
    <div className="stack-editor">
      <div className="stack-strip" role="list" aria-label="Front layout, top to bottom">
        {rows.map((r, i) => (
          <button key={i} role="listitem" type="button"
                  className={`stack-row stack-row--${r.type} ${selRow === i ? 'is-sel' : ''}`}
                  style={{ flexGrow: Math.max(r.height, 1) / total }}
                  onClick={() => setSelRow(selRow === i ? null : i)}>
            <span className="stack-row__name">{TYPE_LABEL[r.type]}</span>
            <span className="stack-row__h num">{r.filled ? `${Math.round(r.height)} fill` : Math.round(r.height)}</span>
          </button>
        ))}
      </div>

      <div className="stack-sum">
        <span className="note">
          {rows.length} row{rows.length === 1 ? '' : 's'} in a {Math.round(opening)}mm opening.
          Fronts {Math.round(resolved.used)}, gaps {Math.round(opening - resolved.used)}.
        </span>
        <button className="btn btn--ghost"
                onClick={() => commit(makeEqual(stack, opening, cfg))}>Make equal</button>
      </div>

      {selRow !== null && rows[selRow] && (
        <RowFields row={rows[selRow]} index={selRow} stack={stack} rowCount={rows.length}
                   onCommit={commit} onSelect={setSelRow} />
      )}

      <div className="stack-add">
        <button className="btn btn--secondary"
                onClick={() => { commit(addRow(stack, 0, newRow('drawer', 150))); setSelRow(0); }}>
          Add a row at the top
        </button>
        <button className="btn btn--secondary"
                onClick={() => { commit(addRow(stack, stack.length, newRow('doors', 'fill'))); setSelRow(stack.length); }}>
          Add a row at the bottom
        </button>
      </div>
    </div>
  );
}

function RowFields({ row, index, stack, rowCount, onCommit, onSelect }) {
  const set = (patch) => onCommit(setRow(stack, index, patch));

  return (
    <section className="sub stack-fields">
      <div className="sub-head">
        <span className="field__label">Row {index + 1} of {rowCount}, {TYPE_LABEL[row.type]}</span>
        <div className="inline">
          <button className="btn btn--ghost" disabled={index === 0}
                  onClick={() => { onCommit(moveRow(stack, index, -1)); onSelect(index - 1); }}>Up</button>
          <button className="btn btn--ghost" disabled={index === rowCount - 1}
                  onClick={() => { onCommit(moveRow(stack, index, 1)); onSelect(index + 1); }}>Down</button>
        </div>
      </div>

      <div className="settings-grid">
        <Choice label="What it is" value={row.type}
                options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
                onChange={(v) => set({ type: v, ...(v === 'doors' ? { doors: 1, hingeSide: 'left' } : {}) })} />
      </div>

      <div className="settings-grid">
        <Choice label="Height" value={row.filled ? 'fill' : 'set'}
                options={[{ value: 'set', label: 'Set it' }, { value: 'fill', label: 'Fill what is left' }]}
                onChange={(v) => set({ height: v === 'fill' ? 'fill' : Math.round(row.height) })} />
        {!row.filled && (
          <Num label="How tall" value={Math.round(row.height)} min={0} max={2400}
               onChange={(v) => set({ height: v ?? Math.round(row.height) })} />
        )}
      </div>

      {row.type === 'doors' && (
        <div className="settings-grid">
          <Choice label="Doors" value={String(row.doors ?? 1)}
                  options={[{ value: '1', label: 'One' }, { value: '2', label: 'A pair' }]}
                  onChange={(v) => set({
                    doors: Number(v),
                    hingeSide: Number(v) === 2 ? 'pair' : 'left',
                  })} />
          {(row.doors ?? 1) === 1 && (
            <Choice label="Hinged on the" value={row.hingeSide === 'right' ? 'right' : 'left'}
                    options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
                    onChange={(v) => set({ hingeSide: v })} />
          )}
        </div>
      )}

      {row.type === 'bay' && (
        <div className="settings-grid">
          <Choice label="For a" value={row.appliance ?? 'other'}
                  options={[{ value: 'oven', label: 'Oven' }, { value: 'microwave', label: 'Microwave' },
                    { value: 'other', label: 'Other' }]}
                  onChange={(v) => set({ appliance: v })} />
        </div>
      )}

      {(row.type === 'open' || row.type === 'bay') && (
        <p className="note">
          A hole, not a part. It takes up its height in the front and nothing is cut for it.
        </p>
      )}

      <div className="stack-row-actions">
        <button className="btn btn--secondary"
                onClick={() => { onCommit(addRow(stack, index, newRow('drawer', 150))); onSelect(index); }}>
          Add above
        </button>
        <button className="btn btn--secondary"
                onClick={() => { onCommit(addRow(stack, index + 1, newRow('drawer', 150))); onSelect(index + 1); }}>
          Add below
        </button>
        <button className="btn btn--danger" disabled={rowCount === 1}
                onClick={() => { onCommit(removeRow(stack, index)); onSelect(null); }}>
          Delete row
        </button>
      </div>
    </section>
  );
}
