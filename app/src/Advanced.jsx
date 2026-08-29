/* ===========================================================================
   Advanced design, and the optimiser result.

   The carcass, height and drawer settings used to sit on the Settings screen,
   away from the drawing they change. They are here now, in a pop-up over the
   planner, so the elevation moves as you change them.
   =========================================================================== */

import { useState } from 'react';
import {
  BASE_FIXES, BOX_CLEAR, FAMILY, PROJECT, baseFixOf, boardNames,
} from './catalog.js';
import {
  HINGE_LIST, boringInRange, cupCentre, hingeProfile,
  longestFitting, runnerProfile,
} from './hardware.js';
import { JOINT_LIST, REAR_ROWS, SHELF_FIXES, SYS32, jointMethod, rearRowX, shelfFixOf } from './drilling.js';
import {
  FINISH_GROUPS, FINISH_LIST, clearFinishes, finish, finishFor, finishKey, isTwoTone, twoTone,
} from './finishes.js';
import { fmt, round1 } from './mm.js';
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
  { name: 'Depths',
    fields: [['baseDepth', 'Base depth'], ['wallDepth', 'Wall depth'],
             ['benchDepth', 'Benchtop depth'], ['blindClearance', 'Blind corner, past the benchtop'],
             ['boxSetback', 'Box behind the front'],
             ['boxHeight', 'Drawer box side height'], ['backRailHeight', 'Back rail height']] },
];

/* ---------------------------------------------------------------------------
   Every gap around a front, in the order you meet them.

   These used to be three settings and two numbers written into the builder.
   The two written in were `reveal / 2` at each end of the cabinet, which is
   the gap you look straight at from across the room and was the only one you
   could not change.

   They are laid out here in the order they appear on a real front rather than
   in the order they happen to be stored, with a drawing beside them naming
   each one, because five numbers called "reveal something" are five numbers
   nobody can tell apart from their names alone.
   --------------------------------------------------------------------------- */
const GAPS = [
  ['reveal', 'Between two fronts, up the cabinet',
    'The gap you see between a drawer and the drawer under it.'],
  ['revealBetween', 'Between two doors in one opening',
    'A pair meeting in the middle. Empty follows the gap above, which is what it always did.'],
  ['revealLeft', 'Left end, front to the outside of the carcass',
    'Empty is half the gap between fronts, so two cabinets butted together leave one whole gap between their doors.'],
  ['revealRight', 'Right end, front to the outside of the carcass',
    'Empty is half the gap between fronts.'],
  ['revealTop', 'Above the top front',
    'A base cabinet has a benchtop sitting over its top front, so a gap here stops it rubbing as it opens.'],
  ['revealBottom', 'Below the bottom front',
    'The bottom front overhangs a set back kickboard, so nothing is in the way and a gap here is cosmetic.'],
];

/* What each of those gaps is, drawn on a front, so a name and a number are
   attached to a place on a cabinet rather than to each other. */
