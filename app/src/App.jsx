import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer, { hasWebGL } from './Viewer.jsx';
import Planner from './Planner.jsx';
import CutList from './CutList.jsx';
import Nesting from './Nesting.jsx';
import Hardware from './Hardware.jsx';
import Drilling from './Drilling.jsx';
import Costing from './Costing.jsx';
import Settings from './Settings.jsx';
import Reference from './Reference.jsx';
import Workshop from './Workshop.jsx';
import Print from './Print.jsx';
import { PRICES } from './catalog.js';
import { allUnits, layoutWall, money, starterProject, totals } from './project.js';
import { cutSize } from './cabinet.js';
import { drillUnit } from './drilling.js';
import {
  exportFile, importFile, listSaved, loadSnapshot, removeSnapshot, saveSnapshot, snapshot,
} from './storage.js';
import { HOLE_STYLE } from './drilling.js';

/* --- rail ----------------------------------------------------------------- */

/* The screens, in the order you actually work through them.

   Eleven items in one flat column asked you to remember which of eleven
   things you wanted before you could look for it. They are the same eleven,
   grouped by what you are doing:

     Design   deciding what the kitchen is
     Make     turning that into board, holes and hardware
     Money    what it costs
     Paper    what you carry to the bench or the supplier

   Settings is none of those. It sits on its own at the bottom, because it is
   somewhere you go once and then leave alone. */
