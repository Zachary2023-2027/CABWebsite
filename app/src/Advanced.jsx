/* ===========================================================================
   Advanced design, and the optimiser result.

   The carcass, height and drawer settings used to sit on the Settings screen,
   away from the drawing they change. They are here now, in a pop-up over the
   planner, so the elevation moves as you change them.
   =========================================================================== */

import { useState } from 'react';
import { FAMILY, PROJECT, boardNames } from './catalog.js';
import { ROOM_SHAPES, roomWallIds } from './project.js';
import { DEPTH_ALLOWANCE, RUNNER_LIST, longestFitting, runnerProfile } from './hardware.js';
import { Board, Choice, Close, Num } from './Fields.jsx';

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
             ['benchDepth', 'Benchtop depth'], ['blindClearance', 'Blind corner, past the benchtop'],
             ['reveal', 'Gap between fronts'],
             ['revealTop', 'Gap above the top front'],
             ['revealBottom', 'Gap below the bottom front'],
             ['boxSetback', 'Box behind the front'],
             ['boxHeight', 'Drawer box side height'], ['backRailHeight', 'Back rail height']] },
];

export function Advanced({ cfg, project, onChange, onRoom, onWallLength, onReset, onClose }) {
  const shape = project?.room || 'straight';
  const roomIds = project ? roomWallIds({ ...project, room: shape }) : [];
  const roomWalls = roomIds.map((id) => project.walls.find((w) => w.id === id)).filter(Boolean);
  const boards = boardNames();

  /* Only the lengths this runner is sold in, and only the ones that fit the
     base cabinet depth. Offering a length you cannot buy, or cannot fit, is
     offering a drawer that does not exist. */
  const profile = runnerProfile(cfg.runnerProfile, cfg.customRunner);
  const maxLength = longestFitting(cfg.baseDepth - cfg.boxSetback, profile);
  const legalLengths = (profile.lengths || []).filter((L) => L <= maxLength);
  /* The deduction shown is whatever is actually being used: the figure you
     measured if you set one, the published figure otherwise. */
  const isCustomDeduction = cfg.runnerDeduction !== null && cfg.runnerDeduction !== undefined;
  const deduction = isCustomDeduction ? cfg.runnerDeduction : profile.insideDeduction;

  const opening = 600 - 2 * cfg.carcassThk;
  const boxNote = `In a 600mm cabinet: opening ${opening}, drawer box `
    + `${opening - deduction} inside, `
    + `${opening - deduction + 2 * cfg.boxSideThk} outside, `
    + `${(deduction - 2 * cfg.boxSideThk) / 2}mm clear each side.`
    + (isCustomDeduction ? ' Using your measured figure.' : '');

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
          {project && (
            <section className="adv-group">
              <span className="field__label">Room</span>
              <p className="note">
                An L turns at the right hand end of the first wall and runs toward you.
                A U comes back down the other side. Put a blind corner cabinet at the end
                of each wall that turns, so the next run starts clear of it.
              </p>
              <div className="settings-grid">
                <Choice label="Shape" value={shape}
                        options={ROOM_SHAPES.map((s) => ({ value: s.id, label: s.name }))}
                        onChange={onRoom} />
              </div>
              <div className="settings-grid">
                {roomWalls.map((w) => (
                  <Num key={w.id} label={`${w.name} length`} value={w.length}
                       onChange={(v) => onWallLength(w.id, v ?? w.length)} />
                ))}
              </div>
            </section>
          )}

          <section className="adv-group">
            <span className="field__label">Drawer runners</span>
            <p className="note">
              The runner decides the drawer box width. The figure it deducts is to the
              inside of the box, so the outside is that plus twice your box side
              thickness. The published figures are a starting point: measure your own
              runner and type it in, because every drawer box in the kitchen is built
              from this number.
            </p>
            <div className="settings-grid">
              <Choice label="Runner" value={cfg.runnerProfile || 'tandem-563h'}
                      options={RUNNER_LIST.map((r) => ({ value: r.id, label: r.name.replace('Blum ', '') }))}
                      onChange={(v) => onChange({ runnerProfile: v })} />
            </div>
            <div className="settings-grid">
              <Choice label="Nominal length" value={String(cfg.runnerLength ?? 500)}
                      options={legalLengths.map((L) => ({ value: String(L), label: `${L}` }))}
                      onChange={(v) => onChange({ runnerLength: Number(v) })} />
            </div>
            <div className="settings-grid">
              <Num label="Deducts from the opening" value={deduction}
                   onChange={(v) => onChange({ runnerDeduction: v ?? null })} />
              <Num label="Cabinet deeper than the runner"
                   value={cfg.runnerDepthAllowance ?? DEPTH_ALLOWANCE}
                   onChange={(v) => onChange({ runnerDepthAllowance: v ?? DEPTH_ALLOWANCE })} />
            </div>
            <p className="note">{boxNote}</p>
            {isCustomDeduction && (
              <div className="group-foot">
                <button className="btn btn--ghost"
                        onClick={() => onChange({ runnerDeduction: null })}>
                  Back to the {profile.name.replace('Blum ', '')} figure of {profile.insideDeduction}
                </button>
              </div>
            )}
          </section>

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
              {[['carcassBoard', 'Carcass board', ''], ['frontBoard', 'Front board', ''],
                ['backBoard', 'Back board', ''], ['boxBoard', 'Drawer box sides board', ''],
                ['boxBaseBoard', 'Drawer box base board', 'Same as the sides']]
                .map(([k, label, hint]) => (
                  <Board key={k} label={label} value={cfg[k]} options={boards} placeholder={hint}
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

/* ===========================================================================
   The optimiser result.

   Three tabs, because there are three different levers and they are not
   interchangeable. Widths redesign one wall. Materials change what you buy
   for the whole kitchen. Build changes how the carcass goes together.

   Options rather than a silent change, because every one of these redesigns
   something you have already drawn, and you should see what it wants to
   touch before it happens. Nothing is applied until you press Apply.
   =========================================================================== */

const money0 = (n) => new Intl.NumberFormat('en-AU',
  { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

function Option({ o, onApply }) {
  return (
    <div className="opt-row">
      <div>
        <b>{o.title}</b>
        <span className="note">{o.detail}</span>
      </div>
      <span className="num">
        {o.sheets} sheets · {o.wastePct.toFixed(1)}%
        <br />
        {o.saving > 0 ? `saves ${money0(o.saving)}` : `costs ${money0(-o.saving)} more`}
      </span>
      <button className="btn btn--primary" onClick={() => onApply(o)}>Apply</button>
    </div>
  );
}

export function OptimiseResult({ result, project, wall, locked, onApply, onApplyPlan, onClose }) {
  const [tab, setTab] = useState('widths');
  const { best, current, fitting, stopped } = result;
  const proj = result.project;
  const names = wall.units.map((it) => FAMILY[it.familyId]?.name || it.familyId);
  const changed = (widths) => widths
    .map((w, i) => (w !== current.widths[i] ? `${names[i]} ${current.widths[i]} to ${w}` : null))
    .filter(Boolean);

  const TABS = [
    ['widths', 'Widths', best.length],
    ['materials', 'Materials', proj ? proj.materials.length : 0],
    ['build', 'Build', proj ? proj.build.length : 0],
  ];

  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog opt-dialog" role="dialog" aria-modal="true" aria-label="Optimise">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Optimise</span>
            <p className="note">
              Nothing changes until you apply one of these. Every option below was
              nested for real, not estimated.
            </p>
            <div className="seg opt-tabs" role="tablist">
              {TABS.map(([id, label, n]) => (
                <button key={id} className="seg__item" role="tab" aria-selected={tab === id}
                        aria-pressed={tab === id} onClick={() => setTab(id)}>
                  {label}{n ? ` ${n}` : ''}
                </button>
              ))}
            </div>
          </div>
          <Close onClick={onClose} />
        </div>

        <div className="adv-body">
          {tab === 'widths' && (
            <>
              <p className="note">
                {wall.name}. Searched {(fitting ?? 0).toLocaleString()} width combinations that
                still fit the wall{stopped ? ', stopped at the search limit' : ''}. Cabinet types
                and count are kept. The sheet counts here are for this wall on its own.
              </p>
              <div className="opt-row is-now">
                <div>
                  <b>As drawn</b>
                  <span className="note">{locked.length} cabinet{locked.length === 1 ? '' : 's'} locked</span>
                </div>
                <span className="num">{current.sheets} sheets · {current.wastePct.toFixed(1)}% waste</span>
              </div>

              {!best.length ? (
                <p className="note">
                  Nothing beats what you have. Either it is already tight, or the cabinets
                  that could move are locked.
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
            </>
          )}

          {tab === 'materials' && proj && (
            <>
              <p className="note">
                The whole kitchen, not one wall. Buying fewer different boards leaves less
                offcut stranded in a species you only used twice. It is not automatically
                cheaper, because the board you move onto might cost more a sheet, so each
                one below was costed. Applying one clears any board you set on a single
                cabinet.
              </p>
              <div className="opt-row is-now">
                <div>
                  <b>As drawn</b>
                  <span className="note">
                    {proj.use.map((u) => `${u.name} ${u.m2.toFixed(1)} m2`).join(', ')}
                  </span>
                </div>
                <span className="num">
                  {proj.current.sheets} sheets · {money0(proj.current.cost)}
                </span>
              </div>
              {!proj.materials.length
                ? <p className="note">Nothing to gain. Your board list is already doing the job.</p>
                : proj.materials.map((o) => <Option key={o.id} o={o} onApply={onApplyPlan} />)}
            </>
          )}

          {tab === 'build' && proj && (
            <>
              <p className="note">
                Changes to how the carcass goes together, rather than to its size. These
                move the most board for the least redrawing.
              </p>
              {!proj.build.length
                ? <p className="note">Nothing to gain here.</p>
                : proj.build.map((o) => <Option key={o.id} o={o} onApply={onApplyPlan} />)}

              {proj.rejected.length > 0 && (
                <>
                  <span className="field__label">Costed and not worth it</span>
                  <p className="note">
                    Shown because sometimes one board is what you want anyway, and you
                    should be able to see what it costs you.
                  </p>
                  {proj.rejected.map((o) => <Option key={o.id} o={o} onApply={onApplyPlan} />)}
                </>
              )}
            </>
          )}
        </div>

        <div className="dialog__foot">
          <button className="btn btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