function GapDiagram({ cfg }) {
  const g = (k, fallback) => {
    const v = cfg[k];
    return (v === null || v === undefined || v === '') ? fallback : Number(v);
  };
  const r = g('reveal', 3);
  const parts = [
    ['Left', g('revealLeft', r / 2)],
    ['Right', g('revealRight', r / 2)],
    ['Top', g('revealTop', 0)],
    ['Bottom', g('revealBottom', 0)],
    ['Between, up', r],
    ['Between, across', g('revealBetween', r)],
  ];

  return (
    <div className="gap-figure">
      <svg viewBox="0 0 320 200" className="gap-svg" role="img"
           aria-label="Where each gap sits on a cabinet front">
        {/* the carcass */}
        <rect x="8" y="8" width="304" height="184" fill="none"
              stroke="var(--dw-line)" strokeWidth="2" />
        {/* two drawers over a pair of doors, which between them show every gap */}
        <rect x="26" y="24" width="268" height="44" fill="var(--dw-carcass)"
              stroke="var(--dw-line)" strokeWidth="1.5" />
        <rect x="26" y="76" width="130" height="100" fill="var(--dw-carcass)"
              stroke="var(--dw-line)" strokeWidth="1.5" />
        <rect x="164" y="76" width="130" height="100" fill="var(--dw-carcass)"
              stroke="var(--dw-line)" strokeWidth="1.5" />

        {[['8,16 26,16', 'Left', 17, 12], ['294,16 312,16', 'Right', 303, 12]].map(([, ...rest]) => null)}

        {/* the six gaps, each marked where it really is */}
        <g fill="var(--accent)" fontFamily="var(--font-mono)" fontSize="11" textAnchor="middle">
          <text x="17" y="128">L</text>
          <text x="303" y="128">R</text>
          <text x="160" y="20">T</text>
          <text x="160" y="188">B</text>
          <text x="160" y="76">U</text>
          <text x="160" y="130">A</text>
        </g>
        <g stroke="var(--accent)" strokeWidth="1.5">
          <line x1="8" y1="118" x2="26" y2="118" />
          <line x1="294" y1="118" x2="312" y2="118" />
          <line x1="140" y1="8" x2="140" y2="24" />
          <line x1="140" y1="176" x2="140" y2="192" />
          <line x1="120" y1="68" x2="120" y2="76" />
          <line x1="156" y1="120" x2="164" y2="120" />
        </g>
      </svg>
      <ul className="gap-key">
        <li><b>L</b> {parts[0][1]} left end</li>
        <li><b>R</b> {parts[1][1]} right end</li>
        <li><b>T</b> {parts[2][1]} above the top</li>
        <li><b>B</b> {parts[3][1]} below the bottom</li>
        <li><b>U</b> {parts[4][1]} between, up the cabinet</li>
        <li><b>A</b> {parts[5][1]} between, across an opening</li>
      </ul>
    </div>
  );
}

/* The room shape and the wall lengths used to live here, two screens away
   from the tabs they were about. They are in Walls now, next to the list of
   them. */
