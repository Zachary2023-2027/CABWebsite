import { useEffect, useMemo, useState } from 'react';
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
import { HOLE_STYLE } from './drilling.js';

const STORE = 'kcb.project.v1';

/* --- rail ----------------------------------------------------------------- */

const NAV = [
  ['planner', 'Planner', 'M2 12h20M6 12V6h5v6M13 12V8h5v4'],
  ['cabinet', 'Cabinet', 'M5 3h14v18H5zM5 9h14M12 3v18'],
  ['cutlist', 'Cut list', 'M4 6h16M4 12h16M4 18h10'],
  ['nesting', 'Nesting', 'M3 4h18v16H3zM3 11h18M11 4v7M15 11v9'],
  ['drilling', 'Drilling', 'M5 3h14v18H5zM9 7v.01M9 12v.01M9 17v.01M15 7v.01M15 12v.01M15 17v.01'],
  ['hardware', 'Hardware', 'M4 9h10a3 3 0 1 1 0 6H4zM4 6v12'],
  ['costing', 'Costing', 'M4 20V10M10 20V4M16 20v-8M22 20H2'],
  ['reference', 'Reference', 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'],
  ['workshop', 'Workshop', 'M4 4h16v6H4zM4 14h16v6H4zM9 7h6M9 17h6'],
  ['print', 'Print', 'M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1M6 14h12v7H6z'],
  ['settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
];

function Rail({ screen, setScreen }) {
  return (
    <nav className="rail-nav" aria-label="Screens">
      {NAV.map(([id, label, d]) => (
        <button key={id} className="rail-item" aria-current={screen === id} title={label}
                onClick={() => setScreen(id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/* --- cabinet detail ------------------------------------------------------- */

function DrillStrip({ unit }) {
  const panels = useMemo(() => drillUnit(unit), [unit]);
  if (!panels.length) return null;
  return (
    <div className="drill-strip">
      <div className="drill-strip-head">
        <span className="field__label">Drilling</span>
        <span className="list-meta">{panels.length} drilled panels, 32mm system</span>
      </div>
      <div className="drill-strip-row">
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

function Start({ onExample, onEmpty, recents, onOpen }) {
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
      {recents.length > 0 && (
        <div className="recents">
          <span className="field__label">Recent</span>
          {recents.map((r) => (
            <button key={r.savedAt} className="recent" onClick={() => onOpen(r)}>
              <span>{r.name}</span>
              <span className="num">{new Date(r.savedAt).toLocaleDateString('en-AU')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- root ----------------------------------------------------------------- */

export default function App() {
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const resolvedTheme = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

  const [project, setProject] = useState(null);
  const [screen, setScreen] = useState('planner');
  const [arrangement, setArrangement] = useState('drawer');
  const [detailUid, setDetailUid] = useState(null);
  const [cut, setCut] = useState(() => new Set());
  const [quoted, setQuoted] = useState('');
  const [prices, setPricesState] = useState(() => structuredClone(PRICES));
  const [recents, setRecents] = useState([]);

  /* Pricing functions read the shared PRICES object at call time, so an edit
     has to land there as well as in state for the totals to follow. */
  const setPrices = (updater) => setPricesState((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    Object.assign(PRICES, next);
    return next;
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setRecents(JSON.parse(raw).recents || []);
    } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    if (!project) return;
    try {
      const entry = { name: project.name, savedAt: Date.now(), project };
      const list = [entry, ...recents.filter((r) => r.name !== project.name)].slice(0, 4);
      localStorage.setItem(STORE, JSON.stringify({ recents: list }));
    } catch { /* quota */ }
    // Recents are written, not read back, while a project is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

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
          <span className="ctx">Step 5. All screens.</span>
          <div className="right">
            <div className="seg" role="group" aria-label="Theme">
              {['system', 'light', 'dark'].map((t) => (
                <button key={t} className="seg__item" aria-pressed={theme === t}
                        onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
        </header>
        <Start
          recents={recents}
          onOpen={(r) => { setProject(r.project); setScreen('planner'); }}
          onExample={() => setProject(starterProject())}
          onEmpty={() => {
            const p = starterProject();
            p.walls = p.walls.map((w) => ({ ...w, units: [], obstacles: [] }));
            setProject(p);
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
      case 'nesting': return <Nesting project={project} />;
      case 'hardware': return <Hardware project={project} prices={prices} setPrices={setPrices} />;
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
        <span className="brand">{project.name}</span>
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
          <div className="seg" role="group" aria-label="Theme">
            {['system', 'light', 'dark'].map((t) => (
              <button key={t} className="seg__item" aria-pressed={theme === t}
                      onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="app-body">
        <Rail screen={screen} setScreen={setScreen} />
        <main className="app-main">{body()}</main>
      </div>
    </div>
  );
}