const NAV = [
  ['Design', [
    ['planner', 'Planner', 'M2 12h20M6 12V6h5v6M13 12V8h5v4'],
    ['cabinet', 'Cabinet', 'M5 3h14v18H5zM5 9h14M12 3v18'],
    ['reference', 'Reference', 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'],
  ]],
  ['Make', [
    ['cutlist', 'Cut list', 'M4 6h16M4 12h16M4 18h10'],
    ['nesting', 'Nesting', 'M3 4h18v16H3zM3 11h18M11 4v7M15 11v9'],
    ['drilling', 'Drilling', 'M5 3h14v18H5zM9 7v.01M9 12v.01M9 17v.01M15 7v.01M15 12v.01M15 17v.01'],
    ['hardware', 'Hardware', 'M4 9h10a3 3 0 1 1 0 6H4zM4 6v12'],
    ['workshop', 'Workshop', 'M4 4h16v6H4zM4 14h16v6H4zM9 7h6M9 17h6'],
  ]],
  ['Money', [
    ['costing', 'Costing', 'M4 20V10M10 20V4M16 20v-8M22 20H2'],
  ]],
  ['Paper', [
    ['print', 'Print', 'M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1M6 14h12v7H6z'],
  ]],
];

const SETTINGS_ITEM = ['settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'];

/** Every screen id, flat, for the keyboard shortcuts and anything else. */
export const SCREEN_IDS = [...NAV.flatMap(([, items]) => items.map(([id]) => id)), 'settings'];

const RailItem = ({ id, label, d, screen, setScreen }) => (
  <button className="rail-item" aria-current={screen === id} title={label}
          onClick={() => setScreen(id)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
    <span>{label}</span>
  </button>
);

function Rail({ screen, setScreen }) {
  return (
    <nav className="rail-nav" aria-label="Screens">
      {NAV.map(([group, items]) => (
        <div className="rail-group" key={group} role="group" aria-label={group}>
          <span className="rail-group__label">{group}</span>
          {items.map(([id, label, d]) => (
            <RailItem key={id} id={id} label={label} d={d} screen={screen} setScreen={setScreen} />
          ))}
        </div>
      ))}
      <div className="rail-group rail-group--foot">
        <RailItem id={SETTINGS_ITEM[0]} label={SETTINGS_ITEM[1]} d={SETTINGS_ITEM[2]}
                  screen={screen} setScreen={setScreen} />
      </div>
    </nav>
  );
}

/* --- cabinet detail ------------------------------------------------------- */

/* The strip is useful at the bench and in the way when you are looking at the
   model, so it folds down to its own heading. */
function DrillStrip({ unit }) {
  const panels = useMemo(() => drillUnit(unit), [unit]);
  const [open, setOpen] = useState(true);
  if (!panels.length) return null;
  return (
    <div className={`drill-strip ${open ? 'is-open' : ''}`}>
      <div className="drill-strip-head">
        <span className="field__label">Drilling</span>
        <span className="list-meta">{panels.length} drilled panels, 32mm system</span>
        <button className="btn btn--ghost" onClick={() => setOpen((o) => !o)}
                aria-expanded={open}>{open ? 'Hide' : 'Show'}</button>
      </div>
      <div className="drill-strip-row" hidden={!open}>
        {panels.map((p) => (
          <figure className="drill-mini" key={p.code}>
            <svg viewBox={`-30 -30 ${p.w + 60} ${p.h + 60}`} preserveAspectRatio="xMidYMid meet"
                 role="img" aria-label={`${p.name}, ${p.holes.length} holes`}>
              <rect x="0" y="0" width={p.w} height={p.h} fill="var(--dw-carcass)"
                    stroke="var(--dw-line)" strokeWidth="4" />
              {p.holes.map((o, i) => (
                <circle key={i} cx={o.x} cy={p.h - o.y} r={Math.max(o.dia / 2, 4)}
                        fill={HOLE_STYLE[o.kind]?.fill || 'var(--dw-line)'} />
              ))}
            </svg>
            <figcaption className="code">{p.code.split('-').slice(1).join('-')}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* Fixed in the corner rather than following the pointer, so it never sits on
   top of the part you are trying to look at. */
function PartCard({ part }) {
  if (!part) {
    return (
      <div className="part-card float-br part-card--empty">
        <span>Point at a part to see its size.</span>
      </div>
    );
  }
  return (
    <div className="part-card float-br">
      <b className="code">{part.code}</b>
      <span>{part.name}</span>
      <span className="n">{cutSize(part)}</span>
      <span className="note">{part.material}</span>
    </div>
  );
}

function CabinetDetail({ unit, label, resolvedTheme }) {
  const [explode, setExplode] = useState(0);
  const [doors, setDoors] = useState('closed');
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [preset, setPreset] = useState('Iso');
  const [nonce, setNonce] = useState(0);
  const [section, setSection] = useState({ on: false, axis: 'z', pos: 50 });
  const [show, setShow] = useState({ back: true, hardware: true, dims: false, labels: false, grid: false });
  const reduced = useMemo(
    () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 760, []);

  return (
    <div className="detail">
      <div className="detail-main">
        <div className="canvas-wrap">
          <Viewer cabinet={unit} explode={explode} doors={doors}
                  selected={selected} setSelected={setSelected}
                  hovered={hovered} setHovered={setHovered}
                  show={show} ghostMode={ghostMode} section={section}
                  preset={preset} nonce={nonce} reduced={reduced} theme={resolvedTheme} />
          <PartCard part={hovered || unit.parts.find((p) => p.code === selected) || null} />
          <div className="vp-toolbar float-tl">
            <div className="seg" role="group" aria-label="Camera">
              {['Front', 'Left', 'Right', 'Top', 'Iso'].map((v) => (
                <button key={v} className="seg__item" aria-pressed={preset === v}
                        onClick={() => { setPreset(v); setNonce((n) => n + 1); }}>{v}</button>
              ))}
            </div>
            <span className="vp-toolbar__sep" />
            {[['dims', 'Dims'], ['labels', 'Labels'], ['grid', 'Grid'], ['back', 'Back'], ['hardware', 'Hardware']].map(([k, l]) => (
              <button key={k} className="seg__item" aria-pressed={show[k]}
                      onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{l}</button>
            ))}
            <span className="vp-toolbar__sep" />
            <button className="seg__item" aria-pressed={ghostMode}
                    onClick={() => setGhostMode((g) => !g)}>Ghost</button>
            <button className="seg__item" aria-pressed={section.on} disabled={reduced}
                    onClick={() => setSection((s) => ({ ...s, on: !s.on }))}>Section</button>
          </div>
          <div className="float-bl controls">
            <div className="slider">
              <div className="slider__head">
                <span className="field__label">Exploded view</span>
                <span className="slider__value">{explode}%</span>
              </div>
              <input type="range" min="0" max="100" value={explode}
                     style={{ '--pct': `${explode}%` }} aria-label="Exploded view"
                     onChange={(e) => setExplode(+e.target.value)} />
            </div>
            <div className="ctl-row">
              <span className="field__label">Drawers</span>
              <div className="seg" role="group" aria-label="Drawers">
                {['closed', 'open', 'hidden'].map((v) => (
                  <button key={v} className="seg__item" aria-pressed={doors === v}
                          onClick={() => setDoors(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
                ))}
              </div>
            </div>
            {section.on && !reduced && (
              <div className="ctl-row">
                <div className="seg" role="group" aria-label="Section axis">
                  {['x', 'y', 'z'].map((a) => (
                    <button key={a} className="seg__item" aria-pressed={section.axis === a}
                            onClick={() => setSection((s) => ({ ...s, axis: a }))}>{a.toUpperCase()}</button>
                  ))}
                </div>
                <input type="range" min="0" max="100" value={section.pos} className="section-range"
                       style={{ '--pct': `${section.pos}%` }} aria-label="Section position"
                       onChange={(e) => setSection((s) => ({ ...s, pos: +e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        <aside className="side">
          <div className="side-head">
            <span className="badge badge--accent badge--num">{label}</span>
            <span className="side-title">{unit.family.name}</span>
          </div>
          <div className="list-head">
            <span className="field__label">Parts</span>
            <span className="list-meta">{unit.parts.length}</span>
          </div>
          <div className="table-wrap list" data-density="compact">
            <table className="table">
              <thead><tr><th>Part code</th><th>Name</th><th className="n">L x W x T</th></tr></thead>
              <tbody>
                {unit.parts.map((p) => (
                  <tr key={p.code} aria-selected={selected === p.code}
                      onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(selected === p.code ? null : p.code)}>
                    <td className="code">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="n">{cutSize(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      <DrillStrip unit={unit} />
    </div>
  );
}

/* --- start ---------------------------------------------------------------- */

const when = (t) => {
  const d = new Date(t);
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
};

function Start({ onExample, onEmpty, saved, onOpen, onDelete, onImport, error }) {
  return (
    <div className="start">
      <h1 className="start-title">Kitchen cabinet builder</h1>
      <p className="note">Frameless European carcasses, 32mm system. Millimetres and AUD.</p>

      <div className="start-options">
        <button className="card start-card" onClick={onExample}>
          <span className="card__title">Load the example kitchen</span>
          <span className="note">Five walls, twenty cabinets, ready to change.</span>
        </button>
        <button className="card start-card" onClick={onEmpty}>
          <span className="card__title">Start empty</span>
          <span className="note">Four walls and an island, no cabinets.</span>
        </button>
      </div>

      {saved.length > 0 && (
        <div className="saved-list">
          <span className="field__label">Saved in this browser</span>
          {saved.map((s) => (
            <div key={s.id} className="saved-row">
              <button className="saved-open" onClick={() => onOpen(s.id)}>
                <span className="saved-name">{s.name}</span>
                <span className="saved-meta num">
                  {s.cabinets} cabinets · {s.walls} walls · {when(s.savedAt)}
                </span>
              </button>
              <button className="icon-btn" aria-label={`Delete ${s.name}`}
                      onClick={() => onDelete(s.id, s.name)}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
                     strokeLinejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="start-file">
        <label className="btn btn--secondary file-btn">
          Open a project file
          <input type="file" accept=".json,.kcb.json,application/json"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        </label>
        <p className="note">
          Saving happens automatically in this browser. Export a project file to keep a
          backup or move a kitchen to another device.
        </p>
      </div>

      {error && (
        <div className="warn-inline warn-inline--error">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 2.5l6 11H2z" strokeLinejoin="round" /><path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * What to say when an older project's runner clearance became a profile.
 *
 * The old number was a clearance with no stated meaning, and the geometry
 * read it as a deduction to the outside of the drawer box. The profile reads
 * it to the inside, which is what Blum specifies, so the boxes get wider by
 * twice the box side thickness. That is a real change to a saved kitchen, so
 * it is said plainly rather than made quietly.
 */
function runnerNoticeText(n) {
  if (n.unconfirmed) {
    return `This project stored a drawer runner clearance of ${n.wasClearance}mm each side, which is not a standard runner. It has been kept as a profile called Custom runner. Check it against the runner you are buying before cutting: the drawer box widths depend on it.`;
  }
  return `Drawer boxes in this project are now built to a named runner profile rather than a bare clearance. The stored ${n.wasClearance}mm each side matches Blum TANDEM 563H, where the figure is a deduction to the inside of the box. The old geometry read it as the outside, so every drawer box is wider than it was by twice the box side thickness. Check one against your runners before cutting.`;
}

/* --- undo -----------------------------------------------------------------

   Cabinets can be dragged now, and a drag is the one edit you can make
   without meaning to. Close gaps and the optimiser move the whole wall at
   once, which is worse. So the project keeps a history.

   Steps are coalesced by time: typing a name or nudging a width produces a
   change per keystroke, and undoing one letter at a time is not what anyone
   wants. A pause of half a second starts a new step.
   -------------------------------------------------------------------------- */

const HISTORY = { limit: 60, coalesceMs: 500 };

function useProjectHistory(project, setProjectRaw) {
  const past = useRef([]);
  const future = useRef([]);
  const lastPush = useRef(0);
  const [, bump] = useState(0);

  const setProject = (updater) => setProjectRaw((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (next === prev || !prev) return next;
    const now = Date.now();
    if (now - lastPush.current > HISTORY.coalesceMs) {
      past.current.push(prev);
      if (past.current.length > HISTORY.limit) past.current.shift();
      future.current = [];
    }
    lastPush.current = now;
    bump((n) => n + 1);
    return next;
  });

  const undo = () => setProjectRaw((prev) => {
    if (!past.current.length) return prev;
    future.current.push(prev);
    lastPush.current = 0;
    bump((n) => n + 1);
    return past.current.pop();
  });

  const redo = () => setProjectRaw((prev) => {
    if (!future.current.length) return prev;
    past.current.push(prev);
    lastPush.current = 0;
    bump((n) => n + 1);
    return future.current.pop();
  });

  const reset = () => { past.current = []; future.current = []; lastPush.current = 0; };

  return {
    setProject, undo, redo, reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

/* --- root ----------------------------------------------------------------- */

export default function App() {
  /* Light, always. A workshop is a bright room and a drawing is a drawing:
     one look, one set of colours, nothing to choose. The dark palette is
     still in the tokens if it is ever wanted again, it is just not offered. */
  useEffect(() => { document.documentElement.dataset.theme = 'light'; }, []);
  const resolvedTheme = 'light';

  const [project, setProjectRaw] = useState(null);
  const history = useProjectHistory(project, setProjectRaw);
  const setProject = history.setProject;
  const [screen, setScreen] = useState('planner');
  const [arrangement, setArrangement] = useState('drawer');
  const [detailUid, setDetailUid] = useState(null);
  const [cut, setCut] = useState(() => new Set());
  const [quoted, setQuoted] = useState('');
  const [prices, setPricesState] = useState(() => structuredClone(PRICES));
  const [projectId, setProjectId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [saveState, setSaveState] = useState({ at: null, error: null });
  const [startError, setStartError] = useState(null);
  /* Set when an older file is opened and something in it had to be
     reinterpreted. Shown once, dismissed by the user, never repeated. */
  const [notice, setNotice] = useState(null);

  /* Pricing functions read the shared PRICES object at call time, so an edit
     has to land there as well as in state for the totals to follow. */
  const setPrices = (updater) => setPricesState((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    Object.assign(PRICES, next);
    return next;
  });

  const refreshSaved = () => setSaved(listSaved());
  useEffect(refreshSaved, []);

  /* Autosave. Debounced, because dragging a slider or typing a name would
     otherwise write on every keystroke. */
  useEffect(() => {
    if (!project || !projectId) return undefined;
    const t = setTimeout(() => {
      const res = saveSnapshot(snapshot({ id: projectId, name: project.name, project, cut, prices, quoted }));
      setSaveState(res.ok
        ? { at: res.savedAt, error: null }
        : { at: null, error: res.reason === 'full'
            ? 'Browser storage is full. Export a project file.'
            : 'This browser is blocking storage. Export a project file.' });
      refreshSaved();
    }, 700);
    return () => clearTimeout(t);
  }, [project, cut, prices, quoted, projectId]);

  const openSnapshot = (snap) => {
    history.reset();
    setNotice(snap.runnerNotice ? runnerNoticeText(snap.runnerNotice) : null);
    setProjectRaw(snap.project);
    setProjectId(snap.id);
    setCut(new Set(snap.cut));
    setQuoted(snap.quoted);
    setPrices(snap.prices);
    setScreen('planner');
    setStartError(null);
  };

  const startNew = (p) => openSnapshot(snapshot({ name: p.name, project: p, cut: new Set(), prices, quoted: '' }));

  useEffect(() => {
    const key = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target;
      // Let a text field keep its own undo.
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (e.shiftKey) history.redo(); else history.undo();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const webgl = useMemo(() => hasWebGL(), []);
  const units = useMemo(() => (project ? allUnits(project) : []), [project]);
  const tot = useMemo(() => (project ? totals(project) : null), [project, prices]);

  const detail = useMemo(() => {
    if (!project) return null;
    const found = units.find((u) => u.item.uid === detailUid) || units[0];
    return found || null;
  }, [project, units, detailUid]);

  const openDetail = (uidToOpen) => { setDetailUid(uidToOpen); setScreen('cabinet'); };

  if (!project) {
    return (
      <div className="shell">
        <header className="topbar">
          <span className="brand">Kitchen cabinet builder</span>
          <span className="ctx">Plan it, price it, cut it.</span>
          <div className="right" />
        </header>
        <Start
          saved={saved}
          error={startError}
          onOpen={(id) => {
            const snap = loadSnapshot(id);
            if (snap) openSnapshot(snap);
            else { setStartError('That project could not be opened.'); refreshSaved(); }
          }}
          onDelete={(id, name) => {
            if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
            removeSnapshot(id);
            refreshSaved();
          }}
          onImport={(file) => {
            importFile(file)
              .then((snap) => { saveSnapshot(snap); openSnapshot(snap); })
              .catch((e) => setStartError(e.message));
          }}
          onExample={() => startNew(starterProject())}
          onEmpty={() => {
            const p = starterProject();
            p.name = 'New kitchen';
            p.walls = p.walls.map((w) => ({ ...w, units: [], obstacles: [] }));
            startNew(p);
          }}
        />
      </div>
    );
  }

  if (screen === 'workshop') {
    return <Workshop project={project} cut={cut} setCut={setCut}
                     onExit={() => setScreen('cutlist')} />;
  }

  const body = () => {
    switch (screen) {
      case 'planner':
        return <Planner project={project} setProject={setProject} onOpen3D={openDetail}
                        arrangement={webgl ? arrangement : 'drawer'} setArrangement={setArrangement} />;
      case 'cabinet':
        return detail
          ? <CabinetDetail unit={detail.unit} label={detail.label} resolvedTheme={resolvedTheme} />
          : <div className="empty"><div className="empty__text">No cabinets yet. Add one in the planner.</div></div>;
      case 'cutlist': return <CutList project={project} cut={cut} setCut={setCut}
                                      onWorkshop={() => setScreen('workshop')} />;
      case 'nesting': return <Nesting project={project} setProject={setProject} />;
      case 'hardware': return <Hardware project={project} setProject={setProject} prices={prices} setPrices={setPrices} />;
      case 'drilling': return <Drilling project={project} />;
      case 'costing': return <Costing project={project} quoted={quoted} setQuoted={setQuoted} />;
      case 'settings': return <Settings project={project} setProject={setProject}
                                        prices={prices} setPrices={setPrices} />;
      case 'reference': return <Reference />;
      case 'print': return <Print project={project} cut={cut} />;
      default: return null;
    }
  };

  return (
    <div className="app">
      <header className="topbar app-top">
        <input className="brand brand-input" value={project.name} aria-label="Project name"
               onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} />
        <span className={`save-state ${saveState.error ? 'is-error' : ''}`}>
          {saveState.error
            ? saveState.error
            : saveState.at ? `Saved ${when(saveState.at)}` : 'Saving'}
        </span>
        {tot && (
          <div className="stat-strip app-totals">
            {[['Cabinets', tot.cabinets], ['Doors', tot.doors], ['Drawers', tot.drawers],
              ['Sheets', tot.sheets]].map(([k, v]) => (
              <div className="stat" key={k}>
                <span className="stat__label">{k}</span><span className="stat__value">{v}</span>
              </div>
            ))}
            <div className="stat">
              <span className="stat__label">Cost, estimate</span>
              <span className="stat__value">{money(tot.cost)}</span>
            </div>
            {tot.oversize?.length > 0 && (
              <button className="stat stat--error" onClick={() => setScreen('nesting')}
                      title="These parts will not come off any sheet you stock. Nesting explains each one.">
                <span className="stat__label">Will not fit</span>
                <span className="stat__value">{tot.oversize.length}</span>
              </button>
            )}
          </div>
        )}
        <div className="right">
          {screen === 'cabinet' && detail && (
            <label className="field compact filter">
              <span className="field__label">Cabinet</span>
              <div className="input-shell select-shell">
                <select value={detail.item.uid} onChange={(e) => setDetailUid(e.target.value)}>
                  {units.map((u) => (
                    <option key={u.item.uid} value={u.item.uid}>
                      {u.label} {u.unit.family.name} {u.unit.width}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}
          <div className="seg undo-seg" role="group" aria-label="Undo">
            <button className="seg__item" onClick={history.undo} disabled={!history.canUndo}
                    title="Undo the last change. Ctrl or Cmd and Z">Undo</button>
            <button className="seg__item" onClick={history.redo} disabled={!history.canRedo}
                    title="Redo. Ctrl or Cmd, Shift and Z">Redo</button>
          </div>
          <button className="btn btn--ghost" title="Download a project file you can keep or move"
                  onClick={() => exportFile(snapshot({ id: projectId, name: project.name, project, cut, prices, quoted }))}>
            Export file
          </button>
          <button className="btn btn--ghost" title="Close this kitchen and go back to the start screen"
                  onClick={() => { refreshSaved(); setProject(null); setProjectId(null); }}>
            Projects
          </button>
        </div>
      </header>

      {notice && (
        <div className="app-notice">
          <div className="warn-inline warn-inline--note">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="8" cy="8" r="6" /><path d="M8 7.4v4M8 5.1v.1" strokeLinecap="round" />
            </svg>
            <span>{notice}</span>
          </div>
          <button className="btn btn--secondary" onClick={() => setNotice(null)}>Got it</button>
        </div>
      )}

      <div className="app-body">
        <Rail screen={screen} setScreen={setScreen} />
        <main className="app-main">{body()}</main>
      </div>
    </div>
  );
}