export function Advanced({ cfg, onChange, onReset, onClose }) {
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

  const joint = jointMethod(cfg.jointMethod);
  const hinge = hingeProfile(cfg.hingeProfile);
  const boring = cfg.hingeBoringDistance ?? hinge.boringDistance;

  /* The stored figure is what the runner takes off the opening, because that
     is what the catalogue publishes and what the geometry is built from. The
     gap each side is the same fact said the way you measure it, so that is
     what the field shows and the conversion happens here rather than in the
     geometry. */
  const clearEachSide = round1((deduction - 2 * cfg.boxSideThk) / 2);

  const opening = 600 - 2 * cfg.carcassThk;
  const boxNote = `In a 600mm cabinet: opening ${opening}, drawer box `
    + `${opening - deduction + 2 * cfg.boxSideThk} wide outside, `
    + `${opening - deduction} inside, with ${clearEachSide}mm each side.`;

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
            <span className="field__label">Drawer runners</span>
            <p className="note">
              One number: the gap between the inside of the carcass and the outside
              of the drawer box, on each side. Everything else about the drawer box
              is worked out from it.
            </p>
            <div className="settings-grid">
              {/* Cleared means back to what the runner is made for, which is
                  null here and not a gap of nothing. */}
              <Num label="Gap each side" value={clearEachSide} min={0} max={30}
                   onChange={(v) => onChange({
                     runnerDeduction: v == null ? null : 2 * (v + cfg.boxSideThk),
                   })} />
              <Choice label="Runner length" value={String(cfg.runnerLength ?? 500)}
                      options={legalLengths.map((L) => ({ value: String(L), label: `${L}` }))}
                      onChange={(v) => onChange({ runnerLength: Number(v) })} />
            </div>
            <p className="note">{boxNote}</p>
            {isCustomDeduction && (
              <div className="group-foot">
                <button className="btn btn--ghost"
                        onClick={() => onChange({ runnerDeduction: null })}>
                  Back to {round1((profile.insideDeduction - 2 * cfg.boxSideThk) / 2)}mm, the gap this runner is made for
                </button>
              </div>
            )}
          </section>

          <section className="adv-group">
            <span className="field__label">Hinges</span>
            <p className="note">
              The cup centre is half the 35mm cup plus the boring distance, so the
              boring distance is the only half you choose and it is what sets the
              overlay. Blum allow roughly {hinge.boringMin} to {hinge.boringMax}mm,
              and the mounting plate you buy has to match what you drill.
            </p>
            <div className="settings-grid">
              <Choice label="Hinge" value={cfg.hingeProfile || 'clip-top-blumotion-110'}
                      options={HINGE_LIST.map((x) => ({ value: x.id, label: x.name.replace('Blum ', '') }))}
                      onChange={(v) => onChange({ hingeProfile: v })} />
              <Num label="Boring distance" value={boring}
                   onChange={(v) => onChange({ hingeBoringDistance: v ?? 5 })} />
            </div>
            <p className="note">
              Cup centre {fmt(cupCentre(hinge, boring))}mm from the hinged edge.
              {boringInRange(boring, hinge) ? '' : ' That is outside the range this hinge is made for.'}
            </p>
            <p className="note">
              How tall a door can be before it needs another hinge. Height is only
              half of it, weight is the other half, so a heavy door is worth setting
              lower than these.
            </p>
            <div className="settings-grid">
              <Num label="Two hinges up to" value={cfg.hinge2MaxHeight ?? 900}
                   onChange={(v) => onChange({ hinge2MaxHeight: v ?? 900 })} />
              <Num label="Three up to" value={cfg.hinge3MaxHeight ?? 1600}
                   onChange={(v) => onChange({ hinge3MaxHeight: v ?? 1600 })} />
              <Num label="Four up to" value={cfg.hinge4MaxHeight ?? 2000}
                   onChange={(v) => onChange({ hinge4MaxHeight: v ?? 2000 })} />
            </div>
          </section>

          <section className="adv-group">
            <span className="field__label">Finish</span>
            <p className="note">
              What each part is actually going to look like. Left alone, a finish is
              read off the board species you typed, so Charcoal melamine gives you a
              charcoal kitchen without setting it twice. Set one and it wins.
            </p>
            <div className="finish-roles">
              {[['carcass', 'Carcass'], ['front', 'Fronts'], ['box', 'Drawer boxes'],
                ['kick', 'Kickboard'], ['back', 'Backs'], ['panel', 'End panels']].map(([role, label]) => (
                <FinishField key={role} label={label} role={role} cfg={cfg} onChange={onChange} />
              ))}
            </div>
            <div className="group-foot">
              <span className="note">
                {isTwoTone(cfg)
                  ? `Two tone: ${finishFor('front', cfg).name} fronts on ${article(finishFor('carcass', cfg).name)} carcass.`
                  : `One tone throughout, in ${finishFor('carcass', cfg).name}.`}
              </span>
              {!isTwoTone(cfg) ? (
                <button className="btn btn--ghost"
                        onClick={() => onChange(twoTone('navy'))}>Make it two tone</button>
              ) : (
                <button className="btn btn--ghost"
                        onClick={() => onChange(clearFinishes())}>Back to the board names</button>
              )}
            </div>
          </section>

          <section className="adv-group">
            <span className="field__label">Kickboard, benchtop and end panels</span>
            <p className="note">
              These belong to a run of cabinets rather than to any one cabinet, so
              they are worked out from what is actually standing next to what. The
              kickboard is cut from board and nested with everything else. The
              benchtop is bought by the metre, so it gets a schedule instead of
              being nested against your sheets.
            </p>
            <div className="settings-grid">
              <Board label="Kickboard" value={cfg.kickBoard || ''} options={boards}
                     placeholder={cfg.carcassBoard} onChange={(v) => onChange({ kickBoard: v })} />
              <Num label="Kickboard thickness" value={cfg.kickThk ?? 16}
                   onChange={(v) => onChange({ kickThk: v ?? 16 })} />
              <Num label="Benchtop past an open end" value={cfg.benchOverhang ?? 20}
                   onChange={(v) => onChange({ benchOverhang: v ?? 20 })} />
              <Num label="Longest benchtop piece" value={cfg.benchMaxPiece ?? 3600}
                   onChange={(v) => onChange({ benchMaxPiece: v ?? 3600 })} />
            </div>
            <div className="settings-grid">
              <Choice label="Panel an open end of a run"
                      value={cfg.endPanelAuto ? 'yes' : 'no'}
                      options={[{ value: 'no', label: 'Only where I add one' },
                        { value: 'yes', label: 'Everywhere one is exposed' }]}
                      onChange={(v) => onChange({ endPanelAuto: v === 'yes' })} />
              {cfg.endPanelAuto && (
                <Num label="End panel thickness" value={cfg.endPanelThk ?? 18}
                     onChange={(v) => onChange({ endPanelThk: v ?? 18 })} />
              )}
            </div>
          </section>

          <section className="adv-group">
            <span className="field__label">Drilling</span>
            <p className="note">
              How the carcass is held together and how a shelf is held up. Every
              drawing on the Drilling screen is drawn from these, and so is what the
              order list buys. A pocket screw is drilled in one panel only, the one
              that butts into the other; a confirmat and a dowel drill both halves.
            </p>
            <div className="settings-grid">
              <Choice label="Carcass joint" value={cfg.jointMethod || 'pocket-screw'}
                      options={JOINT_LIST.map((j) => ({ value: j.id, label: j.name }))}
                      onChange={(v) => onChange({ jointMethod: v })} />
              <Choice label="Shelves" value={shelfFixOf(cfg.shelfFix).id}
                      options={SHELF_FIXES.map((f) => ({ value: f.id, label: f.name }))}
                      onChange={(v) => onChange({ shelfFix: v })} />
              {shelfFixOf(cfg.shelfFix).id === 'pins' && (
                <Choice label="Back row of holes" value={cfg.rearRow || 'grid'}
                        options={REAR_ROWS.map((r) => ({ value: r.id, label: r.name }))}
                        onChange={(v) => onChange({ rearRow: v })} />
              )}
            </div>
            <p className="note">{shelfFixOf(cfg.shelfFix).note}</p>
            <p className="note" hidden={shelfFixOf(cfg.shelfFix).id !== 'pins'}>
              {(cfg.rearRow || 'grid') === 'grid'
                ? `On a ${cfg.baseDepth}mm deep side the back row lands ${rearRowX(cfg.baseDepth, 'grid')}mm in, a whole number of 32mm steps behind the front row, so one jig setting drills both.`
                : `The back row sits ${SYS32.frontSetback}mm in from the back edge, mirroring the front. It is not on the same grid as the front row.`}
            </p>
            <p className="note">{joint.note}</p>
          </section>

          <section className="adv-group">
            <span className="field__label">Build</span>
            <div className="settings-grid">
              <Choice label="Back" value={cfg.backType || 'full'}
                      options={[{ value: 'full', label: 'Full panel' }, { value: 'rail', label: 'Rail only' }]}
                      onChange={(v) => onChange({ backType: v })} />
              <Choice label="Drawer base" value={baseFixOf(cfg.boxBaseFix).id}
                      options={BASE_FIXES.map((b) => ({ value: b.id, label: b.name }))}
                      onChange={(v) => onChange({ boxBaseFix: v })} />
            </div>
            <p className="note">{baseFixOf(cfg.boxBaseFix).note}</p>
            <div className="settings-grid">
              <Num label="Gap above the box" value={cfg.boxClearTop ?? BOX_CLEAR.top} min={0} max={120}
                   onChange={(v) => onChange({ boxClearTop: v ?? BOX_CLEAR.top })} />
              <Num label="Gap below the box" value={cfg.boxClearBottom ?? BOX_CLEAR.bottom} min={0} max={120}
                   onChange={(v) => onChange({ boxClearBottom: v ?? BOX_CLEAR.bottom })} />
            </div>
            <p className="note">
              {baseFixOf(cfg.boxBaseFix).recessed
                ? `The box is as tall as its sides, so it sits ${cfg.boxClearBottom ?? BOX_CLEAR.bottom}mm up off the bottom of its opening with ${cfg.boxClearTop ?? BOX_CLEAR.top}mm over it.`
                : `A butted base reaches ${cfg.boxBaseThk}mm below the sides. The gap is measured to the underside of the base, not to the sides, so the box still clears its opening by ${cfg.boxClearBottom ?? BOX_CLEAR.bottom}mm underneath and ${cfg.boxClearTop ?? BOX_CLEAR.top}mm over.`}
            </p>
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

          {/* Every gap around a front, in one place, in the order you meet
              them on a real cabinet, with a drawing that says which is which. */}
          <section className="adv-group">
            <span className="field__label">Gaps around the fronts</span>
            <p className="note">
              Every gap between a front and whatever is beside it. Each one is yours to
              set, including the two at the ends of the cabinet, which are the ones you
              look straight at from across the room and were the only ones this app used
              to decide for you. Leave a field empty and it follows the rule named under
              it, which is the geometry every project already has.
            </p>

            <GapDiagram cfg={cfg} />

            <div className="gap-fields">
              {GAPS.map(([k, label, note]) => (
                <div className="gap-field" key={k}>
                  <Num label={label} value={cfg[k]}
                       placeholder={k === 'revealLeft' || k === 'revealRight'
                         ? `${(Number(cfg.reveal) || 0) / 2}`
                         : k === 'revealBetween' ? `${Number(cfg.reveal) || 0}` : undefined}
                       onChange={(v) => onChange({ [k]: v ?? PROJECT[k] })} />
                  <p className="note">{note}</p>
                </div>
              ))}
            </div>

            <p className="note">
              A front is the carcass less the gap at each end, so at a {fmt(cfg.reveal)}mm
              gap a {fmt(cfg.baseDepth)}mm deep cabinet {fmt(600)}mm wide carries a front
              {' '}{fmt(600 - (cfg.revealLeft ?? cfg.reveal / 2) - (cfg.revealRight ?? cfg.reveal / 2))}mm
              wide, and two of those butted together leave {fmt((cfg.revealLeft ?? cfg.reveal / 2)
                + (cfg.revealRight ?? cfg.reveal / 2))}mm between their doors.
            </p>
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


/** a or an, so the sentence reads like a sentence. */
const article = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word.toLowerCase()}`;

/* ---------------------------------------------------------------------------
   One role's finish.

   A swatch you click rather than a name you pick off a list, because the
   thing being chosen is a colour and a list of colour names is a worse way to
   choose a colour than the colours are.
   --------------------------------------------------------------------------- */

function FinishField({ label, role, cfg, onChange }) {
  const current = finishFor(role, cfg);
  const set = (id) => onChange({ [finishKey(role)]: id });
  const inherited = !cfg[finishKey(role)];

  return (
    <div className="finish-role">
      <span className="field__label">
        {label}
        {inherited && <span className="note"> from the board name</span>}
      </span>
      <div className="finish-swatches" role="radiogroup" aria-label={`${label} finish`}>
        {FINISH_GROUPS.map((g) => (
          <span className="finish-run" key={g}>
            {FINISH_LIST.filter((f) => f.group === g).map((f) => (
              <button key={f.id} type="button" role="radio"
                      aria-checked={f.id === current.id}
                      className={`finish-chip ${f.id === current.id ? 'is-on' : ''}`}
                      style={{ background: f.hex }}
                      title={`${f.name}, ${g.toLowerCase()}`}
                      onClick={() => set(f.id === cfg[finishKey(role)] ? '' : f.id)}>
                <span className="sr-only">{f.name}</span>
              </button>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
