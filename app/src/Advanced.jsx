/* ===========================================================================
   Advanced design, and the optimiser result.

   The carcass, height and drawer settings used to sit on the Settings screen,
   away from the drawing they change. They are here now, in a pop-up over the
   planner, so the elevation moves as you change them.
   =========================================================================== */

import { BOARDS, FAMILY, PROJECT } from './catalog.js';
import { Choice, Close, Num, Pick } from './Fields.jsx';

const GROUPS = [
  { name: 'Thickness', note: 'Type any thickness. Board is priced from the nearest stocked sheet.',
    fields: [['carcassThk', 'Carcass'], ['frontThk', 'Fronts'], ['backThk', 'Back'],
             ['boxSideThk', 'Drawer box sides'], ['boxBaseThk', 'Drawer box base']] },
  { name: 'Heights', note: 'Australian standard is a 900 bench over a 150 kick.',
    fields: [['benchHeight', 'Benchtop height'], ['benchThk', 'Benchtop thickness'],
             ['kick', 'Kickboard'], ['wallMount', 'Wall cabinet underside'],
             ['wallCabHeight', 'Wall cabinet height'], ['tallHeight', 'Tall carcass'],
             ['ceiling', 'Ceiling']] },
  { name: 'Depths and gaps',
    fields: [['baseDepth', 'Base depth'], ['wallDepth', 'Wall depth'],
             ['reveal', 'Gap between fronts'],
             ['runnerClearance', 'Carcass to drawer box, each side'],
             ['boxSetback', 'Box behind the front'], ['runnerLength', 'Runner length'],
             ['boxHeight', 'Drawer box side height'], ['backRailHeight', 'Back rail height']] },
];

export function Advanced({ cfg, onChange, onReset, onClose }) {
  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog adv-dialog" role="dialog" aria-modal="true" aria-label="Advanced design">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Advanced design</span>
            <p className="note">Project defaults. Any cabinet can depart from these in its own panel.</p>
          </div>
          <Close onClick={onClose} />
        </div>

        <div className="adv-body">
          <section className="adv-group">
            <span className="field__label">Build</span>
            <div className="settings-grid">
              <Choice label="Back" value={cfg.backType || 'full'}
                      options={[{ value: 'full', label: 'Full panel' }, { value: 'rail', label: 'Rail only' }]}
                      onChange={(v) => onChange({ backType: v })} />
              <Choice label="Drawer base" value={cfg.boxBaseFix || 'dado'}
                      options={[{ value: 'dado', label: 'Dado' }, { value: 'screwed', label: 'Screwed' }]}
                      onChange={(v) => onChange({ boxBaseFix: v })} />
            </div>
            <div className="settings-grid">
              {[['carcassBoard', 'Carcass board'], ['frontBoard', 'Front board'],
                ['backBoard', 'Back board'], ['boxBoard', 'Drawer box board']].map(([k, label]) => (
                <Pick key={k} label={label} value={cfg[k]} options={BOARDS}
                      onChange={(v) => onChange({ [k]: v })} />
              ))}
            </div>
          </section>

          {GROUPS.map((g) => (
            <section className="adv-group" key={g.name}>
              <span className="field__label">{g.name}</span>
              {g.note && <p className="note">{g.note}</p>}
              <div className="settings-grid">
                {g.fields.map(([k, label]) => (
                  <Num key={k} label={label} value={cfg[k]}
                       onChange={(v) => onChange({ [k]: v ?? PROJECT[k] })} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="dialog__foot">
          <button className="btn btn--ghost" onClick={onReset}>Reset to Australian defaults</button>
          <button className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* Options rather than a silent change, because moving widths redesigns the
   kitchen and you should see what it wants to touch before it happens. */
export function OptimiseResult({ result, wall, locked, onApply, onClose }) {
  const { best, current, fitting, stopped } = result;
  const names = wall.units.map((it) => FAMILY[it.familyId]?.name || it.familyId);
  const changed = (widths) => widths
    .map((w, i) => (w !== current.widths[i] ? `${names[i]} ${current.widths[i]} to ${w}` : null))
    .filter(Boolean);

  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog opt-dialog" role="dialog" aria-modal="true" aria-label="Optimise widths">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Optimise widths</span>
            <p className="note">
              {wall.name}. Searched {(fitting ?? 0).toLocaleString()} width combinations that still fit
              the wall{stopped ? ', stopped at the search limit' : ''}. Cabinet types and count are
              kept. The sheet counts below are for this wall on its own.
            </p>
          </div>
          <Close onClick={onClose} />
        </div>

        <div className="adv-body">
          <div className="opt-row is-now">
            <div>
              <b>As drawn</b>
              <span className="note">{locked.length} cabinet{locked.length === 1 ? '' : 's'} locked</span>
            </div>
            <span className="num">{current.sheets} sheets · {current.wastePct.toFixed(1)}% waste</span>
          </div>

          {!best.length ? (
            <p className="note">
              Nothing beats what you have. Either it is already tight, or the cabinets that
              could move are locked.
            </p>
          ) : best.map((c, i) => (
            <div className="opt-row" key={i}>
              <div>
                <b>{c.sheets < current.sheets
                  ? `Saves ${current.sheets - c.sheets} sheet${current.sheets - c.sheets > 1 ? 's' : ''}`
                  : `Waste down to ${c.wastePct.toFixed(1)}%`}</b>
                <span className="note">{changed(c.widths).join(', ') || 'No change'}</span>
              </div>
              <span className="num">{c.sheets} sheets · {c.wastePct.toFixed(1)}%</span>
              <button className="btn btn--primary" onClick={() => onApply(c.widths)}>Apply</button>
            </div>
          ))}
        </div>

        <div className="dialog__foot">
          <button className="btn btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
